import type { Product } from "@/domain/product";
import { formatPrice } from "@/lib/productFormatting";
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
}: {
  product: Product;
  height?: number;
}) {
  const data = product.priceHistory.map(point => ({
    date: new Date(point.date).toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
    }),
    price: point.price,
  }));
  const currentPoint = data[data.length - 1];

  return (
    <div>
      <div className="mb-3">
        <h3 className="font-semibold text-[var(--text-primary)]">가격 흐름</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          기간별 가격 변화를 확인하세요.
        </p>
      </div>
      <div
        style={{ height }}
        aria-label={`${product.displayName} 가격 흐름 차트. 현재 가격 ${formatPrice(product.currentPrice)}`}
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
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
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
              type="monotone"
              dataKey="price"
              stroke="var(--sky-blue)"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceDot
              x={currentPoint.date}
              y={currentPoint.price}
              r={5}
              fill="var(--orange)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
