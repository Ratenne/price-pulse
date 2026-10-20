import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { naverRobotsAllows } from "./naverRobots";
describe("restricted PricePulse robots rules", () => {
  it("honors the observed Smartstore/Brandstore block without impersonating exempt bots", () => {
    const body = readFileSync(
      new URL("./__fixtures__/naver-stores.robots.txt", import.meta.url),
      "utf8"
    );
    expect(naverRobotsAllows(body, "/unit-shop/products/123")).toBe(false);
  });
  it.each([
    ["User-agent: *\nDisallow: /", "/a", false],
    ["User-agent: *\nAllow: /", "/a", true],
    [
      "User-agent: *\nDisallow: /\nUser-agent: PricePulse\nAllow: /",
      "/a",
      true,
    ],
    [
      "User-agent: *\nAllow: /\nUser-agent: PricePulse\nDisallow: /",
      "/a",
      false,
    ],
    [
      "User-agent: *\nDisallow: /\nAllow: /shop/products/",
      "/shop/products/1",
      true,
    ],
    ["User-agent: *\nDisallow: /*/products/*$", "/shop/products/123", false],
    ["User-agent: *\nDisallow: /*/123$", "/123/123", false],
    [
      "User-agent: *\nAllow: /ab/products/123\nDisallow: /*a*b*/*p*r*o*d*u*c*t*s*/*1*2*3$",
      "/ab/products/123",
      false,
    ],
    ["User-agent: *\nDisallow: /a\nAllow: /a", "/a", true],
    ["User-agent: *\nDisallow: /a$", "/ab", true],
    ["User-agent: *\nDisallow:", "/a", true],
    ["User-agent: Googlebot\nAllow: /", "/a", false],
    ["<html>blocked</html>", "/a", false],
    ["User-agent: *\nCrawl-delay: 30", "/a", false],
    ["User-agent: *\nDisallow: /%61", "/a", false],
    ["", "/a", false],
  ])("evaluates %j for %s as %s", (body, path, expected) => {
    expect(naverRobotsAllows(body, path)).toBe(expected);
  });
});
