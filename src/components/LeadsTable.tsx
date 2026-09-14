"use client";

import { LoaderCircle, Mail, MailCheck, Phone, TriangleAlert } from "lucide-react";
import { nextAction } from "@/lib/score";
import { STAGES, type Lead, type ScoredLead, type Stage } from "@/lib/types";
import { Favicon, NextActionIcon, ScoreRing, TierBadge, cn } from "./ui";

export function StageSelect({ value, onChange }: { value: Stage; onChange: (s: Stage) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Stage)}
      className="h-8 cursor-pointer rounded-md border border-ink-700 bg-ink-850 px-2 text-xs text-ink-200 outline-none hover:border-ink-600 focus:border-gold-500/70"
    >
      {STAGES.map((s) => (
        <option key={s.key} value={s.key}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

export function displayName(lead: Lead) {
  return lead.name ?? (lead.enrichment?.ok ? lead.enrichment.name : undefined) ?? lead.domain;
}

function Row({
  item,
  selected,
  onSelect,
  onStage,
  index,
}: {
  item: ScoredLead;
  selected: boolean;
  onSelect: () => void;
  onStage: (s: Stage) => void;
  index: number;
}) {
  const { lead, score } = item;
  const e = lead.enrichment?.ok ? lead.enrichment : undefined;
  const pending = lead.status === "queued" || lead.status === "enriching";
  const failed = !pending && !e;
  const owner = e?.people[0] ?? (lead.owner ? { name: lead.owner, title: "from CSV" } : undefined);
  const email = e?.emails[0];
  const phone = e?.phones[0] ?? lead.phone;
  const location = e?.city ? `${e.city}${e.region ? `, ${e.region}` : ""}` : lead.location;
  const action = nextAction(lead);

  return (
    <tr
      onClick={onSelect}
      className={cn(
        "animate-fade-up group cursor-pointer border-t border-ink-800/80 transition-colors hover:bg-ink-850/80",
        selected && "bg-ink-850",
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
    >
      <td className="py-3 pl-4 pr-3">
        <div className="flex items-center gap-3">
          <Favicon domain={lead.domain} size={30} />
          <div className="min-w-0">
            <div className="max-w-[230px] truncate font-medium text-ink-100">{displayName(lead)}</div>
            <div className="flex items-center gap-1.5 text-xs text-ink-400">
              <span className="max-w-[150px] truncate">{lead.domain}</span>
              {location && (
                <>
                  <span className="text-ink-600">·</span>
                  <span className="max-w-[120px] truncate">{location}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3">
        {pending ? (
          <div className="size-11 animate-pulse rounded-full bg-ink-800" />
        ) : (
          <div className="flex items-center gap-2.5">
            <ScoreRing value={score.total} tier={score.tier} />
            <TierBadge tier={score.tier} />
          </div>
        )}
      </td>
      <td className="max-w-[320px] px-3">
        {pending ? (
          <span className="inline-flex items-center gap-2 text-xs text-ink-400">
            <LoaderCircle className="size-3.5 animate-spin text-gold-400" />
            {lead.status === "queued" ? "Queued" : "Crawling site · verifying contacts…"}
          </span>
        ) : failed ? (
          <span className="inline-flex items-start gap-1.5 text-xs text-amber-300/90">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {lead.enrichment?.error ?? lead.error ?? "Could not analyse site"}
          </span>
        ) : (
          <ul className="space-y-0.5 text-xs text-ink-300">
            {score.highlights.slice(0, 2).map((h) => (
              <li key={h} className="flex gap-1.5" title={h}>
                <span className="mt-[5px] size-1 shrink-0 rounded-full bg-gold-400/70" />
                <span className="line-clamp-1">{h}</span>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="max-w-[250px] px-3">
        <div className="flex items-center gap-2">
          {owner ? (
            <span className="min-w-0 truncate text-[13px] text-ink-100" title={`${owner.name} · ${owner.title}`}>
              {owner.name}
              <span className="ml-1.5 text-[11px] text-ink-500">{owner.title}</span>
            </span>
          ) : (
            <span className="text-xs text-ink-500">{pending ? "—" : "Owner not found"}</span>
          )}
          <span className="flex shrink-0 items-center gap-1.5 text-ink-500">
            {email &&
              (email.mx === "valid" ? (
                <MailCheck className="size-3.5 text-emerald-400" aria-label={`MX-verified ${email.kind} email`} />
              ) : (
                <Mail className="size-3.5" aria-label="Email" />
              ))}
            {phone && <Phone className="size-3.5" aria-label="Phone" />}
            {e?.socials.linkedin && <span className="text-[10px] font-bold text-sky-300">in</span>}
          </span>
        </div>
        {!pending && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-gold-200/90" title={action.detail}>
            <NextActionIcon kind={action.kind} className="size-3.5 shrink-0 text-gold-400" />
            <span className="line-clamp-1">{action.label}</span>
          </div>
        )}
      </td>
      <td className="px-3 text-[13px] tabular-nums text-ink-200">
        {e?.foundedYear ?? <span className="text-ink-600">—</span>}
      </td>
      <td className="pl-3 pr-4" onClick={(ev) => ev.stopPropagation()}>
        <StageSelect value={lead.stage} onChange={onStage} />
      </td>
    </tr>
  );
}

export function LeadsTable({
  rows,
  selectedId,
  onSelect,
  onStage,
}: {
  rows: ScoredLead[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStage: (id: string, s: Stage) => void;
}) {
  if (!rows.length) {
    return <div className="px-6 py-16 text-center text-sm text-ink-400">No leads match these filters.</div>;
  }
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[1000px] text-left text-sm">
        <thead className="text-[10.5px] font-medium uppercase tracking-wider text-ink-500">
          <tr>
            <th className="py-2.5 pl-4 pr-3 font-medium">Company</th>
            <th className="px-3 font-medium">Seller readiness</th>
            <th className="px-3 font-medium">Why it ranks</th>
            <th className="px-3 font-medium">Decision-maker · next step</th>
            <th className="px-3 font-medium">Founded</th>
            <th className="pl-3 pr-4 font-medium">Stage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <Row
              key={r.lead.id}
              index={i}
              item={r}
              selected={r.lead.id === selectedId}
              onSelect={() => onSelect(r.lead.id)}
              onStage={(s) => onStage(r.lead.id, s)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
