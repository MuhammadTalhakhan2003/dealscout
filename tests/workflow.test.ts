import { describe, expect, it } from "vitest";
import { buildBrief } from "../src/lib/report";
import { DEFAULT_BUYBOX, nextAction, scoreLead } from "../src/lib/score";
import type { Enrichment, Lead } from "../src/lib/types";
import { classifyEmail, looksLikePerson } from "../src/lib/verify";

const base: Enrichment = {
  domain: "x.com",
  url: "https://x.com",
  ok: true,
  fetchedAt: 0,
  ms: 0,
  pagesCrawled: [],
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
};

const lead = (e?: Partial<Enrichment>, extra: Partial<Lead> = {}): Lead => ({
  id: "x.com",
  domain: "x.com",
  source: "paste",
  status: e ? "done" : "error",
  stage: "new",
  addedAt: 0,
  enrichment: e ? { ...base, ...e } : undefined,
  ...extra,
});

describe("email classification", () => {
  it("treats functional mailboxes as shared inboxes, even on the company domain", () => {
    expect(classifyEmail("information@x.com", "x.com").kind).toBe("role");
    expect(classifyEmail("feedback@x.com", "x.com").kind).toBe("role");
    expect(classifyEmail("bill@x.com", "x.com").kind).toBe("direct");
    expect(classifyEmail("owner.smith@gmail.com", "x.com").kind).toBe("personal");
  });

  it("recognises person-like local parts", () => {
    expect(looksLikePerson("bill@x.com")).toBe(true);
    expect(looksLikePerson("jane.doe@x.com")).toBe(true);
    expect(looksLikePerson("mystorevisit@x.com")).toBe(false);
  });
});

describe("nextAction", () => {
  it("emails a named owner directly when a verified personal mailbox exists", () => {
    const a = nextAction(
      lead({
        people: [{ name: "Robert Smith", title: "Owner", source: "about" }],
        emails: [{ address: "bob@x.com", kind: "direct", onDomain: true, mx: "valid", source: "mailto" }],
      }),
    );
    expect(a).toEqual({ kind: "email", label: "Email Robert directly", detail: "bob@x.com" });
  });

  it("calls and asks for the owner when only a phone is known", () => {
    const a = nextAction(lead({ people: [{ name: "Ann Lee", title: "President", source: "x" }], phones: ["(214) 555-0199"] }));
    expect(a).toMatchObject({ kind: "call", label: "Call and ask for Ann" });
  });

  it("points to LinkedIn when the owner is unknown but a company page exists", () => {
    expect(nextAction(lead({ socials: { linkedin: "https://linkedin.com/company/x" } })).kind).toBe("research");
  });

  it("asks for manual verification when the site couldn't be analysed", () => {
    expect(nextAction(lead(undefined, { error: "Site timed out" })).kind).toBe("manual");
  });
});

describe("buildBrief", () => {
  it("produces a self-contained, escaped HTML report", () => {
    const l = lead({ name: "Smith <Plumbing>", foundedYear: 1978, phones: ["(214) 555-0199"] }, { name: "Smith <Plumbing>" });
    const html = buildBrief([{ lead: l, score: scoreLead(l, DEFAULT_BUYBOX) }], DEFAULT_BUYBOX);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Pipeline Brief");
    expect(html).toContain("Smith &lt;Plumbing&gt;");
    expect(html).not.toContain("Smith <Plumbing>");
  });
});
