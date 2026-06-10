-- Consolidada pós-merge com a 0015 do VTurb: estas mudanças já foram aplicadas
-- em prod pelas migrations da branch fix/precisao-e-replicacao (renumeradas
-- fora do journal). IF NOT EXISTS torna a aplicação um no-op seguro.
ALTER TYPE "public"."sync_job_status" ADD VALUE IF NOT EXISTS 'partial' BEFORE 'failed';--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "product_slug" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_product_slug_idx" ON "campaigns" USING btree ("product_slug");
