import type { Db } from "@/db";
import { users } from "@/db/schema";

/** The three people the app knows about. There is no sign-in; the header picker chooses who is acting. */
export const DEFAULT_USERS = [
  { name: "Raghav", role: "planner" as const },
  { name: "Backup approver", role: "backup" as const },
  { name: "Admin", role: "admin" as const },
];

export async function ensureUsers(db: Db) {
  const existing = await db.select().from(users);
  if (existing.length) return existing;
  return db.insert(users).values(DEFAULT_USERS).returning();
}
