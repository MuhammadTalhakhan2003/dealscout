"use client";

import {
  ArrowRight,
  Crosshair,
  Download,
  Handshake,
  Kanban,
  Layers,
  MailCheck,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  Table,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildExport, downloadFile, type ExportPreset } from "@/lib/csv";
import { dedupeInputs } from "@/lib/domain";
import { buildBrief } from "@/lib/report";
import { SAMPLE_LEADS } from "@/lib/sample";
import { DEFAULT_BUYBOX, scoreLead } from "@/lib/score";
import type { BuyBox, Enrichment, Lead, LeadInput, ScoredLead, SenderProfile, Stage, Tier } from "@/lib/types";
import { BuyBoxPanel } from "./BuyBoxPanel";
import { LeadDrawer } from "./LeadDrawer";
import { LeadsTable, displayName } from "./LeadsTable";
import { Pipeline } from "./Pipeline";
import { SourcePanel } from "./SourcePanel";
import { Button, Segmented, TIER_STYLE, cn } from "./ui";

const STORAGE = {
  leads: "dealscout.leads.v1",
  box: "dealscout.buybox.v1",
  sender: "dealscout.sender.v1",
  dupes: "dealscout.dupes.v1",
};
const BATCH_SIZE = 12;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode) — the session still works in memory.
  }
}

type SortKey = "score" | "founded" | "name" | "recent";
interface ApiStatus {
  ai: boolean;
  model: string;
  database: string;
}

