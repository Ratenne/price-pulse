import { createHmac } from "node:crypto";
import { missingRetailApiCredentials } from "./retailApiConfig.js";
import { RetailApiError } from "./retailApiError.js";

// Offline JWT primitive from ESM's API guide; G/A seller identities stay separate.
// No auth endpoint, account scope, expiry rule or data reuse grant is invented.
export function createEsmAuthorization(
  source: "GMARKET" | "AUCTION",
  env = process.env,
  now = new Date()
): string {
  if (missingRetailApiCredentials(source, env).length)
    throw new RetailApiError("MISSING_CREDENTIALS");
  const seller =
    env[
      source === "GMARKET"
        ? "RETAIL_GMARKET_SELLER_ID"
        : "RETAIL_AUCTION_SELLER_ID"
    ]!;
  if (!/^[^,:\s]+$/.test(seller) || !Number.isFinite(now.getTime()))
    throw new RetailApiError("INVALID_AUTH_CONFIGURATION");
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({
    alg: "HS256",
    typ: "JWT",
    kid: env.RETAIL_ESM_MASTER_ID,
  });
  const payload = encode({
    iss: env.RETAIL_ESM_ISSUER,
    sub: "sell",
    aud: "sa.esmplus.com",
    iat: Math.floor(now.getTime() / 1000),
    ssi: `${source === "GMARKET" ? "G" : "A"}:${seller}`,
  });
  const signature = createHmac("sha256", env.RETAIL_ESM_SECRET_KEY!)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `Bearer ${header}.${payload}.${signature}`;
}
