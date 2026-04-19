import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ──────────────────────────────────────────────────────────────────────

export const membershipRoleEnum = pgEnum("membership_role", [
  "founder",
  "steward",
  "contributor",
  "viewer",
]);

export const relationshipTypeEnum = pgEnum("relationship_type", [
  "parent_child",
  "sibling",
  "spouse",
]);

export const spouseStatusEnum = pgEnum("spouse_status", [
  "active",
  "former",
  "deceased_partner",
]);

export const memoryKindEnum = pgEnum("memory_kind", [
  "story",
  "photo",
  "voice",
  "document",
  "other",
]);

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

export const exportStatusEnum = pgEnum("export_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);

export const promptStatusEnum = pgEnum("prompt_status", [
  "pending",
  "answered",
  "dismissed",
]);

export const transcriptionStatusEnum = pgEnum("transcription_status", [
  "none",
  "queued",
  "processing",
  "completed",
  "failed",
]);

export const transcriptionJobStatusEnum = pgEnum("transcription_job_status", [
  "queued",
  "processing",
  "completed",
  "failed",
]);

export const promptReplyLinkStatusEnum = pgEnum("prompt_reply_link_status", [
  "pending",
  "used",
  "revoked",
  "expired",
]);

export const treeConnectionStatusEnum = pgEnum("tree_connection_status", [
  "pending",
  "active",
  "ended",
]);

// ── Better Auth core tables ────────────────────────────────────────────────────
// These tables are managed by Better Auth. IDs are text (Better Auth generates
// its own IDs). Domain tables that reference users also use text FKs.

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_unique_idx").on(table.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("sessions_token_unique_idx").on(table.token)],
);

// Better Auth's credential/provider store (maps to Better Auth's "account" model)
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("accounts_user_idx").on(table.userId)],
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// ── Domain tables ──────────────────────────────────────────────────────────────

export const trees = pgTable(
  "trees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    founderUserId: text("founder_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("trees_founder_user_idx").on(table.founderUserId)],
);

export const treeMemberships = pgTable(
  "tree_memberships",
  {
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    invitedByUserId: text("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.treeId, table.userId] }),
    index("tree_memberships_user_idx").on(table.userId),
    index("tree_memberships_invited_by_idx").on(table.invitedByUserId),
  ],
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    uploadedByUserId: text("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    storageProvider: varchar("storage_provider", { length: 40 }).default("minio").notNull(),
    objectKey: text("object_key").notNull(),
    originalFilename: text("original_filename"),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksum: varchar("checksum", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("media_object_key_unique_idx").on(table.objectKey),
    index("media_tree_idx").on(table.treeId),
    index("media_uploaded_by_idx").on(table.uploadedByUserId),
  ],
);

export const places = pgTable(
  "places",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 200 }).notNull(),
    normalizedLabel: varchar("normalized_label", { length: 200 }).notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    countryCode: varchar("country_code", { length: 2 }),
    adminRegion: varchar("admin_region", { length: 120 }),
    locality: varchar("locality", { length: 120 }),
    geocodeProvider: varchar("geocode_provider", { length: 40 }).default("manual").notNull(),
    geocodeConfidence: integer("geocode_confidence"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("places_tree_normalized_label_unique_idx").on(
      table.treeId,
      table.normalizedLabel,
    ),
    index("places_tree_idx").on(table.treeId),
    index("places_created_by_idx").on(table.createdByUserId),
  ],
);

export const people = pgTable(
  "people",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    alsoKnownAs: text("also_known_as").array().default([]).notNull(),
    essenceLine: varchar("essence_line", { length: 255 }),
    birthDateText: varchar("birth_date_text", { length: 100 }),
    deathDateText: varchar("death_date_text", { length: 100 }),
    birthPlace: varchar("birth_place", { length: 200 }),
    deathPlace: varchar("death_place", { length: 200 }),
    birthPlaceId: uuid("birth_place_id").references(() => places.id, {
      onDelete: "set null",
    }),
    deathPlaceId: uuid("death_place_id").references(() => places.id, {
      onDelete: "set null",
    }),
    isLiving: boolean("is_living").default(true).notNull(),
    portraitMediaId: uuid("portrait_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    linkedUserId: text("linked_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("people_tree_idx").on(table.treeId),
    index("people_linked_user_idx").on(table.linkedUserId),
    index("people_portrait_media_idx").on(table.portraitMediaId),
    index("people_birth_place_idx").on(table.birthPlaceId),
    index("people_death_place_idx").on(table.deathPlaceId),
  ],
);

