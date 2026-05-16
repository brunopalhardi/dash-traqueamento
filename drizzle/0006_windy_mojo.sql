CREATE TYPE "public"."whatsapp_event_type" AS ENUM('joined', 'left', 'unknown');--> statement-breakpoint
CREATE TABLE "whatsapp_group_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"group_external_id" text NOT NULL,
	"group_name" text,
	"phone_normalized" text,
	"raw_phone" text,
	"contact_name" text,
	"event_type" "whatsapp_event_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_group_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"group_id" bigint NOT NULL,
	"group_external_id" text NOT NULL,
	"phone_normalized" text NOT NULL,
	"name" text,
	"first_joined_at" timestamp with time zone,
	"last_event_at" timestamp with time zone NOT NULL,
	"last_event_type" "whatsapp_event_type" NOT NULL,
	"currently_in_group" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"name" text,
	"product_slug" text,
	"cycle_label" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_group_members" ADD CONSTRAINT "whatsapp_group_members_group_id_whatsapp_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."whatsapp_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_group_events_group_idx" ON "whatsapp_group_events" USING btree ("group_external_id");--> statement-breakpoint
CREATE INDEX "whatsapp_group_events_phone_idx" ON "whatsapp_group_events" USING btree ("phone_normalized");--> statement-breakpoint
CREATE INDEX "whatsapp_group_events_occurred_idx" ON "whatsapp_group_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_group_members_group_phone_uq" ON "whatsapp_group_members" USING btree ("group_external_id","phone_normalized");--> statement-breakpoint
CREATE INDEX "whatsapp_group_members_phone_idx" ON "whatsapp_group_members" USING btree ("phone_normalized");--> statement-breakpoint
CREATE INDEX "whatsapp_group_members_group_idx" ON "whatsapp_group_members" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_groups_external_id_uq" ON "whatsapp_groups" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "whatsapp_groups_product_idx" ON "whatsapp_groups" USING btree ("product_slug");