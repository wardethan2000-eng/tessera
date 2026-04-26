CREATE TABLE "cast_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"tree_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cast_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "cast_tokens" ADD CONSTRAINT "cast_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cast_tokens" ADD CONSTRAINT "cast_tokens_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cast_tokens_token_idx" ON "cast_tokens" USING btree ("token");