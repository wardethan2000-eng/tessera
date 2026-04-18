import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const rootDir = dirname(fileURLToPath(import.meta.url));
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://familytree:familytree-dev-secret@192.168.68.111:5432/familytree";

export default defineConfig({
  dialect: "postgresql",
  schema: join(rootDir, "packages/database/src/**/*.ts"),
  out: join(rootDir, "drizzle"),
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
