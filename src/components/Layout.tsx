import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, LayoutDashboard, Activity, GitBranch, Radio,
  AlertTriangle, Settings, Zap, ChevronLeft, ChevronRight, Menu, X
} from 'lucide-react';
import { useSecurity } from '@/store/securityStore';
import { useAuth } from '@/store/authContext';
import { mlBackendService, type WsState } from '@/services/mlBackendService';
import NotificationBell from '@/components/NotificationBell';

const navItems = [
  { to: '/overview', icon: LayoutDashboard, label: 'Overview', exact: true },
  { to: '/behavior', icon: Activity, label: 'Behavior Analytics' },
  { to: '/network-activity', icon: Radio, label: 'Network Activity' },
  { to: '/propagation', icon: GitBranch, label: 'Risk Propagation' },
  { to: '/incidents', icon: AlertTriangle, label: 'Incident Center' },
  { to: '/admin', icon: Settings, label: 'Admin Panel' },
];

const getThreatColor = (score: number) => {
  if (score <= 30) return 'text-primary';
  if (score <= 60) return 'text-warning';
  if (score <= 85) return 'text-orange-400';
  return 'text-destructive';
};

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { systemRiskScore, activeAnomalies, isAttackSimulated, simulateAttack, resetSimulation, isSimulating } = useSecurity();
  const [wsState, setWsState] = useState<WsState>(mlBackendService.getWsState());
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  useEffect(() => mlBackendService.onWsState((state, at) => { setWsState(state); setLastMessageAt(at); }), []);
  const wsBadge = {
    live: { label: 'LIVE', color: 'hsl(142 70% 45%)' },
    reconnecting: { label: 'RECONNECTING', color: 'hsl(38 95% 55%)' },
    offline: { label: 'OFFLINE', color: 'hsl(350 100% 59%)' },
  }[wsState];
  const location = useLocation();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const visibleNavItems = navItems.filter(({ to }) => to !== '/admin' || hasPermission('manage_users'));

  const threatColor = getThreatColor(systemRiskScore);

  return (
    <div className="flex h-screen overflow-hidden bg-background cyber-grid">
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="relative hidden lg:flex flex-col h-full border-r border-border z-30 flex-shrink-0"
        style={{ background: 'hsl(var(--sidebar-background))' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 p-4 border-b border-border h-16 flex-shrink-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 animate-glow-pulse"
            style={{ background: 'hsl(350 100% 59% / 0.15)', border: '1px solid hsl(350 100% 59% / 0.5)' }}
          >
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                <div className="font-bold text-sm text-foreground">TrustNet</div>
                <div className="text-[10px] font-mono text-primary">AI SECURITY</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {visibleNavItems.map(({ to, icon: Icon, label }) => {
            const isActive = to === '/overview' ? location.pathname === '/overview' : location.pathname.startsWith(to);
            return (
              <NavLink
                key={to}
                to={to}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative
                  ${isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }
                `}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute inset-0 rounded-lg"
                    style={{ background: 'hsl(350 100% 59% / 0.1)', border: '1px solid hsl(350 100% 59% / 0.3)' }}
                  />
                )}
                <Icon className={`w-4 h-4 flex-shrink-0 relative z-10 ${isActive ? 'text-primary' : ''}`} />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm font-medium relative z-10 whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </NavLink>
            );
          })}
        </nav>

        {/* Risk indicator */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-3 m-2 rounded-lg border"
              style={{
                background: isAttackSimulated ? 'hsl(350 100% 59% / 0.1)' : 'hsl(150 68% 51% / 0.05)',
                borderColor: isAttackSimulated ? 'hsl(350 100% 59% / 0.3)' : 'hsl(150 68% 51% / 0.2)',
              }}
            >
              <div className="text-[9px] font-mono text-muted-foreground mb-1">SYSTEM RISK</div>
              <div className={`text-2xl font-bold font-mono ${threatColor}`}>{systemRiskScore}</div>
              <div className="text-[9px] font-mono text-muted-foreground mt-1">{activeAnomalies} anomalies active</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors z-10"
          style={{ background: 'hsl(var(--sidebar-background))' }}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </motion.aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: -240 }}
            animate={{ x: 0 }}
            exit={{ x: -240 }}
            transition={{ duration: 0.3 }}
            className="fixed left-0 top-0 h-full w-60 flex flex-col border-r border-border z-50 lg:hidden"
            style={{ background: 'hsl(var(--sidebar-background))' }}
          >
            <div className="flex items-center justify-between p-4 border-b border-border h-16">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <span className="font-bold text-sm">TrustNet AI</span>
              </div>
              <button onClick={() => setMobileOpen(false)}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <nav className="flex-1 p-2 space-y-1">
              {visibleNavItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                    ${isActive ? 'bg-primary/10 text-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent'}`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top bar */}
        <header
          className="h-16 flex-shrink-0 flex items-center justify-between px-4 lg:px-6 border-b border-border"
          style={{ background: 'hsl(220 30% 6% / 0.9)' }}
        >
          <div className="flex items-center gap-3">
            <div className="hidden md:block text-right leading-tight">
              <div className="text-xs font-medium text-foreground">{user?.email}</div>
              <div className="text-[9px] font-mono uppercase text-muted-foreground">{user?.role}</div>
            </div>
            <NotificationBell />
            <button
              type="button"
              onClick={async () => { await mlBackendService.logout(); navigate('/login', { replace: true }); }}
              className="inline-flex items-center px-2 py-1 rounded border border-border text-[9px] font-mono text-muted-foreground hover:text-foreground"
            >
              SIGN OUT
            </button>
            <button className="lg:hidden text-muted-foreground" onClick={() => setMobileOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <div className="font-mono text-xs text-muted-foreground hidden sm:block">
              <span className="text-primary">TRUSTNET AI</span>
              <span className="mx-2 opacity-40">•</span>
              <span>Cognitive Security Platform v2.4.1</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live indicator: reflects the real WebSocket state (live / reconnecting with backoff / offline) */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded font-mono text-xs border"
              title={lastMessageAt ? `Last message ${new Date(lastMessageAt).toLocaleTimeString()}` : 'No live message received yet'}
              style={{ background: `${wsBadge.color.replace(')', ' / 0.1)')}`, borderColor: `${wsBadge.color.replace(')', ' / 0.3)')}`, color: wsBadge.color }}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${wsState === 'live' ? 'animate-threat-pulse' : ''}`} style={{ background: wsBadge.color }} />
              {wsBadge.label}
            </div>

            {/* SIMULATE ATTACK BUTTON */}
            {hasPermission('approve_incidents') && <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={isAttackSimulated ? resetSimulation : simulateAttack}
              disabled={isSimulating}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition-all disabled:opacity-60"
              style={isAttackSimulated ? {
                background: 'hsl(150 68% 51% / 0.1)',
                border: '1px solid hsl(150 68% 51% / 0.4)',
                color: 'hsl(150 68% 51%)',
              } : {
                background: 'hsl(350 100% 59% / 0.2)',
                border: '1px solid hsl(350 100% 59% / 0.5)',
                color: 'hsl(350 100% 59%)',
                boxShadow: '0 0 20px hsl(350 100% 59% / 0.3)',
              }}
            >
              <Zap className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
              {isSimulating ? 'SIMULATING...' : isAttackSimulated ? 'RESET SYSTEM' : 'SIMULATE ATTACK'}
            </motion.button>}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
};
