/**
 * LoginPage — STEP 1 glass redesign
 * Auth logic preserved exactly. Visual-only rewrite.
 */
import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, ArrowRight, Loader2, AlertCircle, Lock, User } from "lucide-react";
import { collectFingerprint, getFingerprintId } from "@/services/fingerprintService";
import { mlBackendService } from "@/services/mlBackendService";
import { DotGridBackground } from "@/components/ui/DotGridBackground";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState(import.meta.env.DEV ? "sumukh" : "");
  const [password, setPassword] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setAuthenticating(true);
    try {
      const fingerprint   = collectFingerprint();
      const fingerprintId = getFingerprintId(fingerprint);
      const result = await mlBackendService.login(username.trim(), password, fingerprint, fingerprintId);
      if (result.login_status !== "allowed") {
        setError(result.message || "Access denied. This device could not be verified.");
        return;
      }
      navigate("/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed. Check the ML backend and try again.");
    } finally {
      setAuthenticating(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: '#070b12' }}
    >
      <DotGridBackground />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 flex flex-col lg:flex-row items-center gap-12 lg:gap-20 py-16">

        {/* ── Left: Brand ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="flex-1 text-center lg:text-left"
        >
          {/* Logo */}
          <div className="flex items-center justify-center lg:justify-start gap-3 mb-8">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background: 'rgba(56,189,248,0.12)',
                border: '1px solid rgba(56,189,248,0.30)',
                boxShadow: '0 0 24px rgba(56,189,248,0.15)',
              }}
            >
              <Shield className="w-6 h-6" style={{ color: '#38bdf8' }} />
            </div>
            <div>
              <div className="font-bold text-xl tracking-tight" style={{ color: '#f1f5f9' }}>
                TrustNet AI
              </div>
              <div className="text-xs font-mono font-semibold tracking-widest" style={{ color: '#a78bfa' }}>
                AI GUARDIAN
              </div>
            </div>
          </div>

          {/* Headline */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold mb-5"
            style={{
              background: 'rgba(34,197,94,0.10)',
              border: '1px solid rgba(34,197,94,0.25)',
              color: '#22c55e',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
            AGENTIC SOC · LIVE
          </div>

          <h1
            className="text-3xl lg:text-4xl font-bold tracking-tight mb-4 leading-tight"
            style={{ color: '#f1f5f9' }}
          >
            Autonomous security,
            <br />
            <span style={{ color: '#38bdf8' }}>for restricted assets.</span>
          </h1>

          <p className="text-sm leading-relaxed max-w-md mx-auto lg:mx-0" style={{ color: '#94a3b8' }}>
            Behavioral anomaly detection, device fingerprint verification and tiered
            autonomous response — reasoning over live signals, not guesses.
          </p>

          {/* Feature chips */}
          <div className="flex flex-col gap-2.5 mt-8">
            {[
              { icon: '🔍', label: 'Autonomous Incident Investigator Agent' },
              { icon: '⚡', label: 'Tiered Autonomous Response Agent' },
              { icon: '🔒', label: 'Browser / device fingerprint verification' },
            ].map(f => (
              <div
                key={f.label}
                className="flex items-center gap-3 text-sm"
                style={{ color: '#94a3b8' }}
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.15)' }}
                >
                  {f.icon}
                </span>
                {f.label}
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Right: Login card ────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
          className="w-full max-w-md flex-shrink-0"
        >
          <div
            className="p-8 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.10)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 64px rgba(0,0,0,0.5)',
            }}
          >
            {/* Card header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold" style={{ color: '#f1f5f9' }}>Secure Access</h2>
                <p className="text-sm mt-0.5" style={{ color: '#94a3b8' }}>
                  Sign in to the TrustNet AI console
                </p>
              </div>
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: '#22c55e', boxShadow: '0 0 8px #22c55e' }}
                title="Secure channel online"
              />
            </div>

            <form onSubmit={handleSignIn} className="space-y-4">
              {/* Username */}
              <div className="space-y-1.5">
                <label
                  htmlFor="operator-username"
                  className="text-xs font-medium font-mono tracking-wide"
                  style={{ color: '#94a3b8' }}
                >
                  OPERATOR USERNAME
                </label>
                <div className="relative">
                  <User
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: '#475569' }}
                  />
                  <input
                    id="operator-username"
                    type="text"
                    autoComplete="username"
                    placeholder="sumukh / alex_chen / admin"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      color: '#f1f5f9',
                      fontFamily: 'Inter, sans-serif',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(56,189,248,0.50)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(56,189,248,0.10)'; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label
                  htmlFor="operator-password"
                  className="text-xs font-medium font-mono tracking-wide"
                  style={{ color: '#94a3b8' }}
                >
                  PASSWORD
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: '#475569' }}
                  />
                  <input
                    id="operator-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      color: '#f1f5f9',
                      fontFamily: 'Inter, sans-serif',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(56,189,248,0.50)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(56,189,248,0.10)'; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 p-3 rounded-xl text-sm"
                  style={{
                    background: 'rgba(239,68,68,0.10)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#ef4444',
                  }}
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </motion.div>
              )}

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={authenticating}
                whileHover={{ scale: authenticating ? 1 : 1.01 }}
                whileTap={{ scale: authenticating ? 1 : 0.98 }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 mt-2 disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, rgba(56,189,248,0.80), rgba(56,189,248,0.60))',
                  border: '1px solid rgba(56,189,248,0.40)',
                  color: '#0c1220',
                  boxShadow: '0 0 20px rgba(56,189,248,0.20)',
                }}
              >
                {authenticating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying device…</>
                  : <>Authenticate &amp; Enter Console <ArrowRight className="w-4 h-4" /></>
                }
              </motion.button>
            </form>

            {/* Footer note */}
            <div className="mt-5 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono" style={{ color: '#475569' }}>
                  DEVICE FINGERPRINT · BASELINE AUTH
                </span>
                <span
                  className="text-[10px] font-mono flex items-center gap-1"
                  style={{ color: '#22c55e' }}
                >
                  <span className="w-1 h-1 rounded-full bg-[#22c55e]" />
                  SECURE CHANNEL
                </span>
              </div>
              {import.meta.env.DEV && (
                <p className="text-[11px] mt-2" style={{ color: '#475569' }}>
                  Dev: <span className="font-mono" style={{ color: '#94a3b8' }}>sumukh / sumukh@123</span>
                  {' '}· First sign-in saves device baseline.
                </p>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
