CREATE TABLE "memory_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"media_id" uuid,
	"linked_media_provider" "linked_media_provider",
	"linked_media_provider_item_id" varchar(255),
	"linked_media_source_url" text,
	"linked_media_open_url" text,
	"linked_media_preview_url" text,
	"linked_media_label" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_media" ADD CONSTRAINT "memory_media_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_media" ADD CONSTRAINT "memory_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_media_memory_idx" ON "memory_media" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "memory_media_media_idx" ON "memory_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "memory_media_memory_sort_idx" ON "memory_media" USING btree ("memory_id","sort_order");