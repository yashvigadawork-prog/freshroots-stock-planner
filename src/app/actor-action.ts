"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTOR_COOKIE } from "@/lib/actor";

export async function setActorAction(userId: string): Promise<void> {
  (await cookies()).set(ACTOR_COOKIE, userId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
