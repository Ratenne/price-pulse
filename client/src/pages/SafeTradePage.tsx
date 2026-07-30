import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { Eye, HandCoins, Scale } from "lucide-react";

export default function SafeTradePage() {
  return (
    <div className="app-shell">
      <Header />
      <main>
        <section className="border-b border-[var(--border)] bg-[var(--surface-muted)] py-16">
          <div className="container max-w-5xl text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--orange-soft)] text-[var(--orange-strong)]">
              <Scale className="h-7 w-7" />
            </span>
            <h1 className="mt-6 text-3xl font-bold tracking-[-0.03em] text-[var(--text-primary)] md:text-5xl">
              구매자와 판매자 모두 납득할 수 있는 가격
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-[var(--text-secondary)]">
              상품의 가격 흐름을 바탕으로 현재 시장에서 참고할 수 있는 적정 거래
              범위를 제공합니다.
            </p>
          </div>
        </section>

        <section className="container py-14">
          <div className="grid gap-6 md:grid-cols-2">
            <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--sky-blue-soft)] text-[var(--sky-blue-strong)]">
                <Eye className="h-5 w-5" />
              </span>
              <p className="mt-5 text-sm font-semibold text-[var(--sky-blue-strong)]">
                구매자 관점
              </p>
              <h2 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
                너무 비싸게 사지 않도록
              </h2>
              <p className="mt-4 leading-relaxed text-[var(--text-secondary)]">
                현재 가격이 과거 가격 범위에서 어느 위치인지 확인하고, 구매
                판단에 참고할 수 있습니다.
              </p>
            </article>

            <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--orange-soft)] text-[var(--orange-strong)]">
                <HandCoins className="h-5 w-5" />
              </span>
              <p className="mt-5 text-sm font-semibold text-[var(--orange-strong)]">
                판매자 관점
              </p>
              <h2 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
                너무 낮거나 높은 가격을 피하도록
              </h2>
              <p className="mt-4 leading-relaxed text-[var(--text-secondary)]">
                시장 가격 흐름을 확인해 판매 속도와 가격 사이의 균형을 판단할 수
                있습니다.
              </p>
            </article>
          </div>
        </section>

        <section className="bg-[var(--surface-muted)] py-14">
          <div className="container max-w-4xl">
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">
              PricePulse가 보여주는 기준
            </h2>
            <div className="mt-6 space-y-4">
              {[
                [
                  "현재 가격 위치",
                  "최저 가격부터 최고 가격 사이에서 현재 가격이 어느 구간인지 보여줍니다.",
                ],
                [
                  "적정 거래 가격 범위",
                  "과거 흐름과 평균 가격을 참고해 구매자와 판매자가 함께 참고할 범위를 제시합니다.",
                ],
                [
                  "최근 가격 방향",
                  "짧은 기간의 움직임을 함께 표시해 최저가 근접 여부만으로 판단하지 않도록 돕습니다.",
                ],
              ].map(([title, description], index) => (
                <div
                  key={title}
                  className="flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--orange)] font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">
                      {title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-[var(--text-muted)]">
              현재 화면의 가격 데이터와 적정 범위는 서비스 시연을 위한 예시이며
              실제 거래를 보장하지 않습니다.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
