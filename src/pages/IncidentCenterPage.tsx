import { useCallback, useEffect, useState } from "react";
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  Laptop,
  Search,
  Filter,
  Activity,
  ArrowRight,
  Shield,
  Radio,
  FileText,
  RotateCcw,
  Sparkles,
  Zap,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import PageTransition from "@/components/PageTransition";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import {
  mlBackendService,
  type BackendIncident,
  type SecurityEvent,
} from "@/services/mlBackendService";
import { useAuth } from "@/store/authContext";
import AgentPanel from "@/components/AgentPanel";

type Action = "approve" | "dismiss" | "escalate" | "resolve";

export default function IncidentCenterPage() {
  const [incidents, setIncidents] = useState<BackendIncident[]>([]);
  const [relatedEvents, setRelatedEvents] = useState<SecurityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<"all" | "active">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { hasPermission } = useAuth();

  const selected = incidents.find((incident) => incident.id === selectedId) ?? incidents[0] ?? null;

  useEffect(() => {
    if (!selected) {
      setRelatedEvents([]);
      return;
    }
    let cancelled = false;
    setEventsLoading(true);
    void mlBackendService
      .getIncidentEvents(selected.id)
      .then((result) => {
        if (!cancelled) setRelatedEvents(result.events);
      })
      .catch(() => {
        if (!cancelled) setRelatedEvents([]);
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  const refreshIncidents = useCallback(async () => {
    try {
      const result = await mlBackendService.getIncidents(filter === "active" ? "active" : undefined);
      setIncidents(result.incidents);
      setSelectedId((current) =>
        result.incidents.some((item) => item.id === current)
          ? current
          : result.incidents[0]?.id ?? ""
      );
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load backend incidents.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refreshIncidents();
    const unsubscribe = mlBackendService.onThreatEvent((event) => {
      if (
        event?.type === "dashboard_update" ||
        event?.type === "login_threat" ||
        event?.type === "attack_chain" ||
        event?.type === "agent_activity"
      ) {
        void refreshIncidents();
      }
    });
    const poll = window.setInterval(() => void refreshIncidents(), 15000);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
    };
  }, [refreshIncidents]);

  const actOnIncident = async (action: Action) => {
    if (!selected) return;
    setActing(true);
    setMessage("");
    setError("");
    try {
      const result = await mlBackendService.transitionIncident(selected.id, action);
      const updated = result.incident as BackendIncident;
      setIncidents((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setMessage(
        action === "approve"
          ? result.device
            ? `Approved: ${result.device.label} was flagged and quarantined.`
            : "Approved for manual review; no linked device was available to quarantine."
          : action === "dismiss"
          ? `Dismissed incident ${updated.id}.`
          : action === "resolve"
          ? `Resolved incident ${updated.id}.`
          : `Escalated incident ${updated.id} for analyst review.`
      );
      await refreshIncidents();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The incident action failed.");
    } finally {
      setActing(false);
    }
  };

  const getSeverityStyle = (severity: string) => {
    const s = severity.toLowerCase();
    if (s === "critical") return "bg-[#FF304F]/15 text-[#FF304F] border-[#FF304F]/40";
    if (s === "high") return "bg-[#FF4D6D]/15 text-[#FF4D6D] border-[#FF4D6D]/40";
    if (s === "medium") return "bg-[#FFBD59]/15 text-[#FFBD59] border-[#FFBD59]/40";
    return "bg-[#46E6A5]/15 text-[#46E6A5] border-[#46E6A5]/40";
  };

  const filteredIncidents = incidents.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.id.toLowerCase().includes(query) ||
      item.title.toLowerCase().includes(query) ||
      item.user_id.toLowerCase().includes(query) ||
      (item.device_id && item.device_id.toLowerCase().includes(query))
    );
  });

  const activeCount = incidents.filter(
    (item) => item.status === "open" || item.status === "investigating"
  ).length;

  return (
    <PageTransition>
      <Layout>
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1750px] mx-auto bg-[#050810] min-h-screen">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#27364B] pb-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#FF304F]/10 border border-[#FF304F]/30 flex items-center justify-center text-[#FF304F] shadow-sm shadow-[#FF304F]/10">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F0F5FC] flex items-center gap-2">
                    Incident Center &amp; Threat Dossier
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded border border-[#FF304F]/30 bg-[#FF304F]/10 text-[#FF304F]">
                      SOC WORKSPACE
                    </span>
                  </h1>
                  <p className="text-xs text-[#A3B3C9]">
                    Real-time incident queue, correlated telemetry evidence, and autonomous AI Guardian co-pilot
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1.5 rounded-lg text-[11px] font-mono border bg-[#FFBD59]/10 text-[#FFBD59] border-[#FFBD59]/30 flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-[#FFBD59] animate-pulse" />
                {activeCount} ACTIVE INCIDENTS
              </span>
              <button
                type="button"
                onClick={() => void refreshIncidents()}
                className="p-2 rounded-lg text-xs font-mono border border-[#27364B] bg-[#0E1726] hover:bg-[#131F31] text-[#A3B3C9] hover:text-[#F0F5FC] transition-colors"
                title="Refresh Incidents"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl border border-[#FF304F]/40 bg-[#FF304F]/10 text-[#FF304F] text-xs flex items-center gap-2" role="alert">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="p-3.5 rounded-xl border border-[#46E6A5]/40 bg-[#46E6A5]/10 text-[#46E6A5] text-xs flex items-center gap-2" role="status">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {/* 3-Column Enterprise SOC Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* COLUMN 1: Incident Queue (span 3) */}
            <section className="lg:col-span-3 space-y-3" aria-label="Incident Queue">
              <SpotlightCard className="p-3.5 rounded-2xl border border-[#27364B] bg-[#0E1726]/90 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono uppercase text-[#A3B3C9] font-semibold">
                  <span className="flex items-center gap-1.5 text-[#31E6F7]">
                    <Filter className="w-3.5 h-3.5" /> Incident Queue
                  </span>
                  <span>{filteredIncidents.length} items</span>
                </div>

                {/* Filter Selector & Search */}
                <div className="space-y-2">
                  <div className="flex rounded-xl bg-[#131F31]/80 p-1 border border-[#27364B] text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className={`flex-1 py-1 rounded-lg text-center transition-all ${
                        filter === "all"
                          ? "bg-[#31E6F7]/20 text-[#31E6F7] font-bold border border-[#31E6F7]/40 shadow-sm"
                          : "text-[#A3B3C9] hover:text-[#F0F5FC]"
                      }`}
                    >
                      All ({incidents.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter("active")}
                      className={`flex-1 py-1 rounded-lg text-center transition-all ${
                        filter === "active"
                          ? "bg-[#FFBD59]/20 text-[#FFBD59] font-bold border border-[#FFBD59]/40 shadow-sm"
                          : "text-[#A3B3C9] hover:text-[#F0F5FC]"
                      }`}
                    >
                      Active ({activeCount})
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#6F829D]" />
                    <input
                      type="text"
                      placeholder="Search ID, user, title…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-[#050810] border border-[#27364B] text-[#F0F5FC] placeholder:text-[#6F829D] focus:outline-none focus:border-[#31E6F7]/60 transition-colors font-mono"
                    />
                  </div>
                </div>
              </SpotlightCard>

              {/* Queue List Cards */}
              <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
                {filteredIncidents.map((incident) => {
                  const isSelected = incident.id === selected?.id;
                  const sevStyle = getSeverityStyle(incident.severity);
                  return (
                    <button
                      type="button"
                      key={incident.id}
                      onClick={() => setSelectedId(incident.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all text-xs relative overflow-hidden group ${
                        isSelected
                          ? "bg-[#131F31] border-[#31E6F7] shadow-lg shadow-[#31E6F7]/10 ring-1 ring-[#31E6F7]/30"
                          : "bg-[#0E1726]/80 border-[#27364B] hover:bg-[#131F31]/70 hover:border-[#3b4e6b]"
                      }`}
                    >
                      {/* Left selection neon bar */}
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#31E6F7]" />}

                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-mono text-[11px] font-bold text-[#F0F5FC]">{incident.id}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${sevStyle}`}>
                          {incident.severity}
                        </span>
                      </div>

                      <div className="font-semibold text-[#F0F5FC] truncate mb-1 text-xs group-hover:text-[#31E6F7] transition-colors">
                        {incident.title}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#A3B3C9] font-mono">
                        <span className="truncate max-w-[130px]">User: {incident.user_id}</span>
                        <span className="uppercase text-[10px] font-semibold text-[#6F829D]">{incident.status}</span>
                      </div>
                    </button>
                  );
                })}

                {!loading && filteredIncidents.length === 0 && (
                  <div className="p-8 rounded-xl border border-[#27364B] text-center text-xs text-[#A3B3C9] bg-[#0E1726]/40">
                    No incidents match current filter.
                  </div>
                )}
              </div>
            </section>

            {/* COLUMN 2: Incident Dossier & Evidence (span 5) */}
            <section className="lg:col-span-5 space-y-4" aria-label="Incident Detail">
              {selected ? (
                <SpotlightCard className="p-5 rounded-2xl border border-[#27364B] bg-[#0E1726]/90 space-y-4">
                  {/* Selected Incident Heading */}
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-3.5 border-b border-[#27364B]">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#131F31] text-[#F0F5FC] font-semibold border border-[#27364B]">
                          {selected.incident_label ? `${selected.incident_label} · ` : ""}
                          {selected.id}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getSeverityStyle(selected.severity)}`}>
                          {selected.severity}
                        </span>
                      </div>
                      <h2 className="text-base font-bold text-[#F0F5FC] mt-1.5">{selected.title}</h2>
                      <div className="text-xs text-[#A3B3C9] font-mono flex items-center gap-2 mt-0.5">
                        <span>Target: <strong className="text-[#F0F5FC]">{selected.user_id}</strong></span>
                        {selected.device_id && <span>· Device: <strong className="text-[#F0F5FC]">{selected.device_id}</strong></span>}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] font-mono uppercase text-[#A3B3C9]">Fused Risk</div>
                      <div className="text-2xl font-bold font-mono text-[#31E6F7]">
                        {selected.risk_score.toFixed(1)}
                        <span className="text-xs text-[#A3B3C9] font-normal"> / 100</span>
                      </div>
                    </div>
                  </div>

                  {/* Evidence Gathered */}
                  <div className="space-y-2">
                    <div className="text-xs font-mono uppercase tracking-wider text-[#A3B3C9] font-semibold flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#31E6F7]" /> Gathered Evidence Signals
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.evidence.length ? (
                        selected.evidence.map((item, index) => (
                          <span
                            key={`${index}-${item}`}
                            className="px-2.5 py-1 rounded-lg text-xs bg-[#131F31] border border-[#27364B] text-[#F0F5FC] font-medium"
                          >
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[#A3B3C9]">No evidence details recorded.</span>
                      )}
                    </div>
                  </div>

                  {/* Explainable Risk Signals */}
                  {selected.risk_breakdown && <RiskBreakdown breakdown={selected.risk_breakdown} />}

                  {/* Correlated Security Events */}
                  <div className="space-y-2 pt-2 border-t border-[#27364B]">
                    <div className="flex items-center justify-between text-xs font-mono uppercase text-[#A3B3C9] font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-[#31E6F7]" /> Correlated Security Events
                      </span>
                      <span>{relatedEvents.length} events</span>
                    </div>

                    {eventsLoading ? (
                      <div className="p-4 text-center text-xs text-[#A3B3C9] font-mono">
                        Retrieving linked audit logs…
                      </div>
                    ) : relatedEvents.length ? (
                      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                        {relatedEvents.map((event) => (
                          <div
                            key={event.id}
                            className="p-2.5 rounded-lg border border-[#27364B] bg-[#131F31]/50 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between font-mono text-[11px]">
                              <span className="font-semibold text-[#F0F5FC]">{event.id}</span>
                              <span className="text-[#A3B3C9]">
                                {new Date(event.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="font-mono text-[#F0F5FC] flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-[#31E6F7]/10 text-[#31E6F7] font-bold text-[10px]">
                                {event.http_method}
                              </span>
                              <span className="truncate">{event.request_path}</span>
                              <span className="ml-auto text-[10px] font-mono text-[#FFBD59]">
                                {event.status_code ?? "—"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg border border-[#27364B] text-center text-xs text-[#A3B3C9]">
                        No request events directly linked to this incident record.
                      </div>
                    )}
                  </div>

                  {/* Incident Lifecycle Action Triggers */}
                  {hasPermission("approve_incidents") && (
                    <div className="pt-3 border-t border-[#27364B] space-y-2">
                      <div className="text-xs font-mono uppercase text-[#A3B3C9] font-semibold">
                        Analyst Lifecycle Actions
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#131F31] hover:bg-[#19283B] text-[#F0F5FC] border border-[#27364B] transition-colors"
                          onClick={() => void actOnIncident("escalate")}
                          disabled={acting || ["dismissed", "resolved"].includes(selected.status)}
                        >
                          Escalate
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#131F31] hover:bg-[#19283B] text-[#A3B3C9] hover:text-[#F0F5FC] border border-[#27364B] transition-colors"
                          onClick={() => void actOnIncident("dismiss")}
                          disabled={acting || ["dismissed", "resolved"].includes(selected.status)}
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#46E6A5]/15 hover:bg-[#46E6A5]/25 text-[#46E6A5] border border-[#46E6A5]/30 transition-colors"
                          onClick={() => void actOnIncident("resolve")}
                          disabled={acting || ["dismissed", "resolved"].includes(selected.status)}
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#FF304F] hover:bg-[#FF304F]/90 text-white shadow-md transition-all ml-auto"
                          onClick={() => void actOnIncident("approve")}
                          disabled={acting || ["dismissed", "resolved"].includes(selected.status)}
                        >
                          {acting ? "Enforcing…" : "Approve Quarantine"}
                        </button>
                      </div>
                    </div>
                  )}
                </SpotlightCard>
              ) : (
                <div className="p-12 rounded-2xl border border-[#27364B] bg-[#0E1726]/60 text-center space-y-2">
                  <ShieldAlert className="w-6 h-6 text-[#A3B3C9] mx-auto" />
                  <h3 className="font-bold text-sm text-[#F0F5FC]">No Incident Selected</h3>
                  <p className="text-xs text-[#A3B3C9] max-w-sm mx-auto">
                    Select an incident from the queue to inspect gathered evidence, risk signals, and autonomous agent findings.
                  </p>
                </div>
              )}
            </section>

            {/* COLUMN 3: Right-Side AI Guardian Co-Pilot (span 4) */}
            <section className="lg:col-span-4 space-y-3" aria-label="AI Guardian Co-Pilot">
              {selected ? (
                <AgentPanel
                  incidentId={selected.id}
                  canAct={hasPermission("approve_incidents")}
                  onChanged={() => void refreshIncidents()}
                />
              ) : (
                <div className="p-8 rounded-2xl border border-[#27364B] text-center text-xs text-[#A3B3C9] bg-[#0E1726]/40">
                  Select an incident to activate the AI Guardian Co-Pilot.
                </div>
              )}
            </section>
          </div>
        </div>
      </Layout>
    </PageTransition>
  );
}

function RiskBreakdown({ breakdown }: { breakdown: Record<string, any> }) {
  const allowedKeys = [
    "behavioral",
    "isolation_forest",
    "classifier",
    "device_trust",
    "network",
    "physical",
  ];

  const entries = Object.entries(breakdown).filter(([key]) => allowedKeys.includes(key));

  return (
    <div className="p-3.5 rounded-xl border border-[#27364B] bg-[#131F31]/60 space-y-2 text-xs">
      <div className="text-[11px] font-mono uppercase text-[#A3B3C9] font-semibold">
        Explainable Risk Signals Breakdown
      </div>
      <div className="divide-y divide-[#27364B]/60">
        {entries.map(([key, signal]) => (
          <div key={key} className="py-1.5 flex items-center justify-between font-mono text-[11px]">
            <span className="capitalize text-[#A3B3C9]">{key.replace(/_/g, " ")}</span>
            <span className="text-[#F0F5FC]">
              {signal.score == null
                ? "Pending"
                : typeof signal.score === "number"
                ? `${signal.score.toFixed(1)} pts`
                : signal.label}
            </span>
            <span className="text-[#31E6F7] font-bold">
              {signal.contribution == null ? "—" : `+${signal.contribution} contribution`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
