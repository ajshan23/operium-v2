import { sanitize } from "./sanitize";

export const MAX_CANVAS_ELEMENTS = 200;
export const MAX_CANVAS_SCENE_BYTES = 1_000_000;
export const DEFAULT_CANVAS_BACKGROUND = "#f5faff";

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export type CanvasElementType =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "text"
  | "arrow"
  | "line";

export interface CanvasElementInput {
  id?: string;
  type: CanvasElementType;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  endX?: number;
  endY?: number;
  points?: [number, number][];
  fromId?: string;
  toId?: string;
  text?: string;
  label?: string;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: "hachure" | "cross-hatch" | "solid" | "zigzag";
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roughness?: number;
  opacity?: number;
  fontSize?: number;
  locked?: boolean;
}

export interface CanvasScene {
  type: "excalidraw";
  version: 2;
  source: "operium";
  elements: Record<string, unknown>[];
  appState: { viewBackgroundColor: string };
  files: Record<string, never>;
}

type Geometry = { x: number; y: number; width: number; height: number };
type NodeGeometry = Geometry & { type: "rectangle" | "ellipse" | "diamond" | "text" };

function integerHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function requireFinite(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved)) throw new Error(`${name} must be a finite number`);
  if (Math.abs(resolved) > 100_000) throw new Error(`${name} is outside the supported canvas range`);
  return resolved;
}

function positiveSize(value: number | undefined, fallback: number, name: string): number {
  const resolved = requireFinite(value, fallback, name);
  if (resolved <= 0 || resolved > 20_000) throw new Error(`${name} must be between 0 and 20000`);
  return resolved;
}

function boundedNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  const resolved = requireFinite(value, fallback, name);
  if (resolved < min || resolved > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return resolved;
}

function canvasColor(value: string | undefined, fallback: string, name: string): string {
  const resolved = value ?? fallback;
  if (resolved !== "transparent" && !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(resolved)) {
    throw new Error(`${name} must be transparent or a 3, 4, 6, or 8 digit hex color`);
  }
  return resolved;
}

