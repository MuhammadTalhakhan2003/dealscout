import type { BuyBox, FactorResult, Lead, NextAction, ScoreResult, Tier, Weights } from "./types";

export const DEFAULT_WEIGHTS: Weights = { succession: 30, upside: 20, reach: 20, fit: 15, durability: 15 };

export const DEFAULT_BUYBOX: BuyBox = {
  industries: [],
  regions: [],
  foundedBefore: null,
  weights: DEFAULT_WEIGHTS,
};

export const FACTOR_META: Record<keyof Weights, { label: string; blurb: string }> = {
  succession: { label: "Succession pressure", blurb: "Older, family-run businesses are likelier to have an owner thinking about exit." },
  upside: { label: "Value-creation upside", blurb: "Digital gaps a new owner can close fast after the acquisition." },
  reach: { label: "Owner reachability", blurb: "Can you actually get the decision-maker on the phone or inbox?" },
  fit: { label: "Buy-box fit", blurb: "Matches your target industries, geography and age cutoff." },
  durability: { label: "Established & operating", blurb: "Evidence the business is real, live and rooted locally." },
};

/** Unknown factors count at a below-average prior, so thin data can never carry a lead to the top. */
const UNKNOWN_PRIOR = 0.3;
const THIS_YEAR = new Date().getFullYear();

const clamp = (n: number) => Math.max(0, Math.min(1, n));

function tierFor(total: number): Tier {
  if (total >= 70) return "A";
  if (total >= 55) return "B";
  if (total >= 40) return "C";
  return "D";
}

const BASELINE_EVIDENCE = "Website live and responding";

function factor(
  key: keyof Weights,
  weights: Weights,
  partial: Omit<FactorResult, "key" | "label" | "weight" | "active"> & { active?: boolean },
): FactorResult {
  return { key, label: FACTOR_META[key].label, weight: weights[key], active: true, ...partial, score: clamp(partial.score) };
}

