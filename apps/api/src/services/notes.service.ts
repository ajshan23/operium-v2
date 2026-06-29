import crypto from "crypto";
import { Space, Note, NoteBlock } from "@operium/db";
import { ApiError } from "../utils/ApiError.js";

// ─── Spaces ───────────────────────────────────────────────────────────────────

export class SpacesService {
  async list(userId: string) {
    return Space.find({ userId }).sort({ createdAt: -1 }).lean();
  }

  async create(userId: string, data: { name: string; description?: string; icon?: string }) {
    if (!data.name?.trim()) throw new ApiError(400, "Name is required");
    try {
      return await Space.create({ ...data, userId });
    } catch (err: any) {
      if (err.code === 11000) throw new ApiError(400, "A space with this name already exists");
      throw err;
    }
  }

  async getById(id: string, userId: string) {
    const space = await Space.findOne({ _id: id, userId }).lean();
    if (!space) throw new ApiError(404, "Space not found");
    return space;
  }

  async update(id: string, userId: string, data: {
    name?: string; description?: string; icon?: string; isSharedWithContext?: boolean;
  }) {
    const update: any = {};
    if (data.name              !== undefined) update.name              = data.name;
    if (data.description       !== undefined) update.description       = data.description;
    if (data.icon              !== undefined) update.icon              = data.icon;
    if (data.isSharedWithContext !== undefined) update.isSharedWithContext = data.isSharedWithContext;

    const space = await Space.findOneAndUpdate({ _id: id, userId }, update, { new: true, runValidators: true }).lean();
    if (!space) throw new ApiError(404, "Space not found");
    return space;
  }

  async delete(id: string, userId: string) {
    const space = await Space.findOneAndDelete({ _id: id, userId });
    if (!space) throw new ApiError(404, "Space not found");
    const noteIds = await Note.find({ spaceId: id }).select("_id").lean();
    const ids = noteIds.map(n => n._id);
    await Note.deleteMany({ spaceId: id });
    if (ids.length > 0) await NoteBlock.deleteMany({ noteId: { $in: ids } });
    return { deleted: true };
  }
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export class NotesService {
  private async assertSpaceOwner(spaceId: string, userId: string) {
    const exists = await Space.exists({ _id: spaceId, userId });
    if (!exists) throw new ApiError(403, "Space not found or access denied");
  }

  async list(userId: string, spaceId?: string) {
    const query: any = { userId };
    if (spaceId) query.spaceId = spaceId;
    return Note.find(query).sort({ updatedAt: -1 }).lean();
  }

  async create(userId: string, data: {
    spaceId: string; title?: string; content?: string; tags?: string[]; type?: "text" | "canvas";
  }) {
    if (!data.spaceId) throw new ApiError(400, "spaceId is required");
    await this.assertSpaceOwner(data.spaceId, userId);

    const content = data.content ?? "";
    const preview = content.substring(0, 200);

    const note = await Note.create({
      title:   data.title   ?? "",
      type:    data.type    ?? "text",
      preview,
      spaceId: data.spaceId,
      userId,
      tags:    data.tags    ?? [],
    });

    await NoteBlock.create({
      noteId:  note._id,
      spaceId: data.spaceId,
      userId,
      order:   0,
      content,
    });

    return { ...note.toObject(), content };
  }

  async getById(id: string, userId: string) {
    const note = await Note.findOne({ _id: id, userId }).lean();
    if (!note) throw new ApiError(404, "Note not found");
    const blocks = await NoteBlock.find({ noteId: id }).sort({ order: 1 }).lean();
    const content = blocks.map(b => b.content).join("\n");
    return { ...note, content, blocks };
  }

  async update(id: string, userId: string, data: {
    title?: string; content?: string; tags?: string[]; isStarred?: boolean; type?: "text" | "canvas";
  }) {
    const note = await Note.findOne({ _id: id, userId }).lean();
    if (!note) throw new ApiError(404, "Note not found");

    const noteUpdate: any = {};
    if (data.title    !== undefined) noteUpdate.title    = data.title;
    if (data.tags     !== undefined) noteUpdate.tags     = data.tags;
    if (data.isStarred !== undefined) noteUpdate.isStarred = data.isStarred;
    if (data.type     !== undefined) noteUpdate.type     = data.type;

    if (data.content !== undefined) {
      noteUpdate.preview = data.content.substring(0, 200);
      // Replace all blocks with single updated block
      await NoteBlock.deleteMany({ noteId: id });
      await NoteBlock.create({
        noteId:  id,
        spaceId: note.spaceId,
        userId,
        order:   0,
        content: data.content,
      });
    }

    const updated = await Note.findOneAndUpdate({ _id: id, userId }, noteUpdate, { new: true }).lean();
    if (!updated) throw new ApiError(404, "Note not found");

    const content = data.content ?? (await NoteBlock.find({ noteId: id }).sort({ order: 1 }).lean()).map(b => b.content).join("\n");
    return { ...updated, content };
  }

  async delete(id: string, userId: string) {
    const note = await Note.findOneAndDelete({ _id: id, userId });
    if (!note) throw new ApiError(404, "Note not found");
    await NoteBlock.deleteMany({ noteId: id });
    return { deleted: true };
  }

  async toggleStar(id: string, userId: string) {
    const note = await Note.findOne({ _id: id, userId });
    if (!note) throw new ApiError(404, "Note not found");
    note.isStarred = !note.isStarred;
    await note.save();
    return { isStarred: note.isStarred };
  }

  async setSharing(id: string, userId: string, isShared: boolean) {
    const note = await Note.findOne({ _id: id, userId });
    if (!note) throw new ApiError(404, "Note not found");

    const update: any = { isShared };
    if (isShared && !note.shareId) {
      update.shareId = crypto.randomUUID();
    }

    const updated = await Note.findOneAndUpdate({ _id: id, userId }, update, { new: true }).lean();
    return { isShared: updated!.isShared, shareId: updated!.shareId ?? null };
  }
}

export const spacesService = new SpacesService();
export const notesService  = new NotesService();
