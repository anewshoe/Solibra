CREATE TABLE "message_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"source_language" varchar(35) NOT NULL,
	"target_language" varchar(35) NOT NULL,
	"translated_text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_translations_languages_unique" UNIQUE("message_id","source_language","target_language"),
	CONSTRAINT "message_translations_source_check" CHECK ("message_translations"."source_language" ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'),
	CONSTRAINT "message_translations_target_check" CHECK ("message_translations"."target_language" ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'),
	CONSTRAINT "message_translations_text_check" CHECK (char_length(btrim("message_translations"."translated_text")) > 0)
);
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_content_check";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "type" varchar(20) DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "audio_storage_key" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "original_transcript" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "source_language" varchar(35);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "processing_status" varchar(20);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "door_color" text DEFAULT 'pink' NOT NULL;--> statement-breakpoint
ALTER TABLE "message_translations" ADD CONSTRAINT "message_translations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_audio_state_check" CHECK (("messages"."type" = 'text' AND "messages"."audio_storage_key" IS NULL AND "messages"."original_transcript" IS NULL AND "messages"."source_language" IS NULL AND "messages"."processing_status" IS NULL) OR "messages"."type" = 'audio');--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_audio_key_check" CHECK ("messages"."audio_storage_key" IS NULL OR ("messages"."audio_storage_key" ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$' AND char_length("messages"."audio_storage_key") <= 1024 AND "messages"."audio_storage_key" !~ '(^|/)[.]{1,2}(/|$)'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_language_check" CHECK ("messages"."source_language" IS NULL OR "messages"."source_language" ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$');--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_status_check" CHECK ("messages"."processing_status" IS NULL OR "messages"."processing_status" IN ('draft','pending','processing','completed','failed'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_content_check" CHECK (("messages"."type" = 'text' AND char_length(btrim("messages"."content")) BETWEEN 1 AND 5000) OR ("messages"."type" = 'audio' AND char_length("messages"."content") <= 5000));--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_door_color_check" CHECK ("teams"."door_color" IN ('pink', 'lilac', 'blue', 'green', 'yellow'));