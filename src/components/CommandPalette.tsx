import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  AlertTriangle,
  Radio,
  GitBranch,
  Settings,
  Zap,
  Shield,
  Activity,
  User,
  LogOut,
} from "lucide-react";
import { useSecurity } from "@/store/securityStore";
import { useAuth } from "@/store/authContext";
import { mlBackendService } from "@/services/mlBackendService";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { systemRiskScore, isAttackSimulated, simulateAttack, resetSimulation } = useSecurity();
  const { user, hasPermission } = useAuth();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const runCommand = (command: () => void) => {
    onOpenChange(false);
    command();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command, search routes, or trigger actions..." />
      <CommandList className="max-h-[340px] font-mono text-xs">
        <CommandEmpty>No matching SOC commands found.</CommandEmpty>

        <CommandGroup heading="NAVIGATION">
          <CommandItem
            onSelect={() => runCommand(() => navigate("/overview"))}
            className="flex items-center gap-2.5 cursor-pointer py-2"
          >
            <LayoutDashboard className="w-4 h-4 text-primary" />
            <span>Cybersecurity Command Centre (Overview)</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate("/incidents"))}
            className="flex items-center gap-2.5 cursor-pointer py-2"
          >
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span>Incident Center &amp; AI Guardian Co-Pilot</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate("/network-activity"))}
            className="flex items-center gap-2.5 cursor-pointer py-2"
          >
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>Network Telemetry &amp; Traffic Flow</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate("/propagation"))}
            className="flex items-center gap-2.5 cursor-pointer py-2"
          >
            <GitBranch className="w-4 h-4 text-purple-400" />
            <span>Risk Propagation &amp; Topology Simulation</span>
          </CommandItem>
          {hasPermission("manage_users") && (
            <CommandItem
              onSelect={() => runCommand(() => navigate("/admin"))}
              className="flex items-center gap-2.5 cursor-pointer py-2"
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
              <span>Admin Panel &amp; Risk Policy Governance</span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="SOC THREAT CONTROLS">
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                if (isAttackSimulated) resetSimulation();
                else simulateAttack();
              })
            }
            className="flex items-center gap-2.5 cursor-pointer py-2"
          >
            <Zap className="w-4 h-4 text-primary" />
            <span>{isAttackSimulated ? "Reset Compromise Simulation" : "Simulate Threat Influx"}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              Risk: {systemRiskScore}/100
            </span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate("/overview"))}
            className="flex items-center gap-2.5 cursor-pointer py-2"
          >
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Inspect Registered Device Trust Status</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="SESSION &amp; AUDIT">
          <CommandItem
            onSelect={() =>
              runCommand(async () => {
                await mlBackendService.logout();
                navigate("/login", { replace: true });
              })
            }
            className="flex items-center gap-2.5 cursor-pointer py-2 text-destructive"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out Session ({user?.email})</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
