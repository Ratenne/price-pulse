export const PRODUCT_CATEGORIES = {
  GPU: {
    id: "GPU",
    label: "그래픽카드",
    description: "GPU 가격 변동과 현재 가격 수준",
    detail:
      "신제품 출시와 수요 변화에 따라 가격 변동이 큰 그래픽카드의 흐름을 확인합니다.",
    imageUrl: "/images/categories/gpu.svg",
  },
  CPU: {
    id: "CPU",
    label: "CPU",
    description: "CPU 시장 가격과 구매 시점",
    detail: "세대 교체와 판매 시점에 따라 달라지는 CPU 가격을 비교합니다.",
    imageUrl: "/images/categories/cpu.svg",
  },
  LAPTOP: {
    id: "LAPTOP",
    label: "노트북",
    description: "용도별 노트북 가격 흐름",
    detail: "용도와 사양이 다양한 노트북의 현재 가격 수준을 확인합니다.",
    imageUrl: "/images/categories/laptop.svg",
  },
} as const;

export type ProductCategory = keyof typeof PRODUCT_CATEGORIES;

export const VISIBLE_PRODUCT_CATEGORIES: ProductCategory[] = [
  "GPU",
  "CPU",
  "LAPTOP",
];

export const FUTURE_PRODUCT_CATEGORIES = [
  "MEMORY",
  "MOTHERBOARD",
  "SSD",
  "MONITOR",
  "CONSOLE",
  "APPLIANCE",
] as const;

export function isProductCategory(
  value: string | null
): value is ProductCategory {
  return value !== null && value in PRODUCT_CATEGORIES;
}

export function getCategoryLabel(category: ProductCategory): string {
  return PRODUCT_CATEGORIES[category].label;
}
