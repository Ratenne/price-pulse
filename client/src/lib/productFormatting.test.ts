import { describe, expect, it } from "vitest";
import { getProductById } from "@/services/productService";
import {
  formatPrice,
  formatRate,
  getBuyerPerspective,
  getNearLowestMessage,
  getSellerPerspective,
} from "./productFormatting";

describe("productFormatting", () => {
  it("formats Korean won and percentage values", () => {
    expect(formatPrice(1234567)).toBe("1,234,567원");
    expect(formatRate(12.345)).toBe("12.3%");
  });

  it("creates buyer and seller explanations from product data", () => {
    const product = getProductById("cpu-ultra-5-245k");
    expect(product).toBeDefined();

    expect(getBuyerPerspective(product!).length).toBeGreaterThan(0);
    expect(getSellerPerspective(product!)).toHaveLength(3);
  });

  it("shows a near-low message only inside the configured threshold", () => {
    const nearLow = getProductById("gpu-rtx-5070");
    const expensive = getProductById("gpu-rtx-5090");
    expect(nearLow).toBeDefined();
    expect(expensive).toBeDefined();

    expect(getNearLowestMessage(nearLow!)).not.toBeNull();
    expect(getNearLowestMessage(expensive!)).toBeNull();
  });
});
