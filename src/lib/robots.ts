export const BOT_TOKEN = "dealscoutbot";

interface Rule {
  allow: boolean;
  path: string;
}

/** Minimal RFC 9309 robots.txt matcher: picks our group (or `*`) and applies longest-match wins. */
export function parseRobots(txt: string): (path: string) => boolean {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const idx = line.indexOf(":");
    if (!line || idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (current && (key === "allow" || key === "disallow") && value) {
      current.rules.push({ allow: key === "allow", path: value });
    }
  }

  const group =
    groups.find((g) => g.agents.some((a) => a.includes(BOT_TOKEN))) ?? groups.find((g) => g.agents.includes("*"));
  const rules = (group?.rules ?? []).map((r) => ({
    ...r,
    re: new RegExp(
      "^" +
        r.path
          .replace(/[.+?^{}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, ".*")
          .replace(/\$(?!$)/g, "\\$"),
    ),
  }));

  return (path: string) => {
    let best: { allow: boolean; len: number } | null = null;
    for (const r of rules) {
      if (r.re.test(path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) {
        best = { allow: r.allow, len: r.path.length };
      }
    }
    return best ? best.allow : true;
  };
}
