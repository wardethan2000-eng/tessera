import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
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

export const linkedMediaProviderEnum = pgEnum("linked_media_provider", [
  "google_drive",
]);

export const memoryReachKindEnum = pgEnum("memory_reach_kind", [
  "immediate_family",
  "ancestors",
  "descendants",
  "whole_tree",
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

export const promptCampaignStatusEnum = pgEnum("prompt_campaign_status", [
  "active",
  "paused",
  "completed",
]);

export const treeScopeVisibilityEnum = pgEnum("tree_scope_visibility", [
  "all_members",
  "family_circle",
  "named_circle",
]);

export const memoryVisibilityOverrideEnum = pgEnum("memory_visibility_override", [
  "all_members",
  "family_circle",
  "named_circle",
  "hidden",
]);

export const treeSubscriptionTierEnum = pgEnum("tree_subscription_tier", [
  "seedling",
  "hearth",
  "archive",
]);

export const treeSubscriptionStatusEnum = pgEnum("tree_subscription_status", [
  "active",
  "grace_period",
  "dormant",
  "cancelled",
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

export const deletedUsers = pgTable(
  "deleted_users",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    email: text("email"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).defaultNow().notNull(),
  },
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

export const userNotificationPreferences = pgTable(
  "user_notification_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    invitationsEmail: boolean("invitations_email").default(true).notNull(),
    promptsEmail: boolean("prompts_email").default(true).notNull(),
    systemEmail: boolean("system_email").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

// ── Domain tables ──────────────────────────────────────────────────────────────

export const trees = pgTable(
  "trees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    founderUserId: text("founder_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    tier: treeSubscriptionTierEnum("tier").default("seedling").notNull(),
    subscriptionStatus: treeSubscriptionStatusEnum("subscription_status")
      .default("active")
      .notNull(),
    subscriptionExpiresAt: timestamp("subscription_expires_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("trees_founder_user_idx").on(table.founderUserId),
    index("trees_tier_idx").on(table.tier),
    index("trees_subscription_status_idx").on(table.subscriptionStatus),
  ],
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
    // Transitional column for cross-tree billing attribution. Keep nullable until
    // the API writes it and legacy tree_id usage is retired.
    contributingTreeId: uuid("contributing_tree_id").references(() => trees.id, {
      onDelete: "set null",
    }),
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
    index("media_contributing_tree_idx").on(table.contributingTreeId),
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
    homeTreeId: uuid("home_tree_id").references(() => trees.id, {
      onDelete: "set null",
    }),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    firstName: varchar("first_name", { length: 200 }),
    lastName: varchar("last_name", { length: 200 }),
    maidenName: varchar("maiden_name", { length: 200 }),
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
    index("people_home_tree_idx").on(table.homeTreeId),
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
    createdInTreeId: uuid("created_in_tree_id").references(() => trees.id, {
      onDelete: "set null",
    }),
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
    index("relationships_created_in_tree_idx").on(table.createdInTreeId),
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
      .references(() => users.id, { onDelete: "set null" }),
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

export const promptCampaigns = pgTable(
  "prompt_campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    toPersonId: uuid("to_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    cadenceDays: integer("cadence_days").default(7).notNull(),
    status: promptCampaignStatusEnum("status").default("active").notNull(),
    nextSendAt: timestamp("next_send_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("prompt_campaigns_tree_idx").on(table.treeId),
    index("prompt_campaigns_status_idx").on(table.status),
    index("prompt_campaigns_next_send_idx").on(table.nextSendAt),
  ],
);

export const promptCampaignQuestions = pgTable(
  "prompt_campaign_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => promptCampaigns.id, { onDelete: "cascade" }),
    questionText: text("question_text").notNull(),
    position: integer("position").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentPromptId: uuid("sent_prompt_id").references(() => prompts.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("prompt_campaign_questions_campaign_idx").on(table.campaignId),
    index("prompt_campaign_questions_position_idx").on(
      table.campaignId,
      table.position,
    ),
  ],
);

export const promptCampaignRecipients = pgTable(
  "prompt_campaign_recipients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => promptCampaigns.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("prompt_campaign_recipients_campaign_idx").on(table.campaignId),
  ],
);

export const elderCaptureTokens = pgTable(
  "elder_capture_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    tokenHash: text("token_hash").notNull(),
    displayName: varchar("display_name", { length: 200 }),
    associatedPersonId: uuid("associated_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    familyLabel: varchar("family_label", { length: 200 }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastUsedUserAgent: text("last_used_user_agent"),
    lastStandaloneAt: timestamp("last_standalone_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("elder_capture_tokens_tree_idx").on(table.treeId),
    index("elder_capture_tokens_tree_email_idx").on(table.treeId, table.email),
    uniqueIndex("elder_capture_tokens_token_hash_unique_idx").on(
      table.tokenHash,
    ),
  ],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    label: varchar("label", { length: 200 }).notNull(),
    sourceKind: varchar("source_kind", { length: 40 })
      .default("multi_file_upload")
      .notNull(),
    status: varchar("status", { length: 40 }).default("uploading").notNull(),
    totalItems: integer("total_items").default(0).notNull(),
    processedItems: integer("processed_items").default(0).notNull(),
    failedItems: integer("failed_items").default(0).notNull(),
    defaultPersonId: uuid("default_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("import_batches_tree_idx").on(table.treeId),
    index("import_batches_created_by_idx").on(table.createdByUserId),
    index("import_batches_status_idx").on(table.status),
    index("import_batches_default_person_idx").on(table.defaultPersonId),
  ],
);

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    // Transitional column for cross-tree attribution. Keep nullable until write
    // paths are migrated away from tree_id.
    contributingTreeId: uuid("contributing_tree_id").references(() => trees.id, {
      onDelete: "set null",
    }),
    primaryPersonId: uuid("primary_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    contributorUserId: text("contributor_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    linkedMediaProvider: linkedMediaProviderEnum("linked_media_provider"),
    linkedMediaProviderItemId: varchar("linked_media_provider_item_id", {
      length: 255,
    }),
    linkedMediaSourceUrl: text("linked_media_source_url"),
    linkedMediaOpenUrl: text("linked_media_open_url"),
    linkedMediaPreviewUrl: text("linked_media_preview_url"),
    linkedMediaLabel: varchar("linked_media_label", { length: 255 }),
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
    index("memories_contributing_tree_idx").on(table.contributingTreeId),
    index("memories_primary_person_idx").on(table.primaryPersonId),
    index("memories_contributor_idx").on(table.contributorUserId),
    index("memories_media_idx").on(table.mediaId),
    index("memories_linked_media_provider_idx").on(table.linkedMediaProvider),
    index("memories_linked_media_item_idx").on(table.linkedMediaProviderItemId),
    index("memories_place_idx").on(table.placeId),
    index("memories_transcript_status_idx").on(table.transcriptStatus),
  ],
);

export const importBatchItems = pgTable(
  "import_batch_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    memoryId: uuid("memory_id").references(() => memories.id, {
      onDelete: "set null",
    }),
    originalFilename: text("original_filename").notNull(),
    detectedMimeType: varchar("detected_mime_type", { length: 255 }),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    checksum: varchar("checksum", { length: 128 }),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    status: varchar("status", { length: 40 }).default("uploaded").notNull(),
    reviewState: varchar("review_state", { length: 40 })
      .default("needs_review")
      .notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("import_batch_items_batch_idx").on(table.batchId),
    index("import_batch_items_tree_idx").on(table.treeId),
    index("import_batch_items_media_idx").on(table.mediaId),
    index("import_batch_items_memory_idx").on(table.memoryId),
    index("import_batch_items_status_idx").on(table.status),
    index("import_batch_items_review_state_idx").on(table.reviewState),
  ],
);

export const treePersonScope = pgTable(
  "tree_person_scope",
  {
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    displayNameOverride: varchar("display_name_override", { length: 200 }),
    visibilityDefault: treeScopeVisibilityEnum("visibility_default")
      .default("all_members")
      .notNull(),
    addedByUserId: text("added_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.treeId, table.personId] }),
    index("tree_person_scope_person_idx").on(table.personId),
    index("tree_person_scope_tree_idx").on(table.treeId),
    index("tree_person_scope_added_by_idx").on(table.addedByUserId),
  ],
);

export const treeRelationshipVisibility = pgTable(
  "tree_relationship_visibility",
  {
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    isVisible: boolean("is_visible").default(true).notNull(),
    notes: text("notes"),
  },
  (table) => [
    primaryKey({ columns: [table.treeId, table.relationshipId] }),
    index("tree_rel_vis_tree_idx").on(table.treeId),
    index("tree_rel_vis_relationship_idx").on(table.relationshipId),
  ],
);

export const memoryPersonTags = pgTable(
  "memory_person_tags",
  {
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.memoryId, table.personId] }),
    index("memory_person_tags_person_idx").on(table.personId),
  ],
);

