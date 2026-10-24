CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoho_open_orders" (
	"po_id" text PRIMARY KEY NOT NULL,
	"po_number" text NOT NULL,
	"vendor_id" text NOT NULL,
	"vendor_name" text NOT NULL,
	"status" text NOT NULL,
	"order_date" text,
	"expected_date" text,
	"reference_number" text,
	"lines" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zoho_drafts" ADD COLUMN "zoho_status" text;--> statement-breakpoint
ALTER TABLE "zoho_drafts" ADD COLUMN "reference_number" text NOT NULL;--> statement-breakpoint
ALTER TABLE "zoho_drafts" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "zoho_drafts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "kill_triggers" ADD CONSTRAINT "kill_triggers_code_unique" UNIQUE("code");