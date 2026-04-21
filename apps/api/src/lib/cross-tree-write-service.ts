import { and, eq } from "drizzle-orm";
import * as schema from "@familytree/database";
import { db } from "./db.js";

type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

type CreateScopedPersonInput = {
  treeId: string;
  addedByUserId: string | null;
  displayName: string;
  alsoKnownAs: string[];
  essenceLine?: string;
  birthDateText?: string;
  deathDateText?: string;
  birthPlace?: string;
  deathPlace?: string;
  birthPlaceId?: string;
  deathPlaceId?: string;
  isLiving: boolean;
  linkedUserId?: string;
};

type CreateTaggedMemoryInput = {
  treeId: string;
  primaryPersonId: string;
  contributorUserId: string;
  kind: "story" | "photo" | "voice" | "document" | "other";
  title: string;
  body?: string | null;
  mediaId?: string | null;
  mediaIds?: string[];
  linkedMedia?: {
    provider: "google_drive";
    providerItemId: string;
    sourceUrl: string;
    openUrl: string;
    previewUrl: string;
    label?: string | null;
  } | null;
  promptId?: string | null;
  dateOfEventText?: string | null;
  placeId?: string | null;
  placeLabelOverride?: string | null;
  taggedPersonIds?: string[];
  reachRules?: Array<{
    kind: "immediate_family" | "ancestors" | "descendants" | "whole_tree";
    seedPersonId?: string | null;
    scopeTreeId?: string | null;
  }>;
};

type AddPersonToTreeScopeInput = {
  treeId: string;
  personId: string;
  addedByUserId: string | null;
  tx?: TxClient;
};

type UpdatePersonTreeScopeInput = {
  treeId: string;
  personId: string;
  addedByUserId: string | null;
  displayNameOverride?: string | null;
  visibilityDefault?: "all_members" | "family_circle" | "named_circle";
};

export async function createPersonWithScope(input: CreateScopedPersonInput) {
  return db.transaction(async (tx) => {
    const [person] = await tx
      .insert(schema.people)
      .values({
        treeId: input.treeId,
        homeTreeId: input.treeId,
        displayName: input.displayName,
        alsoKnownAs: input.alsoKnownAs,
        essenceLine: input.essenceLine,
        birthDateText: input.birthDateText,
        deathDateText: input.deathDateText,
        birthPlace: input.birthPlace,
        deathPlace: input.deathPlace,
        birthPlaceId: input.birthPlaceId,
        deathPlaceId: input.deathPlaceId,
        isLiving: input.isLiving,
        linkedUserId: input.linkedUserId,
      })
      .returning();

    if (!person) {
      throw new Error("Failed to create person");
    }

    await tx.insert(schema.treePersonScope).values({
      treeId: input.treeId,
      personId: person.id,
      addedByUserId: input.addedByUserId,
    });

    return person;
  });
}

export async function addPersonToTreeScope(input: AddPersonToTreeScopeInput) {
  const run = async (tx: TxClient) => {
    const person = await tx.query.people.findFirst({
      where: (candidate, { eq }) => eq(candidate.id, input.personId),
      columns: {
        id: true,
      },
    });

    if (!person) {
      return null;
    }

    await tx
      .insert(schema.treePersonScope)
      .values({
        treeId: input.treeId,
        personId: input.personId,
        addedByUserId: input.addedByUserId,
      })
      .onConflictDoNothing();

    return person;
  };

  if (input.tx) {
    return run(input.tx);
  }

  return db.transaction(run);
}

