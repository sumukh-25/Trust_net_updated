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
  type LucideIcon,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { NetworkGraph } from "@/components/NetworkGraph";
import PageTransition from "@/components/PageTransition";
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
  const { hasPermission } = useAuth();
  const { nodes } = useSecurity();

  const refreshDashboard = useCallback(async () => {
    try {
      const [nextSummary, nextDevices] = await Promise.all([
        mlBackendService.getDashboardSummary(),
        mlBackendService.getDevices(),
      ]);
      setSummary(nextSummary);
      setDevices(nextDevices.devices);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load live dashboard data.");
    }
  }, []);

  useEffect(() => {
    void refreshDashboard();
    const unsubscribe = mlBackendService.onThreatEvent((event) => {
      if (
        event?.type === "dashboard_update" ||
        event?.type === "login_threat" ||
        event?.type === "attack_chain"
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

  const summaryIncidents = summary?.recent_incidents ?? [];
  const activeIncidents = summary?.active_incident_count ?? 0;
  const deviceCounts = summary?.device_counts;

  return (
    <PageTransition>
      <Layout>
        <div className="tn-content space-y-6">
          {/* Top Title Bar with System Status */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-sm shadow-primary/20">
                  <Shield className="w-4 h-4" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Cybersecurity Command Centre
                </h1>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Real-time threat monitoring, identity risk fusion &amp; autonomous agent guardrails
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1.5 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                DEFENSE ENGINE ACTIVE
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono border bg-card text-muted-foreground border-border/60">
                AI CO-PILOT v2.4
              </span>
            </div>
          </div>

          {/* KPI Metrics Grid */}
          <div className="kpi-grid">
            <KpiCard
              icon={TrendingUp}
              color="hsl(350 100% 59%)"
              label="Average User Risk"
              value={summary ? summary.overall_risk.average.toFixed(1) : "—"}
              badge={{
                text: summary ? `${summary.overall_risk.users_scored} scored` : "Loading",
                cls: "badge-medium",
              }}
              sub={
                summary
                  ? `Peak risk: ${summary.overall_risk.maximum.toFixed(1)} / 100`
                  : "Connecting to risk engine"
              }
            />

            <KpiCard
              icon={AlertTriangle}
              color="hsl(20 95% 55%)"
              label="Active Incidents"
              value={summary ? String(activeIncidents).padStart(2, "0") : "—"}
              badge={{
                text: activeIncidents ? "Action Required" : "Nominal",
                cls: activeIncidents ? "badge-critical" : "badge-ok",
              }}
              sub="Requiring analyst review or containment"
            />

            <KpiCard
              icon={ShieldCheck}
              color="hsl(142 70% 45%)"
              label="Trusted Devices"
              value={deviceCounts ? String(deviceCounts.trusted).padStart(2, "0") : "—"}
              badge={{
                text: deviceCounts ? `${deviceCounts.total} total` : "Loading",
                cls: "badge-ok",
              }}
              sub="Cryptographically registered fingerprints"
            />

            <KpiCard
              icon={Laptop}
              color="hsl(38 95% 55%)"
              label="Devices Requiring Review"
              value={
                deviceCounts
                  ? String(deviceCounts.unknown + deviceCounts.flagged).padStart(2, "0")
                  : "—"
              }
              badge={{
                text: deviceCounts?.flagged ? `${deviceCounts.flagged} flagged` : "Registry",
                cls: deviceCounts?.flagged ? "badge-critical" : "badge-medium",
              }}
              sub={
                deviceCounts
                  ? `${deviceCounts.unknown} unknown · ${deviceCounts.flagged} quarantined`
                  : "Querying device registry"
              }
            />

            <Link
              to="/network-activity"
              className="overview-network-kpi-link group"
              aria-label="View Network Activity anomalies"
            >
              <KpiCard
                icon={Radio}
                color="hsl(280 80% 65%)"
                label="Network Anomalies"
                value={
                  summary ? String(summary.network_anomalies).padStart(2, "0") : "—"
                }
                badge={{
                  text: summary?.network_anomalies ? "Flagged" : "Clear",
                  cls: summary?.network_anomalies ? "badge-high" : "badge-ok",
                }}
                sub="Live request behavioral anomalies →"
              />
            </Link>
          </div>

          {loadError && (
            <div
              className="p-3.5 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs flex items-center gap-2"
              role="status"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Live backend data unavailable: {loadError}. Reconnecting automatically…</span>
            </div>
          )}

          {/* Topology and Device Registry widescreen SOC layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Prominent Central Live Network Topology Stage (span 8) */}
            <section className="lg:col-span-8 panel panel-glow p-4 sm:p-5 rounded-xl border border-border/60 bg-card/70 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    <div>
                      <span className="font-bold text-sm text-foreground">Live Network Topology &amp; Attack Propagation</span>
                      <p className="text-[11px] text-muted-foreground hidden sm:block">Interactive threat graph · Hover or click nodes to pin telemetry inspector</p>
                    </div>
                  </div>
                  <span className="badge badge-medium font-mono text-xs">{nodes.length} entities</span>
                </div>
                <div className="bg-radial-red my-3 rounded-lg overflow-hidden border border-border/40 min-h-[340px]" aria-label="Live topology of registered users, devices, and protected assets">
                  {nodes.length ? (
                    <NetworkGraph width={800} height={340} />
                  ) : (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      Topology data is compiling from backend identity graph…
                    </div>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-2 border-t border-border/30">
                <span className="font-mono text-[10px]">Real-time edge flow · Threat path simulation</span>
                <Link to="/propagation" className="text-primary hover:underline flex items-center gap-1 font-semibold">
                  Risk Propagation View <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </section>

            {/* Registered Devices Companion Panel (span 4) */}
            <section className="lg:col-span-4 panel panel-glow p-4 sm:p-5 rounded-xl border border-border/60 bg-card/70 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-primary" />
                    <span className="font-bold text-sm text-foreground">Registered Devices</span>
                  </div>
                  <span className="badge badge-medium font-mono text-xs">{deviceCounts?.total ?? 0} tracked</span>
                </div>

                <div className="space-y-2 my-3">
                  {devices.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No device fingerprints registered in database yet.
                    </div>
                  ) : (
                    devices.slice(0, 5).map((device) => (
                      <div
                        className="p-2.5 rounded-lg border border-border/40 bg-secondary/30 flex items-center justify-between gap-3 text-xs"
                        key={device.device_id}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded bg-card flex items-center justify-center text-muted-foreground border border-border/50 flex-shrink-0">
                            <Laptop className="w-3.5 h-3.5" />
                          </div>
                          <div className="truncate">
                            <div className="font-semibold text-foreground truncate">{device.label}</div>
                            <div className="text-[11px] text-muted-foreground font-mono truncate">
                              {device.user_id} · {new Date(device.last_seen).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className={`badge ${
                              device.trust_status === "trusted"
                                ? "badge-ok"
                                : device.trust_status === "flagged"
                                ? "badge-critical"
                                : "badge-high"
                            }`}
                          >
                            {device.trust_status}
                          </span>

                          {device.trust_status === "unknown" && hasPermission("manage_devices") && (
                            <button
                              type="button"
                              className="px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[11px] transition-colors"
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

              <div className="text-[11px] text-muted-foreground pt-2 border-t border-border/30">
                Fingerprints are marked unknown until authorized. CSI/RF hardware is excluded.
              </div>
            </section>
          </div>

          {/* Recent Incidents Table */}
          <section className="panel panel-glow p-4 sm:p-5 rounded-xl border border-border/60 bg-card/70 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-primary" />
                <span className="font-bold text-sm text-foreground">Recent Security Incidents</span>
              </div>
              <Link
                to="/incidents"
                className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
              >
                Open Incident Center <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="tn-table w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 text-left text-muted-foreground">
                    <th className="py-2.5 px-3">INCIDENT ID</th>
                    <th className="py-2.5 px-3">SUMMARY & TARGET</th>
                    <th className="py-2.5 px-3">SEVERITY</th>
                    <th className="py-2.5 px-3">AGENT STATUS</th>
                    <th className="py-2.5 px-3">LIFECYCLE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {summaryIncidents.length ? (
                    summaryIncidents.map((incident) => (
                      <IncidentRow key={incident.id} incident={incident} />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted-foreground">
                        No incidents logged in the SQLite ledger yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Footer disclosure */}
          <div className="p-3 rounded-lg border border-border/40 bg-card/30 text-[11px] font-mono text-muted-foreground/75 flex items-center justify-between">
            <span>DATA PROVENANCE: SQLite Persisted State · Synthetic Demonstration Scenarios</span>
            <span>TRUSTNET GUARDIAN SOC</span>
          </div>
        </div>
      </Layout>
    </PageTransition>
  );
}

function KpiCard({
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
  value: ReactNode;
  badge: { text: string; cls: string };
  sub: string;
}) {
  return (
    <div className="panel panel-glow card-3d p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm relative overflow-hidden transition-all duration-300 hover:border-primary/50 group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}18`, border: `1px solid ${color}40`, color }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span className={`badge ${badge.cls} text-[10px]`}>{badge.text}</span>
      </div>

      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold font-mono tracking-tight text-foreground my-1 group-hover:text-primary transition-colors">
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground/80 truncate">{sub}</div>
    </div>
  );
}

function IncidentRow({ incident }: { incident: BackendIncident }) {
  const severity = incident.severity.toLowerCase();
  const badge =
    severity === "critical"
      ? "badge-critical"
      : severity === "high"
      ? "badge-high"
      : "badge-medium";

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="py-2.5 px-3 font-mono font-medium text-foreground">{incident.id}</td>
      <td className="py-2.5 px-3">
        <div className="font-semibold text-foreground">{incident.title}</div>
        <div className="text-[11px] text-muted-foreground font-mono">
          User: {incident.user_id}
          {incident.device_id ? ` · Dev: ${incident.device_id}` : ""}
        </div>
      </td>
      <td className="py-2.5 px-3">
        <span className={`badge ${badge}`}>{incident.severity}</span>
      </td>
      <td className="py-2.5 px-3">
        <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-primary" /> Co-Pilot Ready
        </span>
      </td>
      <td className="py-2.5 px-3">
        <span
          className={`badge ${
            incident.status === "resolved"
              ? "badge-ok"
              : incident.status === "dismissed"
              ? "badge-medium"
              : "badge-high"
          }`}
        >
          {incident.status}
        </span>
      </td>
    </tr>
  );
}
