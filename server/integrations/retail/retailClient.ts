import { validateRetailUrl, type RetailLink } from "./retailPrice.js";
import { parseStructuredOffer } from "./structuredOffer.js";
import { parseElevenStreetOffer } from "./elevenStreetOffer.js";

export class RetailFetchError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
// No redirect following: a listing must never redirect to an untrusted host or login.
// No proxy rotation, CAPTCHA handling or retries for denied requests.
export async function fetchRetailOffer(link: RetailLink, fetchFn = fetch) {
  validateRetailUrl(link.source, link.url);
  const response = await fetchFn(link.url, {
    headers: {
      "User-Agent": "PricePulse/1.0 (public product price collector)",
      Accept: "text/html",
    },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if ([401, 403, 418, 429].includes(response.status))
    throw new RetailFetchError("ACCESS_BLOCKED");
  if (!response.ok) throw new RetailFetchError(`HTTP_${response.status}`);
  if (!(response.headers.get("content-type") ?? "").includes("text/html"))
    throw new RetailFetchError("EXPECTED_HTML");
  const reader = response.body?.getReader();
  if (!reader) throw new RetailFetchError("EMPTY_BODY");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 5_000_000) throw new RetailFetchError("RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = Buffer.concat(chunks);
  const encoding = /charset=(?:euc-kr|ks_c_5601|cp949)/i.test(
    response.headers.get("content-type") ?? ""
  )
    ? "euc-kr"
    : "utf-8";
  const html = new TextDecoder(encoding).decode(bytes);
  return link.source === "11ST"
    ? parseElevenStreetOffer(html, link)
    : parseStructuredOffer(html, link);
}
