import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Laptop,
  Radio,
  TrendingUp,
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Sparkles,
  Crosshair,
  type LucideIcon,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { NetworkGraph } from "@/components/NetworkGraph";
import PageTransition from "@/components/PageTransition";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { GlassPanel } from "@/components/immersive/GlassPanel";
import { ThreatOpsCore } from "@/components/immersive/ThreatOpsCore";
import {
  mlBackendService,
  type BackendIncident,
  type DashboardSummary,
  type RegisteredDevice,
} from "@/services/mlBackendService";
import { useAuth } from "@/store/authContext";
import { useSecurity } from "@/store/securityStore";

export default function OverviewPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [loadError, setLoadError] = useState("");
  const [trustingDevice, setTrustingDevice] = useState<string | null>(null);
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null);
  const [incidentFilter, setIncidentFilter] = useState<"all" | "active">("all");
  const [deviceFilter, setDeviceFilter] = useState<"all" | "trusted" | "review">("all");
  const [highlightHighRisk, setHighlightHighRisk] = useState(false);
  const [liveEventFeed, setLiveEventFeed] = useState<Array<{ id: string; type: string; title: string; timestamp: string; severity: string; targetId?: string }>>([]);

  const { hasPermission } = useAuth();
  const { nodes, edges } = useSecurity();

  const refreshDashboard = useCallback(async () => {
    try {
      const [nextSummary, nextDevices] = await Promise.all([
        mlBackendService.getDashboardSummary(),
        mlBackendService.getDevices(),
      ]);
      setSummary(nextSummary);
      setDevices(nextDevices.devices);
      setLoadError("");

      // Initialize live feed from recent incidents if empty
      setLiveEventFeed((prev) => {
        if (prev.length > 0) return prev;
        return (nextSummary.recent_incidents || []).slice(0, 5).map((inc) => ({
          id: inc.id,
          type: "incident_alert",
          title: inc.title,
          timestamp: inc.created_at,
          severity: inc.severity,
          targetId: inc.user_id || inc.device_id || undefined,
        }));
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load live dashboard data.");
    }
  }, []);

  useEffect(() => {
    void refreshDashboard();
    const unsubscribe = mlBackendService.onThreatEvent((event) => {
      if (!event) return;
      const newFeedItem = {
        id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: event.type || "telemetry",
        title: (event.payload as any)?.message || (event.payload as any)?.title || `Live ${event.type} detected`,
        timestamp: new Date().toISOString(),
        severity: (event.payload as any)?.severity || "medium",
        targetId: (event.payload as any)?.user_id || (event.payload as any)?.device_id,
      };
      setLiveEventFeed((prev) => [newFeedItem, ...prev.slice(0, 9)]);

      if (
        event.type === "dashboard_update" ||
        event.type === "login_threat" ||
        event.type === "attack_chain"
      ) {
        void refreshDashboard();
      }
    });
    const intervalId = window.setInterval(() => void refreshDashboard(), 15000);
    return () => {
      unsubscribe();
      window.clearInterval(intervalId);
    };
  }, [refreshDashboard]);

  // Handle escape key to dismiss entity drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFocusedEntityId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const trustDevice = async (deviceId: string) => {
    setTrustingDevice(deviceId);
    try {
      await mlBackendService.trustDevice(deviceId);
      await refreshDashboard();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to trust this device.");
    } finally {
      setTrustingDevice(null);
    }
  };

  const rawIncidents = summary?.recent_incidents ?? [];
  const filteredIncidents = rawIncidents.filter((inc) => {
    if (incidentFilter === "active") {
      return inc.status === "open" || inc.status === "investigating";
    }
    return true;
  });

  const filteredDevices = devices.filter((dev) => {
    if (deviceFilter === "trusted") return dev.trust_status === "trusted";
    if (deviceFilter === "review") return dev.trust_status === "unknown" || dev.trust_status === "flagged";
    return true;
  });

  const activeIncidents = summary?.active_incident_count ?? 0;
  const deviceCounts = summary?.device_counts;
  const avgRisk = summary ? summary.overall_risk.average : 0;

  const handleIncidentFocus = (targetId: string) => {
    setFocusedEntityId(targetId);
    const canvasElement = document.getElementById("spatial-command-stage");
    if (canvasElement) {
      canvasElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const selectedEntity = focusedEntityId ? nodes.find((n) => n.id === focusedEntityId) : null;
  const selectedEntityEdges = focusedEntityId
    ? edges.filter((e) => e.from === focusedEntityId || e.to === focusedEntityId)
    : [];

  return (
    <PageTransition>
      <Layout>
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1750px] mx-auto bg-[#050810]">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#28364A] pb-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#55DDE0]/10 border border-[#55DDE0]/30 flex items-center justify-center text-[#55DDE0] shadow-sm shadow-[#55DDE0]/10">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#E8EEF7] flex items-center gap-2">
                    Cybersecurity Command Centre
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded border border-[#55DDE0]/30 bg-[#55DDE0]/10 text-[#55DDE0]">
                      OPERATION BLACKSITE
                    </span>
                  </h1>
                  <p className="text-xs text-[#92A0B5]">
                    Real-time Zero-Trust spatial topology, behavioral risk vectors, and autonomous AI Guardian co-pilot
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {(incidentFilter !== "all" || deviceFilter !== "all" || highlightHighRisk) && (
                <button
                  type="button"
                  onClick={() => {
                    setIncidentFilter("all");
                    setDeviceFilter("all");
                    setHighlightHighRisk(false);
                    setFocusedEntityId(null);
                  }}
                  className="px-2.5 py-1 rounded-md text-[11px] font-mono border border-[#55DDE0]/40 bg-[#55DDE0]/15 text-[#55DDE0] hover:bg-[#55DDE0]/25 transition-all"
                >
                  Reset Active Filters
                </button>
              )}
              <span className="px-3 py-1.5 rounded-lg text-[11px] font-mono border bg-[#48D6A0]/10 text-[#48D6A0] border-[#48D6A0]/30 flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-[#48D6A0] animate-pulse" />
                SURVEILLANCE ACTIVE
              </span>
              <span className="px-3 py-1.5 rounded-lg text-[11px] font-mono border bg-[#151F30] text-[#92A0B5] border-[#28364A]">
                DEFENSE ENGINE v2.4.1
              </span>
            </div>
          </div>

          {/* Compact Executive Overview HUD Grid - Clickable Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Card 1: Average Identity Risk */}
            <div
              onClick={() => {
                const next = !highlightHighRisk;
                setHighlightHighRisk(next);
                if (next) {
                  const highRiskNode = [...nodes].sort((a, b) => b.propagationRisk - a.propagationRisk)[0];
                  if (highRiskNode) handleIncidentFocus(highRiskNode.id);
                }
              }}
              className="cursor-pointer"
            >
              <GlassPanel
                accentColor={avgRisk > 60 ? '#ff647c' : avgRisk > 30 ? '#f4bd62' : '#22d3ee'}
                className={`p-4 transition-all ${
                  highlightHighRisk ? "border-[#55DDE0] ring-1 ring-[#55DDE0]" : "hover:border-[#55DDE0]/50"
                }`}
              >
                <KpiCardContent
                  icon={TrendingUp}
                  color={avgRisk > 60 ? '#FF647C' : avgRisk > 30 ? '#F4BD62' : '#55DDE0'}
                  label="Average Identity Risk"
                  value={summary ? summary.overall_risk.average.toFixed(1) : "—"}
                  badge={{
                    text: highlightHighRisk ? "Filter Active" : summary ? `${summary.overall_risk.users_scored} scored` : "Loading",
                    cls: highlightHighRisk ? "badge-safe" : avgRisk > 60 ? "badge-critical" : avgRisk > 30 ? "badge-warning" : "badge-safe",
                  }}
                  sub={
                    highlightHighRisk
                      ? "Targeting high-risk entities in 3D"
                      : summary
                      ? `Peak risk: ${summary.overall_risk.maximum.toFixed(1)} / 100`
                      : "Querying risk engine"
                  }
                />
              </GlassPanel>
            </div>

            {/* Card 2: Active Incidents */}
            <div
              onClick={() => setIncidentFilter(incidentFilter === "active" ? "all" : "active")}
              className="cursor-pointer"
            >
              <GlassPanel
                accentColor={activeIncidents > 0 ? '#ff647c' : '#48d6a0'}
                className={`p-4 transition-all ${
                  incidentFilter === "active" ? "border-[#FF647C] ring-1 ring-[#FF647C]" : "hover:border-[#FF647C]/50"
                }`}
              >
                <KpiCardContent
                  icon={AlertTriangle}
                  color={activeIncidents > 0 ? '#FF647C' : '#48D6A0'}
                  label="Active Incidents"
                  value={summary ? String(activeIncidents).padStart(2, "0") : "—"}
                  badge={{
                    text: incidentFilter === "active" ? "Filtering Active" : activeIncidents ? "Action Required" : "Nominal",
                    cls: activeIncidents ? "badge-critical" : "badge-safe",
                  }}
                  sub={incidentFilter === "active" ? "Showing active queue only" : "Click to filter incident ledger"}
                />
              </GlassPanel>
            </div>

            {/* Card 3: Trusted Devices */}
            <div
              onClick={() => setDeviceFilter(deviceFilter === "trusted" ? "all" : "trusted")}
              className="cursor-pointer"
            >
              <GlassPanel
                accentColor="#48d6a0"
                className={`p-4 transition-all ${
                  deviceFilter === "trusted" ? "border-[#48D6A0] ring-1 ring-[#48D6A0]" : "hover:border-[#48D6A0]/50"
                }`}
              >
                <KpiCardContent
                  icon={ShieldCheck}
                  color="#48D6A0"
                  label="Trusted Devices"
                  value={deviceCounts ? String(deviceCounts.trusted).padStart(2, "0") : "—"}
                  badge={{
                    text: deviceFilter === "trusted" ? "Filtered" : deviceCounts ? `${deviceCounts.total} total` : "Loading",
                    cls: "badge-safe",
                  }}
                  sub={deviceFilter === "trusted" ? "Showing verified endpoints" : "Click to filter device matrix"}
                />
              </GlassPanel>
            </div>

            {/* Card 4: Devices Under Review */}
            <div
              onClick={() => setDeviceFilter(deviceFilter === "review" ? "all" : "review")}
              className="cursor-pointer"
            >
              <GlassPanel
                accentColor="#f4bd62"
                className={`p-4 transition-all ${
                  deviceFilter === "review" ? "border-[#F4BD62] ring-1 ring-[#F4BD62]" : "hover:border-[#F4BD62]/50"
                }`}
              >
                <KpiCardContent
                  icon={Laptop}
                  color="#F4BD62"
                  label="Devices Under Review"
                  value={
                    deviceCounts
                      ? String(deviceCounts.unknown + deviceCounts.flagged).padStart(2, "0")
                      : "—"
                  }
                  badge={{
                    text: deviceFilter === "review" ? "Filtered" : deviceCounts?.flagged ? `${deviceCounts.flagged} flagged` : "Registry",
                    cls: deviceCounts?.flagged ? "badge-critical" : "badge-warning",
                  }}
                  sub={
                    deviceFilter === "review"
                      ? "Showing unknown / flagged only"
                      : deviceCounts
                      ? `${deviceCounts.unknown} unknown · ${deviceCounts.flagged} quarantined`
                      : "Querying device registry"
                  }
                />
              </GlassPanel>
            </div>

            {/* Card 5: Network Anomalies Navigation */}
            <Link to="/network-activity" className="block focus:outline-none">
              <GlassPanel accentColor="#5b8cff" className="p-4 h-full transition-all hover:border-[#5B8CFF]/60 hover:-translate-y-0.5">
                <KpiCardContent
                  icon={Radio}
                  color="#5B8CFF"
                  label="Network Anomalies"
                  value={
                    summary ? String(summary.network_anomalies).padStart(2, "0") : "—"
                  }
                  badge={{
                    text: summary?.network_anomalies ? "Flagged" : "Clear",
                    cls: summary?.network_anomalies ? "badge-warning" : "badge-safe",
                  }}
                  sub="Live request behavioral anomalies →"
                />
              </GlassPanel>
            </Link>
          </div>

          {/* Compact Live Telemetry & Threat Event Rail */}
          <div className="p-3 rounded-xl border border-[#28364A] bg-[#101827]/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#55DDE0] animate-ping" />
              <span className="font-mono font-bold text-[#E8EEF7] text-[11px]">LIVE THREAT TELEMETRY STREAM:</span>
            </div>
            <div className="flex-1 flex items-center gap-3 overflow-x-auto py-0.5 scrollbar-thin">
              {liveEventFeed.length > 0 ? (
                liveEventFeed.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => item.targetId && handleIncidentFocus(item.targetId)}
                    className="flex-shrink-0 flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#151F30] border border-[#28364A] hover:border-[#55DDE0] cursor-pointer transition-colors text-[11px]"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      item.severity === "critical" ? "bg-[#FF647C]" : item.severity === "high" ? "bg-[#FF647C]" : "bg-[#F4BD62]"
                    }`} />
                    <span className="font-mono text-[#92A0B5]">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    <span className="text-[#E8EEF7] truncate max-w-[220px]">{item.title}</span>
                    {item.targetId && (
                      <span className="text-[10px] font-mono text-[#55DDE0]">Focus →</span>
                    )}
                  </div>
                ))
              ) : (
                <span className="text-[#92A0B5] font-mono text-[11px]">Surveillance stream nominal. Awaiting real-time telemetry packets…</span>
              )}
            </div>
            <span className="text-[10px] font-mono text-[#92A0B5] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#48D6A0]" /> WS STREAM CONNECTED
            </span>
          </div>

          {loadError && (
            <div
              className="p-3.5 rounded-xl border border-[#FF647C]/40 bg-[#FF647C]/10 text-[#FF647C] text-xs flex items-center gap-2"
              role="status"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[#FF647C]" />
              <span>Live backend data unavailable: {loadError}. Reconnecting automatically…</span>
            </div>
          )}

          {/* 3D Network Topology Stage (Dominant Centerpiece) */}
          <section id="spatial-command-stage" className="rounded-2xl border border-[#28364A] bg-[#101827]/90 backdrop-blur-md p-4 sm:p-5 shadow-2xl relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between pb-3.5 border-b border-[#28364A] gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#55DDE0]/10 border border-[#55DDE0]/30 flex items-center justify-center text-[#55DDE0]">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#E8EEF7]">3D Spatial Topology &amp; Attack Propagation</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#151F30] text-[#55DDE0] border border-[#28364A]">
                      3D COMMAND STAGE
                    </span>
                  </div>
                  <p className="text-[11px] text-[#92A0B5] hidden sm:block">
                    Orbit (Left Drag) · Pan (Right Drag) · Zoom (Scroll) · Select node to focus camera and inspect live metadata
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-[#151F30] text-[#55DDE0] border border-[#28364A]">
                  {nodes.length} entities tracked
                </span>
                <Link
                  to="/propagation"
                  className="px-3 py-1 rounded-md text-[11px] font-mono font-medium text-[#55DDE0] bg-[#55DDE0]/10 hover:bg-[#55DDE0]/20 border border-[#55DDE0]/30 flex items-center gap-1.5 transition-colors"
                >
                  Propagation Analysis <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            <div className="my-3 rounded-xl overflow-hidden min-h-[520px] relative" aria-label="Live topology of registered users, devices, and protected assets">
              {nodes.length ? (
                <>
                  <ThreatOpsCore
                    nodes={nodes}
                    edges={edges}
                    selectedEntityId={focusedEntityId}
                    onSelectEntity={setFocusedEntityId}
                    highlightHighRisk={highlightHighRisk}
                  />

                  {/* Contextual Entity Inspector Overlay HUD Drawer */}
                  {selectedEntity && (
                    <div className="absolute top-4 right-4 z-20 w-80 max-w-[calc(100%-2rem)] p-4 rounded-xl border border-[#28364A] bg-[#101827]/95 backdrop-blur-md shadow-2xl space-y-3 font-mono text-xs animate-in fade-in slide-in-from-right-4 duration-200">
                      <div className="flex items-center justify-between pb-2 border-b border-[#28364A]">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            selectedEntity.propagationRisk > 60 ? "bg-[#FF647C]" : selectedEntity.propagationRisk > 30 ? "bg-[#F4BD62]" : "bg-[#48D6A0]"
                          }`} />
                          <span className="font-bold text-[#E8EEF7] font-sans truncate">{selectedEntity.label}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFocusedEntityId(null)}
                          className="text-[#92A0B5] hover:text-[#E8EEF7] text-sm px-1.5 py-0.5 rounded hover:bg-[#151F30] transition-colors"
                          title="Close inspector (Esc)"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-[#92A0B5]">Entity ID:</span>
                          <span className="text-[#E8EEF7]">{selectedEntity.id}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#92A0B5]">Type:</span>
                          <span className="text-[#55DDE0] uppercase">{selectedEntity.type}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#92A0B5]">Propagation Risk:</span>
                          <span className={`font-bold ${
                            selectedEntity.propagationRisk > 60 ? "text-[#FF647C]" : selectedEntity.propagationRisk > 30 ? "text-[#F4BD62]" : "text-[#48D6A0]"
                          }`}>
                            {selectedEntity.propagationRisk}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#92A0B5]">Status:</span>
                          <span className={selectedEntity.compromised ? "text-[#FF647C] font-bold" : "text-[#48D6A0]"}>
                            {selectedEntity.compromised ? "COMPROMISED" : "VERIFIED"}
                          </span>
                        </div>
                      </div>

                      {/* Connected Peers Summary */}
                      <div className="pt-2 border-t border-[#28364A] space-y-1">
                        <div className="text-[10px] text-[#92A0B5] uppercase font-semibold">
                          Active Topology Links ({selectedEntityEdges.length}):
                        </div>
                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                          {selectedEntityEdges.length > 0 ? (
                            selectedEntityEdges.map((e, idx) => {
                              const peerId = e.from === selectedEntity.id ? e.to : e.from;
                              return (
                                <span
                                  key={idx}
                                  onClick={() => handleIncidentFocus(peerId)}
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-[#151F30] hover:bg-[#151F30]/80 text-[#92A0B5] hover:text-[#55DDE0] cursor-pointer border border-[#28364A] transition-colors"
                                >
                                  {peerId}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-[10px] text-[#92A0B5]/60 italic">Isolated entity</span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#28364A] flex items-center justify-between gap-2">
                        <Link
                          to="/propagation"
                          className="flex-1 py-1.5 px-2 rounded text-center text-[10px] font-sans font-medium bg-[#55DDE0]/15 hover:bg-[#55DDE0]/25 text-[#55DDE0] border border-[#55DDE0]/40 transition-colors"
                        >
                          Trace Risk Path →
                        </Link>
                        <Link
                          to="/incidents"
                          className="flex-1 py-1.5 px-2 rounded text-center text-[10px] font-sans font-medium bg-[#151F30] hover:bg-[#151F30]/80 text-[#E8EEF7] border border-[#28364A] transition-colors"
                        >
                          View Incidents
                        </Link>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-16 text-center text-xs text-[#92A0B5] flex flex-col items-center justify-center gap-2 min-h-[520px]">
                  <span className="w-3 h-3 rounded-full bg-[#55DDE0] animate-ping" />
                  Compiling real-time network topology from backend identity graph…
                </div>
              )}
            </div>

            <div className="text-[11px] text-[#92A0B5] flex flex-wrap items-center justify-between pt-3 border-t border-[#28364A] gap-2">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#48D6A0]" />
                  <span>Low Risk / Healthy</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F4BD62]" />
                  <span>Medium / Anomaly</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF647C]" />
                  <span>Critical / Quarantined</span>
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#92A0B5]/80">
                Quadratic 3D Bezier Flows · Directional Packet Pulses
              </span>
            </div>
          </section>

          {/* Lower Deck: Recent Incidents (8 cols) and Registered Devices Matrix (4 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Recent Incidents Ledger */}
            <section className="lg:col-span-8 rounded-2xl border border-[#28364A] bg-[#101827]/90 backdrop-blur-md p-4 sm:p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3.5 border-b border-[#28364A]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#FF647C]/10 border border-[#FF647C]/30 flex items-center justify-center text-[#FF647C]">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-[#E8EEF7]">Recent Security Incidents</span>
                    <span className="ml-2 text-[10px] font-mono text-[#92A0B5]">
                      {filteredIncidents.length} {incidentFilter === "active" ? "active shown" : "logged"} · Click row to target in 3D
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {incidentFilter === "active" && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FF647C]/15 text-[#FF647C] border border-[#FF647C]/30">
                      FILTER: ACTIVE ONLY
                    </span>
                  )}
                  <Link
                    to="/incidents"
                    className="text-xs text-[#55DDE0] hover:text-[#55DDE0]/80 font-medium flex items-center gap-1 transition-colors"
                  >
                    Open Incident Center <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#28364A] text-left text-[#92A0B5] font-mono text-[11px]">
                      <th className="py-2.5 px-3">INCIDENT ID</th>
                      <th className="py-2.5 px-3">SUMMARY &amp; TARGET</th>
                      <th className="py-2.5 px-3">SEVERITY</th>
                      <th className="py-2.5 px-3">AGENT CO-PILOT</th>
                      <th className="py-2.5 px-3">STATUS</th>
                      <th className="py-2.5 px-3 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#28364A]/50">
                    {filteredIncidents.length ? (
                      filteredIncidents.map((incident) => (
                        <IncidentRow
                          key={incident.id}
                          incident={incident}
                          onFocus={handleIncidentFocus}
                          isSelected={focusedEntityId === incident.user_id || focusedEntityId === incident.device_id}
                        />
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-[#92A0B5]">
                          {incidentFilter === "active"
                            ? "No active incidents currently requiring review."
                            : "No incidents logged in the ledger yet."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Registered Devices Companion Panel */}
            <section className="lg:col-span-4 rounded-2xl border border-[#28364A] bg-[#101827]/90 backdrop-blur-md p-4 sm:p-5 flex flex-col justify-between shadow-xl">
              <div>
                <div className="flex items-center justify-between pb-3.5 border-b border-[#28364A]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-[#5B8CFF]/10 border border-[#5B8CFF]/30 flex items-center justify-center text-[#5B8CFF]">
                      <Laptop className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-bold text-sm text-[#E8EEF7]">Device Trust Matrix</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {deviceFilter !== "all" && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#55DDE0]/15 text-[#55DDE0] border border-[#55DDE0]/30">
                        {deviceFilter.toUpperCase()}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#151F30] text-[#92A0B5] border border-[#28364A]">
                      {filteredDevices.length} / {deviceCounts?.total ?? 0}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 my-3.5">
                  {filteredDevices.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#92A0B5]">
                      {deviceFilter === "review"
                        ? "No devices currently flagged for review."
                        : "No device fingerprints registered matching this filter."}
                    </div>
                  ) : (
                    filteredDevices.slice(0, 5).map((device) => (
                      <div
                        className="p-3 rounded-lg border border-[#27364B] bg-[#131F31]/60 hover:bg-[#131F31] flex items-center justify-between gap-3 text-xs transition-colors"
                        key={device.device_id}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded bg-[#0E1726] flex items-center justify-center text-[#A3B3C9] border border-[#27364B] flex-shrink-0">
                            <Laptop className="w-3.5 h-3.5" />
                          </div>
                          <div className="truncate">
                            <div className="font-semibold text-[#F0F5FC] truncate">{device.label}</div>
                            <div className="text-[11px] text-[#A3B3C9] font-mono truncate">
                              {device.user_id} · {new Date(device.last_seen).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                              device.trust_status === "trusted"
                                ? "bg-[#46E6A5]/10 text-[#46E6A5] border-[#46E6A5]/30"
                                : device.trust_status === "flagged"
                                ? "bg-[#FF304F]/10 text-[#FF304F] border-[#FF304F]/30"
                                : "bg-[#FFBD59]/10 text-[#FFBD59] border-[#FFBD59]/30"
                            }`}
                          >
                            {device.trust_status}
                          </span>

                          {device.trust_status === "unknown" && hasPermission("manage_devices") && (
                            <button
                              type="button"
                              className="px-2 py-0.5 rounded bg-[#31E6F7] hover:bg-[#31E6F7]/80 text-[#050810] font-bold text-[10px] transition-colors"
                              disabled={trustingDevice === device.device_id}
                              onClick={() => void trustDevice(device.device_id)}
                            >
                              {trustingDevice === device.device_id ? "…" : "Trust"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="text-[11px] text-[#A3B3C9] pt-3 border-t border-[#27364B]">
                Fingerprints are marked unknown until authorized. CSI/RF hardware is excluded.
              </div>
            </section>
          </div>
        </div>
      </Layout>
    </PageTransition>
  );
}

function KpiCardContent({
  icon: Icon,
  color,
  label,
  value,
  badge,
  sub,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string;
  badge: { text: string; cls: string };
  sub: string;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}18`, border: `1px solid ${color}45`, color }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
          badge.cls === "badge-critical"
            ? "bg-[#FF304F]/10 text-[#FF304F] border-[#FF304F]/30"
            : badge.cls === "badge-warning"
            ? "bg-[#FFBD59]/10 text-[#FFBD59] border-[#FFBD59]/30"
            : "bg-[#46E6A5]/10 text-[#46E6A5] border-[#46E6A5]/30"
        }`}>
          {badge.text}
        </span>
      </div>

      <div className="text-[11px] font-mono text-[#92A0B5] uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold font-mono tracking-tight text-[#E8EEF7] my-1">
        {value}
      </div>
      <div className="text-[11px] text-[#92A0B5] truncate">{sub}</div>
    </div>
  );
}

function IncidentRow({
  incident,
  onFocus,
  isSelected,
}: {
  incident: BackendIncident;
  onFocus: (id: string) => void;
  isSelected?: boolean;
}) {
  const severity = incident.severity.toLowerCase();
  const targetId = incident.user_id || incident.device_id || "";

  return (
    <tr
      onClick={() => targetId && onFocus(targetId)}
      className={`transition-colors cursor-pointer ${
        isSelected ? 'bg-[#55DDE0]/15' : 'hover:bg-[#151F30]/80'
      }`}
    >
      <td className="py-3 px-3 font-mono font-medium text-[#E8EEF7]">{incident.id}</td>
      <td className="py-3 px-3">
        <div className="font-semibold text-[#E8EEF7]">{incident.title}</div>
        <div className="text-[11px] text-[#92A0B5] font-mono">
          User: {incident.user_id}
          {incident.device_id ? ` · Dev: ${incident.device_id}` : ""}
        </div>
      </td>
      <td className="py-3 px-3">
        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
          severity === "critical"
            ? "bg-[#FF647C]/15 text-[#FF647C] border-[#FF647C]/40"
            : severity === "high"
            ? "bg-[#FF647C]/10 text-[#FF647C] border-[#FF647C]/30"
            : "bg-[#5B8CFF]/15 text-[#5B8CFF] border-[#5B8CFF]/30"
        }`}>
          {incident.severity}
        </span>
      </td>
      <td className="py-3 px-3">
        <span className="text-xs font-mono text-[#A99BFF] flex items-center gap-1.5 font-medium">
          <Sparkles className="w-3.5 h-3.5 text-[#A99BFF]" /> Co-Pilot Ready
        </span>
      </td>
      <td className="py-3 px-3">
        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
          incident.status === "resolved"
            ? "bg-[#48D6A0]/15 text-[#48D6A0] border-[#48D6A0]/30"
            : incident.status === "dismissed"
            ? "bg-[#151F30] text-[#92A0B5] border-[#28364A]"
            : "bg-[#F4BD62]/15 text-[#F4BD62] border-[#F4BD62]/30"
        }`}>
          {incident.status}
        </span>
      </td>
      <td className="py-3 px-3 text-right">
        {targetId && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFocus(targetId);
            }}
            className="px-2 py-1 rounded bg-[#55DDE0]/15 hover:bg-[#55DDE0]/30 text-[#55DDE0] border border-[#55DDE0]/40 text-[10px] font-mono inline-flex items-center gap-1 transition-colors"
            title="Focus entity in 3D topology"
          >
            <Crosshair className="w-3 h-3" /> Focus 3D
          </button>
        )}
      </td>
    </tr>
  );
}
