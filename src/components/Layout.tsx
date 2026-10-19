/**
 * Layout — STEP 1: Premium Glass Shell
 *
 * Changes from previous version:
 *  - CyberBackground → DotGridBackground (calm dot-grid, no WebGL)
 *  - useCursorGlow removed — normal cursor
 *  - Sidebar: true frosted-glass, framer-motion layoutId sliding active pill
 *  - Sidebar: collapse animates width (spring), labels fade
 *  - Sidebar: System Risk card colours use riskColor() semantic palette
 *  - Topbar: glass, LIVE green-pulse chip, SIMULATE THREAT red chip
 *  - Route transition: soft fade + 6px y-slide (no blur artifact)
 *
 * All auth, store, backend calls preserved exactly.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useSpring, useMotionValue } from 'framer-motion';
import {
  Shield, LayoutDashboard, Activity, GitBranch, Radio,
  AlertTriangle, Settings, Zap, ChevronLeft, ChevronRight,
  Menu, X, Search, LogOut,
} from 'lucide-react';
import { useSecurity } from '@/store/securityStore';
import { useAuth } from '@/store/authContext';
import { mlBackendService, type WsState } from '@/services/mlBackendService';
import NotificationBell from '@/components/NotificationBell';
import CommandPalette from '@/components/CommandPalette';
import { DotGridBackground } from '@/components/ui/DotGridBackground';
import { riskColor, riskLabel, riskTier } from '@/lib/riskColor';

// ─── Nav items ───────────────────────────────────────────────
const navItems = [
  { to: '/overview',        icon: LayoutDashboard, label: 'Overview'           },
  { to: '/behavior',        icon: Activity,        label: 'Behavior Analytics' },
  { to: '/network-activity',icon: Radio,            label: 'Network Activity'   },
  { to: '/propagation',     icon: GitBranch,        label: 'Risk Propagation'   },
  { to: '/incidents',       icon: AlertTriangle,    label: 'Incident Center'    },
  { to: '/admin',           icon: Settings,         label: 'Admin Panel'        },
];

// ─── WS badge config ──────────────────────────────────────────
const wsBadgeConfig: Record<WsState, { label: string; color: string }> = {
  live:         { label: 'LIVE',         color: '#22c55e' },
  reconnecting: { label: 'RECONNECTING', color: '#f59e0b' },
  offline:      { label: 'OFFLINE',      color: '#ef4444' },
};

interface LayoutProps { children: ReactNode }

export const Layout = ({ children }: LayoutProps) => {
  // ─── State ───────────────────────────────────────────────
  const [collapsed,   setCollapsed]   = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [wsState,     setWsState]     = useState<WsState>(mlBackendService.getWsState());
  const [lastMsgAt,   setLastMsgAt]   = useState<number | null>(null);

  const { systemRiskScore, activeAnomalies, isAttackSimulated, simulateAttack, resetSimulation, isSimulating } = useSecurity();
  const { user, hasPermission } = useAuth();
  const location  = useLocation();
  const navigate  = useNavigate();

  useEffect(() =>
    mlBackendService.onWsState((s, at) => { setWsState(s); setLastMsgAt(at); }),
  []);

  const visibleNavItems = navItems.filter(
    ({ to }) => to !== '/admin' || hasPermission('manage_users')
  );

  const wsBadge = wsBadgeConfig[wsState];
  const tier    = riskTier(systemRiskScore);
  const rCol    = riskColor(systemRiskScore);
  const rLabel  = riskLabel(systemRiskScore);

  // ─── Sidebar width spring ──────────────────────────────
  const sideW = useSpring(collapsed ? 68 : 240, { stiffness: 300, damping: 30 });
  useEffect(() => { sideW.set(collapsed ? 68 : 240); }, [collapsed, sideW]);

  return (
    <div className="flex h-screen overflow-hidden text-[--text-primary] relative" style={{ background: '#070b12' }}>
      {/* ── Background ──────────────────────────────────── */}
      <DotGridBackground />

      {/* ── Mobile overlay ──────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mob-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════
          DESKTOP SIDEBAR
      ══════════════════════════════════════════════════ */}
      <motion.aside
        style={{ width: sideW }}
        className="relative hidden lg:flex flex-col h-full z-30 flex-shrink-0 glass-sidebar"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-white/[0.06] flex-shrink-0 overflow-hidden">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)' }}
          >
            <Shield className="w-4 h-4" style={{ color: '#38bdf8' }} />
          </div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key="logo-text"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden whitespace-nowrap"
              >
                <div className="text-sm font-bold tracking-tight text-[--text-primary]">TrustNet</div>
                <div className="text-[10px] font-mono font-semibold tracking-widest" style={{ color: '#a78bfa' }}>
                  AI GUARDIAN
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {visibleNavItems.map(({ to, icon: Icon, label }) => {
            const isActive = to === '/overview'
              ? location.pathname === '/overview'
              : location.pathname.startsWith(to);

            return (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl group"
                style={{ textDecoration: 'none' }}
              >
                {/* Sliding active pill via layoutId */}
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: 'rgba(56,189,248,0.09)',
                      border: '1px solid rgba(56,189,248,0.20)',
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                  />
                )}

                <Icon
                  className="w-4 h-4 flex-shrink-0 relative z-10 transition-colors duration-200"
                  style={{ color: isActive ? '#38bdf8' : 'var(--text-secondary)' }}
                />

                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      key="label"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="text-[13px] font-medium relative z-10 whitespace-nowrap transition-colors duration-200"
                      style={{ color: isActive ? '#f1f5f9' : 'var(--text-secondary)' }}
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </NavLink>
            );
          })}
        </nav>

        {/* System Risk Card */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="risk-card"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div
                className="mx-2.5 mb-3 p-3 rounded-xl"
                style={{
                  background: `rgba(${tier === 'danger' ? '239,68,68' : tier === 'warn' ? '245,158,11' : '34,197,94'},0.06)`,
                  border: `1px solid ${rCol}33`,
                  boxShadow: `0 0 16px ${rCol}18`,
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono font-semibold text-[--text-muted] tracking-widest">
                    SYSTEM RISK
                  </span>
                  <span
                    className="text-[10px] font-mono font-bold"
                    style={{ color: rCol }}
                  >
                    {rLabel}
                  </span>
                </div>

                <div className="flex items-end justify-between gap-2">
                  <span
                    className="text-2xl font-bold font-mono leading-none"
                    style={{ color: rCol }}
                  >
                    {systemRiskScore}
                  </span>
                  <span className="text-[10px] font-mono text-[--text-muted] pb-0.5">/ 100</span>
                </div>

                {/* Risk bar */}
                <div className="risk-bar-track mt-2.5">
                  <motion.div
                    className="risk-bar-fill"
                    style={{ background: rCol }}
                    initial={false}
                    animate={{ width: `${Math.min(100, systemRiskScore)}%` }}
                    transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                  />
                </div>

                <div className="text-[10px] font-mono text-[--text-muted] mt-1.5">
                  {activeAnomalies} active anomal{activeAnomalies === 1 ? 'y' : 'ies'}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-[4.5rem] w-6 h-6 rounded-full z-50 flex items-center justify-center transition-colors duration-200"
          style={{
            background: '#0f1623',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--text-secondary)',
          }}
        >
          {collapsed
            ? <ChevronRight className="w-3 h-3" />
            : <ChevronLeft  className="w-3 h-3" />}
        </button>
      </motion.aside>

      {/* ══════════════════════════════════════════════════
          MOBILE DRAWER
      ══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            key="mob-drawer"
            initial={{ x: -256 }}
            animate={{ x: 0 }}
            exit={{ x: -256 }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className="fixed left-0 top-0 h-full w-64 flex flex-col z-50 lg:hidden glass-sidebar"
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4" style={{ color: '#38bdf8' }} />
                <span className="font-bold text-sm">TrustNet AI</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
              {visibleNavItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                      isActive
                        ? 'text-[#38bdf8]'
                        : 'text-[--text-secondary] hover:text-[--text-primary]'
                    }`
                  }
                  style={({ isActive }) => isActive ? {
                    background: 'rgba(56,189,248,0.09)',
                    border: '1px solid rgba(56,189,248,0.20)',
                  } : {}}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════
          MAIN AREA
      ══════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative z-10">

        {/* ── Top Bar ─────────────────────────────────── */}
        <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 lg:px-5 z-20 glass-topbar">
          {/* Left */}
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Brand */}
            <div className="hidden sm:flex items-center gap-2 font-mono">
              <span className="text-xs font-bold tracking-wider" style={{ color: '#38bdf8' }}>
                TRUSTNET AI
              </span>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
              <span className="text-xs text-[--text-secondary]">Autonomous SOC Platform</span>
            </div>

            {/* AI Co-pilot badge */}
            <span
              className="hidden md:inline-flex items-center gap-1.5 badge badge-ai text-[10px] tracking-widest"
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#a78bfa' }} />
              AI CO-PILOT
            </span>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            {/* Command palette */}
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              title="Command Palette (Ctrl+K)"
              className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-secondary)',
              }}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Search</span>
              <kbd
                className="hidden md:inline px-1.5 py-0.5 rounded text-[9px] font-semibold"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                ⌘K
              </kbd>
            </button>

            {/* LIVE / WS badge */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold"
              style={{
                background: `${wsBadge.color}14`,
                border: `1px solid ${wsBadge.color}30`,
                color: wsBadge.color,
              }}
              title={lastMsgAt ? `Last message ${new Date(lastMsgAt).toLocaleTimeString()}` : ''}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: wsBadge.color,
                  animation: wsState === 'live' ? 'pulse 2s infinite' : 'none',
                }}
              />
              {wsBadge.label}
            </div>

            {/* Simulate Threat */}
            {hasPermission('approve_incidents') && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={isAttackSimulated ? resetSimulation : simulateAttack}
                disabled={isSimulating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-semibold transition-all duration-200 disabled:opacity-50"
                style={isAttackSimulated ? {
                  background: 'rgba(34,197,94,0.10)',
                  border: '1px solid rgba(34,197,94,0.30)',
                  color: '#22c55e',
                } : {
                  background: 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.30)',
                  color: '#ef4444',
                }}
              >
                <Zap className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
                {isSimulating ? 'SIMULATING…' : isAttackSimulated ? 'RESET ATTACK' : 'SIMULATE THREAT'}
              </motion.button>
            )}

            <div className="w-px h-4 hidden sm:block" style={{ background: 'rgba(255,255,255,0.08)' }} />

            <NotificationBell />

            {/* User info */}
            <div className="hidden md:flex items-center gap-2 pl-1">
              <div className="text-right leading-tight">
                <div className="text-xs font-semibold truncate max-w-[140px]" style={{ color: 'var(--text-primary)' }}>
                  {user?.email}
                </div>
                <div className="text-[10px] font-mono uppercase" style={{ color: 'var(--text-secondary)' }}>
                  {user?.role}
                </div>
              </div>
            </div>

            {/* Logout */}
            <button
              type="button"
              onClick={async () => { await mlBackendService.logout(); navigate('/login', { replace: true }); }}
              title="Sign out"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-mono transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: 'var(--text-secondary)',
              }}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">LOGOUT</span>
            </button>
          </div>
        </header>

        {/* ── Page content ─────────────────────────────── */}
        <main className="flex-1 overflow-y-auto relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
};
