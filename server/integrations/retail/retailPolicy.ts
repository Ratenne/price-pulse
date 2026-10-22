import { z } from "zod";
import policies from "../../../config/retail-source-policies.json";
import type { Retailer } from "../../../shared/retailPrices.js";

export type RetailCollectionMethod = "API" | "IMPORT";
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
  methods: z.array(z.enum(["API", "IMPORT"])).min(1),
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
      code: "API_ADAPTER_NOT_CONFIGURED",
      status: "UNSUPPORTED",
    };
  return access;
}
