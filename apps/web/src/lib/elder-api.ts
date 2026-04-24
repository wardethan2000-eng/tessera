const API = "";

export const ELDER_API = API;

export type ElderInbox = {
  familyLabel: string;
  treeName: string;
  displayName: string;
  email: string;
  associatedPerson: { id: string; name: string } | null;
  pendingPrompts: Array<{
    id: string;
    questionText: string;
    fromName: string;
    createdAt: string;
  }>;
  recent: Array<{
    id: string;
    title: string;
    kind: "story" | "photo" | "voice" | "document" | "other";
    createdAt: string;
    mediaUrl: string | null;
    mimeType: string | null;
  }>;
};

export async function fetchInbox(token: string): Promise<ElderInbox> {
  const res = await fetch(`${API}/api/elder/${encodeURIComponent(token)}/inbox`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Could not load inbox");
  }
  return (await res.json()) as ElderInbox;
}

export async function presignElderUpload(
  token: string,
  file: File,
): Promise<{ mediaId: string; uploadUrl: string }> {
  const res = await fetch(
    `${API}/api/elder/${encodeURIComponent(token)}/media/presign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      }),
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Could not prepare upload");
  }
  return (await res.json()) as { mediaId: string; uploadUrl: string };
}

export async function uploadFileToPresigned(file: File, uploadUrl: string) {
  const r = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!r.ok) throw new Error("Upload failed");
}

export type ElderSubmitInput = {
  kind: "story" | "photo" | "voice" | "document";
  body?: string;
  title?: string;
  mediaIds?: string[];
  dateOfEventText?: string;
  promptId?: string;
};

export async function submitElderMemory(
  token: string,
  input: ElderSubmitInput,
  promptId?: string,
) {
  const path = promptId
    ? `/api/elder/${encodeURIComponent(token)}/reply/${encodeURIComponent(promptId)}`
    : `/api/elder/${encodeURIComponent(token)}/submit`;
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Could not submit");
  }
  return res.json();
}
