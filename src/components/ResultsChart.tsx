import { BASELINE_HIGH, BASELINE_LOW, LAKH, TARGET_CUT } from "@/lib/results";

type Bar = { quarter: string; stockoutInr: number; overstockInr: number };

/** Stacked loss per quarter against the baseline band and the 25% target band. */
export default function ResultsChart({ bars }: { bars: Bar[] }) {
  const W = 680, H = 280, L = 52, R = 12, T = 12, B = 36;
  const maxL = Math.max(40, Math.ceil(Math.max(0, ...bars.map((b) => (b.stockoutInr + b.overstockInr) / LAKH)) * 1.1 / 5) * 5);
  const y = (lakh: number) => T + (H - T - B) * (1 - lakh / maxL);
  const slots = Math.max(bars.length, 4);
  const bw = (W - L - R) / slots;
  const tLow = (BASELINE_LOW * (1 - TARGET_CUT)) / LAKH;
  const tHigh = (BASELINE_HIGH * (1 - TARGET_CUT)) / LAKH;
  const ticks = [0, 10, 20, 30, 40].filter((t) => t <= maxL);
  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 560 }} role="img" aria-labelledby="rc-t rc-d">
        <title id="rc-t">Quarterly stockout and overstock losses against baseline and target</title>
        <desc id="rc-d">{`Baseline is 28 to 34 lakh a quarter. Target is 21 to 25.5 lakh. ${bars.length ? `${bars.length} quarters entered.` : "No quarters entered yet."}`}</desc>
        <rect x={L} width={W - L - R} y={y(BASELINE_HIGH / LAKH)} height={y(BASELINE_LOW / LAKH) - y(BASELINE_HIGH / LAKH)} fill="#fbebc6" />
        <rect x={L} width={W - L - R} y={y(tHigh)} height={y(tLow) - y(tHigh)} fill="#e3f0e6" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e4dcc6" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="13" fill="#55635b">{t}</text>
          </g>
        ))}
        <text x={W - R - 4} y={y(BASELINE_HIGH / LAKH) + 15} textAnchor="end" fontSize="13" fill="#7a5300">Baseline 28 to 34</text>
        <text x={W - R - 4} y={y(tLow) - 5} textAnchor="end" fontSize="13" fill="#256B47">Target 21 to 25.5</text>
        {bars.map((b, i) => {
          const x = L + i * bw + bw * 0.2;
          const w = bw * 0.6;
          const so = b.stockoutInr / LAKH;
          const ov = b.overstockInr / LAKH;
          return (
            <g key={b.quarter}>
              <rect x={x} y={y(so)} width={w} height={y(0) - y(so)} fill="#A7351E"><title>{`${b.quarter} stockout: ${so.toFixed(2)} lakh`}</title></rect>
              <rect x={x} y={y(so + ov)} width={w} height={y(so) - y(so + ov)} fill="#E8A628"><title>{`${b.quarter} overstock: ${ov.toFixed(2)} lakh`}</title></rect>
              <text x={x + w / 2} y={y(so + ov) - 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1F2A24">{(so + ov).toFixed(1)}</text>
              <text x={x + w / 2} y={H - B + 18} textAnchor="middle" fontSize="13" fill="#55635b">{b.quarter}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span><i style={{ background: "#A7351E" }} />Stockout loss</span>
        <span><i style={{ background: "#E8A628" }} />Overstock loss</span>
        <span><i style={{ background: "#fbebc6", border: "1px solid #e4dcc6" }} />Baseline range</span>
        <span><i style={{ background: "#e3f0e6", border: "1px solid #bfdcc7" }} />Target range</span>
        <span className="muted">₹ lakh</span>
      </div>
    </div>
  );
}
