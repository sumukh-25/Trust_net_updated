import { useState } from 'react';
import { useSecurity } from '@/store/securityStore';
import { NetworkNode, NetworkEdge } from '@/data/mockData';

const NODE_ICONS: Record<string, string> = {
  user: '👤',
  app: '🌐',
  device: '💻',
  database: '🗄️',
  server: '🖥️',
  service: '⚙️',
  asset: '🛡️',
  network: '🔀',
};

const DEFAULT_NODE_ICON = '📦';

const NODE_COLORS: Record<string, { fill: string; stroke: string }> = {
  user: { fill: 'hsl(350 100% 59% / 0.15)', stroke: 'hsl(350 100% 59%)' },
  app: { fill: 'hsl(260 80% 60% / 0.15)', stroke: 'hsl(260 80% 60%)' },
  device: { fill: 'hsl(38 95% 55% / 0.15)', stroke: 'hsl(38 95% 55%)' },
  database: { fill: 'hsl(142 70% 45% / 0.15)', stroke: 'hsl(142 70% 45%)' },
  server: { fill: 'hsl(20 95% 55% / 0.15)', stroke: 'hsl(20 95% 55%)' },
  service: { fill: 'hsl(180 80% 50% / 0.15)', stroke: 'hsl(180 80% 50%)' },
  asset: { fill: 'hsl(210 80% 60% / 0.15)', stroke: 'hsl(210 80% 60%)' },
  network: { fill: 'hsl(280 80% 60% / 0.15)', stroke: 'hsl(280 80% 60%)' },
};

const DEFAULT_NODE_COLOR: { fill: string; stroke: string } = {
  fill: 'hsl(215 20% 50% / 0.15)',
  stroke: 'hsl(215 20% 65%)',
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
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const getNodeById = (id: string) => nodes.find(n => n.id === id);
  const activeInspectorNode = getNodeById(selectedNode ?? hoveredNode ?? '');

  return (
    <div className="relative w-full overflow-hidden rounded-lg group">
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
          if (
            !from || !to ||
            typeof from.x !== 'number' || typeof from.y !== 'number' ||
            typeof to.x !== 'number' || typeof to.y !== 'number' ||
            Number.isNaN(from.x) || Number.isNaN(from.y) ||
            Number.isNaN(to.x) || Number.isNaN(to.y)
          ) {
            return null;
          }

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
          const normalizedType = String(node.type || '').toLowerCase();
          const typeColors = NODE_COLORS[normalizedType] ?? DEFAULT_NODE_COLOR;
          const colors = node.compromised ? COMPROMISED : typeColors;
          const isHovered = hoveredNode === node.id;
          const r = 28;

          const propagationRisk = typeof node.propagationRisk === 'number' && !Number.isNaN(node.propagationRisk)
            ? Math.max(0, Math.min(100, node.propagationRisk))
            : 0;
          const nodeX = typeof node.x === 'number' && !Number.isNaN(node.x) ? node.x : 0;
          const nodeY = typeof node.y === 'number' && !Number.isNaN(node.y) ? node.y : 0;
          const nodeIcon = NODE_ICONS[normalizedType] ?? DEFAULT_NODE_ICON;
          const nodeLabel = node.label || node.id || 'Node';

          return (
            <g
              key={node.id}
              transform={`translate(${nodeX}, ${nodeY})`}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => setSelectedNode(node.id === selectedNode ? null : node.id)}
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
                const angle = (propagationRisk / 100) * 360;
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
                {nodeIcon}
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
                {nodeLabel}
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
                    {propagationRisk}%
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
            { color: 'hsl(180 80% 50%)', label: 'Service' },
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

      {/* 21st.dev Floating Node Inspector HUD */}
      {activeInspectorNode && (
        <div className="absolute right-3 top-3 p-3 rounded-lg border border-border/80 bg-background/90 backdrop-blur-md shadow-xl min-w-[200px] max-w-[240px] text-xs font-mono space-y-1.5 pointer-events-auto transition-all animate-in fade-in">
          <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5">
            <span className="font-bold text-foreground truncate">{activeInspectorNode.label || activeInspectorNode.id}</span>
            <span className={`badge ${activeInspectorNode.compromised ? 'badge-critical' : 'badge-ok'} text-[9px]`}>
              {activeInspectorNode.compromised ? 'COMPROMISED' : 'NOMINAL'}
            </span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Entity Type:</span>
            <span className="capitalize text-foreground font-semibold">{activeInspectorNode.type || 'Unknown'}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Propagation Risk:</span>
            <span className={(activeInspectorNode.propagationRisk ?? 0) > 60 ? 'text-destructive font-bold' : 'text-foreground'}>
              {activeInspectorNode.propagationRisk ?? 0}%
            </span>
          </div>
          <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.max(0, activeInspectorNode.propagationRisk ?? 0))}%`,
                background: (activeInspectorNode.propagationRisk ?? 0) > 60 ? 'hsl(350 100% 59%)' : (activeInspectorNode.propagationRisk ?? 0) > 30 ? 'hsl(38 95% 55%)' : 'hsl(142 70% 45%)'
              }}
            />
          </div>
          <div className="text-[10px] text-muted-foreground pt-0.5">
            {selectedNode === activeInspectorNode.id ? 'Click node again to pin off' : 'Click node to pin inspector'}
          </div>
        </div>
      )}
    </div>
  );
};
