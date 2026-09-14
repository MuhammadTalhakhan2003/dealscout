import { databaseKind } from "@/lib/cache";
import { MODEL, aiEnabled } from "@/lib/outreach";

export function GET() {
  return Response.json({ ai: aiEnabled(), model: MODEL, database: databaseKind() });
}
