/**
 * DotGridBackground — STEP 0/1 calm base layer
 *
 * Replaces the previous Three.js CyberBackground.
 * Renders:
 *  - Deep charcoal-navy → slightly lighter gradient
 *  - Two very soft, slowly-drifting radial blobs (pure CSS, no JS)
 *  - A faint dot-grid SVG pattern
 * No particles, no stars, no matrix rain.
 * Pointer-events: none — fully non-interactive.
 */
export function DotGridBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none"
      style={{ background: '#070b12' }}
    >
      {/* Slow-drifting ambient blobs */}
      <div
        style={{
          position: 'absolute',
          top: '-20%',
          left: '-10%',
          width: '70vw',
          height: '70vw',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(56,189,248,0.055) 0%, transparent 65%)',
          animation: 'blob-drift-a 28s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-15%',
          right: '-5%',
          width: '55vw',
          height: '55vw',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(167,139,250,0.045) 0%, transparent 65%)',
          animation: 'blob-drift-b 34s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />

      {/* Dot grid */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      >
        <defs>
          <pattern
            id="tng-dot-grid"
            x="0"
            y="0"
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="0.75" fill="rgba(255,255,255,0.055)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#tng-dot-grid)" />
      </svg>

      {/* Keyframes injected inline (no extra CSS file dependency) */}
      <style>{`
        @keyframes blob-drift-a {
          0%   { transform: translate(0,0) scale(1); }
          100% { transform: translate(6vw, 8vh) scale(1.12); }
        }
        @keyframes blob-drift-b {
          0%   { transform: translate(0,0) scale(1); }
          100% { transform: translate(-5vw, -6vh) scale(1.08); }
        }
        @media (prefers-reduced-motion: reduce) {
          .blob-drift-a, .blob-drift-b { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