export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    fromPersonId: uuid("from_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    toPersonId: uuid("to_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    type: relationshipTypeEnum("type").notNull(),
    normalizedPersonAId: uuid("normalized_person_a_id").references(() => people.id, {
      onDelete: "cascade",
    }),
    normalizedPersonBId: uuid("normalized_person_b_id").references(() => people.id, {
      onDelete: "cascade",
    }),
    spouseStatus: spouseStatusEnum("spouse_status"),
    startDateText: varchar("start_date_text", { length: 100 }),
    endDateText: varchar("end_date_text", { length: 100 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("relationships_unique_pair_idx").on(
      table.treeId,
      table.type,
      table.fromPersonId,
      table.toPersonId,
    ),
    uniqueIndex("relationships_unique_normalized_pair_idx").on(
      table.treeId,
      table.type,
      table.normalizedPersonAId,
      table.normalizedPersonBId,
    ),
    index("relationships_tree_idx").on(table.treeId),
    index("relationships_from_person_idx").on(table.fromPersonId),
    index("relationships_to_person_idx").on(table.toPersonId),
    index("relationships_normalized_person_a_idx").on(table.normalizedPersonAId),
    index("relationships_normalized_person_b_idx").on(table.normalizedPersonBId),
    index("relationships_spouse_status_idx").on(table.spouseStatus),
  ],
);

export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    toPersonId: uuid("to_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    questionText: text("question_text").notNull(),
    status: promptStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("prompts_tree_idx").on(table.treeId),
    index("prompts_from_user_idx").on(table.fromUserId),
    index("prompts_to_person_idx").on(table.toPersonId),
    index("prompts_status_idx").on(table.status),
  ],
);

export const promptReplyLinks = pgTable(
  "prompt_reply_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    tokenHash: text("token_hash").notNull(),
    status: promptReplyLinkStatusEnum("status").default("pending").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("prompt_reply_links_tree_idx").on(table.treeId),
    index("prompt_reply_links_prompt_idx").on(table.promptId),
    index("prompt_reply_links_email_idx").on(table.email),
    index("prompt_reply_links_status_idx").on(table.status),
    uniqueIndex("prompt_reply_links_token_hash_unique_idx").on(table.tokenHash),
  ],
);

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    primaryPersonId: uuid("primary_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    contributorUserId: text("contributor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    promptId: uuid("prompt_id").references(() => prompts.id, { onDelete: "set null" }),
    kind: memoryKindEnum("kind").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    dateOfEventText: varchar("date_of_event_text", { length: 100 }),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "set null" }),
    placeLabelOverride: varchar("place_label_override", { length: 200 }),
    transcriptText: text("transcript_text"),
    transcriptLanguage: varchar("transcript_language", { length: 32 }),
    transcriptStatus: transcriptionStatusEnum("transcript_status")
      .default("none")
      .notNull(),
    transcriptError: text("transcript_error"),
    transcriptUpdatedAt: timestamp("transcript_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("memories_tree_idx").on(table.treeId),
    index("memories_primary_person_idx").on(table.primaryPersonId),
    index("memories_contributor_idx").on(table.contributorUserId),
    index("memories_media_idx").on(table.mediaId),
    index("memories_place_idx").on(table.placeId),
    index("memories_transcript_status_idx").on(table.transcriptStatus),
  ],
);

