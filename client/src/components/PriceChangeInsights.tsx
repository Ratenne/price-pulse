import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Newspaper,
  Search,
  Activity,
} from "lucide-react";
import type { Product } from "@/domain/product";
import { formatPrice } from "@/lib/productFormatting";
import {
  getLargestMonthlyChange,
  type ProductNewsItem,
} from "@shared/priceInsights";
import "@/styles/price-insights.css";

const backgrounds = {
  GPU: [
    "공급·재고 변화",
    "GPU 출하량, 메모리 공급, 판매처 재고 관련 보도를 확인해 보세요.",
  ],
  CPU: [
    "신제품·세대교체",
    "신형 CPU 출시와 기존 세대의 재고 정리 소식을 확인해 보세요.",
  ],
  LAPTOP: [
    "신모델·구성 변경",
    "후속 모델 출시와 메모리·저장공간 등 판매 구성의 차이를 확인해 보세요.",
  ],
} as const;

export function PriceChangeInsights({ product }: { product: Product }) {
  const change = getLargestMonthlyChange(product);
  const [period, setPeriod] = useState<"change" | "recent">("change");
  const [attempt, setAttempt] = useState(0);
  const [news, setNews] = useState<{
    articles: ProductNewsItem[];
    checkedAt: string;
  } | null>(null);
  const [error, setError] = useState(false);
  const month = period === "change" ? change?.to : undefined;
  const query = product.modelName;
  const searchQuery = `"${query}" ${month ? `after:${month}-01 before:${nextMonth(month)}-01` : "when:90d"}`;
  const searchUrl = `https://news.google.com/search?${new URLSearchParams({ q: searchQuery, hl: "ko", gl: "KR", ceid: "KR:ko" })}`;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    setNews(null);
    setError(false);
    const params = new URLSearchParams({ q: query });
    if (month) params.set("month", month);
    fetch(`/api/product-news?${params}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("NEWS_UNAVAILABLE");
        const data = await response.json();
        if (!Array.isArray(data.articles)) throw new Error("INVALID_NEWS");
        if (!controller.signal.aborted) setNews(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => window.clearTimeout(timer));
    let cancelled = false;
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, month, attempt]);

  const background = backgrounds[product.category];
  const rising = change && change.rate > 0;
  const sharp = change && Math.abs(change.rate) >= 10;
  const TrendIcon = rising ? ArrowUpRight : ArrowDownRight;

  return (
    <section
      className="container price-insights"
      aria-labelledby="price-insights-heading"
      id="price-insights"
    >
      <div className="price-insights-heading">
        <div>
          <span className="price-insights-eyebrow">
            <Activity size={15} aria-hidden="true" /> 가격을 읽는 단서
          </span>
          <h2 id="price-insights-heading">가격이 왜 달라졌을까요?</h2>
          <p>가격 이력과 관련 보도를 함께 살펴보세요.</p>
        </div>
        <span className="price-insights-label">월별 이력 기준</span>
      </div>
      <div className="price-insights-grid">
        <article className="price-insights-analysis">
          <h3>{sharp ? "가장 크게 움직인 구간" : "관측된 가격 변화"}</h3>
          {change ? (
            <>
              <div className="price-insights-change" data-rising={!!rising}>
                <TrendIcon size={30} aria-hidden="true" />
                <strong>
                  {change.rate > 0 ? "+" : ""}
                  {change.rate.toFixed(1)}
                  <small>%</small>
                </strong>
                <span>
                  {change.from} → {change.to}
                </span>
              </div>
              <p className="price-insights-prices">
                {formatPrice(change.before)} <span>→</span>{" "}
                {formatPrice(change.after)}
              </p>
              <p className="price-insights-caption">
                {sharp
                  ? "연속된 월별 최저가 중 변동률이 가장 큰 구간입니다."
                  : "연속된 월별 최저가에서 10% 이상의 급변은 관측되지 않았습니다."}{" "}
                일별 변동 시점은 월별 이력으로 알 수 없습니다.
              </p>
            </>
          ) : (
            <p className="price-insights-caption">
              비교할 연속 월별 가격이 부족합니다. 이력이 쌓이면 변동 구간을
              표시합니다.
            </p>
          )}
          <div className="price-insights-background">
            <h4>이유를 알아볼 때 확인할 배경</h4>
            <ul>
              <li>
                <strong>{background[0]}</strong>
                <p>{background[1]}</p>
              </li>
              <li>
                <strong>할인·판매 조건</strong>
                <p>
                  행사 종료, 쿠폰·카드 조건, 배송비와 판매처 변경 여부를 확인해
                  보세요.
                </p>
              </li>
              <li>
                <strong>수입 비용·환율</strong>
                <p>
                  수입 제품이라면 환율과 유통 비용 관련 보도도 참고할 수
                  있습니다.
                </p>
              </li>
            </ul>
          </div>
          <p className="price-insights-note">
            위 항목은 확인할 가능성입니다. 이 상품의 실제 변동 원인으로 확인된
            내용은 아닙니다.
          </p>
        </article>
        <article className="price-insights-news">
          <div className="price-insights-news-heading">
            <h3>
              <Newspaper size={18} aria-hidden="true" /> 관련 뉴스
            </h3>
            <a
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Google 뉴스에서 관련 기사 더 보기"
            >
              더 보기 <ExternalLink size={13} aria-hidden="true" />
            </a>
          </div>
          <div
            className="price-insights-filters"
            role="group"
            aria-label="뉴스 조회 기간"
          >
            {change && (
              <button
                type="button"
                aria-pressed={period === "change"}
                onClick={() => setPeriod("change")}
              >
                {change.to} 변동 시기
              </button>
            )}
            <button
              type="button"
              aria-pressed={!month}
              onClick={() => setPeriod("recent")}
            >
              최근 90일
            </button>
          </div>
          <p className="price-insights-caption">
            {query} · {month ? `${month} 발행 기사` : "최근 90일 발행 기사"}
          </p>
          <div aria-live="polite" aria-busy={!news && !error}>
            {!news && !error && (
              <p className="price-insights-empty">
                관련 기사를 불러오는 중입니다…
              </p>
            )}
            {error && (
              <div className="price-insights-empty">
                <Search size={24} aria-hidden="true" />
                <strong>뉴스를 불러오지 못했습니다</strong>
                <p>잠시 후 다시 시도하거나 Google 뉴스에서 확인해 주세요.</p>
                <button
                  className="text-link"
                  type="button"
                  onClick={() => setAttempt(value => value + 1)}
                >
                  다시 시도
                </button>
              </div>
            )}
            {news && news.articles.length === 0 && (
              <div className="price-insights-empty">
                <Search size={24} aria-hidden="true" />
                <strong>해당 기간의 관련 기사가 없습니다</strong>
                <p>
                  {month
                    ? "최근 90일로 기간을 바꾸거나 뉴스 검색을 이용해 보세요."
                    : "뉴스 검색에서 제품명이나 검색 범위를 바꿔 보세요."}
                </p>
              </div>
            )}
            {news && news.articles.length > 0 && (
              <ul className="price-insights-articles">
                {news.articles.map(article => (
                  <li key={article.url}>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>
                        {article.publisher}{" "}
                        <time dateTime={article.publishedAt}>
                          {new Date(article.publishedAt).toLocaleDateString(
                            "ko-KR",
                            { timeZone: "Asia/Seoul" }
                          )}
                        </time>
                      </span>
                      <strong>
                        {article.title}
                        <ExternalLink size={14} aria-hidden="true" />
                      </strong>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="price-insights-note">
            Google 뉴스 검색 결과 · 관련 기사가 가격 변동과 직접적인 인과관계를
            의미하지는 않습니다.
            {news && (
              <>
                {" "}
                조회{" "}
                {new Date(news.checkedAt).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </>
            )}
          </p>
        </article>
      </div>
    </section>
  );
}

function nextMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}
