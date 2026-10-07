// Tiny dependency-free SVG chart + confidence ring, used by the Sell decision view.
// No libraries: keeps the app offline-capable and the single-file build small.

// ---------------------------------------------------------------------------
//  Line chart with range pills (90 / 30 / 7 days), average line and value labels
// ---------------------------------------------------------------------------
export function trendChartHTML({ points, avg, labels, activeRange, unit = "₹", id = "trend" }){
  const W = 720, H = 210, PADL = 54, PADR = 14, PADT = 16, PADB = 26;
  const n = points.length;
  if (n < 2){
    return `<div class="chartwrap"><div class="empty" style="padding:26px 10px">
      Only <b>${n}</b> recorded day so far — the trend line appears from day 2.
      <div class="dim" style="font-size:12px;margin-top:6px">KrishiMitra records the government price each day it is opened.</div>
    </div></div>`;
  }

  const min = Math.min(...points, avg ?? Infinity);
  const max = Math.max(...points, avg ?? -Infinity);
  const span = Math.max(max - min, 1);
  const lo = min - span * 0.12, hi = max + span * 0.12;

  const x = i => PADL + (i * (W - PADL - PADR)) / (n - 1);
  const y = v => PADT + (1 - (v - lo) / (hi - lo)) * (H - PADT - PADB);

  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${H - PADB} L${x(0).toFixed(1)},${H - PADB} Z`;

  const ticks = [max, (max + min) / 2, min].map(v => `
    <line x1="${PADL}" x2="${W - PADR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#E3EFE6" stroke-width="1"/>
    <text x="${PADL - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#5C6B62">${unit}${Math.round(v).toLocaleString("en-IN")}</text>`).join("");

  const xlabels = (labels || []).map((lb, i) =>
    (i === 0 || i === n - 1 || i === Math.floor(n / 2))
      ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#5C6B62">${lb}</text>` : "").join("");

  const avgLine = avg ? `
    <line x1="${PADL}" x2="${W - PADR}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}"
          stroke="#F28C28" stroke-width="1.4" stroke-dasharray="5 4"/>
    <text x="${W - PADR}" y="${(y(avg) - 6).toFixed(1)}" text-anchor="end" font-size="11" fill="#8A4A12">
      average ${unit}${Math.round(avg).toLocaleString("en-IN")}</text>` : "";

  const last = points[n - 1];
  return `
    <div class="chartwrap">
      <svg viewBox="0 0 ${W} ${H}" class="chart" role="img"
           aria-label="Price trend, ${n} recorded days, latest ${unit}${last}">
        ${ticks}
        <path d="${area}" fill="rgba(28,127,75,.12)"/>
        <path d="${line}" fill="none" stroke="#1B7F4B" stroke-width="2.4" stroke-linejoin="round"/>
        ${avgLine}
        <circle cx="${x(n - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="4.5" fill="#0F5132"/>
        <text x="${(x(n - 1) - 6).toFixed(1)}" y="${(y(last) - 10).toFixed(1)}" text-anchor="end"
              font-size="12" font-weight="700" fill="#0F5132">${unit}${last.toLocaleString("en-IN")}</text>
        ${xlabels}
      </svg>
      <div class="chartfoot">
        <span class="dim">${n} recorded day${n > 1 ? "s" : ""}${activeRange >= 90 && n < 90 ? " — showing all recorded days" : ""}</span>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
//  Confidence ring (SVG donut). Value 0–100, with a label underneath.
// ---------------------------------------------------------------------------
export function confidenceRingHTML(value, label = "CONFIDENCE"){
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const R = 34, C = 2 * Math.PI * R;
  const on = (v / 100) * C;
  return `
    <div class="ring" title="${v}% — computed from data coverage, price spread and weather risk">
      <svg viewBox="0 0 84 84" class="ringsvg">
        <circle cx="42" cy="42" r="${R}" fill="none" stroke="#E3EFE6" stroke-width="8"/>
        <circle cx="42" cy="42" r="${R}" fill="none" stroke="#1B7F4B" stroke-width="8"
                stroke-linecap="round" stroke-dasharray="${on.toFixed(1)} ${(C - on).toFixed(1)}"
                transform="rotate(-90 42 42)"/>
        <text x="42" y="47" text-anchor="middle" font-size="17" font-weight="800" fill="#0F5132">${v}%</text>
      </svg>
      <div class="ringlabel">${label}</div>
    </div>`;
}
