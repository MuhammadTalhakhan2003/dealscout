import { describe, expect, it } from "vitest";
import { cleanCity, decodeCfEmail, extractFounded, extractPage, normalizePhone } from "../src/lib/extract";

/** Mirrors Cloudflare's email-obfuscation encoding so we can test the decoder. */
function encodeCf(email: string, key = 0x5a) {
  return [key, ...[...email].map((c) => c.charCodeAt(0) ^ key)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

const HTML = `<!doctype html><html><head>
<title>Smith &amp; Sons Plumbing | Dallas Plumbers</title>
<meta name="viewport" content="width=device-width">
<meta name="description" content="Family-owned Dallas plumbers.">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Plumber","name":"Smith & Sons Plumbing",
 "foundingDate":"1978","founder":{"@type":"Person","name":"Robert Smith"},
 "address":{"@type":"PostalAddress","streetAddress":"12 Main St","addressLocality":"Dallas","addressRegion":"TX","postalCode":"75201"},
 "telephone":"+1 214-555-0199","sameAs":["https://www.facebook.com/smithsons"]}</script>
<script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>
</head><body>
<h1>Family-owned plumbing, now in our third generation</h1>
<p>Call us at (214) 555-0199 or email <a href="mailto:bob@smithsonsplumbing.com">Bob</a>.</p>
<p>Office: office [at] smithsonsplumbing [dot] com</p>
<p>Billing: <span class="__cf_email__" data-cfemail="${encodeCf("jane@smithsonsplumbing.com")}">[email protected]</span></p>
<p>Meet Jane Smith, Owner</p>
<a href="https://www.linkedin.com/company/smith-sons">LinkedIn</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
<a href="/about-us">About</a>
<footer>© 2019 Smith &amp; Sons. <img src="logo@2x.png"></footer>
</body></html>`;

describe("extractPage", () => {
  const facts = extractPage(HTML, "https://smithsonsplumbing.com/", "smithsonsplumbing.com");

  it("reads schema.org JSON-LD", () => {
    expect(facts.structuredData).toBe(true);
    expect(facts.foundedYear).toBe(1978);
    expect(facts.city).toBe("Dallas");
    expect(facts.region).toBe("TX");
    expect(facts.siteName).toBe("Smith & Sons Plumbing");
  });

  it("finds mailto, obfuscated and Cloudflare-protected emails", () => {
    const emails = facts.emails.map((e) => e.address);
    expect(emails).toContain("bob@smithsonsplumbing.com");
    expect(emails).toContain("office@smithsonsplumbing.com");
    expect(emails).toContain("jane@smithsonsplumbing.com");
    expect(emails.some((e) => e.includes("@2x"))).toBe(false);
  });

  it("finds decision-makers from JSON-LD and page text", () => {
    const people = facts.people.map((p) => `${p.name}/${p.title}`);
    expect(people).toContain("Robert Smith/Founder");
    expect(people).toContain("Jane Smith/Owner");
  });

  it("extracts phones, socials, tech and succession signals", () => {
    expect(facts.phones).toContain("(214) 555-0199");
    expect(facts.socials.linkedin).toBe("https://www.linkedin.com/company/smith-sons");
    expect(facts.socials.facebook).toBe("https://www.facebook.com/smithsons");
    expect(facts.tech).toContain("Google Analytics");
    expect(facts.copyrightYear).toBe(2019);
    expect(facts.familyOwned).toBe(true);
    expect(facts.successionSignals).toContain("third generation");
    expect(facts.viewport).toBe(true);
    expect(facts.links).toContain("https://smithsonsplumbing.com/about-us");
  });
});

describe("helpers", () => {
  it("extractFounded handles 'since' phrasing and years-in-business", () => {
    expect(extractFounded("Proudly serving Dallas since 1985.")?.year).toBe(1985);
    expect(extractFounded("Over 40 years of experience")?.year).toBe(new Date().getFullYear() - 40);
    expect(extractFounded("Call now for a free quote")).toBeUndefined();
  });

  it("cleanCity strips street fragments", () => {
    expect(cleanCity("Detroit Street Ann Arbor")).toBe("Ann Arbor");
    expect(cleanCity("W. Capitol Drive Wauwatosa")).toBe("Wauwatosa");
    expect(cleanCity("Fort Worth")).toBe("Fort Worth");
  });

  it("normalizePhone formats NANP numbers and rejects others", () => {
    expect(normalizePhone("+1 (214) 555-0199")).toBe("(214) 555-0199");
    expect(normalizePhone("12345")).toBeUndefined();
  });

  it("decodeCfEmail round-trips", () => {
    expect(decodeCfEmail(encodeCf("a@b.com", 0x13))).toBe("a@b.com");
    expect(decodeCfEmail("zz")).toBeUndefined();
  });
});
