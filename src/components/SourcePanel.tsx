"use client";

import { ClipboardList, FileSpreadsheet, Sparkles, Upload, WandSparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { parseCsv, type CsvImport } from "@/lib/csv";
import { parsePasted } from "@/lib/domain";
import { SAMPLE_LEADS } from "@/lib/sample";
import type { LeadInput } from "@/lib/types";
import { Button, Panel, Segmented, cn } from "./ui";

export function SourcePanel({ onAdd, busy }: { onAdd: (inputs: LeadInput[], origin: string) => void; busy: boolean }) {
  const [tab, setTab] = useState<"paste" | "csv">("paste");
  const [text, setText] = useState("");
  const [csv, setCsv] = useState<(CsvImport & { fileName: string }) | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pasted = useMemo(() => parsePasted(text), [text]);

  async function loadFile(file: File) {
    setCsvError(null);
    try {
      const result = parseCsv(await file.text());
      if (!result.inputs.length) {
        setCsv(null);
        setCsvError("No rows with a website or email domain were found in that file.");
        return;
      }
      setCsv({ ...result, fileName: file.name });
    } catch {
      setCsvError("Couldn't read that file — is it a CSV?");
    }
  }

  return (
    <Panel title="1 · Source leads" subtitle="Paste domains or drop a SaaSquatch / CRM export." icon={<Upload />}>
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-3 grid w-full grid-cols-2 [&>button]:justify-center"
        options={[
          { value: "paste", label: <><ClipboardList /> Paste list</> },
          { value: "csv", label: <><FileSpreadsheet /> Upload CSV</> },
        ]}
      />
      {tab === "paste" ? (
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={"acmeplumbing.com\nhttps://www.smithhvac.com/about\nowner@familybakery.com"}
            className="h-32 w-full resize-none rounded-lg border border-ink-700 bg-ink-950/60 p-3 font-mono text-[12.5px] leading-relaxed text-ink-100 outline-none placeholder:text-ink-600 focus:border-gold-500/70 focus:ring-2 focus:ring-gold-400/15"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-ink-400">
              {pasted.length ? (
                <>
                  <span className="font-semibold text-ink-200">{pasted.length}</span> domain{pasted.length === 1 ? "" : "s"}{" "}
                  detected
                </>
              ) : (
                "URLs, domains or emails — any format"
              )}
            </span>
            <Button
              variant="primary"
              disabled={!pasted.length || busy}
              onClick={() => {
                onAdd(pasted, "pasted list");
                setText("");
              }}
            >
              <WandSparkles /> Enrich
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void loadFile(file);
            }}
            className={cn(
              "flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
              dragging ? "border-gold-400 bg-gold-400/5" : "border-ink-600 bg-ink-950/40 hover:border-ink-500",
            )}
          >
            <FileSpreadsheet className="size-5 text-gold-400" />
            <span className="text-sm font-medium text-ink-200">{csv ? csv.fileName : "Drop a CSV or click to browse"}</span>
            <span className="text-xs text-ink-400">Columns are auto-detected (website, company, owner, city…)</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file);
              e.target.value = "";
            }}
          />
          {csvError && <p className="text-xs text-rose-300">{csvError}</p>}
          {csv && (
            <div className="space-y-2.5 rounded-lg bg-ink-950/50 p-3 ring-1 ring-ink-800">
              <p className="text-xs text-ink-300">
                <span className="font-semibold text-ink-100">{csv.inputs.length}</span> of {csv.total} rows usable
                {csv.skipped ? ` · ${csv.skipped} skipped (no website)` : ""}
              </p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(csv.mapping).map(([field, col]) => (
                  <span key={field} className="rounded bg-ink-800 px-1.5 py-0.5 text-[10.5px] text-ink-300">
                    <span className="text-ink-500">{field} ←</span> {col}
                  </span>
                ))}
              </div>
              <Button
                variant="primary"
                className="w-full"
                disabled={busy}
                onClick={() => {
                  onAdd(csv.inputs, csv.fileName);
                  setCsv(null);
                }}
              >
                <WandSparkles /> Import & enrich {csv.inputs.length}
              </Button>
            </div>
          )}
          <a href="/sample-saasquatch-export.csv" download className="block text-center text-xs text-ink-400 underline-offset-2 hover:text-gold-300 hover:underline">
            Download an example SaaSquatch-style CSV
          </a>
        </div>
      )}

      <div className="mt-4 border-t border-ink-800 pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAdd(SAMPLE_LEADS, "sample dataset")}
          className="group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-ink-800 disabled:opacity-40"
        >
          <span className="grid size-7 place-items-center rounded-md bg-gold-400/10 text-gold-400 ring-1 ring-gold-400/25">
            <Sparkles className="size-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-ink-100">Try the sample dataset</span>
            <span className="block text-[11px] text-ink-400">
              {SAMPLE_LEADS.length} real, decades-old businesses incl. 2 planted duplicates
            </span>
          </span>
        </button>
      </div>
    </Panel>
  );
}
