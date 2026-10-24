import Link from "next/link";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import ActorPicker from "./ActorPicker";

const NAV = [
  ["/", "Home"],
  ["/review", "Review"],
  ["/upload", "Upload data"],
  ["/zoho/orders", "Zoho orders"],
  ["/log", "Decision log"],
  ["/results", "Results"],
  ["/rules", "Rules"],
  ["/zoho/connection", "Zoho connection"],
  ["/brand", "Brand kit"],
] as const;

export default async function Header() {
  const db = await getDb();
  const { actor, everyone } = await getActor(db);
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="logo">Freshroots <span>Stock Planner</span></Link>
        <nav aria-label="Main">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <ActorPicker current={actor.id} everyone={everyone} />
      </div>
    </header>
  );
}
