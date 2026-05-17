CREATE TABLE "purchases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"product_slug" text NOT NULL,
	"product_name_raw" text,
	"status" text NOT NULL,
	"buyer_name" text,
	"buyer_email" text,
	"buyer_phone_raw" text,
	"buyer_phone_e164" text,
	"value_cents" integer,
	"currency" text,
	"purchased_at" timestamp with time zone NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_transaction_id_uq" ON "purchases" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "purchases_phone_idx" ON "purchases" USING btree ("buyer_phone_e164");--> statement-breakpoint
CREATE INDEX "purchases_product_date_idx" ON "purchases" USING btree ("product_slug","purchased_at");--> statement-breakpoint
CREATE INDEX "purchases_status_idx" ON "purchases" USING btree ("status");