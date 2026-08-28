import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "@operium/mcp";
import { parseCanvasScene } from "@operium/core";
import {
  connectDB,
  McpUsageLog,
  Note,
  NoteBlock,
  Space,
} from "@operium/db";

type ConnectedClient = {
  client: Client;
  server: ReturnType<typeof buildMcpServer>;
};

async function connectClient(userId: string): Promise<ConnectedClient> {
  const server = buildMcpServer({ userId, orgId: null });
  const client = new Client({ name: "operium-canvas-verifier", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

function resultText(result: any): string {
  return (result.content ?? [])
    .filter((item: any) => item.type === "text")
    .map((item: any) => item.text)
    .join("\n");
}

async function closeConnection(connection: ConnectedClient | undefined) {
  if (!connection) return;
  await connection.client.close().catch(() => {});
  await connection.server.close().catch(() => {});
}

async function main() {
  await connectDB();
  const ownerId = new mongoose.Types.ObjectId().toString();
  const attackerId = new mongoose.Types.ObjectId().toString();
  let owner: ConnectedClient | undefined;
  let attacker: ConnectedClient | undefined;
  const evidence: Record<string, unknown> = {};

  try {
    owner = await connectClient(ownerId);
    attacker = await connectClient(attackerId);

    const listed = await owner.client.listTools();
    const canvasTools = listed.tools.map(tool => tool.name).filter(name => name.includes("canvas"));
    assert.deepEqual(canvasTools, ["create_canvas_note", "get_canvas_note", "update_canvas_note"]);
    evidence.advertisedTools = canvasTools;

    // Invalid schemas and invalid cross-element references must fail before any
    // persistent object (including the default Canvases space) is created.
    const invalidColorResult: any = await owner.client.callTool({
      name: "create_canvas_note",
      arguments: { backgroundColor: "red" },
    });
    assert.equal(invalidColorResult.isError, true);
    const invalidResult: any = await owner.client.callTool({
      name: "create_canvas_note",
      arguments: {
        elements: [
          { id: "same", type: "rectangle" },
          { id: "same", type: "ellipse" },
        ],
      },
    });
    assert.equal(invalidResult.isError, true);
    assert.equal(await Space.countDocuments({ userId: ownerId }), 0);
    assert.equal(await Note.countDocuments({ userId: ownerId }), 0);
    evidence.invalidInputLeavesNoData = true;

    // If the block write fails after the Note insert, the tool must remove the
    // partial Note instead of leaving an unusable canvas behind.
    const failureSpace = await Space.create({
      userId: ownerId,
      name: "Canvas failure verification",
      icon: "folder",
      description: "Disposable integration fixture",
    });
    const originalBlockCreate = NoteBlock.create.bind(NoteBlock);
    try {
      (NoteBlock as any).create = async () => { throw new Error("forced NoteBlock failure"); };
      const partialCreate: any = await owner.client.callTool({
        name: "create_canvas_note",
        arguments: {
          title: "Must roll back",
          spaceId: failureSpace._id.toString(),
          elements: [{ id: "shape", type: "rectangle" }],
        },
      });
      assert.equal(partialCreate.isError, true);
    } finally {
      (NoteBlock as any).create = originalBlockCreate;
    }
    assert.equal(await Note.countDocuments({ userId: ownerId }), 0);
    evidence.partialCreateRollback = true;

    const created: any = await owner.client.callTool({
      name: "create_canvas_note",
      arguments: {
        title: "Canvas integration verification",
        tags: ["canvas-verification"],
        backgroundColor: "#ffffff",
        elements: [
          { id: "client", type: "rectangle", x: 20, y: 80, width: 200, height: 100, label: "Web Client", backgroundColor: "#a5d8ff" },
          { id: "api", type: "ellipse", x: 420, y: 80, width: 200, height: 100, label: "API Server", backgroundColor: "#b2f2bb" },
          { id: "request", type: "arrow", fromId: "client", toId: "api", label: "HTTPS" },
          { id: "secret", type: "text", x: 120, y: 260, text: "Authorization: Bearer abcdef0123456789ghijkl" },
        ],
      },
    });
    assert.equal(created.isError, undefined);
    const noteId = resultText(created).match(/ID: ([a-f0-9]{24})/i)?.[1];
    assert.ok(noteId, "create_canvas_note did not return a note ID");

    const storedNote: any = await Note.findOne({ _id: noteId, userId: ownerId }).lean();
    assert.equal(storedNote?.type, "canvas");
    assert.deepEqual(storedNote?.tags, ["canvas-verification"]);
    const storedBlocks: any[] = await NoteBlock.find({ noteId }).sort({ order: 1 }).lean();
    assert.equal(storedBlocks.length, 1);
    const createdScene = parseCanvasScene(storedBlocks[0]!.content);
    assert.equal(createdScene.appState.viewBackgroundColor, "#ffffff");
    assert.equal(createdScene.elements.length, 7);
    assert.doesNotMatch(storedBlocks[0]!.content, /abcdef0123456789/);
    const arrow: any = createdScene.elements.find(element => element.id === "request");
    assert.deepEqual(arrow.points, [[0, 0], [184, 0]]);
    evidence.createPersistence = { noteType: storedNote.type, blocks: storedBlocks.length, renderedElements: createdScene.elements.length };

    const listResult = resultText(await owner.client.callTool({ name: "list_notes", arguments: {} }));
    assert.match(listResult, /Canvas integration verification/);
    assert.match(listResult, /canvas/);
    const genericGet = resultText(await owner.client.callTool({ name: "get_note", arguments: { noteId } }));
    assert.match(genericGet, /Use get_canvas_note/);
    const canvasGet = resultText(await owner.client.callTool({ name: "get_canvas_note", arguments: { noteId } }));
    assert.match(canvasGet, /"source": "operium"/);
    assert.doesNotMatch(canvasGet, /abcdef0123456789/);
    evidence.readAndList = true;

    const beforeGuardContent = storedBlocks[0]!.content;
    const appendGuard = resultText(await owner.client.callTool({
      name: "append_note",
      arguments: { noteId, content: "## This must not corrupt JSON" },
    }));
    assert.match(appendGuard, /cannot be appended as Markdown/);
    const updateGuard = resultText(await owner.client.callTool({
      name: "update_note",
      arguments: { noteId, content: "# This must not replace the scene" },
    }));
    assert.match(updateGuard, /Canvas content is Excalidraw JSON/);
    assert.equal((await NoteBlock.findOne({ noteId, order: 0 }).lean() as any).content, beforeGuardContent);
    evidence.markdownCorruptionGuards = true;

    const attackerGet = resultText(await attacker.client.callTool({
      name: "get_canvas_note",
      arguments: { noteId },
    }));
    assert.match(attackerGet, /not found/);
    const attackerUpdate = resultText(await attacker.client.callTool({
      name: "update_canvas_note",
      arguments: { noteId, title: "Stolen" },
    }));
    assert.match(attackerUpdate, /not found/);
    assert.equal((await Note.findById(noteId).lean() as any).title, "Canvas integration verification");
    evidence.ownershipIsolation = true;

    const invalidUpdate: any = await owner.client.callTool({
      name: "update_canvas_note",
      arguments: {
        noteId,
        title: "Must not be applied",
        elements: [
          { id: "duplicate", type: "rectangle" },
          { id: "duplicate", type: "diamond" },
        ],
      },
    });
    assert.equal(invalidUpdate.isError, true);
    assert.equal((await Note.findById(noteId).lean() as any).title, "Canvas integration verification");
    assert.equal((await NoteBlock.findOne({ noteId, order: 0 }).lean() as any).content, beforeGuardContent);
    evidence.invalidUpdatePreservesScene = true;

    // Older/imported canvases may be fragmented across blocks. Both readers and
    // updates must reconstruct the full JSON and consolidate it back to one block.
    const splitAt = Math.floor(beforeGuardContent.length / 2);
    await NoteBlock.updateOne({ noteId, order: 0 }, { content: beforeGuardContent.slice(0, splitAt) });
    await NoteBlock.create({
      noteId,
      spaceId: storedNote.spaceId,
      userId: ownerId,
      order: 1,
      content: beforeGuardContent.slice(splitAt),
    });
    assert.match(resultText(await owner.client.callTool({
      name: "get_canvas_note",
      arguments: { noteId },
    })), /"source": "operium"/);
    evidence.fragmentedSceneRead = true;

    const updated: any = await owner.client.callTool({
      name: "update_canvas_note",
      arguments: {
        noteId,
        title: "Updated canvas verification",
        tags: ["updated"],
        backgroundColor: "#f8f9fa",
        elements: [
          { id: "decision", type: "diamond", x: 100, y: 100, width: 220, height: 140, label: "Approved?", backgroundColor: "#ffe8cc" },
          { id: "done", type: "rectangle", x: 480, y: 120, width: 180, height: 100, label: "Done", backgroundColor: "#d3f9d8" },
          { id: "yes", type: "arrow", fromId: "decision", toId: "done", label: "Yes" },
        ],
      },
    });
    assert.equal(updated.isError, undefined);
    const updatedNote: any = await Note.findById(noteId).lean();
    const updatedBlocks: any[] = await NoteBlock.find({ noteId }).sort({ order: 1 }).lean();
    assert.equal(updatedNote.title, "Updated canvas verification");
    assert.deepEqual(updatedNote.tags, ["updated"]);
    assert.equal(updatedBlocks.length, 1);
    const updatedScene = parseCanvasScene(updatedBlocks[0]!.content);
    assert.equal(updatedScene.appState.viewBackgroundColor, "#f8f9fa");
    assert.equal(updatedScene.elements.length, 6);
    evidence.updatePersistence = { blocks: updatedBlocks.length, renderedElements: updatedScene.elements.length };

    const updatedContent = updatedBlocks[0]!.content;
    const metadataOnly: any = await owner.client.callTool({
      name: "update_canvas_note",
      arguments: { noteId, title: "Metadata-only canvas verification" },
    });
    assert.equal(metadataOnly.isError, undefined);
    assert.equal((await Note.findById(noteId).lean() as any).title, "Metadata-only canvas verification");
    assert.equal((await NoteBlock.findOne({ noteId, order: 0 }).lean() as any).content, updatedContent);
    evidence.metadataUpdatePreservesScene = true;

    const textNote = await Note.create({
      title: "Text type guard",
      type: "text",
      spaceId: storedNote.spaceId,
      userId: ownerId,
      tags: [],
      preview: "text",
    });
    await NoteBlock.create({
      noteId: textNote._id,
      spaceId: storedNote.spaceId,
      userId: ownerId,
      order: 0,
      content: "# Text",
    });
    assert.match(resultText(await owner.client.callTool({
      name: "get_canvas_note",
      arguments: { noteId: textNote._id.toString() },
    })), /text note/);
    assert.match(resultText(await owner.client.callTool({
      name: "update_canvas_note",
      arguments: { noteId: textNote._id.toString(), title: "Wrong tool" },
    })), /text note/);
    evidence.noteTypeGuards = true;

    const deleted = resultText(await owner.client.callTool({
      name: "delete_note",
      arguments: { noteId },
    }));
    assert.match(deleted, /Deleted note/);
    assert.equal(await Note.countDocuments({ _id: noteId }), 0);
    assert.equal(await NoteBlock.countDocuments({ noteId }), 0);
    evidence.deleteCascade = true;

    console.log(JSON.stringify({ ok: true, evidence }, null, 2));
  } finally {
    await closeConnection(owner);
    await closeConnection(attacker);
    await new Promise(resolve => setTimeout(resolve, 50));
    const ownedNotes = await Note.find({ userId: { $in: [ownerId, attackerId] } }).select("_id").lean();
    const ownedNoteIds = ownedNotes.map(note => note._id);
    await NoteBlock.deleteMany({ $or: [{ userId: { $in: [ownerId, attackerId] } }, { noteId: { $in: ownedNoteIds } }] });
    await Note.deleteMany({ userId: { $in: [ownerId, attackerId] } });
    await Space.deleteMany({ userId: { $in: [ownerId, attackerId] } });
    await McpUsageLog.deleteMany({ userId: { $in: [ownerId, attackerId] } });
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
