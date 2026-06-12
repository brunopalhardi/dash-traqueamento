ALTER TABLE "purchases" ADD COLUMN "traffic_source" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "utm_content" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "ad_external_id" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "tracking_raw" text;--> statement-breakpoint
CREATE INDEX "purchases_traffic_source_idx" ON "purchases" USING btree ("product_slug","traffic_source");--> statement-breakpoint
CREATE INDEX "purchases_utm_campaign_idx" ON "purchases" USING btree ("utm_campaign");