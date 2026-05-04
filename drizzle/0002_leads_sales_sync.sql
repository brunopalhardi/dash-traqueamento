CREATE TYPE "public"."lead_source" AS ENUM('meta', 'organic', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."match_confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."match_method" AS ENUM('email', 'phone');--> statement-breakpoint
CREATE TYPE "public"."sale_status" AS ENUM('approved', 'refunded', 'chargeback', 'pending', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."sync_job_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_job_type" AS ENUM('meta_full', 'meta_incremental', 'hotmart_replay', 'match_recompute', 'ping');--> statement-breakpoint
CREATE TABLE "lead_sale_matches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"sale_id" bigint NOT NULL,
	"match_method" "match_method" NOT NULL,
	"confidence" "match_confidence" NOT NULL,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email_normalized" text,
	"phone_normalized" text,
	"name" text,
	"source" "lead_source" DEFAULT 'unknown' NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"fbclid" text,
	"fbp_cookie" text,
	"ip" text,
	"user_agent" text,
	"ad_id" bigint,
	"landing_url" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"hotmart_transaction_id" text NOT NULL,
	"status" "sale_status" NOT NULL,
	"buyer_email_normalized" text,
	"buyer_phone_normalized" text,
	"buyer_name" text,
	"product_id" text,
	"product_name" text,
	"offer_code" text,
	"amount_brl" numeric(14, 2),
	"payment_method" text,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"purchased_at" timestamp with time zone NOT NULL,
	"refunded_at" timestamp with time zone,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" "sync_job_type" NOT NULL,
	"ad_account_id" bigint,
	"status" "sync_job_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"rows_processed" integer DEFAULT 0,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_sale_matches" ADD CONSTRAINT "lead_sale_matches_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_sale_matches" ADD CONSTRAINT "lead_sale_matches_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_sale_uq" ON "lead_sale_matches" USING btree ("lead_id","sale_id");--> statement-breakpoint
CREATE INDEX "lead_sale_lead_idx" ON "lead_sale_matches" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_sale_sale_idx" ON "lead_sale_matches" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email_normalized");--> statement-breakpoint
CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("phone_normalized");--> statement-breakpoint
CREATE INDEX "leads_captured_at_idx" ON "leads" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "leads_ad_idx" ON "leads" USING btree ("ad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_transaction_uq" ON "sales" USING btree ("hotmart_transaction_id");--> statement-breakpoint
CREATE INDEX "sales_email_idx" ON "sales" USING btree ("buyer_email_normalized");--> statement-breakpoint
CREATE INDEX "sales_phone_idx" ON "sales" USING btree ("buyer_phone_normalized");--> statement-breakpoint
CREATE INDEX "sales_purchased_at_idx" ON "sales" USING btree ("purchased_at");--> statement-breakpoint
CREATE INDEX "sync_jobs_type_idx" ON "sync_jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "sync_jobs_status_idx" ON "sync_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sync_jobs_created_at_idx" ON "sync_jobs" USING btree ("created_at");