export default function App() {
  // App renders client-only (see ClientApp), so localStorage seeds state directly — no hydration pass.
  const [initial] = useState(() => {
    const stored = load<Lead[]>(STORAGE.leads, []).map((l) =>
      l.status === "enriching" ? { ...l, status: "queued" as const } : l,
    );
    return { leads: stored, pending: stored.filter((l) => l.status === "queued").map((l) => l.domain) };
  });
  const [leads, setLeads] = useState<Lead[]>(initial.leads);
  const [box, setBox] = useState<BuyBox>(() => ({ ...DEFAULT_BUYBOX, ...load<Partial<BuyBox>>(STORAGE.box, {}) }));
  const [sender, setSender] = useState<SenderProfile>(() => load(STORAGE.sender, { name: "", background: "" }));
  const [dupesRemoved, setDupesRemoved] = useState(() => load(STORAGE.dupes, 0));
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [view, setView] = useState<"table" | "pipeline">("table");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | Tier>("all");
  const [onlyReachable, setOnlyReachable] = useState(false);
  const [sort, setSort] = useState<SortKey>("score");
  const [toast, setToast] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const applyResult = useCallback((r: { domain: string; cached: boolean; enrichment: Enrichment }) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.domain === r.domain
          ? { ...l, enrichment: r.enrichment, cached: r.cached, error: undefined, status: r.enrichment.ok ? "done" : "error" }
          : l,
      ),
    );
  }, []);

  const enrich = useCallback(
    async (domains: string[], force = false) => {
      const wanted = new Set(domains);
      setLeads((prev) => prev.map((l) => (wanted.has(l.domain) ? { ...l, status: "enriching" } : l)));
      for (let i = 0; i < domains.length; i += BATCH_SIZE) {
        const batch = domains.slice(i, i + BATCH_SIZE);
        try {
          const res = await fetch("/api/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domains: batch, force }),
          });
          if (!res.ok || !res.body) throw new Error(`Enrichment service error (HTTP ${res.status})`);
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            let nl: number;
            while ((nl = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              if (line) applyResult(JSON.parse(line));
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Enrichment failed";
          const failed = new Set(batch);
          setLeads((prev) =>
            prev.map((l) => (failed.has(l.domain) && l.status === "enriching" ? { ...l, status: "error", error: message } : l)),
          );
        }
      }
    },
    [applyResult],
  );

  // Resume any crawl interrupted by a page close (deferred so StrictMode's double-mount cancels the first
  // run), and ask the server what's configured.
  useEffect(() => {
    const resume = initial.pending.length ? setTimeout(() => void enrich(initial.pending), 0) : undefined;
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
    return () => clearTimeout(resume);
  }, [enrich, initial]);

  useEffect(() => save(STORAGE.leads, leads), [leads]);
  useEffect(() => save(STORAGE.box, box), [box]);
  useEffect(() => save(STORAGE.sender, sender), [sender]);
  useEffect(() => save(STORAGE.dupes, dupesRemoved), [dupesRemoved]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const addInputs = useCallback(
    (inputs: LeadInput[], origin: string) => {
      const { unique, duplicates } = dedupeInputs(inputs, leads);
      setDupesRemoved((d) => d + duplicates.length);
      if (!unique.length) {
        setToast(`Everything in the ${origin} is already in your workspace (${duplicates.length} duplicates skipped).`);
        return;
      }
      const now = Date.now();
      const fresh: Lead[] = unique.map((input, i) => ({
        ...input,
        id: input.domain,
        status: "queued",
        stage: "new",
        addedAt: now + i,
      }));
      setLeads((prev) => [...fresh, ...prev]);
      setToast(
        `Added ${fresh.length} lead${fresh.length === 1 ? "" : "s"} from the ${origin}` +
          (duplicates.length ? ` · ${duplicates.length} duplicate${duplicates.length === 1 ? "" : "s"} removed` : ""),
      );
      void enrich(fresh.map((l) => l.domain));
    },
    [leads, enrich],
  );

  const updateLead = useCallback((id: string, patch: Partial<Lead>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const scored: ScoredLead[] = useMemo(() => leads.map((lead) => ({ lead, score: scoreLead(lead, box) })), [leads, box]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = scored.filter(({ lead, score }) => {
      if (tierFilter !== "all" && score.tier !== tierFilter) return false;
      if (onlyReachable) {
        const e = lead.enrichment;
        const reachable = e?.emails.some((m) => m.mx === "valid") || !!e?.phones.length || !!lead.email || !!lead.phone;
        if (!reachable) return false;
      }
      if (!q) return true;
      const hay = [displayName(lead), lead.domain, lead.industry, lead.location, lead.enrichment?.city, lead.enrichment?.people[0]?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    const pendingLast = (a: ScoredLead, b: ScoredLead) =>
      Number(a.lead.status === "queued" || a.lead.status === "enriching") -
      Number(b.lead.status === "queued" || b.lead.status === "enriching");
    return rows.sort((a, b) => {
      if (sort === "recent") return b.lead.addedAt - a.lead.addedAt;
      const p = pendingLast(a, b);
      if (p) return p;
      if (sort === "name") return displayName(a.lead).localeCompare(displayName(b.lead));
      if (sort === "founded") return (a.lead.enrichment?.foundedYear ?? 9999) - (b.lead.enrichment?.foundedYear ?? 9999);
      return b.score.total - a.score.total;
    });
  }, [scored, query, tierFilter, onlyReachable, sort]);

  const kpis = useMemo(() => {
    const done = scored.filter((s) => s.lead.status === "done" || s.lead.status === "error");
    const inFlight = scored.length - done.length;
    const aTier = scored.filter((s) => s.lead.status === "done" && s.score.tier === "A").length;
    const verified = scored.filter((s) => s.lead.enrichment?.emails.some((m) => m.mx === "valid")).length;
    const owners = scored.filter((s) => s.lead.enrichment?.people.length || s.lead.owner).length;
    const coverage = done.length ? done.reduce((a, s) => a + s.score.coverage, 0) / done.length : 0;
    return { done: done.length, inFlight, aTier, verified, owners, coverage };
  }, [scored]);

  const tierCounts = useMemo(() => {
    const c: Record<Tier, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const s of scored) if (s.lead.status === "done" || s.lead.status === "error") c[s.score.tier]++;
    return c;
  }, [scored]);

  function exportRows(preset: ExportPreset | "brief") {
    const rows = visible.filter((r) => r.lead.status === "done" || r.lead.status === "error");
    const date = new Date().toISOString().slice(0, 10);
    if (preset === "brief") {
      downloadFile(`dealscout-pipeline-brief-${date}.html`, buildBrief(rows, box), "text/html;charset=utf-8");
    } else {
      downloadFile(`dealscout-${preset}-${date}.csv`, buildExport(rows, preset));
    }
    setExportOpen(false);
    const label = { brief: "pipeline brief", csv: "full CSV", hubspot: "HubSpot import", salesforce: "Salesforce import" }[preset];
    setToast(`Exported ${rows.length} lead${rows.length === 1 ? "" : "s"} (${label}).`);
  }

  const selected = scored.find((s) => s.lead.id === selectedId);

  return (
    <div className="bg-grid min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-800/80 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-4 sm:px-6">
          <div className="grid size-8 place-items-center rounded-lg bg-gold-400 text-ink-950 shadow-[0_0_24px_-4px_rgba(236,200,95,0.6)]">
            <Crosshair className="size-4.5" strokeWidth={2.4} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">
              DealScout <span className="font-normal text-ink-500">for SaaSquatch</span>
            </div>
            <div className="hidden text-[11px] text-ink-400 sm:block">Acquisition-grade lead intelligence for searchers</div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {status && (
              <span
                title={status.ai ? `Outreach drafted by ${status.model}` : "Set ANTHROPIC_API_KEY to enable Claude drafting"}
                className="hidden items-center gap-1.5 rounded-full bg-ink-850 px-2.5 py-1 text-[11px] text-ink-300 ring-1 ring-ink-700 md:inline-flex"
              >
                <span className={cn("size-1.5 rounded-full", status.ai ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" : "bg-ink-500")} />
                {status.ai ? "Claude connected" : "Template mode"}
                <span className="text-ink-600">·</span>
                {status.database === "turso" ? "Turso cache" : "SQLite cache"}
              </span>
            )}
            <div className="relative">
              <Button variant="secondary" disabled={!kpis.done} onClick={() => setExportOpen((o) => !o)}>
                <Download /> Export
              </Button>
              {exportOpen && (
                <>
                  <button aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setExportOpen(false)} />
                  <div className="animate-fade-up absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-xl border border-ink-700 bg-ink-850 p-1 shadow-2xl">
                    <p className="px-3 pb-1 pt-2 text-[11px] text-ink-500">Exports the {visible.length} leads in your current view</p>
                    {(
                      [
                        ["brief", "Pipeline brief", "One-page report of who to call first and why — share or print to PDF"],
                        ["hubspot", "HubSpot import", "Contacts + associated companies, with score & tier"],
                        ["salesforce", "Salesforce leads", "Data Import Wizard format, tier → Rating"],
                        ["csv", "Full CSV", "Every enriched field, signals and notes"],
                      ] as const
                    ).map(([preset, label, hint]) => (
                      <button
                        key={preset}
                        onClick={() => exportRows(preset)}
                        className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left hover:bg-ink-800"
                      >
                        <span className="block text-sm text-ink-100">{label}</span>
                        <span className="block text-[11px] text-ink-400">{hint}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="scrollbar-thin space-y-4 lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-92px)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <SourcePanel onAdd={addInputs} busy={false} />
          <BuyBoxPanel box={box} onChange={setBox} sender={sender} onSenderChange={setSender} />
        </aside>

        <section className="min-w-0 space-y-4">
          {leads.length === 0 ? (
            <EmptyState onSample={() => addInputs(SAMPLE_LEADS, "sample dataset")} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Kpi icon={<Layers />} label="Leads analysed" value={`${kpis.done}`} hint={dupesRemoved ? `${dupesRemoved} duplicates removed` : "No duplicates yet"} />
                <Kpi icon={<Crosshair />} label="Priority targets (A)" value={`${kpis.aTier}`} hint="Call these first" accent />
                <Kpi icon={<MailCheck />} label="MX-verified emails" value={`${kpis.verified}`} hint={`${kpis.owners} decision-makers named`} />
                <Kpi icon={<ShieldCheck />} label="Evidence coverage" value={`${Math.round(kpis.coverage * 100)}%`} hint="Share of score backed by data" />
              </div>

              {kpis.inFlight > 0 && (
                <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/80 px-4 py-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-2 text-ink-300">
                      <Radar className="size-4 animate-pulse text-gold-400" />
                      Crawling {kpis.inFlight} site{kpis.inFlight === 1 ? "" : "s"} — robots.txt respected, 6 in parallel, results stream in live
                    </span>
                    <span className="tabular-nums text-ink-400">
                      {kpis.done}/{leads.length}
                    </span>
                  </div>
                  <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-ink-800">
                    <div className="h-full rounded-full bg-gold-400 transition-all duration-500" style={{ width: `${(kpis.done / Math.max(leads.length, 1)) * 100}%` }} />
                    <div className="animate-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                  </div>
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/80">
                <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-4 py-3">
                  <Segmented
                    value={view}
                    onChange={setView}
                    options={[
                      { value: "table", label: <><Table /> Ranked list</> },
                      { value: "pipeline", label: <><Kanban /> Pipeline</> },
                    ]}
                  />
                  <div className="relative min-w-[180px] flex-1 sm:max-w-[260px]">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search company, owner, city…"
                      className="h-8 w-full rounded-lg border border-ink-700 bg-ink-950/60 pl-8 pr-3 text-xs text-ink-100 outline-none placeholder:text-ink-500 focus:border-gold-500/70"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {(["all", "A", "B", "C", "D"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTierFilter(t)}
                        className={cn(
                          "h-8 cursor-pointer rounded-lg px-2.5 text-xs font-medium ring-1 ring-inset transition-colors",
                          tierFilter === t
                            ? t === "all"
                              ? "bg-ink-700 text-ink-100 ring-ink-600"
                              : TIER_STYLE[t].badge
                            : "text-ink-400 ring-ink-800 hover:text-ink-200",
                        )}
                      >
                        {t === "all" ? "All" : `${t} · ${tierCounts[t]}`}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setOnlyReachable((v) => !v)}
                    className={cn(
                      "h-8 cursor-pointer rounded-lg px-2.5 text-xs font-medium ring-1 ring-inset transition-colors",
                      onlyReachable ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30" : "text-ink-400 ring-ink-800 hover:text-ink-200",
                    )}
                  >
                    Reachable only
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value as SortKey)}
                      className="h-8 cursor-pointer rounded-lg border border-ink-700 bg-ink-850 px-2 text-xs text-ink-200 outline-none"
                    >
                      <option value="score">Sort: Score</option>
                      <option value="founded">Sort: Oldest first</option>
                      <option value="name">Sort: Name</option>
                      <option value="recent">Sort: Recently added</option>
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Clear all leads from this workspace?")) {
                          setLeads([]);
                          setDupesRemoved(0);
                          setSelectedId(null);
                        }
                      }}
                    >
                      <X /> Clear
                    </Button>
                  </div>
                </div>
                {view === "table" ? (
                  <LeadsTable rows={visible} selectedId={selectedId} onSelect={setSelectedId} onStage={(id, s: Stage) => updateLead(id, { stage: s })} />
                ) : (
                  <Pipeline rows={visible} onSelect={setSelectedId} onStage={(id, s) => updateLead(id, { stage: s })} />
                )}
              </div>
            </>
          )}
        </section>
      </main>

      {selected && (
        <LeadDrawer
          key={selected.lead.id}
          item={selected}
          sender={sender}
          aiEnabled={status?.ai ?? false}
          onClose={() => setSelectedId(null)}
          onUpdate={(patch) => updateLead(selected.lead.id, patch)}
          onRecrawl={() => void enrich([selected.lead.domain], true)}
        />
      )}

      {toast && (
        <div className="animate-fade-up fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-ink-700 bg-ink-850/95 px-4 py-2.5 text-sm text-ink-100 shadow-2xl backdrop-blur">
          {toast}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, hint, accent }: { icon: ReactNode; label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-ink-900/80 px-4 py-3", accent ? "border-gold-400/30" : "border-ink-800")}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-400 [&>svg]:size-3.5">
        <span className={accent ? "text-gold-400" : "text-ink-500"}>{icon}</span>
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight", accent ? "text-gold-300" : "text-ink-100")}>{value}</div>
      <div className="text-[11px] text-ink-500">{hint}</div>
    </div>
  );
}

function EmptyState({ onSample }: { onSample: () => void }) {
  const steps = [
    { icon: <Radar />, title: "Enrich from the live web", body: "Crawls each company's site (robots.txt-aware), decodes hidden emails, reads schema.org data and MX-verifies every contact." },
    { icon: <Crosshair />, title: "Rank by seller readiness", body: "An explainable score for succession pressure, value-creation upside, owner reachability and your buy box. Every point shows its evidence." },
    { icon: <Handshake />, title: "Reach the owner", body: "Claude drafts a respectful, specific owner email, a cold-call opener and a post-close value-creation plan. Export to HubSpot or Salesforce." },
  ];
  return (
    <div className="animate-fade-up overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/70">
      <div className="relative px-6 pb-8 pt-10 sm:px-10">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-gold-400/10 blur-3xl" />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-400/10 px-2.5 py-1 text-[11px] font-medium text-gold-300 ring-1 ring-gold-400/25">
          <Sparkles className="size-3" /> Built for searchers & acquisition entrepreneurs
        </span>
        <h1 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-ink-100 sm:text-4xl">
          Stop scrolling lead lists. <span className="text-gold-300">Call the owners most likely to sell.</span>
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-400">
          SaaSquatch finds companies. DealScout tells you which ones to call first, who to ask for, what to say, and what you’d
          improve after you buy.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={onSample} className="h-10 px-4">
            <Sparkles /> Run it on the sample dataset <ArrowRight />
          </Button>
          <span className="text-xs text-ink-500">or paste domains / drop a CSV on the left</span>
        </div>
      </div>
      <div className="grid gap-px border-t border-ink-800 bg-ink-800 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="bg-ink-900 px-6 py-5">
            <div className="flex items-center gap-2 text-gold-400 [&>svg]:size-4">
              {s.icon}
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Step {i + 1}</span>
            </div>
            <h3 className="mt-2 text-sm font-semibold text-ink-100">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-400">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
