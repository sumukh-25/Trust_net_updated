/**
 * riskColor — maps a 0-100 risk score to the semantic design-system colour.
 * Use this everywhere: badges, node colours, bars, chart series, glows.
 *
 * Tiers (aligned with backend policy):
 *   0-30  → safe   (emerald #22c55e)
 *   31-60 → warn   (amber   #f59e0b)
 *   61+   → danger (red     #ef4444)
 */

export const RISK_COLORS = {
  safe:   '#22c55e',
  warn:   '#f59e0b',
  danger: '#ef4444',
  info:   '#38bdf8',
  ai:     '#a78bfa',
} as const;

export type RiskTier = 'safe' | 'warn' | 'danger';

export function riskTier(score: number): RiskTier {
  if (score <= 30) return 'safe';
  if (score <= 60) return 'warn';
  return 'danger';
}

export function riskColor(score: number): string {
  return RISK_COLORS[riskTier(score)];
}

export function riskLabel(score: number): string {
  const tier = riskTier(score);
  if (tier === 'safe')   return 'NOMINAL';
  if (tier === 'warn')   return 'ELEVATED';
  return 'CRITICAL';
}

/** Returns Tailwind CSS class string for text colour */
export function riskTextClass(score: number): string {
  if (score <= 30) return 'text-safe';
  if (score <= 60) return 'text-warn';
  return 'text-danger';
}

/** Returns the CSS variable name for glow */
export function riskGlowClass(score: number): string {
  if (score <= 30) return 'glow-safe';
  if (score <= 60) return 'glow-warn';
  return 'glow-danger';
}

/** Returns the badge CSS class */
export function riskBadgeClass(score: number): string {
  if (score <= 30) return 'badge-safe';
  if (score <= 60) return 'badge-warn';
  return 'badge-danger';
}

/** For threat-level strings from the backend */
export function threatLevelColor(level: string): string {
  switch (level) {
    case 'safe':     return RISK_COLORS.safe;
    case 'low':      return '#86efac'; // light green
    case 'medium':   return RISK_COLORS.warn;
    case 'high':     return '#f97316'; // orange
    case 'critical': return RISK_COLORS.danger;
    default:         return RISK_COLORS.info;
  }
}

export function threatLevelBadge(level: string): string {
  switch (level) {
    case 'safe':
    case 'low':      return 'badge-safe';
    case 'medium':   return 'badge-warn';
    case 'high':
    case 'critical': return 'badge-danger';
    default:         return 'badge-info';
  }
}
