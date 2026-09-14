import * as cheerio from "cheerio";
import type { PersonHint, SocialKey } from "./types";

export interface RawEmail {
  address: string;
  source: string;
}

export interface PageFacts {
  url: string;
  title?: string;
  siteName?: string;
  description?: string;
  emails: RawEmail[];
  phones: string[];
  socials: Partial<Record<SocialKey, string>>;
  people: PersonHint[];
  foundedYear?: number;
  foundedEvidence?: string;
  copyrightYear?: number;
  address?: string;
  city?: string;
  region?: string;
  tech: string[];
  viewport: boolean;
  structuredData: boolean;
  familyOwned: boolean;
  successionSignals: string[];
  booking: boolean;
  ecommerce: boolean;
  headings: string[];
  text: string;
  links: string[];
}

const THIS_YEAR = new Date().getFullYear();

const TECH_SIGNATURES: [string, RegExp][] = [
  ["WordPress", /wp-content|wp-includes/],
  ["Wix", /wixstatic\.com|wix\.com|_wixcss/],
  ["Squarespace", /squarespace/],
  ["Shopify", /cdn\.shopify\.com|shopify\.theme/],
  ["GoDaddy Builder", /img1\.wsimg\.com|godaddy website builder/],
  ["Weebly", /weebly/],
  ["Webflow", /webflow/],
  ["Duda", /dudamobile|multiscreensite|dmcdn\.net/],
  ["Joomla", /joomla/],
  ["Drupal", /drupal/],
  ["Elementor", /elementor/],
  ["WooCommerce", /woocommerce/],
  ["Next.js", /\/_next\/static/],
  ["jQuery", /jquery/],
  ["Bootstrap", /bootstrap(\.min)?\.(css|js)/],
  ["Google Analytics", /google-analytics\.com|googletagmanager\.com\/gtag|gtag\(/],
  ["Google Tag Manager", /googletagmanager\.com\/gtm/],
  ["Meta Pixel", /connect\.facebook\.net|fbq\(/],
  ["Hotjar", /hotjar/],
  ["Microsoft Clarity", /clarity\.ms/],
  ["HubSpot", /js\.hs-scripts\.com|js\.hsforms\.net|hubspot/],
  ["Mailchimp", /list-manage\.com|mailchimp/],
  ["Klaviyo", /klaviyo/],
  ["Calendly", /calendly\.com/],
  ["Acuity", /acuityscheduling/],
  ["ServiceTitan", /servicetitan/],
  ["Housecall Pro", /housecallpro/],
  ["Jobber", /getjobber\.com/],
  ["OpenTable", /opentable/],
  ["Square", /squareup\.com|square\.site/],
  ["Stripe", /js\.stripe\.com/],
  ["Intercom", /intercom/],
  ["Drift", /js\.driftt\.com|drift\.com/],
  ["Tawk.to", /tawk\.to/],
  ["Podium", /podium\.com/],
  ["Birdeye", /birdeye/],
  ["reCAPTCHA", /recaptcha/],
  ["Cloudflare", /\/cdn-cgi\//],
];

export const ANALYTICS_TECH = new Set([
  "Google Analytics", "Google Tag Manager", "Meta Pixel", "Hotjar", "Microsoft Clarity", "HubSpot",
]);
export const BOOKING_TECH = new Set(["Calendly", "Acuity", "ServiceTitan", "Housecall Pro", "Jobber", "OpenTable"]);
export const ECOMMERCE_TECH = new Set(["Shopify", "WooCommerce", "Stripe", "Square"]);
export const DIY_BUILDERS = new Set(["Wix", "GoDaddy Builder", "Weebly", "Squarespace", "Duda"]);

const ORG_TYPES =
  /Organization|LocalBusiness|Store|Service|Contractor|Plumber|Electrician|HVAC|Roofing|Restaurant|Bakery|Dentist|Attorney|Legal|Medical|AutoRepair|HomeAndConstruction|Professional|Corporation|Company|Brewery|Winery|Manufacturer/i;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi;
const BAD_EMAIL =
  /\.(png|jpe?g|gif|svg|webp|css|js)$|@(example|domain|email|yourdomain|yoursite|sentry|wixpress|sentry-next)\.|yourname|firstname|lastname|john\.?doe|jane\.?doe|u00|@2x/i;
const OBFUSCATED_EMAIL =
  /([a-z0-9._%+-]+)\s*[[(]\s*at\s*[\])]\s*([a-z0-9-]+)\s*[[(]\s*dot\s*[\])]\s*([a-z]{2,24})/gi;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-](\d{4})\b/g;
const COPYRIGHT_RE = /(?:©|&copy;|\(c\)|copyright)\s*(?:(?:19|20)\d{2}\s*[-–—]\s*)?((?:19|20)\d{2})/gi;
const FOUNDED_RE =
  /\b(?:since|established|est\.?|founded(?:\s+in)?|in business since|family[- ]owned since|opened (?:our doors )?in|serving [^.]{0,60}? since)\s*(?:in\s+)?((?:18|19|20)\d{2})\b/i;
const YEARS_IN_BUSINESS_RE =
  /\b(?:over|more than|nearly)?\s*(\d{2,3})\+?\s*years\s+(?:of\s+(?:experience|service|serving)|in business|serving)/i;
const FAMILY_RE = /\bfamily[- ](?:owned|operated|run|business)\b/i;
const SUCCESSION_TERMS = [
  "second generation", "third generation", "fourth generation", "2nd generation", "3rd generation", "4th generation",
  "generations", "retiring", "retirement", "succession", "father and son", "father-son", "founded by his father",
  "founded by her father", "founded by my father", "passed down",
];
const BOOKING_TEXT =
  /\b(book (?:online|now|an appointment|a service|your)|schedule (?:online|service|an appointment|now)|request an appointment|online booking)\b/i;
const ECOMMERCE_TEXT = /\b(add to cart|shop now|checkout|shopping cart)\b/i;

const US_STATE =
  "A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY]";
const CITY_STATE_ZIP = new RegExp(`\\b([A-Z][a-zA-Z.'-]+(?: [A-Z][a-zA-Z.'-]+){0,3}),?\\s+(${US_STATE})\\s+(\\d{5})(?:-\\d{4})?\\b`);
const STREET_TOKEN =
  /^(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|pkwy|parkway|hwy|highway|ct|court|pl|place|cir|circle|ste|suite|unit|sq|square|ter|terrace|trl|trail)\.?$/i;

/** "Detroit Street Ann Arbor" -> "Ann Arbor": drop everything up to the last street-suffix token. */
export function cleanCity(raw: string): string | undefined {
  const tokens = raw.trim().split(/\s+/);
  let cut = -1;
  tokens.forEach((t, i) => {
    if (STREET_TOKEN.test(t)) cut = i;
  });
  return tokens.slice(cut + 1).join(" ") || undefined;
}

const TITLES =
  "Co-?Owner|Owner|Co-?Founder|Founder|President|CEO|Chief Executive Officer|Principal|Managing Partner|General Manager|Proprietor";
const NAME = "[A-Z][a-z]+(?: [A-Z]\\.)? [A-Z][a-zA-Z'’-]+";
const NAME_THEN_TITLE = new RegExp(`(${NAME})\\s*(?:,|-|–|—|\\||:|\\()\\s*(?:the\\s+|our\\s+)?(${TITLES})\\b`, "g");
const TITLE_THEN_NAME = new RegExp(`\\b(${TITLES})(?:\\s*(?:&|and)\\s*(?:${TITLES}))?\\s*(?:,|:|-|–|—)?\\s+(${NAME})`, "g");
const NAME_STOPWORDS = new Set(
  ("Our The About Contact Meet Home Services Service Company Team Read More Learn Call Today Free Business Family " +
    "Welcome Owner Founder President Your This We Us Local Owned Operated Veteran Woman Licensed Insured Privacy " +
    "Policy Terms Get Quote Book Now View All Area Areas Customer Reviews Best Top New Estimate Schedule Click Here " +
    "Since Years Of And For With Message From Letter Note Proud Small Office Main Street Suite Commercial Residential")
    .split(" "),
);

const SOCIAL_PATTERNS: [SocialKey, RegExp][] = [
  ["linkedin", /linkedin\.com\/(company|in|school)\//i],
  ["facebook", /(?:^|\/\/|\.)facebook\.com\/(?!sharer|share|dialog|plugins|tr\b)/i],
  ["instagram", /(?:^|\/\/|\.)instagram\.com\/(?!p\/|explore|share)/i],
  ["x", /(?:^|\/\/|\.)(?:twitter|x)\.com\/(?!intent|share|home)/i],
  ["youtube", /youtube\.com\/(channel|c|user|@)/i],
];

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();
const uniq = <T>(xs: T[]) => [...new Set(xs)];

export function normalizePhone(raw: string): string | undefined {
  const digits = raw.replace(/[^\d]/g, "");
  const d = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (d.length === 10 && /^[2-9]/.test(d)) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return undefined;
}

/** Cloudflare "email protection" XOR-encodes addresses; decoding them recovers contacts naive scrapers miss. */
export function decodeCfEmail(hex: string): string | undefined {
  if (!/^[0-9a-f]{4,}$/i.test(hex)) return undefined;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out.includes("@") ? out : undefined;
}

function flattenJsonLd(node: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(node)) {
    node.forEach((n) => flattenJsonLd(n, out));
  } else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    out.push(o);
    if (o["@graph"]) flattenJsonLd(o["@graph"], out);
  }
}

function validYear(y: number) {
  return y >= 1800 && y <= THIS_YEAR;
}

function snippetAround(text: string, index: number, len: number) {
  const start = Math.max(0, index - 40);
  return "…" + clean(text.slice(start, index + len + 40)) + "…";
}

function classifySocial(href: string): { key: SocialKey; url: string } | undefined {
  for (const [key, re] of SOCIAL_PATTERNS) if (re.test(href)) return { key, url: href.split("?")[0] };
  return undefined;
}

function plausibleName(name: string) {
  const words = name.split(" ");
  return words.length >= 2 && words.length <= 4 && !words.some((w) => NAME_STOPWORDS.has(w.replace(/[.,]/g, "")));
}

export function extractPeople(text: string, source: string): PersonHint[] {
  const found: PersonHint[] = [];
  for (const m of text.matchAll(NAME_THEN_TITLE)) {
    if (plausibleName(m[1])) found.push({ name: m[1], title: m[2], source });
  }
  for (const m of text.matchAll(TITLE_THEN_NAME)) {
    if (plausibleName(m[2])) found.push({ name: m[2], title: m[1], source });
  }
  const seen = new Set<string>();
  return found.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true))).slice(0, 4);
}

