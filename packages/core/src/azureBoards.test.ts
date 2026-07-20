import { describe, expect, it } from "vitest";
import {
  buildTree,
  buildWiql,
  buildPatchOps,
  stripHtml,
  type BoardItem,
} from "./azureBoards";

// ─── test helpers ───────────────────────────────────────────────────────────────

function item(partial: Partial<BoardItem> & { id: number }): BoardItem {
  return {
    id: partial.id,
    rev: partial.rev ?? 1,
    type: partial.type ?? "Task",
    title: partial.title ?? `Item ${partial.id}`,
    state: partial.state ?? "New",
    stateCategory: partial.stateCategory ?? "Proposed",
    assignee: partial.assignee,
    iterationPath: partial.iterationPath ?? "Proj\\Sprint 1",
    areaPath: partial.areaPath ?? "Proj",
    priority: partial.priority,
    tags: partial.tags ?? [],
    parentId: partial.parentId,
    description: partial.description,
    url: partial.url ?? `https://dev.azure.com/org/proj/_workitems/edit/${partial.id}`,
    changedDate: partial.changedDate ?? "2026-01-01T00:00:00Z",
    createdDate: partial.createdDate ?? "2026-01-01T00:00:00Z",
  };
}

// ─── buildWiql ───────────────────────────────────────────────────────────────────

describe("buildWiql", () => {
  it("builds a minimal query scoped to the project macro", () => {
    const q = buildWiql({ project: "MyProj" });
    expect(q).toBe(
      "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project " +
        "ORDER BY [System.ChangedDate] DESC",
    );
  });

  it("adds an UNDER clause for iterationPath", () => {
    const q = buildWiql({ project: "P", iterationPath: "P\\Sprint 1" });
    expect(q).toContain("[System.IterationPath] UNDER 'P\\Sprint 1'");
  });

  it("adds an equality clause for assignedTo", () => {
    const q = buildWiql({ project: "P", assignedTo: "user@example.com" });
    expect(q).toContain("[System.AssignedTo] = 'user@example.com'");
  });

  it("builds an IN list for types", () => {
    const q = buildWiql({ project: "P", types: ["Bug", "User Story"] });
    expect(q).toContain("[System.WorkItemType] IN ('Bug', 'User Story')");
  });

  it("omits an empty types array", () => {
    const q = buildWiql({ project: "P", types: [] });
    expect(q).not.toContain("System.WorkItemType");
  });

  it("escapes single quotes by doubling them", () => {
    const q = buildWiql({ project: "P", iterationPath: "P\\O'Brien's Sprint" });
    expect(q).toContain("UNDER 'P\\O''Brien''s Sprint'");
  });

  it("adds an equality clause for parentId", () => {
    const q = buildWiql({ project: "P", parentId: 123 });
    expect(q).toContain("[System.Parent] = 123");
  });

  it("omits System.Parent when parentId is not given", () => {
    const q = buildWiql({ project: "P" });
    expect(q).not.toContain("System.Parent");
  });

  it("does not encode stateCategories / includeCompleted (client-side only)", () => {
    const q = buildWiql({
      project: "P",
      stateCategories: ["Completed"],
      includeCompleted: false,
    });
    expect(q).not.toContain("Completed");
    expect(q).not.toContain("StateCategory");
  });

  it("combines multiple filters with AND", () => {
    const q = buildWiql({
      project: "P",
      iterationPath: "P\\S1",
      assignedTo: "a@b.com",
      types: ["Task"],
    });
    const whereBody = q.split("WHERE ")[1]!.split(" ORDER BY")[0]!;
    expect(whereBody.split(" AND ")).toHaveLength(4);
  });
});

// ─── stripHtml ───────────────────────────────────────────────────────────────────

describe("stripHtml", () => {
  it("returns empty string for nullish input", () => {
    expect(stripHtml(undefined)).toBe("");
    expect(stripHtml(null)).toBe("");
    expect(stripHtml("")).toBe("");
  });

  it("strips tags and collapses whitespace", () => {
    expect(stripHtml("<p>Hello</p>\n\n<div>  world </div>")).toBe("Hello world");
  });

  it("decodes the common entities", () => {
    expect(stripHtml("a &amp; b &lt;tag&gt; &quot;q&quot; &#39;x&#39;&nbsp;end")).toBe(
      "a & b <tag> \"q\" 'x' end",
    );
  });

  it("handles nested / attribute-laden markup", () => {
    expect(stripHtml('<a href="x" title="t"><b>Link</b></a> text')).toBe("Link text");
  });
});

