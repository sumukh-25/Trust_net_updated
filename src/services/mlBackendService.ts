/**
 * ML Backend API Service
 * Communicates with the Python FastAPI backend for ML model predictions
 */
import { getAuthSession, setAuthSession, type SessionUser, type UserRole } from "@/services/authSession";

// Dynamically use the current page's hostname so it works from any device on the network
const _host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const ML_API_BASE_URL = (import.meta.env.VITE_ML_API_URL as string) || `http://${_host}:8010/api`;
const WS_BASE_URL = ML_API_BASE_URL.replace(/\/api$/, '').replace(/^http/, 'ws');

interface RiskScorePayload {
  user_id: string;
  behavior_metrics: {
    normal_login_time: number;
    actual_login_time: number;
    normal_session_duration: number;
    actual_session_duration: number;
    normal_data_volume: number;
    actual_data_volume: number;
    normal_api_calls: number;
    actual_api_calls: number;
    normal_geo_distance: number;
    actual_geo_distance: number;
  };
  anomaly_score: number;
}

interface RiskScoreResponse {
  overall_score: number;
  threat_level: "safe" | "low" | "medium" | "high" | "critical";
  deviations: Record<string, number>;
  recommendation: string;
}

interface AnomalyRecord {
  [key: string]: number | boolean | string;
  is_anomaly: boolean;
  anomaly_score: number;
  risk_level: string;
}

interface PropagationNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  compromised: boolean;
  propagationRisk: number;
}

interface PropagationEdge {
  from: string;
  to: string;
  active: boolean;
  attackPath: boolean;
}

export interface PropagationNodeAnalysis {
  node_id: string;
  node_label: string;
  propagation_risk: number;
  criticality: 'low' | 'medium' | 'high' | 'critical';
}

export interface PropagationAnalysisResult {
  total_network_risk: number;
  critical_count: number;
  critical_nodes: PropagationNodeAnalysis[];
  all_nodes: PropagationNodeAnalysis[];
}

export interface NetworkTopology {
  nodes: PropagationNode[];
  edges: PropagationEdge[];
  assets: Array<{
    asset_id: string;
    label: string;
    asset_type: string;
    criticality: number;
    classification: string;
  }>;
  policy_default: 'deny';
}

export interface RegisteredDevice {
  device_id: string;
  user_id: string;
  fingerprint_hash: string;
  first_seen: string;
  last_seen: string;
  trust_status: 'trusted' | 'unknown' | 'flagged';
  label: string;
  quarantined: boolean;
}

export interface DashboardSummary {
  generated_at: string;
  overall_risk: { average: number; maximum: number; users_scored: number };
  active_incident_count: number;
  network_anomalies: number;
  device_counts: { total: number; trusted: number; unknown: number; flagged: number };
  recent_incidents: Array<Record<string, any>>;
  data_scope: string;
}

export interface RiskPolicyThreshold {
  restrict_threshold: number;
  minimum: number;
  maximum: number;
}

export interface NetworkEvent {
  id: string;
  timestamp: string;
  source_ip: string;
  user_id: string | null;
  endpoint: string;
  method: string;
  status_code: number | null;
  response_time_ms: number | null;
  anomaly_types: string[];
  evidence?: string | null;
}

export interface SecurityEvent {
  id: string;
  timestamp: string;
  user_id: string | null;
  ip_address: string | null;
  request_path: string;
  http_method: string;
  status_code: number | null;
  event_category: string;
  risk_indicators: string[];
  event_payload: Record<string, unknown>;
}

export interface BackendIncident {
  id: string;
  title: string;
  severity: string;
  user_id: string;
  device_id: string | null;
  risk_score: number;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  created_at: string;
  updated_at: string;
  evidence: string[];
  response_action: string | null;
  risk_breakdown: Record<string, any>;
}

class MLBackendService {
  private baseUrl: string;
  private ws: WebSocket | null = null;
  private wsListeners: Array<(data: any) => void> = [];
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wsTicketPending = false;

  constructor() {
    this.baseUrl = ML_API_BASE_URL;
  }

  private request(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const token = getAuthSession()?.token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }

  // ── WebSocket for instant threat push ──

