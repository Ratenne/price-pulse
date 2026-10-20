import type { Product } from "@/domain/product";
import { formatPrice, formatCurrentPrice } from "@/lib/productFormatting";
import { buildPriceChartData } from "@shared/priceChart";
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
  const data = buildPriceChartData(product);
  const excludedCount = product.excludedHistoryMonths?.length ?? 0;
  const currentPoint =
    product.currentPrice !== null && product.currentPriceMonth
      ? data.at(-1)
      : undefined;

  return (
    <div>
      {showHeading && (
        <div className="chart-heading mb-5">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            {product.analysis?.rankingPeriod === "UNDER_SIX_MONTHS"
              ? "관측 기간 가격 이력과 현재 가격"
              : "직전 6개월 최저가와 현재 가격"}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {product.observedPriceHistory?.length
              ? "월별 이력과 실제 관측 가격입니다. 없는 기간은 생성하지 않습니다."
              : "지난달까지는 월별 최저가, 이번 달은 조회 시점 가격입니다. 없는 월은 생성하지 않습니다."}
          </p>
        </div>
      )}
      {excludedCount > 0 && (
        <p className="mb-3 text-sm text-[var(--text-secondary)]" role="note">
          검토된 이상치 {excludedCount}건은 차트·통계·순위에서 제외했습니다.
          해당 월은 선을 연결하지 않으며 원본 데이터는 보존합니다.
        </p>
      )}
      <div
        style={{ height }}
        role="img"
        aria-label={`${product.displayName} 가격 흐름 차트. 현재 가격 ${formatCurrentPrice(product)}${excludedCount ? `. 이상치 ${excludedCount}건 제외` : ""}`}
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
              tickFormatter={value =>
                String(value).length > 7
                  ? new Date(String(value)).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : value
              }
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={58}
              tickFormatter={value => `${Math.round(Number(value) / 10000)}만`}
            />
            <Tooltip
              labelFormatter={value =>
                String(value).length > 7
                  ? new Date(String(value)).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })
                  : value
              }
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
              connectNulls={false}
              stroke="var(--sky-blue-strong)"
              strokeWidth={2.5}
              dot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            {currentPoint && currentPoint.price !== null && (
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
