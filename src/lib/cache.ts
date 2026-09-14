import { createClient, type Client } from "@libsql/client";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Enrichment, OutreachDraft } from "./types";

const ENRICHMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MEMORY_LIMIT = 500;

let client: Client | null = null;
let ready: Promise<unknown> | null = null;

export function databaseKind() {
  return process.env.TURSO_DATABASE_URL ? "turso" : "sqlite-file";
}

function db() {
  if (!client) {
    // Turso (hosted libSQL) in production; otherwise a local SQLite file in the OS temp dir. Temp works
    // on Vercel (whose filesystem is read-only except /tmp) and keeps the file out of synced folders
    // like OneDrive/Dropbox, whose file locks stall SQLite's synchronous local driver.
    const localFile = join(tmpdir(), "dealscout-cache.db").replace(/\\/g, "/");
    // `||`, not `??`: an empty `TURSO_DATABASE_URL=` (as in .env.example) must fall back to the local file.
    const url = process.env.TURSO_DATABASE_URL || `file:${localFile}`;
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
    ready = client.batch(
      [
        `CREATE TABLE IF NOT EXISTS enrichment_cache_v2 (
           domain TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at INTEGER NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS outreach_cache (
           key TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS rate_limits (
           key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, hits INTEGER NOT NULL)`,
      ],
      "write",
    );
  }
  return { client, ready: ready! };
}

// L1: per-instance memory (hot within a warm serverless instance). L2: libSQL, shared across instances.
const memory = new Map<string, Enrichment>();

function remember(e: Enrichment) {
  memory.delete(e.domain);
  memory.set(e.domain, e);
  if (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value!);
}

export async function getCachedEnrichment(domain: string): Promise<Enrichment | null> {
  const hot = memory.get(domain);
  if (hot && Date.now() - hot.fetchedAt < ENRICHMENT_TTL_MS) return hot;
  try {
    const { client, ready } = db();
    await ready;
    const rs = await client.execute({
      sql: "SELECT data, fetched_at FROM enrichment_cache_v2 WHERE domain = ?",
      args: [domain],
    });
    const row = rs.rows[0];
    if (!row || Date.now() - Number(row.fetched_at) > ENRICHMENT_TTL_MS) return null;
    const e = JSON.parse(String(row.data)) as Enrichment;
    remember(e);
    return e;
  } catch (err) {
    console.warn("[cache] read failed, continuing without cache", err);
    return null;
  }
}

export async function putCachedEnrichment(e: Enrichment): Promise<void> {
  remember(e);
  try {
    const { client, ready } = db();
    await ready;
    await client.execute({
      sql: `INSERT INTO enrichment_cache_v2 (domain, data, fetched_at) VALUES (?, ?, ?)
            ON CONFLICT(domain) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at`,
      args: [e.domain, JSON.stringify(e), e.fetchedAt],
    });
  } catch (err) {
    console.warn("[cache] write failed, continuing without cache", err);
  }
}

export async function getCachedDraft(key: string): Promise<OutreachDraft | null> {
  try {
    const { client, ready } = db();
    await ready;
    const rs = await client.execute({ sql: "SELECT data FROM outreach_cache WHERE key = ?", args: [key] });
    return rs.rows[0] ? (JSON.parse(String(rs.rows[0].data)) as OutreachDraft) : null;
  } catch {
    return null;
  }
}

export async function putCachedDraft(key: string, draft: OutreachDraft): Promise<void> {
  try {
    const { client, ready } = db();
    await ready;
    await client.execute({
      sql: `INSERT INTO outreach_cache (key, data, created_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`,
      args: [key, JSON.stringify(draft), draft.createdAt],
    });
  } catch (err) {
    console.warn("[cache] draft write failed", err);
  }
}

const quotaMemory = new Map<string, { window: number; hits: number }>();

/** Records one use of `key` in the current fixed window; returns false once `limit` is exceeded. */
export async function consumeQuota(key: string, limit: number, windowMs: number): Promise<boolean> {
  const window = Math.floor(Date.now() / windowMs) * windowMs;
  try {
    const { client, ready } = db();
    await ready;
    // SET expressions see the row's old values, so a new window resets the counter to 1.
    const rs = await client.execute({
      sql: `INSERT INTO rate_limits (key, window_start, hits) VALUES (?, ?, 1)
            ON CONFLICT(key) DO UPDATE SET
              hits = CASE WHEN window_start = excluded.window_start THEN hits + 1 ELSE 1 END,
              window_start = excluded.window_start
            RETURNING hits`,
      args: [key, window],
    });
    return Number(rs.rows[0]?.hits ?? 1) <= limit;
  } catch (err) {
    // Shared counter unavailable: fall back to a per-instance one rather than failing open.
    console.warn("[cache] quota check failed, using per-instance counter", err);
    const cur = quotaMemory.get(key);
    const hits = cur && cur.window === window ? cur.hits + 1 : 1;
    if (quotaMemory.size > MEMORY_LIMIT) quotaMemory.clear();
    quotaMemory.set(key, { window, hits });
    return hits <= limit;
  }
}
