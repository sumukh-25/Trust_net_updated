import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NetworkGraph } from "@/components/NetworkGraph";
import { NetworkNode, NetworkEdge } from "@/data/mockData";

// Mock useSecurity to return clean context defaults
vi.mock("@/store/securityStore", () => ({
  useSecurity: () => ({
    nodes: [],
    edges: [],
    isAttackSimulated: false,
    systemRiskScore: 25,
  }),
}));

describe("NetworkGraph Component Regression & Safety Tests", () => {
  it("renders backend 'service' node without crashing (regression test for undefined .fill)", () => {
    const nodes: NetworkNode[] = [
      {
        id: "asset:file-export-log",
        label: "File Export Log",
        type: "service", // This was the backend asset_type that previously caused undefined .fill
        x: 695,
        y: 200,
        compromised: false,
        propagationRisk: 40,
      },
    ];

    const { container } = render(<NetworkGraph graphNodes={nodes} graphEdges={[]} />);

    expect(screen.getByText("File Export Log")).toBeInTheDocument();
    // Circle should have rendered with fill attribute, not thrown
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBeGreaterThan(0);
  });

  it("handles nodes with unknown types, missing types, and missing optional fields", () => {
    const malformedNodes: any[] = [
      {
        id: "node-unknown-type",
        label: "Unknown Hardware Asset",
        type: "quantum_accelerator", // Unrecognized type
        x: 100,
        y: 100,
      },
      {
        id: "node-missing-type",
        label: "Untyped Entity",
        // type omitted entirely
        x: 200,
        y: 200,
        propagationRisk: undefined,
        compromised: undefined,
      },
      {
        id: "node-missing-coords-and-label",
        // x, y, label omitted
        type: "device",
      },
    ];

    expect(() => {
      render(<NetworkGraph graphNodes={malformedNodes} graphEdges={[]} />);
    }).not.toThrow();

    expect(screen.getByText("Unknown Hardware Asset")).toBeInTheDocument();
    expect(screen.getByText("Untyped Entity")).toBeInTheDocument();
    // Fallback to id when label is missing
    expect(screen.getByText("node-missing-coords-and-label")).toBeInTheDocument();
  });

  it("handles invalid edges with missing node references gracefully", () => {
    const validNodes: NetworkNode[] = [
      {
        id: "user:1",
        label: "Analyst",
        type: "user",
        x: 50,
        y: 50,
        compromised: false,
        propagationRisk: 10,
      },
    ];

    const brokenEdges: NetworkEdge[] = [
      { from: "user:1", to: "non-existent-node", active: true, attackPath: false },
      { from: "ghost-1", to: "ghost-2", active: true, attackPath: true },
    ];

    expect(() => {
      render(<NetworkGraph graphNodes={validNodes} graphEdges={brokenEdges} />);
    }).not.toThrow();
  });
});
