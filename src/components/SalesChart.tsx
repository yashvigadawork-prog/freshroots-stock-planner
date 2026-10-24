/** 16-week sales bars. The last 12 weeks (the ones averaged) are solid; the first 4 are lighter. */
export default function SalesChart({
  weeks,
  labels,
  average,
  avgWindow,
}: {
  weeks: (number | null)[];
  labels: string[];
  average: number | null;
  avgWindow: number;
}) {
  const W = 640, H = 240, L = 44, R = 12, T = 16, B = 40;
  const vals = weeks.filter((w): w is number => w !== null);
  const top = Math.max(10, Math.ceil(Math.max(...vals, average ?? 0) * 1.15 / 10) * 10);
  const bw = (W - L - R) / weeks.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const ticks = [0, top / 2, top];
  const firstAvg = weeks.length - avgWindow;
  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 560 }} role="img" aria-labelledby="sc-t sc-d">
        <title id="sc-t">{`Units sold each week for the last ${weeks.length} weeks`}</title>
        <desc id="sc-d">{`${vals.length} weeks with data. Average of the last ${avgWindow} weeks: ${average === null ? "none" : average.toFixed(1)} units.`}</desc>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e4dcc6" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="13" fill="#55635b">{Math.round(t)}</text>
          </g>
        ))}
        {weeks.map((v, i) => {
          const x = L + i * bw + bw * 0.14;
          const w = bw * 0.72;
          return (
            <g key={labels[i]}>
              {v === null ? (
                <text x={x + w / 2} y={H - B - 6} textAnchor="middle" fontSize="13" fill="#a7351e">gap</text>
              ) : (
                <rect x={x} y={y(v)} width={w} height={H - B - y(v)} rx="3" fill={i >= firstAvg ? "#256B47" : "#a9cdb6"}>
                  <title>{`${labels[i]}: ${v} units`}</title>
                </rect>
              )}
              <text x={x + w / 2} y={H - B + 16} textAnchor="middle" fontSize="13" fill="#55635b">{labels[i].slice(-3)}</text>
            </g>
          );
        })}
        {average !== null && (
          <g>
            <line x1={L + firstAvg * bw} x2={W - R} y1={y(average)} y2={y(average)} stroke="#e8a628" strokeWidth="2.5" strokeDasharray="6 4" />
            <line x1={L + 8} x2={L + 34} y1={T + 8} y2={T + 8} stroke="#e8a628" strokeWidth="2.5" strokeDasharray="6 4" />
            <text x={L + 42} y={T + 13} fontSize="13" fontWeight="700" fill="#7a5300">{`average of last ${avgWindow} weeks: ${average.toFixed(1)}`}</text>
          </g>
        )}
      </svg>
    </div>
  );
}
