import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { User, Incident, NetworkNode, NetworkEdge } from '@/data/mockData';
import { mlBackendService } from '@/services/mlBackendService';

export type ThreatLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

interface SecurityState {
  systemRiskScore: number;
  users: User[];
  incidents: Incident[];
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  activeAnomalies: number;
  isAttackSimulated: boolean;
  showAlert: boolean;
  alertMessage: string;
  alertRiskScore: number;
  autonomousMode: boolean;
  riskThreshold: number;
  isSimulating: boolean;
}

interface SecurityContextType extends SecurityState {
  simulateAttack: () => void;
  resetSimulation: () => Promise<void>;
  dismissAlert: () => void;
  setAutonomousMode: (v: boolean) => void;
  setRiskThreshold: (v: number) => void;
  getThreatLevel: (score: number) => ThreatLevel;
  liveThreatPhase: string;
  liveThreatData: any;
  setLocalFingerprintId: (id: string) => void;
  // Attack chain
  attackChainData: any;
  attackChainRunning: boolean;
  startAttackChain: () => Promise<void>;
  stopAttackChain: () => Promise<void>;
}

const SecurityContext = createContext<SecurityContextType | null>(null);

// Keep UI tiers aligned with the backend's documented 0-100 policy:
// Monitor 0-30, MFA 31-60, Restrict 61-85, Block 86-100.
export const getThreatLevel = (score: number): ThreatLevel => {
  if (score <= 30) return 'safe';
  if (score <= 60) return 'medium';
  if (score <= 85) return 'high';
  return 'critical';
};

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SecurityState>({
    systemRiskScore: 0,
    users: [],
    incidents: [],
    nodes: [],
    edges: [],
    activeAnomalies: 0,
    isAttackSimulated: false,
    showAlert: false,
    alertMessage: '',
    alertRiskScore: 0,
    autonomousMode: true,
    riskThreshold: 70,
    isSimulating: false,
  });

  const refreshTopology = useCallback(async () => {
    try {
      const [topology, summary] = await Promise.all([
        mlBackendService.getNetworkTopology(),
        mlBackendService.getDashboardSummary(),
      ]);
      setState(prev => ({
        ...prev,
        nodes: topology.nodes as NetworkNode[],
        edges: topology.edges,
        systemRiskScore: Math.round(summary.overall_risk.maximum),
        activeAnomalies: summary.network_anomalies,
      }));
    } catch {
      setState(prev => ({ ...prev, nodes: [], edges: [], systemRiskScore: 0, activeAnomalies: 0 }));
    }
  }, []);

  useEffect(() => {
    void refreshTopology();
    const interval = setInterval(() => void refreshTopology(), 10000);
    return () => clearInterval(interval);
  }, [refreshTopology]);

  const simulateAttack = useCallback(() => {
    setState(prev => ({ ...prev, isSimulating: true }));

    // Step 1: Show alert immediately
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        showAlert: true,
        alertMessage: '⚠ HIGH-RISK BEHAVIOR DETECTED\nUnauthorized geo-location login from Moscow, RU\nDevice fingerprint mismatch detected',
        isSimulating: true,
      }));
    }, 300);

    // Step 2: Escalate risk score
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        systemRiskScore: 94,
        activeAnomalies: prev.activeAnomalies + 7,
        isAttackSimulated: true,
        users: prev.users.map(u =>
          u.id === 'u1'
            ? {
                ...u,
                riskScore: 94,
                status: 'blocked',
                location: 'Moscow, RU (unusual)',
                anomalies: [
                  'Geo-location deviation: 9,847 km',
                  'Access time deviation: 3.2x normal',
                  'Device fingerprint mismatch',
                  'Rapid privilege escalation attempt',
                ],
              }
            : u.id === 'u4'
            ? { ...u, riskScore: 67, status: 'restricted' }
            : u
        ),
        nodes: prev.nodes.map(n =>
          ['n1', 'n4', 'n7', 'n9'].includes(n.id)
            ? { ...n, compromised: true, propagationRisk: Math.min(100, n.propagationRisk + 50) }
            : n
        ),
        edges: prev.edges.map(e =>
          (['n1', 'n4', 'n7'].includes(e.from) || ['n4', 'n7', 'n9'].includes(e.to))
            ? { ...e, attackPath: true }
            : e
        ),
      }));
    }, 800);

    // Step 3: Add incident
    setTimeout(() => {
      const newIncident: Incident = {
        id: `INC-${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        userId: 'u1',
        userName: 'Alex Chen',
        type: 'Credential Theft — Lateral Movement',
        description: 'Login from Moscow, RU (9,847 km deviation). Device fingerprint mismatch. Rapid privilege escalation detected.',
        riskScore: 94,
        threatLevel: 'critical',
        status: 'active',
        response: '🔴 DEMO SIMULATION: containment scenario recorded. Backend enforcement is shown in the Incident Center.',
        deviation: 96,
      };

      setState(prev => ({
        ...prev,
        incidents: [newIncident, ...prev.incidents],
        isSimulating: false,
      }));
    }, 1500);
  }, []);

  const resetSimulation = useCallback(async () => {
    // Stop attack chain on backend if running
    try { await mlBackendService.stopAttackChain(); } catch { /* ignore */ }
    // Reset live threat state on backend so polling doesn't re-apply old data
    try { await mlBackendService.resetLiveThreat(); } catch { /* ignore */ }

    setAttackChainRunning(false);
    setAttackChainData(null);
    setLiveThreatPhase('idle');
    setLiveThreatData(null);
    lastThreatTimestamp.current = null;
    setState({
      systemRiskScore: 0,
      users: [],
      incidents: [],
      nodes: [],
      edges: [],
      activeAnomalies: 0,
      isAttackSimulated: false,
      showAlert: false,
      alertMessage: '',
      alertRiskScore: 0,
      autonomousMode: true,
      riskThreshold: 70,
      isSimulating: false,
    });
    void refreshTopology();
  }, [refreshTopology]);

  const dismissAlert = useCallback(() => {
    setState(prev => ({ ...prev, showAlert: false }));
  }, []);

  const setAutonomousMode = useCallback((v: boolean) => {
    setState(prev => ({ ...prev, autonomousMode: v }));
  }, []);

  const setRiskThreshold = useCallback((v: number) => {
    setState(prev => ({ ...prev, riskThreshold: v }));
  }, []);

  // ── Live Threat Feed (WebSocket for instant push + polling as fallback) ──
  const [liveThreatPhase, setLiveThreatPhase] = useState('idle');
  const [liveThreatData, setLiveThreatData] = useState<any>(null);
  const [attackChainData, setAttackChainData] = useState<any>(null);
  const [attackChainRunning, setAttackChainRunning] = useState(false);
  const lastThreatTimestamp = useRef<string | null>(null);
  const localFingerprintId = useRef<string>('');
  const setLocalFingerprintId = useCallback((id: string) => { localFingerprintId.current = id; }, []);

  const startAttackChain = useCallback(async () => {
    try {
      setAttackChainRunning(true);
      setAttackChainData(null);
      await mlBackendService.startAttackChain();
    } catch (err) {
      console.error('Failed to start attack chain:', err);
      setAttackChainRunning(false);
    }
  }, []);

  const stopAttackChain = useCallback(async () => {
    try {
      await mlBackendService.stopAttackChain();
    } catch { /* ignore */ }
    // Always reset everything locally regardless of API success
    setAttackChainRunning(false);
    setAttackChainData(null);
    setLiveThreatPhase('idle');
    setLiveThreatData(null);
    lastThreatTimestamp.current = null;
    setState({
      systemRiskScore: 0,
      users: [],
      incidents: [],
      nodes: [],
      edges: [],
      activeAnomalies: 0,
      isAttackSimulated: false,
      showAlert: false,
      alertMessage: '',
      alertRiskScore: 0,
      autonomousMode: true,
      riskThreshold: 70,
      isSimulating: false,
    });
    void refreshTopology();
  }, [refreshTopology]);

  // Handler for applying a threat event (shared by WS + polling)
  const applyThreatEvent = useCallback((data: any) => {
    if (!data) return;

    // Summary refresh events are consumed by pages that load /dashboard/summary;
    // they are not threat events and must not reset dashboard simulation state.
    if (data.type === 'dashboard_update') return;

    // Handle attack chain stopped event
    if (data.type === 'attack_chain_stopped') {
      setAttackChainRunning(false);
      setAttackChainData(null);
      setLiveThreatPhase('idle');
      setLiveThreatData(null);
      lastThreatTimestamp.current = null;
      setState({
        systemRiskScore: 0,
        users: [],
        incidents: [],
        nodes: [],
        edges: [],
        activeAnomalies: 0,
        isAttackSimulated: false,
        showAlert: false,
        alertMessage: '',
        alertRiskScore: 0,
        autonomousMode: true,
        riskThreshold: 70,
        isSimulating: false,
      });
      void refreshTopology();
      return;
    }

    // Track attack chain phase data
    if (data.type === 'attack_chain') {
      setAttackChainData(data);
      // Auto-detect completion (last step of last phase)
      if (data.current_step_global === data.total_steps) {
        setTimeout(() => setAttackChainRunning(false), 3000);
      }
    }

    setLiveThreatData(data);

    // Login threat events should always be processed (never skip them)
    const isLoginThreat = data.type === 'login_threat';

    // If this login event came from THIS device (admin's own login), skip all
    // dashboard state updates — we only want threats from OTHER devices to
    // trigger the ACTIVE THREAT badge, risk score spike, and alert popup.
    const isFromThisDevice = data.source_fingerprint_id && localFingerprintId.current && data.source_fingerprint_id === localFingerprintId.current;
    if (isLoginThreat && isFromThisDevice) {
      return; // Admin's own login — don't touch dashboard state
    }

    if (!data.active && !isLoginThreat) {
      if (liveThreatPhase !== 'idle') {
        setLiveThreatPhase('idle');
        setState(prev => ({
          systemRiskScore: 0,
          users: [],
          incidents: [],
          nodes: [],
          edges: [],
          activeAnomalies: 0,
          isAttackSimulated: false,
          // Preserve popup — only user dismiss should close it
          showAlert: prev.showAlert,
          alertMessage: prev.alertMessage,
          alertRiskScore: prev.alertRiskScore,
          autonomousMode: true,
          riskThreshold: 70,
          isSimulating: false,
        }));
      }
      void refreshTopology();
      return;
    }

    if (data.timestamp === lastThreatTimestamp.current) return;
    lastThreatTimestamp.current = data.timestamp;

    const phase = data.phase;
    const riskScore = data.risk_score || 0;
    const threatLevel = data.threat_level || 'safe';
    const anomalies = data.anomalies || [];
    const compromisedNodeIds = data.compromised_nodes || [];

    setLiveThreatPhase(phase);

    setState(prev => {
      const newState = { ...prev };
      newState.systemRiskScore = riskScore;
      newState.activeAnomalies = 2 + anomalies.length;
      newState.isAttackSimulated = riskScore > 25 || isLoginThreat;
      newState.isSimulating = false;

      // Show alert popup for threats from other devices
      if ((riskScore >= 25 || isLoginThreat) && phase !== prev.alertMessage) {
        const location = data.attacker_location || data.geo?.city || 'Unknown';
        const ip = data.attacker_ip || 'Unknown';
        newState.showAlert = true;
        newState.alertRiskScore = riskScore;
        newState.alertMessage =
          `⚠ ${threatLevel.toUpperCase()} RISK — ${data.attack_type || phase.toUpperCase()}\n` +
          `Source: ${ip} (${location})\n` +
          `Target: ${data.target_user || data.username || 'Unknown'}\n` +
          anomalies.slice(0, 2).join('\n');
      }

      newState.users = prev.users.map(u => {
        if (u.id === 'u1') {
          const statusMap: Record<string, 'normal' | 'warning' | 'restricted' | 'blocked'> = {
            safe: 'normal', low: 'warning', medium: 'restricted', high: 'blocked', critical: 'blocked',
          };
          return {
            ...u,
            riskScore,
            status: statusMap[threatLevel] || 'normal',
            location: data.attacker_location ? `${data.attacker_location} (suspicious)` : u.location,
            anomalies: anomalies.slice(0, 4),
          };
        }
        if (u.id === 'u4' && riskScore > 50) {
          return { ...u, riskScore: Math.round(riskScore * 0.6), status: 'restricted' as const };
        }
        return u;
      });

      const normalizeIdentity = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
      const targetIdentity = normalizeIdentity(String(data.target_user || data.username || ''));
      const targetUser = prev.nodes.find(node => node.id.startsWith('user:') && (
        normalizeIdentity(node.id.slice('user:'.length)) === targetIdentity
        || normalizeIdentity(node.label.split('@')[0]) === targetIdentity
      ));
      const affectedNodeIds = new Set<string>(
        compromisedNodeIds.filter((id: string) => prev.nodes.some(node => node.id === id)),
      );
      if (targetUser && riskScore >= 50) {
        const pending = [targetUser.id];
        while (pending.length) {
          const source = pending.shift()!;
          if (affectedNodeIds.has(source)) continue;
          affectedNodeIds.add(source);
          for (const edge of prev.edges) {
            if (edge.from === source && edge.active && !affectedNodeIds.has(edge.to)) pending.push(edge.to);
          }
        }
      }
      newState.nodes = prev.nodes.map(node => affectedNodeIds.has(node.id)
        ? { ...node, compromised: riskScore >= 70, propagationRisk: Math.max(node.propagationRisk, riskScore) }
        : node);
      newState.edges = prev.edges.map(edge => ({
        ...edge,
        attackPath: riskScore >= 50 && affectedNodeIds.has(edge.from) && affectedNodeIds.has(edge.to),
      }));

      if (data.incident) {
        const existingIds = prev.incidents.map(i => i.id);
        if (!existingIds.includes(data.incident.id)) {
          newState.incidents = [{
            ...data.incident,
            threatLevel: data.incident.threatLevel as any,
            status: 'active' as const,
          }, ...prev.incidents];
        }
      }

      return newState;
    });
  }, [liveThreatPhase, refreshTopology]);

  useEffect(() => {
    // Connect WebSocket for instant push
    mlBackendService.connectWebSocket();
    const unsub = mlBackendService.onThreatEvent(applyThreatEvent);

    // Also keep polling as fallback (every 3s)
    const poll = async () => {
      try {
        const data = await mlBackendService.getLiveThreat();
        if (data) applyThreatEvent(data);
      } catch { /* ignore */ }
    };
    const interval = setInterval(poll, 3000);

    return () => {
      unsub();
      clearInterval(interval);
      mlBackendService.disconnectWebSocket();
    };
  }, [applyThreatEvent]);

  return (
    <SecurityContext.Provider
      value={{
        ...state,
        simulateAttack,
        resetSimulation,
        dismissAlert,
        setAutonomousMode,
        setRiskThreshold,
        getThreatLevel,
        liveThreatPhase,
        liveThreatData,
        setLocalFingerprintId,
        attackChainData,
        attackChainRunning,
        startAttackChain,
        stopAttackChain,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = () => {
  const ctx = useContext(SecurityContext);
  if (!ctx) throw new Error('useSecurity must be used within SecurityProvider');
  return ctx;
};
