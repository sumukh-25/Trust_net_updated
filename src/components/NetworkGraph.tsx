import React from 'react';
import { NetworkNode, NetworkEdge } from '@/data/mockData';
import { NetworkGraph3D } from './NetworkGraph3D';

interface NetworkGraphProps {
  width?: number;
  height?: number;
  graphNodes?: NetworkNode[];
  graphEdges?: NetworkEdge[];
  selectedEntityId?: string | null;
  onSelectEntity?: (nodeId: string | null) => void;
}

export const NetworkGraph: React.FC<NetworkGraphProps> = ({
  width = 800,
  height = 500,
  graphNodes,
  graphEdges,
  selectedEntityId,
  onSelectEntity,
}) => {
  return (
    <div className="relative w-full h-full">
      {/* Primary 3D WebGL Cyber Network Engine */}
      <NetworkGraph3D
        width={width}
        height={height}
        graphNodes={graphNodes}
        graphEdges={graphEdges}
        selectedEntityId={selectedEntityId}
        onSelectEntity={onSelectEntity}
      />

      {/* Headless & SVG Compatibility Bridge for DOM / Accessibility / Tests */}
      <svg
        className="sr-only"
        aria-hidden="true"
        viewBox={`0 0 ${width} ${height}`}
      >
        {(graphNodes || []).map((node) => {
          const colors = {
            fill: node.compromised ? 'rgba(255, 48, 79, 0.25)' : 'rgba(49, 230, 247, 0.15)',
            stroke: node.compromised ? '#FF304F' : '#31E6F7',
          };
          return (
            <g key={node.id}>
              <circle r={28} fill={colors.fill} stroke={colors.stroke} />
              <text>{node.label || node.id}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
