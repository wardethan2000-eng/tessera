import type { PinPosition, ThreadConnection, ThreadType } from "./corkboardTypes";
import {
  PIN_ROTATION_RANGE,
  PIN_MIN_SPACING,
  BOARD_PADDING,
  BOARD_BASE_WIDTH,
  BOARD_BASE_HEIGHT,
} from "./corkboardAnimations";

interface MemoryLike {
  id: string;
  primaryPersonId: string;
  dateOfEventText?: string | null;
  kind: string;
}

function mulberry32(seedInput: number) {
  let a = seedInput >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function extractYearLocal(text?: string | null): number | null {
  if (!text) return null;
  const match = text.match(/\b(\d{4})\b/);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

function gaussianish(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  const clampedU1 = Math.max(1e-10, u1);
  return Math.sqrt(-2.0 * Math.log(clampedU1)) * Math.cos(2.0 * Math.PI * u2);
}

export function computePositions(
  memories: MemoryLike[],
  seed: string,
): PinPosition[] {
  if (memories.length === 0) return [];

  const rng = mulberry32(seedFromString(seed));
  const count = memories.length;
  const boardWidth = Math.max(BOARD_BASE_WIDTH, count * 80);
  const boardHeight = Math.max(BOARD_BASE_HEIGHT, count * 60);

  const kindDimensions: Record<string, { width: number; height: number; scale: number }> = {
    image: { width: 220, height: 280, scale: 1.0 },
    story: { width: 180, height: 220, scale: 0.85 },
    voice: { width: 160, height: 140, scale: 0.7 },
    audio: { width: 160, height: 140, scale: 0.7 },
    document: { width: 160, height: 200, scale: 0.7 },
    video: { width: 220, height: 280, scale: 1.0 },
    link: { width: 160, height: 200, scale: 0.7 },
    text: { width: 180, height: 220, scale: 0.85 },
  };

  const center = { x: boardWidth / 2, y: boardHeight / 2 };
  const positions: PinPosition[] = [];

  const sorted = [...memories].sort((a, b) => {
    const ya = extractYearLocal(a.dateOfEventText) ?? 9999;
    const yb = extractYearLocal(b.dateOfEventText) ?? 9999;
    return ya - yb;
  });

  for (let i = 0; i < sorted.length; i++) {
    const memory = sorted[i]!;
    const dims = kindDimensions[memory.kind] ?? kindDimensions["text"]!;

    const angle = i * 137.508 * (Math.PI / 180);
    const radius = Math.sqrt(i + 1) * (PIN_MIN_SPACING * 0.9);

    const baseX = center.x + radius * Math.cos(angle);
    const baseY = center.y + radius * Math.sin(angle);

    const jitterX = (rng() - 0.5) * 80;
    const jitterY = (rng() - 0.5) * 80;

    const rotation = gaussianish(rng) * (PIN_ROTATION_RANGE / 3);

    positions.push({
      id: memory.id + ":pin",
      memoryId: memory.id,
      x: Math.max(BOARD_PADDING, Math.min(boardWidth - BOARD_PADDING, baseX + jitterX)),
      y: Math.max(BOARD_PADDING, Math.min(boardHeight - BOARD_PADDING, baseY + jitterY)),
      rotation: Math.max(-PIN_ROTATION_RANGE, Math.min(PIN_ROTATION_RANGE, rotation)),
      scale: dims.scale,
      width: dims.width,
      height: dims.height,
      isStartPin: i === 0,
    });
  }

  for (let pass = 0; pass < 20; pass++) {
    let moved = false;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i]!;
        const b = positions[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < PIN_MIN_SPACING) {
          const pushX = (dx / (dist || 1)) * ((PIN_MIN_SPACING - dist) / 2 + 2);
          const pushY = (dy / (dist || 1)) * ((PIN_MIN_SPACING - dist) / 2 + 2);
          positions[i] = {
            ...a,
            x: Math.max(BOARD_PADDING, Math.min(boardWidth - BOARD_PADDING, a.x - pushX)),
            y: Math.max(BOARD_PADDING, Math.min(boardHeight - BOARD_PADDING, a.y - pushY)),
          };
          positions[j] = {
            ...b,
            x: Math.max(BOARD_PADDING, Math.min(boardWidth - BOARD_PADDING, b.x + pushX)),
            y: Math.max(BOARD_PADDING, Math.min(boardHeight - BOARD_PADDING, b.y + pushY)),
          };
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return positions;
}

export function computeConnections(
  memories: MemoryLike[],
  positions: PinPosition[],
): ThreadConnection[] {
  const conns: ThreadConnection[] = [];
  const posById = new Map(positions.map((p) => [p.memoryId, p]));

  const temporal = [...memories].sort((a, b) => {
    const ya = extractYearLocal(a.dateOfEventText) ?? 9999;
    const yb = extractYearLocal(b.dateOfEventText) ?? 9999;
    return ya - yb;
  });

  for (let i = 0; i < temporal.length - 1; i++) {
    const from = temporal[i]!;
    const to = temporal[i + 1]!;
    if (posById.has(from.id) && posById.has(to.id)) {
      conns.push({
        id: `temporal:${from.id}-${to.id}`,
        from: from.id,
        to: to.id,
        type: "temporal",
        strength: 0.8,
      });
    }
  }

  const byPerson = new Map<string, MemoryLike[]>();
  for (const m of memories) {
    const group = byPerson.get(m.primaryPersonId) ?? [];
    group.push(m);
    byPerson.set(m.primaryPersonId, group);
  }

  for (const [, group] of byPerson) {
    const sorted = [...group].sort((a, b) => {
      const ya = extractYearLocal(a.dateOfEventText) ?? 9999;
      const yb = extractYearLocal(b.dateOfEventText) ?? 9999;
      return ya - yb;
    });
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i]!;
      const to = sorted[i + 1]!;
      const alreadyExists = conns.some(
        (c) => (c.from === from.id && c.to === to.id) || (c.from === to.id && c.to === from.id),
      );
      if (!alreadyExists && posById.has(from.id) && posById.has(to.id)) {
        conns.push({
          id: `person:${from.id}-${to.id}`,
          from: from.id,
          to: to.id,
          type: "person",
          strength: 0.5,
        });
      }
    }
  }

  return conns;
}

export function computeSmartWeave(
  memories: MemoryLike[],
  connections: ThreadConnection[],
  seenMap: Record<string, number>,
): string[] {
  if (memories.length === 0) return [];

  const chronological = [...memories].sort((a, b) => {
    const ya = extractYearLocal(a.dateOfEventText) ?? 9999;
    const yb = extractYearLocal(b.dateOfEventText) ?? 9999;
    return ya - yb;
  });

  const adjacencyByPerson = new Map<string, Map<string, string[]>>();
  for (const conn of connections) {
    if (conn.type !== "person") continue;
    let fromMap = adjacencyByPerson.get(conn.from);
    if (!fromMap) {
      fromMap = new Map();
      adjacencyByPerson.set(conn.from, fromMap);
    }
    let toMap = adjacencyByPerson.get(conn.to);
    if (!toMap) {
      toMap = new Map();
      adjacencyByPerson.set(conn.to, toMap);
    }
  }

  const order: string[] = [];
  const visited = new Set<string>();
  const rng = mulberry32(seedFromString("weave-" + memories.map((m) => m.id).join(",").slice(0, 64)));

  function addMemory(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    order.push(id);
  }

  let personStreak = 0;
  const maxPersonStreak = 3;

  for (const memory of chronological) {
    if (visited.has(memory.id)) continue;

    addMemory(memory.id);

    const personMemories = connections
      .filter((c) => c.type === "person" && (c.from === memory.id || c.to === memory.id))
      .map((c) => (c.from === memory.id ? c.to : c.from));

    if (personMemories.length > 0 && personStreak < maxPersonStreak && rng() < 0.4) {
      for (const relatedId of personMemories) {
        const related = memories.find((m) => m.id === relatedId);
        if (related && !visited.has(relatedId)) {
          addMemory(relatedId);
          personStreak += 1;
          break;
        }
      }
    } else {
      personStreak = 0;
    }
  }

  for (const m of chronological) {
    if (!visited.has(m.id)) {
      addMemory(m.id);
    }
  }

  if (Object.keys(seenMap).length > 0) {
    const unseenFirst = order.filter((id) => !(id in seenMap));
    const seenLater = order.filter((id) => id in seenMap);
    return [...unseenFirst, ...seenLater];
  }

  return order;
}

export function computeBoardSize(pinCount: number): { width: number; height: number } {
  return {
    width: Math.max(BOARD_BASE_WIDTH, pinCount * 80),
    height: Math.max(BOARD_BASE_HEIGHT, pinCount * 60),
  };
}

export function computePinCenter(positions: PinPosition[]): { x: number; y: number } {
  if (positions.length === 0) return { x: BOARD_BASE_WIDTH / 2, y: BOARD_BASE_HEIGHT / 2 };
  const startPin = positions.find((p) => p.isStartPin);
  if (startPin) return { x: startPin.x, y: startPin.y };
  const avg = positions.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  );
  return { x: avg.x / positions.length, y: avg.y / positions.length };
}

export function getThreadPath(
  from: PinPosition,
  to: PinPosition,
  type: ThreadType,
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const perpX = -dy;
  const perpY = dx;
  const len = Math.sqrt(perpX * perpX + perpY * perpY) || 1;

  const curvature = type === "temporal" ? 0.15 : type === "person" ? 0.2 : 0.25;
  const seed = seedFromString(from.id + to.id);
  const rng = mulberry32(seed);
  const jitter = (rng() - 0.5) * 0.5 + 0.75;

  const cx1 = from.x + dx * 0.3 + perpX / len * dx * curvature * jitter;
  const cy1 = from.y + dy * 0.3 + perpY / len * dy * curvature * jitter;
  const cx2 = from.x + dx * 0.7 - perpX / len * dx * curvature * jitter;
  const cy2 = from.y + dy * 0.7 - perpY / len * dy * curvature * jitter;

  return `M ${from.x} ${from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${to.x} ${to.y}`;
}