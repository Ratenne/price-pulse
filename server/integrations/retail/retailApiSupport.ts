import {
  checkRetailExecution,
  type RetailPolicies,
  type RetailSkipStatus,
} from "./retailPolicy.js";
import { RetailFetchError } from "./retailClient.js";
import {
  missingRetailApiCredentials,
  type RetailApiSource,
} from "./retailApiConfig.js";

// Contract review, not a registry of implemented collectors. No runtime API
// endpoints or raw-response field mappings are inferred from seller-only docs.
export const retailApiSupport = {
  "11ST": {
    adapterImplemented: false,
    code: "PRODUCT_SEARCH_CONTRACT_UNVERIFIED",
    documentation: "https://openapi.11st.co.kr/openapi/OpenApiGuide.tmall",
    scope: "LEGACY_MARKETPLACE_SEARCH_DOCUMENTED",
  },
  COUPANG: {
    adapterImplemented: false,
    code: "SELLER_API_SCOPE_INSUFFICIENT",
    documentation:
      "https://developers.coupang.com/ko/api/products/product-list-paging-query?market=KR",
    scope: "SELLER_ACCOUNT",
  },
  GMARKET: {
    adapterImplemented: false,
    code: "ESM_SCOPE_AND_REUSE_UNVERIFIED",
    documentation: "https://etapi.gmarket.com/160",
    scope: "ESM_AUTHORIZED_SELLER_ACCOUNT",
  },
  AUCTION: {
    adapterImplemented: false,
    code: "ESM_SCOPE_AND_REUSE_UNVERIFIED",
    documentation: "https://etapi.gmarket.com/160",
    scope: "ESM_AUTHORIZED_SELLER_ACCOUNT",
  },
} as const;
export interface RetailApiReadiness {
  allowed: false;
  source: RetailApiSource;
  status: RetailSkipStatus;
  code: string;
  adapterImplemented: false;
  missingCredentialEnvNames: string[];
  blocker: string;
}
export function retailApiReadiness(
  source: RetailApiSource,
  options: {
    policies?: RetailPolicies;
    env?: NodeJS.ProcessEnv;
    now?: Date;
  } = {}
): RetailApiReadiness {
  const contract = retailApiSupport[source];
  const missing = missingRetailApiCredentials(
    source,
    options.env ?? process.env
  );
  const access = checkRetailExecution(source, {
    ...options,
    method: "API",
    adapterConfigured: false,
  });
  const common = {
    allowed: false as const,
    source,
    adapterImplemented: false as const,
    missingCredentialEnvNames: missing,
    blocker: contract.code,
  };
  if (!access.allowed && access.status !== "UNSUPPORTED")
    return { ...common, status: access.status, code: access.code };
  if (missing.length)
    return {
      ...common,
      status: "NOT_CONFIGURED",
      code: "MISSING_API_CREDENTIALS",
    };
  return { ...common, status: "UNSUPPORTED", code: contract.code };
}
// Prevent both accidental calls and fake empty-list successes. Adding keys or
// changing approval JSON cannot turn an unimplemented collector into a runner.
export function requireRetailApiAdapter(
  source: RetailApiSource,
  options: Parameters<typeof retailApiReadiness>[1] = {}
): never {
  const readiness = retailApiReadiness(source, options);
  throw new RetailFetchError(readiness.code, readiness.status);
}
