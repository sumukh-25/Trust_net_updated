import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { getAuthSession, subscribeAuthSession, type AuthSession } from "@/services/authSession";

const AuthContext = createContext<AuthSession | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribeAuthSession, getAuthSession, getAuthSession);
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const session = useContext(AuthContext);
  return {
    session,
    user: session?.user ?? null,
    role: session?.user.role ?? null,
    isAuthenticated: Boolean(session?.token),
    hasPermission: (permission: string) => session?.permissions.includes(permission) ?? false,
  };
}
