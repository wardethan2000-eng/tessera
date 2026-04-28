"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiBase } from "@/lib/api-base";
import { readLastOpenedTreeId } from "@/lib/last-opened-tree";
import {
  collectTodayHighlights,
  isSparseArchive,
  selectMosaicMemories,
  type DashboardTreeSummary,
  type PendingInvite,
  type TodayHighlight,
} from "@/components/mosaic/mosaicUtils";

const API = getApiBase();

type SummariesResponse = {
  trees: DashboardTreeSummary[];
  pendingInvites: PendingInvite[];
};

export function useMosaicData(currentTreeId: string | null) {
  const router = useRouter();

  const [summaries, setSummaries] = useState<DashboardTreeSummary[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creatingLineage, setCreatingLineage] = useState(false);
  const [newLineageName, setNewLineageName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [submittingLineage, setSubmittingLineage] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      const fetchSummaries = async () => {
        setLoading(true);
        setLoadError(null);
        try {
          const res = await fetch(`${API}/api/trees/summaries`, {
            credentials: "include",
          });
          if (!res.ok) throw new Error("Your archives could not be loaded.");
          const data = (await res.json()) as SummariesResponse;

          const lastOpenedTreeId = readLastOpenedTreeId();

          const sorted = [...data.trees].sort((left, right) => {
            const leftCurrent = currentTreeId === left.tree.id ? 1 : 0;
            const rightCurrent = currentTreeId === right.tree.id ? 1 : 0;
            if (leftCurrent !== rightCurrent) return rightCurrent - leftCurrent;

            const leftLast = !currentTreeId && lastOpenedTreeId === left.tree.id ? 1 : 0;
            const rightLast = !currentTreeId && lastOpenedTreeId === right.tree.id ? 1 : 0;
            if (leftLast !== rightLast) return rightLast - leftLast;

            const memoryDiff = right.stats.memoryCount - left.stats.memoryCount;
            if (memoryDiff !== 0) return memoryDiff;

            return left.tree.name.localeCompare(right.tree.name);
          });

          setSummaries(sorted);
          setPendingInvites(data.pendingInvites);
        } catch (error) {
          setLoadError(
            error instanceof Error ? error.message : "Your archives could not be loaded.",
          );
        } finally {
          setLoading(false);
        }
      };
      void fetchSummaries();
    }, 300);

    return () => clearTimeout(timer);
  }, [currentTreeId]);

  const handleCreateLineage = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = newLineageName.trim();
      if (!trimmed) {
        setCreateError("Give this archive a name before creating it.");
        return;
      }
      setSubmittingLineage(true);
      setCreateError(null);
      try {
        const res = await fetch(`${API}/api/trees`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!res.ok) throw new Error("Could not create archive.");
        const created = (await res.json()) as { id: string };
        router.push(`/trees/${created.id}/home`);
      } catch (error) {
        setCreateError(
          error instanceof Error ? error.message : "Could not create archive.",
        );
      } finally {
        setSubmittingLineage(false);
      }
    },
    [newLineageName, router],
  );

  const primary = summaries[0] ?? null;
  const secondary = summaries.slice(1);

  const mosaicMemories = useMemo(() => selectMosaicMemories(summaries, 6, 2), [summaries]);
  const todayHighlights = useMemo(() => collectTodayHighlights(summaries), [summaries]);

  return {
    summaries,
    pendingInvites,
    loading,
    loadError,
    primary,
    secondary,
    mosaicMemories,
    todayHighlights,
    creatingLineage,
    setCreatingLineage,
    newLineageName,
    setNewLineageName,
    createError,
    setCreateError,
    submittingLineage,
    handleCreateLineage,
  };
}