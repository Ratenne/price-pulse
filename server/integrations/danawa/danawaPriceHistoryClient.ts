import { DanawaIntegrationError } from "./danawaErrors";
import { DanawaRequestPolicy, type FetchFunction } from "./danawaRequestPolicy";

export interface DanawaPriceHistoryClientOptions {
  endpoint?: string;
  timeoutMs?: number;
  fetchFunction?: FetchFunction;
  now?: () => number;
  requestPolicy?: DanawaRequestPolicy;
}

const DEFAULT_ENDPOINT =
  "https://prod.danawa.com/info/ajax/getProductPriceList.ajax.php";

export class DanawaPriceHistoryClient {
  private readonly endpoint: string;
  private readonly now: () => number;
  private readonly requestPolicy: DanawaRequestPolicy;

  constructor(options: DanawaPriceHistoryClientOptions = {}) {
    this.endpoint =
      options.endpoint ??
      process.env.DANAWA_PRICE_HISTORY_URL ??
      DEFAULT_ENDPOINT;
    const timeoutMs =
      options.timeoutMs ??
      Number(process.env.DANAWA_REQUEST_TIMEOUT_MS ?? 10_000);
    this.now = options.now ?? Date.now;

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error("DANAWA_REQUEST_TIMEOUT_MS must be a positive integer");
    }
    this.requestPolicy =
      options.requestPolicy ??
      new DanawaRequestPolicy({
        requestDelayMs: 0,
        retryCount: 0,
        retryBackoffMs: 0,
        timeoutMs,
        fetchFunction: options.fetchFunction,
      });
  }

  async fetchPriceHistory(externalProductId: string): Promise<unknown> {
    const productCode = externalProductId.trim();
    if (!/^\d+$/.test(productCode)) {
      throw new DanawaIntegrationError(
        "Danawa productCode must contain only digits",
        "VALIDATION"
      );
    }

    const url = new URL(this.endpoint);
    url.searchParams.set("productCode", productCode);
    url.searchParams.set("_", String(this.now()));

    const response = await this.requestPolicy.request(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        Referer: `https://prod.danawa.com/info/?pcode=${encodeURIComponent(productCode)}`,
        "User-Agent": "Mozilla/5.0 (compatible; PricePulse/1.0)",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    if (!response.ok) {
      throw new DanawaIntegrationError(
        `Danawa price history request returned HTTP ${response.status}`,
        "HTTP",
        response.status
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw new DanawaIntegrationError(
        "Danawa response was not valid JSON",
        "PARSE",
        undefined,
        {
          cause: error,
        }
      );
    }
  }
}
