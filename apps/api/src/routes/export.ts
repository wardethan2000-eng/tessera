import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import archiver from "archiver";
import * as schema from "@familytree/database";
import { db } from "../lib/db.js";
import { s3, MEDIA_BUCKET } from "../lib/storage.js";
import { getSession } from "../lib/session.js";

export async function exportPlugin(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/trees/:treeId/export
   * Streams a ZIP file containing:
   *   - data.json        full tree data (people, memories, relationships)
   *   - media/<key>      all media files (photos)
   *   - index.html       standalone offline viewer
   */
  app.get("/api/trees/:treeId/export", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
    });
    if (!membership) return reply.status(403).send({ error: "Not a member of this tree" });

    // Fetch all tree data in parallel
    const [tree, people, memories, relationships, allMedia] = await Promise.all([
      db.query.trees.findFirst({ where: (t, { eq }) => eq(t.id, treeId) }),
      db.query.people.findMany({
        where: (p, { eq }) => eq(p.treeId, treeId),
        with: { portraitMedia: true },
      }),
      db.query.memories.findMany({
        where: (m, { eq }) => eq(m.treeId, treeId),
        with: { media: true },
      }),
      db.query.relationships.findMany({
        where: (r, { eq }) => eq(r.treeId, treeId),
      }),
      db.query.media.findMany({
        where: (m, { eq }) => eq(m.treeId, treeId),
      }),
    ]);

    if (!tree) return reply.status(404).send({ error: "Tree not found" });

    // Build the export data structure
    const exportData = {
      exportedAt: new Date().toISOString(),
      tree: { id: tree.id, name: tree.name },
      people: people.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        birthDateText: p.birthDateText,
        deathDateText: p.deathDateText,
        essenceLine: p.essenceLine,
        portraitMediaKey: p.portraitMedia?.objectKey ?? null,
      })),
      memories: memories.map((m) => ({
        id: m.id,
        primaryPersonId: m.primaryPersonId,
        title: m.title,
        body: m.body,
        kind: m.kind,
        dateOfEventText: m.dateOfEventText,
        mediaKey: m.media?.objectKey ?? null,
      })),
      relationships: relationships.map((r) => ({
        id: r.id,
        fromPersonId: r.fromPersonId,
        toPersonId: r.toPersonId,
        type: r.type,
      })),
    };

    // Collect unique media keys
    const mediaKeys = new Set<string>();
    for (const m of allMedia) {
      if (m.objectKey) mediaKeys.add(m.objectKey);
    }

    // Stream ZIP
    const safeName = tree.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    reply.raw.setHeader("Content-Type", "application/zip");
    reply.raw.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}_archive.zip"`,
    );

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(reply.raw);

    // Add data.json
    archive.append(JSON.stringify(exportData, null, 2), { name: "data.json" });

    // Add offline HTML viewer
    archive.append(buildOfflineViewer(exportData), { name: "index.html" });

    // Add media files from MinIO
    for (const key of mediaKeys) {
      try {
        const obj = await s3.send(
          new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: key })
        );
        if (obj.Body) {
          // AWS SDK v3 returns a web ReadableStream; convert to Node stream for archiver
          const nodeStream = Readable.fromWeb(obj.Body as ReadableStream<Uint8Array>);
          const filename = key.split("/").pop() ?? key;
          archive.append(nodeStream, { name: `media/${filename}` });
        }
      } catch {
        // Skip missing or inaccessible objects without aborting the whole export
      }
    }

    await archive.finalize();
  });
}

