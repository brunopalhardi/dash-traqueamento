ALTER TABLE "campaigns" ADD COLUMN "product_slug" text;--> statement-breakpoint
CREATE INDEX "campaigns_product_slug_idx" ON "campaigns" USING btree ("product_slug");