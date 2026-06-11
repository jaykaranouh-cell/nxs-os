import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Bearer-token guard for the whole API. Enabled by setting NXS_ACCESS_TOKEN;
 * when the env var is unset (local dev) all requests pass through.
 * /health stays open so uptime checks and deploy probes keep working.
 */
export function authGuard(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.NXS_ACCESS_TOKEN;
  if (!expected || req.path === "/health") {
    next();
    return;
  }

  const header = req.headers.authorization;
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : "";

  if (provided && safeEqual(provided, expected)) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
