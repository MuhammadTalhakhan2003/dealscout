import { ANALYTICS_TECH, DIY_BUILDERS, extractPage, type PageFacts } from "./extract";
import { BOT_TOKEN, parseRobots } from "./robots";
import { verifyEmails } from "./verify";
import type { Enrichment, PersonHint } from "./types";

const USER_AGENT = `Mozilla/5.0 (compatible; DealScoutBot/1.0; +https://github.com/${BOT_TOKEN}; respects robots.txt)`;
const PAGE_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_SUBPAGES = 3;
const SUBPAGE_HINT = /about|contact|team|story|history|leadership|who-we-are|our-company|staff|owner|family/i;
const FALLBACK_SUBPAGES = ["/about", "/about-us", "/contact"];

interface FetchedPage {
  url: string;
  status: number;
  html: string;
  server: string;
}

async function fetchHtml(url: string, timeoutMs = PAGE_TIMEOUT_MS): Promise<FetchedPage> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const type = res.headers.get("content-type") ?? "";
  let html = "";
  if (!type || type.includes("html")) html = (await res.text()).slice(0, MAX_HTML_BYTES);
  else await res.body?.cancel();
  return { url: res.url || url, status: res.status, html, server: res.headers.get("server") ?? "" };
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    // Timeouts won't get better on retry; transient socket resets often do.
    if (e instanceof Error && e.name === "TimeoutError") throw e;
    await new Promise((r) => setTimeout(r, 400));
    return fn();
  }
}

function isBotChallenge(page: FetchedPage) {
  return (
    [403, 429, 503].includes(page.status) &&
    (/cloudflare|ddos-guard|sucuri/i.test(page.server) ||
      /cf-chl|challenge-platform|just a moment|attention required|captcha/i.test(page.html))
  );
}

async function loadRobots(origin: string) {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return () => true;
    return parseRobots(await res.text());
  } catch {
    return () => true;
  }
}

function errorMessage(e: unknown) {
  if (e instanceof Error) {
    if (e.name === "TimeoutError") return "Site timed out";
    const cause = (e as Error & { cause?: { code?: string } }).cause;
    if (cause?.code === "ENOTFOUND") return "Domain does not resolve";
    if (cause?.code === "ECONNREFUSED") return "Connection refused";
    if (cause?.code?.startsWith("ERR_TLS") || cause?.code?.includes("CERT")) return "TLS certificate error";
    return e.message;
  }
  return String(e);
}

function emptyEnrichment(domain: string): Enrichment {
  return {
    domain,
    url: `https://${domain}`,
    ok: false,
    fetchedAt: Date.now(),
    ms: 0,
    pagesCrawled: [],
    emails: [],
    phones: [],
    socials: {},
    people: [],
    tech: [],
    flags: {
      https: false,
      mobileViewport: false,
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
}

const GENERIC_TITLE = /^(home|homepage|home page|welcome|index|official site|official website)$/i;

function prettyDomain(domain: string) {
  const root = domain.split(".")[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}

/** Picks the company's real name from og:site_name / <title>, preferring the chunk that matches the domain. */
function pickName(home: PageFacts, domain: string) {
  const root = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const chunks = (home.title ?? "")
    .replace(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, "")
    .split(/\s*[|•·:–—]\s*|\s+-\s+/)
    .map((s) => s.trim());
  const candidates = [home.siteName, ...chunks]
    .filter((s): s is string => !!s && s.length >= 2 && s.length <= 60 && !GENERIC_TITLE.test(s))
    .map((s) => (/^[\w-]+\.[a-z]{2,}$/i.test(s) ? prettyDomain(domain) : s));
  const matchesDomain = candidates.find((c) => {
    const sq = squash(c);
    return sq.length >= 3 && (root.includes(sq) || sq.includes(root) || sq.slice(0, 6) === root.slice(0, 6));
  });
  return matchesDomain ?? candidates[0] ?? prettyDomain(domain);
}

function pickSubpages(home: PageFacts, isAllowed: (path: string) => boolean) {
  const seen = new Set<string>([new URL(home.url).pathname]);
  const picks: string[] = [];
  for (const link of home.links) {
    const path = new URL(link).pathname;
    if (seen.has(path) || !SUBPAGE_HINT.test(path) || !isAllowed(path)) continue;
    seen.add(path);
    picks.push(link);
    if (picks.length >= MAX_SUBPAGES) return picks;
  }
  const origin = new URL(home.url).origin;
  for (const p of FALLBACK_SUBPAGES) {
    if (picks.length >= MAX_SUBPAGES) break;
    if (!seen.has(p) && isAllowed(p)) picks.push(origin + p);
  }
  return picks;
}

function dedupePeople(people: PersonHint[]) {
  const seen = new Set<string>();
  return people.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true))).slice(0, 4);
}

