/**
 * Canvas Engine
 * Shared animation engine for loading and main screen Canvas effects
 */

export interface Point {
  x: number;
  y: number;
}

export interface CanvasConfig {
  streamCount: number;
  segmentCount: number;
  opacity: number;
  lineWidth: number;
  colors: {
    skyBlue: string;
    orange: string;
    orangeLight: string;
  };
}

export class SignalSegment {
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

export class DataStream {
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
    this.opacity += (this.targetOpacity - this.opacity) * Math.min(1, deltaTime * 2);

    this.segments[0].update(target);

    for (let i = 1; i < this.segments.length; i++) {
      this.segments[i].update(this.segments[i - 1].position);
    }

    this.segments[this.segments.length - 1].fallback(this.anchor);
  }

  draw(context: CanvasRenderingContext2D, colors: CanvasConfig["colors"]): void {
    if (this.opacity < 0.01) return;

    context.globalAlpha = this.opacity;
    context.strokeStyle = colors.skyBlue;
    context.lineWidth = 1.5;
    context.lineCap = "round";
    context.lineJoin = "round";

    context.beginPath();
    context.moveTo(this.segments[0].position.x, this.segments[0].position.y);

    for (let i = 1; i < this.segments.length; i++) {
      context.lineTo(this.segments[i].position.x, this.segments[i].position.y);
    }

    context.stroke();

    const lastSegment = this.segments[this.segments.length - 1];
    context.globalAlpha = this.opacity * 0.5;
    context.fillStyle = colors.orangeLight;
    context.beginPath();
    context.arc(lastSegment.position.x, lastSegment.position.y, 2, 0, Math.PI * 2);
    context.fill();

    context.globalAlpha = 1;
  }
}

/**
 * Get Canvas config based on device capabilities
 */
export function getCanvasConfig(isMobile: boolean): CanvasConfig {
  return {
    streamCount: isMobile ? 25 : 60,
    segmentCount: isMobile ? 7 : 10,
    opacity: 0.35,
    lineWidth: 1.5,
    colors: {
      skyBlue: "rgba(56, 189, 248, 0.30)",
      orange: "rgba(255, 138, 61, 0.85)",
      orangeLight: "rgba(255, 181, 128, 0.45)",
    },
  };
}

/**
 * Detect if animation should be disabled
 */
export function shouldDisableAnimation(): boolean {
  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const isMobile = window.innerWidth < 768;

  const lowPower =
    typeof navigator !== "undefined" &&
    navigator.hardwareConcurrency &&
    (navigator.hardwareConcurrency as number) <= 4;

  return prefersReduced || isMobile || !!lowPower;
}