  async connectWebSocket(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return; // Already connected
    }
    const token = getAuthSession()?.token;
    if (!token || this.wsTicketPending) return;
    this.wsTicketPending = true;
    try {
      const ticketResponse = await this.request(`${this.baseUrl}/auth/ws-ticket`, { method: "POST" });
      if (!ticketResponse.ok) throw new Error(`Dashboard ticket request failed: ${ticketResponse.status}`);
      const { ticket } = await ticketResponse.json();
      if (getAuthSession()?.token !== token || this.ws) return;
      const wsUrl = `${WS_BASE_URL}/ws/admin?ticket=${encodeURIComponent(ticket)}`;
      console.log(`[WS] Connecting to ${WS_BASE_URL}/ws/admin with one-use ticket`);
      this.ws = new WebSocket(wsUrl);
    } catch (error) {
      console.warn("[WS] Could not authorize dashboard stream", error);
    } finally {
      this.wsTicketPending = false;
    }

    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('[WS] Connected — dashboard will receive instant threat events');
      // Keep alive ping every 30s
      const ping = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send('ping');
        } else {
          clearInterval(ping);
        }
      }, 30000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong') return; // heartbeat reply
        // Notify all listeners
        this.wsListeners.forEach(fn => fn(data));
      } catch { /* ignore parse errors */ }
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected');
      this.ws = null;
      if (getAuthSession()?.token) {
        this.wsReconnectTimer = setTimeout(() => void this.connectWebSocket(), 3000);
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  onThreatEvent(callback: (data: any) => void): () => void {
    this.wsListeners.push(callback);
    // Return unsubscribe function
    return () => {
      this.wsListeners = this.wsListeners.filter(fn => fn !== callback);
    };
  }

  disconnectWebSocket(): void {
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<any> {
    try {
      const response = await this.request(`${this.baseUrl}/health`);
      if (!response.ok) throw new Error("Backend health check failed");
      const health = await response.json();
      if (health.status !== "healthy") {
        throw new Error(health.message || "ML backend is not ready yet.");
      }
      return health;
    } catch (error) {
      console.error("Health check error:", error);
      throw error;
    }
  }

  /**
   * Calculate risk score for a user
   */
  async calculateRiskScore(payload: RiskScorePayload): Promise<RiskScoreResponse> {
    try {
      const response = await this.request(`${this.baseUrl}/risk-score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Risk score calculation failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Risk score calculation error:", error);
      throw error;
    }
  }

  /**
   * Detect anomalies in behavioral records
   */
  async detectAnomalies(records: Record<string, number>[]): Promise<any> {
    try {
      const response = await this.request(`${this.baseUrl}/anomaly-detection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records }),
      });

      if (!response.ok) {
        throw new Error(`Anomaly detection failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Anomaly detection error:", error);
      throw error;
    }
  }

  /**
   * Analyze network propagation risks
   */
  async analyzePropagation(
    nodes: PropagationNode[],
    edges: PropagationEdge[]
  ): Promise<PropagationAnalysisResult> {
    try {
      const response = await this.request(`${this.baseUrl}/propagation-analysis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nodes, edges }),
      });

      if (!response.ok) {
        throw new Error(`Propagation analysis failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Propagation analysis error:", error);
      throw error;
    }
  }

  /**
   * Train the anomaly detector with historical data
   */
  async trainAnomalyDetector(data: number[][], features: string[]): Promise<any> {
    try {
      const response = await this.request(`${this.baseUrl}/train-anomaly-detector`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data, features }),
      });

      if (!response.ok) {
        throw new Error(`Model training failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Training error:", error);
      throw error;
    }
  }

  /**
   * Batch risk analysis for multiple users
   */
  async batchRiskAnalysis(usersData: any[]): Promise<any> {
    try {
      const response = await this.request(`${this.baseUrl}/batch-risk-analysis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(usersData),
      });

      if (!response.ok) {
        throw new Error(`Batch analysis failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Batch analysis error:", error);
      throw error;
    }
  }

  /**
   * Check if backend is available
   */
  async isBackendAvailable(): Promise<boolean> {
    try {
      await this.healthCheck();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Poll live threat feed (for real-time attack demo)
   */
  async getLiveThreat(): Promise<any> {
    try {
      const response = await this.request(`${this.baseUrl}/live-threat`);
      if (!response.ok) throw new Error("Failed to fetch live threat");
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  /**
   * Reset live threat state
   */
  async resetLiveThreat(): Promise<void> {
    try {
      await this.request(`${this.baseUrl}/live-threat/reset`, { method: "POST" });
    } catch {
      // ignore
    }
  }

  /**
   * Real login — sends device fingerprint to backend.
   * Backend does GeoIP, baseline comparison, ML analysis, and pushes result via WS.
   */
  async login(username: string, password: string, fingerprint: any, fingerprintId?: string): Promise<any> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await this.request(`${this.baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, fingerprint, fingerprint_id: fingerprintId }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || `Login failed: ${response.status} ${response.statusText}`);
      }
      const result = await response.json();
      if (result.login_status === "allowed" && result.access_token && result.user) {
        setAuthSession({ token: result.access_token, user: result.user as SessionUser, permissions: [] });
        const verifiedSession = await this.getAuthMe();
        setAuthSession({ token: result.access_token, user: verifiedSession.user, permissions: verifiedSession.permissions });
      }
      return result;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error("Login request timed out");
        throw new Error('Login request timed out. Please try again.');
      }
      console.error("Login detection error:", error);
      throw error;
    }
  }

  /**
   * Get stored baselines for admin view
   */
  async getBaselines(): Promise<{ baselines: Record<string, any>; count: number }> {
    const response = await this.request(`${this.baseUrl}/baselines`);
    if (!response.ok) {
      throw new Error(`Failed to fetch baselines: ${response.status} ${response.statusText}`);
    }
    const result = await response.json();
    if (!result || typeof result.baselines !== 'object' || typeof result.count !== 'number') {
      throw new Error('Backend returned an invalid baseline response.');
    }
    return result;
  }

  async getDevices(userId?: string): Promise<{ devices: RegisteredDevice[]; count: number }> {
    const path = userId ? `/devices/${encodeURIComponent(userId)}` : '/devices';
    const response = await this.request(`${this.baseUrl}${path}`);
    if (!response.ok) throw new Error(`Failed to fetch devices: ${response.status} ${response.statusText}`);
    return await response.json();
  }

  async trustDevice(deviceId: string): Promise<any> {
    const response = await this.request(`${this.baseUrl}/devices/${encodeURIComponent(deviceId)}/trust`, { method: 'POST' });
    if (!response.ok) throw new Error(`Failed to trust device: ${response.status} ${response.statusText}`);
    return await response.json();
  }

  async getUserRisk(userId: string): Promise<any> {
    const response = await this.request(`${this.baseUrl}/risk/${encodeURIComponent(userId)}`);
    if (!response.ok) throw new Error(`Failed to fetch user risk: ${response.status} ${response.statusText}`);
    return await response.json();
  }

  async getIncidents(status?: string): Promise<{ incidents: BackendIncident[]; count: number }> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const response = await this.request(`${this.baseUrl}/incidents${query}`);
    if (!response.ok) throw new Error(`Failed to fetch incidents: ${response.status} ${response.statusText}`);
    return await response.json();
  }

  async getIncident(incidentId: string): Promise<BackendIncident> {
    const response = await this.request(`${this.baseUrl}/incidents/${encodeURIComponent(incidentId)}`);
    if (!response.ok) throw new Error(`Failed to fetch incident: ${response.status} ${response.statusText}`);
    return await response.json();
  }

  async getIncidentEvents(incidentId: string): Promise<{ events: SecurityEvent[]; count: number }> {
    const response = await this.request(`${this.baseUrl}/incidents/${encodeURIComponent(incidentId)}/events`);
    if (!response.ok) throw new Error(`Failed to fetch incident events: ${response.status} ${response.statusText}`);
    return response.json();
  }

  async transitionIncident(incidentId: string, action: 'approve' | 'dismiss' | 'escalate' | 'resolve'): Promise<any> {
    const response = await this.request(`${this.baseUrl}/incidents/${encodeURIComponent(incidentId)}/${action}`, { method: 'POST' });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || `Incident action failed: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  }

  async getDashboardSummary(): Promise<DashboardSummary> {
    const response = await this.request(`${this.baseUrl}/dashboard/summary`);
    if (!response.ok) throw new Error(`Failed to fetch dashboard summary: ${response.status} ${response.statusText}`);
    return await response.json();
  }

  async getRestrictThreshold(): Promise<RiskPolicyThreshold> {
    const response = await this.request(`${this.baseUrl}/policies/restrict-threshold`);
    if (!response.ok) throw new Error(`Failed to fetch risk policy: ${response.status} ${response.statusText}`);
    return response.json();
  }

  async setRestrictThreshold(restrictThreshold: number): Promise<RiskPolicyThreshold> {
    const response = await this.request(`${this.baseUrl}/policies/restrict-threshold`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restrict_threshold: restrictThreshold }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || `Failed to update risk policy: ${response.status}`);
    }
    return response.json();
  }

  async getNetworkEvents(filters: { ip?: string; userId?: string; limit?: number } = {}): Promise<{ events: NetworkEvent[]; count: number }> {
    const query = new URLSearchParams();
    if (filters.ip) query.set("ip", filters.ip);
    if (filters.userId) query.set("user_id", filters.userId);
    if (filters.limit) query.set("limit", String(filters.limit));
    const response = await this.request(`${this.baseUrl}/network/events?${query}`);
    if (!response.ok) throw new Error(`Failed to fetch network events: ${response.status} ${response.statusText}`);
    return response.json();
  }

  async getNetworkTopology(): Promise<NetworkTopology> {
    const response = await this.request(`${this.baseUrl}/network/topology`);
    if (!response.ok) throw new Error(`Failed to fetch network topology: ${response.status} ${response.statusText}`);
    return response.json();
  }

  async getNetworkAnomalies(filters: { ip?: string; userId?: string; limit?: number } = {}): Promise<{ anomalies: NetworkEvent[]; count: number }> {
    const query = new URLSearchParams();
    if (filters.ip) query.set("ip", filters.ip);
    if (filters.userId) query.set("user_id", filters.userId);
    if (filters.limit) query.set("limit", String(filters.limit));
    const response = await this.request(`${this.baseUrl}/network/anomalies?${query}`);
    if (!response.ok) throw new Error(`Failed to fetch network anomalies: ${response.status} ${response.statusText}`);
    return response.json();
  }

  async getAuthMe(): Promise<{ user: SessionUser; permissions: string[] }> {
    const response = await this.request(`${this.baseUrl}/auth/me`);
    if (!response.ok) throw new Error(`Session is not valid: ${response.status} ${response.statusText}`);
    return response.json();
  }

  async logout(): Promise<void> {
    try {
      if (getAuthSession()?.token) await this.request(`${this.baseUrl}/auth/logout`, { method: "POST" });
    } finally {
      setAuthSession(null);
      this.disconnectWebSocket();
    }
  }

  async registerUser(payload: { email: string; password: string; role: Exclude<UserRole, "admin"> }): Promise<SessionUser> {
    const response = await this.request(`${this.baseUrl}/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || `User registration failed: ${response.status}`);
    }
    const result = await response.json();
    return result.user as SessionUser;
  }

  async getUsers(): Promise<SessionUser[]> {
    const response = await this.request(`${this.baseUrl}/users`);
    if (!response.ok) throw new Error(`Failed to fetch accounts: ${response.status} ${response.statusText}`);
    const result = await response.json();
    return result.users as SessionUser[];
  }

  async getLoginHistory(userId: string): Promise<Array<Record<string, unknown>>> {
    const response = await this.request(`${this.baseUrl}/users/${encodeURIComponent(userId)}/login-history`);
    if (!response.ok) throw new Error(`Failed to fetch login history: ${response.status} ${response.statusText}`);
    const result = await response.json();
    return result.attempts as Array<Record<string, unknown>>;
  }

  /**
   * Clear stored device baselines. A successful next login establishes a new baseline.
   */
  async resetBaselines(username?: string): Promise<{ status: string; username?: string }> {
    const response = await this.request(`${this.baseUrl}/baselines/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(username ? { username } : {}),
    });
    if (!response.ok) {
      throw new Error(`Failed to clear baselines: ${response.status} ${response.statusText}`);
    }
    const result = await response.json();
    if (!result || typeof result.status !== 'string') {
      throw new Error('Backend returned an invalid baseline reset response.');
    }
    return result;
  }

  // ── Attack Chain Simulation ──

  async startAttackChain(): Promise<any> {
    try {
      const response = await this.request(`${this.baseUrl}/attack-chain/start`, { method: "POST" });
      if (!response.ok) throw new Error("Failed to start attack chain");
      return await response.json();
    } catch (error) {
      console.error("Attack chain start error:", error);
      throw error;
    }
  }

  async stopAttackChain(): Promise<any> {
    try {
      const response = await this.request(`${this.baseUrl}/attack-chain/stop`, { method: "POST" });
      if (!response.ok) throw new Error("Failed to stop attack chain");
      return await response.json();
    } catch (error) {
      console.error("Attack chain stop error:", error);
      throw error;
    }
  }

  async getAttackChainStatus(): Promise<{ running: boolean }> {
    try {
      const response = await this.request(`${this.baseUrl}/attack-chain/status`);
      if (!response.ok) return { running: false };
      return await response.json();
    } catch {
      return { running: false };
    }
  }
}

export const mlBackendService = new MLBackendService();

export type {
  RiskScorePayload,
  RiskScoreResponse,
  AnomalyRecord,
  PropagationNode,
  PropagationEdge,
};
