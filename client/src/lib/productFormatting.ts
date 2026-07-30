import type { PriceStatus, Product } from "@/domain/product";

export const PRICE_STATUS_LABELS: Record<PriceStatus, string> = {
  VERY_LOW: "최저가 근접",
  LOW: "낮은 가격대",
  FAIR: "적정 가격대",
  HIGH: "높은 가격대",
  VERY_HIGH: "최고가 근접",
};

export function formatPrice(price: number): string {
  return `${Math.round(price).toLocaleString("ko-KR")}원`;
}

export function formatRate(rate: number): string {
  return `${rate.toFixed(1)}%`;
}

export function getNearLowestMessage(product: Product): string | null {
  if (product.currentPrice > product.sixMonthLowPrice * 1.1) return null;
  if (product.recentTrend === "RISING") {
    return "최저가 구간이지만 최근 가격이 오르고 있어요";
  }
  return "과거 최저 가격과 가까운 구간입니다";
}

export function getBuyerPerspective(product: Product): string[] {
  const messages = [
    product.currentPositionRate <= 30
      ? "현재 가격은 최근 가격 범위의 낮은 구간에 있습니다."
      : product.currentPositionRate <= 65
        ? "현재 가격은 최근 가격 범위의 중간 구간에 있습니다."
        : "현재 가격은 최근 가격 범위의 높은 구간에 있습니다.",
  ];

  if (product.lowestPriceDifferenceRate <= 10) {
    messages.push("과거 최저가와 비교해 차이가 크지 않습니다.");
  }
  if (product.recentTrend === "RISING") {
    messages.push("최근 가격이 오르고 있으므로 구매 전 변동을 확인하세요.");
  }
  return messages;
}

export function getSellerPerspective(product: Product): string[] {
  return [
    product.currentPrice >= product.fairPriceMin &&
    product.currentPrice <= product.fairPriceMax
      ? "현재 시장 가격은 적정 가격 구간에 있습니다."
      : "현재 가격과 적정 거래 범위의 차이를 확인해 보세요.",
    "빠른 판매를 원한다면 적정 범위의 하단을 참고하세요.",
    "시장 평균보다 높은 가격에서는 거래 기간이 길어질 수 있습니다.",
  ];
}
