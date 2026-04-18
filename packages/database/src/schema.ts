import {
  bigint,
  boolean,
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
    index("relationships_tree_idx").on(table.treeId),
    index("relationships_from_person_idx").on(table.fromPersonId),
    index("relationships_to_person_idx").on(table.toPersonId),
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
    kind: memoryKindEnum("kind").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    dateOfEventText: varchar("date_of_event_text", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("memories_tree_idx").on(table.treeId),
    index("memories_primary_person_idx").on(table.primaryPersonId),
    index("memories_contributor_idx").on(table.contributorUserId),
    index("memories_media_idx").on(table.mediaId),
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
  people: many(people),
  relationships: many(relationships),
  memories: many(memories),
  invitations: many(invitations),
  archiveExports: many(archiveExports),
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

export const peopleRelations = relations(people, ({ one, many }) => ({
  tree: one(trees, { fields: [people.treeId], references: [trees.id] }),
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
