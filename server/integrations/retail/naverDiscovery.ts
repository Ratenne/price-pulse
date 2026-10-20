import { load } from "cheerio";
import {
  createRetailDiscoveryCandidate,
  type RetailDiscoveryCandidate,
} from "../../domain/retailDiscovery.js";
import { RetailFetchError } from "./retailClient.js";

// Reviewed source contracts only. No HTTP client, browser headers, proxy call or
// obsolete Search API fallback is imported from the upstream implementation.
export const NAVER_BFF_DATA_SOURCE =
  "https://ns-portal.shopping.naver.com/api/v2/shopping-paged-slot";
export const NAVER_PROXY_DATA_SOURCE =
  "https://k-skill-proxy.nomadamas.org/v1/naver-shopping/search";
type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as RecordValue)
    : {};
function text(v: unknown, max = 1000): string | null {
  if (
    typeof v !== "string" &&
    !(typeof v === "number" && Number.isSafeInteger(v))
  )
    return null;
  const $ = load(String(v).slice(0, 5000));
  $("script,style").remove();
  return $("body").text().replace(/\s+/g, " ").trim().slice(0, max) || null;
}
function integer(v: unknown, max = 2_000_000_000): number | null {
  if (typeof v === "string") {
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(v.trim())) return null;
    v = Number(v.replaceAll(",", ""));
  }
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max
    ? v
    : null;
}
function link(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const url = new URL(v, "https://search.shopping.naver.com");
    if (!v.startsWith("/") && !v.startsWith("https://")) return null;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !url.hostname.includes(".") ||
      /^(?:\d|\[)/.test(url.hostname) ||
      /(?:\.localhost|\.local|\.internal)$/.test(url.hostname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
function cardLink(v: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (Array.isArray(v))
    return (
      v
        .slice(0, 5)
        .map(v => cardLink(v, depth + 1))
        .find(Boolean) ?? null
    );
  if (v && typeof v === "object") {
    const obj = record(v);
    for (const key of ["pcUrl", "mobileUrl", "url", "imageUrl"]) {
      const value = link(obj[key]);
      if (value) return value;
    }
    return null;
  }
  return link(v);
}
const first = (obj: RecordValue, keys: string[]) =>
  keys
    .map(key => obj[key])
    .find(v => v !== null && v !== undefined && v !== "");
const priceFields = [
  "discountedSalePrice",
  "discountedKRWSalePrice",
  "couponDiscountedPrice",
  "discountedPrice",
  "mobileLowPrice",
  "lowPrice",
  "price",
  "salePrice",
  "saleKRWPrice",
  "originPrice",
  "originalPrice",
  "hprice",
];
export interface NaverDiscoveryOptions {
  page?: number;
  limit?: number;
  sort?: "rel" | "date" | "price_asc" | "price_dsc" | "review";
  // Capture metadata supplied by trusted server/offline artifact handling. A
  // proxy's requested_at/our receipt time is not an actual price observation.
  observedAt?: string;
  receivedAt?: string;
}
export function normalizeNaverDiscovery(
  payload: unknown,
  options: NaverDiscoveryOptions = {}
) {
  const root = record(payload),
    meta = record(root.meta);
  const proxy = Array.isArray(root.items);
  if (proxy && !["bff-json", "none"].includes(String(meta.extraction)))
    throw new RetailFetchError(
      "UNSUPPORTED_DISCOVERY_EXTRACTION",
      "UNSUPPORTED"
    );
  if (proxy && meta.extraction === "none" && (root.items as unknown[]).length)
    throw new RetailFetchError("INVALID_DISCOVERY_RESPONSE");
  if (!proxy && !Array.isArray(root.data))
    throw new RetailFetchError("INVALID_DISCOVERY_RESPONSE");
  const page = options.page ?? (proxy ? (integer(meta.page) ?? 1) : 1);
  const limit = options.limit ?? 40;
  const sort =
    options.sort ?? (typeof meta.sort === "string" ? meta.sort : "rel");
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 40 ||
    !["rel", "date", "price_asc", "price_dsc", "review"].includes(sort)
  )
    throw new RetailFetchError("INVALID_DISCOVERY_QUERY");
  if (proxy && meta.page !== undefined && integer(meta.page) !== page)
    throw new RetailFetchError("DISCOVERY_PAGE_MISMATCH");
  const receivedAt = options.receivedAt ?? new Date().toISOString();
  const observedAt = options.observedAt ?? null;
  if (
    !Number.isFinite(Date.parse(receivedAt)) ||
    (observedAt !== null && !Number.isFinite(Date.parse(observedAt)))
  )
    throw new RetailFetchError("INVALID_DISCOVERY_CAPTURE_TIME");
  let cards: unknown[];
  if (proxy) cards = (root.items as unknown[]).slice(0, 500);
  else {
    const pages = (root.data as unknown[]).slice(0, 50).map(record);
    if (pages.some(v => !Array.isArray(v.slots)))
      throw new RetailFetchError("INVALID_DISCOVERY_RESPONSE");
    const numbered = (v: RecordValue) =>
      integer(first(v, ["page", "pageNo", "pageNumber", "pagingIndex"]));
    cards = pages
      .filter(v => numbered(v) === page || (page === 1 && numbered(v) === null))
      .flatMap(v =>
        Array.isArray(v.slots)
          ? v.slots.slice(0, 500).map(v => record(v).data)
          : []
      );
  }
  const candidates: RetailDiscoveryCandidate[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  for (const raw of cards) {
    const v = record(raw);
    const title = text(
      proxy
        ? v.title
        : first(v, [
            "productNameOrg",
            "productName",
            "productTitle",
            "product_name",
            "mallProductName",
            "title",
            "name",
          ])
    );
    if (!title || (proxy && v.source !== "bff-json")) {
      rejected++;
      continue;
    }
    const ids: Record<string, string> = {};
    for (const key of proxy
      ? ["product_id"]
      : ["nvMid", "catalogId", "channelProductId", "productId", "id"]) {
      const id = text(v[key], 200);
      if (id) ids[key] = id;
    }
    const idField = Object.keys(ids)[0];
    // Reference/MSRP fields are preserved as evidence, never substituted for an
    // actual displayed search price when no sale/display field is present.
    const selectedField = proxy
      ? "price"
      : priceFields
          .filter(
            key => !["originPrice", "originalPrice", "hprice"].includes(key)
          )
          .find(
            key => v[key] !== null && v[key] !== undefined && v[key] !== ""
          );
    const amount = selectedField ? integer(v[selectedField]) : null;
    const displayedPrice = amount && amount > 0 ? amount : null;
    const url = proxy
      ? link(v.url)
      : cardLink(
          first(v, [
            "productUrl",
            "mallProductUrl",
            "productClickUrl",
            "crUrl",
            "adcrUrl",
            "url",
            "link",
          ])
        );
    const imageUrl = proxy
      ? link(v.image_url)
      : (cardLink(v.images) ??
        cardLink(
          first(v, [
            "imageUrl",
            "imgUrl",
            "image",
            "thumbnail",
            "thumbnailUrl",
            "imgSrc",
          ])
        ));
    const category =
      proxy && Array.isArray(v.category)
        ? v.category
            .slice(0, 5)
            .map(v => text(v))
            .filter((v): v is string => !!v)
        : [
            "category1Name",
            "category2Name",
            "category3Name",
            "category4Name",
            "categoryName",
          ]
            .map(key => text(v[key]))
            .filter((v): v is string => !!v);
    const evidenceFields = proxy ? ["price", "high_price"] : priceFields;
    const candidate = createRetailDiscoveryCandidate({
      kind: "DISCOVERY",
      source: "NAVER",
      externalIds: ids,
      externalProductId: idField ? ids[idField] : null,
      externalIdKind:
        idField === "nvMid"
          ? "NVMID"
          : idField === "catalogId"
            ? "CATALOG_ID"
            : idField === "channelProductId"
              ? "CHANNEL_PRODUCT_ID"
              : idField
                ? "UNVERIFIED_PROXY_ID"
                : "UNKNOWN",
      title,
      displayedPrice,
      shippingFee: null,
      shippingFeeKnown: false,
      comparisonPrice: displayedPrice,
      sellerName: text(
        proxy
          ? v.mall_name
          : first(v, [
              "mallName",
              "mallNm",
              "mall_name",
              "storeName",
              "sellerName",
              "channelName",
              "adMallName",
            ])
      ),
      sellerId: null,
      url,
      imageUrl,
      category,
      reviewCount: integer(
        proxy
          ? v.review_count
          : first(v, [
              "totalReviewCount",
              "reviewCount",
              "reviewCnt",
              "review_count",
            ])
      ),
      manufacturer: null,
      model: null,
      identificationPossible: false,
      identityStatus: "UNVERIFIED",
      priceMeaning:
        selectedField === "couponDiscountedPrice"
          ? "CONDITIONAL"
          : "UNVERIFIED",
      priceEvidence: evidenceFields
        .filter(key => v[key] !== undefined)
        .map(field => ({
          field,
          value:
            typeof v[field] === "string"
              ? v[field].slice(0, 100)
              : typeof v[field] === "number" && Number.isFinite(v[field])
                ? v[field]
                : null,
        })),
      format: proxy ? "K_SKILL_PROXY_JSON" : "NAVER_BFF_JSON",
      dataSource: proxy ? NAVER_PROXY_DATA_SOURCE : NAVER_BFF_DATA_SOURCE,
      observedAt,
      receivedAt,
      validationStatus: "UNVERIFIED",
    });
    // Different seller/URL/ID namespaces never deduplicate by nvMid alone.
    if (!seen.has(candidate.fingerprint)) {
      candidates.push(candidate);
      seen.add(candidate.fingerprint);
    }
  }
  if (sort === "price_asc" || sort === "price_dsc")
    candidates.sort((a, b) =>
      a.comparisonPrice === null
        ? b.comparisonPrice === null
          ? 0
          : 1
        : b.comparisonPrice === null
          ? -1
          : (a.comparisonPrice - b.comparisonPrice) *
            (sort === "price_asc" ? 1 : -1)
    );
  if (sort === "review")
    candidates.sort((a, b) => (b.reviewCount ?? -1) - (a.reviewCount ?? -1));
  return {
    kind: "DISCOVERY_PAGE" as const,
    candidates: candidates.slice(0, limit),
    page,
    sort,
    sortScope: "PAGE" as const,
    sortApplied:
      sort === "date" ? "UNSUPPORTED" : sort === "rel" ? "UPSTREAM" : "LOCAL",
    rejected,
    priceObservationsSaved: 0 as const,
    proxyRequestedAt: proxy ? text(record(root.proxy).requested_at) : null,
  };
}

// There is no approved Naver BFF/proxy collection contract in this project.
// Parsing a supplied JSON artifact never enables a live request implicitly.
export async function requestNaverShoppingDiscovery(): Promise<never> {
  throw new RetailFetchError("NAVER_BFF_HTTP_DISABLED", "UNSUPPORTED");
}
