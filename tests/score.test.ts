import { describe, expect, it } from "vitest";
import { buildExport, parseCsv } from "../src/lib/csv";
import { DEFAULT_BUYBOX, scoreLead } from "../src/lib/score";
import type { Enrichment, Lead } from "../src/lib/types";

const YEAR = new Date().getFullYear();

function enrichment(overrides: Partial<Enrichment> = {}): Enrichment {
  return {
    domain: "x.com",
    url: "https://x.com",
    ok: true,
    fetchedAt: Date.now(),
    ms: 1000,
    pagesCrawled: ["https://x.com/"],
    emails: [],
    phones: [],
    socials: {},
    people: [],
    tech: [],
    flags: {
      https: true,
      mobileViewport: true,
      analytics: false,
      booking: false,
      ecommerce: false,
      structuredData: false,
      diyBuilder: false,
      familyOwned: false,
    },
    successionSignals: [],
    headings: [],
    textSample: "",
    ...overrides,
  };
}

function lead(e?: Enrichment, extra: Partial<Lead> = {}): Lead {
  return { id: "x.com", domain: "x.com", source: "paste", status: e ? "done" : "error", stage: "new", addedAt: 0, enrichment: e, ...extra };
}

const oldFamilyPlumber = lead(
  enrichment({
    name: "Smith & Sons Plumbing",
    foundedYear: 1978,
    copyrightYear: 2019,
    city: "Dallas",
    region: "TX",
    people: [{ name: "Robert Smith", title: "Owner", source: "about" }],
    emails: [{ address: "bob@x.com", kind: "direct", onDomain: true, mx: "valid", source: "mailto link" }],
    phones: ["(214) 555-0199"],
    socials: { linkedin: "https://linkedin.com/company/x", facebook: "https://facebook.com/x" },
    successionSignals: ["third generation"],
    textSample: "Family-owned plumbing and drain services in Dallas",
    flags: { ...enrichment().flags, familyOwned: true },
  }),
);

const youngModernShop = lead(
  enrichment({
    foundedYear: YEAR - 6,
    copyrightYear: YEAR,
    emails: [{ address: "info@x.com", kind: "role", onDomain: true, mx: "valid", source: "page text" }],
    phones: ["(512) 555-0100"],
    tech: ["Google Analytics", "Calendly"],
    flags: { ...enrichment().flags, analytics: true, booking: true },
  }),
);

describe("scoreLead", () => {
  it("ranks an old, family-owned, reachable business as Tier A with full evidence", () => {
    const s = scoreLead(oldFamilyPlumber, DEFAULT_BUYBOX);
    expect(s.tier).toBe("A");
    expect(s.total).toBeGreaterThanOrEqual(80);
    expect(s.highlights.length).toBeGreaterThan(0);
    expect(s.factors.find((f) => f.key === "succession")?.evidence.join(" ")).toMatch(/1978/);
  });

  it("ranks a young, digitally mature business with only a shared inbox low", () => {
    const s = scoreLead(youngModernShop, DEFAULT_BUYBOX);
    expect(["C", "D"]).toContain(s.tier);
    expect(s.total).toBeLessThan(scoreLead(oldFamilyPlumber, DEFAULT_BUYBOX).total - 30);
  });

  it("never lets a lead with no data outrank one with real evidence", () => {
    const unknown = scoreLead(lead(undefined, { error: "Site timed out" }), DEFAULT_BUYBOX);
    expect(unknown.coverage).toBe(0);
    expect(unknown.tier).toBe("D");
    expect(unknown.total).toBeLessThan(scoreLead(oldFamilyPlumber, DEFAULT_BUYBOX).total);
  });

  it("re-ranks on buy box and weights", () => {
    const base = scoreLead(oldFamilyPlumber, DEFAULT_BUYBOX);
    const withBox = scoreLead(oldFamilyPlumber, { ...DEFAULT_BUYBOX, industries: ["plumbing"], regions: ["TX"] });
    expect(withBox.total).toBeGreaterThan(base.total);
    expect(withBox.factors.find((f) => f.key === "fit")?.evidence).toEqual([
      "Industry match: plumbing",
      "Geography match: TX",
    ]);

    const outOfBox = scoreLead(oldFamilyPlumber, { ...DEFAULT_BUYBOX, regions: ["FL"], foundedBefore: 1970 });
    expect(outOfBox.factors.find((f) => f.key === "fit")?.score).toBe(0);
  });
});

describe("csv", () => {
  it("auto-maps a SaaSquatch-style export and skips rows without a website", () => {
    const csv = "Company,Website,Industry,City,State,Owner Name\nAcme Plumbing,https://www.acme.com,Plumbing,Dallas,TX,Jo Lee\nNo Site Co,,Retail,Austin,TX,";
    const { inputs, mapping, skipped } = parseCsv(csv);
    expect(mapping).toMatchObject({ domain: "Website", name: "Company", owner: "Owner Name", city: "City", state: "State" });
    expect(skipped).toBe(1);
    expect(inputs[0]).toMatchObject({ domain: "acme.com", name: "Acme Plumbing", owner: "Jo Lee", location: "Dallas, TX" });
  });

  it("neutralises spreadsheet formula injection on export", () => {
    const row = { lead: { ...oldFamilyPlumber, notes: '=HYPERLINK("http://evil")' }, score: scoreLead(oldFamilyPlumber, DEFAULT_BUYBOX) };
    expect(buildExport([row], "csv")).toContain(`'=HYPERLINK`);
    expect(buildExport([row], "hubspot")).toContain("Company Domain Name");
    expect(buildExport([row], "salesforce")).toContain("Hot");
  });
});
