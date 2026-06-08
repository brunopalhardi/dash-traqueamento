CREATE TABLE "vturb_page_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"page_id" bigint NOT NULL,
	"date" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"plays" integer DEFAULT 0 NOT NULL,
	"finished" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"over_pitch" integer DEFAULT 0 NOT NULL,
	"under_pitch" integer DEFAULT 0 NOT NULL,
	"avg_watched_sec" numeric(10, 2) DEFAULT '0' NOT NULL,
	"engagement_rate" numeric(6, 2) DEFAULT '0' NOT NULL,
	"play_rate" numeric(6, 2) DEFAULT '0' NOT NULL,
	"pitch_retention_rate" numeric(6, 2),
	"raw" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vturb_page_players" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"page_id" bigint NOT NULL,
	"player_id" text NOT NULL,
	"source" text DEFAULT 'auto' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vturb_pages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_slug" text DEFAULT 'guia' NOT NULL,
	"page_url" text NOT NULL,
	"raw_example_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"scrape_status" text DEFAULT 'pending' NOT NULL,
	"last_http_status" integer,
	"last_scraped_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vturb_players" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"name" text,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"pitch_time_sec" integer DEFAULT 0 NOT NULL,
	"vturb_created_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vturb_players_player_id_unique" UNIQUE("player_id")
);
--> statement-breakpoint
CREATE TABLE "vturb_retention_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"page_id" bigint NOT NULL,
	"date" date NOT NULL,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"pitch_pct" numeric(6, 2),
	"curve" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vturb_page_daily" ADD CONSTRAINT "vturb_page_daily_page_id_vturb_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."vturb_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vturb_page_players" ADD CONSTRAINT "vturb_page_players_page_id_vturb_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."vturb_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vturb_retention_daily" ADD CONSTRAINT "vturb_retention_daily_page_id_vturb_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."vturb_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vturb_page_daily_uniq" ON "vturb_page_daily" USING btree ("page_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "vturb_page_players_uniq" ON "vturb_page_players" USING btree ("page_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vturb_pages_product_url_uniq" ON "vturb_pages" USING btree ("product_slug","page_url");--> statement-breakpoint
CREATE UNIQUE INDEX "vturb_retention_daily_uniq" ON "vturb_retention_daily" USING btree ("page_id","date");