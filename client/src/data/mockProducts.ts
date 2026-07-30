import { PRODUCT_CATEGORIES } from "@/domain/category";
import type {
  PriceHistoryPoint,
  PriceStatus,
  PriceTrend,
  Product,
  ProductSeed,
} from "@/domain/product";

const UPDATED_AT = "2026-07-31T09:00:00+09:00";

const PRODUCT_SEEDS: ProductSeed[] = [
  {
    id: "gpu-rtx-5090",
    category: "GPU",
    manufacturer: "NVIDIA",
    modelName: "GeForce RTX 5090",
    displayName: "GeForce RTX 5090 그래픽카드",
    currentPrice: 4250000,
    previousPrice: 4180000,
    lowPrice: 3200000,
    highPrice: 4550000,
    historyPattern: 1,
  },
  {
    id: "gpu-rtx-5080",
    category: "GPU",
    manufacturer: "NVIDIA",
    modelName: "GeForce RTX 5080",
    displayName: "GeForce RTX 5080 그래픽카드",
    currentPrice: 1890000,
    previousPrice: 1970000,
    lowPrice: 1750000,
    highPrice: 2600000,
    historyPattern: 2,
  },
  {
    id: "gpu-rtx-5070-ti",
    category: "GPU",
    manufacturer: "NVIDIA",
    modelName: "GeForce RTX 5070 Ti",
    displayName: "GeForce RTX 5070 Ti 그래픽카드",
    currentPrice: 1220000,
    previousPrice: 1190000,
    lowPrice: 1150000,
    highPrice: 1650000,
    historyPattern: 3,
  },
  {
    id: "gpu-rtx-5070",
    category: "GPU",
    manufacturer: "NVIDIA",
    modelName: "GeForce RTX 5070",
    displayName: "GeForce RTX 5070 그래픽카드",
    currentPrice: 820000,
    previousPrice: 800000,
    lowPrice: 780000,
    highPrice: 1120000,
    historyPattern: 4,
  },
  {
    id: "gpu-rtx-4070-super",
    category: "GPU",
    manufacturer: "NVIDIA",
    modelName: "GeForce RTX 4070 SUPER",
    displayName: "GeForce RTX 4070 SUPER 그래픽카드",
    currentPrice: 760000,
    previousPrice: 790000,
    lowPrice: 720000,
    highPrice: 1050000,
    historyPattern: 5,
  },
  {
    id: "gpu-rx-9070-xt",
    category: "GPU",
    manufacturer: "AMD",
    modelName: "Radeon RX 9070 XT",
    displayName: "Radeon RX 9070 XT 그래픽카드",
    currentPrice: 1080000,
    previousPrice: 1120000,
    lowPrice: 950000,
    highPrice: 1420000,
    historyPattern: 6,
  },
  {
    id: "gpu-rx-9070",
    category: "GPU",
    manufacturer: "AMD",
    modelName: "Radeon RX 9070",
    displayName: "Radeon RX 9070 그래픽카드",
    currentPrice: 890000,
    previousPrice: 900000,
    lowPrice: 780000,
    highPrice: 1120000,
    historyPattern: 7,
  },
  {
    id: "gpu-rx-7900-xtx",
    category: "GPU",
    manufacturer: "AMD",
    modelName: "Radeon RX 7900 XTX",
    displayName: "Radeon RX 7900 XTX 그래픽카드",
    currentPrice: 1480000,
    previousPrice: 1440000,
    lowPrice: 1150000,
    highPrice: 1650000,
    historyPattern: 8,
  },
  {
    id: "gpu-rx-7800-xt",
    category: "GPU",
    manufacturer: "AMD",
    modelName: "Radeon RX 7800 XT",
    displayName: "Radeon RX 7800 XT 그래픽카드",
    currentPrice: 650000,
    previousPrice: 640000,
    lowPrice: 620000,
    highPrice: 910000,
    historyPattern: 9,
  },
  {
    id: "gpu-arc-b580",
    category: "GPU",
    manufacturer: "Intel",
    modelName: "Arc B580",
    displayName: "Intel Arc B580 그래픽카드",
    currentPrice: 390000,
    previousPrice: 405000,
    lowPrice: 360000,
    highPrice: 550000,
    historyPattern: 10,
  },
  {
    id: "cpu-ryzen-9950x3d",
    category: "CPU",
    manufacturer: "AMD",
    modelName: "Ryzen 9 9950X3D",
    displayName: "Ryzen 9 9950X3D 프로세서",
    currentPrice: 1080000,
    previousPrice: 1110000,
    lowPrice: 890000,
    highPrice: 1250000,
    historyPattern: 11,
  },
  {
    id: "cpu-ryzen-9800x3d",
    category: "CPU",
    manufacturer: "AMD",
    modelName: "Ryzen 7 9800X3D",
    displayName: "Ryzen 7 9800X3D 게이밍 CPU",
    currentPrice: 625000,
    previousPrice: 610000,
    lowPrice: 590000,
    highPrice: 850000,
    historyPattern: 12,
  },
  {
    id: "cpu-ryzen-9700x",
    category: "CPU",
    manufacturer: "AMD",
    modelName: "Ryzen 7 9700X",
    displayName: "Ryzen 7 9700X 프로세서",
    currentPrice: 445000,
    previousPrice: 460000,
    lowPrice: 420000,
    highPrice: 620000,
    historyPattern: 13,
  },
  {
    id: "cpu-ryzen-9600x",
    category: "CPU",
    manufacturer: "AMD",
    modelName: "Ryzen 5 9600X",
    displayName: "Ryzen 5 9600X 프로세서",
    currentPrice: 320000,
    previousPrice: 330000,
    lowPrice: 280000,
    highPrice: 420000,
    historyPattern: 14,
  },
  {
    id: "cpu-ultra-9-285k",
    category: "CPU",
    manufacturer: "Intel",
    modelName: "Core Ultra 9 285K",
    displayName: "Core Ultra 9 285K 프로세서",
    currentPrice: 820000,
    previousPrice: 805000,
    lowPrice: 720000,
    highPrice: 990000,
    historyPattern: 15,
  },
  {
    id: "cpu-ultra-7-265k",
    category: "CPU",
    manufacturer: "Intel",
    modelName: "Core Ultra 7 265K",
    displayName: "Core Ultra 7 265K 프로세서",
    currentPrice: 510000,
    previousPrice: 530000,
    lowPrice: 470000,
    highPrice: 690000,
    historyPattern: 16,
  },
  {
    id: "cpu-ultra-5-245k",
    category: "CPU",
    manufacturer: "Intel",
    modelName: "Core Ultra 5 245K",
    displayName: "Core Ultra 5 245K 프로세서",
    currentPrice: 350000,
    previousPrice: 345000,
    lowPrice: 320000,
    highPrice: 490000,
    historyPattern: 17,
  },
  {
    id: "cpu-ryzen-7900x",
    category: "CPU",
    manufacturer: "AMD",
    modelName: "Ryzen 9 7900X",
    displayName: "Ryzen 9 7900X 프로세서",
    currentPrice: 520000,
    previousPrice: 545000,
    lowPrice: 480000,
    highPrice: 720000,
    historyPattern: 18,
  },
  {
    id: "cpu-i7-14700k",
    category: "CPU",
    manufacturer: "Intel",
    modelName: "Core i7-14700K",
    displayName: "Core i7-14700K 프로세서",
    currentPrice: 590000,
    previousPrice: 575000,
    lowPrice: 430000,
    highPrice: 650000,
    historyPattern: 19,
  },
  {
    id: "laptop-gaming-18",
    category: "LAPTOP",
    manufacturer: "Apex",
    modelName: "Titan 18 Gaming",
    displayName: "Titan 18 고성능 게이밍 노트북",
    tags: ["게이밍"],
    currentPrice: 3890000,
    previousPrice: 4050000,
    lowPrice: 3490000,
    highPrice: 4890000,
    historyPattern: 20,
  },
  {
    id: "laptop-gaming-16",
    category: "LAPTOP",
    manufacturer: "Nova",
    modelName: "Strike 16",
    displayName: "Strike 16 게이밍 노트북",
    tags: ["게이밍"],
    currentPrice: 2190000,
    previousPrice: 2260000,
    lowPrice: 2050000,
    highPrice: 2990000,
    historyPattern: 21,
  },
  {
    id: "laptop-creator-16",
    category: "LAPTOP",
    manufacturer: "Canvas",
    modelName: "Studio Pro 16",
    displayName: "Studio Pro 16 크리에이터 노트북",
    tags: ["크리에이터"],
    currentPrice: 2780000,
    previousPrice: 2690000,
    lowPrice: 2290000,
    highPrice: 3290000,
    historyPattern: 22,
  },
  {
    id: "laptop-creator-14",
    category: "LAPTOP",
    manufacturer: "Canvas",
    modelName: "Studio Air 14",
    displayName: "Studio Air 14 크리에이터 노트북",
    tags: ["크리에이터", "경량"],
    currentPrice: 1840000,
    previousPrice: 1880000,
    lowPrice: 1690000,
    highPrice: 2390000,
    historyPattern: 23,
  },
  {
    id: "laptop-office-15",
    category: "LAPTOP",
    manufacturer: "WorkMate",
    modelName: "Office 15",
    displayName: "Office 15 사무용 노트북",
    tags: ["사무용"],
    currentPrice: 890000,
    previousPrice: 930000,
    lowPrice: 820000,
    highPrice: 1250000,
    historyPattern: 24,
  },
  {
    id: "laptop-office-14",
    category: "LAPTOP",
    manufacturer: "WorkMate",
    modelName: "Office Slim 14",
    displayName: "Office Slim 14 사무용 노트북",
    tags: ["사무용", "경량"],
    currentPrice: 790000,
    previousPrice: 770000,
    lowPrice: 740000,
    highPrice: 1090000,
    historyPattern: 25,
  },
  {
    id: "laptop-light-14",
    category: "LAPTOP",
    manufacturer: "Feather",
    modelName: "Air 14",
    displayName: "Air 14 초경량 노트북",
    tags: ["경량"],
    currentPrice: 1390000,
    previousPrice: 1420000,
    lowPrice: 1290000,
    highPrice: 1790000,
    historyPattern: 26,
  },
  {
    id: "laptop-light-13",
    category: "LAPTOP",
    manufacturer: "Feather",
    modelName: "Air 13",
    displayName: "Air 13 휴대용 노트북",
    tags: ["경량"],
    currentPrice: 1190000,
    previousPrice: 1160000,
    lowPrice: 1090000,
    highPrice: 1550000,
    historyPattern: 27,
  },
  {
    id: "laptop-balanced-15",
    category: "LAPTOP",
    manufacturer: "Nova",
    modelName: "Balance 15",
    displayName: "Balance 15 올라운드 노트북",
    tags: ["사무용"],
    currentPrice: 1520000,
    previousPrice: 1540000,
    lowPrice: 1320000,
    highPrice: 1890000,
    historyPattern: 28,
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createPriceHistory(seed: ProductSeed): PriceHistoryPoint[] {
  const points = 25;
  const center = (seed.lowPrice + seed.highPrice) / 2;
  const amplitude = (seed.highPrice - seed.lowPrice) / 2;

  return Array.from({ length: points }, (_, index) => {
    const progress = index / (points - 1);
    const wave =
      Math.sin(progress * Math.PI * 2 + seed.historyPattern * 0.48) * 0.48 +
      Math.sin(progress * Math.PI * 4 + seed.historyPattern * 0.19) * 0.18;
    const generated = clamp(
      center + amplitude * wave,
      seed.lowPrice,
      seed.highPrice
    );
    const price =
      index === points - 1
        ? seed.currentPrice
        : index === points - 2
          ? seed.previousPrice
          : index === 4 + (seed.historyPattern % 3)
            ? seed.lowPrice
            : index === 13 + (seed.historyPattern % 4)
              ? seed.highPrice
              : Math.round(generated / 1000) * 1000;
    const date = new Date(Date.UTC(2026, 1, 1 + index * 7));

    return { date: date.toISOString(), price };
  });
}

function getPriceStatus(position: number): PriceStatus {
  if (position <= 10) return "VERY_LOW";
  if (position <= 30) return "LOW";
  if (position <= 65) return "FAIR";
  if (position <= 85) return "HIGH";
  return "VERY_HIGH";
}

function getRecentTrend(changeRate: number): PriceTrend {
  if (changeRate >= 1) return "RISING";
  if (changeRate <= -1) return "FALLING";
  return "STABLE";
}

function createProduct(seed: ProductSeed): Product {
  const priceHistory = createPriceHistory(seed);
  const priceRangeAmount = Math.max(0, seed.highPrice - seed.lowPrice);
  const priceRangeRate =
    seed.lowPrice > 0 ? (priceRangeAmount / seed.lowPrice) * 100 : 0;
  const currentPositionRate =
    priceRangeAmount > 0
      ? clamp(
          ((seed.currentPrice - seed.lowPrice) / priceRangeAmount) * 100,
          0,
          100
        )
      : 50;
  const lowestPriceDifferenceRate =
    seed.lowPrice > 0
      ? ((seed.currentPrice - seed.lowPrice) / seed.lowPrice) * 100
      : 0;
  const changeAmount = seed.currentPrice - seed.previousPrice;
  const changeRate =
    seed.previousPrice > 0 ? (changeAmount / seed.previousPrice) * 100 : 0;
  const sixMonthAveragePrice = Math.round(
    priceHistory.reduce((sum, point) => sum + point.price, 0) /
      priceHistory.length
  );

  return {
    id: seed.id,
    category: seed.category,
    manufacturer: seed.manufacturer,
    modelName: seed.modelName,
    displayName: seed.displayName,
    imageUrl: PRODUCT_CATEGORIES[seed.category].imageUrl,
    tags: seed.tags ?? [],
    currentPrice: seed.currentPrice,
    previousPrice: seed.previousPrice,
    changeAmount,
    changeRate,
    recentTrend: getRecentTrend(changeRate),
    sixMonthLowPrice: seed.lowPrice,
    sixMonthHighPrice: seed.highPrice,
    sixMonthAveragePrice,
    priceRangeAmount,
    priceRangeRate,
    currentPositionRate,
    lowestPriceDifferenceRate,
    fairPriceMin:
      Math.round((seed.lowPrice + priceRangeAmount * 0.28) / 1000) * 1000,
    fairPriceMax:
      Math.round((seed.lowPrice + priceRangeAmount * 0.58) / 1000) * 1000,
    priceStatus: getPriceStatus(currentPositionRate),
    priceHistory,
    updatedAt: UPDATED_AT,
  };
}

/**
 * Demo-only product prices. They do not represent a specific retailer,
 * marketplace listing, or a promise of a real transaction price.
 */
const mockProducts: Product[] = PRODUCT_SEEDS.map(createProduct);

export default mockProducts;
