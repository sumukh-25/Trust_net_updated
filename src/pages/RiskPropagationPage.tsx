import { useEffect, useState } from "react";
import {
  GitBranch,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Zap,
  Activity,
  Layers,
  Crosshair,
  Lock,
  Database,
  User,
  Laptop,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { NetworkGraph } from "@/components/NetworkGraph";
import PageTransition from "@/components/PageTransition";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { mlBackendService, type PropagationAnalysisResult } from "@/services/mlBackendService";
import { useSecurity } from "@/store/securityStore";

type SimulationMode = "live" | "whatif";

export default function RiskPropagationPage() {
  const [mode, setMode] = useState<SimulationMode>("live");
  const [whatIfAnalysis, setWhatIfAnalysis] = useState<PropagationAnalysisResult | null>(null);
  const [selectedPathNodeId, setSelectedPathNodeId] = useState<string | null>(null);

  const {
    nodes,
    edges,
    systemRiskScore,
    isAttackSimulated,
    attackChainRunning,
    liveThreatPhase,
    simulateAttack,
    resetSimulation,
    isSimulating,
  } = useSecurity();

  const whatIf = mode === "whatif";
  const highestRiskUser = nodes
    .filter((node) => node.type === "user")
    .sort((left, right) => right.propagationRisk - left.propagationRisk)[0];

  const isolateUserId = highestRiskUser?.propagationRisk ? highestRiskUser.id : null;
  const isolatedEdges = whatIf && isolateUserId
    ? edges
        .filter((edge) => edge.from !== isolateUserId && edge.to !== isolateUserId)
        .map((edge) => ({ ...edge, attackPath: false }))
    : edges;

  useEffect(() => {
    if (!whatIf || !isolateUserId) {
      setWhatIfAnalysis(null);
      return;
    }
    let cancelled = false;
    const analysisEdges = edges
      .filter((edge) => edge.from !== isolateUserId && edge.to !== isolateUserId)
      .map((edge) => ({ ...edge, attackPath: false }));

    void mlBackendService
      .analyzePropagation(nodes, analysisEdges)
      .then((result) => {
        if (!cancelled) setWhatIfAnalysis(result);
      })
      .catch(() => {
        if (!cancelled) setWhatIfAnalysis(null);
      });

    return () => {
      cancelled = true;
    };
  }, [edges, isolateUserId, nodes, whatIf]);

  const analysisByNode = new Map((whatIfAnalysis?.all_nodes ?? []).map((node) => [node.node_id, node]));

  const displayNodes = whatIf && whatIfAnalysis
    ? nodes.map((node) => {
        const analysis = analysisByNode.get(node.id);
        const criticality = String(analysis?.criticality ?? "").toLowerCase();
        return analysis
          ? {
              ...node,
              propagationRisk: analysis.propagation_risk,
              compromised: criticality === "critical" || criticality === "high",
            }
          : node;
      })
    : nodes;

  const compromisedNodes = displayNodes.filter((node) => node.compromised);
  const attackPathEdges = (whatIf ? isolatedEdges : edges).filter((edge) => edge.attackPath);

  const attackPathLabels = attackPathEdges.map((edge) => {
    const from = displayNodes.find((node) => node.id === edge.from)?.label ?? edge.from;
    const to = displayNodes.find((node) => node.id === edge.to)?.label ?? edge.to;
    return `${from} → ${to}`;
  });

  const liveScore = Math.round(Math.max(systemRiskScore, ...nodes.map((node) => node.propagationRisk), 0));
  const propagationScore = whatIf
    ? whatIfAnalysis ? Math.round(whatIfAnalysis.total_network_risk) : liveScore
    : liveScore;

  const scoreColor = propagationScore >= 70 ? "#FF304F" : propagationScore >= 40 ? "#FFBD59" : "#46E6A5";

  // Shortest Path to Crown Jewel Asset
  const sourceUser = nodes
    .filter((node) => node.type === "user")
    .sort((left, right) => right.propagationRisk - left.propagationRisk)[0];

  const targetAsset = nodes
    .filter((node) => node.id.startsWith("asset:") || node.type === "database")
    .sort((left, right) => right.propagationRisk - left.propagationRisk || left.label.localeCompare(right.label))[0];

  const shortestPath: typeof nodes = [];
  if (sourceUser && targetAsset) {
    const pending: Array<{ nodeId: string; path: typeof nodes }> = [{ nodeId: sourceUser.id, path: [sourceUser] }];
    const visited = new Set<string>();
    while (pending.length && !shortestPath.length) {
      const current = pending.shift()!;
      if (visited.has(current.nodeId)) continue;
      visited.add(current.nodeId);
      if (current.nodeId === targetAsset.id) {
        shortestPath.push(...current.path);
        break;
      }
      for (const edge of edges) {
        if (edge.active && edge.from === current.nodeId && !visited.has(edge.to)) {
          const next = nodes.find((node) => node.id === edge.to);
          if (next) pending.push({ nodeId: next.id, path: [...current.path, next] });
        }
      }
    }
  }

  return (
    <PageTransition>
      <Layout>
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1750px] mx-auto bg-[#050810] min-h-screen">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#27364B] pb-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#FFBD59]/10 border border-[#FFBD59]/30 flex items-center justify-center text-[#FFBD59] shadow-sm shadow-[#FFBD59]/10">
                  <GitBranch className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F0F5FC] flex items-center gap-2">
                    Risk Propagation Analysis
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded border border-[#FFBD59]/30 bg-[#FFBD59]/10 text-[#FFBD59]">
                      CASCADE MODEL
                    </span>
                  </h1>
                  <p className="text-xs text-[#A3B3C9]">
                    Simulate lateral movement attack vectors toward high-value crown jewel databases
                  </p>
                </div>
              </div>
            </div>

            {/* Mode Switcher Buttons */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-xl border border-[#27364B] bg-[#0E1726]/90 backdrop-blur-md shadow-lg text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setMode("live")}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all ${
                    !whatIf
                      ? "bg-[#31E6F7]/20 text-[#31E6F7] font-bold border border-[#31E6F7]/40 shadow-sm"
                      : "text-[#A3B3C9] hover:text-[#F0F5FC] hover:bg-[#131F31]"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${!whatIf ? "bg-[#31E6F7] animate-pulse" : "bg-[#A3B3C9]"}`} />
                  Live Topology
                </button>
                <button
                  type="button"
                  onClick={() => setMode("whatif")}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                    whatIf
                      ? "bg-[#FFBD59]/20 text-[#FFBD59] font-bold border border-[#FFBD59]/40 shadow-sm"
                      : "text-[#A3B3C9] hover:text-[#F0F5FC] hover:bg-[#131F31]"
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-[#FFBD59]" />
                  What-If Isolation
                </button>
              </div>

              {/* Threat simulation shortcut */}
              <button
                type="button"
                onClick={isAttackSimulated ? resetSimulation : simulateAttack}
                disabled={isSimulating}
                className="px-3 py-1.5 rounded-lg border font-mono text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md"
                style={
                  isAttackSimulated
                    ? { background: "rgba(70, 230, 165, 0.15)", borderColor: "rgba(70, 230, 165, 0.4)", color: "#46E6A5" }
                    : { background: "rgba(255, 48, 79, 0.15)", borderColor: "rgba(255, 48, 79, 0.4)", color: "#FF304F" }
                }
              >
                <Zap className={`w-3.5 h-3.5 ${isSimulating ? "animate-spin" : ""}`} />
                {isSimulating ? "SIMULATING…" : isAttackSimulated ? "RESET ATTACK" : "SIMULATE SPREAD"}
              </button>
            </div>
          </div>

          {/* Main Grid: 8 Cols 3D Stage + 4 Cols Propagation Dossier */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 3D Risk Propagation Centerpiece (8 Cols) */}
            <section className="lg:col-span-8 rounded-2xl border border-[#27364B] bg-[#0E1726]/90 backdrop-blur-md p-5 shadow-2xl relative flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3.5 border-b border-[#27364B]">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#31E6F7]" />
                    <span className="font-bold text-sm text-[#F0F5FC]">
                      {whatIf ? "Isolated Lateral Attack Graph" : "Active Attack Cascade Graph"}
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      isAttackSimulated
                        ? "bg-[#FF304F]/15 text-[#FF304F] border-[#FF304F]/40 animate-pulse"
                        : whatIf
                        ? "bg-[#FFBD59]/15 text-[#FFBD59] border-[#FFBD59]/40"
                        : "bg-[#46E6A5]/15 text-[#46E6A5] border-[#46E6A5]/40"
                    }`}
                  >
                    {isAttackSimulated
                      ? `${compromisedNodes.length} COMPROMISED ASSETS`
                      : whatIf
                      ? `ISOLATION SCENARIO (${highestRiskUser?.label || "User"})`
                      : "SURVEILLANCE NOMINAL"}
                  </span>
                </div>

                <div className="my-3 rounded-xl overflow-hidden min-h-[500px]">
                  <NetworkGraph
                    width={900}
                    height={500}
                    graphNodes={displayNodes}
                    graphEdges={whatIf ? isolatedEdges : edges}
                    selectedEntityId={selectedPathNodeId}
                    onSelectEntity={setSelectedPathNodeId}
                  />
                </div>
              </div>

              {/* Compromised Nodes Alert Drawer */}
              {isAttackSimulated && compromisedNodes.length > 0 && (
                <div className="p-3.5 rounded-xl border border-[#FF304F]/40 bg-[#FF304F]/10 space-y-2 mt-2">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-[#FF304F]">
                    <span className="flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4" /> COMPROMISED ATTACK CHAIN IN PROGRESS
                    </span>
                    {attackChainRunning && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#FF304F]/20 border border-[#FF304F]/40">
                        {liveThreatPhase.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-mono">
                    {compromisedNodes.map((n) => (
                      <span
                        key={n.id}
                        onClick={() => setSelectedPathNodeId(n.id)}
                        className="px-2.5 py-1 rounded-md bg-[#0E1726] border border-[#FF304F]/40 text-[#F0F5FC] hover:border-[#31E6F7] cursor-pointer transition-colors"
                      >
                        {n.label} ({n.propagationRisk}%)
                      </span>
                    ))}
                  </div>
                  {attackPathLabels.length > 0 && (
                    <div className="text-[11px] font-mono text-[#A3B3C9] pt-1">
                      Active Transmissions: {attackPathLabels.join(" · ")}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-[#27364B] text-[11px] text-[#A3B3C9]">
                <span>Directional Bézier curves arch vertically to depict blast radius.</span>
                <span className="font-mono text-[10px] text-[#31E6F7]">WebGL Spatial Vector Model</span>
              </div>
            </section>

            {/* Side Panels: Gauge & Cascade Stepper (4 Cols) */}
            <div className="lg:col-span-4 space-y-5">
              {/* Propagation Risk Score Meter */}
              <SpotlightCard className="p-5 bg-[#0E1726]/90 border border-[#27364B]">
                <div className="flex items-center justify-between pb-3 border-b border-[#27364B]">
                  <span className="font-bold text-sm text-[#F0F5FC]">Network Blast Index</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#131F31] text-[#A3B3C9] border border-[#27364B]">
                    SCORE / 100
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center my-4">
                  <div className="relative flex items-center justify-center">
                    <svg viewBox="0 0 200 110" width="200" height="110">
                      <path
                        d="M15,100 A85,85 0 0,1 185,100"
                        fill="none"
                        stroke="rgba(39, 54, 75, 0.4)"
                        strokeWidth="12"
                        strokeLinecap="round"
                      />
                      <path
                        d="M15,100 A85,85 0 0,1 185,100"
                        fill="none"
                        stroke={scoreColor}
                        strokeWidth="12"
                        strokeDasharray="267"
                        strokeDashoffset={267 - (267 * Math.min(100, propagationScore)) / 100}
                        strokeLinecap="round"
                        className="transition-all duration-700 ease-out"
                      />
                    </svg>
                    <div className="absolute top-10 text-center">
                      <div className="text-3xl font-bold font-mono text-[#F0F5FC] tracking-tight">{propagationScore}</div>
                      <div className="text-[10px] font-mono text-[#A3B3C9]">
                        {propagationScore >= 70 ? "CRITICAL EXPOSURE" : propagationScore >= 40 ? "ELEVATED" : "NOMINAL"}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-[#A3B3C9] text-center mt-2 px-2">
                    {whatIf
                      ? whatIfAnalysis && highestRiskUser
                        ? `Projected network blast drop if ${highestRiskUser.label} is immediately quarantined.`
                        : "Isolate a high-risk user to simulate containment impact."
                      : isAttackSimulated
                      ? "Real-time risk computed across live propagation attack links."
                      : "Zero-Trust defenses currently confining blast vectors."}
                  </p>
                </div>
              </SpotlightCard>

              {/* Shortest Path to Restricted Assets Stepper */}
              <SpotlightCard className="p-5 bg-[#0E1726]/90 border border-[#27364B]">
                <div className="flex items-center justify-between pb-3 border-b border-[#27364B]">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#4DA3FF]" />
                    <span className="font-bold text-sm text-[#F0F5FC]">Target Crown Jewel Path</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#4DA3FF]">Shortest Route</span>
                </div>

                <div className="space-y-3 my-3">
                  {shortestPath.length ? (
                    shortestPath.map((node, index) => {
                      const isTarget = index === shortestPath.length - 1;
                      const isSource = index === 0;
                      return (
                        <div
                          key={node.id}
                          onClick={() => setSelectedPathNodeId(node.id)}
                          className="flex items-center gap-3 p-2 rounded-xl bg-[#131F31]/60 hover:bg-[#131F31] border border-[#27364B] transition-all cursor-pointer group"
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-bold flex-shrink-0 ${
                              isTarget
                                ? "bg-[#FF304F]/20 text-[#FF304F] border border-[#FF304F]/40"
                                : isSource
                                ? "bg-[#31E6F7]/20 text-[#31E6F7] border border-[#31E6F7]/40"
                                : "bg-[#4DA3FF]/20 text-[#4DA3FF] border border-[#4DA3FF]/40"
                            }`}
                          >
                            {index + 1}
                          </div>
                          <div className="truncate flex-1">
                            <div className="font-semibold text-xs text-[#F0F5FC] truncate group-hover:text-[#31E6F7]">
                              {node.label}
                            </div>
                            <div className="text-[10px] font-mono text-[#A3B3C9] truncate">
                              {node.type} · Risk {node.propagationRisk}%
                            </div>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-[#6F829D] group-hover:text-[#31E6F7] transition-transform group-hover:translate-x-0.5" />
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-6 text-center text-xs text-[#A3B3C9]">
                      No active path detected between endpoints and restricted assets.
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-[#A3B3C9] pt-2 border-t border-[#27364B]">
                  Click a step to highlight and rotate camera to that entity in 3D.
                </div>
              </SpotlightCard>
            </div>
          </div>
        </div>
      </Layout>
    </PageTransition>
  );
}