/** Crawls a company's homepage + up to 3 high-signal subpages and merges everything into one profile. */
export async function enrichDomain(domain: string): Promise<Enrichment> {
  const started = Date.now();
  const result = emptyEnrichment(domain);
  const finish = (patch: Partial<Enrichment>): Enrichment => ({ ...result, ...patch, ms: Date.now() - started });

  const isAllowed = await loadRobots(`https://${domain}`);
  if (!isAllowed("/")) {
    return finish({ blockedByRobots: true, error: "robots.txt disallows crawling — respected and skipped" });
  }

  let home: FetchedPage | null = null;
  let lastError = "Unreachable";
  for (const url of [`https://${domain}`, `https://www.${domain}`, `http://${domain}`]) {
    try {
      const page = await withRetry(() => fetchHtml(url));
      if (isBotChallenge(page)) {
        return finish({ challenged: true, error: "Bot protection (CAPTCHA / WAF challenge) — flagged for manual review" });
      }
      if (page.status < 400 && page.html) {
        home = page;
        break;
      }
      lastError = [401, 403, 405, 429].includes(page.status)
        ? `Site refused automated access (HTTP ${page.status}) — flagged for manual review`
        : `HTTP ${page.status}`;
    } catch (e) {
      lastError = errorMessage(e);
    }
  }
  if (!home) return finish({ error: lastError });

  const finalHost = new URL(home.url).hostname.replace(/^www\./, "");
  const homeFacts = extractPage(home.html, home.url, finalHost.endsWith(domain) ? domain : finalHost);
  const subpages = pickSubpages(homeFacts, isAllowed);
  const settled = await Promise.allSettled(subpages.map((u) => fetchHtml(u)));
  const pages: PageFacts[] = [homeFacts];
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value.status < 400 && s.value.html) {
      pages.push(extractPage(s.value.html, s.value.url, domain));
    }
  }

  const first = <K extends keyof PageFacts>(key: K) => pages.map((p) => p[key]).find((v) => v !== undefined && v !== "");
  const tech = [...new Set(pages.flatMap((p) => p.tech))];
  const foundedPage = pages.find((p) => p.foundedYear);
  const socials = Object.assign({}, ...[...pages].reverse().map((p) => p.socials));
  const copyrightYears = pages.map((p) => p.copyrightYear).filter((y): y is number => !!y);

  return finish({
    ok: true,
    url: home.url,
    pagesCrawled: pages.map((p) => p.url),
    name: pickName(homeFacts, domain),
    description: first("description") as string | undefined,
    emails: await verifyEmails(pages.flatMap((p) => p.emails), domain),
    phones: [...new Set(pages.flatMap((p) => p.phones))].slice(0, 4),
    socials,
    people: dedupePeople(pages.flatMap((p) => p.people)),
    foundedYear: foundedPage?.foundedYear,
    foundedEvidence: foundedPage?.foundedEvidence,
    copyrightYear: copyrightYears.length ? Math.max(...copyrightYears) : undefined,
    address: first("address") as string | undefined,
    city: first("city") as string | undefined,
    region: first("region") as string | undefined,
    tech,
    flags: {
      https: home.url.startsWith("https://"),
      mobileViewport: homeFacts.viewport,
      analytics: tech.some((t) => ANALYTICS_TECH.has(t)),
      booking: pages.some((p) => p.booking),
      ecommerce: pages.some((p) => p.ecommerce),
      structuredData: pages.some((p) => p.structuredData),
      diyBuilder: tech.some((t) => DIY_BUILDERS.has(t)),
      familyOwned: pages.some((p) => p.familyOwned),
    },
    successionSignals: [...new Set(pages.flatMap((p) => p.successionSignals))],
    headings: [...new Set(pages.flatMap((p) => p.headings))].slice(0, 10),
    textSample: pages
      .map((p) => p.text)
      .join(" ")
      .slice(0, 2500),
  });
}
