/**
 * GlassPanel — Phase 0
 *
 * Premium cybersecurity HUD panel with:
 *  • Neon corner brackets (SVG, animated on hover)
 *  • Animated border sweep (CSS gradient animation)
 *  • 3D perspective tilt on hover (framer-motion useMotionValue / useSpring)
 *  • Cursor-following radial spotlight inside the panel
 *  • Glass morphism base (backdrop-blur, semi-transparent surface)
 *  • Respects prefers-reduced-motion (no tilt/animation if true)
 */
import React, { useRef, useCallback, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  accentColor?: string;       // CSS color for neon bracket & border, e.g. "#22d3ee"
  maxTiltDeg?: number;        // Max tilt angle in degrees (default 5)
  spotlightOpacity?: number;  // 0-1, default 0.12
  cornerSize?: number;        // px length of corner bracket arms (default 16)
  noBrackets?: boolean;       // Suppress corner brackets
  noSweep?: boolean;          // Suppress border sweep animation
  style?: React.CSSProperties;
  id?: string;
  role?: string;
  "aria-label"?: string;
}

const prefersReduced =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  (
    {
      children,
      className = "",
      accentColor = "#22d3ee",
      maxTiltDeg = 5,
      spotlightOpacity = 0.12,
      cornerSize = 16,
      noBrackets = false,
      noSweep = false,
      style,
      ...rest
    },
    forwardedRef
  ) => {
    const innerRef = useRef<HTMLDivElement | null>(null);
    const spotlightX = useMotionValue(0);
    const spotlightY = useMotionValue(0);
    const isHovered = useMotionValue(0);

    // Tilt motion values
    const rawTiltX = useMotionValue(0);
    const rawTiltY = useMotionValue(0);
    const springConfig = { stiffness: 220, damping: 22, mass: 0.6 };
    const tiltX = useSpring(rawTiltX, springConfig);
    const tiltY = useSpring(rawTiltY, springConfig);
    const scale = useSpring(1, { stiffness: 260, damping: 20 });

    // Map tilt to CSS transform
    const rotateX = useTransform(tiltX, (v) => `${v}deg`);
    const rotateY = useTransform(tiltY, (v) => `${v}deg`);

    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const el = innerRef.current;
        if (!el || prefersReduced) return;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        spotlightX.set(x);
        spotlightY.set(y);
        if (!prefersReduced) {
          const cx = rect.width / 2;
          const cy = rect.height / 2;
          rawTiltX.set(-((y - cy) / cy) * maxTiltDeg);
          rawTiltY.set(((x - cx) / cx) * maxTiltDeg);
        }
      },
      [maxTiltDeg, rawTiltX, rawTiltY, spotlightX, spotlightY]
    );

    const handleMouseEnter = useCallback(() => {
      isHovered.set(1);
      scale.set(1.005);
    }, [isHovered, scale]);

    const handleMouseLeave = useCallback(() => {
      isHovered.set(0);
      rawTiltX.set(0);
      rawTiltY.set(0);
      scale.set(1);
    }, [isHovered, rawTiltX, rawTiltY, scale]);

    // Spotlight gradient string
    const spotlightBg = useTransform(
      [spotlightX, spotlightY, isHovered],
      ([x, y, hov]) =>
        (hov as number) > 0
          ? `radial-gradient(420px circle at ${x as number}px ${y as number}px, ${accentColor}${Math.round(spotlightOpacity * 255).toString(16).padStart(2, "0")}, transparent 70%)`
          : "none"
    );

    const bw = 1.5; // border bracket line width
    const cs = cornerSize;

    return (
      <motion.div
        ref={(node) => {
          innerRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX: prefersReduced ? undefined : rotateX,
          rotateY: prefersReduced ? undefined : rotateY,
          scale: prefersReduced ? undefined : scale,
          transformStyle: "preserve-3d",
          ...style,
        }}
        className={`relative overflow-hidden rounded-xl backdrop-blur-md
          bg-[#101827]/80 border border-[#28364a]
          shadow-[0_4px_32px_-8px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.04)]
          transition-border-color duration-300
          ${className}`}
        {...rest}
      >
        {/* ── Animated border sweep (CSS, only when !noSweep) ── */}
        {!noSweep && !prefersReduced && (
          <div
            aria-hidden="true"
            className="glass-panel-sweep pointer-events-none absolute inset-0 rounded-xl z-0"
            style={{ "--accent": accentColor } as React.CSSProperties}
          />
        )}

        {/* ── Cursor spotlight ── */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl z-0"
          style={{ background: spotlightBg }}
        />

        {/* ── Corner brackets ── */}
        {!noBrackets && (
          <>
            {/* TL */}
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0 z-10 glass-bracket glass-bracket-tl"
              width={cs + 4} height={cs + 4}
              style={{ "--accent": accentColor } as React.CSSProperties}
            >
              <path
                d={`M 2 ${cs + 2} L 2 2 L ${cs + 2} 2`}
                fill="none"
                stroke={accentColor}
                strokeWidth={bw}
                strokeLinecap="round"
              />
            </svg>
            {/* TR */}
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute top-0 right-0 z-10 glass-bracket glass-bracket-tr"
              width={cs + 4} height={cs + 4}
              style={{ "--accent": accentColor } as React.CSSProperties}
            >
              <path
                d={`M 2 2 L ${cs + 2} 2 L ${cs + 2} ${cs + 2}`}
                fill="none"
                stroke={accentColor}
                strokeWidth={bw}
                strokeLinecap="round"
              />
            </svg>
            {/* BL */}
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 z-10 glass-bracket glass-bracket-bl"
              width={cs + 4} height={cs + 4}
              style={{ "--accent": accentColor } as React.CSSProperties}
            >
              <path
                d={`M 2 2 L 2 ${cs + 2} L ${cs + 2} ${cs + 2}`}
                fill="none"
                stroke={accentColor}
                strokeWidth={bw}
                strokeLinecap="round"
              />
            </svg>
            {/* BR */}
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 right-0 z-10 glass-bracket glass-bracket-br"
              width={cs + 4} height={cs + 4}
              style={{ "--accent": accentColor } as React.CSSProperties}
            >
              <path
                d={`M 2 ${cs + 2} L ${cs + 2} ${cs + 2} L ${cs + 2} 2`}
                fill="none"
                stroke={accentColor}
                strokeWidth={bw}
                strokeLinecap="round"
              />
            </svg>
          </>
        )}

        {/* ── Content ── */}
        <div className="relative z-10">{children}</div>
      </motion.div>
    );
  }
);

GlassPanel.displayName = "GlassPanel";
