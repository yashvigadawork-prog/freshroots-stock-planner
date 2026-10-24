import { cookies } from "next/headers";
import type { Db } from "@/db";
import { ensureUsers } from "@/lib/services/users";
import type { Actor } from "@/lib/services/decisions";

export const ACTOR_COOKIE = "fr_actor";

/** Who is "working as" right now. No password: it is a simple picker so every action is logged with a name. */
export async function getActor(db: Db): Promise<{ actor: Actor; everyone: Actor[] }> {
  const everyone = (await ensureUsers(db)) as Actor[];
  const id = (await cookies()).get(ACTOR_COOKIE)?.value;
  const actor = everyone.find((u) => u.id === id) ?? everyone.find((u) => u.role === "planner")!;
  return { actor, everyone };
}
