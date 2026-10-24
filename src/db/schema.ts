import {
  boolean, integer, jsonb, numeric, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import type { Dataset } from "@/lib/data/csv";
import type { Assessment, RuleSettings } from "@/lib/rules/types";

export const roleEnum = pgEnum("role", ["planner", "backup", "admin"]);
export const decisionEnum = pgEnum("decision", ["pending", "approved", "changed", "rejected"]);
export const cycleStatusEnum = pgEnum("cycle_status", ["open", "closed"]);

// ---- people. No sign-in: the app has a simple "working as" picker so every action is logged with a name.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  role: roleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- rules, versioned. Rows are never edited: a change adds a new version.
export const ruleVersions = pgTable("rule_versions", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull().unique(),
  settings: jsonb("settings").$type<RuleSettings>().notNull(),
  changeNote: text("change_note").notNull(),
  changedBy: uuid("changed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- uploads, kept as dated snapshots so a past cycle can be reproduced
export const uploadSnapshots = pgTable("upload_snapshots", {
  id: serial("id").primaryKey(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  /** Stock date from the inventory file (YYYY-MM-DD). */
  asOfDate: text("as_of_date").notNull(),
  filesUploaded: jsonb("files_uploaded").$type<string[]>().notNull(),
  dataset: jsonb("dataset").$type<Dataset>().notNull(),
  warnings: jsonb("warnings").$type<{ file: string; row?: number; message: string }[]>().notNull().default([]),
});

// ---- weekly review cycles
export const cycles = pgTable("cycles", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id").notNull().references(() => uploadSnapshots.id),
  ruleVersionId: integer("rule_version_id").notNull().references(() => ruleVersions.id),
  status: cycleStatusEnum("status").notNull().default("open"),
  /** Open Zoho order quantity per SKU used for this cycle. Null = Zoho was not connected. */
  openOrders: jsonb("open_orders").$type<Record<string, number> | null>(),
  openedBy: uuid("opened_by").references(() => users.id),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedBy: uuid("closed_by").references(() => users.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const recommendations = pgTable(
  "recommendations",
  {
    id: serial("id").primaryKey(),
    cycleId: integer("cycle_id").notNull().references(() => cycles.id),
    skuId: text("sku_id").notNull(),
    assessment: jsonb("assessment").$type<Assessment>().notNull(),
    /** One of the 2 random unflagged SKUs Raghav double-checks each cycle. */
    spotCheck: boolean("spot_check").notNull().default(false),
    decision: decisionEnum("decision").notNull().default("pending"),
    /** Quantity actually approved (differs from the rule's number when changed). */
    finalQty: integer("final_qty"),
    reason: text("reason"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("rec_cycle_sku").on(t.cycleId, t.skuId)],
);

/** Append-only decision log: every approve, change and reject. */
export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  cycleId: integer("cycle_id").notNull().references(() => cycles.id),
  recommendationId: integer("recommendation_id").notNull().references(() => recommendations.id),
  skuId: text("sku_id").notNull(),
  action: decisionEnum("action").notNull(),
  ruleQty: integer("rule_qty"),
  finalQty: integer("final_qty"),
  reason: text("reason"),
  byUser: uuid("by_user").references(() => users.id),
  /** True when the Backup approver acted instead of Raghav. */
  asBackup: boolean("as_backup").notNull().default(false),
  ruleVersionId: integer("rule_version_id").notNull().references(() => ruleVersions.id),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Zoho
export const zohoItemMap = pgTable("zoho_item_map", {
  skuId: text("sku_id").primaryKey(),
  zohoItemId: text("zoho_item_id").notNull(),
});
export const zohoVendorMap = pgTable("zoho_vendor_map", {
  distributorId: text("distributor_id").primaryKey(),
  zohoVendorId: text("zoho_vendor_id").notNull(),
});
export const zohoDrafts = pgTable(
  "zoho_drafts",
  {
    id: serial("id").primaryKey(),
    cycleId: integer("cycle_id").notNull().references(() => cycles.id),
    distributorId: text("distributor_id").notNull(),
    zohoPoId: text("zoho_po_id"),
    zohoPoNumber: text("zoho_po_number"),
    status: text("status").notNull(), // pending | created | failed
    /** What Zoho reports for the order (it should say "draft"). */
    zohoStatus: text("zoho_status"),
    referenceNumber: text("reference_number").notNull(),
    lines: jsonb("lines").$type<{ skuId: string; itemId: string; qty: number }[]>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("draft_cycle_dist").on(t.cycleId, t.distributorId)],
);

// ---- results tracker and safeguards
export const lossEntries = pgTable(
  "loss_entries",
  {
    id: serial("id").primaryKey(),
    quarter: text("quarter").notNull(), // e.g. 2026-Q4
    stockoutLossInr: numeric("stockout_loss_inr", { precision: 14, scale: 0 }).notNull(),
    overstockLossInr: numeric("overstock_loss_inr", { precision: 14, scale: 0 }).notNull(),
    note: text("note"),
    enteredBy: uuid("entered_by").references(() => users.id),
    enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("loss_quarter").on(t.quarter)],
);

/** Open purchase orders last read from Zoho. Replaced in full on every read. */
export const zohoOpenOrders = pgTable("zoho_open_orders", {
  poId: text("po_id").primaryKey(),
  poNumber: text("po_number").notNull(),
  vendorId: text("vendor_id").notNull(),
  vendorName: text("vendor_name").notNull(),
  status: text("status").notNull(),
  orderDate: text("order_date"),
  expectedDate: text("expected_date"),
  referenceNumber: text("reference_number"),
  lines: jsonb("lines").$type<{ itemId: string; qty: number; received: number }[]>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Small named values, e.g. how the last Zoho read went. */
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const killTriggers = pgTable("kill_triggers", {
  id: serial("id").primaryKey(),
  /** rejected_stockouts | repeat_stockout:<SKU> | no_improvement. Each fires once. */
  code: text("code").notNull().unique(),
  detail: text("detail").notNull(),
  firedAt: timestamp("fired_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
});
