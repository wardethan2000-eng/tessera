"use client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCanonicalTreeId(treeId: string): boolean {
  return UUID_PATTERN.test(treeId);
}

export function isCanonicalPersonId(personId: string): boolean {
  return UUID_PATTERN.test(personId);
}

export function isCanonicalMemoryId(memoryId: string): boolean {
  return UUID_PATTERN.test(memoryId);
}

export async function resolveCanonicalTreeId(
  apiBase: string,
  routeTreeId: string,
): Promise<string | null> {
  if (isCanonicalTreeId(routeTreeId)) {
    return routeTreeId;
  }

  const index = Number(routeTreeId);
  if (!Number.isInteger(index) || index < 1) {
    return null;
  }

  const response = await fetch(`${apiBase}/api/trees`, {
    credentials: "include",
  });
  if (!response.ok) {
    return null;
  }

  const trees = (await response.json()) as Array<{ id: string }>;
  return trees[index - 1]?.id ?? null;
}

export async function resolveCanonicalPersonId(
  apiBase: string,
  treeId: string,
  routePersonId: string,
): Promise<string | null> {
  if (isCanonicalPersonId(routePersonId)) {
    return routePersonId;
  }

  const index = Number(routePersonId);
  if (!Number.isInteger(index) || index < 1) {
    return null;
  }

  const response = await fetch(`${apiBase}/api/trees/${treeId}/people`, {
    credentials: "include",
  });
  if (!response.ok) {
    return null;
  }

  const people = (await response.json()) as Array<{
    id: string;
    createdAt?: string | null;
  }>;

  const orderedPeople = [...people].sort((left, right) => {
    const leftCreatedAt = left.createdAt ?? "";
    const rightCreatedAt = right.createdAt ?? "";
    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt.localeCompare(rightCreatedAt);
    }
    return left.id.localeCompare(right.id);
  });

  return orderedPeople[index - 1]?.id ?? null;
}
