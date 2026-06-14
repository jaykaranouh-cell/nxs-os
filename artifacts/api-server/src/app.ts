import express, { type Express } from "express";
import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authGuard } from "./middlewares/auth";
import { GENERATED_DIR } from "./lib/higgsfield";
import { UPLOADS_DIR } from "./lib/uploads";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Larger limit so chat can carry base64 image/PDF attachments.
app.use(express.json({ limit: "40mb" }));
app.use(express.urlencoded({ extended: true, limit: "40mb" }));

// LLM-backed chat is the expensive surface — cap it independently.
const chatLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
app.use("/api/chat", chatLimiter);
const voiceLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api/voice", voiceLimiter);

app.use("/api", authGuard, router);

// Generated marketing images (Higgsfield). Served unauthenticated so <img> tags
// can load them; filenames are randomised.
fs.mkdirSync(GENERATED_DIR, { recursive: true });
app.use("/generated", express.static(GENERATED_DIR));
// User uploads (documents/photos sent to Maya), served for chat history display.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOADS_DIR));

// Production: serve the built frontend so the whole OS lives on one port.
// In dev (no dist present) this is a no-op and Vite serves the frontend.
const frontendDist =
  process.env.NXS_FRONTEND_DIST ?? path.resolve(process.cwd(), "../nexus-ai/dist/public");
if (fs.existsSync(path.join(frontendDist, "index.html"))) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  logger.info({ frontendDist }, "serving built frontend");
}

export default app;
