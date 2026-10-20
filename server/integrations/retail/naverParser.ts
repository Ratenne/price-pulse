import { load } from "cheerio";
import type { RetailProductInput } from "../../domain/retailProduct.js";
import { validateNaverTargetUrl } from "./naverTarget.js";

export interface NaverHtmlPage {
  url: string;
  html: string;
  observedAt: string;
}
export type NaverParseResult =
  | { status: "PARSED"; input: RetailProductInput }
  | { status: "UNSUPPORTED"; code: string }
  | { status: "REJECTED"; code: string };
export interface NaverProductParser {
  readonly verified: boolean;
  parse(page: NaverHtmlPage): NaverParseResult;
}

export function parseNaverProductHtml(page: NaverHtmlPage): NaverParseResult {
  try {
    validateNaverTargetUrl(page.url);
  } catch {
    return { status: "REJECTED", code: "NAVER_TARGET_NOT_SUPPORTED" };
  }
  if (
    !Number.isFinite(Date.parse(page.observedAt)) ||
    Buffer.byteLength(page.html, "utf8") > 2_000_000 ||
    !page.html.trim()
  )
    return { status: "REJECTED", code: "INVALID_HTML_RESPONSE" };
  const $ = load(page.html);
  const text = $("body").text();
  // Only an actual observed access-block message is recognized. No page class,
  // seller ID, price, option or structured-data field is assumed to be verified.
  if (text.includes("쇼핑 서비스 접속이 일시적으로 제한되었습니다."))
    return { status: "REJECTED", code: "ACCESS_BLOCKED" };
  return { status: "UNSUPPORTED", code: "NAVER_PRODUCT_HTML_UNVERIFIED" };
}

// No permitted real product HTML sample is available. Approval JSON cannot flip
// this into a working parser; a reviewed implementation and fixtures are needed.
export const naverProductParser: NaverProductParser = {
  verified: false,
  parse: parseNaverProductHtml,
};
