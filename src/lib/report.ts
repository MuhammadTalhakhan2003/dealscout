import { nextAction } from "./score";
import type { BuyBox, ScoredLead, Tier } from "./types";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const TIER_COLOR: Record<Tier, string> = { A: "#059669", B: "#b08c27", C: "#0284c7", D: "#6b7280" };

function leadName(r: ScoredLead) {
  return r.lead.name ?? (r.lead.enrichment?.ok ? r.lead.enrichment.name : undefined) ?? r.lead.domain;
}

function location(r: ScoredLead) {
  const e = r.lead.enrichment;
  return e?.city ? `${e.city}${e.region ? `, ${e.region}` : ""}` : r.lead.location;
}

/**
 * A self-contained, print-ready HTML brief: who to call first, why, and how to reach them.
 * Designed to be forwarded to a partner or investor, or printed to PDF.
 */
export function buildBrief(rows: ScoredLead[], box: BuyBox, generatedAt = new Date()): string {
  const done = rows.filter((r) => r.lead.status === "done" || r.lead.status === "error");
  const ranked = [...done].sort((a, b) => b.score.total - a.score.total);
  const tiers: Record<Tier, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const r of done) tiers[r.score.tier]++;
  const callFirst = ranked.filter((r) => r.lead.enrichment?.ok && (r.score.tier === "A" || r.score.tier === "B")).slice(0, 10);
  const shown = new Set(callFirst.map((r) => r.lead.id));
  const rest = ranked.filter((r) => !shown.has(r.lead.id));
  const verified = done.filter((r) => r.lead.enrichment?.emails.some((m) => m.mx === "valid")).length;
  const owners = done.filter((r) => r.lead.enrichment?.people.length || r.lead.owner).length;
  const date = generatedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const boxText =
    [
      box.industries.length ? `Industries: ${box.industries.join(", ")}` : "",
      box.regions.length ? `Geography: ${box.regions.join(", ")}` : "",
      box.foundedBefore ? `Founded before ${box.foundedBefore}` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "No buy box set — ranked on seller readiness alone";

  const card = (r: ScoredLead, i: number) => {
    const e = r.lead.enrichment;
    const owner = e?.people[0] ? `${e.people[0].name} (${e.people[0].title})` : r.lead.owner;
    const contact = e?.emails[0]?.address ?? r.lead.email ?? e?.phones[0] ?? r.lead.phone;
    const action = nextAction(r.lead);
    const meta = [r.lead.domain, location(r), e?.foundedYear ? `Founded ${e.foundedYear}` : ""].filter(Boolean).join(" · ");
    return `<article class="lead">
  <div class="rank">${i + 1}</div>
  <div class="body">
    <div class="head"><h3>${esc(leadName(r))}</h3><span class="tier" style="--c:${TIER_COLOR[r.score.tier]}">Tier ${r.score.tier} · ${r.score.total}</span></div>
    <div class="meta">${esc(meta)}</div>
    <ul>${r.score.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
    <div class="grid">
      <div><span>Decision-maker</span>${esc(owner ?? "Not identified yet")}</div>
      <div><span>Best contact</span>${esc(contact ?? "—")}</div>
    </div>
    <div class="action">→ ${esc(action.label)}${action.detail ? ` <em>${esc(action.detail)}</em>` : ""}</div>
  </div>
</article>`;
  };

  const restRows = rest
    .map(
      (r) => `<tr><td>${esc(leadName(r))}<small>${esc(r.lead.domain)}</small></td>
<td><b style="color:${TIER_COLOR[r.score.tier]}">${r.score.tier} · ${r.score.total}</b></td>
<td>${esc(r.lead.enrichment?.ok ? (r.score.highlights[0] ?? "Limited signals") : (r.lead.enrichment?.error ?? r.lead.error ?? "Not analysed"))}</td>
<td>${esc(nextAction(r.lead).label)}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DealScout Pipeline Brief — ${esc(date)}</title>
<style>
  :root{--ink:#111114;--muted:#5f6170;--line:#e7e5df;--gold:#b08c27;--bg:#fbfaf7}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  main{max-width:860px;margin:0 auto;padding:48px 28px 64px}
  header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:2px solid var(--ink);padding-bottom:16px}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.01em}
  .mark{width:28px;height:28px;border-radius:8px;background:#ecc85f;display:grid;place-items:center;font-size:15px}
  h1{font-size:28px;margin:18px 0 4px;letter-spacing:-.02em} .sub{color:var(--muted);margin:0}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:24px 0 8px}
  .kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
  .kpi b{display:block;font-size:24px;letter-spacing:-.02em} .kpi span{color:var(--muted);font-size:12px}
  .tiers{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 0;color:var(--muted);font-size:12px}
  .tiers i{font-style:normal;font-weight:600}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:36px 0 12px}
  .lead{display:flex;gap:14px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:10px;break-inside:avoid}
  .rank{flex:none;width:28px;height:28px;border-radius:50%;background:var(--ink);color:#fff;display:grid;place-items:center;font-weight:600;font-size:13px}
  .body{flex:1;min-width:0} .head{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
  h3{margin:0;font-size:17px;letter-spacing:-.01em}
  .tier{flex:none;font-size:12px;font-weight:700;color:var(--c);border:1px solid var(--c);border-radius:999px;padding:1px 9px}
  .meta{color:var(--muted);font-size:12.5px;margin-top:2px}
  ul{margin:10px 0;padding-left:18px} li{margin:2px 0}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px}
  .grid span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  .action{margin-top:10px;padding:8px 12px;border-radius:10px;background:#fbf4dc;color:#6b5314;font-weight:600;font-size:13px}
  .action em{font-style:normal;font-weight:400;color:#8a6d1f;margin-left:4px}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:13px}
  th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);background:#f6f4ee}
  td small{display:block;color:var(--muted)}
  footer{margin-top:36px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:14px}
  @media (max-width:640px){.kpis{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}}
  @media print{body{background:#fff}main{padding:0}.lead,.kpi,table{border-color:#ddd}}
</style></head>
<body><main>
<header>
  <div class="brand"><span class="mark">◎</span> DealScout</div>
  <div class="sub">${esc(date)}</div>
</header>
<h1>Pipeline Brief</h1>
<p class="sub">${esc(boxText)}</p>
<section class="kpis">
  <div class="kpi"><b>${done.length}</b><span>Companies analysed</span></div>
  <div class="kpi"><b>${tiers.A}</b><span>Priority targets (Tier A)</span></div>
  <div class="kpi"><b>${verified}</b><span>With MX-verified email</span></div>
  <div class="kpi"><b>${owners}</b><span>Decision-makers named</span></div>
</section>
<div class="tiers">Tier mix: <i style="color:${TIER_COLOR.A}">A ${tiers.A}</i> · <i style="color:${TIER_COLOR.B}">B ${tiers.B}</i> · <i style="color:${TIER_COLOR.C}">C ${tiers.C}</i> · <i style="color:${TIER_COLOR.D}">D ${tiers.D}</i></div>
<h2>Call first</h2>
${callFirst.length ? callFirst.map(card).join("\n") : `<p class="sub">No Tier A or B leads yet — widen the buy box or add more leads.</p>`}
${rest.length ? `<h2>Everything else</h2><table><thead><tr><th>Company</th><th>Score</th><th>Top signal</th><th>Next step</th></tr></thead><tbody>${restRows}</tbody></table>` : ""}
<footer>Generated by DealScout. Scores are explainable estimates from public website data — verify ownership and details before outreach. Sites that block automated access were skipped, not forced.</footer>
</main></body></html>`;
}
