import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Link, useLocation } from "wouter";

const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/rankings", label: "전체 순위" },
  { href: "/categories", label: "카테고리" },
  { href: "/safe-trade", label: "안심거래" },
];

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();
  const isActive = (path: string) =>
    path === "/" ? location === "/" : location.startsWith(path);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
          aria-label="PricePulse 홈"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--orange)] text-sm font-bold text-white">
            ₩
          </span>
          <span className="hidden text-lg font-bold text-[var(--text-primary)] sm:inline">
            PricePulse
          </span>
        </Link>

        <nav
          className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto sm:gap-3 md:gap-7"
          aria-label="주요 메뉴"
        >
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`shrink-0 rounded-md px-2 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                isActive(item.href)
                  ? "text-[var(--orange-strong)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={toggleTheme}
          className="shrink-0 rounded-lg bg-[var(--surface-muted)] p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sky-blue)]"
          aria-label={
            theme === "light" ? "어두운 테마로 변경" : "밝은 테마로 변경"
          }
        >
          {theme === "light" ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )}
        </button>
      </div>
    </header>
  );
}
