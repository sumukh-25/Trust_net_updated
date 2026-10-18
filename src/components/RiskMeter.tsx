import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { getThreatLevel } from '@/store/securityStore';

interface RiskMeterProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const getColor = (score: number) => {
  if (score <= 30) return { stroke: 'hsl(150 68% 51%)', glow: 'hsl(150 68% 51% / 0.4)', label: 'SAFE', text: 'hsl(150 68% 51%)' };
  if (score <= 50) return { stroke: 'hsl(142 70% 45%)', glow: 'hsl(142 70% 45% / 0.4)', label: 'LOW', text: 'hsl(142 70% 45%)' };
  if (score <= 70) return { stroke: 'hsl(38 95% 55%)', glow: 'hsl(38 95% 55% / 0.4)', label: 'MEDIUM', text: 'hsl(38 95% 55%)' };
  if (score <= 85) return { stroke: 'hsl(20 95% 55%)', glow: 'hsl(20 95% 55% / 0.4)', label: 'HIGH', text: 'hsl(20 95% 55%)' };
  return { stroke: 'hsl(350 100% 59%)', glow: 'hsl(350 100% 59% / 0.4)', label: 'CRITICAL', text: 'hsl(350 100% 59%)' };
};

export const RiskMeter = ({ score, size = 'md', showLabel = true }: RiskMeterProps) => {
  const dimensions = { sm: 100, md: 160, lg: 220 };
  const dim = dimensions[size];
  const r = (dim / 2) - 16;
  const cx = dim / 2;
  const cy = dim / 2;

  // Arc: 210 degrees sweep (from 195deg to 345deg)
  const startAngle = 195;
  const endAngle = 345;
  const totalAngle = 360 - startAngle + endAngle; // = 150 — actually we use 210 total
  const sweepAngle = 210; // degrees

  const polarToXY = (angle: number, radius: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const describeArc = (start: number, end: number, radius: number) => {
    const s = polarToXY(start, radius);
    const e = polarToXY(end, radius);
    const largeArc = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  const fillAngle = startAngle + (score / 100) * sweepAngle;
  const color = getColor(score);

  const strokeWidth = size === 'sm' ? 6 : size === 'md' ? 10 : 14;
  const fontSize = size === 'sm' ? '16' : size === 'md' ? '32' : '48';
  const subFontSize = size === 'sm' ? '8' : size === 'md' ? '10' : '14';

  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width={dim} height={dim * 0.75} viewBox={`0 0 ${dim} ${dim * 0.85}`}>
        <defs>
          <filter id={`glow-${score}`}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track */}
        <path
          d={describeArc(startAngle, startAngle + sweepAngle, r)}
          fill="none"
          stroke="hsl(220 25% 15%)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((tick) => {
          const angle = startAngle + (tick / 100) * sweepAngle;
          const inner = polarToXY(angle, r - strokeWidth / 2 - 2);
          const outer = polarToXY(angle, r + strokeWidth / 2 + 2);
          return (
            <line
              key={tick}
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke="hsl(220 25% 20%)"
              strokeWidth="2"
            />
          );
        })}

        {/* Fill arc */}
        <motion.path
          d={describeArc(startAngle, fillAngle, r)}
          fill="none"
          stroke={color.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          filter={`url(#glow-${score})`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: score / 100 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />

        {/* Needle dot */}
        {(() => {
          const pt = polarToXY(fillAngle, r);
          return (
            <motion.circle
              cx={pt.x} cy={pt.y} r={strokeWidth / 2 + 2}
              fill={color.stroke}
              filter={`url(#glow-${score})`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.8 }}
            />
          );
        })()}

        {/* Center score */}
        <text
          x={cx} y={cy + 10}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight="bold"
          fontFamily="JetBrains Mono, monospace"
          fill={color.text}
        >
          {score}
        </text>

        {showLabel && (
          <text
            x={cx} y={cy + 28}
            textAnchor="middle"
            fontSize={subFontSize}
            fontFamily="JetBrains Mono, monospace"
            fill={color.text}
            opacity={0.7}
          >
            {color.label}
          </text>
        )}
      </svg>
    </div>
  );
};
