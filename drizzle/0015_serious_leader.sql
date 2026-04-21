ALTER TABLE "memory_perspectives" ALTER COLUMN "body" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_perspectives" ADD COLUMN "media_id" uuid;--> statement-breakpoint
ALTER TABLE "memory_perspectives" ADD CONSTRAINT "memory_perspectives_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_perspectives_media_idx" ON "memory_perspectives" USING btree ("media_id");