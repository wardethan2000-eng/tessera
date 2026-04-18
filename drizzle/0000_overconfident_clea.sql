CREATE TYPE "public"."export_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('founder', 'steward', 'contributor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."memory_kind" AS ENUM('story', 'photo');--> statement-breakpoint
CREATE TYPE "public"."relationship_type" AS ENUM('parent_child', 'sibling', 'spouse');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "archive_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"status" "export_status" DEFAULT 'queued' NOT NULL,
	"storage_path" text,
	"file_size_bytes" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"email" varchar(320) NOT NULL,
	"proposed_role" "membership_role" NOT NULL,
	"linked_person_id" uuid,
	"token_hash" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"uploaded_by_user_id" text,
	"storage_provider" varchar(40) DEFAULT 'minio' NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text,
	"mime_type" varchar(255) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"primary_person_id" uuid NOT NULL,
	"contributor_user_id" text NOT NULL,
	"media_id" uuid,
	"kind" "memory_kind" NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"date_of_event_text" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"also_known_as" text[] DEFAULT '{}' NOT NULL,
	"essence_line" varchar(255),
	"birth_date_text" varchar(100),
	"death_date_text" varchar(100),
	"birth_place" varchar(200),
	"death_place" varchar(200),
	"is_living" boolean DEFAULT true NOT NULL,
	"portrait_media_id" uuid,
	"linked_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"from_person_id" uuid NOT NULL,
	"to_person_id" uuid NOT NULL,
	"type" "relationship_type" NOT NULL,
	"start_date_text" varchar(100),
	"end_date_text" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tree_memberships" (
	"tree_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"invited_by_user_id" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tree_memberships_tree_id_user_id_pk" PRIMARY KEY("tree_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "trees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"founder_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"email" varchar(320) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_exports" ADD CONSTRAINT "archive_exports_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_exports" ADD CONSTRAINT "archive_exports_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_linked_person_id_people_id_fk" FOREIGN KEY ("linked_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_primary_person_id_people_id_fk" FOREIGN KEY ("primary_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_contributor_user_id_users_id_fk" FOREIGN KEY ("contributor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_portrait_media_id_media_id_fk" FOREIGN KEY ("portrait_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_from_person_id_people_id_fk" FOREIGN KEY ("from_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_to_person_id_people_id_fk" FOREIGN KEY ("to_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_memberships" ADD CONSTRAINT "tree_memberships_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_memberships" ADD CONSTRAINT "tree_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_memberships" ADD CONSTRAINT "tree_memberships_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trees" ADD CONSTRAINT "trees_founder_user_id_users_id_fk" FOREIGN KEY ("founder_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "archive_exports_tree_idx" ON "archive_exports" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "archive_exports_requested_by_idx" ON "archive_exports" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "invitations_tree_idx" ON "invitations" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_unique_idx" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "media_object_key_unique_idx" ON "media" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "media_tree_idx" ON "media" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "media_uploaded_by_idx" ON "media" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "memories_tree_idx" ON "memories" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "memories_primary_person_idx" ON "memories" USING btree ("primary_person_id");--> statement-breakpoint
CREATE INDEX "memories_contributor_idx" ON "memories" USING btree ("contributor_user_id");--> statement-breakpoint
CREATE INDEX "memories_media_idx" ON "memories" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "people_tree_idx" ON "people" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "people_linked_user_idx" ON "people" USING btree ("linked_user_id");--> statement-breakpoint
CREATE INDEX "people_portrait_media_idx" ON "people" USING btree ("portrait_media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "relationships_unique_pair_idx" ON "relationships" USING btree ("tree_id","type","from_person_id","to_person_id");--> statement-breakpoint
CREATE INDEX "relationships_tree_idx" ON "relationships" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "relationships_from_person_idx" ON "relationships" USING btree ("from_person_id");--> statement-breakpoint
CREATE INDEX "relationships_to_person_idx" ON "relationships" USING btree ("to_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_unique_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "tree_memberships_user_idx" ON "tree_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tree_memberships_invited_by_idx" ON "tree_memberships" USING btree ("invited_by_user_id");--> statement-breakpoint
CREATE INDEX "trees_founder_user_idx" ON "trees" USING btree ("founder_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique_idx" ON "users" USING btree ("email");