export function scoreLead(lead: Lead, box: BuyBox): ScoreResult {
  const e = lead.enrichment?.ok ? lead.enrichment : undefined;
  const w = box.weights;
  const founded = e?.foundedYear;
  const age = founded ? THIS_YEAR - founded : undefined;
  const text = [e?.textSample, e?.description, e?.headings.join(" "), e?.name, lead.name, lead.industry]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const locationText = [e?.address, e?.city, e?.region, lead.location].filter(Boolean).join(" ").toLowerCase();

  // 1. Succession pressure
  const succession = (() => {
    const evidence: string[] = [];
    const missing: string[] = [];
    let score = 0;
    let known = false;
    if (age !== undefined) {
      known = true;
      score = age >= 30 ? 0.85 : age >= 20 ? 0.65 : age >= 10 ? 0.4 : 0.1;
      evidence.push(`In business ~${age} yrs (since ${founded})`);
    } else missing.push("Founding year not found on site");
    if (e?.flags.familyOwned) {
      known = true;
      score = age === undefined ? 0.55 : score + 0.15;
      evidence.push("Describes itself as family-owned");
    }
    if (e?.successionSignals.length) {
      known = true;
      score += 0.15;
      evidence.push(`Generational language: “${e.successionSignals.slice(0, 2).join("”, “")}”`);
    }
    if (!known) missing.push("Owner age / tenure unknown — check LinkedIn or state filings");
    return factor("succession", w, { score, known, evidence, missing });
  })();

  // 2. Value-creation upside (Caprae's thesis: the real value is created post-acquisition)
  const upside = (() => {
    const evidence: string[] = [];
    const missing: string[] = [];
    if (!e) return factor("upside", w, { score: 0, known: false, evidence, missing: ["Website not analysed"] });
    let score = 0;
    if (!e.flags.analytics) {
      score += 0.3;
      evidence.push("No analytics installed — marketing likely runs on word-of-mouth");
    }
    if (!e.flags.booking && !e.flags.ecommerce) {
      score += 0.2;
      evidence.push("No online booking or checkout — easy revenue lever");
    }
    if (e.copyrightYear && e.copyrightYear <= THIS_YEAR - 3) {
      score += 0.2;
      evidence.push(`Site last touched ~${e.copyrightYear} (copyright footer)`);
    }
    if (!e.flags.mobileViewport) {
      score += 0.15;
      evidence.push("Not mobile-optimised");
    }
    if (e.flags.diyBuilder) {
      score += 0.1;
      evidence.push(`DIY site builder (${e.tech.find((t) => ["Wix", "GoDaddy Builder", "Weebly", "Squarespace", "Duda"].includes(t))})`);
    }
    if (!e.flags.https) {
      score += 0.1;
      evidence.push("No HTTPS");
    }
    if (score < 0.2) evidence.push("Already digitally mature — less low-hanging fruit");
    return factor("upside", w, { score, known: true, evidence, missing });
  })();

  // 3. Owner reachability
  const reach = (() => {
    const evidence: string[] = [];
    const missing: string[] = [];
    let score = 0;
    const owner = e?.people[0]?.name ?? lead.owner;
    if (owner) {
      score += 0.35;
      evidence.push(`Decision-maker identified: ${owner}${e?.people[0] ? ` (${e.people[0].title})` : ""}`);
    } else missing.push("No owner name found");
    const emails = e?.emails ?? [];
    const direct = emails.find((m) => m.kind === "direct" && m.mx === "valid");
    const personal = emails.find((m) => m.kind === "personal");
    const role = emails.find((m) => m.kind === "role" && m.mx === "valid");
    if (direct) {
      score += 0.35;
      evidence.push(`Named mailbox, MX-verified: ${direct.address}`);
    } else if (personal) {
      score += 0.28;
      evidence.push(`Personal mailbox (often owner-direct): ${personal.address}`);
    } else if (role || lead.email) {
      score += 0.15;
      evidence.push(`Shared inbox only: ${role?.address ?? lead.email}`);
    } else missing.push("No verified email");
    const phone = e?.phones[0] ?? lead.phone;
    if (phone) {
      score += 0.2;
      evidence.push(`Phone: ${phone}`);
    } else missing.push("No phone number");
    if (e?.socials.linkedin) {
      score += 0.1;
      evidence.push("LinkedIn page found");
    }
    return factor("reach", w, { score, known: !!e || !!owner || !!lead.email, evidence, missing });
  })();

  // 4. Buy-box fit
  const fit = (() => {
    const evidence: string[] = [];
    const missing: string[] = [];
    const hasIndustries = box.industries.length > 0;
    const hasRegions = box.regions.length > 0;
    if (!hasIndustries && !hasRegions && !box.foundedBefore) {
      // Not configured isn't the same as unknown: leave fit out of the total until a buy box exists.
      return factor("fit", w, {
        score: 0,
        known: false,
        active: false,
        evidence,
        missing: ["Set a buy box to score fit — excluded from the total until then"],
      });
    }
    let score = 0;
    let parts = 0;
    if (hasIndustries) {
      parts++;
      const hits = box.industries.filter((k) => text.includes(k.toLowerCase()));
      if (hits.length) {
        score += 1;
        evidence.push(`Industry match: ${hits.slice(0, 3).join(", ")}`);
      } else missing.push("No target-industry keywords on site");
    }
    if (hasRegions) {
      parts++;
      const hits = box.regions.filter((r) => {
        const needle = r.toLowerCase();
        return needle.length <= 2
          ? new RegExp(`\\b${needle}\\b`).test(locationText)
          : locationText.includes(needle) || text.includes(needle);
      });
      if (hits.length) {
        score += 1;
        evidence.push(`Geography match: ${hits.join(", ")}`);
      } else if (locationText) missing.push("Outside target geography");
      else missing.push("Location unknown");
    }
    if (box.foundedBefore) {
      parts++;
      if (founded && founded <= box.foundedBefore) {
        score += 1;
        evidence.push(`Founded ${founded} (before ${box.foundedBefore} cutoff)`);
      } else if (founded) missing.push(`Founded ${founded}, after your ${box.foundedBefore} cutoff`);
      else missing.push("Founding year unknown for age cutoff");
    }
    return factor("fit", w, { score: score / parts, known: true, evidence, missing });
  })();

  // 5. Established & operating
  const durability = (() => {
    const evidence: string[] = [];
    const missing: string[] = [];
    if (!e) {
      return factor("durability", w, {
        score: 0,
        known: false,
        evidence,
        missing: [lead.enrichment?.error ?? lead.error ?? "Website not analysed yet"],
      });
    }
    let score = 0.35;
    evidence.push(BASELINE_EVIDENCE);
    if (e.address || e.city) {
      score += 0.2;
      evidence.push(`Physical location: ${e.city ? `${e.city}${e.region ? ", " + e.region : ""}` : e.address}`);
    } else missing.push("No physical address found");
    if (e.phones.length) score += 0.15;
    if (age !== undefined && age >= 10) {
      score += 0.2;
      evidence.push("10+ year operating history");
    }
    if (Object.keys(e.socials).length >= 2) {
      score += 0.1;
      evidence.push(`Active on ${Object.keys(e.socials).length} social channels`);
    }
    return factor("durability", w, { score, known: true, evidence, missing });
  })();

  const factors = [succession, upside, reach, fit, durability];
  const active = factors.filter((f) => f.active);
  const totalWeight = active.reduce((s, f) => s + f.weight, 0) || 1;
  const raw = active.reduce((s, f) => s + f.weight * (f.known ? f.score : UNKNOWN_PRIOR), 0) / totalWeight;
  const coverage = active.reduce((s, f) => s + (f.known ? f.weight : 0), 0) / totalWeight;
  const total = Math.round(raw * 100);

  // Lead with the most decision-relevant evidence. "Established & operating" is supporting context,
  // so it only surfaces when there's little else to say; "site is live" never does.
  const salience = (f: FactorResult) => f.weight * f.score * (f.key === "durability" ? 0.4 : 1);
  const highlights = active
    .filter((f) => f.known)
    .sort((a, b) => salience(b) - salience(a))
    .map((f) => f.evidence.find((x) => x !== BASELINE_EVIDENCE))
    .filter((x): x is string => !!x)
    .slice(0, 3);

  return { total, tier: tierFor(total), coverage, factors, highlights };
}

