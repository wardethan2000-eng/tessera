CREATE TYPE "public"."prompt_campaign_status" AS ENUM ('active', 'paused', 'completed');--> statement-breakpoint
CREATE TABLE "prompt_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"from_user_id" text NOT NULL,
	"to_person_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"cadence_days" integer DEFAULT 7 NOT NULL,
	"status" "prompt_campaign_status" DEFAULT 'active' NOT NULL,
	"next_send_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_campaign_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"question_text" text NOT NULL,
	"position" integer NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_prompt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_campaigns" ADD CONSTRAINT "prompt_campaigns_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_campaigns" ADD CONSTRAINT "prompt_campaigns_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_campaigns" ADD CONSTRAINT "prompt_campaigns_to_person_id_people_id_fk" FOREIGN KEY ("to_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_campaign_questions" ADD CONSTRAINT "prompt_campaign_questions_campaign_id_prompt_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."prompt_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_campaign_questions" ADD CONSTRAINT "prompt_campaign_questions_sent_prompt_id_prompts_id_fk" FOREIGN KEY ("sent_prompt_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_campaign_recipients" ADD CONSTRAINT "prompt_campaign_recipients_campaign_id_prompt_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."prompt_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_campaigns_tree_idx" ON "prompt_campaigns" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "prompt_campaigns_status_idx" ON "prompt_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prompt_campaigns_next_send_idx" ON "prompt_campaigns" USING btree ("next_send_at");--> statement-breakpoint
CREATE INDEX "prompt_campaign_questions_campaign_idx" ON "prompt_campaign_questions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "prompt_campaign_questions_position_idx" ON "prompt_campaign_questions" USING btree ("campaign_id","position");--> statement-breakpoint
CREATE INDEX "prompt_campaign_recipients_campaign_idx" ON "prompt_campaign_recipients" USING btree ("campaign_id");