/** Build a self-contained HTML file that renders the archive offline */
function buildOfflineViewer(data: {
  tree: { name: string };
  people: Array<{
    id: string;
    displayName: string;
    birthDateText: string | null;
    deathDateText: string | null;
    essenceLine: string | null;
    portraitMediaKey: string | null;
  }>;
  memories: Array<{
    id: string;
    primaryPersonId: string;
    title: string;
    kind: string;
    dateOfEventText: string | null;
    body: string | null;
    mediaKey: string | null;
  }>;
  relationships: Array<{
    fromPersonId: string;
    toPersonId: string;
    type: string;
  }>;
  exportedAt: string;
}): string {
  const encoded = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(data.tree.name)} — Family Archive</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      font-family: 'Georgia', serif;
      background: #F6F1E7;
      color: #1C1915;
    }
    :root {
      --paper: #F6F1E7;
      --paper-deep: #EDE6D6;
      --ink: #1C1915;
      --ink-soft: #403A2E;
      --ink-faded: #847A66;
      --rule: #D9D0BC;
      --moss: #4E5D42;
    }
    header {
      background: var(--paper-deep);
      border-bottom: 1px solid var(--rule);
      padding: 20px 32px;
      display: flex;
      align-items: baseline;
      gap: 24px;
    }
    header h1 { margin: 0; font-size: 22px; font-weight: 400; }
    header p { margin: 0; font-size: 12px; color: var(--ink-faded); font-family: sans-serif; }
    .layout {
      display: grid;
      grid-template-columns: 260px 1fr;
      min-height: calc(100vh - 65px);
    }
    .sidebar {
      border-right: 1px solid var(--rule);
      overflow-y: auto;
      position: sticky;
      top: 0;
      height: calc(100vh - 65px);
    }
    .sidebar-heading {
      font-family: sans-serif;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-faded);
      padding: 20px 20px 8px;
    }
    .person-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 20px;
      background: none;
      border: none;
      border-bottom: 1px solid var(--rule);
      cursor: pointer;
      text-align: left;
    }
    .person-btn:hover { background: var(--paper-deep); }
    .person-btn.active { background: var(--paper-deep); }
    .person-btn .initial {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: var(--paper-deep);
      border: 1px solid var(--rule);
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; color: var(--ink-faded);
      flex-shrink: 0;
      overflow: hidden;
    }
    .person-btn .initial img { width: 100%; height: 100%; object-fit: cover; }
    .person-btn .info .name { font-size: 13px; color: var(--ink); }
    .person-btn .info .dates { font-size: 11px; color: var(--ink-faded); font-family: sans-serif; margin-top: 2px; }
    .content { padding: 40px 48px; max-width: 800px; }
    .person-header { margin-bottom: 32px; }
    .person-header h2 { font-size: 36px; font-weight: 400; margin: 0 0 4px; }
    .person-header .dates { font-size: 14px; color: var(--ink-faded); font-family: sans-serif; }
    .person-header .essence { font-size: 15px; color: var(--ink-soft); margin-top: 8px; font-style: italic; }
    .person-portrait {
      width: 120px; height: 120px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--rule);
      margin-bottom: 20px;
      display: block;
    }
    .section-heading {
      font-family: sans-serif;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--ink-faded);
      margin: 32px 0 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--rule);
    }
    .memory-card {
      background: var(--paper-deep);
      border: 1px solid var(--rule);
      border-radius: 6px;
      padding: 16px 18px;
      margin-bottom: 12px;
    }
    .memory-card img {
      width: 100%; max-height: 240px;
      object-fit: cover;
      border-radius: 4px;
      margin-bottom: 12px;
    }
    .memory-card .m-title { font-size: 15px; color: var(--ink); margin: 0 0 4px; }
    .memory-card .m-date { font-size: 11px; color: var(--ink-faded); font-family: sans-serif; }
    .memory-card .m-body { font-size: 14px; color: var(--ink-soft); margin-top: 10px; line-height: 1.7; white-space: pre-wrap; }
    .relation-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border: 1px solid var(--rule);
      border-radius: 20px;
      font-family: sans-serif;
      font-size: 12px;
      color: var(--ink-soft);
      margin: 4px 4px 4px 0;
      cursor: pointer;
    }
    .relation-chip:hover { background: var(--paper-deep); }
    .empty { color: var(--ink-faded); font-family: sans-serif; font-size: 13px; font-style: italic; }
    .footer {
      border-top: 1px solid var(--rule);
      padding: 20px 32px;
      font-family: sans-serif;
      font-size: 11px;
      color: var(--ink-faded);
    }
    #welcome {
      padding: 60px 48px;
      max-width: 500px;
    }
    #welcome h2 { font-size: 32px; font-weight: 400; margin: 0 0 12px; }
    #welcome p { font-size: 15px; color: var(--ink-soft); line-height: 1.7; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(data.tree.name)}</h1>
    <p>Offline archive · exported ${new Date(data.exportedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
  </header>
  <div class="layout">
    <nav class="sidebar">
      <div class="sidebar-heading">People</div>
      <div id="person-list"></div>
    </nav>
    <main id="main">
      <div id="welcome">
        <h2>${escapeHtml(data.tree.name)}</h2>
        <p>Select a person from the sidebar to explore their memories and connections.</p>
      </div>
    </main>
  </div>
  <footer class="footer">
    Heirloom · private family archive · ${escapeHtml(data.tree.name)} · exported ${new Date(data.exportedAt).toLocaleDateString()}
  </footer>

  <script>
    const DATA = ${encoded};

    const peopleMap = {};
    DATA.people.forEach(p => { peopleMap[p.id] = p; });

    const memoriesByPerson = {};
    DATA.memories.forEach(m => {
      if (!memoriesByPerson[m.primaryPersonId]) memoriesByPerson[m.primaryPersonId] = [];
      memoriesByPerson[m.primaryPersonId].push(m);
    });

    const relsByPerson = {};
    DATA.relationships.forEach(r => {
      if (!relsByPerson[r.fromPersonId]) relsByPerson[r.fromPersonId] = [];
      if (!relsByPerson[r.toPersonId]) relsByPerson[r.toPersonId] = [];
      relsByPerson[r.fromPersonId].push({ ...r, otherId: r.toPersonId });
      relsByPerson[r.toPersonId].push({ ...r, otherId: r.fromPersonId });
    });

    function mediaFilename(key) {
      if (!key) return null;
      return 'media/' + key.split('/').pop();
    }

    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function relLabel(type, fromId, toId, currentId) {
      if (type === 'parent_child') {
        return currentId === toId ? 'Parent' : 'Child';
      }
      if (type === 'spouse') return 'Spouse';
      return type;
    }

    // Render sidebar
    const list = document.getElementById('person-list');
    const sorted = [...DATA.people].sort((a,b) => a.displayName.localeCompare(b.displayName));
    sorted.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'person-btn';
      btn.dataset.id = p.id;
      const imgSrc = p.portraitMediaKey ? mediaFilename(p.portraitMediaKey) : null;
      btn.innerHTML = \`
        <span class="initial">\${imgSrc ? \`<img src="\${escHtml(imgSrc)}" alt="" onerror="this.parentNode.textContent='\${escHtml(p.displayName.charAt(0))}'"/>\` : escHtml(p.displayName.charAt(0))}</span>
        <span class="info">
          <div class="name">\${escHtml(p.displayName)}</div>
          \${p.birthDateText || p.deathDateText ? \`<div class="dates">\${escHtml(p.birthDateText||'')} \${p.deathDateText?'– '+escHtml(p.deathDateText):''}</div>\` : ''}
        </span>
      \`;
      btn.onclick = () => showPerson(p.id);
      list.appendChild(btn);
    });

    function showPerson(id) {
      const p = peopleMap[id];
      if (!p) return;

      // Update active state
      document.querySelectorAll('.person-btn').forEach(b => b.classList.remove('active'));
      const btn = document.querySelector(\`[data-id="\${id}"]\`);
      if (btn) btn.classList.add('active');

      const memories = memoriesByPerson[id] || [];
      const rels = relsByPerson[id] || [];

      const imgSrc = p.portraitMediaKey ? mediaFilename(p.portraitMediaKey) : null;
      const dateStr = [p.birthDateText, p.deathDateText ? '– '+p.deathDateText : (p.birthDateText ? '–' : '')].filter(Boolean).join(' ');

      let html = \`<div class="content">
        <div class="person-header">
          \${imgSrc ? \`<img class="person-portrait" src="\${escHtml(imgSrc)}" alt="\${escHtml(p.displayName)}" onerror="this.style.display='none'"/>\` : ''}
          <h2>\${escHtml(p.displayName)}</h2>
          \${dateStr ? \`<div class="dates">\${escHtml(dateStr)}</div>\` : ''}
          \${p.essenceLine ? \`<div class="essence">\${escHtml(p.essenceLine)}</div>\` : ''}
        </div>\`;

      // Connections
      if (rels.length > 0) {
        html += \`<div class="section-heading">Connections</div><div>\`;
        rels.forEach(r => {
          const other = peopleMap[r.otherId];
          if (!other) return;
          html += \`<span class="relation-chip" onclick="showPerson('\${escHtml(r.otherId)}')">\${escHtml(relLabel(r.type, r.fromPersonId, r.toPersonId, id))} · \${escHtml(other.displayName)}</span>\`;
        });
        html += \`</div>\`;
      }

      // Memories
      html += \`<div class="section-heading">Memories (\${memories.length})</div>\`;
      if (memories.length === 0) {
        html += \`<p class="empty">No memories recorded yet.</p>\`;
      } else {
        const sorted = [...memories].sort((a,b) => (a.dateOfEventText||'').localeCompare(b.dateOfEventText||''));
        sorted.forEach(m => {
          const mImgSrc = m.mediaKey ? mediaFilename(m.mediaKey) : null;
          html += \`<div class="memory-card">
            \${mImgSrc ? \`<img src="\${escHtml(mImgSrc)}" alt="" onerror="this.style.display='none'"/>\` : ''}
            <div class="m-title">\${escHtml(m.title)}</div>
            \${m.dateOfEventText ? \`<div class="m-date">\${escHtml(m.dateOfEventText)}</div>\` : ''}
            \${m.body ? \`<div class="m-body">\${escHtml(m.body)}</div>\` : ''}
          </div>\`;
        });
      }

      html += \`</div>\`;
      document.getElementById('main').innerHTML = html;
      window.scrollTo({ top: 0 });
    }

    // Show first person by default if any
    if (sorted.length > 0) showPerson(sorted[0].id);
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