function safeId(raw: string | undefined, index: number): string {
  const candidate = (raw?.trim() || `operium-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-");
  if (!candidate || candidate.length > 100) throw new Error("Canvas element IDs must be 1-100 characters");
  return candidate;
}

function baseElement(
  id: string,
  type: CanvasElementType,
  geometry: Geometry,
  input: CanvasElementInput,
): Record<string, unknown> {
  const seed = integerHash(`${id}:seed`) || 1;
  const versionNonce = integerHash(`${id}:nonce`) || 1;
  return {
    id,
    type,
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    angle: 0,
    strokeColor: canvasColor(input.strokeColor, "#1e1e1e", `${id}.strokeColor`),
    backgroundColor: canvasColor(input.backgroundColor, "transparent", `${id}.backgroundColor`),
    fillStyle: input.fillStyle ?? "solid",
    strokeWidth: boundedNumber(input.strokeWidth, 2, 1, 10, `${id}.strokeWidth`),
    strokeStyle: input.strokeStyle ?? "solid",
    roughness: boundedNumber(input.roughness, 1, 0, 2, `${id}.roughness`),
    opacity: boundedNumber(input.opacity, 100, 0, 100, `${id}.opacity`),
    roundness: type === "rectangle" ? { type: 3 } : null,
    seed,
    version: 1,
    versionNonce,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: input.locked ?? false,
  };
}

function textMetrics(text: string, fontSize: number, maxWidth?: number): { width: number; height: number } {
  const lines = text.split("\n");
  const naturalWidth = Math.max(fontSize, ...lines.map(line => line.length * fontSize * 0.62));
  return {
    width: maxWidth ? Math.max(fontSize, Math.min(naturalWidth, maxWidth)) : naturalWidth,
    height: Math.max(fontSize * 1.25, lines.length * fontSize * 1.25),
  };
}

function textElement(
  id: string,
  text: string,
  x: number,
  y: number,
  input: CanvasElementInput,
  containerId: string | null,
  maxWidth?: number,
): Record<string, unknown> {
  const fontSize = input.fontSize ?? 20;
  if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 96) {
    throw new Error("fontSize must be between 8 and 96");
  }
  const metrics = textMetrics(text, fontSize, maxWidth);
  const base = baseElement(id, "text", { x, y, ...metrics }, {
    ...input,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
  });
  return {
    ...base,
    text,
    originalText: text,
    fontSize,
    fontFamily: 1,
    textAlign: containerId ? "center" : "left",
    verticalAlign: containerId ? "middle" : "top",
    containerId,
    autoResize: !containerId,
    lineHeight: 1.25,
  };
}

function addBoundElement(target: Record<string, unknown>, id: string, type: "arrow" | "text") {
  const current = Array.isArray(target.boundElements) ? target.boundElements : [];
  target.boundElements = [...current, { id, type }];
}

function nodeCenter(node: Geometry): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

/** Find the point where a ray from a node's center toward `target` leaves it. */
function nodeBoundaryPoint(
  node: NodeGeometry,
  target: { x: number; y: number },
  gap = 8,
): { x: number; y: number } {
  const center = nodeCenter(node);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) return center;

  const rx = Math.max(1, node.width / 2);
  const ry = Math.max(1, node.height / 2);
  let scale: number;
  if (node.type === "ellipse") {
    scale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
  } else if (node.type === "diamond") {
    scale = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry);
  } else {
    scale = 1 / Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry);
  }
  return {
    x: center.x + dx * scale + (dx / distance) * gap,
    y: center.y + dy * scale + (dy / distance) * gap,
  };
}

/**
 * Converts the compact, agent-facing canvas format into complete Excalidraw
 * elements. Shapes and their labels are bound together, and arrows may target
 * shape IDs instead of requiring the caller to calculate endpoints.
 */
export function normalizeCanvasElements(inputs: CanvasElementInput[]): Record<string, unknown>[] {
  if (inputs.length > MAX_CANVAS_ELEMENTS) {
    throw new Error(`Canvas supports at most ${MAX_CANVAS_ELEMENTS} input elements`);
  }

  const ids = inputs.map((input, index) => safeId(input.id, index));
  if (new Set(ids).size !== ids.length) throw new Error("Canvas element IDs must be unique");

  const output: Record<string, unknown>[] = [];
  const byId = new Map<string, Record<string, unknown>>();
  const geometryById = new Map<string, NodeGeometry>();

  // Materialize non-linear elements first so connectors can resolve node IDs
  // regardless of the order supplied by the agent.
  inputs.forEach((input, index) => {
    if (input.type === "arrow" || input.type === "line") return;
    const id = ids[index]!;
    const x = requireFinite(input.x, 0, `${id}.x`);
    const y = requireFinite(input.y, 0, `${id}.y`);

    if (input.type === "text") {
      const text = sanitize(input.text ?? input.label ?? "").slice(0, 4_000);
      if (!text.trim()) throw new Error(`Text element ${id} requires text`);
      const element = textElement(id, text, x, y, input, null, input.width);
      output.push(element);
      byId.set(id, element);
      geometryById.set(id, {
        x,
        y,
        width: Number(element.width),
        height: Number(element.height),
        type: "text",
      });
      return;
    }

    const geometry = {
      x,
      y,
      width: positiveSize(input.width, 200, `${id}.width`),
      height: positiveSize(input.height, 100, `${id}.height`),
    };
    const shape = baseElement(id, input.type, geometry, input);
    output.push(shape);
    byId.set(id, shape);
    geometryById.set(id, { ...geometry, type: input.type });

    const label = sanitize(input.label ?? input.text ?? "").slice(0, 2_000);
    if (label.trim()) {
      const labelId = `${id}-label`;
      if (ids.includes(labelId) || byId.has(labelId)) {
        throw new Error(`Generated label ID conflicts with another element: ${labelId}`);
      }
      const metrics = textMetrics(label, input.fontSize ?? 20, Math.max(20, geometry.width - 20));
      const labelElement = textElement(
        labelId,
        label,
        geometry.x + (geometry.width - metrics.width) / 2,
        geometry.y + (geometry.height - metrics.height) / 2,
        input,
        id,
        Math.max(20, geometry.width - 20),
      );
      addBoundElement(shape, labelId, "text");
      output.push(labelElement);
      byId.set(labelId, labelElement);
    }
  });

  inputs.forEach((input, index) => {
    if (input.type !== "arrow" && input.type !== "line") return;
    const id = ids[index]!;
    const from = input.fromId ? geometryById.get(input.fromId) : undefined;
    const to = input.toId ? geometryById.get(input.toId) : undefined;
    if (input.fromId && !from) throw new Error(`Connector ${id} references unknown fromId: ${input.fromId}`);
    if (input.toId && !to) throw new Error(`Connector ${id} references unknown toId: ${input.toId}`);

    const requestedStart = from
      ? nodeCenter(from)
      : {
          x: requireFinite(input.x, 0, `${id}.x`),
          y: requireFinite(input.y, 0, `${id}.y`),
        };
    let points: [number, number][];
    let startX = requestedStart.x;
    let startY = requestedStart.y;
    if (input.points?.length && (input.fromId || input.toId)) {
      throw new Error(`Connector ${id} cannot combine points with fromId/toId; use bindings for a straight connector or absolute points without bindings`);
    }
    if (input.points?.length) {
      points = input.points.map(([px, py], pointIndex) => [
        requireFinite(px, 0, `${id}.points[${pointIndex}].x`),
        requireFinite(py, 0, `${id}.points[${pointIndex}].y`),
      ]);
      if (points.length < 2) throw new Error(`Connector ${id} requires at least two points`);
    } else {
      const requestedEnd = to
        ? nodeCenter(to)
        : {
            x: requireFinite(input.endX, startX + (input.width ?? 180), `${id}.endX`),
            y: requireFinite(input.endY, startY + (input.height ?? 0), `${id}.endY`),
          };
      const clippedStart = from ? nodeBoundaryPoint(from, requestedEnd) : requestedStart;
      const clippedEnd = to ? nodeBoundaryPoint(to, requestedStart) : requestedEnd;
      startX = clippedStart.x;
      startY = clippedStart.y;
      points = [[0, 0], [clippedEnd.x - startX, clippedEnd.y - startY]];
    }

    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    const geometry = {
      x: startX,
      y: startY,
      width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
      height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
    };
    const connector: Record<string, unknown> = {
      ...baseElement(id, input.type, geometry, { ...input, backgroundColor: "transparent" }),
      points,
      lastCommittedPoint: null,
      startBinding: input.fromId ? { elementId: input.fromId, focus: 0, gap: 8 } : null,
      endBinding: input.toId ? { elementId: input.toId, focus: 0, gap: 8 } : null,
      startArrowhead: null,
      endArrowhead: input.type === "arrow" ? "arrow" : null,
      elbowed: false,
    };
    output.push(connector);
    byId.set(id, connector);

    if (input.fromId) addBoundElement(byId.get(input.fromId)!, id, "arrow");
    if (input.toId && input.toId !== input.fromId) addBoundElement(byId.get(input.toId)!, id, "arrow");

    const label = sanitize(input.label ?? input.text ?? "").slice(0, 2_000);
    if (label.trim()) {
      const labelId = `${id}-label`;
      if (ids.includes(labelId) || byId.has(labelId)) {
        throw new Error(`Generated label ID conflicts with another element: ${labelId}`);
      }
      const last = points[points.length - 1]!;
      const metrics = textMetrics(label, input.fontSize ?? 18);
      const length = Math.max(1, Math.hypot(last[0], last[1]));
      let normalX = -last[1] / length;
      let normalY = last[0] / length;
      // Prefer the visually predictable side above a mostly horizontal line.
      if (normalY > 0) { normalX *= -1; normalY *= -1; }
      const labelOffset = 18;
      const labelElement = textElement(
        labelId,
        label,
        startX + last[0] / 2 + normalX * labelOffset - metrics.width / 2,
        startY + last[1] / 2 + normalY * labelOffset - metrics.height / 2,
        { ...input, fontSize: input.fontSize ?? 18 },
        null,
      );
      const groupId = `${id}-group`;
      connector.groupIds = [groupId];
      labelElement.groupIds = [groupId];
      labelElement.textAlign = "center";
      output.push(labelElement);
      byId.set(labelId, labelElement);
    }
  });

  return output;
}

export function buildCanvasScene(
  inputs: CanvasElementInput[],
  backgroundColor = DEFAULT_CANVAS_BACKGROUND,
): CanvasScene {
  const resolvedBackground = canvasColor(backgroundColor, DEFAULT_CANVAS_BACKGROUND, "backgroundColor");
  const scene: CanvasScene = {
    type: "excalidraw",
    version: 2,
    source: "operium",
    elements: normalizeCanvasElements(inputs),
    appState: { viewBackgroundColor: resolvedBackground },
    files: {},
  };
  const serialized = JSON.stringify(scene);
  if (utf8ByteLength(serialized) > MAX_CANVAS_SCENE_BYTES) {
    throw new Error(`Canvas scene exceeds ${MAX_CANVAS_SCENE_BYTES} bytes`);
  }
  return scene;
}

export function parseCanvasScene(raw: string): CanvasScene {
  if (utf8ByteLength(raw) > MAX_CANVAS_SCENE_BYTES) {
    throw new Error(`Canvas scene exceeds ${MAX_CANVAS_SCENE_BYTES} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Canvas content is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as any).elements)) {
    throw new Error("Canvas scene must contain an elements array");
  }
  if ((parsed as any).elements.length > MAX_CANVAS_ELEMENTS * 3) {
    throw new Error("Canvas scene contains too many rendered elements");
  }
  return {
    type: "excalidraw",
    version: 2,
    source: "operium",
    elements: (parsed as any).elements,
    appState: {
      viewBackgroundColor:
        typeof (parsed as any).appState?.viewBackgroundColor === "string"
          ? (parsed as any).appState.viewBackgroundColor
          : DEFAULT_CANVAS_BACKGROUND,
    },
    files: {},
  };
}

export function canvasPreview(scene: CanvasScene): string {
  const visible = scene.elements.filter(element => element.isDeleted !== true);
  const labels = visible
    .filter(element => element.type === "text" && typeof element.text === "string")
    .map(element => String(element.text).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);
  return `Canvas with ${visible.length} rendered elements${labels.length ? `: ${labels.join(", ")}` : ""}`.slice(0, 200);
}
