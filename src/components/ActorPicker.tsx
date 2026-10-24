"use client";

import { useTransition } from "react";
import { setActorAction } from "@/app/actor-action";

const ROLE: Record<string, string> = { planner: "Planner", backup: "Backup approver", admin: "Admin" };

export default function ActorPicker({ current, everyone }: { current: string; everyone: { id: string; name: string; role: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <label className="actor">
      <span className="small">Working as</span>
      <select
        aria-label="Working as"
        value={current}
        disabled={pending}
        onChange={(e) => start(() => setActorAction(e.target.value))}
      >
        {everyone.map((u) => (
          <option key={u.id} value={u.id}>{u.name} ({ROLE[u.role]})</option>
        ))}
      </select>
    </label>
  );
}
