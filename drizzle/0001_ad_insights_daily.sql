CREATE TABLE "ad_insights_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ad_id" bigint NOT NULL,
	"date" date NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cpm" numeric(14, 4),
	"ctr" numeric(8, 4),
	"reach" integer,
	"frequency" numeric(8, 4),
	"link_clicks" integer,
	"video_views" integer,
	"video_p50" integer,
	"video_p75" integer,
	"conversions" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD CONSTRAINT "ad_insights_daily_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_insights_daily_ad_date_uq" ON "ad_insights_daily" USING btree ("ad_id","date");--> statement-breakpoint
CREATE INDEX "ad_insights_daily_date_idx" ON "ad_insights_daily" USING btree ("date");