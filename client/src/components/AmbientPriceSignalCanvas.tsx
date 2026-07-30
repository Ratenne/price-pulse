import { useEffect, useRef, useState, type RefObject } from "react";
import type { ThemeMode } from "@/contexts/ThemeContext";

interface AmbientPriceSignalCanvasProps {
  containerRef: RefObject<HTMLElement | null>;
  theme: ThemeMode;
}

interface Point {
  x: number;
  y: number;
}

interface PointerState extends Point {
  active: boolean;
}

interface CanvasSize {
  width: number;
  height: number;
}

const AUTO_PATH = [
  { x: 0.12, y: 0.58 },
  { x: 0.28, y: 0.34 },
  { x: 0.47, y: 0.62 },
  { x: 0.67, y: 0.38 },
  { x: 0.86, y: 0.54 },
];

const CANVAS_THEME = {
  light: {
    line: "rgba(66, 191, 245, 0.24)",
    point: "rgba(66, 191, 245, 0.42)",
    target: "rgba(255, 135, 54, 0.84)",
    wave: "rgba(255, 135, 54, 0.15)",
  },
  dark: {
    line: "rgba(85, 200, 248, 0.24)",
    point: "rgba(85, 200, 248, 0.48)",
    target: "rgba(255, 150, 63, 0.9)",
    wave: "rgba(255, 150, 63, 0.15)",
  },
};

function getAutoTarget(elapsed: number, width: number, height: number): Point {
  const progress = elapsed / 2.4;
  const index =
    ((Math.floor(progress) % AUTO_PATH.length) + AUTO_PATH.length) %
    AUTO_PATH.length;
  const nextIndex = (index + 1) % AUTO_PATH.length;
  const localProgress = progress - Math.floor(progress);
  const eased = localProgress * localProgress * (3 - 2 * localProgress);
  const from = AUTO_PATH[index];
  const to = AUTO_PATH[nextIndex];

  return {
    x: (from.x + (to.x - from.x) * eased) * width,
    y: (from.y + (to.y - from.y) * eased) * height,
  };
}

function createParticles(count: number): Point[] {
  return Array.from({ length: count }, (_, index) => ({
    x: ((index * 47) % 101) / 100,
    y: ((index * 71 + 19) % 97) / 96,
  }));
}

function redrawStaticCanvas(
  canvas: HTMLCanvasElement,
  palette: (typeof CANVAS_THEME)[ThemeMode],
  particleCount: number
) {
  const context = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  if (!context || rect.width <= 0 || rect.height <= 0) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.fillStyle = palette.point;

  createParticles(particleCount).forEach((particle, index) => {
    context.beginPath();
    context.arc(
      particle.x * rect.width,
      particle.y * rect.height,
      index % 5 === 0 ? 2 : 1.35,
      0,
      Math.PI * 2
    );
    context.fill();
  });
}

function getCapabilities() {
  const mobile = window.matchMedia(
    "(max-width: 767px), (pointer: coarse)"
  ).matches;
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  return { mobile, reducedMotion };
}

