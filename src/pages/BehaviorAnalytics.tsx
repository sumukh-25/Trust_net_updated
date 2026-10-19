import { motion } from 'framer-motion';
import { Activity, Clock, MapPin, Monitor, TrendingDown, AlertCircle } from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine
} from 'recharts';
import { useMemo } from 'react';
import { generateBehaviorData, generateRiskTrendData } from '@/data/mockData';
import { useSecurity } from '@/store/securityStore';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="cyber-card rounded-lg p-3 text-xs font-mono border border-border">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </div>
      ))}
    </div>
  );
};

const loginLocations = [
  { city: 'San Francisco, CA', count: 847, risk: 2, flag: '🇺🇸' },
  { city: 'New York, NY', count: 523, risk: 5, flag: '🇺🇸' },
  { city: 'Chicago, IL', count: 312, risk: 3, flag: '🇺🇸' },
  { city: 'Austin, TX', count: 289, risk: 4, flag: '🇺🇸' },
  { city: 'Seattle, WA', count: 201, risk: 2, flag: '🇺🇸' },
];

const deviationData = [
  { label: 'Login Time', normal: 9.2, actual: 9.3, deviation: 1.1 },
  { label: 'Session Duration', normal: 4.5, actual: 4.2, deviation: 6.7 },
  { label: 'Data Volume', normal: 120, actual: 118, deviation: 1.7 },
  { label: 'API Calls', normal: 45, actual: 48, deviation: 6.7 },
  { label: 'Geo-Distance', normal: 0, actual: 12, deviation: 0 },
];

