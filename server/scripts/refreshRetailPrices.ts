import { readFile } from "node:fs/promises";
import { z } from "zod";
import { getDatabasePool, closeDatabasePool } from "../config/database.js";
import { PgRetailPriceRepository } from "../repositories/retailPriceRepository.js";
import {
  linkSchema,
  observationSchema,
  validateObservation,
  type RetailLink,
} from "../integrations/retail/retailPrice.js";
import {
  fetchRetailOffer,
  RetailFetchError,
} from "../integrations/retail/retailClient.js";
import { refreshRetailPrices } from "../services/retailPriceRefresh.js";
import { consoleLogger as logger } from "../logging/logger.js";
import { setTimeout as delay } from "node:timers/promises";

async function jsonFile(path: string | URL): Promise<unknown> {
  const content = await readFile(path, "utf8");
  if (Buffer.byteLength(content) > 5_000_000)
    throw new Error("INPUT_TOO_LARGE");
  return JSON.parse(content.replace(/^\uFEFF/, ""));
}
async function main() {
  const args = process.argv.slice(2);
  let file: string | undefined,
    importFile: string | undefined,
    probe = false,
    list = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--links" && args[i + 1]) file = args[++i];
    else if (args[i] === "--import" && args[i + 1]) importFile = args[++i];
    else if (args[i] === "--probe") probe = true;
    else if (args[i] === "--list") list = true;
    else
      throw new Error(
        "Usage: refreshRetailPrices [--links FILE] [--probe | --list | --import FILE]"
      );
  }
  if ([probe, list, !!importFile].filter(Boolean).length > 1)
    throw new Error("Conflicting modes");
  if (probe) {
    const links = z
      .array(linkSchema)
      .max(100)
      .parse(
        await jsonFile(
          file ?? new URL("../../config/retail-links.json", import.meta.url)
        )
      );
    let succeeded = 0;
    for (let i = 0; i < links.length; i++) {
      if (i) await delay(1500);
      const link: RetailLink = { ...links[i], id: i + 1, version: 1 };
      try {
        const offer = await fetchRetailOffer(link);
        succeeded++;
        logger.info("Retail probe succeeded (no DB writes)", {
          source: link.source,
          url: link.url,
          itemPrice: offer.itemPrice,
          shippingFee: offer.shippingFee,
          total: offer.itemPrice + offer.shippingFee,
        });
      } catch (error) {
        logger.warn("Retail probe failed (no DB writes)", {
          source: link.source,
          url: link.url,
          code:
            error instanceof RetailFetchError
              ? error.code
              : "INVALID_OR_UNAVAILABLE_RESPONSE",
        });
      }
    }
    logger.info("Retail probe finished", {
      targeted: links.length,
      succeeded,
      failed: links.length - succeeded,
    });
    if (succeeded !== links.length) process.exitCode = 2;
    return;
  }
  const pool = getDatabasePool();
  const repository = new PgRetailPriceRepository(pool);
  if (list) {
    const result = await pool.query(
      `SELECT id,product_id,source,url,enabled,last_attempt_at,last_error FROM retail_product_links ORDER BY id`
    );
    process.stdout.write(JSON.stringify(result.rows, null, 2) + "\n");
    return;
  }
  if (importFile) {
    const inputs = z
      .array(observationSchema)
      .min(1)
      .max(1000)
      .parse(await jsonFile(importFile));
    const now = new Date();
    const validated = [];
    for (const input of inputs) {
      const link = await repository.find(input.listingId);
      if (!link) throw new Error("UNKNOWN_OR_DISABLED_LISTING");
      validated.push({ link, offer: validateObservation(link, input, now) });
    }
    let updated = 0;
    for (const { link, offer } of validated)
      if (await repository.save(link, offer, "IMPORT")) updated++;
    logger.info("Reviewed retail observations imported", {
      received: inputs.length,
      updated,
    });
    return;
  }
  const seeds = z
    .array(linkSchema)
    .max(5000)
    .parse(
      await jsonFile(
        file ?? new URL("../../config/retail-links.json", import.meta.url)
      )
    );
  let missing = 0;
  const resolved = [];
  // Resolve against the canonical Danawa mapping, including installations with custom product IDs.
  for (const seed of seeds) {
    const found = await pool.query<{ id: string }>(
      `SELECT p.id FROM products p JOIN product_source_mappings m ON m.product_id=p.id AND m.source='DANAWA'
       WHERE p.name=$1 AND (p.id=$2 OR m.external_product_id=$3)`,
      [seed.productName, seed.productId, seed.productId.replace(/^danawa-/, "")]
    );
    if (found.rows.length !== 1) {
      missing++;
      logger.warn("Retail seed has no exact catalog match", {
        productId: seed.productId,
        source: seed.source,
      });
      continue;
    }
    resolved.push({ ...seed, productId: found.rows[0].id });
  }
  await repository.register(resolved);
  const limit = Number(process.env.RETAIL_BATCH_LIMIT ?? 100);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
    throw new Error("Invalid RETAIL_BATCH_LIMIT");
  const summary = await refreshRetailPrices(repository, logger, { limit });
  if (summary.failed || summary.skipped || missing) process.exitCode = 2;
  else if (!summary.targeted) {
    logger.warn("No retail links are due; no prices collected");
  }
}
main()
  .catch(error => {
    logger.error("Retail price batch failed", {
      exceptionType: error instanceof Error ? error.name : typeof error,
    });
    process.exitCode = 1;
  })
  .finally(closeDatabasePool);
