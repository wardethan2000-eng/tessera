CREATE TYPE "public"."prompt_campaign_type" AS ENUM('one_relative', 'about_person', 'photo_identify', 'reunion', 'anniversary', 'place_drive', 'theme_based');--> statement-breakpoint
CREATE TYPE "public"."prompt_library_sensitivity" AS ENUM('ordinary', 'careful', 'grief_safe');--> statement-breakpoint
CREATE TYPE "public"."prompt_library_theme" AS ENUM('warmup', 'childhood', 'family_home', 'work', 'service', 'courtship', 'holidays', 'food', 'migration', 'legacy', 'grief_safe');--> statement-breakpoint
CREATE TYPE "public"."prompt_library_tier" AS ENUM('warm_up', 'middle', 'deep', 'legacy');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('active', 'bounced', 'opted_out');--> statement-breakpoint
CREATE TABLE "prompt_campaign_template_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"library_question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_campaign_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"campaign_type" "prompt_campaign_type" DEFAULT 'about_person' NOT NULL,
	"theme" "prompt_library_theme" DEFAULT 'warmup' NOT NULL,
	"default_cadence_days" integer DEFAULT 7 NOT NULL,
	"sensitivity_ceiling" "prompt_library_sensitivity" DEFAULT 'ordinary' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_library_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"theme" "prompt_library_theme" NOT NULL,
	"tier" "prompt_library_tier" DEFAULT 'middle' NOT NULL,
	"question_text" text NOT NULL,
	"sensitivity" "prompt_library_sensitivity" DEFAULT 'ordinary' NOT NULL,
	"recommended_position" integer DEFAULT 0 NOT NULL,
	"follow_up_tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_campaign_recipients" ADD COLUMN "status" "recipient_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_campaign_recipients" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prompt_campaign_recipients" ADD COLUMN "last_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prompt_campaign_recipients" ADD COLUMN "replied_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_campaign_recipients" ADD COLUMN "reminder_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_campaign_recipients" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_campaigns" ADD COLUMN "campaign_type" "prompt_campaign_type" DEFAULT 'about_person';--> statement-breakpoint
ALTER TABLE "prompt_campaign_template_questions" ADD CONSTRAINT "prompt_campaign_template_questions_template_id_prompt_campaign_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prompt_campaign_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_campaign_template_questions" ADD CONSTRAINT "prompt_campaign_template_questions_library_question_id_prompt_library_questions_id_fk" FOREIGN KEY ("library_question_id") REFERENCES "public"."prompt_library_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_campaign_template_questions_template_idx" ON "prompt_campaign_template_questions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "prompt_campaign_template_questions_library_idx" ON "prompt_campaign_template_questions" USING btree ("library_question_id");--> statement-breakpoint
CREATE INDEX "prompt_campaign_template_questions_position_idx" ON "prompt_campaign_template_questions" USING btree ("template_id","position");--> statement-breakpoint
CREATE INDEX "prompt_campaign_templates_type_idx" ON "prompt_campaign_templates" USING btree ("campaign_type");--> statement-breakpoint
CREATE INDEX "prompt_campaign_templates_theme_idx" ON "prompt_campaign_templates" USING btree ("theme");--> statement-breakpoint
CREATE INDEX "prompt_library_theme_idx" ON "prompt_library_questions" USING btree ("theme");--> statement-breakpoint
CREATE INDEX "prompt_library_tier_idx" ON "prompt_library_questions" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "prompt_library_sensitivity_idx" ON "prompt_library_questions" USING btree ("sensitivity");--> statement-breakpoint
CREATE INDEX "prompt_campaign_recipients_status_idx" ON "prompt_campaign_recipients" USING btree ("status");