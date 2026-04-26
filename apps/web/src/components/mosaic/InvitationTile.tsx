"use client";

import { EASE } from "@/components/home/homeUtils";

interface InvitationTileProps {
  treeName: string;
  invitedByName: string;
  proposedRole: string;
  linkedPersonName: string | null;
  treeId: string;
  inviteId: string;
}

export function InvitationTile({
  treeName,
  invitedByName,
  proposedRole,
  linkedPersonName,
  treeId,
}: InvitationTileProps) {
  return (
    <a
      href={`/trees/${treeId}/home`}
      aria-label={`Invitation to ${treeName} from ${invitedByName} as ${proposedRole}`}
      className="mosaic-tile-link"
      style={{
        gridColumn: "span 5",
        gridRow: "span 3",
        position: "relative",
        overflow: "hidden",
        borderRadius: 14,
        border: "1px solid rgba(176,139,62,0.24)",
        background: "linear-gradient(160deg, rgba(252,248,240,0.96) 0%, rgba(249,245,238,0.92) 40%, rgba(244,237,222,0.96) 100%)",
        boxShadow: "0 4px 12px rgba(40,30,18,0.04)",
        padding: "clamp(18px, 2.5vw, 26px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 200,
        animation: `bloom 600ms ${EASE} 120ms both`,
        textDecoration: "none",
        transition: `transform 360ms ${EASE}, box-shadow 360ms ${EASE}, border-color 360ms ${EASE}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 18px 42px rgba(40,30,18,0.12)";
        e.currentTarget.style.borderColor = "rgba(176,139,62,0.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(40,30,18,0.04)";
        e.currentTarget.style.borderColor = "rgba(176,139,62,0.24)";
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: "var(--gilt)",
          borderRadius: "14px 14px 0 0",
        }}
      />

      <div>
        <span
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--gilt)",
            display: "block",
            marginBottom: 8,
          }}
        >
          Invitation
        </span>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(20px, 2.2vw, 26px)",
            lineHeight: 1.12,
            color: "var(--ink)",
            marginBottom: 8,
          }}
        >
          {treeName}
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--ink-soft)",
          }}
        >
          <strong style={{ color: "var(--ink)" }}>{invitedByName}</strong> invited you as {proposedRole}
          {linkedPersonName ? <> for <em>{linkedPersonName}</em></> : ""}.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--gilt)",
          }}
        >
          Open to accept
        </span>
        <span aria-hidden="true" style={{ fontSize: 14, color: "var(--gilt)" }}>→</span>
      </div>
    </a>
  );
}