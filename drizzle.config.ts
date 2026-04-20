import { defineConfig } from "drizzle-kit";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://familytree:familytree-dev-secret@192.168.68.111:5432/familytree";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "../../drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
