"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";

const API = getApiBase();

interface PersonOption {
  id: string;
  displayName: string;
}

interface ImportBatch {
  id: string;
  label: string;
  status: string;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  defaultPerson: { id: string; name: string } | null;
  createdAt: string;
}

interface PresignedImportItem {
  itemId: string;
  mediaId: string;
  uploadUrl: string;
  objectKey: string;
  filename: string;
}

export default function ImportCollectionPage() {
  const { treeId } = useParams<{ treeId: string }>();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [people, setPeople] = useState<PersonOption[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [personId, setPersonId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
  }, [isPending, router, session]);

  const refresh = useCallback(async () => {
    if (!treeId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [peopleRes, batchesRes] = await Promise.all([
        fetch(`${API}/api/trees/${treeId}/people`, { credentials: "include" }),
        fetch(`${API}/api/trees/${treeId}/import-batches`, {
          credentials: "include",
        }),
      ]);
      if (!peopleRes.ok) throw new Error("Could not load people.");
      if (!batchesRes.ok) throw new Error("Could not load imports.");
      const peopleData = (await peopleRes.json()) as Array<{
        id: string;
        displayName?: string;
        name?: string;
      }>;
      const normalizedPeople = peopleData.map((person) => ({
        id: person.id,
        displayName: person.displayName ?? person.name ?? "Unnamed",
      }));
      setPeople(normalizedPeople);
      setPersonId((current) => current || normalizedPeople[0]?.id || "");
      const batchData = (await batchesRes.json()) as { batches?: ImportBatch[] };
      setBatches(batchData.batches ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load import tools.");
    } finally {
      setLoading(false);
    }
  }, [treeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const suggestedLabel = useMemo(() => {
    const today = new Date();
    return `Imported ${today.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }, []);

  const totalSize = useMemo(
    () => files.reduce((total, file) => total + file.size, 0),
    [files],
  );

  function onFileChange(nextFiles: FileList | null) {
    setError(null);
    setLastBatchId(null);
    setFiles(nextFiles ? Array.from(nextFiles) : []);
    setLabel((current) => current || suggestedLabel);
  }

  async function uploadImport() {
    if (!personId) {
      setError("Choose who these memories are mostly about.");
      return;
    }
    if (files.length === 0) {
      setError("Choose at least one file.");
      return;
    }
    setUploading(true);
    setError(null);
    setProgress("Creating import...");
    setLastBatchId(null);

    try {
      const batchRes = await fetch(`${API}/api/trees/${treeId}/import-batches`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || suggestedLabel,
          defaultPersonId: personId,
        }),
      });
      if (!batchRes.ok) {
        const body = (await batchRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not create import.");
      }
      const batch = (await batchRes.json()) as { id: string };

      setProgress("Preparing uploads...");
      const presignRes = await fetch(
        `${API}/api/trees/${treeId}/import-batches/${batch.id}/items/presign`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: files.map((file) => ({
              filename: file.name,
              contentType: file.type || "application/octet-stream",
              sizeBytes: file.size,
              lastModified: file.lastModified,
            })),
          }),
        },
      );
      if (!presignRes.ok) {
        const body = (await presignRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not prepare uploads.");
      }
      const presigned = (await presignRes.json()) as {
        items: PresignedImportItem[];
      };

      for (let index = 0; index < presigned.items.length; index += 1) {
        const item = presigned.items[index]!;
        const file = files[index];
        if (!file) continue;
        setProgress(`Uploading ${index + 1} of ${presigned.items.length}: ${file.name}`);
        const uploadRes = await fetch(item.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!uploadRes.ok) {
          throw new Error(`Upload failed for ${file.name}.`);
        }
      }

      setProgress("Creating memories...");
      const completeRes = await fetch(
        `${API}/api/trees/${treeId}/import-batches/${batch.id}/complete`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ createMemories: true }),
        },
      );
      if (!completeRes.ok) {
        const body = (await completeRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not finish import.");
      }

      setProgress("Import complete.");
      setLastBatchId(batch.id);
      setFiles([]);
      setLabel("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setUploading(false);
    }
  }

  if (isPending || loading) {
    return (
      <main style={pageStyle}>
        <p style={hintStyle}>Loading...</p>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <Link href={`/trees/${treeId}/settings`} style={backLinkStyle}>
          Back to archive settings
        </Link>

        <header>
          <h1 style={titleStyle}>Import a collection</h1>
          <p style={leadStyle}>
            Bring in many files at once. Tessera will create draft memories for
            one person, then send you to the review queue to add dates and
            places.
          </p>
        </header>

        {loadError && <p style={errorStyle}>{loadError}</p>}

        <section style={cardStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Import name</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={suggestedLabel}
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Who are these mostly about?</span>
            <select
              value={personId}
              onChange={(event) => setPersonId(event.target.value)}
              style={inputStyle}
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </select>
          </label>

          <label style={dropStyle}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,application/pdf,application/msword"
              onChange={(event) => onFileChange(event.target.files)}
              style={{ display: "none" }}
            />
            <span style={dropTitleStyle}>
              {files.length > 0
                ? `${files.length} file${files.length === 1 ? "" : "s"} selected`
                : "Choose photos, videos, audio, or documents"}
            </span>
            <span style={dropHintStyle}>
              {files.length > 0
                ? `${formatBytes(totalSize)} ready to import`
                : "You can select many files at once."}
            </span>
          </label>

          <button
            type="button"
            onClick={() => void uploadImport()}
            disabled={uploading || files.length === 0 || !personId}
            style={{
              ...primaryButtonStyle,
              opacity: uploading || files.length === 0 || !personId ? 0.55 : 1,
              cursor: uploading ? "wait" : "pointer",
            }}
          >
            {uploading ? "Importing..." : "Import files"}
          </button>

          {progress && <p style={hintStyle}>{progress}</p>}
          {error && <p style={errorStyle}>{error}</p>}
          {lastBatchId && (
            <Link
              href={`/trees/${treeId}/curation?batchId=${encodeURIComponent(lastBatchId)}`}
              style={reviewLinkStyle}
            >
              Review this import
            </Link>
          )}
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Recent imports</h2>
          {batches.length === 0 ? (
            <p style={hintStyle}>No collections have been imported yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {batches.map((batch) => (
                <Link
                  key={batch.id}
                  href={`/trees/${treeId}/curation?batchId=${encodeURIComponent(batch.id)}`}
                  style={batchRowStyle}
                >
                  <span>
                    <strong>{batch.label}</strong>
                    <small>
                      {batch.defaultPerson?.name ?? "No person"} - {batch.processedItems} of{" "}
                      {batch.totalItems} imported
                    </small>
                  </span>
                  <span style={statusPillStyle}>{batch.status}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "var(--paper)",
  color: "var(--ink)",
  padding: "48px 24px",
};
const containerStyle: CSSProperties = {
  width: "min(760px, 100%)",
  margin: "0 auto",
  display: "grid",
  gap: 24,
};
const backLinkStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-faded)",
  textDecoration: "none",
};
const titleStyle: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 34,
  fontWeight: 400,
  margin: "0 0 8px",
};
const leadStyle: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 16,
  lineHeight: 1.7,
  color: "var(--ink-soft)",
  margin: 0,
};
const cardStyle: CSSProperties = {
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 12,
  padding: 24,
  display: "grid",
  gap: 16,
};
const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 7,
};
const labelStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-soft)",
  fontWeight: 600,
};
const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: "var(--font-ui)",
  fontSize: 15,
  padding: "11px 12px",
};
const dropStyle: CSSProperties = {
  border: "2px dashed var(--rule)",
  borderRadius: 12,
  background: "var(--paper)",
  padding: "34px 18px",
  textAlign: "center",
  display: "grid",
  gap: 8,
  cursor: "pointer",
};
const dropTitleStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 18,
  fontWeight: 700,
  color: "var(--ink)",
};
const dropHintStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-faded)",
};
const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 8,
  background: "var(--moss)",
  color: "var(--paper)",
  fontFamily: "var(--font-ui)",
  fontSize: 15,
  fontWeight: 700,
  padding: "13px 18px",
};
const hintStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-faded)",
};
const errorStyle: CSSProperties = {
  ...hintStyle,
  color: "var(--rose)",
};
const reviewLinkStyle: CSSProperties = {
  ...primaryButtonStyle,
  display: "inline-flex",
  justifyContent: "center",
  textDecoration: "none",
};
const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: 22,
  fontWeight: 400,
};
const batchRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  border: "1px solid var(--rule)",
  borderRadius: 10,
  background: "var(--paper)",
  padding: "13px 14px",
  textDecoration: "none",
  color: "var(--ink)",
  fontFamily: "var(--font-ui)",
};
const statusPillStyle: CSSProperties = {
  border: "1px solid var(--rule)",
  borderRadius: 999,
  padding: "4px 9px",
  color: "var(--ink-faded)",
  fontSize: 11,
};
