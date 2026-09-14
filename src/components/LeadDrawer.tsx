"use client";

import {
  Check,
  CircleAlert,
  Cpu,
  ExternalLink,
  Globe,
  LoaderCircle,
  Mail,
  MailCheck,
  MapPin,
  Phone,
  RefreshCw,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { FACTOR_META, nextAction } from "@/lib/score";
import { STAGES, type Lead, type ScoredLead, type SenderProfile, type Tone } from "@/lib/types";
import { displayName } from "./LeadsTable";
import {
  Button,
  Chip,
  CopyButton,
  Favicon,
  NextActionIcon,
  ScoreRing,
  Segmented,
  TIER_STYLE,
  TierBadge,
  cn,
  inputClass,
} from "./ui";

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-t border-ink-800 px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "grid size-4 place-items-center rounded-full",
          ok ? "bg-emerald-400/15 text-emerald-300" : "bg-ink-700 text-ink-500",
        )}
      >
        {ok ? <Check className="size-2.5" /> : <X className="size-2.5" />}
      </span>
      <span className={ok ? "text-ink-200" : "text-ink-500"}>{label}</span>
    </div>
  );
}

export function LeadDrawer({
  item,
  sender,
  aiEnabled,
  onClose,
  onUpdate,
  onRecrawl,
}: {
  item: ScoredLead;
  sender: SenderProfile;
  aiEnabled: boolean;
  onClose: () => void;
  onUpdate: (patch: Partial<Lead>) => void;
  onRecrawl: () => void;
}) {
  const { lead, score } = item;
  const e = lead.enrichment?.ok ? lead.enrichment : undefined;
  const [tone, setTone] = useState<Tone>("warm");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = lead.outreach;
  const pending = lead.status === "queued" || lead.status === "enriching";
  const action = nextAction(lead);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function generate(regenerate = false) {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: lead.domain,
          company: displayName(lead),
          ownerName: e?.people[0]?.name ?? lead.owner,
          industry: lead.industry,
          location: [e?.city, e?.region].filter(Boolean).join(", ") || lead.location,
          foundedYear: e?.foundedYear,
          description: e?.description,
          headings: e?.headings,
          signals: score.highlights,
          gaps: score.factors.find((f) => f.key === "upside")?.evidence ?? [],
          websiteExcerpt: e?.textSample,
          sender,
          tone,
          regenerate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onUpdate({ outreach: data.draft });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate outreach");
    } finally {
      setGenerating(false);
    }
  }

  const bestEmail = e?.emails[0]?.address ?? lead.email;
  const mailto =
    draft &&
    `mailto:${bestEmail ?? ""}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.email)}`;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]" />
      <aside className="animate-slide-in scrollbar-thin relative flex h-full w-full max-w-[560px] flex-col overflow-y-auto border-l border-ink-800 bg-ink-900 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-ink-800 bg-ink-900/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start gap-3">
            <Favicon domain={lead.domain} size={36} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold tracking-tight text-ink-100">{displayName(lead)}</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
                <a
                  href={e?.url ?? `https://${lead.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-gold-300"
                >
                  {lead.domain} <ExternalLink className="size-3" />
                </a>
                {(e?.city || lead.location) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {e?.city ? `${e.city}${e.region ? `, ${e.region}` : ""}` : lead.location}
                  </span>
                )}
                {lead.industry && <Chip>{lead.industry}</Chip>}
              </div>
            </div>
            <button onClick={onClose} className="cursor-pointer rounded-md p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100" aria-label="Close panel">
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <ScoreRing value={score.total} tier={score.tier} size={60} stroke={5} />
            <div className="min-w-0 flex-1">
              <TierBadge tier={score.tier} />
              <p className="mt-1.5 text-xs text-ink-400">
                Evidence coverage <span className="font-semibold text-ink-200">{Math.round(score.coverage * 100)}%</span> of
                scoring weight
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1">
            {STAGES.map((s) => (
              <button
                key={s.key}
                onClick={() => onUpdate({ stage: s.key })}
                className={cn(
                  "cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  lead.stage === s.key
                    ? "bg-gold-400 text-ink-950"
                    : "bg-ink-800 text-ink-400 ring-1 ring-inset ring-ink-700 hover:text-ink-200",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {!pending && (
            <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-gold-400/[0.06] px-3 py-2.5 ring-1 ring-inset ring-gold-400/25">
              <NextActionIcon kind={action.kind} className="mt-0.5 size-4 shrink-0 text-gold-300" />
              <div className="min-w-0">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gold-300/80">Next best action</div>
                <div className="text-sm font-medium text-ink-100">{action.label}</div>
                {action.detail && <div className="truncate text-xs text-ink-400">{action.detail}</div>}
              </div>
            </div>
          )}
        </div>

        {pending && (
          <div className="flex items-center gap-2 px-5 py-4 text-sm text-ink-300">
            <LoaderCircle className="size-4 animate-spin text-gold-400" /> Crawling {lead.domain}…
          </div>
        )}
        {!pending && !e && (
          <div className="mx-5 my-4 flex items-start gap-2 rounded-lg bg-amber-400/5 p-3 text-xs text-amber-200 ring-1 ring-amber-400/20">
            <CircleAlert className="mt-px size-4 shrink-0" />
            <div>
              <p className="font-medium">{lead.enrichment?.error ?? lead.error ?? "Site could not be analysed."}</p>
              <p className="mt-1 text-amber-200/70">
                Scored from imported data only. We never bypass CAPTCHAs or robots.txt — verify this one by hand.
              </p>
            </div>
          </div>
        )}

        {/* AI outreach */}
        <Section
          title="Owner outreach"
          action={
            draft && (
              <span className="text-[11px] text-ink-500">
                {draft.source === "claude" ? `Claude · ${draft.model ?? "opus"}` : "Template"}
              </span>
            )
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={tone}
              onChange={setTone}
              options={[
                { value: "warm", label: "Warm" },
                { value: "direct", label: "Direct" },
                { value: "formal", label: "Formal" },
              ]}
            />
            <Button variant="primary" size="sm" disabled={generating || pending} onClick={() => generate(!!draft)}>
              {generating ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              {generating ? "Drafting…" : draft ? "Regenerate" : aiEnabled ? "Draft with Claude" : "Draft outreach"}
            </Button>
          </div>
          {!sender.name && !draft && (
            <p className="mt-2 text-[11px] text-ink-500">Tip: add your name in “Your searcher profile” so drafts are signed.</p>
          )}
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
          {draft?.note && <p className="mt-2 text-xs text-amber-300/90">{draft.note}</p>}

          {draft && (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg bg-ink-950/60 ring-1 ring-ink-800">
                <div className="flex items-center justify-between border-b border-ink-800 px-3 py-2">
                  <div className="min-w-0 text-sm">
                    <span className="text-ink-500">Subject: </span>
                    <span className="font-medium text-ink-100">{draft.subject}</span>
                  </div>
                  <CopyButton text={`${draft.subject}\n\n${draft.email}`} />
                </div>
                <textarea
                  value={draft.email}
                  onChange={(ev) => onUpdate({ outreach: { ...draft, email: ev.target.value } })}
                  rows={10}
                  className="block w-full resize-y bg-transparent px-3 py-2.5 text-[13px] leading-relaxed text-ink-200 outline-none"
                />
                <div className="flex items-center justify-between border-t border-ink-800 px-3 py-2">
                  <span className="text-[11px] text-ink-500">{bestEmail ? `To: ${bestEmail}` : "No email found — use the call opener"}</span>
                  {mailto && (
                    <a href={mailto} className="inline-flex items-center gap-1.5 rounded-md bg-ink-800 px-2.5 py-1 text-xs font-medium text-ink-100 ring-1 ring-ink-700 hover:bg-ink-750">
                      <Send className="size-3.5" /> Open in mail
                    </a>
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-ink-950/60 p-3 ring-1 ring-ink-800">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cold-call opener</span>
                  <CopyButton text={draft.callOpener} />
                </div>
                <p className="text-[13px] leading-relaxed text-ink-200">“{draft.callOpener}”</p>
              </div>

              <div className="rounded-lg bg-gold-400/[0.04] p-3 ring-1 ring-gold-400/20">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gold-300/80">Why now</span>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-200">{draft.whyNow}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Post-close value creation</span>
                  <ul className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-ink-300">
                    {draft.valueCreationIdeas.map((x) => (
                      <li key={x} className="flex gap-1.5">
                        <span className="text-emerald-400">↗</span>
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">First-call questions</span>
                  <ul className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-ink-300">
                    {draft.diligenceQuestions.map((x) => (
                      <li key={x} className="flex gap-1.5">
                        <span className="text-gold-400">?</span>
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* Score breakdown */}
        <Section title="Why this score">
          <div className="space-y-4">
            {score.factors.map((f) => (
              <div key={f.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-ink-100" title={FACTOR_META[f.key].blurb}>
                    {f.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-ink-500">
                    {!f.active ? "not scored" : f.known ? `${Math.round(f.score * 100)}%` : "unknown"} · weight {f.weight}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700", f.known ? TIER_STYLE[score.tier].bar : "bg-ink-600")}
                    style={{ width: `${(f.known ? f.score : f.active ? 0.3 : 0) * 100}%`, opacity: f.known ? 1 : 0.5 }}
                  />
                </div>
                <ul className="mt-2 space-y-1">
                  {f.evidence.map((x) => (
                    <li key={x} className="flex gap-1.5 text-xs text-ink-300">
                      <Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                      {x}
                    </li>
                  ))}
                  {f.missing.map((x) => (
                    <li key={x} className="flex gap-1.5 text-xs text-ink-500">
                      <CircleAlert className="mt-0.5 size-3 shrink-0 text-amber-400/70" />
                      {x}
                    </li>
                  ))}
                  {!f.known && f.active && (
                    <li className="pl-[18px] text-[11px] italic text-ink-600">Unknown — counted at a conservative 30% prior, so thin data can’t carry a lead.</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* Contacts */}
        <Section title="Contacts">
          <div className="space-y-2">
            {(e?.people ?? []).map((p) => (
              <div key={p.name} className="flex items-center gap-2 text-sm">
                <UserRound className="size-4 text-gold-400" />
                <span className="text-ink-100">{p.name}</span>
                <span className="text-xs text-ink-400">{p.title}</span>
              </div>
            ))}
            {!e?.people.length && lead.owner && (
              <div className="flex items-center gap-2 text-sm">
                <UserRound className="size-4 text-gold-400" />
                <span className="text-ink-100">{lead.owner}</span>
                <span className="text-xs text-ink-400">from import</span>
              </div>
            )}
            {(e?.emails ?? []).map((m) => (
              <div key={m.address} className="flex flex-wrap items-center gap-2 text-sm">
                {m.mx === "valid" ? <MailCheck className="size-4 text-emerald-400" /> : <Mail className="size-4 text-ink-400" />}
                <a href={`mailto:${m.address}`} className="text-ink-100 hover:text-gold-300">
                  {m.address}
                </a>
                <Chip className={m.kind === "direct" ? "text-emerald-300" : m.kind === "personal" ? "text-gold-300" : ""}>
                  {m.kind === "direct" ? "named mailbox" : m.kind === "personal" ? "personal · often owner" : "shared inbox"}
                </Chip>
                <Chip className={m.mx === "valid" ? "text-emerald-300" : "text-rose-300"}>MX {m.mx}</Chip>
              </div>
            ))}
            {(e?.phones ?? (lead.phone ? [lead.phone] : [])).map((p) => (
              <div key={p} className="flex items-center gap-2 text-sm">
                <Phone className="size-4 text-ink-400" />
                <a href={`tel:${p}`} className="text-ink-100 hover:text-gold-300">
                  {p}
                </a>
              </div>
            ))}
            {e && Object.keys(e.socials).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(e.socials).map(([k, url]) => (
                  <a key={k} href={url} target="_blank" rel="noreferrer" className="rounded-md bg-ink-800 px-2 py-1 text-xs capitalize text-ink-300 ring-1 ring-ink-700 hover:text-gold-300">
                    {k}
                  </a>
                ))}
              </div>
            )}
            {e && !e.people.length && !e.emails.length && !e.phones.length && (
              <p className="text-xs text-ink-500">No public contacts found on the site.</p>
            )}
          </div>
        </Section>

        {/* Profile */}
        {e && (
          <Section title="Company profile">
            <div className="space-y-3 text-sm">
              {e.description && <p className="text-xs leading-relaxed text-ink-300">{e.description}</p>}
              {e.foundedYear && (
                <div className="text-xs">
                  <span className="text-ink-400">Founded </span>
                  <span className="font-semibold text-ink-100">{e.foundedYear}</span>
                  {e.foundedEvidence && <span className="ml-1.5 italic text-ink-500">{e.foundedEvidence}</span>}
                </div>
              )}
              {e.address && (
                <div className="flex items-start gap-1.5 text-xs text-ink-300">
                  <MapPin className="mt-px size-3.5 shrink-0 text-ink-500" />
                  {e.address}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-ink-950/50 p-3 ring-1 ring-ink-800 sm:grid-cols-3">
                <Flag ok={e.flags.https} label="HTTPS" />
                <Flag ok={e.flags.mobileViewport} label="Mobile-ready" />
                <Flag ok={e.flags.analytics} label="Analytics" />
                <Flag ok={e.flags.booking} label="Online booking" />
                <Flag ok={e.flags.ecommerce} label="E-commerce" />
                <Flag ok={e.flags.structuredData} label="Schema.org" />
              </div>
              {e.tech.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <Cpu className="mr-0.5 size-3.5 text-ink-500" />
                  {e.tech.map((t) => (
                    <Chip key={t}>{t}</Chip>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        <Section title="Notes">
          <textarea
            value={lead.notes ?? ""}
            onChange={(ev) => onUpdate({ notes: ev.target.value })}
            rows={3}
            placeholder="Call notes, broker intel, next step…"
            className={`${inputClass} resize-y text-[13px]`}
          />
        </Section>

        <div className="mt-auto border-t border-ink-800 px-5 py-3 text-[11px] text-ink-500">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5">
              <Globe className="size-3" />
              {lead.enrichment
                ? `${lead.enrichment.pagesCrawled.length} page${lead.enrichment.pagesCrawled.length === 1 ? "" : "s"} · ${
                    lead.cached ? "served from cache" : `${(lead.enrichment.ms / 1000).toFixed(1)}s crawl`
                  } · ${new Date(lead.enrichment.fetchedAt).toLocaleDateString()}`
                : "Not crawled yet"}
            </span>
            <Button size="sm" variant="ghost" onClick={onRecrawl} disabled={pending}>
              <RefreshCw /> Re-crawl
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
