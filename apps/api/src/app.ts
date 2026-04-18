import Fastify from "fastify";
import cors from "@fastify/cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { invitationsPlugin } from "./routes/invitations.js";
import { exportPlugin } from "./routes/export.js";
import { treesPlugin } from "./routes/trees.js";
import { peoplePlugin } from "./routes/people.js";
import { mediaPlugin } from "./routes/media.js";
import { memoriesPlugin } from "./routes/memories.js";
import { relationshipsPlugin } from "./routes/relationships.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  // CORS for all non-auth routes. Runs at preHandler so it doesn't conflict
  // with the onRequest hook that intercepts /api/auth/* before body parsing.
  app.register(cors, {
    hook: "preHandler",
    origin: (process.env.TRUSTED_ORIGINS ?? "http://localhost:3000").split(","),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  });

  // Intercept auth routes at onRequest (before Fastify parses the body)
  // so Better Auth can read the raw stream. Better Auth handles its own
  // CORS for these routes via the trustedOrigins config.
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/auth/")) return;
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
    name: "FamilyTree API",
    status: "ready",
  }));

  app.register(treesPlugin);
  app.register(peoplePlugin);
  app.register(mediaPlugin);
  app.register(memoriesPlugin);
  app.register(relationshipsPlugin);
  app.register(invitationsPlugin);
  app.register(exportPlugin);

  return app;
}
