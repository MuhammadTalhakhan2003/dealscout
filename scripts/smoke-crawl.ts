/**
 * Live smoke test for the enrichment pipeline.
 *   npx tsx scripts/smoke-crawl.ts katzsdelicatessen.com lodgecastiron.com
 */
import { enrichDomain } from "../src/lib/crawler";
import { SAMPLE_LEADS } from "../src/lib/sample";

const domains = process.argv.slice(2).length ? process.argv.slice(2) : [...new Set(SAMPLE_LEADS.map((l) => l.domain))];

async function main() {
  const results = await Promise.all(domains.map((d) => enrichDomain(d)));
  for (const e of results) {
  console.log(
    JSON.stringify({
      domain: e.domain,
      ok: e.ok,
      error: e.error,
      ms: e.ms,
      name: e.name,
      founded: e.foundedYear,
      foundedEvidence: e.foundedEvidence,
      city: e.city,
      region: e.region,
      emails: e.emails.map((x) => `${x.address} [${x.kind}/${x.mx}]`),
      phones: e.phones,
      people: e.people.map((p) => `${p.name} (${p.title})`),
      socials: Object.keys(e.socials),
      tech: e.tech,
      pages: e.pagesCrawled.length,
      copyright: e.copyrightYear,
      flags: e.flags,
      succession: e.successionSignals,
    }),
  );
  }
}

void main();
