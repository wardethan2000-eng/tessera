import { pathToFileURL } from "node:url";
import { createDb } from "@familytree/database";
import {
  remediateDuplicateClaimedAccounts,
  type DuplicateClaimRemediationResult,
} from "../lib/account-identity-remediation-service.js";

function parseArgValue(flag: string) {
  const flagIndex = process.argv.indexOf(flag);
  if (flagIndex === -1) {
    return undefined;
  }

  return process.argv[flagIndex + 1];
}

function printSummary(result: DuplicateClaimRemediationResult) {
  console.log("Account identity remediation");
  console.log(`Generated at: ${result.generatedAt}`);
  console.log(`Performed by: ${result.performedByUserId}`);
  console.log(`Mode: ${result.applied ? "apply" : "dry-run"}`);
  console.log(`Ready merges: ${result.plan.readyMergeCount}`);
  console.log(`Blocked merges: ${result.plan.blockedMergeCount}`);
  if (result.applied) {
    console.log(`Applied merges: ${result.appliedMergeCount}`);
    console.log(`Failed merges: ${result.failedMergeCount}`);
    console.log(`Skipped merges: ${result.skippedMergeCount}`);
  }

  if (result.caseResults.length === 0) {
    console.log("");
    console.log("No duplicate claimed accounts matched this remediation run.");
    return;
  }

  for (const caseResult of result.caseResults) {
    console.log("");
    console.log(
      `${caseResult.user.email} (${caseResult.user.name}) [${caseResult.user.id}]`,
    );
    console.log(
      `Audit status: ${caseResult.auditStatus} | auto-mergeable: ${caseResult.autoMergeable ? "yes" : "no"}`,
    );
    console.log(
      `Recommended survivor: ${caseResult.survivorPersonName} [${caseResult.survivorPersonId}]`,
    );

    for (const action of caseResult.actions) {
      const state = result.applied ? action.appliedStatus : action.status;
      console.log(
        `- ${action.mergedAwayPersonName} [${action.mergedAwayPersonId}] -> ${action.survivorPersonName}: ${state}`,
      );
      console.log(`  ${action.message}`);
      if (action.executionTreeId) {
        console.log(
          `  execution tree: ${action.executionTreeName ?? action.executionTreeId} [${action.executionTreeId}]`,
        );
      }
      if (action.missingPermissionTreeIds.length > 0) {
        console.log(
          `  missing permissions: ${action.missingPermissionTreeNames.join(", ")}`,
        );
      }
    }
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const performedByUserId = parseArgValue("--performed-by-user");
  if (!performedByUserId) {
    throw new Error("--performed-by-user <userId> is required");
  }

  const userId = parseArgValue("--user");
  const json = process.argv.includes("--json");
  const apply = process.argv.includes("--apply");
  const db = createDb(databaseUrl);

  try {
    const result = await remediateDuplicateClaimedAccounts(db, {
      performedByUserId,
      userId,
      apply,
    });

    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    printSummary(result);
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
