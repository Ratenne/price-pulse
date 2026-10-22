import * as cheerio from "cheerio";
import type {
  DiscoveredProduct,
  DiscoveredProductPage,
} from "../../domain/discoveredProduct";

function parsePositivePrice(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const price = Number(value.replace(/,/g, "").trim());
  return Number.isSafeInteger(price) && price > 0 ? price : undefined;
}

function parseRegisteredYearMonth(value: string): string | undefined {
  const match = /(\d{2})\.(0[1-9]|1[0-2])\./.exec(value);
  return match ? `20${match[1]}-${match[2]}` : undefined;
}

function productCodeFromUrl(url: string): string | undefined {
  try {
    const code = new URL(url, "https://prod.danawa.com").searchParams.get(
      "pcode"
    );
    return code && /^\d+$/.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

export function calculateTotalPages(
  totalProductCount: number,
  listCount: number
): number {
  if (!Number.isInteger(totalProductCount) || totalProductCount < 0) {
    throw new Error("totalProductCount must be a non-negative integer");
  }
  if (!Number.isInteger(listCount) || listCount <= 0) {
    throw new Error("listCount must be a positive integer");
  }
  return Math.ceil(totalProductCount / listCount);
}

export function deduplicateDiscoveredProducts(
  products: DiscoveredProduct[]
): DiscoveredProduct[] {
  return Array.from(
    new Map(
      products.map(product => [product.externalProductId, product])
    ).values()
  );
}

export function parseDanawaProductList(
  html: string,
  page: number,
  listCount: number
): DiscoveredProductPage {
  const $ = cheerio.load(html);
  const totalValue = $("#totalProductCount").attr("value");
  const totalProductCount = Number(totalValue);
  if (!Number.isInteger(totalProductCount) || totalProductCount <= 0) {
    throw new Error("Danawa product list is missing a valid totalProductCount");
  }

  const products: DiscoveredProduct[] = [];
  $("li.prod_item")
    .not(".prod_ad_item")
    .each((_index, element) => {
      const item = $(element);
      const itemId = item.attr("id") ?? "";
      if (/^ad|^adSmartProduct_/i.test(itemId)) return;

      const nameLink = item.find('a[name="productName"]').first();
      const rawUrl = nameLink.attr("href")?.trim();
      if (!rawUrl) return;
      const idCode = /^productItem(\d+)$/.exec(itemId)?.[1];
      const externalProductId = productCodeFromUrl(rawUrl) ?? idCode;
      if (!externalProductId) return;

      const name = nameLink.text().replace(/\s+/g, " ").trim();
      const category = item
        .find(`#productItem_categoryInfo_${externalProductId}`)
        .attr("value")
        ?.trim();
      if (!name || !category) return;

      const rawCurrentPrice = item
        .find(`#min_price_${externalProductId}`)
        .attr("value");
      const currentMinPrice = parsePositivePrice(rawCurrentPrice);

      products.push({
        externalProductId,
        name,
        category,
        sourceUrl: new URL(rawUrl, "https://prod.danawa.com").toString(),
        currentMinPrice,
        ...(currentMinPrice === undefined
          ? {
              currentPriceFailureReason: rawCurrentPrice?.trim()
                ? ("INVALID_CURRENT_PRICE" as const)
                : ("CURRENT_PRICE_NOT_PROVIDED" as const),
            }
          : {}),
        registeredYearMonth: parseRegisteredYearMonth(
          item.find(".meta_item.mt_date").first().text()
        ),
      });
    });

  const uniqueProducts = deduplicateDiscoveredProducts(products);
  if (uniqueProducts.length === 0) {
    throw new Error("Danawa product list contained no valid non-ad products");
  }

  return {
    page,
    totalProductCount,
    totalPages: calculateTotalPages(totalProductCount, listCount),
    products: uniqueProducts,
  };
}
