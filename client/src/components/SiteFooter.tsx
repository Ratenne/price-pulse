export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface-muted)] py-8">
      <div className="container text-center text-sm text-[var(--text-muted)]">
        <p>
          © 2026 PricePulse. PC 상품의 가격 흐름을 이해하기 쉽게 정리합니다.
        </p>
        <p className="mt-2 text-xs">
          현재 화면의 가격 데이터는 서비스 시연을 위한 예시입니다.
        </p>
      </div>
    </footer>
  );
}
