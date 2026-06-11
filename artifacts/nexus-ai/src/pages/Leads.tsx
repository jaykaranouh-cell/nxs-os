import { useState } from "react";
import { 
  useListLeads, 
  useGetLeadStats, 
  useCreateLead, 
  useQualifyLead,
  getListLeadsQueryKey,
  getGetLeadStatsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Network, Plus, Search, Filter, Kanban, Table as TableIcon, Mail, Building, Phone } from "lucide-react";

export default function Leads() {
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const { data: leads, isLoading: isLeadsLoading } = useListLeads();
  const { data: stats, isLoading: isStatsLoading } = useGetLeadStats();
  
  const queryClient = useQueryClient();
  
  const stages = [
    { id: "incoming", label: "Incoming" },
    { id: "sales_review", label: "Sales Review" },
    { id: "proposal", label: "Proposal" },
    { id: "negotiation", label: "Negotiation" },
    { id: "won", label: "Closed Won" }
  ];

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Network className="h-8 w-8 text-accent" />
            Lead Pipeline
          </h1>
          <p className="text-muted-foreground mt-1">Manage and track your incoming business opportunities</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Tabs value={view} onValueChange={(v) => setView(v as "kanban" | "table")}>
            <TabsList className="bg-card border border-border/50">
              <TabsTrigger value="kanban"><Kanban className="h-4 w-4 mr-2" /> Kanban</TabsTrigger>
              <TabsTrigger value="table"><TableIcon className="h-4 w-4 mr-2" /> Table</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={() => setIsCreateOpen(true)} className="bg-accent hover:bg-accent/80 text-accent-foreground">
            <Plus className="h-4 w-4 mr-2" /> New Lead
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {isStatsLoading ? (
           Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : stats && (
          <>
            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Leads</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                  <Network className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Qualified</p>
                  <p className="text-2xl font-bold text-chart-3">{stats.qualified}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">New Leads</p>
                  <p className="text-2xl font-bold text-accent">{stats.new}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pipeline Value</p>
                  <p className="text-2xl font-bold text-chart-4">${stats.totalPipelineValue?.toLocaleString() || 0}</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="flex-1 min-h-[500px] overflow-hidden flex flex-col">
        {view === "kanban" ? (
          <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
            {stages.map(stage => {
              const stageLeads = leads?.filter(l => l.stage === stage.id) || [];
              return (
                <div key={stage.id} className="w-[300px] min-w-[300px] flex flex-col gap-3">
                  <div className="flex items-center justify-between bg-card/50 border border-border/50 px-3 py-2 rounded-lg">
                    <h3 className="font-semibold text-sm tracking-wider uppercase">{stage.label}</h3>
                    <Badge variant="secondary" className="bg-background">{stageLeads.length}</Badge>
                  </div>
                  
                  <div className="flex-1 bg-card/30 border border-border/30 rounded-lg p-2 flex flex-col gap-2 overflow-y-auto">
                    {isLeadsLoading ? (
                      Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
                    ) : stageLeads.map(lead => (
                      <Card key={lead.id} className="border-border/50 bg-card/80 hover:border-primary/50 cursor-pointer transition-all hover:-translate-y-1">
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-medium truncate pr-2">{lead.name}</span>
                            <Badge variant={lead.status === 'qualified' ? 'default' : 'secondary'} className="text-[9px] h-4">
                              {lead.status}
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Building className="h-3 w-3" /> {lead.company}</p>
                            {lead.estimatedValue ? (
                              <p className="text-xs font-medium text-chart-4 mt-2">${lead.estimatedValue.toLocaleString()}</p>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-card border border-border/50 rounded-lg flex-1 overflow-hidden flex flex-col">
             <div className="p-4 border-b border-border/50 flex justify-between items-center bg-card/50">
               <div className="relative w-72">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                 <Input 
                   placeholder="Search leads..." 
                   value={search}
                   onChange={(e) => setSearch(e.target.value)}
                   className="pl-9 h-9"
                 />
               </div>
               <Button variant="outline" size="sm" className="h-9"><Filter className="h-4 w-4 mr-2" /> Filter</Button>
             </div>
             
             <div className="flex-1 overflow-auto">
               <table className="w-full text-sm text-left">
                 <thead className="text-xs text-muted-foreground uppercase bg-card/80 sticky top-0 border-b border-border/50">
                   <tr>
                     <th className="px-4 py-3 font-medium">Name</th>
                     <th className="px-4 py-3 font-medium">Company</th>
                     <th className="px-4 py-3 font-medium">Status</th>
                     <th className="px-4 py-3 font-medium">Stage</th>
                     <th className="px-4 py-3 font-medium text-right">Value</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-border/50">
                   {isLeadsLoading ? (
                      <tr><td colSpan={5} className="p-4"><Skeleton className="h-8 w-full" /></td></tr>
                   ) : leads?.map(lead => (
                     <tr key={lead.id} className="hover:bg-primary/5 cursor-pointer transition-colors">
                       <td className="px-4 py-3 font-medium text-foreground">{lead.name}</td>
                       <td className="px-4 py-3 text-muted-foreground">{lead.company}</td>
                       <td className="px-4 py-3">
                         <Badge variant="outline" className="bg-background text-xs">{lead.status}</Badge>
                       </td>
                       <td className="px-4 py-3 capitalize text-muted-foreground">{lead.stage.replace('_', ' ')}</td>
                       <td className="px-4 py-3 text-right font-medium text-chart-4">
                         {lead.estimatedValue ? `$${lead.estimatedValue.toLocaleString()}` : '-'}
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
