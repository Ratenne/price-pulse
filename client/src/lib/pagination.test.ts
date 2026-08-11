import { describe, expect, it } from "vitest";
import {
  calculatePagination,
  getNextPage,
  getPageNumbers,
  getPaginatedItems,
  getPreviousPage,
  isValidPage,
} from "./pagination";

describe("pagination", () => {
  it("calculates pages and clamps an oversized current page", () => {
    expect(calculatePagination(28, 10, 99)).toEqual({
      currentPage: 3,
      totalPages: 3,
      itemsPerPage: 10,
      totalItems: 28,
    });
  });

  it("returns only the requested page items", () => {
    const items = Array.from({ length: 23 }, (_, index) => index + 1);
    expect(getPaginatedItems(items, 3, 10)).toEqual([21, 22, 23]);
  });

  it("creates a bounded page number list with ellipses", () => {
    expect(getPageNumbers(5, 10, 5)).toEqual([1, "...", 3, 4, 5, 6, 7, "...", 10]);
  });

  it("handles previous, next and validation boundaries", () => {
    expect(getPreviousPage(1)).toBeNull();
    expect(getPreviousPage(3)).toBe(2);
    expect(getNextPage(3, 3)).toBeNull();
    expect(getNextPage(2, 3)).toBe(3);
    expect(isValidPage(1, 3)).toBe(true);
    expect(isValidPage(4, 3)).toBe(false);
  });
});