export const memoryReachRules = pgTable(
  "memory_reach_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    kind: memoryReachKindEnum("kind").notNull(),
    seedPersonId: uuid("seed_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    scopeTreeId: uuid("scope_tree_id").references(() => trees.id, {
      onDelete: "set null",
    }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("memory_reach_rules_memory_idx").on(table.memoryId),
    index("memory_reach_rules_seed_person_idx").on(table.seedPersonId),
    index("memory_reach_rules_scope_tree_idx").on(table.scopeTreeId),
    index("memory_reach_rules_created_by_idx").on(table.createdByUserId),
    index("memory_reach_rules_kind_idx").on(table.kind),
  ],
);

export const memoryMedia = pgTable(
  "memory_media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    linkedMediaProvider: linkedMediaProviderEnum("linked_media_provider"),
    linkedMediaProviderItemId: varchar("linked_media_provider_item_id", {
      length: 255,
    }),
    linkedMediaSourceUrl: text("linked_media_source_url"),
    linkedMediaOpenUrl: text("linked_media_open_url"),
    linkedMediaPreviewUrl: text("linked_media_preview_url"),
    linkedMediaLabel: varchar("linked_media_label", { length: 255 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("memory_media_memory_idx").on(table.memoryId),
    index("memory_media_media_idx").on(table.mediaId),
    index("memory_media_memory_sort_idx").on(table.memoryId, table.sortOrder),
  ],
);

export const memoryPerspectives = pgTable(
  "memory_perspectives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    contributorUserId: text("contributor_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    contributorPersonId: uuid("contributor_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    body: text("body"),
    mediaId: uuid("media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("memory_perspectives_memory_idx").on(table.memoryId),
    index("memory_perspectives_tree_idx").on(table.treeId),
    index("memory_perspectives_contributor_idx").on(table.contributorUserId),
    index("memory_perspectives_person_idx").on(table.contributorPersonId),
    index("memory_perspectives_media_idx").on(table.mediaId),
    index("memory_perspectives_memory_created_idx").on(table.memoryId, table.createdAt),
  ],
);

export const personMemoryCuration = pgTable(
  "person_memory_curation",
  {
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    isFeatured: boolean("is_featured").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.treeId, table.personId, table.memoryId] }),
    index("person_memory_curation_person_idx").on(table.treeId, table.personId),
    index("person_memory_curation_memory_idx").on(table.memoryId),
    index("person_memory_curation_updated_by_idx").on(table.updatedByUserId),
  ],
);

