import { Router } from "express";
import { z } from "zod/v4";
import {
  listObjectives,
  createObjective,
  addObjectiveStep,
  updateObjectiveProgress,
} from "../lib/orchestrator/objectives";

const router = Router();

// GET /objectives
router.get("/objectives", async (req, res) => {
  res.json(await listObjectives());
});

const createBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  targetDate: z.string().optional(),
});

// POST /objectives
router.post("/objectives", async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid objective" }); return; }
  const id = await createObjective(parsed.data);
  res.status(201).json({ id });
});

// POST /objectives/:id/steps
router.post("/objectives/:id/steps", async (req, res) => {
  const id = parseInt(req.params.id);
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (isNaN(id) || !title) { res.status(400).json({ error: "Invalid step" }); return; }
  const ok = await addObjectiveStep(id, title);
  if (!ok) { res.status(404).json({ error: "Objective not found" }); return; }
  res.status(201).json({ ok: true });
});

const progressBody = z.object({
  progress: z.number().int().min(0).max(100).optional(),
  status: z.enum(["active", "achieved", "abandoned"]).optional(),
  completeStep: z.string().optional(),
});

// POST /objectives/:id/progress
router.post("/objectives/:id/progress", async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = progressBody.safeParse(req.body);
  if (isNaN(id) || !parsed.success) { res.status(400).json({ error: "Invalid update" }); return; }
  const ok = await updateObjectiveProgress(id, parsed.data);
  if (!ok) { res.status(404).json({ error: "Objective not found" }); return; }
  res.json({ ok: true });
});

export default router;
