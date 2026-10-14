import { describe, expect, it } from "vitest";
import { completedPriceWindow } from "./priceCalendar";
describe("Korea price month window", () => {
  it("rolls over at Korean midnight and handles year boundaries", () => {
    expect(completedPriceWindow(new Date("2026-12-31T15:00:00Z"))).toEqual({
      currentMonth: "2027-01",
      fromMonth: "2026-07",
    });
    expect(completedPriceWindow(new Date("2026-10-31T14:59:59Z"))).toEqual({
      currentMonth: "2026-10",
      fromMonth: "2026-04",
    });
  });
});
