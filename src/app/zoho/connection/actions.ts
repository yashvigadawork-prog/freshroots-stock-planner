"use server";

import { revalidatePath } from "next/cache";
import { testConnection } from "@/lib/services/zoho";
import { syncOpenOrders } from "@/lib/services/zoho";
import { getDb } from "@/db";

export type TestState = { ok: boolean; text: string } | null;

/** Read-only: asks Zoho for one purchase order. Shows a tick or a plain-English reason. */
export async function testConnectionAction(): Promise<TestState> {
  const r = await testConnection();
  if (r.ok) {
    await syncOpenOrders(await getDb());
    revalidatePath("/", "layout");
    return { ok: true, text: "Connected. Zoho answered and the saved credentials work." };
  }
  return { ok: false, text: r.error };
}
