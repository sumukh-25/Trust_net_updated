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
import { SpotlightCard } from "@/components/ui/SpotlightCard";
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
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1750px] mx-auto bg-[#050810] min-h-screen">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#27364B] pb-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#4DA3FF]/10 border border-[#4DA3FF]/30 flex items-center justify-center text-[#4DA3FF] shadow-sm shadow-[#4DA3FF]/10">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F0F5FC] flex items-center gap-2">
                    Network Telemetry &amp; Request Flow
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded border border-[#4DA3FF]/30 bg-[#4DA3FF]/10 text-[#4DA3FF]">
                      PACKET PIPELINE
                    </span>
                  </h1>
                  <p className="text-xs text-[#A3B3C9]">
                    Real-time API traffic inspection, heuristic pattern detection, and anomalous rate limiters
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1.5 rounded-lg text-[11px] font-mono border bg-[#46E6A5]/10 text-[#46E6A5] border-[#46E6A5]/30 font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#46E6A5] animate-pulse" />
                PACKET STREAM LIVE
              </span>
              <span className="px-3 py-1.5 rounded-lg text-[11px] font-mono border bg-[#131F31] text-[#A3B3C9] border-[#27364B]">
                {lastUpdated ? `Sync ${lastUpdated.toLocaleTimeString()}` : "Syncing…"}
              </span>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl border border-[#FF304F]/40 bg-[#FF304F]/10 text-[#FF304F] text-xs flex items-center gap-2" role="alert">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Metric KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <SpotlightCard className="p-4 bg-[#0E1726]/90 border border-[#27364B]">
              <div className="flex items-center justify-between text-xs font-mono text-[#A3B3C9]">
                <span>REQUESTS / LAST MINUTE</span>
                <Activity className="w-4 h-4 text-[#4DA3FF]" />
              </div>
              <div className="text-2xl font-bold font-mono text-[#F0F5FC] my-1">{oneMinuteCount}</div>
              <div className="text-[11px] text-[#A3B3C9]">High-frequency API stream</div>
            </SpotlightCard>

            <SpotlightCard className="p-4 bg-[#0E1726]/90 border border-[#27364B]">
              <div className="flex items-center justify-between text-xs font-mono text-[#A3B3C9]">
                <span>FLAGGED ANOMALIES</span>
                <ShieldAlert className="w-4 h-4 text-[#FF304F]" />
              </div>
              <div className="text-2xl font-bold font-mono text-[#FF304F] my-1">{anomalies.length}</div>
              <div className="text-[11px] text-[#A3B3C9]">Heuristic rule violations</div>
            </SpotlightCard>

            <SpotlightCard className="p-4 bg-[#0E1726]/90 border border-[#27364B]">
              <div className="flex items-center justify-between text-xs font-mono text-[#A3B3C9]">
                <span>ANOMALY PATTERN TYPES</span>
                <Globe2 className="w-4 h-4 text-[#9A8CFF]" />
              </div>
              <div className="text-2xl font-bold font-mono text-[#9A8CFF] my-1">{anomalyKinds.size}</div>
              <div className="text-[11px] text-[#A3B3C9]">Triggered pattern signatures</div>
            </SpotlightCard>

            <SpotlightCard className="p-4 bg-[#0E1726]/90 border border-[#27364B]">
              <div className="flex items-center justify-between text-xs font-mono text-[#A3B3C9]">
                <span>BUFFERED PACKETS</span>
                <CheckCircle2 className="w-4 h-4 text-[#46E6A5]" />
              </div>
              <div className="text-2xl font-bold font-mono text-[#46E6A5] my-1">{events.length}</div>
              <div className="text-[11px] text-[#A3B3C9]">Retained in telemetry memory</div>
            </SpotlightCard>
          </div>

          {/* Request Volume Chart */}
          <section className="p-5 rounded-2xl border border-[#27364B] bg-[#0E1726]/90 backdrop-blur-md space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#27364B]">
              <div>
                <h2 className="text-sm font-bold text-[#F0F5FC] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#31E6F7]" /> Request Volume Distribution
                </h2>
                <p className="text-[11px] text-[#A3B3C9]">Five-minute time buckets across captured endpoint telemetry</p>
              </div>
              <span className="text-xs font-mono text-[#31E6F7] bg-[#131F31] px-2.5 py-1 rounded-md border border-[#27364B]">
                Peak: {maxBar} reqs/bucket
              </span>
            </div>

            {/* Custom Bar Visualization */}
            <div className="h-32 flex items-end gap-2 sm:gap-3 pt-4 px-2 pb-1 bg-[#050810]/70 rounded-xl border border-[#27364B]" role="img" aria-label="Observed requests chart">
              {rateBars.map((bar) => {
                const heightPct = Math.max(8, (bar.count / maxBar) * 100);
                return (
                  <div key={bar.label} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                    <span className="text-[10px] font-mono text-[#A3B3C9] group-hover:text-[#31E6F7] transition-colors font-semibold">
                      {bar.count || ""}
                    </span>
                    <div className="w-full max-w-[28px] bg-[#131F31] rounded-t-sm overflow-hidden h-full flex items-end">
                      <div
                        className="w-full bg-gradient-to-t from-[#4DA3FF]/40 to-[#31E6F7] group-hover:brightness-125 transition-all rounded-t-sm shadow-sm shadow-[#31E6F7]/20"
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-mono text-[#A3B3C9]/75 truncate max-w-full">
                      {bar.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] font-mono text-[#A3B3C9]">
              Active Heuristics: &gt;60 req/min per IP/user; &ge;10 sensitive endpoint reqs/min; unseen IP for known account; credential stuffing patterns.
            </p>
          </section>

          {/* Search & Filters */}
          <form onSubmit={applyFilters} className="p-4 rounded-2xl border border-[#27364B] bg-[#0E1726]/90 flex flex-wrap items-center gap-3 shadow-lg">
            <div className="flex-1 min-w-[200px] flex items-center gap-2">
              <span className="text-xs font-mono text-[#A3B3C9] uppercase font-semibold">Source IP:</span>
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder="Filter by IP (e.g. 198.51.100.10)…"
                className="flex-1 px-3 py-1.5 rounded-lg text-xs font-mono bg-[#050810] border border-[#27364B] text-[#F0F5FC] placeholder:text-[#6F829D] focus:outline-none focus:border-[#31E6F7]/60"
              />
            </div>

            <div className="flex-1 min-w-[200px] flex items-center gap-2">
              <span className="text-xs font-mono text-[#A3B3C9] uppercase font-semibold">User ID:</span>
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Filter by user ID…"
                className="flex-1 px-3 py-1.5 rounded-lg text-xs font-mono bg-[#050810] border border-[#27364B] text-[#F0F5FC] placeholder:text-[#6F829D] focus:outline-none focus:border-[#31E6F7]/60"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#31E6F7] hover:bg-[#31E6F7]/85 text-[#050810] flex items-center gap-1.5 transition-colors shadow-sm"
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
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#131F31] hover:bg-[#19283B] text-[#F0F5FC] border border-[#27364B] transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </form>

          {/* Dual Grid: Recent Requests & Flagged Patterns */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Recent Requests Table (span 8) */}
            <section className="lg:col-span-8 p-5 rounded-2xl border border-[#27364B] bg-[#0E1726]/90 backdrop-blur-md space-y-3 shadow-xl">
              <div className="flex items-center justify-between pb-3.5 border-b border-[#27364B]">
                <h2 className="text-sm font-bold text-[#F0F5FC] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#31E6F7]" /> Recent Request Stream
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#131F31] text-[#31E6F7] border border-[#27364B]">
                  {events.length} captured
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#27364B] text-left text-[#A3B3C9] font-mono text-[11px]">
                      <th className="py-2.5 px-3">TIMESTAMP</th>
                      <th className="py-2.5 px-3">METHOD &amp; PATH</th>
                      <th className="py-2.5 px-3">USER / IP</th>
                      <th className="py-2.5 px-3">STATUS</th>
                      <th className="py-2.5 px-3">HEURISTICS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#27364B]/50 font-mono">
                    {events.slice(0, 15).map((event) => {
                      const isAnomalous = event.anomaly_types && event.anomaly_types.length > 0;
                      return (
                        <tr key={event.id} className="hover:bg-[#131F31]/60 transition-colors">
                          <td className="py-2.5 px-3 text-[#A3B3C9] whitespace-nowrap">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="px-1.5 py-0.5 rounded bg-[#31E6F7]/15 text-[#31E6F7] font-bold text-[10px] mr-2">
                              {event.method}
                            </span>
                            <span className="text-[#F0F5FC] font-sans font-medium">{event.endpoint}</span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="text-[#F0F5FC] font-semibold">{event.user_id}</div>
                            <div className="text-[10px] text-[#A3B3C9]">{event.source_ip}</div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              event.status_code && event.status_code >= 400
                                ? "bg-[#FF304F]/15 text-[#FF304F] border-[#FF304F]/40"
                                : "bg-[#46E6A5]/15 text-[#46E6A5] border-[#46E6A5]/40"
                            }`}>
                              {event.status_code || 200}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {isAnomalous ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FF304F]/15 text-[#FF304F] border border-[#FF304F]/40">
                                {event.anomaly_types.join(", ")}
                              </span>
                            ) : (
                              <span className="text-[#46E6A5] text-[11px]">Nominal</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Flagged Anomalies Stream (span 4) */}
            <section className="lg:col-span-4 p-5 rounded-2xl border border-[#27364B] bg-[#0E1726]/90 backdrop-blur-md space-y-3 shadow-xl">
              <div className="flex items-center justify-between pb-3.5 border-b border-[#27364B]">
                <h2 className="text-sm font-bold text-[#F0F5FC] flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#FF304F]" /> Flagged Anomalies
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#FF304F]/15 text-[#FF304F] border border-[#FF304F]/40">
                  {anomalies.length} active
                </span>
              </div>

              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {anomalies.length ? (
                  anomalies.map((anomaly) => (
                    <div
                      key={anomaly.id}
                      className="p-3 rounded-xl border border-[#FF304F]/30 bg-[#FF304F]/5 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-bold text-[#FF304F]">{anomaly.source_ip}</span>
                        <span className="text-[#A3B3C9]">{new Date(anomaly.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="font-semibold text-[#F0F5FC] truncate">User: {anomaly.user_id}</div>
                      <div className="text-[11px] text-[#A3B3C9] font-mono truncate">{anomaly.endpoint}</div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {anomaly.anomaly_types?.map((type) => (
                          <span
                            key={type}
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FF304F]/20 text-[#FF304F]"
                          >
                            {FLAG_LABELS[type] || type}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-[#A3B3C9] bg-[#131F31]/30 rounded-xl border border-[#27364B]">
                    No anomalous packets detected in active memory.
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
