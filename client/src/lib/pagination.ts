/**
 * Pagination Utilities
 * Handle paginated data display
 */

export interface PaginationState {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalItems: number;
}

/**
 * Calculate pagination state
 */
export function calculatePagination(
  totalItems: number,
  itemsPerPage: number = 10,
  currentPage: number = 1
): PaginationState {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const validPage = Math.max(1, Math.min(currentPage, totalPages));

  return {
    currentPage: validPage,
    totalPages,
    itemsPerPage,
    totalItems,
  };
}

/**
 * Get items for current page
 */
export function getPaginatedItems<T>(
  items: T[],
  currentPage: number,
  itemsPerPage: number = 10
): T[] {
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  return items.slice(startIndex, endIndex);
}

/**
 * Generate page numbers to display
 * Shows current page and adjacent pages, with ellipsis if needed
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 5
): (number | string)[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | string)[] = [];
  const halfVisible = Math.floor(maxVisible / 2);

  let startPage = Math.max(1, currentPage - halfVisible);
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  if (startPage > 1) {
    pages.push(1);
    if (startPage > 2) {
      pages.push("...");
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      pages.push("...");
    }
    pages.push(totalPages);
  }

  return pages;
}

/**
 * Check if page number is valid
 */
export function isValidPage(page: number, totalPages: number): boolean {
  return page >= 1 && page <= totalPages;
}

/**
 * Get next page number
 */
export function getNextPage(
  currentPage: number,
  totalPages: number
): number | null {
  return currentPage < totalPages ? currentPage + 1 : null;
}

/**
 * Get previous page number
 */
export function getPreviousPage(currentPage: number): number | null {
  return currentPage > 1 ? currentPage - 1 : null;
}
