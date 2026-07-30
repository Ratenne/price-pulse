import { useCallback, useEffect, useRef, useState } from "react";
import {
  FallbackLayer,
  IntroMessage,
  type IntroPhase,
  SkipButton,
  VideoLayer,
  VisualOverlay,
} from "./IntroLayers";

interface IntroVideoProps {
  onComplete: () => void;
}

const INTRO_VIDEO_PATH = "/videos/pricepulse-intro.mp4";
const ANALYZING_START = 0.7;
const DECISION_START = 2.8;
const EXIT_START = 4.7;
const FALLBACK_DURATION_MS = 1500;
const SKIP_TRANSITION_MS = 300;
const END_TRANSITION_MS = 300;

function getInitialPreferences() {
  const params = new URLSearchParams(window.location.search);
  const forceReducedMotion =
    import.meta.env.DEV && params.get("reducedMotion") === "true";

  return {
    mobile: window.matchMedia("(max-width: 767px), (pointer: coarse)").matches,
    reducedMotion:
      forceReducedMotion ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    forceVideoError:
      import.meta.env.DEV && params.get("introVideoError") === "true",
  };
}

export function IntroVideo({ onComplete }: IntroVideoProps) {
  const [preferences] = useState(getInitialPreferences);
  const [phase, setPhase] = useState<IntroPhase>(
    preferences.reducedMotion ? "decision" : "opening"
  );
  const [fallback, setFallback] = useState(preferences.reducedMotion);
  const [duration, setDuration] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const completeCallbackRef = useRef(onComplete);
  const completionTimerRef = useRef<number | null>(null);
  const completionScheduledRef = useRef(false);
  const completionFiredRef = useRef(false);
  const fallbackStartedRef = useRef(preferences.reducedMotion);
  const playAttemptedRef = useRef(false);

  useEffect(() => {
    completeCallbackRef.current = onComplete;
  }, [onComplete]);

  const completeOnce = useCallback(() => {
    if (!completionScheduledRef.current || completionFiredRef.current) {
      return;
    }

    completionFiredRef.current = true;
    videoRef.current?.pause();
    completeCallbackRef.current();
  }, []);

  const scheduleCompletion = useCallback(
    (delay: number) => {
      if (completionScheduledRef.current || completionFiredRef.current) {
        return;
      }

      completionScheduledRef.current = true;
      completionTimerRef.current = window.setTimeout(completeOnce, delay);
    },
    [completeOnce]
  );

  const startFallback = useCallback(
    (reason: string) => {
      if (fallbackStartedRef.current || completionScheduledRef.current) {
        return;
      }

      fallbackStartedRef.current = true;
      videoRef.current?.pause();
      setFallback(true);
      setPhase("decision");

      if (import.meta.env.DEV) {
        console.warn(`[PricePulse intro] ${reason}`);
      }

      scheduleCompletion(FALLBACK_DURATION_MS);
    },
    [scheduleCompletion]
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    if (preferences.reducedMotion) {
      scheduleCompletion(FALLBACK_DURATION_MS);
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      if (!completionFiredRef.current) {
        completionScheduledRef.current = false;
      }
      videoRef.current?.pause();
    };
  }, [preferences.reducedMotion, scheduleCompletion]);

  const handleCanPlay = useCallback(() => {
    if (
      preferences.reducedMotion ||
      playAttemptedRef.current ||
      fallbackStartedRef.current
    ) {
      return;
    }

    playAttemptedRef.current = true;
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = true;
    void video
      .play()
      .catch(() =>
        startFallback("자동 재생이 차단되어 대체 화면을 표시합니다.")
      );
  }, [preferences.reducedMotion, startFallback]);

  const handleLoadedMetadata = useCallback((video: HTMLVideoElement) => {
    setDuration(Number.isFinite(video.duration) ? video.duration : null);
  }, []);

  const handleTimeUpdate = useCallback((video: HTMLVideoElement) => {
    const currentTime = video.currentTime;
    const exitStart = Number.isFinite(video.duration)
      ? Math.min(
          EXIT_START,
          Math.max(DECISION_START + 0.5, video.duration - 0.3)
        )
      : EXIT_START;

    if (currentTime >= exitStart) {
      setPhase("exiting");
    } else if (currentTime >= DECISION_START) {
      setPhase("decision");
    } else if (currentTime >= ANALYZING_START) {
      setPhase("analyzing");
    } else {
      setPhase("opening");
    }
  }, []);

  const handleEnded = useCallback(() => {
    setPhase("exiting");
    scheduleCompletion(END_TRANSITION_MS);
  }, [scheduleCompletion]);

  const handleSkip = useCallback(() => {
    videoRef.current?.pause();
    setPhase("exiting");
    scheduleCompletion(SKIP_TRANSITION_MS);
  }, [scheduleCompletion]);

  const videoSource = preferences.forceVideoError
    ? "/videos/pricepulse-intro-missing.mp4"
    : INTRO_VIDEO_PATH;

  return (
    <section
      className="intro-video"
      data-intro-phase={phase}
      data-fallback={fallback}
      data-reduced-motion={preferences.reducedMotion}
      data-video-duration={duration?.toFixed(3) ?? "unknown"}
      aria-label="PricePulse 시작 화면"
    >
      <FallbackLayer visible={fallback} />

      {!preferences.reducedMotion && !fallback && (
        <VideoLayer
          ref={videoRef}
          source={videoSource}
          preload={preferences.mobile ? "metadata" : "auto"}
          onCanPlay={handleCanPlay}
          onEnded={handleEnded}
          onError={() =>
            startFallback("영상을 불러오지 못해 대체 화면을 표시합니다.")
          }
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
        />
      )}

      <VisualOverlay />
      <IntroMessage phase={phase} />
      <SkipButton onSkip={handleSkip} />
    </section>
  );
}
