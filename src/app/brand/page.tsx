import Rooty from "@/components/Rooty";
import SnackIcon, { CATEGORIES } from "@/components/SnackIcon";
import StatusBadge from "@/components/StatusBadge";

const COLORS = [
  ["Cream", "#FBF6E9", "Page background"],
  ["Paper", "#FFFDF7", "Cards"],
  ["Ink", "#1F2A24", "Body text"],
  ["Deep green", "#173D2D", "Headings"],
  ["Leaf green", "#256B47", "Buttons, OK"],
  ["Mint", "#E3F0E6", "Soft green fills"],
  ["Harvest gold", "#E8A628", "Accents"],
  ["Butter", "#FBEBC6", "Overstock, warnings"],
  ["Terracotta", "#A7351E", "Stockout risk"],
  ["Plum", "#583B78", "High demand"],
];

export default function BrandPage() {
  return (
    <main className="page">
      <h1>Brand kit</h1>
      <p className="muted">Warm and calm, like a good grocery shelf. The same files live in the project&apos;s <code>design</code> folder.</p>

      <section className="card rise">
        <h2>Colour</h2>
        <ul className="swatches">
          {COLORS.map(([name, hex, use]) => (
            <li key={name}>
              <span className="swatch" style={{ background: hex }} />
              <strong>{name}</strong>
              <span className="small muted">{hex} · {use}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card rise">
        <h2>Type</h2>
        <p style={{ fontFamily: "var(--font-heading)", fontSize: "2rem", margin: 0, color: "var(--deep)" }}>Bricolage Grotesque for headings</p>
        <p style={{ margin: "8px 0 0" }}>DM Sans for body text. Nothing is smaller than 13px, and buttons are at least 44px tall.</p>
      </section>

      <section className="card rise">
        <h2>Rooty</h2>
        <div className="brand-row">
          <Rooty size={120} />
          <p className="muted">Rooty only appears on Home and on the All clear screen. He bobs gently, and holds still if the device asks for less motion.</p>
        </div>
      </section>

      <section className="card rise">
        <h2>Snack icons</h2>
        <ul className="icons">
          {CATEGORIES.map((c) => (
            <li key={c}><SnackIcon category={c} size={36} /><span className="small">{c}</span></li>
          ))}
        </ul>
      </section>

      <section className="card rise">
        <h2>Status</h2>
        <p className="muted">Status is always a coloured dot plus a word. Only the stockout dot pulses.</p>
        <div className="brand-row wrap">
          <StatusBadge status="stockout" />
          <StatusBadge status="overstock" />
          <StatusBadge status="ok" />
          <StatusBadge status="needs_judgment" />
          <StatusBadge status="ok" highDemand />
        </div>
      </section>
    </main>
  );
}
