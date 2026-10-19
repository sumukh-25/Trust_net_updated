import { motion } from 'framer-motion';
import { AlertTriangle, Clock, CheckCircle, AlertCircle, XCircle, Shield } from 'lucide-react';
import { useSecurity } from '@/store/securityStore';
import { ThreatLevel } from '@/data/mockData';

const threatConfig: Record<ThreatLevel, { color: string; bg: string; border: string; label: string }> = {
  safe: { color: 'hsl(150 68% 51%)', bg: 'hsl(150 68% 51% / 0.1)', border: 'hsl(150 68% 51% / 0.3)', label: 'SAFE' },
  low: { color: 'hsl(142 70% 45%)', bg: 'hsl(142 70% 45% / 0.1)', border: 'hsl(142 70% 45% / 0.3)', label: 'LOW' },
  medium: { color: 'hsl(38 95% 55%)', bg: 'hsl(38 95% 55% / 0.12)', border: 'hsl(38 95% 55% / 0.3)', label: 'MEDIUM' },
  high: { color: 'hsl(20 95% 55%)', bg: 'hsl(20 95% 55% / 0.12)', border: 'hsl(20 95% 55% / 0.3)', label: 'HIGH' },
  critical: { color: 'hsl(350 100% 59%)', bg: 'hsl(350 100% 59% / 0.12)', border: 'hsl(350 100% 59% / 0.4)', label: 'CRITICAL' },
};

const statusConfig = {
  active: { icon: XCircle, color: 'hsl(350 100% 59%)', label: 'ACTIVE' },
  investigating: { icon: AlertCircle, color: 'hsl(38 95% 55%)', label: 'INVESTIGATING' },
  resolved: { icon: CheckCircle, color: 'hsl(142 70% 45%)', label: 'RESOLVED' },
};

