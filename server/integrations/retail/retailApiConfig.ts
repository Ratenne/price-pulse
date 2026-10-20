export const RETAIL_API_SOURCES = [
  "11ST",
  "COUPANG",
  "GMARKET",
  "AUCTION",
] as const;
export type RetailApiSource = (typeof RETAIL_API_SOURCES)[number];
export const retailApiCredentialEnvNames: Record<
  RetailApiSource,
  readonly string[]
> = {
  "11ST": ["RETAIL_11ST_API_KEY"],
  COUPANG: [
    "RETAIL_COUPANG_ACCESS_KEY",
    "RETAIL_COUPANG_SECRET_KEY",
    "RETAIL_COUPANG_VENDOR_ID",
  ],
  GMARKET: [
    "RETAIL_ESM_MASTER_ID",
    "RETAIL_ESM_SECRET_KEY",
    "RETAIL_ESM_ISSUER",
    "RETAIL_GMARKET_SELLER_ID",
  ],
  AUCTION: [
    "RETAIL_ESM_MASTER_ID",
    "RETAIL_ESM_SECRET_KEY",
    "RETAIL_ESM_ISSUER",
    "RETAIL_AUCTION_SELLER_ID",
  ],
};
export function isRetailApiSource(value: string): value is RetailApiSource {
  return (RETAIL_API_SOURCES as readonly string[]).includes(value);
}
// Readiness exposes names only. Never return credential values to logs or clients.
export function missingRetailApiCredentials(
  source: RetailApiSource,
  env = process.env
): string[] {
  return retailApiCredentialEnvNames[source].filter(name => !env[name]?.trim());
}
