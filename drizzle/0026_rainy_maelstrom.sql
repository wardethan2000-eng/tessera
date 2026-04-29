ALTER TABLE "import_batch_items" ADD COLUMN "relative_path" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "source_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "source_filename" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "capture_confidence_json" jsonb;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_batch_id_import_batches_id_fk" FOREIGN KEY ("source_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memories_source_batch_idx" ON "memories" USING btree ("source_batch_id");