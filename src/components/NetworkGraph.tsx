import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useSecurity } from '@/store/securityStore';
import { NetworkNode, NetworkEdge } from '@/data/mockData';

const NODE_ICONS: Record<string, string> = {
  user: '👤',
  app: '🌐',
  device: '💻',
  database: '🗄️',
  server: '🖥️',
};

const NODE_COLORS: Record<string, { fill: string; stroke: string }> = {
  user: { fill: 'hsl(350 100% 59% / 0.15)', stroke: 'hsl(350 100% 59%)' },
  app: { fill: 'hsl(260 80% 60% / 0.15)', stroke: 'hsl(260 80% 60%)' },
  device: { fill: 'hsl(38 95% 55% / 0.15)', stroke: 'hsl(38 95% 55%)' },
  database: { fill: 'hsl(142 70% 45% / 0.15)', stroke: 'hsl(142 70% 45%)' },
  server: { fill: 'hsl(20 95% 55% / 0.15)', stroke: 'hsl(20 95% 55%)' },
};

const COMPROMISED: { fill: string; stroke: string } = {
  fill: 'hsl(350 100% 59% / 0.25)',
  stroke: 'hsl(350 100% 59%)',
};

interface NetworkGraphProps {
  width?: number;
  height?: number;
  graphNodes?: NetworkNode[];
  graphEdges?: NetworkEdge[];
}

export const NetworkGraph = ({ width = 800, height = 500, graphNodes, graphEdges }: NetworkGraphProps) => {
  const { nodes: contextNodes, edges: contextEdges, isAttackSimulated } = useSecurity();
  const nodes = graphNodes ?? contextNodes;
  const edges = graphEdges ?? contextEdges;
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const getNodeById = (id: string) => nodes.find(n => n.id === id);

  return (
    <div className="relative w-full overflow-hidden rounded-lg">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        style={{ background: 'transparent' }}
      >
        <defs>
          {/* Glow filters */}
          <filter id="glow-cyan">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-red">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-amber">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Attack path gradient */}
          <linearGradient id="attackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(350, 100%, 59%)" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(38, 95%, 55%)" stopOpacity="0.6" />
          </linearGradient>
        </defs>

        {/* Grid pattern */}
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(350 100% 59% / 0.05)" strokeWidth="1" />
        </pattern>
        <rect width={width} height={height} fill="url(#grid)" />

        {/* Edges */}
        {edges.map((edge, i) => {
          const from = getNodeById(edge.from);
          const to = getNodeById(edge.to);
          if (!from || !to) return null;

          return (
            <g key={i}>
              {/* Base edge */}
              <line
                x1={from.x} y1={from.y}
                x2={to.x} y2={to.y}
                stroke={edge.attackPath ? 'url(#attackGrad)' : 'hsl(220 25% 20%)'}
                strokeWidth={edge.attackPath ? 3 : 1.5}
                strokeDasharray={edge.attackPath ? undefined : '5,5'}
                opacity={edge.attackPath ? 1 : 0.5}
                filter={edge.attackPath ? 'url(#glow-red)' : undefined}
              />

              {/* Attack animation line */}
              {edge.attackPath && isAttackSimulated && (
                <line
                  x1={from.x} y1={from.y}
                  x2={to.x} y2={to.y}
                  stroke="hsl(350 100% 59%)"
                  strokeWidth={3}
                  strokeDasharray="200"
                  className="animate-attack-path"
                  opacity={0.9}
                />
              )}

              {/* Flow dots on active edges */}
              {!edge.attackPath && (
                <circle r="2" fill="hsl(350 100% 59% / 0.5)">
                  <animateMotion
                    dur={`${2 + i * 0.3}s`}
                    repeatCount="indefinite"
                    path={`M${from.x},${from.y} L${to.x},${to.y}`}
                  />
                </circle>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const colors = node.compromised ? COMPROMISED : NODE_COLORS[node.type];
          const isHovered = hoveredNode === node.id;
          const r = 28;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              {/* Pulse ring for compromised */}
              {node.compromised && (
                <>
                  <circle
                    r={r + 12}
                    fill="none"
                    stroke="hsl(350 100% 59%)"
                    strokeWidth="1"
                    opacity="0.3"
                    filter="url(#glow-red)"
                  >
                    <animate attributeName="r" values={`${r + 8};${r + 20};${r + 8}`} dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0;0.5" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                  <circle
                    r={r + 6}
                    fill="none"
                    stroke="hsl(350 100% 59%)"
                    strokeWidth="1.5"
                    opacity="0.5"
                    filter="url(#glow-red)"
                  >
                    <animate attributeName="r" values={`${r + 4};${r + 14};${r + 4}`} dur="1.5s" repeatCount="indefinite" begin="0.3s" />
                    <animate attributeName="opacity" values="0.6;0;0.6" dur="1.5s" repeatCount="indefinite" begin="0.3s" />
                  </circle>
                </>
              )}

              {/* Node background */}
              <circle
                r={r}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={node.compromised ? 2.5 : 1.5}
                filter={node.compromised ? 'url(#glow-red)' : isHovered ? 'url(#glow-cyan)' : undefined}
                style={{ transition: 'all 0.3s' }}
              />

              {/* Propagation risk arc */}
              {(() => {
                const rArc = r + 4;
                const angle = (node.propagationRisk / 100) * 360;
                const rad = ((angle - 90) * Math.PI) / 180;
                const x = rArc * Math.cos(rad);
                const y = rArc * Math.sin(rad);
                const largeArc = angle > 180 ? 1 : 0;
                return (
                  <path
                    d={`M 0 ${-rArc} A ${rArc} ${rArc} 0 ${largeArc} 1 ${x} ${y}`}
                    fill="none"
                    stroke={node.compromised ? 'hsl(350 100% 59%)' : colors.stroke}
                    strokeWidth="2"
                    opacity="0.5"
                    strokeDasharray="3,3"
                  />
                );
              })()}

              {/* Icon */}
              <text textAnchor="middle" dominantBaseline="middle" fontSize="16">
                {NODE_ICONS[node.type]}
              </text>

              {/* Label */}
              <text
                textAnchor="middle"
                y={r + 14}
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fill={node.compromised ? 'hsl(350 100% 59%)' : 'hsl(210 40% 70%)'}
                fontWeight={node.compromised ? 'bold' : 'normal'}
              >
                {node.label}
              </text>

              {/* Risk % badge */}
              {(isHovered || node.compromised) && (
                <g transform={`translate(${r - 4}, ${-r + 4})`}>
                  <circle r="10" fill="hsl(350 100% 59%)" />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="7"
                    fontFamily="JetBrains Mono, monospace"
                    fill="hsl(222 35% 5%)"
                    fontWeight="bold"
                  >
                    {node.propagationRisk}%
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Legend */}
        <g transform="translate(10, 10)">
          {[
            { color: 'hsl(350 100% 59%)', label: 'User' },
            { color: 'hsl(260 80% 60%)', label: 'App' },
            { color: 'hsl(38 95% 55%)', label: 'Device' },
            { color: 'hsl(142 70% 45%)', label: 'Database' },
            { color: 'hsl(20 95% 55%)', label: 'Server' },
            { color: 'hsl(350 100% 59%)', label: 'Compromised' },
          ].map((item, i) => (
            <g key={i} transform={`translate(0, ${i * 18})`}>
              <circle cx="6" cy="6" r="5" fill={item.color} opacity="0.8" />
              <text x="16" y="10" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="hsl(215 20% 50%)">
                {item.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};
