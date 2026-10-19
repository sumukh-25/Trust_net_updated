import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  Layers,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  User,
  Zap,
  ArrowRight,
  Filter,
  Radio,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import PageTransition from "@/components/PageTransition";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { mlBackendService, type NetworkEvent } from "@/services/mlBackendService";

const RANGES = ["1H", "6H", "24H", "7D", "30D"] as const;
type Range = (typeof RANGES)[number];

function getRangeMs(range: Range): number {
  switch (range) {
    case "1H":
      return 60 * 60_000;
    case "6H":
      return 6 * 60 * 60_000;
    case "24H":
      return 24 * 60 * 60_000;
    case "7D":
      return 7 * 24 * 60 * 60_000;
    case "30D":
      return 30 * 24 * 60 * 60_000;
  }
}

export default function BehaviorAnalyticsPage() {
  const [range, setRange] = useState<Range>("7D");
  const [events, setEvents] = useState<NetworkEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [hoveredBucketIndex, setHoveredBucketIndex] = useState<number | null>(null);
  const [selectedEntityFilter, setSelectedEntityFilter] = useState<string | null>(null);
  const [selectedHourFilter, setSelectedHourFilter] = useState<number | null>(null);
  const [selectedAnomalyEvent, setSelectedAnomalyEvent] = useState<NetworkEvent | null>(null);
  const [entitySearch, setEntitySearch] = useState("");
  const [zoomLevel, setZoomLevel] = useState<1 | 2>(1);

  const refresh = useCallback(async () => {
    try {
      const result = await mlBackendService.getNetworkEvents({ limit: 1000 });
      setEvents(result.events);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load stored behavior events.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedAnomalyEvent(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const now = Date.now();
  const rangeMs = getRangeMs(range);
  const rangeStart = now - rangeMs;

  // Filtered Events by time, entity, and clicked hour
  const rangedEvents = useMemo(() => {
    return events.filter((event) => {
      const timestamp = Date.parse(event.timestamp);
      if (!Number.isFinite(timestamp) || timestamp < rangeStart || timestamp > now) return false;
      if (selectedEntityFilter) {
        if (event.user_id !== selectedEntityFilter && event.endpoint !== selectedEntityFilter) {
          return false;
        }
      }
      if (selectedHourFilter !== null) {
        const hour = new Date(timestamp).getHours();
        if (hour !== selectedHourFilter) return false;
      }
      return true;
    });
  }, [events, rangeStart, now, selectedEntityFilter, selectedHourFilter]);

  const baseBucketCount = range === "1H" ? 12 : range === "6H" ? 18 : range === "24H" ? 24 : range === "7D" ? 14 : 30;
  const bucketCount = baseBucketCount * zoomLevel;
  const bucketMs = rangeMs / bucketCount;

  const buckets = useMemo(() => {
    const list = Array.from({ length: bucketCount }, (_, index) => {
      const start = rangeStart + index * bucketMs;
      const date = new Date(start);
      return {
        timestamp: start,
        label: range === "1H" || range === "6H" || range === "24H"
          ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : date.toLocaleDateString([], { month: "short", day: "numeric" }),
        requests: 0,
        anomalies: 0,
        flaggedEvents: [] as NetworkEvent[],
      };
    });

    for (const event of rangedEvents) {
      const index = Math.min(bucketCount - 1, Math.floor((Date.parse(event.timestamp) - rangeStart) / bucketMs));
      if (index >= 0 && index < bucketCount) {
        list[index].requests += 1;
        if (event.anomaly_types && event.anomaly_types.length > 0) {
          list[index].anomalies += 1;
          list[index].flaggedEvents.push(event);
        }
      }
    }
    return list;
  }, [rangedEvents, bucketCount, rangeStart, bucketMs, range]);

  const maxRequests = Math.max(1, ...buckets.map((b) => b.requests));
  const maxAnomalies = Math.max(1, ...buckets.map((b) => b.anomalies));

  // Compute rolling mean baseline for requests
  const meanRequests = buckets.reduce((acc, b) => acc + b.requests, 0) / (buckets.length || 1);

  // SVG dimensions
  const svgWidth = 1000;
  const svgHeight = 220;
  const paddingX = 24;
  const paddingY = 25;
  const innerWidth = svgWidth - paddingX * 2;
  const innerHeight = svgHeight - paddingY * 2;

  const linePoints = useCallback((key: "requests" | "anomalies") => {
    return buckets.map((bucket, index) => {
      const x = paddingX + (index / (bucketCount - 1)) * innerWidth;
      const maxVal = key === "requests" ? maxRequests : maxAnomalies;
      const y = paddingY + innerHeight - (bucket[key] / maxVal) * innerHeight;
      return [x, y] as const;
    });
  }, [buckets, bucketCount, innerWidth, innerHeight, maxRequests, maxAnomalies]);

  const requestPoints = useMemo(() => linePoints("requests"), [linePoints]);
  const anomalyPoints = useMemo(() => linePoints("anomalies"), [linePoints]);

  const requestPolyline = requestPoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const anomalyPolyline = anomalyPoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  const anomalyFillArea = `${anomalyPolyline} ${paddingX + innerWidth},${paddingY + innerHeight} ${paddingX},${paddingY + innerHeight}`;
  const requestFillArea = `${requestPolyline} ${paddingX + innerWidth},${paddingY + innerHeight} ${paddingX},${paddingY + innerHeight}`;

  // Baseline y position
  const baselineY = paddingY + innerHeight - (meanRequests / maxRequests) * innerHeight;

  // 24-Hour Diurnal Activity Matrix (computed across all range events to see true distribution)
  const hourCounts = useMemo(() => {
    const counts = Array.from({ length: 24 }, () => ({ requests: 0, anomalies: 0 }));
    for (const event of events) {
      const timestamp = Date.parse(event.timestamp);
      if (!Number.isFinite(timestamp) || timestamp < rangeStart || timestamp > now) continue;
      const h = new Date(timestamp).getHours();
      counts[h].requests += 1;
      if (event.anomaly_types && event.anomaly_types.length > 0) {
        counts[h].anomalies += 1;
      }
    }
    return counts;
  }, [events, rangeStart, now]);

  const maxHourCount = Math.max(1, ...hourCounts.map((h) => h.requests));

  // Top Flagged Entities
  const entityStats = useMemo(() => {
    const map = new Map<string, { requests: number; anomalies: number; lastSeen: string; type: string }>();
    for (const event of rangedEvents) {
      const key = event.user_id || event.endpoint || "Unknown";
      const existing = map.get(key) || { requests: 0, anomalies: 0, lastSeen: event.timestamp, type: event.user_id ? "User" : "Endpoint" };
      existing.requests += 1;
      if (event.anomaly_types && event.anomaly_types.length > 0) {
        existing.anomalies += event.anomaly_types.length;
      }
      map.set(key, existing);
    }
    return [...map.entries()]
      .filter(([key]) => !entitySearch.trim() || key.toLowerCase().includes(entitySearch.toLowerCase()))
      .sort((a, b) => b[1].anomalies - a[1].anomalies || b[1].requests - a[1].requests)
      .slice(0, 8);
  }, [rangedEvents, entitySearch]);

  const totalAnomalies = rangedEvents.filter((e) => e.anomaly_types && e.anomaly_types.length > 0).length;
  const activeBucket = hoveredBucketIndex !== null ? buckets[hoveredBucketIndex] : null;

  return (
    <PageTransition>
      <Layout>
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1750px] mx-auto bg-[#050810] min-h-screen">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#28364A] pb-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#A99BFF]/10 border border-[#A99BFF]/30 flex items-center justify-center text-[#A99BFF] shadow-sm shadow-[#A99BFF]/10">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#E8EEF7] flex items-center gap-2">
                    Behavior Analytics Console
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded border border-[#A99BFF]/30 bg-[#A99BFF]/10 text-[#A99BFF]">
                      ML DETECTOR
                    </span>
                  </h1>
                  <p className="text-xs text-[#92A0B5]">
                    Time-series request anomaly deviations, diurnal rate spikes, and behavioral signature classification
                  </p>
                </div>
              </div>
            </div>

            {/* Active Filters & Time Window Switcher */}
            <div className="flex flex-wrap items-center gap-2">
              {selectedEntityFilter && (
                <button
                  type="button"
                  onClick={() => setSelectedEntityFilter(null)}
                  className="px-2.5 py-1 rounded-md text-xs font-mono text-[#55DDE0] bg-[#55DDE0]/10 border border-[#55DDE0]/30 flex items-center gap-1.5 transition-colors"
                >
                  Entity: {selectedEntityFilter} ✕
                </button>
              )}
              {selectedHourFilter !== null && (
                <button
                  type="button"
                  onClick={() => setSelectedHourFilter(null)}
                  className="px-2.5 py-1 rounded-md text-xs font-mono text-[#F4BD62] bg-[#F4BD62]/10 border border-[#F4BD62]/30 flex items-center gap-1.5 transition-colors"
                >
                  Hour: {selectedHourFilter}:00 ✕
                </button>
              )}

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 p-1 rounded-xl border border-[#28364A] bg-[#101827]/90 backdrop-blur-md text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setZoomLevel(zoomLevel === 1 ? 2 : 1)}
                  className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                    zoomLevel === 2 ? "bg-[#55DDE0]/20 text-[#55DDE0]" : "text-[#92A0B5] hover:text-[#E8EEF7]"
                  }`}
                  title="Toggle 2x Time Resolution"
                >
                  {zoomLevel === 2 ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                  <span>{zoomLevel}x</span>
                </button>
              </div>

              {/* Time Range Presets */}
              <div className="flex items-center gap-1 p-1 rounded-xl border border-[#28364A] bg-[#101827]/90 backdrop-blur-md shadow-lg text-xs font-mono">
                {RANGES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setRange(item);
                      setSelectedHourFilter(null);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg transition-all ${
                      range === item
                        ? "bg-[#55DDE0]/20 text-[#55DDE0] font-bold border border-[#55DDE0]/40 shadow-sm"
                        : "text-[#92A0B5] hover:text-[#E8EEF7] hover:bg-[#151F30]"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loadError && (
            <div className="p-3.5 rounded-xl border border-[#FF647C]/40 bg-[#FF647C]/10 text-[#FF647C] text-xs flex items-center gap-2" role="alert">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[#FF647C]" />
              <span>Behavior telemetry unavailable: {loadError}</span>
            </div>
          )}

          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <SpotlightCard className="p-4 bg-[#101827]/90 border border-[#28364A]">
              <div className="flex items-center justify-between text-xs font-mono text-[#92A0B5]">
                <span>EVALUATED REQUESTS</span>
                <Clock className="w-4 h-4 text-[#5B8CFF]" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-[#E8EEF7] my-1">
                {rangedEvents.length}
              </div>
              <div className="text-[11px] text-[#92A0B5]">
                {selectedHourFilter !== null ? `Hour ${selectedHourFilter}:00 subset` : `In selected ${range} window`}
              </div>
            </SpotlightCard>

            <SpotlightCard className="p-4 bg-[#101827]/90 border border-[#28364A]">
              <div className="flex items-center justify-between text-xs font-mono text-[#92A0B5]">
                <span>BEHAVIORAL ANOMALIES</span>
                <ShieldAlert className="w-4 h-4 text-[#FF647C]" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-[#FF647C] my-1">
                {totalAnomalies}
              </div>
              <div className="text-[11px] text-[#92A0B5]">
                {totalAnomalies > 0 ? "Exceeding baseline standard deviations" : "Within nominal statistical threshold"}
              </div>
            </SpotlightCard>

            <SpotlightCard className="p-4 bg-[#101827]/90 border border-[#28364A]">
              <div className="flex items-center justify-between text-xs font-mono text-[#92A0B5]">
                <span>ANOMALY RATIO</span>
                <TrendingUp className="w-4 h-4 text-[#F4BD62]" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-[#F4BD62] my-1">
                {rangedEvents.length ? ((totalAnomalies / rangedEvents.length) * 100).toFixed(1) : 0}%
              </div>
              <div className="text-[11px] text-[#92A0B5]">Deviating requests vs total stream</div>
            </SpotlightCard>

            <SpotlightCard className="p-4 bg-[#101827]/90 border border-[#28364A]">
              <div className="flex items-center justify-between text-xs font-mono text-[#92A0B5]">
                <span>AI BASELINE ENGINE</span>
                <Sparkles className="w-4 h-4 text-[#A99BFF]" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-[#A99BFF] my-1">
                Active
              </div>
              <div className="text-[11px] text-[#92A0B5]">Isolation Forest + LSTM Sequence</div>
            </SpotlightCard>
          </div>

          {/* Interactive Signature Anomaly Time-Series Visualizer */}
          <section className="rounded-2xl border border-[#28364A] bg-[#101827]/95 backdrop-blur-md p-5 shadow-2xl relative">
            <div className="flex flex-wrap items-center justify-between pb-4 border-b border-[#28364A] gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-[#E8EEF7]">Anomaly Deviation Timeline</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#151F30] text-[#55DDE0] border border-[#28364A]">
                    INTERACTIVE SCRUBBER
                  </span>
                </div>
                <p className="text-[11px] text-[#92A0B5] mt-0.5">
                  Hover to scrub time buckets · Click anomaly dots to inspect full request evidence · Dashed line shows statistical mean baseline
                </p>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-[#92A0B5]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF647C]" />
                  <span>Flagged Anomalies</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#5B8CFF]" />
                  <span>Observed Requests</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 border-t border-dashed border-[#5B8CFF]/80" />
                  <span>Baseline Mean ({meanRequests.toFixed(1)})</span>
                </span>
              </div>
            </div>

            {/* SVG Visualizer Canvas */}
            <div
              className="relative my-4 select-none cursor-crosshair"
              onMouseLeave={() => setHoveredBucketIndex(null)}
            >
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-56 overflow-visible"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * svgWidth;
                  const clampedX = Math.max(paddingX, Math.min(paddingX + innerWidth, x));
                  const index = Math.round(((clampedX - paddingX) / innerWidth) * (bucketCount - 1));
                  setHoveredBucketIndex(index);
                }}
              >
                <defs>
                  <linearGradient id="anomalyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF647C" stopOpacity="0.45" />
                    <stop offset="85%" stopColor="#FF647C" stopOpacity="0.05" />
                    <stop offset="100%" stopColor="#FF647C" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="requestGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5B8CFF" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#5B8CFF" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Grid Guidelines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = paddingY + innerHeight * (1 - ratio);
                  return (
                    <line
                      key={ratio}
                      x1={paddingX}
                      y1={y}
                      x2={paddingX + innerWidth}
                      y2={y}
                      stroke="rgba(40, 54, 74, 0.4)"
                      strokeDasharray="4 4"
                    />
                  );
                })}

                {/* Statistical Mean Baseline (Dashed Line) */}
                <line
                  x1={paddingX}
                  y1={baselineY}
                  x2={paddingX + innerWidth}
                  y2={baselineY}
                  stroke="rgba(91, 140, 255, 0.6)"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />

                {/* Request Baseline Volume (Blue Area & Line) */}
                <polygon points={requestFillArea} fill="url(#requestGradient)" />
                <polyline
                  points={requestPolyline}
                  fill="none"
                  stroke="#5B8CFF"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Anomaly Spikes (Red Area & Glowing Line) */}
                {totalAnomalies > 0 && (
                  <>
                    <polygon points={anomalyFillArea} fill="url(#anomalyGradient)" />
                    <polyline
                      points={anomalyPolyline}
                      fill="none"
                      stroke="#FF647C"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                )}

                {/* Individual Anomaly Marker Dots - Clickable to open dossier */}
                {anomalyPoints.map(([x, y], idx) => {
                  const b = buckets[idx];
                  if (b.anomalies === 0) return null;
                  const isHovered = hoveredBucketIndex === idx;
                  return (
                    <g
                      key={idx}
                      className="transition-all duration-200 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (b.flaggedEvents.length > 0) {
                          setSelectedAnomalyEvent(b.flaggedEvents[0]);
                        }
                      }}
                    >
                      <circle
                        cx={x}
                        cy={y}
                        r={isHovered ? 6 : 3.5}
                        fill="#FF647C"
                        stroke="#050810"
                        strokeWidth="1.5"
                        className={isHovered ? "animate-pulse" : ""}
                      />
                      {isHovered && (
                        <circle
                          cx={x}
                          cy={y}
                          r={10}
                          fill="none"
                          stroke="#FF647C"
                          strokeWidth="1"
                          opacity="0.6"
                          className="animate-ping"
                        />
                      )}
                    </g>
                  );
                })}

                {/* Vertical Scrubber Laser Line */}
                {hoveredBucketIndex !== null && (
                  <line
                    x1={paddingX + (hoveredBucketIndex / (bucketCount - 1)) * innerWidth}
                    y1={paddingY}
                    x2={paddingX + (hoveredBucketIndex / (bucketCount - 1)) * innerWidth}
                    y2={paddingY + innerHeight}
                    stroke="#55DDE0"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                )}
              </svg>

              {/* Tooltip HUD on Scrubber */}
              {activeBucket && (
                <div
                  className="absolute z-30 pointer-events-none p-3 rounded-xl border border-[#28364A] bg-[#101827]/95 backdrop-blur-md shadow-2xl text-xs font-mono -top-14"
                  style={{
                    left: `${Math.min(85, Math.max(15, (hoveredBucketIndex! / (bucketCount - 1)) * 100))}%`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <div className="font-bold text-[#E8EEF7] mb-1 flex items-center justify-between gap-3">
                    <span>{activeBucket.label}</span>
                    <span className="text-[10px] text-[#92A0B5]">Bucket #{hoveredBucketIndex! + 1}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="text-[#5B8CFF]">Requests: {activeBucket.requests}</span>
                    <span className={activeBucket.anomalies > 0 ? "text-[#FF647C] font-bold" : "text-[#48D6A0]"}>
                      Anomalies: {activeBucket.anomalies}
                    </span>
                  </div>
                  {activeBucket.flaggedEvents.length > 0 && (
                    <div className="text-[9px] text-[#F4BD62] mt-1 pt-1 border-t border-[#28364A]">
                      Click marker dot to inspect {activeBucket.flaggedEvents.length} anomalous events
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* X-Axis Tick Labels */}
            <div className="flex items-center justify-between text-[10px] font-mono text-[#92A0B5] px-4 pt-1 border-t border-[#28364A]">
              {buckets
                .filter((_, i) => i % (bucketCount > 16 ? 4 : 2) === 0 || i === bucketCount - 1)
                .map((b, i) => (
                  <span key={i}>{b.label}</span>
                ))}
            </div>

            {/* Selected Anomaly Evidence Dossier Drawer */}
            {selectedAnomalyEvent && (
              <div className="mt-4 p-4 rounded-xl border border-[#FF647C]/40 bg-[#151F30]/95 backdrop-blur-md space-y-3 font-mono text-xs animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between pb-2 border-b border-[#28364A]">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[#FF647C]" />
                    <span className="font-bold text-sm text-[#E8EEF7] font-sans">
                      Anomaly Evidence Dossier: {selectedAnomalyEvent.id}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-[#FF647C]/15 text-[#FF647C] border border-[#FF647C]/30 font-bold">
                      FLAGGED DEVIATION
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAnomalyEvent(null)}
                    className="text-[#92A0B5] hover:text-[#E8EEF7] px-2 py-0.5 rounded hover:bg-[#101827] text-xs"
                  >
                    Close ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-[#101827] border border-[#28364A]">
                    <div className="text-[#92A0B5]">TIMESTAMP:</div>
                    <div className="text-[#E8EEF7] font-semibold mt-0.5">{new Date(selectedAnomalyEvent.timestamp).toLocaleString()}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#101827] border border-[#28364A]">
                    <div className="text-[#92A0B5]">TARGET USER &amp; IP:</div>
                    <div className="text-[#55DDE0] font-semibold mt-0.5">{selectedAnomalyEvent.user_id || "Unauthenticated"} · {selectedAnomalyEvent.source_ip}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#101827] border border-[#28364A]">
                    <div className="text-[#92A0B5]">HTTP ENDPOINT:</div>
                    <div className="text-[#E8EEF7] font-semibold mt-0.5 truncate">{selectedAnomalyEvent.method} {selectedAnomalyEvent.endpoint}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#101827] border border-[#28364A]">
                    <div className="text-[#92A0B5]">STATUS &amp; LATENCY:</div>
                    <div className="text-[#F4BD62] font-semibold mt-0.5">{selectedAnomalyEvent.status_code || 200} · {selectedAnomalyEvent.response_time_ms ? `${selectedAnomalyEvent.response_time_ms}ms` : "Nominal"}</div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#101827] border border-[#28364A] space-y-1.5">
                  <div className="text-[#92A0B5] text-[10px] uppercase font-semibold">Anomaly Classifications Triggered:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAnomalyEvent.anomaly_types?.map((type, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-[#FF647C]/15 text-[#FF647C] border border-[#FF647C]/30 text-[10px] font-bold">
                        {type}
                      </span>
                    ))}
                  </div>
                  {selectedAnomalyEvent.evidence && (
                    <div className="text-[11px] text-[#92A0B5] pt-1">
                      <span className="text-[#E8EEF7] font-semibold">Supporting Evidence:</span> {selectedAnomalyEvent.evidence}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  {selectedAnomalyEvent.user_id && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEntityFilter(selectedAnomalyEvent.user_id);
                        setSelectedAnomalyEvent(null);
                      }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-sans font-medium bg-[#55DDE0]/15 hover:bg-[#55DDE0]/25 text-[#55DDE0] border border-[#55DDE0]/40 transition-colors"
                    >
                      Filter Timeline to User: {selectedAnomalyEvent.user_id}
                    </button>
                  )}
                  <Link
                    to="/network-activity"
                    className="px-3 py-1.5 rounded-lg text-[11px] font-sans font-medium bg-[#101827] hover:bg-[#101827]/80 text-[#E8EEF7] border border-[#28364A] transition-colors inline-flex items-center gap-1.5"
                  >
                    Trace in Live Network Stream <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </section>

          {/* Deep Analytics Split Deck */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 24-Hour Diurnal Activity Matrix (6 cols) - Clickable cells */}
            <section className="lg:col-span-6 rounded-2xl border border-[#28364A] bg-[#101827]/90 backdrop-blur-md p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-[#28364A]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#5B8CFF]/10 border border-[#5B8CFF]/30 flex items-center justify-center text-[#5B8CFF]">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-bold text-sm text-[#E8EEF7]">24-Hour Diurnal Request Heatmap</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedHourFilter !== null && (
                    <button
                      type="button"
                      onClick={() => setSelectedHourFilter(null)}
                      className="text-[10px] font-mono text-[#55DDE0] hover:underline"
                    >
                      Reset Hour
                    </button>
                  )}
                  <span className="text-[10px] font-mono text-[#92A0B5]">Click hour to isolate</span>
                </div>
              </div>

              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 py-2">
                {hourCounts.map((h, hourIndex) => {
                  const intensity = h.requests ? (h.requests / maxHourCount) : 0;
                  const hasAnomalies = h.anomalies > 0;
                  const isSelected = selectedHourFilter === hourIndex;
                  return (
                    <div
                      key={hourIndex}
                      onClick={() => setSelectedHourFilter(isSelected ? null : hourIndex)}
                      title={`${hourIndex.toString().padStart(2, "0")}:00 · ${h.requests} requests · ${h.anomalies} anomalies (Click to filter)`}
                      className={`group relative flex flex-col items-center justify-center p-2 rounded-lg border transition-all hover:scale-105 cursor-pointer ${
                        isSelected
                          ? "border-[#55DDE0] ring-2 ring-[#55DDE0] bg-[#55DDE0]/20"
                          : "border-[#28364A] hover:border-[#55DDE0]/40"
                      }`}
                      style={{
                        background: isSelected
                          ? undefined
                          : hasAnomalies
                          ? `rgba(255, 100, 124, ${0.15 + intensity * 0.45})`
                          : `rgba(91, 140, 255, ${0.08 + intensity * 0.35})`,
                      }}
                    >
                      <span className="text-[10px] font-mono font-semibold text-[#E8EEF7]">
                        {hourIndex}h
                      </span>
                      <span className={`text-[9px] font-mono ${hasAnomalies ? "text-[#FF647C] font-bold" : "text-[#92A0B5]"}`}>
                        {h.requests}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="text-[11px] text-[#92A0B5] pt-2 border-t border-[#28364A] flex items-center justify-between">
                <span>Diurnal baseline tracks legitimate work-hour patterns vs off-hours intrusions.</span>
                <span className="text-[10px] font-mono text-[#5B8CFF]">00:00 → 23:00</span>
              </div>
            </section>

            {/* Top Flagged Users & Attack Vectors (6 cols) */}
            <section className="lg:col-span-6 rounded-2xl border border-[#28364A] bg-[#101827]/90 backdrop-blur-md p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-[#28364A]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#FF647C]/10 border border-[#FF647C]/30 flex items-center justify-center text-[#FF647C]">
                    <ShieldAlert className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-bold text-sm text-[#E8EEF7]">Top Flagged Users &amp; Attack Endpoints</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={entitySearch}
                    onChange={(e) => setEntitySearch(e.target.value)}
                    placeholder="Search entity..."
                    className="w-32 sm:w-44 px-2 py-1 rounded-md text-[11px] font-mono bg-[#151F30] border border-[#28364A] text-[#E8EEF7] placeholder-[#92A0B5] focus:outline-none focus:border-[#55DDE0]"
                  />
                  {entitySearch && (
                    <button
                      type="button"
                      onClick={() => setEntitySearch("")}
                      className="absolute right-1.5 top-1.5 text-[10px] text-[#92A0B5] hover:text-[#E8EEF7]"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2.5 max-h-[290px] overflow-y-auto pr-1">
                {entityStats.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#92A0B5]">No entities flagged with anomalies in this time window.</div>
                ) : (
                  entityStats.map(([entity, stat]) => {
                    const isSelected = selectedEntityFilter === entity;
                    return (
                      <div
                        key={entity}
                        onClick={() => setSelectedEntityFilter(isSelected ? null : entity)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 text-xs ${
                          isSelected
                            ? "bg-[#55DDE0]/15 border-[#55DDE0]/50 shadow-md"
                            : "bg-[#151F30]/60 hover:bg-[#151F30] border-[#28364A]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded bg-[#101827] flex items-center justify-center text-[#92A0B5] border border-[#28364A] flex-shrink-0">
                            {stat.type === "User" ? <User className="w-3.5 h-3.5" /> : <Radio className="w-3.5 h-3.5" />}
                          </div>
                          <div className="truncate">
                            <div className="font-semibold text-[#E8EEF7] truncate">{entity}</div>
                            <div className="text-[10px] text-[#92A0B5] font-mono truncate">
                              {stat.type} · {stat.requests} requests
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FF647C]/15 text-[#FF647C] border border-[#FF647C]/30">
                            {stat.anomalies} Anomalies
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="text-[11px] text-[#92A0B5] pt-2 border-t border-[#28364A] flex items-center justify-between">
                <span>Select an entity to isolate its individual behavioral footprint.</span>
              </div>
            </section>
          </div>
        </div>
      </Layout>
    </PageTransition>
  );
}
