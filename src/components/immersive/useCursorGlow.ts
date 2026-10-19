/**
 * useCursorGlow — Phase 0
 *
 * Attaches a global custom cursor:
 *  • Small cyan reticle element that lags slightly behind the real cursor
 *  • Expands (via CSS class) when hovering interactive elements
 *  • Leaves a short fading trail rendered on a 2D canvas overlay
 *  • pointer-events: none so it never blocks clicks
 *
 * Usage: call once in Layout or App root.
 * Returns nothing; manages its own DOM elements.
 */
import { useEffect } from "react";

const TRAIL_LENGTH = 18;
const TRAIL_FADE_PER_FRAME = 0.075;

interface TrailPoint { x: number; y: number; alpha: number; }

export function useCursorGlow() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Don't show custom cursor on touch devices
    if (window.matchMedia("(hover: none)").matches) return;

    /* ── Reticle element ── */
    const reticle = document.createElement("div");
    reticle.id = "tn-cursor-reticle";
    reticle.setAttribute("aria-hidden", "true");
    reticle.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 20px; height: 20px;
      border-radius: 50%;
      border: 1.5px solid rgba(34, 211, 238, 0.85);
      box-shadow: 0 0 8px rgba(34, 211, 238, 0.35), inset 0 0 4px rgba(34, 211, 238, 0.15);
      pointer-events: none;
      z-index: 99999;
      transform: translate(-50%, -50%);
      transition: width 0.18s ease, height 0.18s ease, border-color 0.18s ease, opacity 0.2s ease;
      mix-blend-mode: screen;
    `;
    document.body.appendChild(reticle);

    /* ── Dot (true cursor position) ── */
    const dot = document.createElement("div");
    dot.id = "tn-cursor-dot";
    dot.setAttribute("aria-hidden", "true");
    dot.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 4px; height: 4px;
      border-radius: 50%;
      background: rgba(34, 211, 238, 0.95);
      pointer-events: none;
      z-index: 100000;
      transform: translate(-50%, -50%);
    `;
    document.body.appendChild(dot);

    /* ── Trail canvas ── */
    const canvas = document.createElement("canvas");
    canvas.id = "tn-cursor-trail";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 99998;
      opacity: 1;
    `;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;

    /* ── State ── */
    let mouseX = -200, mouseY = -200;
    let reticleX = -200, reticleY = -200;
    let rafId = 0;
    const trail: TrailPoint[] = [];

    /* ── Hide native cursor via body style ── */
    const originalCursor = document.body.style.cursor;
    document.body.style.cursor = "none";

    /* ── Interactive elements expand reticle ── */
    const INTERACTIVE = "a, button, [role='button'], input, select, textarea, label, [tabindex]";
    let reticleExpanded = false;

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      dot.style.left = `${mouseX}px`;
      dot.style.top = `${mouseY}px`;

      const target = e.target as Element;
      const isInteractive = target?.closest(INTERACTIVE) != null;
      if (isInteractive !== reticleExpanded) {
        reticleExpanded = isInteractive;
        if (isInteractive) {
          reticle.style.width = "36px";
          reticle.style.height = "36px";
          reticle.style.borderColor = "rgba(139, 92, 246, 0.9)";
        } else {
          reticle.style.width = "20px";
          reticle.style.height = "20px";
          reticle.style.borderColor = "rgba(34, 211, 238, 0.85)";
        }
      }

      // Add trail point
      trail.push({ x: mouseX, y: mouseY, alpha: 1 });
      if (trail.length > TRAIL_LENGTH) trail.shift();
    };

    const onResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    /* ── RAF loop ── */
    const animate = () => {
      rafId = requestAnimationFrame(animate);

      // Lag reticle behind cursor
      reticleX += (mouseX - reticleX) * 0.14;
      reticleY += (mouseY - reticleY) * 0.14;
      reticle.style.left = `${reticleX}px`;
      reticle.style.top = `${reticleY}px`;

      // Draw trail on canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = trail.length - 1; i >= 0; i--) {
        const pt = trail[i];
        pt.alpha = Math.max(0, pt.alpha - TRAIL_FADE_PER_FRAME);
        const r = 2.5 * (i / trail.length);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 211, 238, ${pt.alpha * 0.4})`;
        ctx.fill();
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      document.body.style.cursor = originalCursor;
      if (document.body.contains(reticle)) document.body.removeChild(reticle);
      if (document.body.contains(dot)) document.body.removeChild(dot);
      if (document.body.contains(canvas)) document.body.removeChild(canvas);
    };
  }, []);
}
