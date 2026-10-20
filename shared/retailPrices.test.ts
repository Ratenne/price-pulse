import { describe, expect, it } from "vitest";
import { retailComparisonPrice } from "./retailPrices";
describe("comparison price PRODUCT policy", () => {
  it.each([
    [null, 99000],
    [0, 100000],
    [3000, 103000],
  ] as const)("uses a %s fee correctly", (shippingFee, expected) => {
    expect(
      retailComparisonPrice({
        itemPrice: 100000,
        shippingFee,
        displayedPrice: 99000,
      })
    ).toBe(expected);
  });
  it("never converts an unknown fee into free shipping or invents displayed evidence", () => {
    expect(
      retailComparisonPrice({ itemPrice: 100000, shippingFee: null })
    ).toBeNull();
    expect(
      retailComparisonPrice({
        itemPrice: 100000,
        shippingFee: null,
        displayedPrice: 0,
      })
    ).toBeNull();
    expect(
      retailComparisonPrice({ itemPrice: 100000, shippingFee: -1 })
    ).toBeNull();
    expect(
      retailComparisonPrice({ itemPrice: 0.5, shippingFee: 0.5 })
    ).toBeNull();
    expect(
      retailComparisonPrice({ itemPrice: 2_000_000_000, shippingFee: 1 })
    ).toBeNull();
  });
});
