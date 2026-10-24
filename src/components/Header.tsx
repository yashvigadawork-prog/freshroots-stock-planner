import Link from "next/link";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import ActorPicker from "./ActorPicker";
import Nav from "./Nav";

export default async function Header() {
  const db = await getDb();
  const { actor, everyone } = await getActor(db);
  return (
    <header className="topbar">
      <div className="topbar-top">
        <Link href="/" className="logo">Freshroots <span>Stock Planner</span></Link>
        <ActorPicker current={actor.id} everyone={everyone} />
      </div>
      <Nav />
    </header>
  );
}
