import type { PinPosition, ThreadConnection, ThreadType, BezierControlPoints } from "./corkboardTypes";
import {
  PIN_ROTATION_RANGE,
  PIN_MIN_SPACING,
  PIN_JITTER_RANGE,
  BOARD_PADDING,
  BOARD_BASE_WIDTH,
  BOARD_BASE_HEIGHT,
  MAX_OUTGOING_THREADS_PER_PIN,
} from "./corkboardAnimations";

interface MemoryLike {
  id: string;
  primaryPersonId: string;
  dateOfEventText?: string | null;
  kind: string;
  branchId?: string | null;
  body?: string | null;
  title?: string | null;
  transcriptText?: string | null;
  placeId?: string | null;
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
  const boardWidth = Math.max(BOARD_BASE_WIDTH, count * 220);
  const boardHeight = Math.max(BOARD_BASE_HEIGHT, count * 165);

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
  const personClusterRadius = Math.min(boardWidth, boardHeight) * 0.28;

  const personIds = [...new Set(memories.map((m) => m.primaryPersonId))];
  const sectorAngle = (2 * Math.PI) / Math.max(personIds.length, 1);
  const personSectorStart: Map<string, number> = new Map();
  for (let pi = 0; pi < personIds.length; pi++) {
    personSectorStart.set(personIds[pi]!, pi * sectorAngle);
  }

  const byPerson = new Map<string, MemoryLike[]>();
  for (const m of memories) {
    const group = byPerson.get(m.primaryPersonId) ?? [];
    group.push(m);
    byPerson.set(m.primaryPersonId, group);
  }

  const positions: PinPosition[] = [];

