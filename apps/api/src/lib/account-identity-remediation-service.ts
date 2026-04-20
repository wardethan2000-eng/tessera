import { and, inArray, or } from "drizzle-orm";
import type { DbClient } from "@familytree/database";
import * as schema from "@familytree/database";
import { mergePeopleRecords } from "./cross-tree-merge-service.js";
import {
  auditDuplicateClaimedAccounts,
  type AccountIdentityAuditPerson,
  type AccountIdentityAuditSummary,
  type AccountIdentityDuplicateCase,
  type DuplicateMergeCheck,
} from "./account-identity-audit-service.js";

type RemediationDb = DbClient;

export type PlannedRemediationActionStatus =
  | "ready"
  | "blocked_case_status"
  | "blocked_preflight"
  | "blocked_permissions";

export type AppliedRemediationActionStatus =
  | "applied"
  | "failed"
  | "skipped"
  | "skipped_after_failure";

export type PlannedRemediationAction = {
  survivorPersonId: string;
  survivorPersonName: string;
  mergedAwayPersonId: string;
  mergedAwayPersonName: string;
  executionTreeId: string | null;
  executionTreeName: string | null;
  containedTreeIds: string[];
  containedTreeNames: string[];
  missingPermissionTreeIds: string[];
  missingPermissionTreeNames: string[];
  status: PlannedRemediationActionStatus;
  reasons: string[];
};

export type RemediationCasePlan = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  auditStatus: AccountIdentityDuplicateCase["status"];
  survivorPersonId: string;
  survivorPersonName: string;
  autoMergeable: boolean;
  actions: PlannedRemediationAction[];
};

export type DuplicateClaimRemediationPlan = {
  generatedAt: string;
  performedByUserId: string;
  duplicateAccountCount: number;
  autoMergeableCaseCount: number;
  readyMergeCount: number;
  blockedMergeCount: number;
  audit: AccountIdentityAuditSummary;
  casePlans: RemediationCasePlan[];
};

export type AppliedRemediationAction = PlannedRemediationAction & {
  appliedStatus: AppliedRemediationActionStatus;
  message: string;
};

export type AppliedRemediationCase = Omit<RemediationCasePlan, "actions"> & {
  actions: AppliedRemediationAction[];
};

export type DuplicateClaimRemediationResult = {
  generatedAt: string;
  performedByUserId: string;
  applied: boolean;
  plannedReadyMergeCount: number;
  appliedMergeCount: number;
  failedMergeCount: number;
  skippedMergeCount: number;
  caseResults: AppliedRemediationCase[];
  plan: DuplicateClaimRemediationPlan;
};

function uniq(values: string[]) {
  return [...new Set(values)];
}

function personContainedTreeIds(person: AccountIdentityAuditPerson) {
  return uniq([person.treeId, ...person.scopeTreeIds]);
}

export function chooseExecutionTreeId(params: {
  survivor: Pick<AccountIdentityAuditPerson, "treeId" | "scopeTreeIds">;
  mergedAway: Pick<AccountIdentityAuditPerson, "treeId" | "scopeTreeIds">;
  mergeCheck: Pick<DuplicateMergeCheck, "affectedTreeIds">;
  allowedTreeIds: Set<string>;
}) {
  const { survivor, mergedAway, mergeCheck, allowedTreeIds } = params;

  const preferredTreeIds = uniq([
    ...mergeCheck.affectedTreeIds,
    survivor.treeId,
    ...survivor.scopeTreeIds,
    mergedAway.treeId,
    ...mergedAway.scopeTreeIds,
  ]);

  return preferredTreeIds.find((treeId) => allowedTreeIds.has(treeId)) ?? null;
}

