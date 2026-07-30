/**
 * Price Signal Canvas Component
 * Canvas-based visualization of price data streams responding to search signal
 * Uses requestAnimationFrame for smooth, frame-rate independent animation
 */

import { useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";

type LoadingPhase =
  | "ENTER"
  | "DRAWING_GRAPH"
  | "SCANNING"
  | "FOUND_SIGNAL"
  | "COMPLETED"
  | "EXITING";

interface Point {
  x: number;
  y: number;
}

interface PriceSignalCanvasProps {
  phase: LoadingPhase;
  targetPoint: Point;
  reducedMotion: boolean;
}

// Color palette for PricePulse
const CANVAS_THEME = {
  light: {
    skyBlue: "rgba(66, 191, 245, 0.30)",
    orangeLight: "rgba(255, 135, 54, 0.45)",
  },
  dark: {
    skyBlue: "rgba(85, 200, 248, 0.30)",
    orangeLight: "rgba(255, 150, 63, 0.45)",
  },
};

// Signal segment class for data stream chains
class SignalSegment {
  position: Point;
  nextPosition: Point;
  length: number;
  angle: number;

  constructor(x: number, y: number) {
    this.position = { x, y };
    this.nextPosition = { x, y };
    this.length = 8;
    this.angle = 0;
  }

  update(target: Point): void {
    const dx = target.x - this.nextPosition.x;
    const dy = target.y - this.nextPosition.y;
    this.angle = Math.atan2(dy, dx);

    this.nextPosition.x = target.x - Math.cos(this.angle) * this.length;
    this.nextPosition.y = target.y - Math.sin(this.angle) * this.length;
  }

  fallback(anchor: Point): void {
    this.position.x = anchor.x;
    this.position.y = anchor.y;
  }
}

// Data stream class representing flowing price data
class DataStream {
  anchor: Point;
  segments: SignalSegment[];
  length: number;
  opacity: number;
  targetOpacity: number;

  constructor(x: number, y: number, segmentCount: number) {
    this.anchor = { x, y };
    this.segments = [];
    this.length = segmentCount;
    this.opacity = 0;
    this.targetOpacity = 0.6;

    for (let i = 0; i < segmentCount; i++) {
      this.segments.push(new SignalSegment(x, y));
    }
  }

  update(target: Point, deltaTime: number): void {
    // Smooth opacity transition
    this.opacity +=
      (this.targetOpacity - this.opacity) * Math.min(1, deltaTime * 2);

    // Update segments in reverse order
    this.segments[0].update(target);

    for (let i = 1; i < this.segments.length; i++) {
      this.segments[i].update(this.segments[i - 1].position);
    }

    // Fallback to anchor
    this.segments[this.segments.length - 1].fallback(this.anchor);
  }

  draw(
    context: CanvasRenderingContext2D,
    palette: (typeof CANVAS_THEME)["light"]
  ): void {
    if (this.opacity < 0.01) return;

    context.globalAlpha = this.opacity;
    context.strokeStyle = palette.skyBlue;
    context.lineWidth = 1.5;
    context.lineCap = "round";
    context.lineJoin = "round";

    context.beginPath();
    context.moveTo(this.segments[0].position.x, this.segments[0].position.y);

    for (let i = 1; i < this.segments.length; i++) {
      context.lineTo(this.segments[i].position.x, this.segments[i].position.y);
    }

    context.stroke();

    // Draw end point with gradient effect
    const lastSegment = this.segments[this.segments.length - 1];
    context.globalAlpha = this.opacity * 0.5;
    context.fillStyle = palette.orangeLight;
    context.beginPath();
    context.arc(
      lastSegment.position.x,
      lastSegment.position.y,
      2,
      0,
      Math.PI * 2
    );
    context.fill();

    context.globalAlpha = 1;
  }
}

export function PriceSignalCanvas({
  phase,
  targetPoint,
  reducedMotion,
}: PriceSignalCanvasProps) {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>(0);
  const streamsRef = useRef<DataStream[]>([]);
  const currentTargetRef = useRef<Point>({
    x: targetPoint.x,
    y: targetPoint.y,
  });
  const previousTimeRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(true);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const phaseRef = useRef(phase);
  const targetPointRef = useRef(targetPoint);
  const paletteRef = useRef(CANVAS_THEME[theme]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    targetPointRef.current = targetPoint;
  }, [targetPoint]);

  useEffect(() => {
    paletteRef.current = CANVAS_THEME[theme];
  }, [theme]);

  // Initialize canvas and streams
  useEffect(() => {
    if (reducedMotion) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    isRunningRef.current = true;
    previousTimeRef.current = performance.now();

    // Detect device pixel ratio for high-DPI displays
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Resize canvas to match container
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // Initialize streams based on viewport size
    const initializeStreams = () => {
      const isMobile = window.innerWidth < 768;
      const streamCount = isMobile ? 25 : 60;
      const segmentCount = isMobile ? 7 : 10;

      streamsRef.current = [];

      const rect = container.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const radius = Math.min(rect.width, rect.height) * 0.3;

      for (let i = 0; i < streamCount; i++) {
        const angle = (i / streamCount) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        streamsRef.current.push(new DataStream(x, y, segmentCount));
      }
    };

    resizeCanvas();
    initializeStreams();

    // ResizeObserver to handle container resize
    resizeObserverRef.current = new ResizeObserver(() => {
      resizeCanvas();
      initializeStreams();
    });

    resizeObserverRef.current.observe(container);

    // Main animation loop
    const animate = (currentTime: number) => {
      if (!isRunningRef.current) return;

      const deltaTime = Math.max(
        0,
        Math.min((currentTime - previousTimeRef.current) / 1000, 0.033)
      );
      previousTimeRef.current = currentTime;

      // Update target position with smooth interpolation
      const desiredTarget = targetPointRef.current;

      currentTargetRef.current.x +=
        (desiredTarget.x - currentTargetRef.current.x) *
        Math.min(1, deltaTime * 6);
      currentTargetRef.current.y +=
        (desiredTarget.y - currentTargetRef.current.y) *
        Math.min(1, deltaTime * 6);

      // Update streams based on phase
      streamsRef.current.forEach(stream => {
        if (phaseRef.current === "ENTER") {
          stream.targetOpacity = 0.3;
        } else if (
          phaseRef.current === "DRAWING_GRAPH" ||
          phaseRef.current === "SCANNING"
        ) {
          stream.targetOpacity = 0.5;
        } else if (phaseRef.current === "FOUND_SIGNAL") {
          stream.targetOpacity = 0.7;
        } else if (phaseRef.current === "COMPLETED") {
          stream.targetOpacity = 0.3;
        } else if (phaseRef.current === "EXITING") {
          stream.targetOpacity = 0;
        }

        stream.update(currentTargetRef.current, deltaTime);
      });

      // Render
      context.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      streamsRef.current.forEach(stream => {
        stream.draw(context, paletteRef.current);
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      isRunningRef.current = false;
      cancelAnimationFrame(animationFrameRef.current);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [reducedMotion]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ opacity: 0.35, display: "block" }}
      />
    </div>
  );
}
