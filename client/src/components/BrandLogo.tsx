interface BrandLogoProps {
  variant?: "wordmark" | "symbol";
  tone?: "theme" | "dark";
  className?: string;
}

export function BrandLogo({
  variant = "wordmark",
  tone = "theme",
  className = "",
}: BrandLogoProps) {
  const isSymbol = variant === "symbol";

  return (
    <svg
      className={`brand-logo brand-logo--${variant} ${className}`}
      data-tone={tone}
      viewBox={isSymbol ? "166 196 960 960" : "60 205 1770 445"}
      width={isSymbol ? 36 : 184}
      height={isSymbol ? 36 : 45}
      role="img"
      aria-label="PricePulse"
      focusable="false"
    >
      {/* Frame the supplied artwork without changing the original image. */}
      <image
        className={isSymbol ? undefined : "brand-logo__light"}
        href={`/images/brand/pricepulse-${isSymbol ? "symbol" : "logo"}.png`}
        width={isSymbol ? 1254 : 1849}
        height={isSymbol ? 1254 : 851}
      />
      {!isSymbol && (
        <image
          className="brand-logo__dark"
          href="/images/brand/pricepulse-logo-dark.png"
          width={1849}
          height={851}
        />
      )}
    </svg>
  );
}
