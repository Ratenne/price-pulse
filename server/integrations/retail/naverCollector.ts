import { setTimeout as delay } from "node:timers/promises";
import { RetailFetchError } from "./retailClient.js";
import { checkRetailExecution, type RetailPolicies } from "./retailPolicy.js";
import { NAVER_USER_AGENT, naverRobotsAllows } from "./naverRobots.js";
import { validateNaverTargetUrl } from "./naverTarget.js";
import type { NaverHtmlPage } from "./naverParser.js";

export interface NaverCollectorOptions {
  policies?: RetailPolicies;
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<unknown>;
  timeoutMs?: number;
}

// Per-run collector: serialize requests, count robots in the budget, respect
// robots at the target's exact origin, and never follow any redirect/retry.
// This transport is not a claim that a Naver product parser is implemented.
export function createNaverHtmlCollector(options: NaverCollectorOptions = {}) {
  let queue: Promise<unknown> = Promise.resolve();
  let requests = 0;
  let lastRequestAt: number | undefined;
  let blocked = false;
  const robots = new Map<string, { body: string; checkedAt: number } | null>();
  const clock = options.clock ?? (() => new Date());
  const timeout = options.timeoutMs ?? 10000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000)
    throw new RetailFetchError("INVALID_TIMEOUT_CONFIGURATION");

  function approved(url: string) {
    const access = checkRetailExecution("NAVER", {
      ...options,
      now: clock(),
      url,
      method: "CRAWL",
      adapterConfigured: true,
    });
    if (!access.allowed) throw new RetailFetchError(access.code, access.status);
    return access.policy;
  }

  async function request(url: string, target: string, isRobots: boolean) {
    const policy = approved(target);
    if (blocked) throw new RetailFetchError("SOURCE_ACCESS_BLOCKED");
    if (requests >= policy.maxRequestsPerRun)
      throw new RetailFetchError("SOURCE_RUN_LIMIT", "NOT_CONFIGURED");
    if (lastRequestAt !== undefined) {
      const wait =
        Math.max(1500, policy.minDelayMs) - (clock().getTime() - lastRequestAt);
      if (wait > 0) await (options.sleep ?? delay)(wait);
    }
    approved(target); // Expiration can change while pacing a batch.
    requests++;
    lastRequestAt = clock().getTime();
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = async () => {
      const response = await (options.fetchFn ?? fetch)(url, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        headers: {
          "User-Agent": NAVER_USER_AGENT,
          Accept: isRobots ? "text/plain" : "text/html",
        },
        signal: controller.signal,
      });
      if (
        (response.status >= 300 && response.status < 400) ||
        response.redirected ||
        (response.url && response.url !== url)
      )
        throw new RetailFetchError("REDIRECT_NOT_ALLOWED");
      if ([401, 403, 418, 429].includes(response.status)) {
        blocked = true;
        throw new RetailFetchError(
          response.status === 429
            ? "RATE_LIMITED"
            : response.status === 401
              ? "AUTHENTICATION_FAILED"
              : "ACCESS_BLOCKED"
        );
      }
      if (response.status !== 200)
        throw new RetailFetchError(
          response.status >= 500
            ? "UPSTREAM_UNAVAILABLE"
            : "INVALID_HTTP_RESPONSE"
        );
      const type = response.headers.get("content-type") ?? "";
      if (
        !(isRobots ? /^text\/plain(?:;|$)/i : /^text\/html(?:;|$)/i).test(
          type
        ) ||
        /charset\s*=\s*["']?(?!utf-?8\b)[a-z0-9-]+/i.test(type)
      )
        throw new RetailFetchError("INVALID_CONTENT_TYPE");
      const limit = isRobots ? 262144 : 2_000_000;
      const length = response.headers.get("content-length");
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit))
        throw new RetailFetchError("RESPONSE_TOO_LARGE");
      if (!response.body) throw new RetailFetchError("EMPTY_RESPONSE");
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > limit) throw new RetailFetchError("RESPONSE_TOO_LARGE");
        chunks.push(result.value);
      }
      if (!bytes) throw new RetailFetchError("EMPTY_RESPONSE");
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(
          Buffer.concat(chunks)
        );
      } catch {
        throw new RetailFetchError("INVALID_RESPONSE_ENCODING");
      }
    };
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new RetailFetchError("TIMEOUT"));
          }, timeout);
        }),
      ]);
    } catch (error) {
      controller.abort();
      if (error instanceof RetailFetchError) throw error;
      throw new RetailFetchError(
        controller.signal.aborted &&
        error instanceof Error &&
        ["AbortError", "TimeoutError"].includes(error.name)
          ? "TIMEOUT"
          : "UPSTREAM_UNAVAILABLE"
      );
    } finally {
      clearTimeout(timer);
      if (reader) void reader.cancel().catch(() => {});
      controller.abort();
    }
  }

  async function read(value: string): Promise<NaverHtmlPage> {
    let url: URL;
    try {
      url = validateNaverTargetUrl(value);
    } catch {
      throw new RetailFetchError("NAVER_TARGET_NOT_SUPPORTED", "UNSUPPORTED");
    }
    approved(url.href); // No robots/API/HTML request without explicit rights.
    const prior = robots.get(url.origin);
    if (prior && clock().getTime() - prior.checkedAt >= 300000)
      robots.delete(url.origin);
    if (!robots.has(url.origin)) {
      robots.set(url.origin, null);
      const body = await request(`${url.origin}/robots.txt`, url.href, true);
      // Cache the body, not an allow decision for one path. Each URL has its own
      // path rules; a later listing must never inherit another path's permission.
      robots.set(url.origin, { body, checkedAt: clock().getTime() });
    }
    if (
      !robots.get(url.origin) ||
      !naverRobotsAllows(robots.get(url.origin)?.body ?? "", url.pathname)
    )
      throw new RetailFetchError("ROBOTS_NOT_ALLOWED", "NOT_APPROVED");
    const html = await request(url.href, url.href, false);
    return { url: url.href, html, observedAt: clock().toISOString() };
  }
  return {
    collect(url: string): Promise<NaverHtmlPage> {
      const task = queue.then(() => read(url));
      queue = task.catch(() => {});
      return task;
    },
  };
}
