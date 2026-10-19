import React, { useRef, useState, useCallback, type MouseEvent, type ReactNode } from 'react';

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  enableTilt?: boolean;
  maxTilt?: number;
}

export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = '',
  spotlightColor = 'rgba(96, 165, 250, 0.12)', // Subtle #60A5FA blue
  enableTilt = true,
  maxTilt = 3, // Very gentle, subtle 3D angle
  style,
  ...props
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCoords({ x, y });

    if (enableTilt && typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const tiltX = -((y - centerY) / centerY) * maxTilt;
      const tiltY = ((x - centerX) / centerX) * maxTilt;
      setTilt({ x: tiltX, y: tiltY });
    }
  }, [enableTilt, maxTilt]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-xl border border-[#29364D] bg-[#172238]/85 backdrop-blur-md shadow-lg transition-all duration-300 ${className}`}
      style={{
        ...style,
        transform: isHovered && enableTilt ? `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(-2px)` : 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)',
        transition: isHovered ? 'transform 0.1s ease-out, box-shadow 0.3s ease, border-color 0.3s ease' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease, border-color 0.3s ease',
        boxShadow: isHovered
          ? '0 16px 36px -10px rgba(0, 0, 0, 0.6), 0 0 24px -6px rgba(96, 165, 250, 0.08)'
          : '0 8px 24px -6px rgba(0, 0, 0, 0.4)',
      }}
      {...props}
    >
      {/* 21st.dev Cursor-responsive Spotlight Gradient */}
      <div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(450px circle at ${coords.x}px ${coords.y}px, ${spotlightColor}, transparent 70%)`,
        }}
      />

      {/* Subtle border highlight following cursor */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          border: '1px solid rgba(96, 165, 250, 0.25)',
          maskImage: `radial-gradient(280px circle at ${coords.x}px ${coords.y}px, black 30%, transparent 80%)`,
          WebkitMaskImage: `radial-gradient(280px circle at ${coords.x}px ${coords.y}px, black 30%, transparent 80%)`,
        }}
      />

      <div className="relative z-10">{children}</div>
    </div>
  );
};