const BehaviorAnalytics = () => {
  const behaviorData = useMemo(() => generateBehaviorData(), []);
  const riskTrend = useMemo(() => generateRiskTrendData(), []);
  const { users, isAttackSimulated } = useSecurity();
  const attackedUser = users.find(u => u.id === 'u1');
  

  const attackDeviationData = isAttackSimulated ? [
    { label: 'Login Time', normal: 9.2, actual: 23.8, deviation: 158.7 },
    { label: 'Session Duration', normal: 4.5, actual: 0.3, deviation: 93.3 },
    { label: 'Data Volume', normal: 120, actual: 850, deviation: 608.3 },
    { label: 'API Calls', normal: 45, actual: 312, deviation: 593.3 },
    { label: 'Geo-Distance', normal: 0, actual: 9847, deviation: 100 },
  ] : deviationData;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Behavior Analytics</h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">
          Synthetic demo charts · Isolation Forest backend available for explicit submitted metrics
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Login Pattern Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="cyber-card rounded-xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-primary" />
            <div>
              <div className="text-sm font-medium">Login Pattern — 24h <span className="text-[9px] text-warning">DEMO DATA</span></div>
              <div className="text-[10px] text-muted-foreground font-mono">Illustrative values; not collected from real users</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={behaviorData}>
              <defs>
                <linearGradient id="normalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(150 68% 51%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(150 68% 51%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="anomalyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(350 100% 59%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(350 100% 59%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3,3" stroke="hsl(220 25% 12%)" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fontFamily: 'JetBrains Mono', fill: 'hsl(215 20% 50%)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fontFamily: 'JetBrains Mono', fill: 'hsl(215 20% 50%)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="normal" stroke="hsl(150 68% 51%)" strokeWidth={2} fill="url(#normalGrad)" name="Normal" />
              <Area type="monotone" dataKey="anomaly" stroke="hsl(350 100% 59%)" strokeWidth={2} fill="url(#anomalyGrad)" name="Anomaly" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Risk Score Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="cyber-card rounded-xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-4 h-4 text-warning" />
            <div>
              <div className="text-sm font-medium">Weekly Risk Score Trend <span className="text-[9px] text-warning">DEMO DATA</span></div>
              <div className="text-[10px] text-muted-foreground font-mono">Generated demo values · LSTM integration planned</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={riskTrend}>
              <CartesianGrid strokeDasharray="3,3" stroke="hsl(220 25% 12%)" />
              <XAxis dataKey="day" tick={{ fontSize: 9, fontFamily: 'JetBrains Mono', fill: 'hsl(215 20% 50%)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fontFamily: 'JetBrains Mono', fill: 'hsl(215 20% 50%)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={70} stroke="hsl(350 100% 59%)" strokeDasharray="4 4" label={{ value: 'Threshold', fontSize: 9, fill: 'hsl(350 100% 59%)' }} />
              <Line type="monotone" dataKey="riskScore" stroke="hsl(38 95% 55%)" strokeWidth={2} dot={{ fill: 'hsl(38 95% 55%)', r: 3 }} name="Risk Score" />
              <Line type="monotone" dataKey="anomalies" stroke="hsl(350 100% 59%)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Anomalies" />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Deviation Analysis */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="cyber-card rounded-xl p-5"
          style={{
            borderColor: isAttackSimulated ? 'hsl(350 100% 59% / 0.4)' : undefined,
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <div>
                <div className="text-sm font-medium">
                  Behavioral Deviation — {isAttackSimulated ? attackedUser?.name : 'System Average'}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">Normal baseline vs. current behavior</div>
              </div>
            </div>
            {isAttackSimulated && (
              <div className="text-[9px] font-mono px-2 py-1 rounded" style={{ background: 'hsl(350 100% 59% / 0.15)', color: 'hsl(350 100% 59%)', border: '1px solid hsl(350 100% 59% / 0.3)' }}>
                ANOMALY DETECTED
              </div>
            )}
          </div>
          <div className="space-y-3">
            {attackDeviationData.map((item) => {
              const pct = Math.min(100, item.deviation);
              const color = item.deviation > 50 ? 'hsl(350 100% 59%)' : item.deviation > 20 ? 'hsl(38 95% 55%)' : 'hsl(150 68% 51%)';
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1">
                    <span>{item.label}</span>
                    <span style={{ color }}>
                      {item.deviation.toFixed(1)}% deviation
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 1 }}
                      style={{ background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {isAttackSimulated && (
            <div className="mt-4 p-3 rounded-lg border text-xs font-mono"
              style={{ background: 'hsl(350 100% 59% / 0.08)', borderColor: 'hsl(350 100% 59% / 0.25)', color: 'hsl(350 100% 59%)' }}>
              <div className="font-bold mb-1">AI ANALYSIS OUTPUT:</div>
              <div className="text-destructive/80 space-y-0.5">
                <div>→ Login from Moscow, RU (9,847 km from baseline)</div>
                <div>→ Access time: 23:41 (normal: 09:00–18:00)</div>
                <div>→ Data export: 850 MB (normal: 120 MB)</div>
                <div>→ Confidence: 96.4% — Credential Theft</div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Login Locations */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="cyber-card rounded-xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-primary" />
            <div>
              <div className="text-sm font-medium">Geo-Location Baseline</div>
              <div className="text-[10px] text-muted-foreground font-mono">Authorized login regions</div>
            </div>
          </div>
          <div className="space-y-3">
            {loginLocations.map((loc, i) => (
              <div key={loc.city} className="flex items-center gap-3">
                <span className="text-base">{loc.flag}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-[10px] font-mono mb-1">
                    <span className="text-foreground">{loc.city}</span>
                    <span className="text-muted-foreground">{loc.count} logins</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(loc.count / 900) * 100}%` }}
                      transition={{ duration: 1, delay: i * 0.1 }}
                      style={{ background: 'hsl(150 68% 51%)' }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {isAttackSimulated && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-3 rounded-lg border"
              style={{ background: 'hsl(350 100% 59% / 0.1)', borderColor: 'hsl(350 100% 59% / 0.4)' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">🇷🇺</span>
                <div className="flex-1">
                  <div className="flex justify-between text-[10px] font-mono mb-1">
                    <span className="text-destructive font-bold">Moscow, RU ⚠ UNAUTHORIZED</span>
                    <span className="text-destructive">1 login</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full w-1 rounded-full animate-threat-pulse" style={{ background: 'hsl(350 100% 59%)' }} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default BehaviorAnalytics;
