import { describe, expect, it } from "vitest";
import { companyKey, dedupeInputs, normalizeDomain, parsePasted } from "../src/lib/domain";

describe("normalizeDomain", () => {
  it.each([
    ["https://www.Acme.com/about?x=1", "acme.com"],
    ["acme.com", "acme.com"],
    ["owner@acme.com", "acme.com"],
    ["blog.acme.com", "acme.com"],
    ["shop.acme.co.uk", "acme.co.uk"],
    ["joesplumbing.wixsite.com/home", "joesplumbing.wixsite.com"],
    ["http://www2.acme.com:8080/", "acme.com"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it("rejects junk", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain(undefined)).toBeNull();
  });
});

describe("companyKey", () => {
  it("ignores legal suffixes, punctuation and '&' vs 'and'", () => {
    expect(companyKey("The Acme Co., LLC")).toBe("acme");
    expect(companyKey("Russ & Daughters")).toBe(companyKey("Russ and Daughters, LLC"));
  });
});

describe("parsePasted", () => {
  it("pulls domains out of messy free text", () => {
    const got = parsePasted("https://www.a.com/x\nb.org, c.net;  someone@d.io\nnope").map((l) => l.domain);
    expect(got).toEqual(["a.com", "b.org", "c.net", "d.io"]);
  });
});

describe("dedupeInputs", () => {
  it("drops same-domain and same-company duplicates, within the batch and against existing leads", () => {
    const { unique, duplicates } = dedupeInputs(
      [
        { domain: "a.com", source: "csv", name: "Alpha Plumbing LLC" },
        { domain: "a.com", source: "csv" },
        { domain: "alpha-plumbing.net", source: "csv", name: "Alpha Plumbing, Inc." },
        { domain: "b.com", source: "csv" },
        { domain: "existing.com", source: "csv" },
      ],
      [{ domain: "existing.com" }],
    );
    expect(unique.map((u) => u.domain)).toEqual(["a.com", "b.com"]);
    expect(duplicates.map((d) => d.reason)).toEqual(["same domain", "same company name", "same domain"]);
  });
});
