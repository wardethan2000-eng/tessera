import { createDb } from "@familytree/database";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const db = createDb(process.env.DATABASE_URL);
