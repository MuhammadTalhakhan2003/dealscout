import type { LeadInput } from "./types";

// Public suffixes where the registrable domain has three labels (acme.co.uk).
const SECOND_LEVEL = new Set([
  "co.uk", "org.uk", "ac.uk", "com.au", "net.au", "co.nz", "co.in", "com.br", "co.za", "com.mx", "co.jp",
]);

// Site builders that host many businesses on subdomains — the subdomain IS the business.
const HOSTED = new Set([
  "wixsite.com", "squarespace.com", "godaddysites.com", "weebly.com", "wordpress.com", "business.site",
  "myshopify.com", "square.site", "webflow.io", "github.io", "netlify.app", "vercel.app", "carrd.co",
]);

/** Turns any URL / host / email-ish string into a canonical registrable domain, or null. */
export function normalizeDomain(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s.includes("@") && !s.includes("/")) s = s.split("@").pop()!;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#\s]/)[0].replace(/:\d+$/, "").replace(/\.+$/, "");
  s = s.replace(/^www\d?\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;

  const parts = s.split(".");
  if (!/^[a-z]{2,24}$/.test(parts[parts.length - 1])) return null;
  const lastTwo = parts.slice(-2).join(".");
  const keep = HOSTED.has(lastTwo) || SECOND_LEVEL.has(lastTwo) ? 3 : 2;
  return parts.slice(-keep).join(".");
}

const LEGAL_SUFFIX =
  /\b(incorporated|inc|llc|l l c|ltd|limited|corp|corporation|co|company|plc|lp|llp|pc|pllc|group|holdings|the|and)\b/g;

/** Canonical company-name key used for fuzzy duplicate detection ("The Acme Co., LLC" -> "acme"). */
export function companyKey(name?: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extracts every domain it can find in free-form pasted text. */
export function parsePasted(text: string): LeadInput[] {
  return text
    .split(/[\n,;\t ]+/)
    .map((t) => normalizeDomain(t))
    .filter((d): d is string => !!d)
    .map((domain) => ({ domain, source: "paste" as const }));
}

export interface Duplicate {
  dropped: LeadInput;
  keptDomain: string;
  reason: "same domain" | "same company name";
}

/** Removes duplicates within the incoming batch and against what's already in the workspace. */
export function dedupeInputs(
  incoming: LeadInput[],
  existing: { domain: string; name?: string }[],
): { unique: LeadInput[]; duplicates: Duplicate[] } {
  const domains = new Set<string>();
  const names = new Map<string, string>();
  for (const e of existing) {
    domains.add(e.domain);
    const k = companyKey(e.name);
    if (k.length > 3) names.set(k, e.domain);
  }

  const unique: LeadInput[] = [];
  const duplicates: Duplicate[] = [];
  for (const item of incoming) {
    if (domains.has(item.domain)) {
      duplicates.push({ dropped: item, keptDomain: item.domain, reason: "same domain" });
      continue;
    }
    const k = companyKey(item.name);
    if (k.length > 3 && names.has(k)) {
      duplicates.push({ dropped: item, keptDomain: names.get(k)!, reason: "same company name" });
      continue;
    }
    domains.add(item.domain);
    if (k.length > 3) names.set(k, item.domain);
    unique.push(item);
  }
  return { unique, duplicates };
}
