import {
  RETAIL_API_SOURCES,
  isRetailApiSource,
} from "../integrations/retail/retailApiConfig.js";
import { retailApiReadiness } from "../integrations/retail/retailApiSupport.js";
import { PgRetailProductRepository } from "../repositories/retailProductRepository.js";
import { upsertRetailProducts } from "../services/retailProductUpsert.js";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { getDatabasePool, closeDatabasePool } from "../config/database.js";
import { PgRetailPriceRepository } from "../repositories/retailPriceRepository.js";
import {
  linkSchema,
  collectionSchema,
  collectionObservation,
  type RetailLink,
} from "../integrations/retail/retailPrice.js";
import {
  fetchRetailOffer,
  RetailFetchError,
} from "../integrations/retail/retailClient.js";
import { consoleLogger as logger } from "../logging/logger.js";
import { checkRetailExecution } from "../integrations/retail/retailPolicy.js";

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
    productFile: string | undefined,
    apiStatus = false,
    probe = false,
    list = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--links" && args[i + 1]) file = args[++i];
    else if (args[i] === "--import" && args[i + 1]) importFile = args[++i];
    else if (args[i] === "--products" && args[i + 1]) productFile = args[++i];
    else if (args[i] === "--api-status") apiStatus = true;
    else if (args[i] === "--probe") probe = true;
    else if (args[i] === "--list") list = true;
    else
      throw new Error(
        "Usage: refreshRetailPrices [--links FILE] [--probe | --list | --api-status | --import FILE | --products FILE]"
      );
  }
  if (
    [probe, list, apiStatus, !!importFile, !!productFile].filter(Boolean)
      .length > 1
  )
    throw new Error("Conflicting modes");
  if (apiStatus) {
    for (const source of RETAIL_API_SOURCES)
      logger.info("Retail API readiness", { ...retailApiReadiness(source) });
    logger.info("Retail API collection unavailable", {
      targeted: RETAIL_API_SOURCES.length,
      succeeded: 0,
      skipped: RETAIL_API_SOURCES.length,
    });
    process.exitCode = 2;
    return;
  }
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
      const link: RetailLink = { ...links[i], id: i + 1, version: 1 };
      try {
        const offer = await fetchRetailOffer(link);
        succeeded++;
        logger.info("Retail probe succeeded (no DB writes)", {
          source: link.source,
          itemPrice: offer.itemPrice,
          shippingFee: offer.shippingFee,
          total: offer.itemPrice + offer.shippingFee,
        });
      } catch (error) {
        logger.warn("Retail probe failed (no DB writes)", {
          source: link.source,
          status: "UNSUPPORTED",
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
  if (productFile) {
    const inputs = z
      .array(z.unknown())
      .min(1)
      .max(1000)
      .parse(await jsonFile(productFile));
    // Lazy DB access: disabled/unapproved inputs never open a pool.
    const repository = {
      upsert: (...args: Parameters<PgRetailProductRepository["upsert"]>) =>
        new PgRetailProductRepository(getDatabasePool()).upsert(...args),
    };
    const summary = await upsertRetailProducts(repository, logger, inputs);
    if (summary.failed || summary.held || summary.skipped) process.exitCode = 2;
    return;
  }
  if (list) {
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT id,product_id,source,url,enabled,last_attempt_at,last_error FROM retail_product_links ORDER BY id`
    );
    process.stdout.write(JSON.stringify(result.rows, null, 2) + "\n");
    return;
  }
  if (importFile) {
    const inputs = z
      .array(collectionSchema)
      .min(1)
      .max(1000)
      .parse(await jsonFile(importFile));
    const validated = [];
    for (const input of inputs) {
      const access = checkRetailExecution(input.source, {
        method: "IMPORT",
        adapterConfigured: true,
      });
      if (!access.allowed)
        throw new RetailFetchError(access.code, access.status);
      if (input.method !== "IMPORT")
        throw new RetailFetchError("INVALID_COLLECTION_METHOD");
      if (!input.listingId) throw new Error("MISSING_LISTING_ID");
    }
    const repository = new PgRetailPriceRepository(getDatabasePool());
    for (const input of inputs) {
      const link = await repository.find(input.listingId!);
      if (!link) throw new Error("UNKNOWN_OR_DISABLED_LISTING");
      validated.push({ link, offer: collectionObservation(link, input) });
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
  // Keep the manual batch entry point, but no adapter is wired until approval
  // and implementation are reviewed. Future adapters use refreshRetailPrices.
  const skipStatuses = { NOT_CONFIGURED: 0, NOT_APPROVED: 0, UNSUPPORTED: 0 };
  for (const seed of seeds) {
    const access = isRetailApiSource(seed.source)
      ? retailApiReadiness(seed.source)
      : checkRetailExecution(seed.source, {
          method: "API",
          adapterConfigured: false,
        });
    if (access.allowed) throw new Error("UNEXPECTED_RUNNABLE_SOURCE");
    skipStatuses[access.status]++;
    logger.warn("Retail collection skipped", {
      source: seed.source,
      code: access.code,
      status: access.status,
    });
  }
  logger.info("Retail price refresh disabled", {
    targeted: seeds.length,
    succeeded: 0,
    updated: 0,
    failed: 0,
    skipped: seeds.length,
    skipStatuses,
  });
  process.exitCode = 2;
}
main()
  .catch(error => {
    logger.error("Retail price batch failed", {
      exceptionType: error instanceof Error ? error.name : typeof error,
      ...(error instanceof RetailFetchError
        ? { code: error.code, status: error.status }
        : {}),
    });
    process.exitCode = 1;
  })
  .finally(closeDatabasePool);
