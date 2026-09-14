import { getCachedEnrichment, putCachedEnrichment } from "@/lib/cache";
import { mapWithConcurrency } from "@/lib/concurrency";
import { enrichDomain } from "@/lib/crawler";
import { normalizeDomain } from "@/lib/domain";

export const maxDuration = 60;

const MAX_DOMAINS_PER_REQUEST = 25;
const CONCURRENCY = 6;

/**
 * POST { domains: string[], force?: boolean }
 * Streams NDJSON — one line per domain as soon as it finishes — so the UI fills in progressively
 * instead of waiting on the slowest site.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { domains?: unknown; force?: unknown } | null;
  const raw = Array.isArray(body?.domains) ? body.domains : [];
  const domains = [...new Set(raw.map((d) => normalizeDomain(String(d))).filter((d): d is string => !!d))].slice(
    0,
    MAX_DOMAINS_PER_REQUEST,
  );
  if (!domains.length) return Response.json({ error: "No valid domains supplied" }, { status: 400 });
  const force = body?.force === true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      await mapWithConcurrency(domains, CONCURRENCY, async (domain) => {
        const started = Date.now();
        let enrichment = force ? null : await getCachedEnrichment(domain);
        const cached = !!enrichment;
        if (!enrichment) {
          enrichment = await enrichDomain(domain);
          if (enrichment.ok) await putCachedEnrichment(enrichment);
        }
        controller.enqueue(
          encoder.encode(JSON.stringify({ domain, cached, ms: Date.now() - started, enrichment }) + "\n"),
        );
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