export const transcriptionJobs = pgTable(
  "transcription_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    status: transcriptionJobStatusEnum("status").default("queued").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    runAfter: timestamp("run_after", { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("transcription_jobs_memory_unique_idx").on(table.memoryId),
    index("transcription_jobs_tree_idx").on(table.treeId),
    index("transcription_jobs_status_run_after_idx").on(table.status, table.runAfter),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    email: varchar("email", { length: 320 }).notNull(),
    proposedRole: membershipRoleEnum("proposed_role").notNull(),
    linkedPersonId: uuid("linked_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    tokenHash: text("token_hash").notNull(),
    status: invitationStatusEnum("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("invitations_tree_idx").on(table.treeId),
    index("invitations_email_idx").on(table.email),
    uniqueIndex("invitations_token_hash_unique_idx").on(table.tokenHash),
  ],
);

export const archiveExports = pgTable(
  "archive_exports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: exportStatusEnum("status").default("queued").notNull(),
    storagePath: text("storage_path"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("archive_exports_tree_idx").on(table.treeId),
    index("archive_exports_requested_by_idx").on(table.requestedByUserId),
  ],
);

/**
 * A bilateral connection between two family trees (e.g. in-law relationship).
 * treeAId is always the lexicographically smaller UUID to prevent duplicates.
 * Enforced in application code; a CHECK constraint mirrors this in the DB.
 */
export const treeConnections = pgTable(
  "tree_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeAId: uuid("tree_a_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    treeBId: uuid("tree_b_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    status: treeConnectionStatusEnum("status").default("pending").notNull(),
    initiatedByUserId: text("initiated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    initiatedByTreeId: uuid("initiated_by_tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tree_connections_pair_unique_idx").on(table.treeAId, table.treeBId),
    index("tree_connections_tree_a_idx").on(table.treeAId),
    index("tree_connections_tree_b_idx").on(table.treeBId),
    index("tree_connections_status_idx").on(table.status),
    index("tree_connections_initiated_by_user_idx").on(table.initiatedByUserId),
  ],
);

/**
 * Identifies that a person in tree A and a person in tree B are the same real person,
 * within the context of a tree connection (e.g. an in-law who has their own family tree).
 */
export const crossTreePersonLinks = pgTable(
  "cross_tree_person_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => treeConnections.id, { onDelete: "cascade" }),
    personAId: uuid("person_a_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    personBId: uuid("person_b_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    linkedByUserId: text("linked_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Each person in tree A can only be linked once per connection
    uniqueIndex("cross_tree_person_links_person_a_conn_unique_idx").on(
      table.connectionId,
      table.personAId,
    ),
    // Each person in tree B can only be linked once per connection
    uniqueIndex("cross_tree_person_links_person_b_conn_unique_idx").on(
      table.connectionId,
      table.personBId,
    ),
    index("cross_tree_person_links_connection_idx").on(table.connectionId),
    index("cross_tree_person_links_person_a_idx").on(table.personAId),
    index("cross_tree_person_links_person_b_idx").on(table.personBId),
  ],
);

// ── Relations ──────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  authAccounts: many(accounts),
  treesFounded: many(trees),
  memberships: many(treeMemberships),
  uploadedMedia: many(media),
  linkedPeople: many(people),
  memories: many(memories),
  invitationsSent: many(invitations),
  archiveExportsRequested: many(archiveExports),
  promptsSent: many(prompts),
  promptReplyLinksCreated: many(promptReplyLinks),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const treesRelations = relations(trees, ({ one, many }) => ({
  founder: one(users, {
    fields: [trees.founderUserId],
    references: [users.id],
  }),
  memberships: many(treeMemberships),
  mediaItems: many(media),
  places: many(places),
  people: many(people),
  relationships: many(relationships),
  memories: many(memories),
  invitations: many(invitations),
  archiveExports: many(archiveExports),
  prompts: many(prompts),
  promptReplyLinks: many(promptReplyLinks),
  transcriptionJobs: many(transcriptionJobs),
  treeConnectionsAsA: many(treeConnections, { relationName: "tree_connection_a" }),
  treeConnectionsAsB: many(treeConnections, { relationName: "tree_connection_b" }),
  treeConnectionsAsInitiator: many(treeConnections, { relationName: "tree_connection_initiator" }),
}));

export const treeMembershipsRelations = relations(treeMemberships, ({ one }) => ({
  tree: one(trees, { fields: [treeMemberships.treeId], references: [trees.id] }),
  user: one(users, { fields: [treeMemberships.userId], references: [users.id] }),
  invitedBy: one(users, {
    fields: [treeMemberships.invitedByUserId],
    references: [users.id],
  }),
}));

export const mediaRelations = relations(media, ({ one, many }) => ({
  tree: one(trees, { fields: [media.treeId], references: [trees.id] }),
  uploadedBy: one(users, {
    fields: [media.uploadedByUserId],
    references: [users.id],
  }),
  portraitForPeople: many(people),
  memories: many(memories),
}));

export const placesRelations = relations(places, ({ one, many }) => ({
  tree: one(trees, { fields: [places.treeId], references: [trees.id] }),
  createdBy: one(users, {
    fields: [places.createdByUserId],
    references: [users.id],
  }),
  birthForPeople: many(people, { relationName: "person_birth_place" }),
  deathForPeople: many(people, { relationName: "person_death_place" }),
  memories: many(memories),
}));

export const peopleRelations = relations(people, ({ one, many }) => ({
  tree: one(trees, { fields: [people.treeId], references: [trees.id] }),
  birthPlaceRef: one(places, {
    fields: [people.birthPlaceId],
    references: [places.id],
    relationName: "person_birth_place",
  }),
  deathPlaceRef: one(places, {
    fields: [people.deathPlaceId],
    references: [places.id],
    relationName: "person_death_place",
  }),
  portraitMedia: one(media, {
    fields: [people.portraitMediaId],
    references: [media.id],
  }),
  linkedUser: one(users, {
    fields: [people.linkedUserId],
    references: [users.id],
  }),
  outgoingRelationships: many(relationships, {
    relationName: "relationship_from_person",
  }),
  incomingRelationships: many(relationships, {
    relationName: "relationship_to_person",
  }),
  memories: many(memories),
  invitations: many(invitations),
  promptsReceived: many(prompts),
  crossTreeLinksAsA: many(crossTreePersonLinks, { relationName: "cross_tree_link_person_a" }),
  crossTreeLinksAsB: many(crossTreePersonLinks, { relationName: "cross_tree_link_person_b" }),
}));

export const relationshipsRelations = relations(relationships, ({ one }) => ({
  tree: one(trees, { fields: [relationships.treeId], references: [trees.id] }),
  fromPerson: one(people, {
    fields: [relationships.fromPersonId],
    references: [people.id],
    relationName: "relationship_from_person",
  }),
  toPerson: one(people, {
    fields: [relationships.toPersonId],
    references: [people.id],
    relationName: "relationship_to_person",
  }),
}));

export const memoriesRelations = relations(memories, ({ one }) => ({
  tree: one(trees, { fields: [memories.treeId], references: [trees.id] }),
  primaryPerson: one(people, {
    fields: [memories.primaryPersonId],
    references: [people.id],
  }),
  contributor: one(users, {
    fields: [memories.contributorUserId],
    references: [users.id],
  }),
  media: one(media, { fields: [memories.mediaId], references: [media.id] }),
  place: one(places, { fields: [memories.placeId], references: [places.id] }),
  prompt: one(prompts, { fields: [memories.promptId], references: [prompts.id] }),
}));

export const promptsRelations = relations(prompts, ({ one, many }) => ({
  tree: one(trees, { fields: [prompts.treeId], references: [trees.id] }),
  fromUser: one(users, { fields: [prompts.fromUserId], references: [users.id] }),
  toPerson: one(people, { fields: [prompts.toPersonId], references: [people.id] }),
  replies: many(memories),
  replyLinks: many(promptReplyLinks),
}));

export const promptReplyLinksRelations = relations(promptReplyLinks, ({ one }) => ({
  tree: one(trees, { fields: [promptReplyLinks.treeId], references: [trees.id] }),
  prompt: one(prompts, {
    fields: [promptReplyLinks.promptId],
    references: [prompts.id],
  }),
  createdBy: one(users, {
    fields: [promptReplyLinks.createdByUserId],
    references: [users.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  tree: one(trees, { fields: [invitations.treeId], references: [trees.id] }),
  invitedBy: one(users, {
    fields: [invitations.invitedByUserId],
    references: [users.id],
  }),
  linkedPerson: one(people, {
    fields: [invitations.linkedPersonId],
    references: [people.id],
  }),
}));

export const archiveExportsRelations = relations(archiveExports, ({ one }) => ({
  tree: one(trees, { fields: [archiveExports.treeId], references: [trees.id] }),
  requestedBy: one(users, {
    fields: [archiveExports.requestedByUserId],
    references: [users.id],
  }),
}));

export const transcriptionJobsRelations = relations(
  transcriptionJobs,
  ({ one }) => ({
    tree: one(trees, { fields: [transcriptionJobs.treeId], references: [trees.id] }),
    memory: one(memories, {
      fields: [transcriptionJobs.memoryId],
      references: [memories.id],
    }),
  }),
);

export const treeConnectionsRelations = relations(treeConnections, ({ one, many }) => ({
  treeA: one(trees, {
    fields: [treeConnections.treeAId],
    references: [trees.id],
    relationName: "tree_connection_a",
  }),
  treeB: one(trees, {
    fields: [treeConnections.treeBId],
    references: [trees.id],
    relationName: "tree_connection_b",
  }),
  initiatedByUser: one(users, {
    fields: [treeConnections.initiatedByUserId],
    references: [users.id],
  }),
  initiatedByTree: one(trees, {
    fields: [treeConnections.initiatedByTreeId],
    references: [trees.id],
    relationName: "tree_connection_initiator",
  }),
  personLinks: many(crossTreePersonLinks),
}));

export const crossTreePersonLinksRelations = relations(crossTreePersonLinks, ({ one }) => ({
  connection: one(treeConnections, {
    fields: [crossTreePersonLinks.connectionId],
    references: [treeConnections.id],
  }),
  personA: one(people, {
    fields: [crossTreePersonLinks.personAId],
    references: [people.id],
    relationName: "cross_tree_link_person_a",
  }),
  personB: one(people, {
    fields: [crossTreePersonLinks.personBId],
    references: [people.id],
    relationName: "cross_tree_link_person_b",
  }),
  linkedBy: one(users, {
    fields: [crossTreePersonLinks.linkedByUserId],
    references: [users.id],
  }),
}));
