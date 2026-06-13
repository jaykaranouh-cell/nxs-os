import { Router } from "express";
import { z } from "zod/v4";
import { getAgent } from "../lib/orchestrator";
import {
  loadAgentProfile,
  setAgentInstructions,
  addAgentKb,
  deleteAgentKb,
} from "../lib/orchestrator/profile";

const router = Router();

function isDept(agentId: string): boolean {
  return ["sales", "marketing", "research", "finance"].includes(agentId);
}

// GET /agents/:agentId/profile
router.get("/agents/:agentId/profile", async (req, res) => {
  const { agentId } = req.params;
  if (!getAgent(agentId)) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(await loadAgentProfile(agentId));
});

const instructionsBody = z.object({ instructions: z.string() });

// PUT /agents/:agentId/instructions
router.put("/agents/:agentId/instructions", async (req, res) => {
  const { agentId } = req.params;
  if (!isDept(agentId)) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const parsed = instructionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid instructions" });
    return;
  }
  await setAgentInstructions(agentId, parsed.data.instructions);
  res.json({ ok: true });
});

const kbBody = z.object({
  kind: z.enum(["skill", "knowledge"]),
  title: z.string().min(1),
  content: z.string().min(1),
});

// POST /agents/:agentId/kb
router.post("/agents/:agentId/kb", async (req, res) => {
  const { agentId } = req.params;
  if (!isDept(agentId)) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const parsed = kbBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid knowledge entry" });
    return;
  }
  const id = await addAgentKb(agentId, parsed.data.kind, parsed.data.title, parsed.data.content, "manual");
  res.status(201).json({ id });
});

// DELETE /agents/:agentId/kb/:kbId
router.delete("/agents/:agentId/kb/:kbId", async (req, res) => {
  const { agentId } = req.params;
  const kbId = parseInt(req.params.kbId);
  if (isNaN(kbId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const ok = await deleteAgentKb(agentId, kbId);
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

export default router;
