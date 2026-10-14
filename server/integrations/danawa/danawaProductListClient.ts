import type { DiscoveredProductPage } from "../../domain/discoveredProduct";
import type { DanawaCategoryMapping } from "./danawaCategory";
import { DanawaIntegrationError } from "./danawaErrors.js";
import { parseDanawaProductList } from "./danawaProductListParser.js";
import { DanawaRequestPolicy } from "./danawaRequestPolicy.js";

const PRODUCT_LIST_ENDPOINT =
  "https://prod.danawa.com/list/ajax/getProductList.ajax.php";

export class DanawaProductListClient {
  constructor(
    private readonly requestPolicy: DanawaRequestPolicy,
    private readonly listCount: number,
    private readonly endpoint = PRODUCT_LIST_ENDPOINT
  ) {}

  async fetchPage(
    category: DanawaCategoryMapping,
    page: number
  ): Promise<DiscoveredProductPage> {
    const body = new URLSearchParams({
      btnAllOptUse: "true",
      page: String(page),
      listCategoryCode: category.listCategoryCode,
      categoryCode: category.categoryCode,
      physicsCate1: category.physicsCate1,
      physicsCate2: category.physicsCate2,
      physicsCate3: category.physicsCate3,
      physicsCate4: category.physicsCate4,
      viewMethod: "LIST",
      sortMethod: "BEST",
      listCount: String(this.listCount),
      group: "11",
      depth: "2",
      listPackageType: "3",
      categoryMappingCode: category.categoryMappingCode,
      sProductListApi: "search",
    });
    const response = await this.requestPolicy.request(new URL(this.endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: `https://prod.danawa.com/list/?cate=${category.uiCategoryCode}`,
        "User-Agent": "Mozilla/5.0 (compatible; PricePulse/1.0)",
        "X-Requested-With": "XMLHttpRequest",
      },
      body,
    });
    if (!response.ok) {
      throw new DanawaIntegrationError(
        `Danawa product list returned HTTP ${response.status}`,
        "HTTP",
        response.status
      );
    }
    return parseDanawaProductList(await response.text(), page, this.listCount);
  }
}
