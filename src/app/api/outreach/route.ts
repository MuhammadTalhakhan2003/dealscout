import { createHash } from "node:crypto";
import { getCachedDraft, putCachedDraft } from "@/lib/cache";
import {
  MODEL,
  aiEnabled,
  describeClaudeError,
  draftWithClaude,
  templateDraft,
  type OutreachRequest,
} from "@/lib/outreach";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as (OutreachRequest & { regenerate?: boolean }) | null;
  if (!body?.company || !body?.domain) {
    return Response.json({ error: "company and domain are required" }, { status: 400 });
  }
  const req: OutreachRequest = {
    ...body,
    signals: body.signals ?? [],
    gaps: body.gaps ?? [],
    sender: body.sender ?? { name: "", background: "" },
    tone: body.tone ?? "warm",
  };

  if (!aiEnabled()) return Response.json({ draft: templateDraft(req), cached: false });

  const key = createHash("sha256")
    .update(JSON.stringify([MODEL, req.domain, req.tone, req.sender, req.ownerName, req.signals]))
    .digest("hex");
  if (!body.regenerate) {
    const cached = await getCachedDraft(key);
    if (cached) return Response.json({ draft: cached, cached: true });
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
