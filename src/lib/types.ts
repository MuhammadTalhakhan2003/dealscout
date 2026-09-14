export type Tier = "A" | "B" | "C" | "D";
export type Stage = "new" | "researching" | "contacted" | "conversation" | "loi" | "passed";
export type Tone = "warm" | "direct" | "formal";

export const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: "new", label: "New", hint: "Scored, not yet worked" },
  { key: "researching", label: "Researching", hint: "Verifying owner & fit" },
  { key: "contacted", label: "Contacted", hint: "First touch sent" },
  { key: "conversation", label: "Conversation", hint: "Owner engaged" },
  { key: "loi", label: "NDA / LOI", hint: "Deal in motion" },
  { key: "passed", label: "Passed", hint: "Not a fit / not now" },
];

export type EmailKind = "direct" | "personal" | "role";
export type MxStatus = "valid" | "none" | "unknown";
export type SocialKey = "linkedin" | "facebook" | "instagram" | "x" | "youtube";

export interface EmailContact {
  address: string;
  /** direct = named mailbox on the company domain, personal = gmail/yahoo/etc (often the owner), role = info@/sales@ */
  kind: EmailKind;
  onDomain: boolean;
  mx: MxStatus;
  source: string;
}

export interface PersonHint {
  name: string;
  title: string;
  source: string;
}

export interface SiteFlags {
  https: boolean;
  mobileViewport: boolean;
  analytics: boolean;
  booking: boolean;
  ecommerce: boolean;
  structuredData: boolean;
  diyBuilder: boolean;
  familyOwned: boolean;
}

export interface Enrichment {
  domain: string;
  url: string;
  ok: boolean;
  error?: string;
  challenged?: boolean;
  blockedByRobots?: boolean;
  fetchedAt: number;
  ms: number;
  pagesCrawled: string[];
  name?: string;
  description?: string;
  emails: EmailContact[];
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
  flags: SiteFlags;
  successionSignals: string[];
  headings: string[];
  textSample: string;
}

export interface LeadInput {
  domain: string;
  source: "paste" | "csv" | "sample";
  name?: string;
  industry?: string;
  location?: string;
  employees?: string;
  revenue?: string;
  owner?: string;
  email?: string;
  phone?: string;
}

export interface OutreachDraft {
  subject: string;
  email: string;
  callOpener: string;
  whyNow: string;
  valueCreationIdeas: string[];
  diligenceQuestions: string[];
  source: "claude" | "template";
  model?: string;
  note?: string;
  createdAt: number;
}

export interface Lead extends LeadInput {
  id: string;
  status: "queued" | "enriching" | "done" | "error";
  stage: Stage;
  addedAt: number;
  cached?: boolean;
  /** Transport-level failure (network, server) — site-level failures live on enrichment.error. */
  error?: string;
  enrichment?: Enrichment;
  notes?: string;
  outreach?: OutreachDraft;
}

export interface Weights {
  succession: number;
  upside: number;
  reach: number;
  fit: number;
  durability: number;
}

export interface BuyBox {
  industries: string[];
  regions: string[];
  foundedBefore: number | null;
  weights: Weights;
}

export interface SenderProfile {
  name: string;
  background: string;
}

export interface FactorResult {
  key: keyof Weights;
  label: string;
  weight: number;
  /** 0..1 */
  score: number;
  known: boolean;
  /** false when the factor isn't configured (e.g. no buy box) — excluded from the total entirely */
  active: boolean;
  evidence: string[];
  missing: string[];
}

export interface ScoreResult {
  total: number;
  tier: Tier;
  /** share of scoring weight backed by real evidence, 0..1 */
  coverage: number;
  factors: FactorResult[];
  highlights: string[];
}

export type ActionKind = "email" | "call" | "research" | "manual";

export interface NextAction {
  kind: ActionKind;
  label: string;
  detail?: string;
}

export interface ScoredLead {
  lead: Lead;
  score: ScoreResult;
}
