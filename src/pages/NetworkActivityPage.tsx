import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  Globe2,
  Search,
  ShieldAlert,
  Radio,
  Clock,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import PageTransition from "@/components/PageTransition";
import { mlBackendService, type NetworkEvent } from "@/services/mlBackendService";

const FLAG_LABELS: Record<string, string> = {
  rate_anomaly: "Rate Anomaly (>60 req/min)",
  repeated_requests: "Repeated Sensitive Path (>10/min)",
  new_ip_for_user: "Unseen IP For Known User",
  credential_stuffing_pattern: "Credential Stuffing Pattern (>=5 users/IP)",
};

export default function NetworkActivityPage() {
  const [events, setEvents] = useState<NetworkEvent[]>([]);
  const [anomalies, setAnomalies] = useState<NetworkEvent[]>([]);
  const [ipInput, setIpInput] = useState("");
  const [userInput, setUserInput] = useState("");
  const [ipFilter, setIpFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const filters = { ip: ipFilter || undefined, userId: userFilter || undefined, limit: 200 };
      const [eventResult, anomalyResult] = await Promise.all([
        mlBackendService.getNetworkEvents(filters),
        mlBackendService.getNetworkAnomalies(filters),
      ]);
      setEvents(eventResult.events);
      setAnomalies(anomalyResult.anomalies);
      setLastUpdated(new Date());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load network activity.");
    } finally {
      setLoading(false);
    }
  }, [ipFilter, userFilter]);

  useEffect(() => {
    void refresh();
    const unsubscribe = mlBackendService.onThreatEvent((message) => {
      if (message?.type === "network_event" && message.event) {
        const event = message.event as NetworkEvent;
        if ((!ipFilter || event.source_ip === ipFilter) && (!userFilter || event.user_id === userFilter)) {
          setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 200));
          if (event.anomaly_types?.length) {
            setAnomalies((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 200));
          }
          setLastUpdated(new Date());
        }
      } else if (message?.type === "dashboard_update") {
        void refresh();
      }
    });
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [refresh, ipFilter, userFilter]);

  const rateBars = useMemo(() => {
    const now = Date.now();
    return Array.from({ length: 12 }, (_, index) => {
      const bucketEnd = now - (11 - index) * 5 * 60_000;
      const bucketStart = bucketEnd - 5 * 60_000;
      const count = events.filter((event) => {
        const timestamp = Date.parse(event.timestamp);
        return timestamp >= bucketStart && timestamp < bucketEnd;
      }).length;
      return {
        label: new Date(bucketEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        count,
      };
    });
  }, [events]);

  const maxBar = Math.max(1, ...rateBars.map((item) => item.count));
  const oneMinuteCount = events.filter((event) => Date.now() - Date.parse(event.timestamp) <= 60_000).length;
  const anomalyKinds = new Set(anomalies.flatMap((event) => event.anomaly_types ?? []));

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIpFilter(ipInput.trim());
    setUserFilter(userInput.trim());
  }

  return (
    <PageTransition>
      <Layout>
        <div className="tn-content space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-sm shadow-primary/20">
                  <Radio className="w-4 h-4" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Network Telemetry &amp; Request Flow
                </h1>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Real-time API traffic inspection, pattern heuristics &amp; anomalous rate detectors
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                PACKET STREAM LIVE
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono border bg-card text-muted-foreground border-border/60">
                {lastUpdated ? `Sync ${lastUpdated.toLocaleTimeString()}` : "Syncing…"}
              </span>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs flex items-center gap-2" role="alert">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Metric KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard icon={Activity} label="Requests / Last Minute" value={oneMinuteCount} color="hsl(350 100% 59%)" subtitle="High-frequency telemetry" />
            <MetricCard icon={ShieldAlert} label="Flagged Anomalies" value={anomalies.length} color="hsl(38 95% 55%)" subtitle="Heuristic rule violations" />
            <MetricCard icon={Globe2} label="Active Anomaly Types" value={anomalyKinds.size} color="hsl(215 90% 60%)" subtitle="Triggered rule categories" />
            <MetricCard icon={CheckCircle2} label="Buffered Events" value={events.length} color="hsl(142 70% 45%)" subtitle="Retained in active memory" />
          </div>

          {/* Request Volume Chart */}
          <section className="p-4 sm:p-5 rounded-xl border border-border/60 bg-card/70 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-border/40">
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" /> Request Volume Distribution
                </h2>
                <p className="text-[11px] text-muted-foreground">Five-minute time buckets across captured endpoint telemetry</p>
              </div>
              <span className="text-xs font-mono text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded border border-border/40">
                Peak: {maxBar} reqs/bucket
              </span>
            </div>

            {/* Custom Bar Visualization */}
            <div className="h-32 flex items-end gap-2 sm:gap-3 pt-4 px-2 pb-1 bg-background/40 rounded-lg border border-border/40" role="img" aria-label="Observed requests chart">
              {rateBars.map((bar) => {
                const heightPct = Math.max(6, (bar.count / maxBar) * 100);
                return (
                  <div key={bar.label} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                    <span className="text-[10px] font-mono text-muted-foreground group-hover:text-primary transition-colors font-semibold">
                      {bar.count || ""}
                    </span>
                    <div className="w-full max-w-[28px] bg-secondary/80 rounded-t-sm overflow-hidden h-full flex items-end">
                      <div
                        className="w-full bg-gradient-to-t from-primary/60 to-primary group-hover:brightness-125 transition-all rounded-t-sm"
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-mono text-muted-foreground/75 truncate max-w-full">
                      {bar.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] font-mono text-muted-foreground/70">
              Detection rules: &gt;60 requests/min per IP/user; &ge;10 sensitive endpoint requests/min; unseen IP for known account; and credential stuffing patterns (&ge;5 distinct accounts from 1 IP).
            </p>
          </section>

          {/* Search & Filters */}
          <form onSubmit={applyFilters} className="p-3.5 rounded-xl border border-border/60 bg-card/70 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground uppercase font-semibold">Source IP:</span>
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder="Filter by IP (e.g. 198.51.100.10)…"
                className="flex-1 px-3 py-1.5 rounded-lg text-xs font-mono bg-background/80 border border-border/60 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
              />
            </div>

            <div className="flex-1 min-w-[200px] flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground uppercase font-semibold">User ID:</span>
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Filter by user ID…"
                className="flex-1 px-3 py-1.5 rounded-lg text-xs font-mono bg-background/80 border border-border/60 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Search className="w-3.5 h-3.5" /> Apply Filters
              </button>
              {(ipFilter || userFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setIpInput("");
                    setUserInput("");
                    setIpFilter("");
                    setUserFilter("");
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground border border-border/60 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </form>

          {/* Dual Grid: Recent Requests & Flagged Patterns */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Recent Requests Table (span 8) */}
            <section className="lg:col-span-8 p-4 sm:p-5 rounded-xl border border-border/60 bg-card/70 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" /> Recent Request Stream
                </h2>
                <span className="badge badge-medium font-mono text-xs">{events.length} captured</span>
              </div>

              <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                <table className="tn-table w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50 text-left text-muted-foreground font-mono">
                      <th className="py-2.5 px-3">TIMESTAMP</th>
                      <th className="py-2.5 px-3">SOURCE IP</th>
                      <th className="py-2.5 px-3">IDENTITY</th>
                      <th className="py-2.5 px-3">REQUEST PATH</th>
                      <th className="py-2.5 px-3">STATUS</th>
                      <th className="py-2.5 px-3">LATENCY</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30 font-mono text-[11px]">
                    {events.map((event) => {
                      const isError = event.status_code && event.status_code >= 400;
                      return (
                        <tr key={event.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2 px-3 text-muted-foreground">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-2 px-3 font-semibold text-foreground">{event.source_ip}</td>
                          <td className="py-2 px-3">
                            {event.user_id ? (
                              <span className="text-foreground">{event.user_id}</span>
                            ) : (
                              <span className="text-muted-foreground/60 italic">anonymous</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.2 rounded bg-secondary font-bold text-[10px] mr-1.5">
                              {event.method}
                            </span>
                            <span className="text-foreground">{event.endpoint}</span>
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`badge ${
                                isError ? "badge-critical" : "badge-ok"
                              } text-[10px]`}
                            >
                              {event.status_code ?? "AUTH"}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {event.response_time_ms == null ? "—" : `${event.response_time_ms.toFixed(1)} ms`}
                          </td>
                        </tr>
                      );
                    })}

                    {!loading && events.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                          No network requests recorded matching active criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Flagged Patterns (span 4) */}
            <section className="lg:col-span-4 p-4 sm:p-5 rounded-xl border border-border/60 bg-card/70 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" /> Flagged Patterns
                </h2>
                <span className="badge badge-high font-mono text-xs">{anomalies.length} detected</span>
              </div>

              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {anomalies.map((event) => (
                  <article
                    key={event.id}
                    className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs space-y-1.5 transition-all hover:border-amber-500/50"
                  >
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="badge badge-critical text-[10px]">
                        {event.anomaly_types.map((item) => FLAG_LABELS[item] ?? item).join(", ")}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="font-mono text-foreground font-semibold flex items-center gap-2">
                      <span>{event.source_ip}</span>
                      <span>·</span>
                      <span className="text-muted-foreground">{event.user_id ?? "anonymous"}</span>
                    </div>

                    <div className="text-[11px] text-muted-foreground font-mono truncate">
                      {event.evidence || `${event.method} ${event.endpoint}`}
                    </div>
                  </article>
                ))}

                {!loading && anomalies.length === 0 && (
                  <div className="p-8 rounded-lg border border-border/40 text-center text-xs text-muted-foreground bg-secondary/20">
                    No pattern anomalies currently detected in active window.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </Layout>
    </PageTransition>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
  subtitle,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
  subtitle: string;
}) {
  return (
    <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm space-y-1 hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}18`, border: `1px solid ${color}40`, color }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-2xl font-bold font-mono text-foreground">{value}</span>
      </div>
      <div className="text-xs font-mono uppercase text-muted-foreground pt-1">{label}</div>
      <div className="text-[11px] text-muted-foreground/75 truncate">{subtitle}</div>
    </div>
  );
}
