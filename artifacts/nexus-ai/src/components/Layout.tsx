import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  MessageSquare, LayoutDashboard, Brain, Network, Compass,
  Lightbulb, Bot, BarChart3, ArrowRight, Activity, Zap, Menu, X, Settings2,
  Newspaper, Map, Clapperboard,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: "PRIMARY",
    items: [
      { href: "/city", label: "NXS City", icon: Map, hint: "spatial command world" },
      { href: "/orchestrator", label: "Orchestrator", icon: MessageSquare, hint: "conversation" },
      { href: "/", label: "Command Centre", icon: LayoutDashboard, hint: "daily briefing" },
      { href: "/morning-brief", label: "Morning Brief", icon: Newspaper, hint: "your AI CEO" },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { href: "/memory", label: "Memory Engine", icon: Brain, hint: "knowledge base" },
      { href: "/memory-graph", label: "Memory Graph", icon: Network, hint: "connected context" },
      { href: "/strategic-brain", label: "Strategic Brain", icon: Compass, hint: "vision & principles" },
      { href: "/opportunities", label: "Opportunity Engine", icon: Lightbulb, hint: "discoveries" },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { href: "/agents", label: "Agent Layer", icon: Bot, hint: "flexible agents" },
      { href: "/leads", label: "Pipeline", icon: ArrowRight, hint: "leads & deals" },
      { href: "/content", label: "Content Studio", icon: Clapperboard, hint: "multi-platform content" },
      { href: "/kpi", label: "KPI Layer", icon: BarChart3, hint: "outcomes & metrics" },
    ],
  },
  {
    label: "SETUP",
    items: [
      { href: "/setup", label: "Context Setup", icon: Settings2, hint: "business context" },
    ],
  },
];

function SidebarContent({ onNav }: { onNav?: () => void }) {
  const [location] = useLocation();
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-border/60 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-primary/30 animate-pulse" />
            <div className="relative w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div>
            <div className="font-bold text-foreground tracking-widest text-sm">NXS OS</div>
            <div className="text-[9px] text-primary/70 font-mono tracking-wider">PERSONAL AI OS</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-4 px-3 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-3">
            <div className="px-3 py-1.5 text-[9px] font-bold tracking-[0.2em] text-muted-foreground/50 uppercase">
              {section.label}
            </div>
            {section.items.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNav}
                  className={`group flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_12px_rgba(0,255,255,0.08)]"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-primary" : "group-hover:text-foreground/70"}`} />
                  <span className="flex-1 leading-none">{item.label}</span>
                  {isActive && (
                    <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border/40 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] font-mono text-muted-foreground/60">SYSTEM_ONLINE • NXS OS v1.0</span>
        </div>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* ── Desktop Sidebar ── */}
      <div className="hidden md:flex w-64 border-r border-border/60 bg-card flex-col z-10 shadow-xl flex-shrink-0">
        <SidebarContent />
      </div>

      {/* ── Mobile Drawer overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile Drawer panel ── */}
      <div
        className={`fixed top-0 left-0 h-full w-72 bg-card border-r border-border/60 shadow-2xl z-50 transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent onNav={() => setMobileOpen(false)} />
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border/60 bg-card flex-shrink-0 z-10">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="absolute -inset-0.5 rounded-full bg-primary/30 animate-pulse" />
              <div className="relative w-6 h-6 rounded-md bg-primary/20 border border-primary/40 flex items-center justify-center">
                <Zap className="h-3 w-3 text-primary" />
              </div>
            </div>
            <span className="font-bold text-sm tracking-widest">NXS OS</span>
          </div>
        </div>

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.3) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 z-10 min-w-0">{children}</main>
      </div>
    </div>
  );
}
