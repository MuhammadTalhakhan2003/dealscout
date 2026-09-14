import { describe, expect, it } from "vitest";
import { parseRobots } from "../src/lib/robots";

describe("parseRobots", () => {
  it("applies the * group with longest-match precedence", () => {
    const allowed = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: BadBot\nDisallow: /");
    expect(allowed("/")).toBe(true);
    expect(allowed("/private/secret")).toBe(false);
    expect(allowed("/private/ok/page")).toBe(true);
  });

  it("honours a site-wide disallow", () => {
    expect(parseRobots("User-agent: *\nDisallow: /")("/about")).toBe(false);
  });

  it("prefers a group addressed to our bot over *", () => {
    const allowed = parseRobots("User-agent: *\nDisallow:\n\nUser-agent: DealScoutBot\nDisallow: /");
    expect(allowed("/")).toBe(false);
  });

  it("supports * wildcards and $ anchors", () => {
    const allowed = parseRobots("User-agent: *\nDisallow: /*.pdf$");
    expect(allowed("/files/deck.pdf")).toBe(false);
    expect(allowed("/files/deck.pdf?download=1")).toBe(true);
  });

  it("allows everything when robots.txt is empty or has no matching group", () => {
    expect(parseRobots("")("/anything")).toBe(true);
    expect(parseRobots("User-agent: OtherBot\nDisallow: /")("/")).toBe(true);
  });
});
