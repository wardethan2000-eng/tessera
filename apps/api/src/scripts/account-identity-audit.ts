import { pathToFileURL } from "node:url";
import { createDb } from "@familytree/database";
import {
  auditDuplicateClaimedAccounts,
  type AccountIdentityAuditSummary,
} from "../lib/account-identity-audit-service.js";

function parseUserIdArg() {
  const userFlagIndex = process.argv.indexOf("--user");
  if (userFlagIndex === -1) {
    return undefined;
  }

  return process.argv[userFlagIndex + 1];
}

function printSummary(summary: AccountIdentityAuditSummary) {
  console.log("Account identity duplicate audit");
  console.log(`Generated at: ${summary.generatedAt}`);
  console.log(`Duplicate accounts: ${summary.duplicateAccountCount}`);
  console.log(`Duplicate claimed people: ${summary.duplicateClaimedPeopleCount}`);
  console.log(`Readiness: ${summary.readiness}`);

  if (summary.cases.length === 0) {
    console.log("");
    console.log("No duplicate claimed accounts were found.");
    return;
  }

  for (const caseSummary of summary.cases) {
    const recommendedPerson = caseSummary.people.find(
      (person) => person.id === caseSummary.recommendedSurvivor.survivorPersonId,
    );

    console.log("");
    console.log(
      `${caseSummary.user.email} (${caseSummary.user.name}) [${caseSummary.user.id}]`,
    );
    console.log(`Status: ${caseSummary.status}`);
    console.log(
      `Recommended survivor: ${
        recommendedPerson?.displayName ??
        caseSummary.recommendedSurvivor.survivorPersonId
      } [${caseSummary.recommendedSurvivor.survivorPersonId}]`,
    );
    console.log(`Recommendation reason: ${caseSummary.recommendedSurvivor.reason}`);
    console.log("Claimed people:");

    for (const person of caseSummary.people) {
      console.log(
        `- ${person.displayName} [${person.id}] home=${person.treeName} scope=${person.scopeTreeNames.join(", ")}`,
      );
      console.log(
        `  relationships=${person.relationshipCount} memories=${person.primaryMemoryCount} primary/${person.taggedMemoryCount} tagged prompts=${person.promptCount} linkedInvites=${person.linkedInvitationCount} pendingInvites=${person.pendingLinkedInvitationCount}`,
      );
      if (person.birthDateText || person.deathDateText) {
        console.log(
          `  dates=${person.birthDateText ?? "?"} -> ${person.deathDateText ?? "living"}`,
        );
      }
    }

    console.log("Recommended merge checks:");
    for (const check of caseSummary.recommendedMergeChecks) {
      const mergedAwayPerson = caseSummary.people.find(
        (person) => person.id === check.mergedAwayPersonId,
      );
      console.log(
        `- ${mergedAwayPerson?.displayName ?? check.mergedAwayPersonId} -> ${
          recommendedPerson?.displayName ??
          caseSummary.recommendedSurvivor.survivorPersonId
        }: ${check.canMerge ? "OK" : `BLOCKED: ${check.blocker}`}`,
      );
    }
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const json = process.argv.includes("--json");
  const userId = parseUserIdArg();
  const db = createDb(databaseUrl);

  try {
    const summary = await auditDuplicateClaimedAccounts(db, { userId });

    if (json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    printSummary(summary);
  } finally {
    await (db.$client as { end: () => Promise<void> }).end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
