import { eq } from "drizzle-orm";
import * as schema from "@familytree/database";
import { db } from "./db.js";

type UsageResource = "person" | "media" | "contributor";

type TierLimits = {
  storageBytesMax: number;
  peopleScopeMax: number;
  contributorSeatsMax: number;
};

type CapacityResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      status: number;
      reason: string;
    };

const TREE_TIER_LIMITS: Record<"seedling" | "hearth" | "archive", TierLimits> = {
  seedling: {
    storageBytesMax: 1_073_741_824,
    peopleScopeMax: 25,
    contributorSeatsMax: 2,
  },
  hearth: {
    storageBytesMax: 53_687_091_200,
    peopleScopeMax: 200,
    contributorSeatsMax: 15,
  },
  archive: {
    storageBytesMax: Number.MAX_SAFE_INTEGER,
    peopleScopeMax: -1,
    contributorSeatsMax: -1,
  },
};

async function getTreeCapacityContext(treeId: string) {
  const tree = await db.query.trees.findFirst({
    where: (candidate, { eq }) => eq(candidate.id, treeId),
    columns: {
      id: true,
      tier: true,
      subscriptionStatus: true,
    },
  });

  if (!tree) {
    return null;
  }

  return {
    tree,
    limits: TREE_TIER_LIMITS[tree.tier],
  };
}

async function getTreeScopeCount(treeId: string): Promise<number> {
  const [scopeRows, legacyRows] = await Promise.all([
    db
      .select({ personId: schema.treePersonScope.personId })
      .from(schema.treePersonScope)
      .where(eq(schema.treePersonScope.treeId, treeId)),
    db
      .select({ personId: schema.people.id })
      .from(schema.people)
      .where(eq(schema.people.treeId, treeId)),
  ]);

  return new Set([...scopeRows, ...legacyRows].map((row) => row.personId)).size;
}

async function getTreeStorageUsage(treeId: string): Promise<number> {
  const [contributingMedia, legacyMedia] = await Promise.all([
    db
      .select({
        id: schema.media.id,
        sizeBytes: schema.media.sizeBytes,
      })
      .from(schema.media)
      .where(eq(schema.media.contributingTreeId, treeId)),
    db
      .select({
        id: schema.media.id,
        sizeBytes: schema.media.sizeBytes,
      })
      .from(schema.media)
      .where(eq(schema.media.treeId, treeId)),
  ]);

  const mediaById = new Map<string, number>();
  for (const media of [...contributingMedia, ...legacyMedia]) {
    mediaById.set(media.id, media.sizeBytes);
  }

  return [...mediaById.values()].reduce((total, sizeBytes) => total + sizeBytes, 0);
}

async function getContributorSeatCount(treeId: string): Promise<number> {
  const seats = await db.query.treeMemberships.findMany({
    where: (membership, { and, eq, or }) =>
      and(
        eq(membership.treeId, treeId),
        or(
          eq(membership.role, "founder"),
          eq(membership.role, "steward"),
          eq(membership.role, "contributor"),
        ),
      ),
    columns: {
      userId: true,
    },
  });

  return seats.length;
}

export async function checkTreeCanAdd(
  treeId: string,
  resource: UsageResource,
  additionalBytes = 0,
): Promise<CapacityResult> {
  const context = await getTreeCapacityContext(treeId);
  if (!context) {
    return {
      allowed: false,
      status: 404,
      reason: "Tree not found",
    };
  }

  if (context.tree.subscriptionStatus !== "active") {
    return {
      allowed: false,
      status: 403,
      reason: "This tree is read-only while its subscription is inactive",
    };
  }

  if (resource === "person") {
    if (context.limits.peopleScopeMax === -1) {
      return { allowed: true };
    }

    const scopeCount = await getTreeScopeCount(treeId);
    if (scopeCount >= context.limits.peopleScopeMax) {
      return {
        allowed: false,
        status: 409,
        reason: `This tree has reached its people limit (${context.limits.peopleScopeMax})`,
      };
    }

    return { allowed: true };
  }

  if (resource === "media") {
    const usageBytes = await getTreeStorageUsage(treeId);
    if (usageBytes + additionalBytes > context.limits.storageBytesMax) {
      return {
        allowed: false,
        status: 409,
        reason: "This tree has reached its storage limit",
      };
    }

    return { allowed: true };
  }

  if (resource === "contributor") {
    if (context.limits.contributorSeatsMax === -1) {
      return { allowed: true };
    }

    const contributorSeats = await getContributorSeatCount(treeId);
    if (contributorSeats >= context.limits.contributorSeatsMax) {
      return {
        allowed: false,
        status: 409,
        reason: `This tree has reached its contributor seat limit (${context.limits.contributorSeatsMax})`,
      };
    }

    return { allowed: true };
  }

  const _exhaustiveCheck: never = resource;
  return {
    allowed: false,
    status: 400,
    reason: `Unknown resource type: ${_exhaustiveCheck}`,
  };
}
