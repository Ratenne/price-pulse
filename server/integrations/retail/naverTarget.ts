// Candidate transport scope only. URL shape is not proof of permission, seller
// identity, product-ID namespace or a verified product parser.
export function validateNaverTargetUrl(value: string): URL {
  const url = new URL(value);
  if (
    value.length > 2048 ||
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["smartstore.naver.com", "brand.naver.com"].includes(url.hostname) ||
    !/^\/[a-zA-Z0-9_-]+\/products\/[1-9]\d*\/?$/.test(url.pathname) ||
    url.href !== value
  )
    throw new Error("NAVER_TARGET_NOT_SUPPORTED");
  return url;
}
