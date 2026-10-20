export const NAVER_USER_AGENT = "PricePulse/0.1";

// Restricted robots evaluator for our fixed product token and query-free URLs.
// Unreadable/unsupported rule syntax fails closed. No crawler impersonation.
export function naverRobotsAllows(body: string, pathname: string): boolean {
  const groups: {
    agents: string[];
    rules: { allow: boolean; path: string }[];
  }[] = [];
  let group: (typeof groups)[number] | undefined;
  let directives = false;
  if (body.length > 262144 || !pathname.startsWith("/")) return false;
  for (const raw of body.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.split("#", 1)[0].trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) return false;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!/^(?:\*|[a-z0-9_-]+)$/i.test(value)) return false;
      if (!group || directives) {
        group = { agents: [], rules: [] };
        groups.push(group);
        directives = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      if (!group) return false;
      directives = true;
      if (!value) continue;
      // Bounded ASCII URL paths, simple glob '*' and a final '$' only. Reject
      // percent encoding rather than applying a possibly wrong decoding rule.
      if (
        !value.startsWith("/") ||
        value.length > 2048 ||
        /[^\x21-\x7e]|%/.test(value) ||
        value.slice(0, -1).includes("$") ||
        (value.match(/\*/g)?.length ?? 0) > 16
      )
        return false;
      group.rules.push({ allow: key === "allow", path: value });
    } else if (key !== "sitemap") {
      // Crawl-delay/host and other extensions need explicit implementation;
      // silently ignoring a provider's pacing rule would be unsafe.
      return false;
    }
  }
  let specificity = -1;
  let rules: (typeof groups)[number]["rules"] = [];
  for (const candidate of groups) {
    const score = candidate.agents.includes("pricepulse")
      ? 10
      : candidate.agents.includes("*")
        ? 0
        : -1;
    if (score < 0 || score < specificity) continue;
    if (score > specificity) {
      rules = [];
      specificity = score;
    }
    rules.push(...candidate.rules);
  }
  if (specificity < 0) return false;
  let best = -1,
    allowed = true;
  for (const rule of rules) {
    const end = rule.path.endsWith("$");
    const path = end ? rule.path.slice(0, -1) : rule.path;
    // Bounded greedy wildcard matching, including anchored repeated suffixes.
    const pattern = path + (end ? "" : "*");
    let i = 0,
      j = 0,
      star = -1,
      mark = 0;
    while (i < pathname.length) {
      if (pattern[j] === "*") {
        star = j++;
        mark = i;
      } else if (pattern[j] === pathname[i]) {
        i++;
        j++;
      } else if (star >= 0) {
        j = star + 1;
        i = ++mark;
      } else break;
    }
    while (pattern[j] === "*") j++;
    if (i !== pathname.length || j !== pattern.length) continue;
    // RFC 9309 selects the rule with the most octets. Our supported rule
    // alphabet is ASCII; wildcard/anchor bytes must not be silently subtracted.
    const length = rule.path.length;
    if (length > best) {
      best = length;
      allowed = rule.allow;
    } else if (length === best && rule.allow) allowed = true;
  }
  return allowed;
}
