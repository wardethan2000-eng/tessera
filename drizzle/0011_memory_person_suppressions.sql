CREATE TABLE "memory_person_suppressions" (
	"memory_id" uuid NOT NULL,
	"tree_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"suppressed_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_person_suppressions_memory_id_tree_id_person_id_pk" PRIMARY KEY("memory_id","tree_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "memory_person_suppressions" ADD CONSTRAINT "memory_person_suppressions_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_person_suppressions" ADD CONSTRAINT "memory_person_suppressions_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_person_suppressions" ADD CONSTRAINT "memory_person_suppressions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_person_suppressions" ADD CONSTRAINT "memory_person_suppressions_suppressed_by_user_id_users_id_fk" FOREIGN KEY ("suppressed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_person_suppressions_tree_person_idx" ON "memory_person_suppressions" USING btree ("tree_id","person_id");--> statement-breakpoint
CREATE INDEX "memory_person_suppressions_person_idx" ON "memory_person_suppressions" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "memory_person_suppressions_suppressed_by_idx" ON "memory_person_suppressions" USING btree ("suppressed_by_user_id");