// ─── buildPatchOps ───────────────────────────────────────────────────────────────

describe("buildPatchOps", () => {
  it("returns no ops for an empty patch", () => {
    expect(buildPatchOps({})).toEqual([]);
  });

  it("prepends a rev test op when expectedRev is given", () => {
    const ops = buildPatchOps({ title: "T" }, 7);
    expect(ops[0]).toEqual({ op: "test", path: "/rev", value: 7 });
    expect(ops[1]).toEqual({ op: "add", path: "/fields/System.Title", value: "T" });
  });

  it("maps each field to its Azure field path", () => {
    const ops = buildPatchOps({
      title: "T",
      state: "Active",
      iterationPath: "P\\S1",
      priority: 2,
      description: "d",
    });
    const byPath = Object.fromEntries(ops.map((o) => [o.path, o.value]));
    expect(byPath["/fields/System.Title"]).toBe("T");
    expect(byPath["/fields/System.State"]).toBe("Active");
    expect(byPath["/fields/System.IterationPath"]).toBe("P\\S1");
    expect(byPath["/fields/Microsoft.VSTS.Common.Priority"]).toBe(2);
    expect(byPath["/fields/System.Description"]).toBe("d");
  });

  it("adds assignee when a string is supplied", () => {
    const ops = buildPatchOps({ assignee: "a@b.com" });
    expect(ops).toEqual([
      { op: "add", path: "/fields/System.AssignedTo", value: "a@b.com" },
    ]);
  });

  it("removes assignee when null is supplied", () => {
    const ops = buildPatchOps({ assignee: null });
    expect(ops).toEqual([{ op: "remove", path: "/fields/System.AssignedTo" }]);
  });

  it("joins tags with '; '", () => {
    const ops = buildPatchOps({ tags: ["a", "b", "c"] });
    expect(ops[0]).toEqual({ op: "add", path: "/fields/System.Tags", value: "a; b; c" });
  });
});

// ─── buildTree ───────────────────────────────────────────────────────────────────

describe("buildTree", () => {
  it("returns an empty array for no items", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("nests children under parents present in the set", () => {
    const tree = buildTree([
      item({ id: 1, type: "Epic" }),
      item({ id: 2, type: "Feature", parentId: 1 }),
      item({ id: 3, type: "Task", parentId: 2 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.id).toBe(1);
    expect(tree[0]!.children[0]!.id).toBe(2);
    expect(tree[0]!.children[0]!.children[0]!.id).toBe(3);
  });

  it("keeps orphans (missing parent) at the root", () => {
    const tree = buildTree([
      item({ id: 10, type: "Task", parentId: 999 }),
      item({ id: 11, type: "Task" }),
    ]);
    expect(tree.map((n) => n.id).sort()).toEqual([10, 11]);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it("sorts siblings by type rank then id", () => {
    const tree = buildTree([
      item({ id: 5, type: "Bug" }),
      item({ id: 2, type: "Epic" }),
      item({ id: 9, type: "Task" }),
      item({ id: 1, type: "Feature" }),
      item({ id: 4, type: "User Story" }),
      item({ id: 3, type: "Something" }),
    ]);
    expect(tree.map((n) => n.type)).toEqual([
      "Epic",
      "Feature",
      "User Story",
      "Task",
      "Bug",
      "Something",
    ]);
  });

  it("breaks type-rank ties by ascending id", () => {
    const tree = buildTree([
      item({ id: 30, type: "Task" }),
      item({ id: 10, type: "Task" }),
      item({ id: 20, type: "Task" }),
    ]);
    expect(tree.map((n) => n.id)).toEqual([10, 20, 30]);
  });

  it("sorts nested children too", () => {
    const tree = buildTree([
      item({ id: 1, type: "Epic" }),
      item({ id: 4, type: "Task", parentId: 1 }),
      item({ id: 2, type: "Bug", parentId: 1 }),
      item({ id: 3, type: "Feature", parentId: 1 }),
    ]);
    expect(tree[0]!.children.map((n) => n.type)).toEqual(["Feature", "Task", "Bug"]);
  });

  it("treats a self-referential parent as a root", () => {
    const tree = buildTree([item({ id: 7, parentId: 7 })]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.id).toBe(7);
  });
});