/** The single most useful thing a searcher can do next with this lead, given what we found. */
export function nextAction(lead: Lead): NextAction {
  if (lead.status === "queued" || lead.status === "enriching") return { kind: "research", label: "Enriching…" };
  const e = lead.enrichment?.ok ? lead.enrichment : undefined;
  const owner = e?.people[0]?.name ?? lead.owner;
  const first = owner?.split(" ")[0];
  const emails = e?.emails ?? [];
  const named = emails.find((m) => (m.kind === "direct" || m.kind === "personal") && m.mx !== "none");
  const shared = emails.find((m) => m.kind === "role" && m.mx !== "none");
  const phone = e?.phones[0] ?? lead.phone;

  if (!e && !lead.email && !phone) {
    return { kind: "manual", label: "Verify manually", detail: "Site couldn't be analysed automatically — check it by hand." };
  }
  if (owner && named) return { kind: "email", label: `Email ${first} directly`, detail: named.address };
  if (owner && phone) return { kind: "call", label: `Call and ask for ${first}`, detail: phone };
  if (owner && (shared || lead.email)) {
    return { kind: "email", label: `Ask the inbox to connect you with ${first}`, detail: shared?.address ?? lead.email };
  }
  if (e?.socials.linkedin) {
    return { kind: "research", label: "Identify the owner on LinkedIn", detail: "Company page found — look for Owner / President" };
  }
  if (named) return { kind: "email", label: "Email the named mailbox", detail: named.address };
  if (phone) return { kind: "call", label: "Call and ask for the owner", detail: phone };
  if (shared || lead.email) {
    return { kind: "email", label: "Ask the inbox for an owner intro", detail: shared?.address ?? lead.email };
  }
  return { kind: "research", label: "Look up the owner in state filings", detail: "No public contacts on the site" };
}
