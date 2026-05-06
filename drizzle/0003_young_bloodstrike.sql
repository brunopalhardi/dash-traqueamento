ALTER TABLE "ad_accounts" ALTER COLUMN "access_token_encrypted" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN "details" jsonb;