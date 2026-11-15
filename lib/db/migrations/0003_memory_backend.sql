CREATE TABLE "artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"nook_id" integer NOT NULL,
	"creator_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"media_storage_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artifacts_id_nook_unique" UNIQUE("id","nook_id"),
	CONSTRAINT "artifacts_type_check" CHECK ("artifacts"."type" IN ('photo', 'audio', 'letter', 'text', 'other')),
	CONSTRAINT "artifacts_title_check" CHECK (char_length(btrim("artifacts"."title")) > 0),
	CONSTRAINT "artifacts_description_check" CHECK ("artifacts"."description" IS NULL OR char_length("artifacts"."description") <= 10000),
	CONSTRAINT "artifacts_media_key_check" CHECK ("artifacts"."media_storage_key" IS NULL OR (
    char_length("artifacts"."media_storage_key") BETWEEN 1 AND 1024
    AND "artifacts"."media_storage_key" ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$'
    AND "artifacts"."media_storage_key" !~ '(^|/)[.]{1,2}(/|$)'
    AND "artifacts"."type" <> 'text'
  ))
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"artifact_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"content" text,
	"audio_storage_key" text,
	"original_transcript" text,
	"source_language" varchar(35),
	"processing_status" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contributions_type_check" CHECK ("contributions"."type" IN ('text', 'audio')),
	CONSTRAINT "contributions_content_check" CHECK ((
    "contributions"."type" = 'text' AND "contributions"."content" IS NOT NULL
    AND char_length(btrim("contributions"."content")) BETWEEN 1 AND 20000
    AND "contributions"."audio_storage_key" IS NULL AND "contributions"."original_transcript" IS NULL
    AND "contributions"."source_language" IS NULL AND "contributions"."processing_status" IS NULL
  ) OR ("contributions"."type" = 'audio' AND "contributions"."content" IS NULL)),
	CONSTRAINT "contributions_audio_key_check" CHECK ("contributions"."audio_storage_key" IS NULL OR (
    char_length("contributions"."audio_storage_key") BETWEEN 1 AND 1024
    AND "contributions"."audio_storage_key" ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$'
    AND "contributions"."audio_storage_key" !~ '(^|/)[.]{1,2}(/|$)'
  )),
	CONSTRAINT "contributions_language_check" CHECK ("contributions"."source_language" IS NULL OR "contributions"."source_language" ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'),
	CONSTRAINT "contributions_status_check" CHECK ("contributions"."processing_status" IS NULL OR "contributions"."processing_status" IN ('draft', 'pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"nook_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"content" text NOT NULL,
	"artifact_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "messages_content_check" CHECK (char_length(btrim("messages"."content")) BETWEEN 1 AND 5000)
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribution_id" integer NOT NULL,
	"source_language" varchar(35) NOT NULL,
	"target_language" varchar(35) NOT NULL,
	"translated_text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "translations_contribution_languages_unique" UNIQUE("contribution_id","source_language","target_language"),
	CONSTRAINT "translations_source_language_check" CHECK ("translations"."source_language" ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'),
	CONSTRAINT "translations_target_language_check" CHECK ("translations"."target_language" ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'),
	CONSTRAINT "translations_text_check" CHECK (char_length(btrim("translations"."translated_text")) > 0)
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_nook_id_teams_id_fk" FOREIGN KEY ("nook_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_nook_id_teams_id_fk" FOREIGN KEY ("nook_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_artifact_nook_fk" FOREIGN KEY ("artifact_id","nook_id") REFERENCES "public"."artifacts"("id","nook_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_nook_created_idx" ON "artifacts" USING btree ("nook_id","created_at","id");--> statement-breakpoint
CREATE INDEX "contributions_artifact_created_idx" ON "contributions" USING btree ("artifact_id","created_at","id");--> statement-breakpoint
CREATE INDEX "messages_nook_created_idx" ON "messages" USING btree ("nook_id","created_at","id");