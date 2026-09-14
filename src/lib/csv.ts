import Papa from "papaparse";
import { normalizeDomain } from "./domain";
import { nextAction } from "./score";
import { STAGES, type LeadInput, type ScoredLead } from "./types";

type Field = "domain" | "email" | "phone" | "owner" | "name" | "industry" | "city" | "state" | "employees" | "revenue";

// Order matters: specific fields claim their column first so e.g. "Owner Name" isn't taken as the company name.
const COLUMN_ALIASES: [Field, string[]][] = [
  ["domain", ["website", "domain", "url", "company website", "company domain", "site", "web", "homepage"]],
  ["email", ["email", "owner email", "contact email", "email address"]],
  ["phone", ["phone", "phone number", "company phone", "telephone"]],
  ["owner", ["owner", "owner name", "contact name", "ceo", "founder", "decision maker", "contact"]],
  ["name", ["company", "company name", "business name", "name", "organization", "account name", "business"]],
  ["industry", ["industry", "category", "sector", "vertical"]],
  ["city", ["city", "location", "hq", "headquarters", "address"]],
  ["state", ["state", "state/region", "region", "province"]],
  ["employees", ["employees", "employee count", "headcount", "company size", "size"]],
  ["revenue", ["revenue", "annual revenue", "estimated revenue", "est. revenue"]],
];

export type ColumnMapping = Partial<Record<Field, string>>;

export interface CsvImport {
  inputs: LeadInput[];
  mapping: ColumnMapping;
  total: number;
  skipped: number;
}

function mapColumns(headers: string[]): ColumnMapping {
  const used = new Set<string>();
  const mapping: ColumnMapping = {};
  const normalized = headers.map((h) => h.toLowerCase().trim());
  for (const [field, aliases] of COLUMN_ALIASES) {
    let idx = normalized.findIndex((h, i) => !used.has(headers[i]) && aliases.includes(h));
    if (idx < 0) idx = normalized.findIndex((h, i) => !used.has(headers[i]) && aliases.some((a) => h.includes(a)));
    if (idx >= 0) {
      mapping[field] = headers[idx];
      used.add(headers[idx]);
    }
  }
  return mapping;
}

/** Parses a SaaSquatch / CRM / broker CSV export with automatic column detection. */
export function parseCsv(text: string): CsvImport {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const mapping = mapColumns(parsed.meta.fields ?? []);
  const get = (row: Record<string, string>, f: Field) => {
    const col = mapping[f];
    const v = col ? row[col]?.trim() : undefined;
    return v || undefined;
  };

  let skipped = 0;
  const inputs: LeadInput[] = [];
  for (const row of parsed.data) {
    const email = get(row, "email");
    const domain = normalizeDomain(get(row, "domain")) ?? (email ? normalizeDomain(email) : null);
    if (!domain) {
      skipped++;
      continue;
    }
    inputs.push({
      domain,
      source: "csv",
      name: get(row, "name"),
      industry: get(row, "industry"),
      location: [get(row, "city"), get(row, "state")].filter(Boolean).join(", ") || undefined,
      employees: get(row, "employees"),
      revenue: get(row, "revenue"),
      owner: get(row, "owner"),
      email,
      phone: get(row, "phone"),
    });
  }
  return { inputs, mapping, total: parsed.data.length, skipped };
}

export type ExportPreset = "csv" | "hubspot" | "salesforce";

// Prevent CSV/formula injection when the file is opened in Excel or Sheets.
const safe = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

function splitName(full?: string): [string, string] {
  if (!full) return ["", ""];
  const parts = full.trim().split(/\s+/);
  return [parts[0], parts.slice(1).join(" ")];
}

export function buildExport(rows: ScoredLead[], preset: ExportPreset): string {
  const records = rows.map(({ lead, score }) => {
    const e = lead.enrichment?.ok ? lead.enrichment : undefined;
    const person = e?.people[0];
    const owner = person?.name ?? lead.owner;
    const [first, last] = splitName(owner);
    const email = e?.emails[0]?.address ?? lead.email ?? "";
    const phone = e?.phones[0] ?? lead.phone ?? "";
    const city = e?.city ?? lead.location?.split(",")[0]?.trim() ?? "";
    const state = e?.region ?? lead.location?.split(",")[1]?.trim() ?? "";
    const company = lead.name ?? e?.name ?? lead.domain;
    const signals = score.highlights.join(" | ");
    const stage = STAGES.find((s) => s.key === lead.stage)?.label ?? lead.stage;

    const record: Record<string, unknown> =
      preset === "hubspot"
        ? {
            "First Name": first,
            "Last Name": last,
            Email: email,
            "Phone Number": phone,
            "Company Name": company,
            "Company Domain Name": lead.domain,
            City: city,
            "State/Region": state,
            Industry: lead.industry,
            "Year Founded": e?.foundedYear,
            "LinkedIn Company Page": e?.socials.linkedin,
            "Lead Status": stage,
            "DealScout Score": score.total,
            "DealScout Tier": score.tier,
            "DealScout Signals": signals,
          }
        : preset === "salesforce"
          ? {
              "First Name": first,
              "Last Name": last || "(Owner)",
              Company: company,
              Title: person?.title,
              Email: email,
              Phone: phone,
              Website: `https://${lead.domain}`,
              City: city,
              "State/Province": state,
              Industry: lead.industry,
              "Lead Source": "DealScout",
              Rating: score.tier === "A" ? "Hot" : score.tier === "B" ? "Warm" : "Cold",
              Description: `DealScout ${score.total}/100 (Tier ${score.tier}). ${signals}`,
            }
          : {
              company,
              domain: lead.domain,
              score: score.total,
              tier: score.tier,
              evidence_coverage_pct: Math.round(score.coverage * 100),
              stage,
              owner,
              owner_title: person?.title,
              email,
              email_type: e?.emails[0]?.kind,
              email_mx: e?.emails[0]?.mx,
              phone,
              city,
              state,
              founded: e?.foundedYear,
              industry: lead.industry,
              linkedin: e?.socials.linkedin,
              tech_stack: e?.tech.join("; "),
              signals,
              next_action: [nextAction(lead).label, nextAction(lead).detail].filter(Boolean).join(": "),
              notes: lead.notes,
            };
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, safe(v)]));
  });
  return Papa.unparse(records);
}

export function downloadFile(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
