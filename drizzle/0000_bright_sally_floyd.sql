CREATE TYPE "public"."cycle_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."decision" AS ENUM('pending', 'approved', 'changed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('planner', 'backup', 'admin');--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" integer NOT NULL,
	"rule_version_id" integer NOT NULL,
	"status" "cycle_status" DEFAULT 'open' NOT NULL,
	"open_orders" jsonb,
	"opened_by" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer NOT NULL,
	"recommendation_id" integer NOT NULL,
	"sku_id" text NOT NULL,
	"action" "decision" NOT NULL,
	"rule_qty" integer,
	"final_qty" integer,
	"reason" text,
	"by_user" uuid,
	"as_backup" boolean DEFAULT false NOT NULL,
	"rule_version_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kill_triggers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"detail" text NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "loss_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"quarter" text NOT NULL,
	"stockout_loss_inr" numeric(14, 0) NOT NULL,
	"overstock_loss_inr" numeric(14, 0) NOT NULL,
	"note" text,
	"entered_by" uuid,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer NOT NULL,
	"sku_id" text NOT NULL,
	"assessment" jsonb NOT NULL,
	"spot_check" boolean DEFAULT false NOT NULL,
	"decision" "decision" DEFAULT 'pending' NOT NULL,
	"final_qty" integer,
	"reason" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rule_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"settings" jsonb NOT NULL,
	"change_note" text NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_versions_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "upload_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"as_of_date" text NOT NULL,
	"files_uploaded" jsonb NOT NULL,
	"dataset" jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "zoho_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer NOT NULL,
	"distributor_id" text NOT NULL,
	"zoho_po_id" text,
	"zoho_po_number" text,
	"status" text NOT NULL,
	"lines" jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoho_item_map" (
	"sku_id" text PRIMARY KEY NOT NULL,
	"zoho_item_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoho_vendor_map" (
	"distributor_id" text PRIMARY KEY NOT NULL,
	"zoho_vendor_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_snapshot_id_upload_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."upload_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_rule_version_id_rule_versions_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_by_user_users_id_fk" FOREIGN KEY ("by_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_rule_version_id_rule_versions_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kill_triggers" ADD CONSTRAINT "kill_triggers_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_entries" ADD CONSTRAINT "loss_entries_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_snapshots" ADD CONSTRAINT "upload_snapshots_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zoho_drafts" ADD CONSTRAINT "zoho_drafts_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loss_quarter" ON "loss_entries" USING btree ("quarter");--> statement-breakpoint
CREATE UNIQUE INDEX "rec_cycle_sku" ON "recommendations" USING btree ("cycle_id","sku_id");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_cycle_dist" ON "zoho_drafts" USING btree ("cycle_id","distributor_id");