import type { Product } from "@/domain/product";
import { formatPrice, formatCurrentPrice } from "@/lib/productFormatting";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function PriceHistoryChart({
  product,
  height = 240,
  showHeading = true,
}: {
  product: Product;
  height?: number;
  showHeading?: boolean;
}) {
  const data = product.priceHistory.map(point => ({
    date: point.date.slice(0, 7),
    price: point.price,
  }));
  if (product.currentPrice !== null && product.currentPriceMonth) {
    data.push({ date: product.currentPriceMonth, price: product.currentPrice });
  }
  const currentPoint =
    product.currentPrice !== null && product.currentPriceMonth
      ? data.at(-1)
      : undefined;

  return (
    <div>
      {showHeading && (
        <div className="chart-heading mb-5">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            직전 6개월 최저가와 현재 가격
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            지난달까지는 월별 최저가, 이번 달은 조회 시점 가격입니다. 없는 월은
            생성하지 않습니다.
          </p>
        </div>
      )}
      <div
        style={{ height }}
        role="img"
        aria-label={`${product.displayName} 가격 흐름 차트. 현재 가격 ${formatCurrentPrice(product)}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--chart-grid)"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={58}
              tickFormatter={value => `${Math.round(Number(value) / 10000)}만`}
            />
            <Tooltip
              formatter={value => [formatPrice(Number(value)), "가격"]}
              contentStyle={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "0.6rem",
                color: "var(--text-primary)",
              }}
              labelStyle={{ color: "var(--text-secondary)" }}
            />
            <Line
              type="linear"
              dataKey="price"
              stroke="var(--sky-blue-strong)"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            {currentPoint && (
              <ReferenceDot
                x={currentPoint.date}
                y={currentPoint.price}
                r={5}
                fill="var(--orange)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
