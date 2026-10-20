import { z } from "zod";
import policies from "../../../config/retail-source-policies.json";
import type { Retailer } from "../../../shared/retailPrices.js";
import { validateNaverTargetUrl } from "./naverTarget.js";

export type RetailCollectionMethod = "API" | "IMPORT" | "CRAWL";
export type RetailSkipStatus =
  | "NOT_CONFIGURED"
  | "NOT_APPROVED"
  | "UNSUPPORTED";
export const retailEnabledEnvNames: Record<Retailer, string> = {
  "11ST": "RETAIL_11ST_ENABLED",
  COUPANG: "RETAIL_COUPANG_ENABLED",
  GMARKET: "RETAIL_GMARKET_ENABLED",
  AUCTION: "RETAIL_AUCTION_ENABLED",
  NAVER: "RETAIL_NAVER_ENABLED",
};
// Reviewed policy metadata only; credentials stay in the server environment.
const approvedPolicy = z.object({
  approvalStatus: z.literal("approved"),
  methods: z.array(z.enum(["API", "IMPORT", "CRAWL"])).min(1),
  apiAvailable: z.boolean().optional(),
  accessGranted: z.literal(true),
  thirdPartyProductsAllowed: z.literal(true),
  storageAllowed: z.literal(true),
  historyAnalysisAllowed: z.literal(true),
  redisplayAllowed: z.literal(true),
  usageLimitsVerified: z.literal(true),
  termsUrl: z.string().url(),
  evidence: z.string().trim().min(1),
  approvedBy: z.string().trim().min(1),
  verifiedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  maxRequestsPerRun: z.number().int().positive().max(500),
  minDelayMs: z.number().int().min(1500),
  requiresFixedIp: z.boolean(),
  credentialEnvNames: z.array(z.string().regex(/^RETAIL_[A-Z0-9_]+$/)),
  // Explicit source permission for reviewed offline Discovery artifacts. This
  // is separate from HTML crawl approval and does not enable BFF HTTP access.
  discovery: z
    .object({
      dataSources: z.array(z.string().url()).min(1).max(10),
      accessGranted: z.literal(true),
      evidence: z.string().trim().min(1),
    })
    .strict()
    .optional(),
  crawl: z
    .object({
      allowedUrls: z.array(z.string().url()).min(1).max(500),
      automaticAccessAllowed: z.literal(true),
      robotsVerified: z.literal(true),
      parserVerified: z.literal(true),
      databaseVerified: z.literal(true),
      environmentVerified: z.literal(true),
      evidence: z.string().trim().min(1),
    })
    .strict()
    .optional(),
});
export type RetailPolicy = z.infer<typeof approvedPolicy>;
export type RetailPolicies = Partial<Record<Retailer, unknown>>;
export const retailPolicies: RetailPolicies = policies;

export function checkRetailPolicy(
  source: Retailer,
  method: RetailCollectionMethod,
  options: {
    policies?: RetailPolicies;
    env?: NodeJS.ProcessEnv;
    now?: Date;
    url?: string;
  } = {}
): { allowed: true; policy: RetailPolicy } | { allowed: false; code: string } {
  const parsed = approvedPolicy.safeParse(
    (options.policies ?? retailPolicies)[source]
  );
  if (!parsed.success) return { allowed: false, code: "SOURCE_NOT_APPROVED" };
  const policy = parsed.data;
  const now = (options.now ?? new Date()).getTime();
  if (
    !policy.methods.includes(method) ||
    Date.parse(policy.verifiedAt) > now ||
    Date.parse(policy.expiresAt) <= now
  )
    return { allowed: false, code: "SOURCE_NOT_APPROVED" };
  // No verified fixed-IP execution path currently exists, including Actions.
  if (policy.requiresFixedIp)
    return { allowed: false, code: "FIXED_IP_REQUIRED" };
  if (method === "CRAWL") {
    // No other retailer's historical HTML path is re-enabled by this method.
    if (source !== "NAVER" || !policy.crawl)
      return { allowed: false, code: "CRAWL_NOT_APPROVED" };
    try {
      const url = validateNaverTargetUrl(options.url ?? "");
      if (!policy.crawl.allowedUrls.includes(url.href))
        return { allowed: false, code: "CRAWL_TARGET_NOT_APPROVED" };
    } catch {
      return { allowed: false, code: "CRAWL_TARGET_NOT_APPROVED" };
    }
  }
  if (method === "API" && policy.apiAvailable !== true)
    return { allowed: false, code: "API_NOT_VERIFIED" };
  const env = options.env ?? process.env;
  if (
    method === "API" &&
    (!policy.credentialEnvNames.length ||
      policy.credentialEnvNames.some(name => !env[name]?.trim()))
  )
    return { allowed: false, code: "MISSING_API_CREDENTIALS" };
  return { allowed: true, policy };
}

// One execution gate for scheduled/manual batches, adapters and approved imports.
// Enablement is operational configuration, never evidence of contractual approval.
export function checkRetailExecution(
  source: Retailer,
  options: {
    method: RetailCollectionMethod;
    adapterConfigured: boolean;
    policies?: RetailPolicies;
    env?: NodeJS.ProcessEnv;
    now?: Date;
    url?: string;
  }
):
  | { allowed: true; policy: RetailPolicy }
  | { allowed: false; code: string; status: RetailSkipStatus } {
  const env = options.env ?? process.env;
  if (env[retailEnabledEnvNames[source]] !== "true")
    return {
      allowed: false,
      code: "COLLECTION_DISABLED",
      status: "NOT_CONFIGURED",
    };
  const access = checkRetailPolicy(source, options.method, options);
  if (!access.allowed) {
    const status: RetailSkipStatus =
      access.code === "MISSING_API_CREDENTIALS"
        ? "NOT_CONFIGURED"
        : access.code === "API_NOT_VERIFIED"
          ? "UNSUPPORTED"
          : "NOT_APPROVED";
    return { ...access, status };
  }
  if (!options.adapterConfigured)
    return {
      allowed: false,
      code:
        options.method === "CRAWL"
          ? "NAVER_PRODUCT_HTML_UNVERIFIED"
          : "API_ADAPTER_NOT_CONFIGURED",
      status: "UNSUPPORTED",
    };
  return access;
}
