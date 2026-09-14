import type { LeadInput } from "./types";

/**
 * Real, publicly listed, long-established US businesses — the kind of owner-operated companies a
 * searcher targets. Two intentional duplicates (a www/URL variant and a renamed CSV row) show dedupe.
 */
export const SAMPLE_LEADS: LeadInput[] = [
  { domain: "katzsdelicatessen.com", name: "Katz's Delicatessen", industry: "Restaurant", location: "New York, NY" },
  { domain: "russanddaughters.com", name: "Russ & Daughters", industry: "Specialty food", location: "New York, NY" },
  { domain: "zingermansdeli.com", name: "Zingerman's Delicatessen", industry: "Restaurant", location: "Ann Arbor, MI" },
  { domain: "ferraracafe.com", name: "Ferrara Bakery & Cafe", industry: "Bakery", location: "New York, NY" },
  { domain: "vermontcountrystore.com", name: "The Vermont Country Store", industry: "Retail", location: "Weston, VT" },
  { domain: "lodgecastiron.com", name: "Lodge Cast Iron", industry: "Manufacturing", location: "South Pittsburg, TN" },
  { domain: "bakerbrothersplumbing.com", name: "Baker Brothers Plumbing", industry: "Plumbing & HVAC", location: "Dallas, TX" },
  { domain: "abacusplumbing.com", name: "Abacus Plumbing", industry: "Plumbing & HVAC", location: "Houston, TX" },
  { domain: "michaelandson.com", name: "Michael & Son Services", industry: "Home services", location: "Alexandria, VA" },
  { domain: "zabars.com", name: "Zabar's", industry: "Specialty food", location: "New York, NY" },
  { domain: "juniorscheesecake.com", name: "Junior's Cheesecake", industry: "Bakery", location: "Brooklyn, NY" },
  { domain: "stewleonards.com", name: "Stew Leonard's", industry: "Grocery", location: "Norwalk, CT" },
  { domain: "commanderspalace.com", name: "Commander's Palace", industry: "Restaurant", location: "New Orleans, LA" },
  { domain: "penzeys.com", name: "Penzeys Spices", industry: "Specialty food", location: "Wauwatosa, WI" },
  { domain: "www.katzsdelicatessen.com", name: "Katz's Deli (duplicate)", industry: "Restaurant", location: "New York, NY" },
  { domain: "russanddaughterscafe.com", name: "Russ and Daughters, LLC", industry: "Specialty food", location: "New York, NY" },
].map((l) => ({ ...l, domain: l.domain.replace(/^www\./, ""), source: "sample" as const }));