export async function upsertPersonTreeScope(input: UpdatePersonTreeScopeInput) {
  return db.transaction(async (tx) => {
    const person = await tx.query.people.findFirst({
      where: (candidate, { eq }) => eq(candidate.id, input.personId),
      columns: {
        id: true,
      },
    });

    if (!person) {
      return null;
    }

    await tx
      .insert(schema.treePersonScope)
      .values({
        treeId: input.treeId,
        personId: input.personId,
        addedByUserId: input.addedByUserId,
      })
      .onConflictDoNothing();

    const updates: {
      displayNameOverride?: string | null;
      visibilityDefault?: "all_members" | "family_circle" | "named_circle";
    } = {};

    if (input.displayNameOverride !== undefined) {
      updates.displayNameOverride = input.displayNameOverride;
    }
    if (input.visibilityDefault !== undefined) {
      updates.visibilityDefault = input.visibilityDefault;
    }

    if (Object.keys(updates).length > 0) {
      await tx
        .update(schema.treePersonScope)
        .set(updates)
        .where(
          and(
            eq(schema.treePersonScope.treeId, input.treeId),
            eq(schema.treePersonScope.personId, input.personId),
          ),
        );
    }

    return person;
  });
}

export async function createMemoryWithPrimaryTag(
  tx: TxClient,
  input: CreateTaggedMemoryInput,
) {
  const [memory] = await tx
    .insert(schema.memories)
    .values({
      treeId: input.treeId,
      contributingTreeId: input.treeId,
      primaryPersonId: input.primaryPersonId,
      contributorUserId: input.contributorUserId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      mediaId: input.mediaId ?? input.mediaIds?.[0] ?? null,
      linkedMediaProvider: input.linkedMedia?.provider ?? null,
      linkedMediaProviderItemId: input.linkedMedia?.providerItemId ?? null,
      linkedMediaSourceUrl: input.linkedMedia?.sourceUrl ?? null,
      linkedMediaOpenUrl: input.linkedMedia?.openUrl ?? null,
      linkedMediaPreviewUrl: input.linkedMedia?.previewUrl ?? null,
      linkedMediaLabel: input.linkedMedia?.label ?? null,
      promptId: input.promptId ?? null,
      dateOfEventText: input.dateOfEventText ?? null,
      placeId: input.placeId ?? null,
      placeLabelOverride: input.placeLabelOverride ?? null,
    })
    .returning();

  if (!memory) {
    throw new Error("Failed to create memory");
  }

  const uniqueMediaIds = [...new Set(input.mediaIds ?? (input.mediaId ? [input.mediaId] : []))];
  if (uniqueMediaIds.length > 0) {
    await tx.insert(schema.memoryMedia).values(
      uniqueMediaIds.map((mediaId, index) => ({
        memoryId: memory.id,
        mediaId,
        sortOrder: index,
      })),
    );
  } else if (input.linkedMedia) {
    await tx.insert(schema.memoryMedia).values({
      memoryId: memory.id,
      linkedMediaProvider: input.linkedMedia.provider,
      linkedMediaProviderItemId: input.linkedMedia.providerItemId,
      linkedMediaSourceUrl: input.linkedMedia.sourceUrl,
      linkedMediaOpenUrl: input.linkedMedia.openUrl,
      linkedMediaPreviewUrl: input.linkedMedia.previewUrl,
      linkedMediaLabel: input.linkedMedia.label ?? null,
      sortOrder: 0,
    });
  }

  const taggedPersonIds = [
    input.primaryPersonId,
    ...(input.taggedPersonIds ?? []),
  ].filter((personId, index, allIds) => allIds.indexOf(personId) === index);

  if (taggedPersonIds.length > 0) {
    await tx.insert(schema.memoryPersonTags).values(
      taggedPersonIds.map((personId) => ({
        memoryId: memory.id,
        personId,
      })),
    );
  }

  if ((input.reachRules?.length ?? 0) > 0) {
    await tx.insert(schema.memoryReachRules).values(
      input.reachRules!.map((rule) => ({
        memoryId: memory.id,
        kind: rule.kind,
        seedPersonId: rule.seedPersonId ?? null,
        scopeTreeId: rule.scopeTreeId ?? null,
        createdByUserId: input.contributorUserId,
      })),
    );
  }

  return memory;
}