  for (const [personId, group] of byPerson) {
    const sorted = [...group].sort((a, b) => {
      const ya = extractYearLocal(a.dateOfEventText) ?? 9999;
      const yb = extractYearLocal(b.dateOfEventText) ?? 9999;
      return ya - yb;
    });

    const baseAngle = personSectorStart.get(personId) ?? 0;
    const clusterCenter = {
      x: center.x + personClusterRadius * Math.cos(baseAngle),
      y: center.y + personClusterRadius * Math.sin(baseAngle),
    };
    const localSlots = Math.min(Math.max(sorted.length, 1), 8);

    for (let i = 0; i < sorted.length; i++) {
      const memory = sorted[i]!;
      const dims = kindDimensions[memory.kind] ?? kindDimensions["text"]!;

      const ring = Math.floor(i / localSlots);
      const localIndex = i % localSlots;
      const localAngle = baseAngle + (localIndex / localSlots) * Math.PI * 2;
      const localRadius = sorted.length === 1 ? 0 : 360 + ring * PIN_MIN_SPACING;

      const baseX = clusterCenter.x + localRadius * Math.cos(localAngle);
      const baseY = clusterCenter.y + localRadius * Math.sin(localAngle);

      const jitterX = (rng() - 0.5) * 2 * PIN_JITTER_RANGE;
      const jitterY = (rng() - 0.5) * 2 * PIN_JITTER_RANGE;

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
        isStartPin: false,
      });
    }
  }

  const chronologicallyFirst = [...memories].sort((a, b) => {
    const ya = extractYearLocal(a.dateOfEventText) ?? 9999;
    const yb = extractYearLocal(b.dateOfEventText) ?? 9999;
    return ya - yb;
  })[0];

  if (chronologicallyFirst) {
    const startPin = positions.find((p) => p.memoryId === chronologicallyFirst.id);
    if (startPin) {
      const idx = positions.indexOf(startPin);
      positions[idx] = { ...startPin, isStartPin: true };
    }
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
  people?: { id: string; name: string }[],
): ThreadConnection[] {
  const conns: ThreadConnection[] = [];
  const posById = new Map(positions.map((p) => [p.memoryId, p]));
  const edgeSet = new Set<string>();

  function addEdge(from: string, to: string, type: ThreadType, strength: number) {
    const key = [from, to].sort().join("|") + ":" + type;
    if (edgeSet.has(key)) return;
    if (!posById.has(from) || !posById.has(to)) return;
    edgeSet.add(key);
    conns.push({
      id: `${type}:${from}-${to}`,
      from,
      to,
      type,
      strength,
    });
  }

  const temporal = [...memories].sort((a, b) => {
    const ya = extractYearLocal(a.dateOfEventText) ?? 9999;
    const yb = extractYearLocal(b.dateOfEventText) ?? 9999;
    return ya - yb;
  });

  for (let i = 0; i < temporal.length - 1; i++) {
    addEdge(temporal[i]!.id, temporal[i + 1]!.id, "temporal", 0.8);
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
      addEdge(sorted[i]!.id, sorted[i + 1]!.id, "person", 0.5);
    }
  }

  if (memories.some((m) => m.branchId)) {
    const byBranch = new Map<string, MemoryLike[]>();
    for (const m of memories) {
      if (!m.branchId) continue;
      const group = byBranch.get(m.branchId) ?? [];
      group.push(m);
      byBranch.set(m.branchId, group);
    }
    for (const [, group] of byBranch) {
      const sorted = [...group].sort((a, b) => {
        const ya = extractYearLocal(a.dateOfEventText) ?? 9999;
        const yb = extractYearLocal(b.dateOfEventText) ?? 9999;
        return ya - yb;
      });
      for (let i = 0; i < sorted.length - 1; i++) {
        addEdge(sorted[i]!.id, sorted[i + 1]!.id, "branch", 0.4);
      }
    }
  }

  const byYear = new Map<number, MemoryLike[]>();
  for (const m of memories) {
    const yr = extractYearLocal(m.dateOfEventText);
    if (yr == null) continue;
    const group = byYear.get(yr) ?? [];
    group.push(m);
    byYear.set(yr, group);
  }

  const eraEdgeCount = new Map<string, number>();
  for (const [, group] of byYear) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const fromId = group[i]!.id;
        const toId = group[j]!.id;
        const fromCount = eraEdgeCount.get(fromId) ?? 0;
        const toCount = eraEdgeCount.get(toId) ?? 0;
        if (fromCount >= 3 || toCount >= 3) continue;
        addEdge(fromId, toId, "era", 0.4);
        eraEdgeCount.set(fromId, fromCount + 1);
        eraEdgeCount.set(toId, toCount + 1);
      }
    }
  }

  if (people && people.length > 0) {
    const personNameMap = new Map(people.map((p) => [p.name.toLowerCase(), p.id]));
    const memByPerson = new Map<string, MemoryLike[]>();
    for (const m of memories) {
      const group = memByPerson.get(m.primaryPersonId) ?? [];
      group.push(m);
      memByPerson.set(m.primaryPersonId, group);
    }
    const cosubEdgeCount = new Map<string, number>();
    for (const m of memories) {
      const text = ((m.title ?? "") + " " + (m.body ?? "") + " " + (m.transcriptText ?? "")).toLowerCase();
      if (!text) continue;
      const fromCount = cosubEdgeCount.get(m.id) ?? 0;
      if (fromCount >= 3) continue;
      for (const [name, personId] of personNameMap) {
        if (personId === m.primaryPersonId) continue;
        if (!text.includes(name)) continue;
        const targetMems = memByPerson.get(personId);
        if (!targetMems || targetMems.length === 0) continue;
        const earliest = [...targetMems].sort((a, b) => {
          const ya = extractYearLocal(a.dateOfEventText) ?? 9999;
          const yb = extractYearLocal(b.dateOfEventText) ?? 9999;
          return ya - yb;
        })[0]!;
        const toCount = cosubEdgeCount.get(earliest.id) ?? 0;
        if (toCount >= 3) continue;
        addEdge(m.id, earliest.id, "co-subject", 0.45);
        cosubEdgeCount.set(m.id, fromCount + 1);
        cosubEdgeCount.set(earliest.id, toCount + 1);
      }
    }
  }

  if (memories.some((m) => m.placeId)) {
    const byPlace = new Map<string, MemoryLike[]>();
    for (const m of memories) {
      if (!m.placeId) continue;
      const group = byPlace.get(m.placeId) ?? [];
      group.push(m);
      byPlace.set(m.placeId, group);
    }
    const placeEdgeCount = new Map<string, number>();
    for (const [, group] of byPlace) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const fromId = group[i]!.id;
          const toId = group[j]!.id;
          const fromCount = placeEdgeCount.get(fromId) ?? 0;
          const toCount = placeEdgeCount.get(toId) ?? 0;
          if (fromCount >= 2 || toCount >= 2) continue;
          addEdge(fromId, toId, "place", 0.3);
          placeEdgeCount.set(fromId, fromCount + 1);
          placeEdgeCount.set(toId, toCount + 1);
        }
      }
    }
  }

  const outgoingDegree = new Map<string, { strength: number; idx: number }[]>();
  for (let i = 0; i < conns.length; i++) {
    const c = conns[i]!;
    let fromList = outgoingDegree.get(c.from);
    if (!fromList) { fromList = []; outgoingDegree.set(c.from, fromList); }
    fromList.push({ strength: c.strength, idx: i });
    let toList = outgoingDegree.get(c.to);
    if (!toList) { toList = []; outgoingDegree.set(c.to, toList); }
    toList.push({ strength: c.strength, idx: i });
  }

  const toRemove = new Set<number>();
  for (const [, edges] of outgoingDegree) {
    if (edges.length > MAX_OUTGOING_THREADS_PER_PIN) {
      edges.sort((a, b) => a.strength - b.strength);
      for (let i = 0; i < edges.length - MAX_OUTGOING_THREADS_PER_PIN; i++) {
        toRemove.add(edges[i]!.idx);
      }
    }
  }

  if (toRemove.size > 0) {
    return conns.filter((_, i) => !toRemove.has(i));
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

    if (personMemories.length > 0 && personStreak < maxPersonStreak && rng() < 0.6) {
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
    width: Math.max(BOARD_BASE_WIDTH, pinCount * 220),
    height: Math.max(BOARD_BASE_HEIGHT, pinCount * 165),
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

export function getThreadControlPoints(
  from: PinPosition,
  to: PinPosition,
  type: ThreadType,
): BezierControlPoints {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const perpX = -dy;
  const perpY = dx;
  const len = Math.sqrt(perpX * perpX + perpY * perpY) || 1;

  const curvatureMap: Record<ThreadType, number> = {
    temporal: 0.15,
    person: 0.2,
    branch: 0.25,
    era: 0.18,
    "co-subject": 0.22,
    place: 0.2,
  };
  const curvature = curvatureMap[type] ?? 0.2;
  const seed = seedFromString(from.id + to.id);
  const rng = mulberry32(seed);
  const jitter = (rng() - 0.5) * 0.5 + 0.75;

  return {
    cx1: from.x + dx * 0.3 + (perpX / len) * dx * curvature * jitter,
    cy1: from.y + dy * 0.3 + (perpY / len) * dy * curvature * jitter,
    cx2: from.x + dx * 0.7 - (perpX / len) * dx * curvature * jitter,
    cy2: from.y + dy * 0.7 - (perpY / len) * dy * curvature * jitter,
  };
}

export function getThreadPath(
  from: PinPosition,
  to: PinPosition,
  type: ThreadType,
): string {
  const cp = getThreadControlPoints(from, to, type);
  return `M ${from.x} ${from.y} C ${cp.cx1} ${cp.cy1}, ${cp.cx2} ${cp.cy2}, ${to.x} ${to.y}`;
}

export function sampleCubicBezier(
  x0: number, y0: number,
  cx1: number, cy1: number,
  cx2: number, cy2: number,
  x1: number, y1: number,
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * x0 + 3 * uu * t * cx1 + 3 * u * tt * cx2 + ttt * x1,
    y: uuu * y0 + 3 * uu * t * cy1 + 3 * u * tt * cy2 + ttt * y1,
  };
}

export function sampleCameraPath(
  from: PinPosition,
  to: PinPosition,
  type: ThreadType,
  t: number,
): { x: number; y: number } {
  const cp = getThreadControlPoints(from, to, type);
  return sampleCubicBezier(
    from.x, from.y,
    cp.cx1, cp.cy1,
    cp.cx2, cp.cy2,
    to.x, to.y,
    t,
  );
}

export function findThreadBetween(
  threads: ThreadConnection[],
  fromMemId: string,
  toMemId: string,
): ThreadConnection | null {
  return (
    threads.find(
      (t) =>
        (t.from === fromMemId && t.to === toMemId) ||
        (t.from === toMemId && t.to === fromMemId),
    ) ?? null
  );
}