export function extractFounded(text: string): { year: number; evidence: string } | undefined {
  const m = FOUNDED_RE.exec(text);
  if (m && validYear(+m[1])) return { year: +m[1], evidence: snippetAround(text, m.index, m[0].length) };
  const y = YEARS_IN_BUSINESS_RE.exec(text);
  if (y) {
    const years = +y[1];
    if (years >= 3 && years <= 150) {
      return { year: THIS_YEAR - years, evidence: `≈ derived from “${clean(y[0])}”` };
    }
  }
  return undefined;
}

export function extractPage(html: string, pageUrl: string, domain: string): PageFacts {
  const $ = cheerio.load(html);
  const lowerHtml = html.toLowerCase();
  const facts: PageFacts = {
    url: pageUrl,
    emails: [],
    phones: [],
    socials: {},
    people: [],
    tech: [],
    viewport: $('meta[name="viewport"]').length > 0,
    structuredData: false,
    familyOwned: false,
    successionSignals: [],
    booking: false,
    ecommerce: false,
    headings: [],
    text: "",
    links: [],
  };

  facts.title = clean($("title").first().text()) || undefined;
  facts.siteName = clean($('meta[property="og:site_name"]').attr("content")) || undefined;
  facts.description =
    clean($('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content")) ||
    undefined;

  const generator = ($('meta[name="generator"]').attr("content") ?? "").toLowerCase();
  for (const [name, re] of TECH_SIGNATURES) if (re.test(lowerHtml) || re.test(generator)) facts.tech.push(name);

  // Structured data (schema.org JSON-LD) is the most reliable source when present.
  const nodes: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      flattenJsonLd(JSON.parse($(el).text()), nodes);
    } catch {
      // Malformed JSON-LD is common on small-business sites; ignore it.
    }
  });
  for (const n of nodes) {
    if (!ORG_TYPES.test(String(n["@type"] ?? ""))) continue;
    facts.structuredData = true;
    if (typeof n.name === "string" && !facts.siteName) facts.siteName = clean(n.name);
    const founding = String(n.foundingDate ?? "").match(/(18|19|20)\d{2}/);
    if (founding && validYear(+founding[0])) {
      facts.foundedYear = +founding[0];
      facts.foundedEvidence = `schema.org foundingDate: ${n.foundingDate}`;
    }
    for (const f of [n.founder].flat().filter(Boolean)) {
      const name = typeof f === "string" ? f : (f as Record<string, unknown>).name;
      if (typeof name === "string" && plausibleName(clean(name))) {
        facts.people.push({ name: clean(name), title: "Founder", source: "schema.org" });
      }
    }
    const addr = n.address as Record<string, unknown> | string | undefined;
    if (addr && typeof addr === "object") {
      facts.city ??= clean(String(addr.addressLocality ?? "")) || undefined;
      facts.region ??= clean(String(addr.addressRegion ?? "")) || undefined;
      facts.address ??=
        clean([addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).join(", ")) ||
        undefined;
    } else if (typeof addr === "string") {
      facts.address ??= clean(addr);
    }
    if (typeof n.telephone === "string") {
      const p = normalizePhone(n.telephone);
      if (p) facts.phones.push(p);
    }
    if (typeof n.email === "string") facts.emails.push({ address: n.email.replace(/^mailto:/i, ""), source: "schema.org" });
    for (const s of [n.sameAs].flat().filter((x): x is string => typeof x === "string")) {
      const social = classifySocial(s);
      if (social) facts.socials[social.key] ??= social.url;
    }
  }

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (/^mailto:/i.test(href)) {
      const addr = decodeURIComponent(href.slice(7).split("?")[0]).trim();
      if (addr) facts.emails.push({ address: addr, source: "mailto link" });
      return;
    }
    if (/^tel:/i.test(href)) {
      const p = normalizePhone(href.slice(4));
      if (p) facts.phones.push(p);
      return;
    }
    if (href.includes("/cdn-cgi/l/email-protection#")) {
      const d = decodeCfEmail(href.split("#")[1] ?? "");
      if (d) facts.emails.push({ address: d, source: "decoded Cloudflare-protected link" });
      return;
    }
    const social = classifySocial(href);
    if (social) {
      facts.socials[social.key] ??= social.url;
      return;
    }
    try {
      const u = new URL(href, pageUrl);
      const host = u.hostname.replace(/^www\./, "");
      if (host === domain || host.endsWith("." + domain)) facts.links.push(u.origin + u.pathname);
    } catch {
      // Relative junk like "javascript:void(0)" — skip.
    }
  });
  $("[data-cfemail]").each((_, el) => {
    const d = decodeCfEmail($(el).attr("data-cfemail") ?? "");
    if (d) facts.emails.push({ address: d, source: "decoded Cloudflare-protected email" });
  });

  // Visible text: strip non-content nodes and pad block elements so words don't fuse together.
  $("script, style, noscript, svg, template, iframe").remove();
  $("br, p, div, li, h1, h2, h3, h4, h5, h6, td, th, span, a, section, article, footer, header, address, strong, b").each(
    (_, el) => {
      $(el).append(" ");
    },
  );
  facts.headings = uniq(
    $("h1, h2")
      .map((_, el) => clean($(el).text()))
      .get()
      .filter((h) => h.length > 2 && h.length < 90),
  ).slice(0, 8);
  const text = clean($("body").text());
  facts.text = text;

  const deobfuscated = text.replace(OBFUSCATED_EMAIL, "$1@$2.$3");
  for (const m of deobfuscated.matchAll(EMAIL_RE)) facts.emails.push({ address: m[0], source: "page text" });
  facts.emails = facts.emails
    .map((e) => ({ ...e, address: e.address.toLowerCase().replace(/^[._-]+|[._-]+$/g, "") }))
    .filter((e) => !BAD_EMAIL.test(e.address));

  let phoneMatches = 0;
  for (const m of text.matchAll(PHONE_RE)) {
    facts.phones.push(`(${m[1]}) ${m[2]}-${m[3]}`);
    if (++phoneMatches >= 6) break;
  }
  facts.phones = uniq(facts.phones);

  if (!facts.foundedYear) {
    const f = extractFounded(text);
    if (f) {
      facts.foundedYear = f.year;
      facts.foundedEvidence = f.evidence;
    }
  }

  const copyrightYears = [...html.matchAll(COPYRIGHT_RE)].map((m) => +m[1]).filter(validYear);
  if (copyrightYears.length) facts.copyrightYear = Math.max(...copyrightYears);

  facts.familyOwned = FAMILY_RE.test(text);
  const lowerText = text.toLowerCase();
  facts.successionSignals = SUCCESSION_TERMS.filter((t) => lowerText.includes(t));
  facts.booking = facts.tech.some((t) => BOOKING_TECH.has(t)) || BOOKING_TEXT.test(text);
  facts.ecommerce = facts.tech.some((t) => ECOMMERCE_TECH.has(t)) || ECOMMERCE_TEXT.test(text);
  facts.people.push(...extractPeople(text, pageUrl));

  if (!facts.city) {
    const loc = CITY_STATE_ZIP.exec(text);
    const city = loc ? cleanCity(loc[1]) : undefined;
    if (loc && city) {
      facts.city = city;
      facts.region = loc[2];
      facts.address ??= `${city}, ${loc[2]} ${loc[3]}`;
    }
  }

  return facts;
}
