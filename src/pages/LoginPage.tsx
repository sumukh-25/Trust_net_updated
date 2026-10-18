import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collectFingerprint, getFingerprintId } from "@/services/fingerprintService";
import { mlBackendService } from "@/services/mlBackendService";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("sumukh");
  const [password, setPassword] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrapPos, setWrapPos] = useState({ px: 0, py: 0 });
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const handleWrapMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setWrapPos({
      px: (e.clientX - rect.left) / rect.width - 0.5,
      py: (e.clientY - rect.top) / rect.height - 0.5,
    });
  }, []);

  const handleWrapLeave = useCallback(() => setWrapPos({ px: 0, py: 0 }), []);

  const handleCardMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: py * -10, ry: px * 14 });
  }, []);

  const handleCardLeave = useCallback(() => setTilt({ rx: 0, ry: 0 }), []);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setAuthenticating(true);

    try {
      const fingerprint = collectFingerprint();
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
    <div className="login-wrap" onMouseMove={handleWrapMove} onMouseLeave={handleWrapLeave}>
      <section className="brand-side bg-grid">
        <div
          className="orb"
          style={{
            width: 380,
            height: 380,
            background: "#ff2b4d",
            top: -120,
            right: -100,
            transform: `translate(${wrapPos.px * 26}px, ${wrapPos.py * 26}px)`,
          }}
        />
        <div
          className="orb"
          style={{
            width: 260,
            height: 260,
            background: "#ff2b4d",
            bottom: -80,
            left: "40%",
            transform: `translate(${wrapPos.px * -18}px, ${wrapPos.py * -18}px)`,
          }}
        />

        <div className="particle p-float-a" style={{ width: 6, height: 6, top: "18%", left: "62%" }} />
        <div className="particle p-float-b" style={{ width: 4, height: 4, top: "34%", left: "74%" }} />
        <div className="particle p-float-c" style={{ width: 3, height: 3, top: "58%", left: "50%" }} />
        <div className="particle p-float-a" style={{ width: 5, height: 5, top: "70%", left: "68%", animationDelay: "1.2s" }} />
        <div className="particle p-float-b" style={{ width: 4, height: 4, top: "12%", left: "30%", animationDelay: "0.6s" }} />

        <div className="floor" />
        <div className="horizon-glow" />

        <div className="brand-content">
          <div className="brand-mark-row">
            <div className="brand-mark glow-ring" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
              </svg>
            </div>
            <div className="heading brand-name">TRUSTNET&nbsp;AI</div>
          </div>

          <div className="brand-copy">
            <div className="badge badge-critical brand-badge">
              <span className="dot pulse" style={{ background: "#ff2b4d" }} />
              AGENTIC SOC — LIVE
            </div>
            <h1 className="heading glow-text brand-title">
              Autonomous security,
              <br />
              for restricted assets.
            </h1>
            <p className="brand-description">
              Behavioral anomaly detection, physical-layer device verification and tiered autonomous response —
              reasoning over live signals, not guesses.
            </p>
          </div>
        </div>

        <div className="brand-features">
          <div className="feature-chip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff5470" strokeWidth={2} aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <span>Autonomous Incident Investigator Agent</span>
          </div>
          <div className="feature-chip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff5470" strokeWidth={2} aria-hidden="true">
              <path d="M13 2L3 14h7l-1 8 11-14h-7l1-6z" />
            </svg>
            <span>Tiered Autonomous Response Agent</span>
          </div>
          <div className="feature-chip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff5470" strokeWidth={2} aria-hidden="true">
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <span>CSI-Enabled Device Identity Verification</span>
          </div>
        </div>
      </section>

      <section className="form-side">
        <div className="tilt-stage">
          <div
            className="login-card panel panel-glow"
            style={{ transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}
            onMouseMove={handleCardMove}
            onMouseLeave={handleCardLeave}
          >
            <div className="card-inner">
              <div className="login-card-heading">
                <div>
                  <div className="heading login-card-title">Secure Access</div>
                  <div className="login-card-subtitle">Sign in to the TrustNet AI command console</div>
                </div>
                <span className="status-ring" aria-label="Secure channel online" />
              </div>

              <form onSubmit={handleSignIn}>
                <div className="tn-field">
                  <label htmlFor="operator-username">Operator username</label>
                  <input
                    id="operator-username"
                    type="text"
                    autoComplete="username"
                    placeholder="sumukh / alex_chen / admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="tn-field">
                  <label htmlFor="operator-password">Password</label>
                  <input
                    id="operator-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="login-options">
                  <label className="remember-node">
                    <input type="checkbox" defaultChecked /> Remember this node
                  </label>
                  <a href="mailto:security@trustnet.ai?subject=TrustNet%20access%20recovery">Forgot access?</a>
                </div>

                {error && <div className="login-error" role="alert">{error}</div>}

                <button type="submit" className="btn btn-primary sign-in-btn" disabled={authenticating}>
                  {authenticating ? (
                    <span>Verifying device…</span>
                  ) : (
                    <span className="sign-in-label">
                      Authenticate &amp; Enter Console
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  )}
                </button>
              </form>

              <div className="mfa-note">DEVICE FINGERPRINT · BASELINE AUTH</div>
              <div className="hr login-divider" />
              <div className="sysline">
                <span>NODE-07 · IN-MEMORY</span>
                <span className="secure-channel">● SECURE CHANNEL</span>
              </div>
              <p className="login-hint">Demo: sumukh / sumukh@123 · First successful sign-in saves this device as your baseline.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
