// Builds dist/activity.svg: an animated area chart of the last 31 days of contributions.
// Replaces github-readme-activity-graph.vercel.app, which stopped serving (HTTP 402).
// Usage: GITHUB_TOKEN=... node .github/scripts/activity.mjs <login> <out.svg>
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [login = "sja-thedude", out = "dist/activity.svg"] = process.argv.slice(2);
const DAYS = 31;

const query = `query($login: String!) { user(login: $login) { contributionsCollection {
  contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { login } }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));

const days = json.data.user.contributionsCollection.contributionCalendar.weeks
  .flatMap((w) => w.contributionDays)
  .slice(-DAYS);

const W = 1200, H = 360, L = 70, R = 40, T = 90, B = 60;
const max = Math.max(4, ...days.map((d) => d.contributionCount));
const x = (i) => L + (i * (W - L - R)) / (days.length - 1);
const y = (n) => T + (H - T - B) * (1 - n / max);

// Smooth curve through the points (Catmull-Rom → cubic Bézier).
const pts = days.map((d, i) => [x(i), y(d.contributionCount)]);
let line = `M${pts[0][0]},${pts[0][1]}`;
for (let i = 0; i < pts.length - 1; i++) {
  const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
  const clampY = (v) => Math.min(H - B, Math.max(T - 10, v));
  const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clampY(p1[1] + (p2[1] - p0[1]) / 6)];
  const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clampY(p2[1] - (p3[1] - p1[1]) / 6)];
  line += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
}
const area = `${line} L${x(days.length - 1)},${H - B} L${x(0)},${H - B} Z`;

const total = days.reduce((s, d) => s + d.contributionCount, 0);
const best = days.reduce((a, d) => (d.contributionCount > a.contributionCount ? d : a));
const fmt = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const grid = [0, 0.25, 0.5, 0.75, 1]
  .map((f) => {
    const v = Math.round(max * f);
    return `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="#1F2430"/>` +
      `<text x="${L - 12}" y="${y(v) + 4}" text-anchor="end" class="m">${v}</text>`;
  })
  .join("");
const labels = days
  .map((d, i) => (i % 5 === 0 || i === days.length - 1 ? `<text x="${x(i)}" y="${H - B + 24}" text-anchor="middle" class="m">${fmt(d.date)}</text>` : ""))
  .join("");
const dots = pts
  .map(([px, py], i) =>
    `<circle cx="${px}" cy="${py}" r="3.5" fill="#0E0F13" stroke="#22D3EE" stroke-width="2" style="animation-delay:${(0.9 + i * 0.05).toFixed(2)}s" class="dot"><title>${fmt(days[i].date)}: ${days[i].contributionCount}</title></circle>`)
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${login}: ${total} contributions in the last ${DAYS} days">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07080C"/><stop offset="1" stop-color="#0E0F13"/></linearGradient>
  <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22D3EE" stop-opacity=".45"/><stop offset="1" stop-color="#A78BFA" stop-opacity="0"/></linearGradient>
  <linearGradient id="stroke" x1="0" x2="1"><stop offset="0" stop-color="#A78BFA"/><stop offset=".5" stop-color="#22D3EE"/><stop offset="1" stop-color="#C9A227"/></linearGradient>
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .m { fill: #6B7280; font-size: 11px; }
    .line { stroke-dasharray: 4000; stroke-dashoffset: 4000; animation: draw 2.2s ease-out forwards; }
    @keyframes draw { to { stroke-dashoffset: 0 } }
    .area { opacity: 0; animation: fade 1.2s ease-out .8s forwards; }
    .dot { opacity: 0; animation: fade .3s ease-out forwards; }
    @keyframes fade { to { opacity: 1 } }
  </style>
</defs>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="16" fill="url(#bg)" stroke="#22D3EE" stroke-opacity=".3"/>
<text x="32" y="44" fill="#F5F7FA" font-size="20" font-weight="700" style="font-family:'Segoe UI',-apple-system,Helvetica,Arial,sans-serif">Contribution activity</text>
<text x="32" y="66" class="m">last ${DAYS} days · updated ${fmt(days[days.length - 1].date)}</text>
<text x="${W - 32}" y="44" text-anchor="end" fill="#22D3EE" font-size="20" font-weight="700">${total}</text>
<text x="${W - 32}" y="66" text-anchor="end" class="m">contributions · best day ${best.contributionCount} (${fmt(best.date)})</text>
${grid}${labels}
<path class="area" d="${area}" fill="url(#fill)"/>
<path class="line" d="${line}" fill="none" stroke="url(#stroke)" stroke-width="3" stroke-linecap="round"/>
${dots}
</svg>
`;

await mkdir(dirname(out), { recursive: true });
await writeFile(out, svg);
console.log(`wrote ${out}: ${total} contributions over ${days.length} days`);
