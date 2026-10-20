import type { PriceStatus, Product } from "@/domain/product";
import { hasPriceAnalysis } from "@shared/priceAnalysis";

export const PRICE_STATUS_LABELS: Record<PriceStatus, string> = {
  VERY_LOW: "최저가 근접",
  LOW: "낮은 가격대",
  FAIR: "적정 가격대",
  HIGH: "높은 가격대",
  VERY_HIGH: "최고가 근접",
  UNKNOWN: "현재가 조회 불가",
  LOADING: "현재가 확인 중",
  INSUFFICIENT_DATA: "데이터 부족",
};

export function formatPrice(price: number | null): string {
  if (price === null) return "조회 불가";
  return `${Math.round(price).toLocaleString("ko-KR")}원`;
}
export function formatCurrentPrice(product: Product): string {
  return product.priceStatus === "LOADING"
    ? "확인 중"
    : formatPrice(product.currentPrice);
}
export function formatCurrentPriceBasis(product: Product): string {
  if (!product.currentPriceSource || product.currentPriceSource === "DANAWA")
    return "현재 참고가";
  const offer = product.offers?.find(
    v =>
      v.source === product.currentPriceSource &&
      (!product.currentPriceUrl || v.url === product.currentPriceUrl)
  );
  const known =
    product.currentPriceShippingFeeKnown ??
    offer?.shippingFeeKnown ??
    (offer !== undefined && offer.shippingFee !== null);
  return known
    ? "배송비 포함 확정 비교가격"
    : "표시가격 기준 비교가격 · 배송비 미확인";
}

export function formatRate(rate: number | null): string {
  if (rate === null) return "데이터 부족";
  return `${rate.toFixed(1)}%`;
}

export function getNearLowestMessage(product: Product): string | null {
  if (!hasPriceAnalysis(product)) return null;
  if (product.currentPrice === null) return null;
  if (product.currentPrice > product.sixMonthLowPrice * 1.1) return null;
  if (product.recentTrend === "RISING") {
    return "최저가 구간이지만 최근 가격이 오르고 있어요";
  }
  return "과거 최저 가격과 가까운 구간입니다";
}

export function getBuyerPerspective(product: Product): string[] {
  if (!hasPriceAnalysis(product)) return ["데이터 부족"];
  if (product.priceStatus === "LOADING")
    return [
      "현재 판매 가격을 확인 중입니다. 과거 가격 기록을 먼저 확인할 수 있습니다.",
    ];
  if (product.currentPrice === null)
    return [
      "현재 판매 가격을 확인할 수 없습니다. 다나와 원본에서 판매 상태를 확인하세요.",
    ];
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
  if (!hasPriceAnalysis(product)) return ["데이터 부족"];
  if (product.priceStatus === "LOADING")
    return ["현재 판매 가격을 확인 중입니다."];
  if (product.currentPrice === null)
    return [
      "현재 판매 가격을 확인할 수 없습니다. 과거 월별 가격은 참고용입니다.",
    ];
  return [
    product.currentPrice >= product.fairPriceMin &&
    product.currentPrice <= product.fairPriceMax
      ? "현재 시장 가격은 적정 가격 구간에 있습니다."
      : "현재 가격과 적정 거래 범위의 차이를 확인해 보세요.",
    "빠른 판매를 원한다면 적정 범위의 하단을 참고하세요.",
    "시장 평균보다 높은 가격에서는 거래 기간이 길어질 수 있습니다.",
  ];
}
