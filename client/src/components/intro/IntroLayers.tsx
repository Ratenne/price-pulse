import { forwardRef } from "react";

export type IntroPhase = "opening" | "analyzing" | "decision" | "exiting";

interface VideoLayerProps {
  source: string;
  preload: "auto" | "metadata";
  onCanPlay: () => void;
  onEnded: () => void;
  onError: () => void;
  onLoadedMetadata: (video: HTMLVideoElement) => void;
  onTimeUpdate: (video: HTMLVideoElement) => void;
}

export const VideoLayer = forwardRef<HTMLVideoElement, VideoLayerProps>(
  function VideoLayer(
    {
      source,
      preload,
      onCanPlay,
      onEnded,
      onError,
      onLoadedMetadata,
      onTimeUpdate,
    },
    ref
  ) {
    return (
      <video
        ref={ref}
        className="intro-video__media"
        src={source}
        autoPlay
        muted
        playsInline
        preload={preload}
        aria-hidden="true"
        tabIndex={-1}
        onCanPlay={onCanPlay}
        onEnded={onEnded}
        onError={onError}
        onLoadedMetadata={event => onLoadedMetadata(event.currentTarget)}
        onTimeUpdate={event => onTimeUpdate(event.currentTarget)}
      />
    );
  }
);

export function VisualOverlay() {
  return <div className="intro-video__overlay" aria-hidden="true" />;
}

export function FallbackLayer({ visible }: { visible: boolean }) {
  return (
    <div
      className="intro-video__fallback"
      data-visible={visible}
      aria-hidden="true"
    >
      <div className="intro-video__fallback-brand">
        <span className="intro-video__fallback-symbol">₩</span>
        <span>PricePulse</span>
      </div>
      <svg
        className="intro-video__fallback-graph"
        viewBox="0 0 560 180"
        role="presentation"
      >
        <path
          className="intro-video__fallback-grid"
          d="M0 45H560M0 90H560M0 135H560"
        />
        <path
          className="intro-video__fallback-line"
          d="M16 122C72 126 92 70 144 82S218 132 270 104 338 42 394 65 466 112 544 40"
        />
        <circle
          className="intro-video__fallback-signal"
          cx="270"
          cy="104"
          r="6"
        />
      </svg>
    </div>
  );
}

export function IntroMessage({ phase }: { phase: IntroPhase }) {
  return (
    <div className="intro-video__message" aria-live="polite" aria-atomic="true">
      {phase === "analyzing" && (
        <p key="analyzing" className="intro-video__analyzing">
          상품의 가격 흐름을 분석하고 있습니다
        </p>
      )}

      {(phase === "decision" || phase === "exiting") && (
        <div key="decision" className="intro-video__decision">
          <h1>
            <span className="intro-video__buy">사도 될까</span>
            <span aria-hidden="true">, </span>
            <span className="intro-video__sell">팔아도 될까</span>
          </h1>
          <p>가격 흐름으로 적정한 거래 시점을 찾습니다</p>
        </div>
      )}
    </div>
  );
}

export function SkipButton({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      type="button"
      className="intro-video__skip"
      aria-label="PricePulse 시작 화면 건너뛰기"
      onClick={onSkip}
    >
      건너뛰기
    </button>
  );
}
