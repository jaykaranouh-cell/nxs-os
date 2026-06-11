import { useState } from "react";
import { useListMemoryEntries } from "@workspace/api-client-react";
import type { MemoryEntry } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Network, Users, Building, Folder, Brain, Search, X,
  ChevronRight, ArrowRight, Link2, Target, CheckCircle2,
  Lightbulb, AlertTriangle, MessageSquare
} from "lucide-react";

interface EntityNode {
  name: string;
  entries: MemoryEntry[];
  type: "person" | "company" | "project" | "theme";
}

function extractEntities(entries: MemoryEntry[]) {
  const people: Record<string, MemoryEntry[]> = {};
  const companies: Record<string, MemoryEntry[]> = {};
  const projects: Record<string, MemoryEntry[]> = {};

  for (const entry of entries) {
    if (entry.relatedPeople) {
      for (const p of entry.relatedPeople.split(",").map((s) => s.trim()).filter(Boolean)) {
        if (p.toLowerCase() === "jay") continue; // Jay is in everything — skip
        if (!people[p]) people[p] = [];
        people[p].push(entry);
      }
    }
    if (entry.relatedCompanies) {
      for (const c of entry.relatedCompanies.split(",").map((s) => s.trim()).filter(Boolean)) {
        if (c.toLowerCase() === "nexus ai") continue; // Skip self
        if (!companies[c]) companies[c] = [];
        companies[c].push(entry);
      }
    }
    if (entry.linkedProjects) {
      for (const proj of entry.linkedProjects.split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!projects[proj]) projects[proj] = [];
        projects[proj].push(entry);
      }
    }
  }

  const peopleNodes: EntityNode[] = Object.entries(people)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, ents]) => ({ name, entries: ents, type: "person" as const }));

  const companyNodes: EntityNode[] = Object.entries(companies)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, ents]) => ({ name, entries: ents, type: "company" as const }));

  const projectNodes: EntityNode[] = Object.entries(projects)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, ents]) => ({ name, entries: ents, type: "project" as const }));

  return { peopleNodes, companyNodes, projectNodes };
}

const CAT_ICONS: Record<string, typeof Brain> = {
  decisions: CheckCircle2,
  decision: CheckCircle2,
  goals: Target,
  ideas: Lightbulb,
  risks: AlertTriangle,
  conversations: MessageSquare,
  clients: Users,
  projects: Folder,
  default: Brain,
};

const CAT_COLORS: Record<string, string> = {
  decisions: "text-purple-400",
  decision: "text-purple-400",
  goals: "text-green-400",
  ideas: "text-violet-400",
  risks: "text-red-400",
  conversations: "text-sky-400",
  clients: "text-emerald-400",
  projects: "text-cyan-400",
  default: "text-muted-foreground",
};

function getCatIcon(cat: string) {
  return CAT_ICONS[cat] ?? CAT_ICONS.default;
}
function getCatColor(cat: string) {
  return CAT_COLORS[cat] ?? CAT_COLORS.default;
}

