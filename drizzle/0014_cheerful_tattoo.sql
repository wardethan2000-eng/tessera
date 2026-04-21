CREATE TABLE "person_memory_curation" (
	"tree_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_memory_curation_tree_id_person_id_memory_id_pk" PRIMARY KEY("tree_id","person_id","memory_id")
);
--> statement-breakpoint
ALTER TABLE "person_memory_curation" ADD CONSTRAINT "person_memory_curation_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_memory_curation" ADD CONSTRAINT "person_memory_curation_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_memory_curation" ADD CONSTRAINT "person_memory_curation_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_memory_curation" ADD CONSTRAINT "person_memory_curation_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_memory_curation_person_idx" ON "person_memory_curation" USING btree ("tree_id","person_id");--> statement-breakpoint
CREATE INDEX "person_memory_curation_memory_idx" ON "person_memory_curation" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "person_memory_curation_updated_by_idx" ON "person_memory_curation" USING btree ("updated_by_user_id");