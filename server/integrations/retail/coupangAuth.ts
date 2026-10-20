import { createHmac } from "node:crypto";
import { missingRetailApiCredentials } from "./retailApiConfig.js";
import { RetailApiError } from "./retailApiError.js";

// Offline signing primitive only, based on Coupang's HMAC guide. This does not
// authorize marketplace search, bypass IP checks or make an HTTP request.
export function createCoupangAuthorization(
  request: {
    method: "GET" | "POST";
    path: string;
    query: string;
  },
  env = process.env,
  now = new Date()
): string {
  if (missingRetailApiCredentials("COUPANG", env).length)
    throw new RetailApiError("MISSING_CREDENTIALS");
  const accessKey = env.RETAIL_COUPANG_ACCESS_KEY!;
  if (
    !/^[^\s,]+$/.test(accessKey) ||
    !request.path.startsWith("/") ||
    /[?#\r\n]/.test(request.path) ||
    request.query.startsWith("?") ||
    /[\r\n]/.test(request.query) ||
    !Number.isFinite(now.getTime())
  )
    throw new RetailApiError("INVALID_AUTH_CONFIGURATION");
  const signedDate = now.toISOString().slice(2, 19).replace(/[-:]/g, "") + "Z";
  const signature = createHmac("sha256", env.RETAIL_COUPANG_SECRET_KEY!)
    .update(signedDate + request.method + request.path + request.query)
    .digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${signedDate}, signature=${signature}`;
}
