import { createHash } from "node:crypto";
import { consumeQuota, getCachedDraft, putCachedDraft } from "@/lib/cache";
import {
  MODEL,
  aiEnabled,
  describeClaudeError,
  draftWithClaude,
  normalizeOutreachRequest,
  templateDraft,
} from "@/lib/outreach";

export const maxDuration = 60;

// The deployment is public and Claude calls bill the owner's key, so cap fresh drafts per visitor
// and overall. Cache hits cost nothing and don't count.
const HOUR_MS = 60 * 60 * 1000;
const DRAFTS_PER_IP_PER_HOUR = 10;
const DRAFTS_PER_DAY = 100;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { regenerate?: boolean } | null;
  const req = normalizeOutreachRequest(body);
  if (!req) {
    return Response.json({ error: "company and domain are required" }, { status: 400 });
  }

  if (!aiEnabled()) return Response.json({ draft: templateDraft(req), cached: false });

  const key = createHash("sha256")
    .update(JSON.stringify([MODEL, req.domain, req.tone, req.sender, req.ownerName, req.signals]))
    .digest("hex");
  if (!body?.regenerate) {
    const cached = await getCachedDraft(key);
    if (cached) return Response.json({ draft: cached, cached: true });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed =
    (await consumeQuota(`outreach:ip:${ip}`, DRAFTS_PER_IP_PER_HOUR, HOUR_MS)) &&
    (await consumeQuota("outreach:all", DRAFTS_PER_DAY, 24 * HOUR_MS));
  if (!allowed) {
    const draft = { ...templateDraft(req), note: "AI drafting limit reached for now — showing template draft. Try again later." };
    return Response.json({ draft, cached: false });
  }

  try {
    const draft = await draftWithClaude(req);
    await putCachedDraft(key, draft);
    return Response.json({ draft, cached: false });
  } catch (e) {
    console.error("[outreach] Claude call failed", e);
    const draft = { ...templateDraft(req), note: `Claude unavailable (${describeClaudeError(e)}) — showing template draft.` };
    return Response.json({ draft, cached: false });
  }
}
