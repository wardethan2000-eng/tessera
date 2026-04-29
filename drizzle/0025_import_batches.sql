CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"created_by_user_id" text,
	"label" varchar(200) NOT NULL,
	"source_kind" varchar(40) DEFAULT 'multi_file_upload' NOT NULL,
	"status" varchar(40) DEFAULT 'uploading' NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"processed_items" integer DEFAULT 0 NOT NULL,
	"failed_items" integer DEFAULT 0 NOT NULL,
	"default_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"tree_id" uuid NOT NULL,
	"media_id" uuid,
	"memory_id" uuid,
	"original_filename" text NOT NULL,
	"detected_mime_type" varchar(255),
	"size_bytes" bigint,
	"checksum" varchar(128),
	"captured_at" timestamp with time zone,
	"metadata" jsonb,
	"status" varchar(40) DEFAULT 'uploaded' NOT NULL,
	"review_state" varchar(40) DEFAULT 'needs_review' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_default_person_id_people_id_fk" FOREIGN KEY ("default_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_tree_idx" ON "import_batches" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "import_batches_created_by_idx" ON "import_batches" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "import_batches_status_idx" ON "import_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_batches_default_person_idx" ON "import_batches" USING btree ("default_person_id");--> statement-breakpoint
CREATE INDEX "import_batch_items_batch_idx" ON "import_batch_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "import_batch_items_tree_idx" ON "import_batch_items" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "import_batch_items_media_idx" ON "import_batch_items" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "import_batch_items_memory_idx" ON "import_batch_items" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "import_batch_items_status_idx" ON "import_batch_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_batch_items_review_state_idx" ON "import_batch_items" USING btree ("review_state");