export const memoryTreeVisibility = pgTable(
  "memory_tree_visibility",
  {
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    visibilityOverride: memoryVisibilityOverrideEnum("visibility_override").notNull(),
    unlockDate: timestamp("unlock_date", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.memoryId, table.treeId] }),
    index("memory_tree_vis_tree_idx").on(table.treeId),
  ],
);

export const memoryPersonSuppressions = pgTable(
  "memory_person_suppressions",
  {
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    suppressedByUserId: text("suppressed_by_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.memoryId, table.treeId, table.personId] }),
    index("memory_person_suppressions_tree_person_idx").on(table.treeId, table.personId),
    index("memory_person_suppressions_person_idx").on(table.personId),
    index("memory_person_suppressions_suppressed_by_idx").on(table.suppressedByUserId),
  ],
);

export const personMergeAudit = pgTable(
  "person_merge_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    survivorPersonId: uuid("survivor_person_id").notNull(),
    mergedAwayPersonId: uuid("merged_away_person_id").notNull(),
    fieldResolutions: jsonb("field_resolutions"),
    performedByUserId: text("performed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("person_merge_audit_survivor_idx").on(table.survivorPersonId),
    index("person_merge_audit_merged_away_idx").on(table.mergedAwayPersonId),
    index("person_merge_audit_performed_by_idx").on(table.performedByUserId),
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
      .references(() => users.id, { onDelete: "set null" }),
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

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    sortWeight: integer("sort_weight").default(0).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    accent: varchar("accent", { length: 30 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("branches_tree_idx").on(table.treeId),
    index("branches_is_default_idx").on(table.treeId, table.isDefault),
  ],
);

export const memoryBranches = pgTable(
  "memory_branches",
  {
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.memoryId, table.branchId] }),
    index("memory_branches_branch_idx").on(table.branchId),
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
      .references(() => users.id, { onDelete: "set null" }),
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

// ── Cast Tokens ────────────────────────────────────────────────────────────────

export const castTokens = pgTable(
  "cast_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("cast_tokens_token_idx").on(table.token)],
);

// ── Relations ──────────────────────────────────────────────────────────────────

export const castTokensRelations = relations(castTokens, ({ one }) => ({
  user: one(users, { fields: [castTokens.userId], references: [users.id] }),
  tree: one(trees, { fields: [castTokens.treeId], references: [trees.id] }),
}));

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
  personScopesAdded: many(treePersonScope),
  personMergeAudits: many(personMergeAudit),
  memoryPerspectives: many(memoryPerspectives),
  curatedPersonMemories: many(personMemoryCuration),
  importBatchesCreated: many(importBatches),
  castTokens: many(castTokens),
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
  mediaItems: many(media, { relationName: "tree_media" }),
  contributingMediaItems: many(media, { relationName: "contributing_tree_media" }),
  places: many(places),
  people: many(people, { relationName: "tree_people" }),
  homePeople: many(people, { relationName: "person_home_tree" }),
  personScopes: many(treePersonScope),
  relationships: many(relationships, { relationName: "tree_relationships" }),
  createdRelationships: many(relationships, { relationName: "relationship_created_in_tree" }),
  relationshipVisibility: many(treeRelationshipVisibility),
  memories: many(memories, { relationName: "tree_memories" }),
  contributingMemories: many(memories, { relationName: "contributing_tree_memories" }),
  scopedMemoryReachRules: many(memoryReachRules, { relationName: "memory_reach_scope_tree" }),
  memoryVisibility: many(memoryTreeVisibility),
  memoryPersonSuppressions: many(memoryPersonSuppressions),
  invitations: many(invitations),
  archiveExports: many(archiveExports),
  prompts: many(prompts),
  promptReplyLinks: many(promptReplyLinks),
  importBatches: many(importBatches),
  importBatchItems: many(importBatchItems),
  transcriptionJobs: many(transcriptionJobs),
  memoryPerspectives: many(memoryPerspectives),
  branches: many(branches),
  castTokens: many(castTokens),
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
  tree: one(trees, {
    fields: [media.treeId],
    references: [trees.id],
    relationName: "tree_media",
  }),
  contributingTree: one(trees, {
    fields: [media.contributingTreeId],
    references: [trees.id],
    relationName: "contributing_tree_media",
  }),
  uploadedBy: one(users, {
    fields: [media.uploadedByUserId],
    references: [users.id],
  }),
  portraitForPeople: many(people),
  memories: many(memories),
  memoryItems: many(memoryMedia),
  memoryPerspectives: many(memoryPerspectives),
  importBatchItems: many(importBatchItems),
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
  tree: one(trees, {
    fields: [people.treeId],
    references: [trees.id],
    relationName: "tree_people",
  }),
  homeTree: one(trees, {
    fields: [people.homeTreeId],
    references: [trees.id],
    relationName: "person_home_tree",
  }),
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
  treeScopes: many(treePersonScope),
  memoryTags: many(memoryPersonTags),
  memoryReachSeeds: many(memoryReachRules),
  memorySuppressions: many(memoryPersonSuppressions),
  memoryPerspectives: many(memoryPerspectives),
  curatedMemories: many(personMemoryCuration),
  invitations: many(invitations),
  promptsReceived: many(prompts),
  defaultForImportBatches: many(importBatches),
}));

