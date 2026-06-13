/**
 * Auto-captured memory proposals awaiting approval — surfaced at the top of
 * the Memory Engine. Approving promotes a proposal into a real memory entry.
 */

import { useQueryClient } from "@tanstack/react-query";
import {
  useListMemoryProposals,
  useApproveMemoryProposal,
  useRejectMemoryProposal,
  getListMemoryProposalsQueryKey,
} from "@workspace/api-client-react";
import { Check, Inbox, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpandableText } from "@/components/ExpandableText";

const SOURCE_LABEL: Record<string, string> = {
  chat: "from chat",
  obsidian: "from Obsidian",
  scheduler: "scheduled",
};

export function ProposalsQueue() {
  const queryClient = useQueryClient();
  const { data: proposals } = useListMemoryProposals({ status: "pending" });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListMemoryProposalsQueryKey({ status: "pending" }) });

  const approve = useApproveMemoryProposal({ mutation: { onSuccess: invalidate } });
  const reject = useRejectMemoryProposal({ mutation: { onSuccess: invalidate } });

  if (!proposals?.length) return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-3.5 w-3.5 text-primary/80" />
        <h2 className="text-[10px] font-bold font-mono uppercase tracking-[0.2em] text-primary/80">
          Proposed Memories
        </h2>
        <span className="text-[9px] font-mono text-white/30">
          {proposals.length} awaiting review
        </span>
        <div className="flex-1 h-px bg-primary/10" />
        <Inbox className="h-3 w-3 text-white/20" />
      </div>
      <div className="space-y-2">
        {proposals.map((p) => (
          <div
            key={p.id}
            className="flex items-start gap-3 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-white/85">{p.title}</span>
                <span className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-white/10 text-white/35">
                  {p.category}
                </span>
                <span className={`text-[8px] font-mono uppercase ${p.priority === "critical" || p.priority === "high" ? "text-yellow-400/80" : "text-white/30"}`}>
                  {p.priority}
                </span>
                <span className="text-[8px] font-mono text-white/25">
                  {SOURCE_LABEL[p.source] ?? p.source}
                </span>
              </div>
              <ExpandableText text={p.content} className="text-[11px] text-white/50 leading-relaxed mt-1" clamp="line-clamp-2" />
              {p.nextAction && (
                <p className="text-[10px] text-primary/60 mt-1">→ {p.nextAction}</p>
              )}
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 border-green-500/30 text-green-400 hover:bg-green-500/10"
                disabled={approve.isPending}
                onClick={() => approve.mutate({ id: p.id })}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 border-white/10 text-white/40 hover:bg-red-500/10 hover:text-red-400"
                disabled={reject.isPending}
                onClick={() => reject.mutate({ id: p.id })}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
