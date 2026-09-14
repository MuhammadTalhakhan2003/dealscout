"use client";

import { useState } from "react";
import { nextAction } from "@/lib/score";
import { STAGES, type ScoredLead, type Stage } from "@/lib/types";
import { displayName } from "./LeadsTable";
import { Favicon, NextActionIcon, ScoreRing, TIER_STYLE, cn } from "./ui";

export function Pipeline({
  rows,
  onStage,
  onSelect,
}: {
  rows: ScoredLead[];
  onStage: (id: string, s: Stage) => void;
  onSelect: (id: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);

  return (
    <div className="scrollbar-thin flex gap-3 overflow-x-auto p-4">
      {STAGES.map((stage) => {
        const items = rows.filter((r) => r.lead.stage === stage.key);
        return (
          <div
            key={stage.key}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(stage.key);
            }}
            onDragLeave={() => setOver((o) => (o === stage.key ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) onStage(dragId, stage.key);
              setDragId(null);
              setOver(null);
            }}
            className={cn(
              "flex min-h-[460px] w-64 shrink-0 flex-col rounded-xl bg-ink-950/50 ring-1 ring-inset transition-colors",
              over === stage.key ? "ring-gold-400/50 bg-gold-400/[0.03]" : "ring-ink-800",
            )}
          >
            <div className="flex items-center justify-between px-3 pb-2 pt-3">
              <div>
                <div className="text-[13px] font-semibold text-ink-100">{stage.label}</div>
                <div className="text-[11px] text-ink-500">{stage.hint}</div>
              </div>
              <span className="rounded-md bg-ink-800 px-1.5 py-0.5 text-[11px] tabular-nums text-ink-300">{items.length}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
              {items.map(({ lead, score }) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={() => setDragId(lead.id)}
                  onDragEnd={() => setDragId(null)}
                  onClick={() => onSelect(lead.id)}
                  className={cn(
                    "cursor-grab rounded-lg border-l-2 bg-ink-850 p-2.5 ring-1 ring-ink-800 transition hover:bg-ink-800 hover:ring-ink-700 active:cursor-grabbing",
                    dragId === lead.id && "opacity-40",
                  )}
                  style={{ borderLeftColor: TIER_STYLE[score.tier].color }}
                >
                  <div className="flex items-center gap-2">
                    <Favicon domain={lead.domain} size={20} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-100">{displayName(lead)}</span>
                    <ScoreRing value={score.total} tier={score.tier} size={30} stroke={3} />
                  </div>
                  {score.highlights[0] && <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-ink-400">{score.highlights[0]}</p>}
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gold-200/90">
                    <NextActionIcon kind={nextAction(lead).kind} className="size-3 shrink-0 text-gold-400" />
                    <span className="truncate">{nextAction(lead).label}</span>
                  </p>
                </div>
              ))}
              {!items.length && (
                <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-ink-800 text-[11px] text-ink-600">
                  Drop leads here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
