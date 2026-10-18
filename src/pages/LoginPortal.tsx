import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, LogIn, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { collectFingerprint, getFingerprintId } from '@/services/fingerprintService';
import { mlBackendService } from '@/services/mlBackendService';

/**
 * Attacker-facing login page.
 * Shows ONLY: "Login successful" or "Access restricted".
 * NO risk scores, NO ML details, NO fingerprint info, NO anomalies.
 * All detailed alerts go to the admin dashboard via WebSocket.
 */

interface LoginResponse {
  login_status: 'allowed' | 'restricted' | 'denied';
  message: string;
  username: string;
}

const LoginPortal = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [result, setResult] = useState<LoginResponse | null>(null);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!username.trim()) { setError('Enter a username'); return; }
    if (!password) { setError('Enter a password'); return; }
    setError(''); setResult(null); setIsLoggingIn(true);
    try {
      const fp = collectFingerprint();
      const fpId = getFingerprintId(fp);
      const res = await mlBackendService.login(username.trim(), password, fp, fpId);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-background cyber-grid flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'hsl(350 100% 59% / 0.15)', border: '1px solid hsl(350 100% 59% / 0.4)' }}>
              <Shield className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold font-mono text-foreground">TrustNet</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">Secure Authentication Portal</p>
        </div>

        {/* Login Card */}
        <div className="cyber-card rounded-xl p-6">
          <AnimatePresence mode="wait">
            {!result ? (
              <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-muted-foreground mb-1.5 block">USERNAME</label>
                    <input
                      type="text" value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                      disabled={isLoggingIn}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-mono text-muted-foreground mb-1.5 block">PASSWORD</label>
                    <input
                      type="password" value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleLogin()}
                      placeholder="Enter your password"
                      className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                      disabled={isLoggingIn}
                    />
                  </div>

                  {error && (
                    <div className="text-sm text-destructive font-mono flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> {error}
                    </div>
                  )}

                  <button onClick={handleLogin} disabled={isLoggingIn}
                    className="w-full py-3 rounded-lg font-mono text-sm font-bold transition-all flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {isLoggingIn
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Authenticating...</>
                      : <><LogIn className="w-4 h-4" /> Sign In</>}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4">
                {result.login_status === 'allowed' ? (
                  <>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                      style={{ background: 'hsl(142 70% 45% / 0.15)' }}>
                      <CheckCircle className="w-8 h-8" style={{ color: 'hsl(142 70% 45%)' }} />
                    </div>
                    <h2 className="text-lg font-bold font-mono text-foreground mb-1">Welcome, {result.username}</h2>
                    <p className="text-sm text-muted-foreground font-mono">{result.message}</p>
                  </>
                ) : result.login_status === 'denied' ? (
                  <>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                      style={{ background: 'hsl(350 100% 59% / 0.15)' }}>
                      <XCircle className="w-8 h-8 text-destructive" />
                    </div>
                    <h2 className="text-lg font-bold font-mono text-destructive mb-1">Access Denied</h2>
                    <p className="text-sm text-muted-foreground font-mono">{result.message}</p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                      style={{ background: 'hsl(350 100% 59% / 0.15)' }}>
                      <XCircle className="w-8 h-8 text-destructive" />
                    </div>
                    <h2 className="text-lg font-bold font-mono text-destructive mb-1">Access Restricted</h2>
                    <p className="text-sm text-muted-foreground font-mono">{result.message}</p>
                  </>
                )}

                <button onClick={() => { setResult(null); setUsername(''); setPassword(''); }}
                  className="mt-6 px-6 py-2 rounded-lg border border-border text-sm font-mono text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all">
                  Sign in with another account
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-[10px] font-mono text-muted-foreground/50 mt-6">
          Protected by TrustNet AI Guardian
        </p>
      </motion.div>
    </div>
  );
};

export default LoginPortal;
