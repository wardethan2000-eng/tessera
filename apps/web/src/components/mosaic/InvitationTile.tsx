"use client";

interface InvitationTileProps {
  treeName: string;
  invitedByName: string;
  proposedRole: string;
  linkedPersonName: string | null;
  treeId: string;
  inviteId: string;
  stagger?: number;
}

export function InvitationTile({
  treeName,
  invitedByName,
  proposedRole,
  linkedPersonName,
  treeId,
  stagger = 0,
}: InvitationTileProps) {
  return (
    <a
      href={`/trees/${treeId}/home`}
      aria-label={`Invitation to ${treeName} from ${invitedByName}`}
      className="mosaic-piece mosaic-piece--invite"
      style={{ "--mosaic-i": stagger } as React.CSSProperties}
    >
      <span className="mosaic-piece__invite-badge">Invitation</span>
      <h2 className="mosaic-piece__name">{treeName}</h2>
      <p className="mosaic-piece__meta">
        <strong>{invitedByName}</strong> invited you as {proposedRole}
        {linkedPersonName ? <> for <em>{linkedPersonName}</em></> : ""}.
      </p>
      <span className="mosaic-piece__cta mosaic-piece__cta--gilt">Open to accept →</span>
    </a>
  );
}