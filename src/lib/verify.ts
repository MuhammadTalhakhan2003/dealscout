import { promises as dns } from "node:dns";
import type { EmailContact, EmailKind, MxStatus } from "./types";
import type { RawEmail } from "./extract";

const FREE_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "aol.com", "hotmail.com", "outlook.com", "icloud.com", "msn.com", "comcast.net",
  "att.net", "sbcglobal.net", "verizon.net", "bellsouth.net", "live.com", "me.com", "protonmail.com", "ymail.com",
  "cox.net", "charter.net", "earthlink.net",
]);
const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "yopmail.com"]);
const ROLE_MAILBOX =
  /^(info|information|contact|contactus|hello|hi|sales|office|admin|support|service|services|team|mail|inquiries|enquiries|inquiry|help|billing|accounts?|accounting|marketing|careers|jobs|hr|webmaster|noreply|no-reply|donotreply|customerservice|custserv|orders?|myorder|booking|bookings|reservations?|estimates|quotes|dispatch|press|media|feedback|donations?|events?|catering|wholesale|store|shop|locations?|tech|it|privacy|legal|newsletter|giftcards?|mystorevisit|webinfo|frontdesk)@/i;

/** "bill@", "jane.doe@", "jsmith@" look like a person; "mystorevisit@" doesn't. Used to rank named mailboxes. */
export function looksLikePerson(address: string) {
  const local = address.split("@")[0];
  return /^[a-z]{2,10}$/.test(local) || /^[a-z]+[._-][a-z]+$/.test(local);
}
const SYNTAX = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}$/i;

// One DNS lookup per mail domain per server instance.
const mxCache = new Map<string, Promise<MxStatus>>();

export function checkMx(domain: string): Promise<MxStatus> {
  let pending = mxCache.get(domain);
  if (!pending) {
    const lookup = dns
      .resolveMx(domain)
      .then((records): MxStatus => (records.length ? "valid" : "none"))
      .catch((e: NodeJS.ErrnoException): MxStatus => (e.code === "ENOTFOUND" || e.code === "ENODATA" ? "none" : "unknown"));
    const timeout = new Promise<MxStatus>((resolve) => setTimeout(() => resolve("unknown"), 3000));
    pending = Promise.race([lookup, timeout]);
    mxCache.set(domain, pending);
  }
  return pending;
}

export function classifyEmail(address: string, companyDomain: string): { kind: EmailKind; onDomain: boolean } {
  const host = address.split("@")[1] ?? "";
  const onDomain = host === companyDomain || host.endsWith("." + companyDomain);
  if (ROLE_MAILBOX.test(address)) return { kind: "role", onDomain };
  if (FREE_PROVIDERS.has(host)) return { kind: "personal", onDomain };
  return { kind: onDomain ? "direct" : "role", onDomain };
}

const RANK: Record<EmailKind, number> = { direct: 0, personal: 1, role: 2 };

/**
 * Syntax + disposable filtering, then an MX lookup per mail domain. We deliberately do NOT
 * open SMTP connections to probe mailboxes: it's unreliable, looks like abuse to mail servers,
 * and port 25 is blocked on serverless hosts anyway.
 */
export async function verifyEmails(raw: RawEmail[], companyDomain: string): Promise<EmailContact[]> {
  const byAddress = new Map<string, RawEmail>();
  for (const e of raw) {
    const address = e.address.trim().toLowerCase();
    if (!SYNTAX.test(address) || DISPOSABLE.has(address.split("@")[1])) continue;
    if (!byAddress.has(address)) byAddress.set(address, { ...e, address });
  }
  const contacts = await Promise.all(
    [...byAddress.values()].map(async (e): Promise<EmailContact> => {
      const { kind, onDomain } = classifyEmail(e.address, companyDomain);
      return { address: e.address, kind, onDomain, mx: await checkMx(e.address.split("@")[1]), source: e.source };
    }),
  );
  // Off-domain corporate addresses (vendors, web agencies) are noise unless they're personal mailboxes.
  return contacts
    .filter((c) => c.onDomain || c.kind === "personal")
    .sort(
      (a, b) =>
        RANK[a.kind] - RANK[b.kind] ||
        Number(looksLikePerson(b.address)) - Number(looksLikePerson(a.address)) ||
        Number(b.mx === "valid") - Number(a.mx === "valid"),
    )
    .slice(0, 6);
}