function EntityCard({
  node,
  selected,
  onClick,
}: {
  node: EntityNode;
  selected: boolean;
  onClick: () => void;
}) {
  const TypeIcon = node.type === "person" ? Users : node.type === "company" ? Building : Folder;
  const borderColor =
    node.type === "person"
      ? selected ? "border-primary/60 bg-primary/5" : "border-border/40"
      : node.type === "company"
      ? selected ? "border-emerald-400/60 bg-emerald-400/5" : "border-border/40"
      : selected ? "border-cyan-400/60 bg-cyan-400/5" : "border-border/40";

  const accentColor =
    node.type === "person" ? "text-primary" : node.type === "company" ? "text-emerald-400" : "text-cyan-400";

  const highPri = node.entries.filter(
    (e) => e.priority === "critical" || e.priority === "high" || e.importance === "critical" || e.importance === "high"
  ).length;

  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer transition-all duration-150 hover:-translate-y-0.5 bg-card/50 ${borderColor}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-md bg-background/60`}>
              <TypeIcon className={`h-3.5 w-3.5 ${accentColor}`} />
            </div>
            <span className={`text-sm font-semibold ${accentColor}`}>{node.name}</span>
          </div>
          <Badge variant="outline" className={`text-[9px] border-border/40 text-muted-foreground`}>
            {node.entries.length} {node.entries.length === 1 ? "entry" : "entries"}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-1">
          {node.entries.slice(0, 3).map((e) => {
            const CatIcon = getCatIcon(e.category);
            return (
              <span
                key={e.id}
                className={`text-[9px] flex items-center gap-0.5 ${getCatColor(e.category)} bg-background/40 border border-border/30 rounded px-1.5 py-0.5`}
              >
                <CatIcon className="h-2 w-2" /> {e.category}
              </span>
            );
          })}
          {node.entries.length > 3 && (
            <span className="text-[9px] text-muted-foreground/50">+{node.entries.length - 3} more</span>
          )}
        </div>

        {highPri > 0 && (
          <div className="flex items-center gap-1 mt-2">
            <div className="w-1 h-1 rounded-full bg-red-400" />
            <span className="text-[9px] text-red-400">{highPri} high-priority</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EntityDetail({ node, onClose }: { node: EntityNode; onClose: () => void }) {
  const TypeIcon = node.type === "person" ? Users : node.type === "company" ? Building : Folder;
  const accentColor =
    node.type === "person" ? "text-primary border-primary/30" : node.type === "company" ? "text-emerald-400 border-emerald-400/30" : "text-cyan-400 border-cyan-400/30";

  return (
    <div className="border border-border/40 bg-card/50 rounded-xl overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border/40 bg-card/60">
        <div className="flex items-center gap-2">
          <TypeIcon className={`h-4 w-4 ${accentColor.split(" ")[0]}`} />
          <span className="font-bold text-sm">{node.name}</span>
          <Badge variant="outline" className="text-[9px]">{node.entries.length} connected entries</Badge>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {node.entries.map((entry) => {
          const CatIcon = getCatIcon(entry.category);
          const isHighPri = entry.priority === "critical" || entry.priority === "high" || entry.importance === "critical" || entry.importance === "high";
          return (
            <div key={entry.id} className="p-3 bg-background/60 border border-border/40 rounded-lg">
              <div className="flex items-start gap-2">
                <CatIcon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${getCatColor(entry.category)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-foreground leading-snug">{entry.title}</p>
                    {isHighPri && <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {entry.summary ?? entry.content}
                  </p>
                  {entry.nextAction && (
                    <p className="text-[9px] text-primary mt-1 flex items-center gap-1">
                      <ArrowRight className="h-2.5 w-2.5" /> {entry.nextAction}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThemeSection({ entries }: { entries: MemoryEntry[] }) {
  const themes: Record<string, MemoryEntry[]> = {};
  for (const e of entries) {
    if (!themes[e.category]) themes[e.category] = [];
    themes[e.category].push(e);
  }
  const sorted = Object.entries(themes).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="space-y-2">
      {sorted.map(([cat, ents]) => {
        const CatIcon = getCatIcon(cat);
        return (
          <div key={cat} className="flex items-center gap-3 p-2.5 bg-background/40 border border-border/30 rounded-lg">
            <div className={`p-1.5 rounded bg-background/60`}>
              <CatIcon className={`h-3.5 w-3.5 ${getCatColor(cat)}`} />
            </div>
            <div className="flex-1">
              <p className={`text-xs font-medium capitalize ${getCatColor(cat)}`}>{cat.replace("_", " ")}</p>
              <p className="text-[10px] text-muted-foreground">{ents.length} {ents.length === 1 ? "entry" : "entries"}</p>
            </div>
            <div className="flex flex-wrap gap-0.5 max-w-32">
              {ents.slice(0, 2).map((e) => (
                <span key={e.id} className="text-[9px] text-muted-foreground/60 bg-muted/30 rounded px-1 py-0.5 truncate max-w-28">
                  {e.title.substring(0, 20)}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MemoryGraph() {
  const { data: allEntries, isLoading } = useListMemoryEntries();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EntityNode | null>(null);
  const [activeTab, setActiveTab] = useState<"people" | "companies" | "projects" | "themes">("people");

  const { peopleNodes, companyNodes, projectNodes } = allEntries
    ? extractEntities(allEntries)
    : { peopleNodes: [], companyNodes: [], projectNodes: [] };

  const filterNodes = (nodes: EntityNode[]) => {
    if (!search) return nodes;
    return nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(search.toLowerCase()) ||
        n.entries.some((e) => e.title.toLowerCase().includes(search.toLowerCase()))
    );
  };

  const tabs = [
    { id: "people" as const, label: "People", icon: Users, nodes: peopleNodes, color: "text-primary" },
    { id: "companies" as const, label: "Companies", icon: Building, nodes: companyNodes, color: "text-emerald-400" },
    { id: "projects" as const, label: "Projects", icon: Folder, nodes: projectNodes, color: "text-cyan-400" },
    { id: "themes" as const, label: "By Theme", icon: Brain, nodes: [], color: "text-violet-400" },
  ];

  const activeNodes = filterNodes(tabs.find((t) => t.id === activeTab)?.nodes ?? []);

  const totalConnections = peopleNodes.reduce((s, n) => s + n.entries.length, 0) +
    companyNodes.reduce((s, n) => s + n.entries.length, 0);

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Network className="h-8 w-8 text-emerald-400" /> Memory Graph
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Connected context across people, companies, projects, and decisions — relationships, not just folders.
        </p>
      </div>

      {/* Stats + Search */}
      <div className="flex gap-4 items-center flex-shrink-0">
        <div className="flex gap-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-card/50 border border-border/40 rounded-lg">
            <Users className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold">{peopleNodes.length} people</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-card/50 border border-border/40 rounded-lg">
            <Building className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-semibold">{companyNodes.length} companies</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-card/50 border border-border/40 rounded-lg">
            <Folder className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-xs font-semibold">{projectNodes.length} projects</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-card/50 border border-border/40 rounded-lg">
            <Link2 className="h-3.5 w-3.5 text-yellow-400" />
            <span className="text-xs font-semibold">{totalConnections} connections</span>
          </div>
        </div>
        <div className="relative flex-1 max-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entities..." className="pl-9 bg-card border-border/50 h-9" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-shrink-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.id}
              size="sm"
              variant={activeTab === tab.id ? "default" : "outline"}
              onClick={() => { setActiveTab(tab.id); setSelected(null); }}
              className={`gap-2 text-xs ${activeTab === tab.id ? "" : "border-border/40 text-muted-foreground"}`}
            >
              <Icon className={`h-3.5 w-3.5 ${activeTab === tab.id ? "" : tab.color}`} />
              {tab.label}
              {tab.nodes.length > 0 && <Badge variant="secondary" className="ml-1 text-[9px] h-4">{tab.nodes.length}</Badge>}
            </Button>
          );
        })}
      </div>

      {/* Main content */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Entity grid */}
        <div className={`flex-1 overflow-y-auto ${selected ? "pr-1" : ""}`}>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : activeTab === "themes" ? (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground mb-2">Memory entries organized by their category/theme across the OS</div>
              <ThemeSection entries={allEntries ?? []} />
            </div>
          ) : activeNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
              <Network className="h-12 w-12 mb-4 opacity-20" />
              <p className="font-medium">No {activeTab} found</p>
              <p className="text-sm mt-1">Add people or companies to your memory entries to build the graph</p>
            </div>
          ) : (
            <div className={`grid gap-3 ${selected ? "grid-cols-1" : "grid-cols-2 xl:grid-cols-3"}`}>
              {activeNodes.map((node) => (
                <EntityCard
                  key={node.name}
                  node={node}
                  selected={selected?.name === node.name}
                  onClick={() => setSelected(selected?.name === node.name ? null : node)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-[380px] flex-shrink-0">
            <EntityDetail node={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>

      {/* Bottom hint */}
      <p className="text-[10px] text-muted-foreground/40 flex-shrink-0">
        Graph built from <strong>{allEntries?.length ?? 0}</strong> memory entries — add people, companies, and project links to memory entries to expand the graph
      </p>
    </div>
  );
}
