"use client";

import { use } from "react";
import { LifelinePageContent } from "@/components/lifeline/LifelinePage";

export default function LifelinePageRoute({
  params,
}: {
  params: Promise<{ treeId: string; personId: string }>;
}) {
  const { treeId, personId } = use(params);
  return <LifelinePageContent treeId={treeId} personId={personId} />;
}