import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { invitationsPlugin } from "./routes/invitations.js";
import { exportPlugin } from "./routes/export.js";
import { treesPlugin } from "./routes/trees.js";
import { peoplePlugin } from "./routes/people.js";
import { mediaPlugin } from "./routes/media.js";
import { memoriesPlugin } from "./routes/memories.js";
import { relationshipsPlugin } from "./routes/relationships.js";
import { promptsPlugin } from "./routes/prompts.js";
import { promptCampaignsPlugin } from "./routes/prompt-campaigns.js";
import { elderCapturePlugin } from "./routes/elder-capture.js";
import { placesPlugin } from "./routes/places.js";
import { importPlugin } from "./routes/import.js";
import { importBatchesPlugin } from "./routes/import-batches.js";
import { curationPlugin } from "./routes/curation.js";
import { mePlugin } from "./routes/me.js";
import { driftPlugin } from "./routes/drift.js";
import { castTokenPlugin } from "./routes/cast-token.js";
import { branchesPlugin } from "./routes/branches.js";
import { searchPlugin } from "./routes/search.js";

export function buildApp() {
  const trustedOriginsEnv = process.env.TRUSTED_ORIGINS;
  if (!trustedOriginsEnv) {
    throw new Error("TRUSTED_ORIGINS environment variable is required");
  }
  const trustedOrigins = trustedOriginsEnv.split(",").map((o) => o.trim()).filter(Boolean);

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers.authorization", "req.headers.cookie", "req.headers['x-csrf-token']"],
    },
  });

  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "https:"],
        fontSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });

  app.register(cors, {
    hook: "preHandler",
    origin: trustedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  });

  // Intercept auth routes at onRequest (before Fastify parses the body)
  // so Better Auth can read the raw stream. Better Auth handles its own
  // CORS for these routes via the trustedOrigins config.
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/auth/")) return;
    const originHeader = request.headers.origin;

    if (originHeader && !trustedOrigins.includes(originHeader)) {
      return reply.status(403).send({ error: "Origin not allowed" });
    }

    if (request.method === "OPTIONS") {
      if (!originHeader) {
        return reply.status(403).send({ error: "Origin not allowed" });
      }
      reply
        .header("Access-Control-Allow-Origin", originHeader)
        .header("Vary", "Origin")
        .header("Access-Control-Allow-Credentials", "true")
        .header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
        .header(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization",
        )
        .status(204)
        .send();
      return;
    }

    if (originHeader) {
      reply.raw.setHeader("Access-Control-Allow-Origin", originHeader);
      reply.raw.setHeader("Vary", "Origin");
      reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
    }

    reply.hijack();
    await new Promise<void>((resolve) => {
      const res = reply.raw;
      res.once("finish", resolve);
      res.once("close", resolve);
      toNodeHandler(auth)(request.raw, res);
    });
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "api",
  }));

  app.get("/", async () => ({
    name: "Tessera API",
    status: "ready",
  }));

  app.register(treesPlugin);
  app.register(peoplePlugin);
  app.register(mediaPlugin);
  app.register(memoriesPlugin);
  app.register(relationshipsPlugin);
  app.register(invitationsPlugin);
  app.register(exportPlugin);
  app.register(promptsPlugin);
  app.register(promptCampaignsPlugin);
  app.register(elderCapturePlugin);
  app.register(placesPlugin);
  app.register(importPlugin);
  app.register(importBatchesPlugin);
  app.register(curationPlugin);
  app.register(mePlugin);
  app.register(driftPlugin);
  app.register(castTokenPlugin);
  app.register(branchesPlugin);
  app.register(searchPlugin);

  return app;
}