export function AmbientPriceSignalCanvas({
  containerRef,
  theme,
}: AmbientPriceSignalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef(CANVAS_THEME[theme]);
  const themeRef = useRef(theme);
  const [capabilities, setCapabilities] = useState(getCapabilities);
  const debug =
    new URLSearchParams(window.location.search).get("debugCanvas") === "true";
  const cpuCount = navigator.hardwareConcurrency ?? 8;
  const particleCount = cpuCount <= 4 ? 16 : 32;
  const enabled = !capabilities.mobile && !capabilities.reducedMotion;

  useEffect(() => {
    paletteRef.current = CANVAS_THEME[theme];
    themeRef.current = theme;

    if (canvasRef.current?.dataset.enabled === "false") {
      redrawStaticCanvas(canvasRef.current, paletteRef.current, particleCount);
    }
  }, [particleCount, theme]);

  useEffect(() => {
    const mobileQuery = window.matchMedia(
      "(max-width: 767px), (pointer: coarse)"
    );
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setCapabilities(getCapabilities());

    mobileQuery.addEventListener("change", handleChange);
    motionQuery.addEventListener("change", handleChange);

    return () => {
      mobileQuery.removeEventListener("change", handleChange);
      motionQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let running = true;
    let frameId = 0;
    let previousTime = performance.now();
    let elapsed = 0;
    let visible = true;
    let lastDebugUpdate = 0;
    const size: CanvasSize = { width: 0, height: 0 };
    const pointer: PointerState = { x: 0, y: 0, active: false };
    const currentTarget: Point = { x: 0, y: 0 };
    const particles = createParticles(particleCount);

    const updateDebug = (animationRunning: boolean) => {
      canvas.dataset.enabled = String(enabled);
      canvas.dataset.running = String(animationRunning);
      canvas.dataset.pointerActive = String(pointer.active);
      canvas.dataset.targetX = currentTarget.x.toFixed(1);
      canvas.dataset.targetY = currentTarget.y.toFixed(1);
      canvas.dataset.particleCount = String(particleCount);

      if (debugRef.current) {
        debugRef.current.textContent = [
          `Canvas ${Math.round(size.width)} × ${Math.round(size.height)}`,
          `Canvas enabled: ${enabled}`,
          `Animation running: ${animationRunning}`,
          `Pointer active: ${pointer.active}`,
          `Current target: ${currentTarget.x.toFixed(1)}, ${currentTarget.y.toFixed(1)}`,
          `Resolved theme: ${themeRef.current}`,
          `Reduced motion: ${capabilities.reducedMotion}`,
          `Mobile detection: ${capabilities.mobile}`,
          `Particle count: ${particleCount}`,
        ].join("\n");
      }
    };

    const draw = (time: number, staticOnly = false) => {
      const { width, height } = size;
      if (width <= 0 || height <= 0) return;

      const palette = paletteRef.current;
      const renderedPoints = particles.map((particle, index) => {
        const wobble = staticOnly ? 0 : Math.sin(time * 0.7 + index) * 3;
        const baseX = particle.x * width;
        const baseY = particle.y * height + wobble;
        const distanceX = currentTarget.x - baseX;
        const distanceY = currentTarget.y - baseY;
        const influence = pointer.active && !staticOnly ? 0.025 : 0.012;

        return {
          x: baseX + distanceX * influence,
          y: baseY + distanceY * influence,
        };
      });

      context.clearRect(0, 0, width, height);
      context.lineWidth = 0.8;
      context.strokeStyle = palette.line;

      for (let index = 0; index < renderedPoints.length; index += 1) {
        for (
          let nextIndex = index + 1;
          nextIndex < renderedPoints.length;
          nextIndex += 1
        ) {
          const first = renderedPoints[index];
          const second = renderedPoints[nextIndex];
          const distance = Math.hypot(first.x - second.x, first.y - second.y);

          if (distance < 105) {
            context.globalAlpha = 1 - distance / 105;
            context.beginPath();
            context.moveTo(first.x, first.y);
            context.lineTo(second.x, second.y);
            context.stroke();
          }
        }
      }

      context.globalAlpha = 1;
      context.fillStyle = palette.point;
      renderedPoints.forEach((point, index) => {
        context.beginPath();
        context.arc(
          point.x,
          point.y,
          index % 5 === 0 ? 2 : 1.35,
          0,
          Math.PI * 2
        );
        context.fill();
      });

      if (!staticOnly) {
        const waveRadius = 12 + ((time * 10) % 18);
        context.strokeStyle = palette.wave;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(
          currentTarget.x,
          currentTarget.y,
          waveRadius,
          0,
          Math.PI * 2
        );
        context.stroke();

        context.fillStyle = palette.target;
        context.beginPath();
        context.arc(currentTarget.x, currentTarget.y, 4, 0, Math.PI * 2);
        context.fill();
      }
    };

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.width = rect.width;
      size.height = rect.height;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (currentTarget.x === 0 && currentTarget.y === 0) {
        const initialTarget = getAutoTarget(0, rect.width, rect.height);
        currentTarget.x = initialTarget.x;
        currentTarget.y = initialTarget.y;
      }

      if (!enabled) {
        draw(0, true);
        updateDebug(false);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
      pointer.y = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
      pointer.active = true;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
    };

    const handleWindowPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const isInside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!isInside) {
        pointer.active = false;
      }
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });

    resizeObserver.observe(container);
    intersectionObserver.observe(container);
    resizeCanvas();

    if (enabled) {
      container.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
      container.addEventListener("pointerleave", handlePointerLeave);
      window.addEventListener("pointermove", handleWindowPointerMove, {
        passive: true,
      });
    }

    const animate = (currentTime: number) => {
      if (!running) return;

      const deltaTime = Math.max(
        0,
        Math.min((currentTime - previousTime) / 1000, 0.033)
      );
      previousTime = currentTime;

      if (visible && document.visibilityState === "visible") {
        elapsed += deltaTime;
        const autoTarget = getAutoTarget(elapsed, size.width, size.height);
        const desiredTarget = pointer.active
          ? {
              x: autoTarget.x * 0.82 + pointer.x * 0.18,
              y: autoTarget.y * 0.82 + pointer.y * 0.18,
            }
          : autoTarget;
        const interpolation = Math.min(1, deltaTime * 4);

        currentTarget.x += (desiredTarget.x - currentTarget.x) * interpolation;
        currentTarget.y += (desiredTarget.y - currentTarget.y) * interpolation;
        draw(elapsed);

        if (currentTime - lastDebugUpdate > 200) {
          updateDebug(true);
          lastDebugUpdate = currentTime;
        }
      } else {
        updateDebug(false);
      }

      frameId = requestAnimationFrame(animate);
    };

    if (enabled) {
      frameId = requestAnimationFrame(animate);
    } else {
      updateDebug(false);
    }

    return () => {
      running = false;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("pointermove", handleWindowPointerMove);
      canvas.dataset.running = "false";
    };
  }, [
    capabilities.mobile,
    capabilities.reducedMotion,
    containerRef,
    enabled,
    particleCount,
  ]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="main-hero__canvas"
        data-ambient-signal-canvas=""
        aria-hidden="true"
      />
      {debug && (
        <div
          ref={debugRef}
          className="main-hero__canvas-debug"
          aria-live="polite"
        />
      )}
    </>
  );
}
