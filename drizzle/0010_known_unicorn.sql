CREATE TABLE "sendflow_analytics_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"release_id" bigint NOT NULL,
	"date" date NOT NULL,
	"adds" integer DEFAULT 0 NOT NULL,
	"removals" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sendflow_releases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"archived" boolean DEFAULT false NOT NULL,
	"raw_payload" jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_groups" ADD COLUMN "sendflow_release_external_id" text;--> statement-breakpoint
ALTER TABLE "whatsapp_groups" ADD COLUMN "wa_jid" text;--> statement-breakpoint
ALTER TABLE "whatsapp_groups" ADD COLUMN "invite_code" text;--> statement-breakpoint
ALTER TABLE "whatsapp_groups" ADD COLUMN "participants_amount" integer;--> statement-breakpoint
ALTER TABLE "whatsapp_groups" ADD COLUMN "is_full" boolean;--> statement-breakpoint
ALTER TABLE "sendflow_analytics_daily" ADD CONSTRAINT "sendflow_analytics_daily_release_id_sendflow_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."sendflow_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sendflow_analytics_daily_release_date_uq" ON "sendflow_analytics_daily" USING btree ("release_id","date");--> statement-breakpoint
CREATE INDEX "sendflow_analytics_daily_date_idx" ON "sendflow_analytics_daily" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "sendflow_releases_external_id_uq" ON "sendflow_releases" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "sendflow_releases_archived_idx" ON "sendflow_releases" USING btree ("archived");--> statement-breakpoint
CREATE INDEX "whatsapp_groups_sendflow_release_idx" ON "whatsapp_groups" USING btree ("sendflow_release_external_id");