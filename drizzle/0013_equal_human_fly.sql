CREATE TABLE "memory_perspectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"tree_id" uuid NOT NULL,
	"contributor_user_id" text NOT NULL,
	"contributor_person_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_perspectives" ADD CONSTRAINT "memory_perspectives_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_perspectives" ADD CONSTRAINT "memory_perspectives_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_perspectives" ADD CONSTRAINT "memory_perspectives_contributor_user_id_users_id_fk" FOREIGN KEY ("contributor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_perspectives" ADD CONSTRAINT "memory_perspectives_contributor_person_id_people_id_fk" FOREIGN KEY ("contributor_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_perspectives_memory_idx" ON "memory_perspectives" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "memory_perspectives_tree_idx" ON "memory_perspectives" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "memory_perspectives_contributor_idx" ON "memory_perspectives" USING btree ("contributor_user_id");--> statement-breakpoint
CREATE INDEX "memory_perspectives_person_idx" ON "memory_perspectives" USING btree ("contributor_person_id");--> statement-breakpoint
CREATE INDEX "memory_perspectives_memory_created_idx" ON "memory_perspectives" USING btree ("memory_id","created_at");