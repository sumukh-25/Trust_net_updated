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
} from "lucide-react";
import { Layout } from "@/components/Layout";
import PageTransition from "@/components/PageTransition";
import {
  mlBackendService,
  type BackendIncident,
  type SecurityEvent,
} from "@/services/mlBackendService";
import { useAuth } from "@/store/authContext";
import AgentPanel from "@/components/AgentPanel";

const SEVERITY_BADGE: Record<string, string> = {
  Critical: "badge-critical",
  High: "badge-high",
  Medium: "badge-medium",
  Low: "badge-ok",
};

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

  const severityBadge = (severity: string) => SEVERITY_BADGE[severity] ?? "badge-medium";

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
        <div className="tn-content space-y-5">
          {/* Top Title Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-sm shadow-primary/20">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Incident Triage &amp; Response Console
                </h1>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Real-time incident queue, telemetry evidence &amp; autonomous agent co-pilot
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono border bg-amber-500/10 text-amber-400 border-amber-500/30 font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                {activeCount} ACTIVE INCIDENTS
              </span>
              <button
                type="button"
                onClick={() => void refreshIncidents()}
                className="px-2.5 py-1 rounded-md text-xs font-mono border border-border/60 hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                title="Refresh Incidents"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs flex items-center gap-2" role="alert">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="p-3.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-xs flex items-center gap-2" role="status">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {/* 3-Column Enterprise SOC Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* COLUMN 1: Left-Side Incident Queue (span 3) */}
            <section className="lg:col-span-3 space-y-3" aria-label="Incident Queue">
              <div className="p-3 rounded-xl border border-border/60 bg-card/70 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono uppercase text-muted-foreground font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-primary" /> Incident Queue
                  </span>
                  <span>{filteredIncidents.length} items</span>
                </div>

                {/* Filter Selector & Search */}
                <div className="space-y-2">
                  <div className="flex rounded-lg bg-secondary/50 p-0.5 border border-border/50 text-[11px] font-mono">
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className={`flex-1 py-1 rounded text-center transition-colors font-medium ${
                        filter === "all" ? "bg-primary text-primary-foreground font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      All ({incidents.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter("active")}
                      className={`flex-1 py-1 rounded text-center transition-colors font-medium ${
                        filter === "active" ? "bg-primary text-primary-foreground font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Active ({activeCount})
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Filter by user, ID or title…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-background/60 border border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 transition-colors font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Queue List Cards */}
              <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {filteredIncidents.map((incident) => {
                  const isSelected = incident.id === selected?.id;
                  const sevClass = severityBadge(incident.severity);
                  return (
                    <button
                      type="button"
                      key={incident.id}
                      onClick={() => setSelectedId(incident.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all text-xs relative overflow-hidden group ${
                        isSelected
                          ? "bg-card border-primary shadow-md shadow-primary/10 ring-1 ring-primary/40"
                          : "bg-card/50 border-border/50 hover:bg-card hover:border-border"
                      }`}
                    >
                      {/* Left selection accent bar */}
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                      )}

                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-mono text-[11px] font-bold text-foreground">
                          {incident.id}
                        </span>
                        <span className={`badge ${sevClass} text-[10px]`}>{incident.severity}</span>
                      </div>

                      <div className="font-semibold text-foreground truncate mb-1 text-[13px] group-hover:text-primary transition-colors">
                        {incident.title}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                        <span className="truncate max-w-[130px]">User: {incident.user_id}</span>
                        <span className="uppercase text-[10px] font-semibold tracking-wider">
                          {incident.status}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {!loading && filteredIncidents.length === 0 && (
                  <div className="p-6 rounded-xl border border-border/40 text-center text-xs text-muted-foreground bg-card/30">
                    No incidents match current filter.
                  </div>
                )}
              </div>
            </section>

            {/* COLUMN 2: Center Incident Telemetry & Evidence (span 5) */}
            <section className="lg:col-span-5 space-y-4" aria-label="Incident Detail">
              {selected ? (
                <div className="p-4 sm:p-5 rounded-xl border border-border/60 bg-card/70 space-y-4">
                  {/* Selected Incident Heading */}
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-border/40">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-secondary text-foreground font-semibold border border-border/60">
                          {selected.incident_label ? `${selected.incident_label} · ` : ""}
                          {selected.id}
                        </span>
                        <span className={`badge ${severityBadge(selected.severity)}`}>
                          {selected.severity}
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-foreground mt-1.5">
                        {selected.title}
                      </h2>
                      <div className="text-xs text-muted-foreground font-mono flex items-center gap-2 mt-0.5">
                        <span>Target: <strong>{selected.user_id}</strong></span>
                        {selected.device_id && <span>· Device: <strong>{selected.device_id}</strong></span>}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] font-mono uppercase text-muted-foreground">Fused Risk</div>
                      <div className="text-2xl font-bold font-mono text-primary">
                        {selected.risk_score.toFixed(1)}
                        <span className="text-xs text-muted-foreground font-normal"> / 100</span>
                      </div>
                    </div>
                  </div>

                  {/* Evidence Gathered */}
                  <div className="space-y-2">
                    <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-primary" /> Gathered Evidence Signals
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.evidence.length ? (
                        selected.evidence.map((item, index) => (
                          <span
                            key={`${index}-${item}`}
                            className="px-2.5 py-1 rounded-md text-xs bg-secondary/60 border border-border/50 text-foreground font-medium"
                          >
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No evidence details recorded.</span>
                      )}
                    </div>
                  </div>

                  {/* Explainable Risk Signals */}
                  {selected.risk_breakdown && (
                    <RiskBreakdown breakdown={selected.risk_breakdown} />
                  )}

                  {/* Correlated Security Events */}
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <div className="flex items-center justify-between text-xs font-mono uppercase text-muted-foreground font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-primary" /> Correlated Security Events
                      </span>
                      <span>{relatedEvents.length} events</span>
                    </div>

                    {eventsLoading ? (
                      <div className="p-4 text-center text-xs text-muted-foreground font-mono">
                        Retrieving linked audit logs…
                      </div>
                    ) : relatedEvents.length ? (
                      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                        {relatedEvents.map((event) => (
                          <div
                            key={event.id}
                            className="p-2.5 rounded-lg border border-border/40 bg-secondary/30 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between font-mono text-[11px]">
                              <span className="font-semibold text-foreground">{event.id}</span>
                              <span className="text-muted-foreground">
                                {new Date(event.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="font-mono text-foreground flex items-center gap-2">
                              <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary font-bold text-[10px]">
                                {event.http_method}
                              </span>
                              <span className="truncate">{event.request_path}</span>
                              <span className="ml-auto badge badge-medium text-[10px]">
                                {event.status_code ?? "—"}
                              </span>
                            </div>
                            {event.risk_indicators.length > 0 && (
                              <div className="text-[11px] text-muted-foreground font-mono">
                                Signals: {event.risk_indicators.join(", ")}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg border border-border/40 text-center text-xs text-muted-foreground">
                        No request events directly linked to this incident record.
                      </div>
                    )}
                  </div>

                  {/* Incident Lifecycle Action Triggers */}
                  {hasPermission("approve_incidents") && (
                    <div className="pt-3 border-t border-border/40 space-y-2">
                      <div className="text-xs font-mono uppercase text-muted-foreground font-semibold">
                        Analyst Lifecycle Actions
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground border border-border/60 transition-colors"
                          onClick={() => void actOnIncident("escalate")}
                          disabled={acting || ["dismissed", "resolved"].includes(selected.status)}
                        >
                          Escalate
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground border border-border/60 transition-colors"
                          onClick={() => void actOnIncident("dismiss")}
                          disabled={acting || ["dismissed", "resolved"].includes(selected.status)}
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-colors"
                          onClick={() => void actOnIncident("resolve")}
                          disabled={acting || ["dismissed", "resolved"].includes(selected.status)}
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-colors ml-auto"
                          onClick={() => void actOnIncident("approve")}
                          disabled={acting || ["dismissed", "resolved"].includes(selected.status)}
                        >
                          {acting ? "Enforcing…" : "Approve Quarantine"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 rounded-xl border border-border/60 bg-card/60 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-secondary mx-auto flex items-center justify-center text-muted-foreground">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-foreground">No Incident Selected</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
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
                <div className="p-6 rounded-xl border border-border/40 text-center text-xs text-muted-foreground bg-card/30">
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
    <div className="p-3 rounded-lg border border-border/40 bg-secondary/30 space-y-1.5 text-xs">
      <div className="text-[11px] font-mono uppercase text-muted-foreground font-semibold">
        Explainable Risk Signals Breakdown
      </div>
      <div className="divide-y divide-border/30">
        {entries.map(([key, signal]) => (
          <div key={key} className="py-1.5 flex items-center justify-between font-mono text-[11px]">
            <span className="capitalize text-muted-foreground">{key.replace(/_/g, " ")}</span>
            <span className="text-foreground">
              {signal.score == null
                ? "Pending"
                : typeof signal.score === "number"
                ? `${signal.score.toFixed(1)} pts`
                : signal.label}
            </span>
            <span className="text-primary font-bold">
              {signal.contribution == null ? "—" : `+${signal.contribution} contribution`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