function buildPlannedAction(params: {
  caseSummary: AccountIdentityDuplicateCase;
  survivor: AccountIdentityAuditPerson;
  mergedAway: AccountIdentityAuditPerson;
  mergeCheck: DuplicateMergeCheck;
  allowedTreeIds: Set<string>;
}) {
  const { caseSummary, survivor, mergedAway, mergeCheck, allowedTreeIds } = params;
  const containedTreeIds = uniq([
    ...personContainedTreeIds(survivor),
    ...personContainedTreeIds(mergedAway),
  ]);
  const missingPermissionTreeIds = containedTreeIds.filter(
    (treeId) => !allowedTreeIds.has(treeId),
  );
  const executionTreeId = chooseExecutionTreeId({
    survivor,
    mergedAway,
    mergeCheck,
    allowedTreeIds,
  });
  const toTreeName = (treeId: string) =>
    survivor.treeId === treeId
      ? survivor.treeName
      : mergedAway.treeId === treeId
        ? mergedAway.treeName
        : survivor.scopeTreeIds.includes(treeId)
          ? survivor.scopeTreeNames[survivor.scopeTreeIds.indexOf(treeId)] ?? treeId
          : mergedAway.scopeTreeIds.includes(treeId)
            ? mergedAway.scopeTreeNames[mergedAway.scopeTreeIds.indexOf(treeId)] ?? treeId
            : mergeCheck.affectedTreeIds.includes(treeId)
              ? mergeCheck.affectedTreeNames[mergeCheck.affectedTreeIds.indexOf(treeId)] ?? treeId
              : treeId;

  const reasons: string[] = [];
  let status: PlannedRemediationActionStatus = "ready";

  if (caseSummary.status !== "ready_for_merge") {
    status = "blocked_case_status";
    reasons.push(`Case audit status is ${caseSummary.status}.`);
  }

  if (!mergeCheck.canMerge) {
    status = "blocked_preflight";
    reasons.push(mergeCheck.blocker ?? "Merge preflight rejected this pair.");
  }

  if (missingPermissionTreeIds.length > 0 || !executionTreeId) {
    status = "blocked_permissions";
    if (missingPermissionTreeIds.length > 0) {
      reasons.push(
        `Operator is not a founder/steward in every tree containing these people: ${missingPermissionTreeIds.join(", ")}.`,
      );
    } else {
      reasons.push("Could not find a steward/founder execution tree for this merge.");
    }
  }

  return {
    survivorPersonId: survivor.id,
    survivorPersonName: survivor.displayName,
    mergedAwayPersonId: mergedAway.id,
    mergedAwayPersonName: mergedAway.displayName,
    executionTreeId,
    executionTreeName: executionTreeId ? toTreeName(executionTreeId) : null,
    containedTreeIds,
    containedTreeNames: containedTreeIds.map(toTreeName),
    missingPermissionTreeIds,
    missingPermissionTreeNames: missingPermissionTreeIds.map(toTreeName),
    status,
    reasons,
  } satisfies PlannedRemediationAction;
}

