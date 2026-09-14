"use client";

import { RefreshCw, Target, UserRound, X } from "lucide-react";
import { useState } from "react";
import { DEFAULT_WEIGHTS, FACTOR_META } from "@/lib/score";
import type { BuyBox, SenderProfile, Weights } from "@/lib/types";
import { Button, Panel, inputClass } from "./ui";

const INDUSTRY_SUGGESTIONS = ["plumbing", "hvac", "electrical", "roofing", "bakery", "deli", "manufacturing", "brewery"];
const REGION_SUGGESTIONS = ["TX", "NY", "FL", "PA", "Midwest"];

function TagInput({
  label,
  values,
  onChange,
  placeholder,
  suggestions,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState("");
  const commit = (raw = draft) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) onChange([...new Set([...values, ...parts])]);
    setDraft("");
  };

  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-ink-400">{label}</label>
      <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-ink-700 bg-ink-950/60 px-1.5 py-1 focus-within:border-gold-500/70 focus-within:ring-2 focus-within:ring-gold-400/15">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-gold-400/10 py-0.5 pl-1.5 pr-1 text-xs text-gold-200 ring-1 ring-gold-400/25">
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="cursor-pointer rounded text-gold-300/70 hover:text-gold-100"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => (e.target.value.endsWith(",") ? commit(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => commit()}
          placeholder={values.length ? "" : placeholder}
          className="min-w-[80px] flex-1 bg-transparent px-1 py-0.5 text-sm text-ink-100 outline-none placeholder:text-ink-600"
        />
      </div>
      {!values.length && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange([...values, s])}
              className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] text-ink-400 ring-1 ring-ink-700 hover:text-ink-200 hover:ring-ink-600"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BuyBoxPanel({
  box,
  onChange,
  sender,
  onSenderChange,
}: {
  box: BuyBox;
  onChange: (b: BuyBox) => void;
  sender: SenderProfile;
  onSenderChange: (s: SenderProfile) => void;
}) {
  const totalWeight = Object.values(box.weights).reduce((a, b) => a + b, 0);
  const setWeight = (k: keyof Weights, v: number) => onChange({ ...box, weights: { ...box.weights, [k]: v } });

  return (
    <>
      <Panel title="2 · Your buy box" subtitle="Scores re-rank instantly as you tune these." icon={<Target />}>
        <div className="space-y-4">
          <TagInput
            label="Target industries"
            values={box.industries}
            onChange={(industries) => onChange({ ...box, industries })}
            placeholder="e.g. plumbing, hvac"
            suggestions={INDUSTRY_SUGGESTIONS}
          />
          <TagInput
            label="Target geography"
            values={box.regions}
            onChange={(regions) => onChange({ ...box, regions })}
            placeholder="State codes or cities"
            suggestions={REGION_SUGGESTIONS}
          />
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-ink-400">
              Founded before
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1800}
              max={new Date().getFullYear()}
              placeholder="e.g. 2000 (optional)"
              value={box.foundedBefore ?? ""}
              onChange={(e) => onChange({ ...box, foundedBefore: e.target.value ? Number(e.target.value) : null })}
              className={inputClass}
            />
          </div>

          <details className="group rounded-lg bg-ink-950/40 ring-1 ring-ink-800 open:pb-3">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-medium text-ink-300 hover:text-ink-100">
              Scoring weights
              <span className="text-ink-500 group-open:hidden">Tune ▾</span>
              <span className="hidden text-ink-500 group-open:inline">▴</span>
            </summary>
            <div className="space-y-3 px-3">
              {(Object.keys(FACTOR_META) as (keyof Weights)[]).map((k) => (
                <div key={k} title={FACTOR_META[k].blurb}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-ink-300">{FACTOR_META[k].label}</span>
                    <span className="tabular-nums text-ink-400">
                      {totalWeight ? Math.round((box.weights[k] / totalWeight) * 100) : 0}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={5}
                    value={box.weights[k]}
                    onChange={(e) => setWeight(k, Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => onChange({ ...box, weights: DEFAULT_WEIGHTS })}>
                <RefreshCw /> Reset weights
              </Button>
            </div>
          </details>
        </div>
      </Panel>

      <Panel title="3 · Your searcher profile" subtitle="Used to personalise AI outreach." icon={<UserRound />}>
        <div className="space-y-2.5">
          <input
            value={sender.name}
            onChange={(e) => onSenderChange({ ...sender, name: e.target.value })}
            placeholder="Your name"
            className={inputClass}
          />
          <textarea
            value={sender.background}
            onChange={(e) => onSenderChange({ ...sender, background: e.target.value })}
            placeholder="One line about you — e.g. former ops lead backed by Caprae Capital"
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>
      </Panel>
    </>
  );
}
