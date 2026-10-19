import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Activity,
  Cpu,
  Lock,
  Sparkles,
  ChevronRight,
  Terminal,
} from "lucide-react";
import {
  mlBackendService,
  type AgentAutonomySettings,
  type AgentIncidentView,
  type AgentLearningResult,
  type VerdictScoreEffect,
} from "@/services/mlBackendService";

interface AgentPanelProps {
  incidentId: string;
  canAct: boolean;
  onChanged: () => void;
}

const VERDICT_LABEL: Record<string, string> = {
  likely_malicious: "Likely Malicious",
  suspicious: "Suspicious Activity",
  inconclusive: "Inconclusive / Benign",
};

const pct = (value: number | null | undefined) => (value == null ? "—" : `${(value * 100).toFixed(0)}%`);

/**
 * AI Guardian Co-Pilot Panel
 * Displays real Investigator findings, deterministic classification,
 * Response Agent recommendations, analyst approval/rejection triggers,
 * and rule-learning feedback loop from the backend.
 */
export default function AgentPanel({ incidentId, canAct, onChanged }: AgentPanelProps) {
  const [view, setView] = useState<AgentIncidentView | null>(null);
  const [learning, setLearning] = useState<AgentLearningResult | null>(null);
  const [scoreEffect, setScoreEffect] = useState<VerdictScoreEffect | null>(null);
  const [autonomy, setAutonomy] = useState<AgentAutonomySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [incidentView, learningResult, settings] = await Promise.all([
        mlBackendService.getIncidentAgentView(incidentId),
        mlBackendService.getAgentLearning(),
        mlBackendService.getAgentAutonomy(),
      ]);
      setView(incidentView);
      setLearning(learningResult);
      setAutonomy(settings);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load agent activity.");
    }
  }, [incidentId]);

  useEffect(() => {
    setView(null);
    void load();
    const unsubscribe = mlBackendService.onThreatEvent((event) => {
      if (event?.type === "agent_activity" || event?.type === "dashboard_update") void load();
    });
    return unsubscribe;
  }, [load]);

  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setNote("");
    setError("");
    try {
      await work();
      setNote(success);
      await load();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent action failed.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !view) {
    return (
      <div className="p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="p-6 rounded-xl border border-border/50 bg-card/40 flex items-center justify-center gap-3 text-muted-foreground text-sm">
        <Cpu className="w-5 h-5 animate-spin text-primary" />
        <span>Synthesizing autonomous agent telemetry…</span>
      </div>
    );
  }

  const investigation = view.investigation;
  const hasVerdict = view.feedback.length > 0;
  const isMalicious = investigation?.verdict === "likely_malicious";
  const isSuspicious = investigation?.verdict === "suspicious";

  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-b from-card/90 to-card/50 backdrop-blur-md p-4 sm:p-5 shadow-lg shadow-black/40 space-y-4 relative overflow-hidden">
      {/* Top Ambient Glow Line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shadow-sm shadow-primary/20">
            <Brain className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide text-foreground">AI GUARDIAN CO-PILOT</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-semibold">
                AGENTIC SOC
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
              <span>Read-Only SQLite Investigator</span>
              <span>·</span>
              <span>Enforcement Guardrails</span>
            </div>
          </div>
        </div>

        {autonomy && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span
              className={`px-2 py-0.5 rounded-full border text-[10px] uppercase font-bold flex items-center gap-1 ${
                autonomy.kill_switch
                  ? "bg-destructive/15 text-destructive border-destructive/40"
                  : autonomy.autonomy_mode === "auto_contain"
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-400 border-amber-500/30"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
              {autonomy.kill_switch ? "Kill Switch Active" : autonomy.autonomy_mode.replace("_", " ")}
            </span>
          </div>
        )}
      </div>

      {/* Investigator Findings Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-primary" /> Investigator Assessment
          </span>
          {investigation && (
            <span className="text-[11px] text-muted-foreground/80 font-mono">
              Evaluated {new Date(investigation.investigated_at).toLocaleTimeString()}
            </span>
          )}
        </div>

        {investigation ? (
          <div className="space-y-3">
            {/* Verdict Highlight Card */}
            <div
              className={`p-3.5 rounded-lg border flex flex-wrap items-center justify-between gap-3 ${
                isMalicious
                  ? "bg-destructive/10 border-destructive/40 text-destructive-foreground"
                  : isSuspicious
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                  : "bg-emerald-500/10 border-emerald-500/40 text-emerald-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                    isMalicious
                      ? "bg-destructive/20 border-destructive/50 text-destructive"
                      : isSuspicious
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                      : "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                  }`}
                >
                  {isMalicious ? <ShieldAlert className="w-5 h-5" /> : isSuspicious ? <AlertTriangle className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                </div>
                <div>
                  <div className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
                    {VERDICT_LABEL[investigation.verdict] ?? investigation.verdict}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Deterministic behavioral & consensus analysis
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[10px] uppercase font-mono text-muted-foreground">Confidence</div>
                  <div className="text-base font-bold font-mono text-foreground">{pct(investigation.confidence)}</div>
                </div>
              </div>
            </div>

            {/* Attack Classification Card if available */}
            {investigation.attack_type && (
              <div className="p-3 rounded-lg border border-border/60 bg-secondary/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-primary" />
                    Classified Attack: <span className="font-mono text-primary font-bold">{investigation.attack_type.type.replace(/_/g, " ")}</span>
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-primary/15 text-primary border border-primary/20">
                    {pct(investigation.attack_type.confidence)} Classifier Confidence
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Recommended Strategy: <span className="text-foreground font-medium">{investigation.attack_type.recommended_action.replace(/_/g, " ")}</span>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground/75 flex gap-3">
                  <span>Failed Logins: {investigation.attack_type.evidence_summary.failed_logins}</span>
                  <span>·</span>
                  <span>Sensitive Events: {investigation.attack_type.evidence_summary.sensitive_events}</span>
                </div>
              </div>
            )}

            {/* Rules Triggered Matrix */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono uppercase text-muted-foreground">Rule Triggers & Weights</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {investigation.rules.map((rule) => (
                  <div
                    key={rule.rule_id}
                    className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between transition-colors ${
                      rule.fired
                        ? "bg-destructive/10 border-destructive/40 text-foreground"
                        : "bg-card/50 border-border/50 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono font-medium mb-1">
                      <span className="text-foreground flex items-center gap-1.5">
                        {rule.fired ? (
                          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                        )}
                        {rule.rule_id}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded border font-semibold ${
                          rule.fired
                            ? "bg-destructive/20 text-destructive border-destructive/30"
                            : "bg-muted/40 text-muted-foreground border-border/40"
                        }`}
                      >
                        {rule.fired ? "FIRED" : "CLEAR"} · {pct(rule.weight)}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{rule.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg border border-border/40 text-center text-xs text-muted-foreground">
            Awaiting automated investigation run.
          </div>
        )}
      </div>

      {/* Response Agent Recommendations & Approvals */}
      <div className="space-y-2.5 pt-2 border-t border-border/50">
        <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-primary" /> Autonomous Response Decider
        </div>

        {view.responses.length === 0 ? (
          <div className="p-3 rounded-lg border border-border/40 text-xs text-muted-foreground">
            No active containment or response action has been queued yet.
          </div>
        ) : (
          view.responses.map((action) => {
            const isExecuted = action.status === "executed";
            const isPending = action.status === "pending_approval";
            return (
              <div
                key={action.id}
                className={`p-3.5 rounded-lg border space-y-2.5 transition-all ${
                  isPending
                    ? "bg-amber-500/10 border-amber-500/40"
                    : isExecuted
                    ? "bg-emerald-500/10 border-emerald-500/40"
                    : "bg-card/60 border-border/60"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-foreground uppercase tracking-wide">
                      {action.action}
                    </span>
                    {action.target && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-secondary text-foreground border border-border">
                        Target: {action.target}
                      </span>
                    )}
                  </div>

                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded-full font-bold uppercase border flex items-center gap-1 ${
                      isExecuted
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                        : isPending
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse"
                        : "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {action.status.replace("_", " ")}
                    {isExecuted && action.mode ? ` (${action.mode})` : ""}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground leading-relaxed">{action.rationale}</div>

                {action.safeguards.length > 0 && (
                  <div className="p-2 rounded bg-background/50 border border-border/40 flex flex-wrap gap-2 text-[11px] font-mono">
                    <span className="text-muted-foreground">Safeguards:</span>
                    {action.safeguards.map((check, idx) => (
                      <span
                        key={idx}
                        className={`flex items-center gap-1 ${
                          check.passed ? "text-emerald-400" : "text-amber-400 font-semibold"
                        }`}
                      >
                        {check.passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {check.name.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}

                {canAct && isPending && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => mlBackendService.decideAgentResponse(incidentId, action.id, "approve"),
                          "Action approved and enforced by backend security controls."
                        )
                      }
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-colors flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve & Enforce
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => mlBackendService.decideAgentResponse(incidentId, action.id, "reject"),
                          "Response action rejected by analyst."
                        )
                      }
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border/60 transition-colors flex items-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject Action
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Analyst Verdict & Measured Learning Feedback */}
      {canAct && (
        <div className="space-y-2.5 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" /> Analyst Verdict & Continuous Learning
            </span>
            {hasVerdict && (
              <span className="text-[11px] font-mono text-muted-foreground">
                Recorded: {view.feedback[view.feedback.length - 1].verdict.replace("_", " ")}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => mlBackendService.reinvestigateIncident(incidentId), "Incident re-investigated by agent.")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground border border-border/60 flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Re-Investigate
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => mlBackendService.submitIncidentVerdict(incidentId, "false_positive").then((r) => setScoreEffect(r.score_effect ?? null)),
                  "Recorded false positive. Risk adjustment calculated."
                )
              }
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> False Positive
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => mlBackendService.submitIncidentVerdict(incidentId, "true_positive").then((r) => setScoreEffect(r.score_effect ?? null)),
                  "Recorded true positive. Threat signals affirmed."
                )
              }
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-destructive/15 hover:bg-destructive/25 text-destructive border border-destructive/30 flex items-center gap-1.5 transition-colors"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> True Positive
            </button>
          </div>

          {/* Verdict Score Effect Delta */}
          {scoreEffect && (
            <div className="p-3 rounded-lg border border-primary/40 bg-primary/10 text-xs space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-2">
                <span>Score Impact for user {scoreEffect.user_id}:</span>
                <span className="font-mono bg-background/80 px-2 py-0.5 rounded border border-border">
                  {scoreEffect.score_before} <ArrowRight className="w-3 h-3 inline mx-1" /> {scoreEffect.score_after} (
                  {scoreEffect.user_adjustment > 0 ? `+${scoreEffect.user_adjustment}` : scoreEffect.user_adjustment} pts)
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">{scoreEffect.mechanism}</div>
            </div>
          )}

          {/* Learning Telemetry Status */}
          {learning && (
            <div className="text-[11px] font-mono text-muted-foreground flex flex-wrap gap-2 pt-1">
              <span>Feedback Loop: {learning.labeled_incidents}/{learning.min_labels_required} labels</span>
              <span>·</span>
              <span>Status: {learning.status.replace("_", " ")}</span>
              {learning.default_accuracy != null && (
                <>
                  <span>·</span>
                  <span>Accuracy: {pct(learning.default_accuracy)}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Activity Log Dropdown */}
      {view.activity.length > 0 && (
        <div className="pt-2 border-t border-border/50 text-[11px] font-mono text-muted-foreground space-y-1">
          <span className="uppercase text-muted-foreground/70 font-semibold block">Recent Agent Actions</span>
          {view.activity.slice(0, 4).map((entry) => (
            <div key={entry.id} className="truncate">
              <span className="text-primary">{new Date(entry.created_at).toLocaleTimeString()}</span> · [{entry.agent}] {entry.summary}
            </div>
          ))}
        </div>
      )}

      {/* Status Messages */}
      {note && (
        <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{note}</span>
        </div>
      )}
      {error && (
        <div className="p-2.5 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