export async function planDuplicateClaimRemediation(
  db: RemediationDb,
  input: {
    performedByUserId: string;
    userId?: string;
  },
): Promise<DuplicateClaimRemediationPlan> {
  const audit = await auditDuplicateClaimedAccounts(db, { userId: input.userId });

  const relevantTreeIds = uniq(
    audit.cases.flatMap((caseSummary) =>
      caseSummary.people.flatMap((person) => personContainedTreeIds(person)),
    ),
  );

  const memberships =
    relevantTreeIds.length > 0
      ? await db.query.treeMemberships.findMany({
          where: (membership, { eq, inArray, or }) =>
            and(
              eq(membership.userId, input.performedByUserId),
              inArray(membership.treeId, relevantTreeIds),
              or(eq(membership.role, "founder"), eq(membership.role, "steward")),
            ),
          columns: {
            treeId: true,
          },
        })
      : [];

  const allowedTreeIds = new Set(memberships.map((membership) => membership.treeId));

  const casePlans = audit.cases.map((caseSummary) => {
    const survivor =
      caseSummary.people.find(
        (person) => person.id === caseSummary.recommendedSurvivor.survivorPersonId,
      ) ?? caseSummary.people[0]!;

    const actions = caseSummary.recommendedMergeChecks.map((mergeCheck) => {
      const mergedAway =
        caseSummary.people.find((person) => person.id === mergeCheck.mergedAwayPersonId) ??
        caseSummary.people.find((person) => person.id !== survivor.id);

      if (!mergedAway) {
        return {
          survivorPersonId: survivor.id,
          survivorPersonName: survivor.displayName,
          mergedAwayPersonId: mergeCheck.mergedAwayPersonId,
          mergedAwayPersonName: mergeCheck.mergedAwayPersonId,
          executionTreeId: null,
          executionTreeName: null,
          containedTreeIds: personContainedTreeIds(survivor),
          containedTreeNames: [survivor.treeName, ...survivor.scopeTreeNames],
          missingPermissionTreeIds: [],
          missingPermissionTreeNames: [],
          status: "blocked_case_status",
          reasons: ["Merged-away person could not be resolved from the audit case."],
        } satisfies PlannedRemediationAction;
      }

      return buildPlannedAction({
        caseSummary,
        survivor,
        mergedAway,
        mergeCheck,
        allowedTreeIds,
      });
    });

    return {
      user: caseSummary.user,
      auditStatus: caseSummary.status,
      survivorPersonId: survivor.id,
      survivorPersonName: survivor.displayName,
      autoMergeable: actions.length > 0 && actions.every((action) => action.status === "ready"),
      actions,
    } satisfies RemediationCasePlan;
  });

  const readyMergeCount = casePlans.reduce(
    (total, casePlan) =>
      total + casePlan.actions.filter((action) => action.status === "ready").length,
    0,
  );
  const blockedMergeCount = casePlans.reduce(
    (total, casePlan) =>
      total + casePlan.actions.filter((action) => action.status !== "ready").length,
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    performedByUserId: input.performedByUserId,
    duplicateAccountCount: audit.duplicateAccountCount,
    autoMergeableCaseCount: casePlans.filter((casePlan) => casePlan.autoMergeable).length,
    readyMergeCount,
    blockedMergeCount,
    audit,
    casePlans,
  };
}

export async function remediateDuplicateClaimedAccounts(
  db: RemediationDb,
  input: {
    performedByUserId: string;
    userId?: string;
    apply?: boolean;
  },
): Promise<DuplicateClaimRemediationResult> {
  const plan = await planDuplicateClaimRemediation(db, {
    performedByUserId: input.performedByUserId,
    userId: input.userId,
  });

  const caseResults: AppliedRemediationCase[] = [];
  let appliedMergeCount = 0;
  let failedMergeCount = 0;
  let skippedMergeCount = 0;

  for (const casePlan of plan.casePlans) {
    let caseFailed = false;
    const actions: AppliedRemediationAction[] = [];

    for (const action of casePlan.actions) {
      if (!input.apply) {
        actions.push({
          ...action,
          appliedStatus: "skipped",
          message:
            action.status === "ready"
              ? "Dry run only. Re-run with --apply to execute this merge."
              : action.reasons.join(" "),
        });
        continue;
      }

      if (caseFailed) {
        skippedMergeCount += 1;
        actions.push({
          ...action,
          appliedStatus: "skipped_after_failure",
          message:
            "Skipped because an earlier merge in this duplicate-account case failed.",
        });
        continue;
      }

      if (action.status !== "ready" || !action.executionTreeId) {
        skippedMergeCount += 1;
        actions.push({
          ...action,
          appliedStatus: "skipped",
          message: action.reasons.join(" "),
        });
        continue;
      }

      try {
        await mergePeopleRecords({
          treeId: action.executionTreeId,
          survivorPersonId: action.survivorPersonId,
          mergedAwayPersonId: action.mergedAwayPersonId,
          performedByUserId: input.performedByUserId,
        });

        appliedMergeCount += 1;
        actions.push({
          ...action,
          appliedStatus: "applied",
          message: "Merge applied successfully.",
        });
      } catch (error) {
        caseFailed = true;
        failedMergeCount += 1;
        actions.push({
          ...action,
          appliedStatus: "failed",
          message: error instanceof Error ? error.message : "Merge failed.",
        });
      }
    }

    caseResults.push({
      ...casePlan,
      actions,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    performedByUserId: input.performedByUserId,
    applied: Boolean(input.apply),
    plannedReadyMergeCount: plan.readyMergeCount,
    appliedMergeCount,
    failedMergeCount,
    skippedMergeCount,
    caseResults,
    plan,
  };
}