const IncidentResponse = () => {
  const { incidents, isAttackSimulated } = useSecurity();
  const activeCount = incidents.filter(i => i.status === 'active').length;
  const investigatingCount = incidents.filter(i => i.status === 'investigating').length;
  const resolvedCount = incidents.filter(i => i.status === 'resolved').length;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Incident Response Center</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            Digital Immune System · Automated threat response log
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'ACTIVE THREATS', value: activeCount, color: 'hsl(350 100% 59%)', icon: XCircle },
          { label: 'INVESTIGATING', value: investigatingCount, color: 'hsl(38 95% 55%)', icon: AlertCircle },
          { label: 'RESOLVED', value: resolvedCount, color: 'hsl(142 70% 45%)', icon: CheckCircle },
        ].map(({ label, value, color, icon: Icon }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="cyber-card rounded-lg p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4" style={{ color }} />
              <span className="text-[9px] font-mono text-muted-foreground">{label}</span>
            </div>
            <div className="text-3xl font-bold font-mono" style={{ color }}>{value}</div>
          </motion.div>
        ))}
      </div>

      {/* Incident log */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="cyber-card rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-5">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Live Incident Log</span>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] font-mono"
            style={{ color: 'hsl(142 70% 45%)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-threat-pulse" />
            MONITORING ACTIVE
          </div>
        </div>

        <div className="space-y-4">
          {incidents.map((incident, i) => {
            const threat = threatConfig[incident.threatLevel];
            const status = statusConfig[incident.status];
            const StatusIcon = status.icon;
            const isCritical = incident.status === 'active' && incident.threatLevel === 'critical';

            return (
              <motion.div
                key={incident.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="rounded-lg p-4 border transition-all duration-500"
                style={{
                  background: isCritical ? 'hsl(0 20% 8%)' : 'hsl(220 30% 8%)',
                  borderColor: isCritical ? 'hsl(350 100% 59% / 0.5)' : 'hsl(225 8% 18%)',
                  boxShadow: isCritical ? '0 0 20px hsl(350 100% 59% / 0.15)' : undefined,
                }}
              >
                {/* Header row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-muted-foreground">{incident.id}</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold"
                      style={{ background: threat.bg, color: threat.color, border: `1px solid ${threat.border}` }}>
                      {threat.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <StatusIcon className="w-3 h-3" style={{ color: status.color }} />
                      <span className="text-[9px] font-mono" style={{ color: status.color }}>{status.label}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    {incident.timestamp}
                  </div>
                </div>

                {/* Incident info */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <div className="lg:col-span-2">
                    <div className="text-sm font-medium text-foreground mb-1">{incident.type}</div>
                    <div className="text-xs text-muted-foreground">{incident.description}</div>

                    {/* Response */}
                    <div className="mt-3 p-2.5 rounded border text-xs font-mono"
                      style={{
                        background: incident.status === 'resolved'
                          ? 'hsl(142 70% 45% / 0.07)'
                          : incident.status === 'active'
                          ? 'hsl(350 100% 59% / 0.07)'
                          : 'hsl(38 95% 55% / 0.07)',
                        borderColor: incident.status === 'resolved'
                          ? 'hsl(142 70% 45% / 0.25)'
                          : incident.status === 'active'
                          ? 'hsl(350 100% 59% / 0.25)'
                          : 'hsl(38 95% 55% / 0.25)',
                      }}>
                      <span className="text-muted-foreground">RESPONSE: </span>
                      <span style={{ color: incident.status === 'resolved' ? 'hsl(142 70% 45%)' : incident.status === 'active' ? 'hsl(350 100% 59%)' : 'hsl(38 95% 55%)' }}>
                        {incident.response}
                      </span>
                    </div>
                  </div>

                  {/* Risk score */}
                  <div className="flex flex-col items-center justify-center p-3 rounded-lg"
                    style={{ background: 'hsl(220 30% 6%)' }}>
                    <div className="text-[9px] font-mono text-muted-foreground mb-1">USER</div>
                    <div className="text-xs font-medium mb-3">{incident.userName}</div>
                    <div className="text-[9px] font-mono text-muted-foreground mb-1">RISK SCORE</div>
                    <div className="text-3xl font-bold font-mono" style={{ color: threat.color }}>
                      {incident.riskScore}
                    </div>
                    <div className="mt-2 text-[9px] font-mono text-muted-foreground">
                      {incident.deviation}% behavioral deviation
                    </div>
                    {/* Mini risk bar */}
                    <div className="w-full mt-2 h-1 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${incident.riskScore}%` }}
                        transition={{ duration: 1 }}
                        style={{ background: threat.color }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Response timeline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="cyber-card rounded-xl p-5"
      >
        <div className="text-sm font-medium mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          Response Timeline — Today
        </div>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4 pl-10">
            {[
              { time: new Date().toLocaleTimeString(), event: isAttackSimulated ? '🔴 DEMO SIMULATION: Alex Chen containment scenario' : '✅ System health check passed', color: isAttackSimulated ? 'hsl(350 100% 59%)' : 'hsl(150 68% 51%)' },
              { time: '10:15 AM', event: '⚡ Behavioral baseline updated — 5 users', color: 'hsl(350 100% 59%)' },
              { time: '09:45 AM', event: '⚠ Off-hours access flagged — MFA issued', color: 'hsl(38 95% 55%)' },
              { time: '09:02 AM', event: '✅ Daily risk model calibration complete', color: 'hsl(142 70% 45%)' },
              { time: '08:30 AM', event: '🧠 AI behavioral models loaded', color: 'hsl(350 100% 59%)' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 + 0.4 }}
                className="relative flex items-start gap-3"
              >
                <div
                  className="absolute -left-6 w-2 h-2 rounded-full mt-1.5"
                  style={{ background: item.color, boxShadow: `0 0 6px ${item.color}` }}
                />
                <div>
                  <div className="text-[10px] font-mono text-muted-foreground">{item.time}</div>
                  <div className="text-xs font-mono mt-0.5" style={{ color: item.color }}>{item.event}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default IncidentResponse;
