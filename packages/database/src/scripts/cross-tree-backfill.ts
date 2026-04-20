import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pathToFileURL } from "node:url";
import * as schema from "../schema.js";
import {
  backfillCrossTreeSchema,
  previewCrossTreeBackfill,
} from "../migrations/cross-tree-backfill.js";

function formatCount(label: string, value: number) {
  return `${label}: ${value}`;
}

function printSummary(summary: Awaited<ReturnType<typeof previewCrossTreeBackfill>>) {
  const heading = summary.dryRun
    ? "Cross-tree backfill dry run"
    : "Cross-tree backfill applied";

  console.log(heading);
  console.log(formatCount("tree_person_scope rows", summary.treePersonScopeRowsInserted));
  console.log(formatCount("people.home_tree_id rows", summary.peopleHomeTreeBackfilled));
  console.log(
    formatCount(
      "relationships.created_in_tree_id rows",
      summary.relationshipsCreatedInTreeBackfilled,
    ),
  );
  console.log(
    formatCount(
      "memories.contributing_tree_id rows",
      summary.memoriesContributingTreeBackfilled,
    ),
  );
  console.log(
    formatCount(
      "media.contributing_tree_id rows",
      summary.mediaContributingTreeBackfilled,
    ),
  );
  console.log(formatCount("memory_person_tags rows", summary.memoryTagRowsInserted));
  console.log(
    formatCount("legacy cross-tree merge candidates", summary.legacyMergeCandidates.length),
  );

  if (summary.legacyMergeCandidates.length > 0) {
    console.log("");
    console.log("Legacy cross-tree merge candidates:");
    for (const candidate of summary.legacyMergeCandidates) {
      console.log(
        `- ${candidate.connectionId}: ${candidate.personADisplayName ?? candidate.personAId} <-> ${candidate.personBDisplayName ?? candidate.personBId}`,
      );
    }
  }
}

const apply = process.argv.includes("--apply");
const json = process.argv.includes("--json");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  try {
    const summary = apply
      ? await backfillCrossTreeSchema(db)
      : await previewCrossTreeBackfill(db);

    if (json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      printSummary(summary);
      if (!apply) {
        console.log("");
        console.log("Re-run with --apply to execute the backfill.");
      }
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