export const relationshipsRelations = relations(relationships, ({ one, many }) => ({
  tree: one(trees, {
    fields: [relationships.treeId],
    references: [trees.id],
    relationName: "tree_relationships",
  }),
  createdInTree: one(trees, {
    fields: [relationships.createdInTreeId],
    references: [trees.id],
    relationName: "relationship_created_in_tree",
  }),
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
  treeVisibility: many(treeRelationshipVisibility),
}));

export const memoriesRelations = relations(memories, ({ one, many }) => ({
  tree: one(trees, {
    fields: [memories.treeId],
    references: [trees.id],
    relationName: "tree_memories",
  }),
  contributingTree: one(trees, {
    fields: [memories.contributingTreeId],
    references: [trees.id],
    relationName: "contributing_tree_memories",
  }),
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
  personTags: many(memoryPersonTags),
  reachRules: many(memoryReachRules),
  mediaItems: many(memoryMedia),
  perspectives: many(memoryPerspectives),
  personCuration: many(personMemoryCuration),
  treeVisibility: many(memoryTreeVisibility),
  personSuppressions: many(memoryPersonSuppressions),
  branches: many(memoryBranches),
  importBatchItems: many(importBatchItems),
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

export const promptCampaignsRelations = relations(promptCampaigns, ({ one, many }) => ({
  tree: one(trees, { fields: [promptCampaigns.treeId], references: [trees.id] }),
  fromUser: one(users, {
    fields: [promptCampaigns.fromUserId],
    references: [users.id],
  }),
  toPerson: one(people, {
    fields: [promptCampaigns.toPersonId],
    references: [people.id],
  }),
  questions: many(promptCampaignQuestions),
  recipients: many(promptCampaignRecipients),
}));

export const promptCampaignQuestionsRelations = relations(
  promptCampaignQuestions,
  ({ one }) => ({
    campaign: one(promptCampaigns, {
      fields: [promptCampaignQuestions.campaignId],
      references: [promptCampaigns.id],
    }),
    sentPrompt: one(prompts, {
      fields: [promptCampaignQuestions.sentPromptId],
      references: [prompts.id],
    }),
  }),
);

export const promptCampaignRecipientsRelations = relations(
  promptCampaignRecipients,
  ({ one }) => ({
    campaign: one(promptCampaigns, {
      fields: [promptCampaignRecipients.campaignId],
      references: [promptCampaigns.id],
    }),
  }),
);

export const elderCaptureTokensRelations = relations(
  elderCaptureTokens,
  ({ one }) => ({
    tree: one(trees, {
      fields: [elderCaptureTokens.treeId],
      references: [trees.id],
    }),
    associatedPerson: one(people, {
      fields: [elderCaptureTokens.associatedPersonId],
      references: [people.id],
    }),
    createdBy: one(users, {
      fields: [elderCaptureTokens.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const importBatchesRelations = relations(importBatches, ({ one, many }) => ({
  tree: one(trees, { fields: [importBatches.treeId], references: [trees.id] }),
  createdBy: one(users, {
    fields: [importBatches.createdByUserId],
    references: [users.id],
  }),
  defaultPerson: one(people, {
    fields: [importBatches.defaultPersonId],
    references: [people.id],
  }),
  items: many(importBatchItems),
}));

export const importBatchItemsRelations = relations(importBatchItems, ({ one }) => ({
  batch: one(importBatches, {
    fields: [importBatchItems.batchId],
    references: [importBatches.id],
  }),
  tree: one(trees, {
    fields: [importBatchItems.treeId],
    references: [trees.id],
  }),
  media: one(media, {
    fields: [importBatchItems.mediaId],
    references: [media.id],
  }),
  memory: one(memories, {
    fields: [importBatchItems.memoryId],
    references: [memories.id],
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

export const branchesRelations = relations(branches, ({ one, many }) => ({
  tree: one(trees, { fields: [branches.treeId], references: [trees.id] }),
  memoryBranches: many(memoryBranches),
}));

export const memoryBranchesRelations = relations(memoryBranches, ({ one }) => ({
  memory: one(memories, {
    fields: [memoryBranches.memoryId],
    references: [memories.id],
  }),
  branch: one(branches, {
    fields: [memoryBranches.branchId],
    references: [branches.id],
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

export const treePersonScopeRelations = relations(treePersonScope, ({ one }) => ({
  tree: one(trees, { fields: [treePersonScope.treeId], references: [trees.id] }),
  person: one(people, { fields: [treePersonScope.personId], references: [people.id] }),
  addedBy: one(users, {
    fields: [treePersonScope.addedByUserId],
    references: [users.id],
  }),
}));

export const treeRelationshipVisibilityRelations = relations(
  treeRelationshipVisibility,
  ({ one }) => ({
    tree: one(trees, {
      fields: [treeRelationshipVisibility.treeId],
      references: [trees.id],
    }),
    relationship: one(relationships, {
      fields: [treeRelationshipVisibility.relationshipId],
      references: [relationships.id],
    }),
  }),
);

export const memoryPersonTagsRelations = relations(memoryPersonTags, ({ one }) => ({
  memory: one(memories, {
    fields: [memoryPersonTags.memoryId],
    references: [memories.id],
  }),
  person: one(people, {
    fields: [memoryPersonTags.personId],
    references: [people.id],
  }),
}));

export const memoryTreeVisibilityRelations = relations(memoryTreeVisibility, ({ one }) => ({
  memory: one(memories, {
    fields: [memoryTreeVisibility.memoryId],
    references: [memories.id],
  }),
  tree: one(trees, {
    fields: [memoryTreeVisibility.treeId],
    references: [trees.id],
  }),
}));

export const memoryPersonSuppressionsRelations = relations(
  memoryPersonSuppressions,
  ({ one }) => ({
    memory: one(memories, {
      fields: [memoryPersonSuppressions.memoryId],
      references: [memories.id],
    }),
    tree: one(trees, {
      fields: [memoryPersonSuppressions.treeId],
      references: [trees.id],
    }),
    person: one(people, {
      fields: [memoryPersonSuppressions.personId],
      references: [people.id],
    }),
    suppressedBy: one(users, {
      fields: [memoryPersonSuppressions.suppressedByUserId],
      references: [users.id],
    }),
  }),
);

export const memoryReachRulesRelations = relations(memoryReachRules, ({ one }) => ({
  memory: one(memories, {
    fields: [memoryReachRules.memoryId],
    references: [memories.id],
  }),
  seedPerson: one(people, {
    fields: [memoryReachRules.seedPersonId],
    references: [people.id],
  }),
  scopeTree: one(trees, {
    fields: [memoryReachRules.scopeTreeId],
    references: [trees.id],
    relationName: "memory_reach_scope_tree",
  }),
  createdBy: one(users, {
    fields: [memoryReachRules.createdByUserId],
    references: [users.id],
  }),
}));

export const memoryMediaRelations = relations(memoryMedia, ({ one }) => ({
  memory: one(memories, {
    fields: [memoryMedia.memoryId],
    references: [memories.id],
  }),
  media: one(media, {
    fields: [memoryMedia.mediaId],
    references: [media.id],
  }),
}));

export const memoryPerspectivesRelations = relations(memoryPerspectives, ({ one }) => ({
  memory: one(memories, {
    fields: [memoryPerspectives.memoryId],
    references: [memories.id],
  }),
  tree: one(trees, {
    fields: [memoryPerspectives.treeId],
    references: [trees.id],
  }),
  contributor: one(users, {
    fields: [memoryPerspectives.contributorUserId],
    references: [users.id],
  }),
  contributorPerson: one(people, {
    fields: [memoryPerspectives.contributorPersonId],
    references: [people.id],
  }),
  media: one(media, {
    fields: [memoryPerspectives.mediaId],
    references: [media.id],
  }),
}));

export const personMemoryCurationRelations = relations(personMemoryCuration, ({ one }) => ({
  tree: one(trees, {
    fields: [personMemoryCuration.treeId],
    references: [trees.id],
  }),
  person: one(people, {
    fields: [personMemoryCuration.personId],
    references: [people.id],
  }),
  memory: one(memories, {
    fields: [personMemoryCuration.memoryId],
    references: [memories.id],
  }),
  updatedBy: one(users, {
    fields: [personMemoryCuration.updatedByUserId],
    references: [users.id],
  }),
}));

export const personMergeAuditRelations = relations(personMergeAudit, ({ one }) => ({
  performedBy: one(users, {
    fields: [personMergeAudit.performedByUserId],
    references: [users.id],
  }),
}));
