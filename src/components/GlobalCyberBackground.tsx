import React, { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

export const GlobalCyberBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const location = useLocation();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Subtle drifting background nodes
    const nodeCount = 45;
    const nodes: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      baseAlpha: number;
    }> = [];

    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        radius: Math.random() * 1.5 + 0.5,
        baseAlpha: Math.random() * 0.25 + 0.1,
      });
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Dynamic accent based on route
    const getRouteAccent = (path: string) => {
      if (path.includes("incidents")) return { r: 255, g: 100, b: 124 }; // #FF647C Critical Red
      if (path.includes("behavior") || path.includes("analytics")) return { r: 169, g: 155, b: 255 }; // #A99BFF AI Violet
      if (path.includes("propagation")) return { r: 244, g: 189, b: 98 }; // #F4BD62 Amber
      if (path.includes("network")) return { r: 91, g: 140, b: 255 }; // #5B8CFF Electric Blue
      return { r: 85, g: 221, b: 224 }; // #55DDE0 Precision Cyan
    };

    let time = 0;
    const render = () => {
      time += 0.005;
      const accent = getRouteAccent(location.pathname);

      ctx.clearRect(0, 0, width, height);

      // 1. Deep Atmospheric Gradient
      const baseGrad = ctx.createRadialGradient(
        width * 0.5, height * 0.1, 50,
        width * 0.5, height * 0.6, Math.max(width, height)
      );
      baseGrad.addColorStop(0, `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.04)`);
      baseGrad.addColorStop(0.5, "rgba(8, 13, 24, 0.6)");
      baseGrad.addColorStop(1, "rgba(5, 8, 16, 0.95)");
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Perspective Technical Grid Plane at bottom
      const gridY = height * 0.85;
      ctx.strokeStyle = "rgba(39, 54, 75, 0.12)";
      ctx.lineWidth = 1;

      // Horizontal receding lines
      for (let i = 0; i < 6; i++) {
        const y = gridY + Math.pow(i / 5, 2) * (height - gridY);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 3. Floating Drifting Network Nodes & Trace Connectors
      for (let i = 0; i < nodeCount; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;

        if (n.x < 0) n.x = width;
        if (n.x > width) n.x = 0;
        if (n.y < 0) n.y = height;
        if (n.y > height) n.y = 0;

        ctx.fillStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${n.baseAlpha})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();

        // Connect nearby nodes
        for (let j = i + 1; j < nodeCount; j++) {
          const n2 = nodes[j];
          const dx = n.x - n2.x;
          const dy = n.y - n2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            const alpha = (1 - dist / 110) * 0.08;
            ctx.strokeStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.stroke();
          }
        }
      }

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [location.pathname]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-80 transition-opacity duration-1000"
      aria-hidden="true"
    />
  );
};
