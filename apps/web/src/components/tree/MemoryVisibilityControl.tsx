"use client";

export type TreeVisibilityLevel =
  | "all_members"
  | "family_circle"
  | "named_circle"
  | "hidden";

type VisibilityMemory = {
  treeVisibilityLevel?: TreeVisibilityLevel;
  treeVisibilityIsOverride?: boolean;
};

interface MemoryVisibilityControlProps {
  memory: VisibilityMemory;
  disabled?: boolean;
  onChange: (value: TreeVisibilityLevel | null) => void;
}

export function describeTreeVisibility(memory: VisibilityMemory): string {
  const level = memory.treeVisibilityLevel ?? "all_members";
  const isOverride = memory.treeVisibilityIsOverride ?? false;

  if (isOverride) {
    switch (level) {
      case "hidden":
        return "Hidden in this tree";
      case "family_circle":
        return "Restricted to family circle";
      case "named_circle":
        return "Restricted to named circle";
      case "all_members":
      default:
        return "Visible to all members";
    }
  }

  switch (level) {
    case "family_circle":
      return "Default: family circle";
    case "named_circle":
      return "Default: named circle";
    case "hidden":
      return "Hidden in this tree";
    case "all_members":
    default:
      return "Visible to all members";
  }
}

export function MemoryVisibilityControl({
  memory,
  disabled,
  onChange,
}: MemoryVisibilityControlProps) {
  const level = memory.treeVisibilityLevel ?? "all_members";
  const isOverride = memory.treeVisibilityIsOverride ?? false;
  const selectValue = isOverride ? level : "__default";

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 11,
          color: "var(--ink-faded)",
        }}
      >
        {describeTreeVisibility(memory)}
      </div>
      <select
        value={selectValue}
        disabled={disabled}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue === "__default" ? null : (nextValue as TreeVisibilityLevel));
        }}
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          color: "var(--ink-soft)",
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          borderRadius: 6,
          padding: "6px 8px",
        }}
      >
        <option value="__default">Use default tree setting</option>
        <option value="all_members">Visible to all members</option>
        <option value="hidden">Hide in this tree</option>
        <option value="family_circle">Restrict to family circle</option>
        <option value="named_circle">Restrict to named circle</option>
      </select>
    </div>
  );
}
