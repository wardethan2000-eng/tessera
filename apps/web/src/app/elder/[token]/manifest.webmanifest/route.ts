import { fetchInbox } from "@/lib/elder-api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  let familyLabel = "Family Memories";
  try {
    const inbox = await fetchInbox(token);
    familyLabel = inbox.familyLabel;
  } catch {
    // fall back to generic
  }
  const scope = `/elder/${encodeURIComponent(token)}`;
  const manifest = {
    name: `${familyLabel} memory button`,
    short_name: familyLabel.slice(0, 24),
    description: "A simple private button for sending photos, voice notes, and stories.",
    start_url: scope,
    scope,
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F1E7",
    theme_color: "#4E5D42",
    icons: [
      {
        src: "/elder-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/elder-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/elder-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Send a memory",
        short_name: "Send",
        url: `${scope}/compose`,
        icons: [{ src: "/elder-icon-192.png", sizes: "192x192" }],
      },
    ],
    share_target: {
      action: `${scope}/compose`,
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "media",
            accept: ["image/*", "audio/*", "video/*"],
          },
        ],
      },
    },
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-store",
    },
  });
}
