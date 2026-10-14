import { DanawaIntegrationError } from "./danawaErrors.js";
export type FetchFunction = typeof fetch;

export interface DanawaRequestPolicyOptions {
  requestDelayMs: number;
  retryCount: number;
  retryBackoffMs: number;
  timeoutMs: number;
  fetchFunction?: FetchFunction;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export class DanawaRequestPolicy {
  private readonly fetchFunction: FetchFunction;
  private nextRequestAt = 0;

  constructor(private readonly options: DanawaRequestPolicyOptions) {
    this.fetchFunction = options.fetchFunction ?? fetch;
  }

  async request(url: URL, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt <= this.options.retryCount; attempt += 1) {
      const now = Date.now();
      const requestAt = Math.max(now, this.nextRequestAt);
      this.nextRequestAt = requestAt + this.options.requestDelayMs;
      if (requestAt > now) await sleep(requestAt - now);

      try {
        const response = await this.fetchFunction(url, {
          ...init,
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === this.options.retryCount) return response;
        await response.body?.cancel();
        await sleep(
          retryAfterMilliseconds(response) ??
            this.options.retryBackoffMs * (attempt + 1)
        );
      } catch (error) {
        if (attempt === this.options.retryCount) {
          throw new DanawaIntegrationError(
            "Danawa request failed after retries",
            "HTTP",
            undefined,
            { cause: error }
          );
        }
        await sleep(this.options.retryBackoffMs * (attempt + 1));
      }
    }
    throw new DanawaIntegrationError("Danawa retry loop exhausted", "HTTP");
  }
}
