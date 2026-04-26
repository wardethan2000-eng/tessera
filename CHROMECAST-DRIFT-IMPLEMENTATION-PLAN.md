# Chromecast Interactive Drift Mode — Implementation Plan

> Drafted: 2026-04-26
> Status: Planning

## 1. Overview

This plan adds Chromecast sender support to Tessera's Drift Mode, allowing users to cast an interactive, cinematic memory experience to their TV. The phone becomes the remote control; the TV renders drift.

The architecture uses the **Custom Web Receiver** model: a dedicated HTML5 app runs on the Chromecast, controlled by custom messages from the sender (Tessera web app). This is NOT a media slideshow — it's the full Drift Mode experience on TV.

## 2. Architecture

```
┌─────────────────────────┐              ┌──────────────────────────────┐
│   Tessera Web App        │              │   Custom Web Receiver         │
│   (Sender — browser)     │              │   (runs on Chromecast)        │
│                           │              │                               │
│  ┌─────────────────┐     │   Cast       │  ┌──────────────────────┐     │
│  │ Cast Button     │─────│──session──────▶│  Init / Auth          │     │
│  │ (google-cast-   │     │              │  └──────────┬───────────┘     │
│  │  launcher)      │     │              │             │                  │
│  └─────────────────┘     │              │  ┌──────────▼───────────┐     │
│                           │              │  │ Fetch Drift Data     │     │
│  ┌─────────────────┐     │  Custom      │  │ (API + cast token)    │     │
│  │ Drift Chooser   │─────│──message─────▶│  └──────────┬───────────┘     │
│  │ (filter select) │     │              │             │                  │
│  └─────────────────┘     │              │  ┌──────────▼───────────┐     │
│                           │              │  │ Drift Renderer       │     │
│  ┌─────────────────┐     │  Custom      │  │ (CSS animations,     │     │
│  │ Mini Controls    │─────│──message─────▶│  │  auto-advance,       │     │
│  │ (⏮ ▶ ⏭ 🔊)    │     │              │  │  Ken Burns, fades)   │     │
│  └─────────────────┘     │              │  └──────────────────────┘     │
│                           │              │                               │
│  ┌─────────────────┐     │  Custom      │  ┌──────────────────────┐     │
│  │ Status Display   │◀────│──message──────│  │ State Updates        │     │
│  │ (now showing...)  │     │              │  │ (index, playing, etc)│     │
│  └─────────────────┘     │              │  └──────────────────────┘     │
└─────────────────────────┘              └──────────────────────────────┘
         │                                          │
         │                                          │
         ▼                                          ▼
  ┌──────────────────┐                    ┌──────────────────────┐
  │   Next.js Proxy   │                    │   Fastify API         │
  │   /api/* → API    │                    │   /api/trees/:id/     │
  └──────────────────┘                    │   drift               │
                                          │   /api/auth/cast-token│
                                          └──────────────────────┘
```

### Message Protocol

All custom messages use namespace `urn:x-cast:com.tessera.drift`.

**Sender → Receiver messages:**

| Type | Payload | Description |
|------|---------|-------------|
| `START_DRIFT` | `{ treeId, filter, castToken, apiBase }` | Initialize drift session with filter config |
| `ADVANCE` | `{}` | Move to next item |
| `STEP_BACK` | `{}` | Move to previous item |
| `JUMP_TO` | `{ index }` | Jump to a specific memory index |
| `PAUSE` | `{}` | Pause auto-advance |
| `PLAY` | `{}` | Resume auto-advance |
| `MUTE` | `{ muted: boolean }` | Toggle video audio |
| `CHANGE_FILTER` | `{ filter }` | Switch drift mode (person, era, remembrance) |
| `STOP_DRIFT` | `{}` | End drift session on receiver |

**Receiver → Sender messages:**

| Type | Payload | Description |
|------|---------|-------------|
| `DRIFT_STATE` | `{ currentIndex, totalItems, isPlaying, currentMemory, currentItem }` | Full state update |
| `DRIFT_LOADED` | `{ itemCount, seed }` | Confirms drift data loaded |
| `DRIFT_ERROR` | `{ message }` | Error on receiver |
| `DRIFT_ENDED` | `{}` | Drift session ended |

## 3. Components to Build

### 3.1 Sender-Side (Tessera Web App)

#### 3.1.1 Cast SDK Loader — `apps/web/src/lib/cast-loader.ts`

Lazy-loads the Google Cast Web Sender SDK script. Should only load when user clicks the cast button (not on page load) to avoid unnecessary network requests.

```typescript
// Pseudocode
let loaded = false;
export async function loadCastSdk(): Promise<void> {
  if (loaded) return;
  return new Promise((resolve, reject) => {
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) { loaded = true; resolve(); }
      else reject(new Error("Cast not available"));
    };
    const script = document.createElement("script");
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    script.async = true;
    document.head.appendChild(script);
  });
}
```

#### 3.1.2 Cast Hook — `apps/web/src/hooks/useChromecast.ts`

React hook that manages:
- Cast SDK initialization
- Device discovery and session lifecycle
- Custom message sending/receiving on `urn:x-cast:com.tessera.drift`
- Receiver state tracking (current memory, play state)
- Reconnection handling

```typescript
// Key state
interface CastState {
  isAvailable: boolean;      // Cast devices found
  isConnected: boolean;      // Active session
  receiverState: ReceiverState | null;  // Current drift state on TV
  castToken: string | null;  // Auth token for receiver
}

// Key functions exposed
interface UseChromecastReturn {
  state: CastState;
  startDrift(filter: DriftFilter): void;
  advance(): void;
  stepBack(): void;
  pause(): void;
  play(): void;
  jumpTo(index: number): void;
  mute(muted: boolean): void;
  changeFilter(filter: DriftFilter): void;
  stopDrift(): void;
  endSession(): void;
}
```

The hook should:
1. Only initialize when the user explicitly interacts with a cast button
2. Create a session with the registered Custom Receiver app ID
3. On session start, request a cast token from `/api/auth/cast-token`
4. Send `START_DRIFT` with `{ treeId, filter, castToken, apiBase }` after session is established
5. Listen for `DRIFT_STATE` messages to keep the sender UI in sync
6. Handle session end / device disconnect gracefully

#### 3.1.3 Cast Button Component — `apps/web/src/components/cast/CastButton.tsx`

A thin wrapper around `<google-cast-launcher>` custom element:
- Shows when Cast is available on the network
- Toggles between "Cast" and connected state
- Uses the `useChromecast` hook for session management

This can also be a custom button that calls `cast.framework.CastContext.getInstance().requestSession()` if the default launcher doesn't fit the Tessera design language.

#### 3.1.4 Drift Cast Controls — `apps/web/src/components/cast/DriftCastControls.tsx`

The sender-side mini controller shown while casting:
- Current memory title, person name, date
- Play/Pause toggle
- Advance/Back buttons
- Progress indicator
- Mute toggle (for video content)
- "Open on phone" link that opens the current memory on the phone
- Close/Stop casting button

This component:
- Reads from `useChromecast().receiverState`
- Only renders when `isConnected` is true
- Does NOT render the DriftMode component locally (the TV shows drift; the phone shows controls)

#### 3.1.5 Cast Token API — `apps/api/src/routes/auth/cast-token.ts`

New API endpoint that exchanges a valid session cookie for a short-lived cast token.

```
POST /api/auth/cast-token
Cookie: better-auth.session_token=<existing cookie>
Response: { token: "cast_<random>_<expiry>", expiresAt: <timestamp> }
```

Token properties:
- Format: `cast_<cryptographic-random>_<unix-expiry>`
- Lifetime: 2 hours (drift sessions are relatively short)
- Stored in a new `cast_tokens` database table (or in-memory KV store for simplicity in v1)
- Validated by the drift API endpoint when the receiver requests data
- Single-use for initial fetch, then the session can cache data

Database schema (Drizzle):
```typescript
export const castTokens = pgTable("cast_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  userId: text("user_id").notNull().references(() => users.id),
  treeId: text("tree_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
```

#### 3.1.6 Drift API Token Auth — Modify `apps/api/src/routes/drift.ts`

Add an alternative auth path: if `cast_token` query parameter is present, validate it instead of requiring a session cookie.

```typescript
// Pseudocode addition to drift route
const castToken = query.cast_token;
let userId: string | null = null;

if (castToken) {
  // Validate cast token from database
  const tokenRecord = await db.query.castTokens.findFirst({
    where: (t, { eq, and, gt }) => and(
      eq(t.token, castToken),
      gt(t.expiresAt, new Date())
    ),
  });
  if (!tokenRecord) return reply.status(401).send({ error: "Invalid or expired cast token" });
  userId = tokenRecord.userId;
  // Also filter by treeId from token for extra security
  if (tokenRecord.treeId !== treeId) return reply.status(403).send({ error: "Token not valid for this tree" });
} else {
  // Existing session-based auth
  const session = await getSession(request.headers);
  if (!session) return reply.status(401).send({ error: "Unauthorized" });
  userId = session.user.id;
}

// Continue with existing membership check using userId
```

#### 3.1.7 Media URL Auth — Modify `apps/web/src/app/api/media/route.ts`

Add support for `cast_token` query parameter as an alternative to cookie-based auth. The receiver page loads media via `/api/media?key=<minio-key>&cast_token=<token>` instead of relying on cookies.

#### 3.1.8 Integration into DriftMode and DriftChooserSheet

Modify `DriftMode.tsx`:
- When Cast session is active, hide the local Drift UI and show "Casting to [device name]" banner
- Show mini controls (Section 3.1.4) at the bottom of the screen
- When Cast session ends, return to local playback or exit

Modify `DriftChooserSheet.tsx`:
- After choosing a drift mode, if Cast is connected, send `START_DRIFT` instead of opening local DriftMode
- Add a "Cast to TV" option as a fifth mode or as a toggle at the top of the sheet

### 3.2 Receiver-Side (Custom Web Receiver)

#### 3.2.1 Receiver HTML Page — `apps/web/src/app/cast/receiver/page.tsx`

This is a standalone **Next.js route** that produces a self-contained HTML page. It must NOT load the full Tessera React app bundle — it needs to be lightweight and fast-loading for the Chromecast environment.

Strategy: Create this as a Next.js route that renders minimal HTML with inline critical CSS and loads only the receiver JavaScript bundle.

The page should:
- Set `<meta name="viewport" content="width=device-width, initial-scale=1">`
- Include the Cast Receiver SDK: `<script src="//www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js"></script>`
- Load a minimal receiver JS bundle
- Have a dark background (`var(--ink)` equivalent)
- Show a waiting screen ("Ready to drift" or Tessera logo) until drift data loads

#### 3.2.2 Receiver JavaScript — `apps/web/src/cast/receiver.ts`

The core receiver logic. This is NOT a React app — it's vanilla JS with the Cast Receiver SDK. It must be compiled to a standalone bundle.

Key responsibilities:

```typescript
// Pseudocode structure
const NAMESPACE = "urn:x-cast:com.tessera.drift";
const context = cast.framework.CastReceiverContext.getInstance();

// 1. Initialize receiver with options
context.start({
  disableIdleTimeout: true,  // Keep alive during drift
  maxInactivity: 3600,        // 1 hour before idle disconnect during dev
});

// 2. Listen for custom messages
context.addCustomMessageListener(NAMESPACE, (event) => {
  const message = JSON.parse(event.data);
  switch (message.type) {
    case "START_DRIFT": handleStartDrift(message); break;
    case "ADVANCE": handleAdvance(); break;
    case "STEP_BACK": handleStepBack(); break;
    case "PAUSE": handlePause(); break;
    case "PLAY": handlePlay(); break;
    case "JUMP_TO": handleJumpTo(message); break;
    case "MUTE": handleMute(message); break;
    case "CHANGE_FILTER": handleChangeFilter(message); break;
    case "STOP_DRIFT": handleStopDrift(); break;
  }
});

// 3. Drift state management
interface DriftState {
  items: DriftItem[];
  currentIndex: number;
  isPlaying: boolean;
  isMuted: boolean;
  filter: DriftFilter | null;
  castToken: string;
  apiBase: string;
  treeId: string;
  autoAdvanceTimer: number | null;
  progressInterval: number | null;
}

// 4. Fetch drift data from API using castToken
async function handleStartDrift(msg) {
  // POST /api/trees/:treeId/drift?cast_token=<token>
  // Store items, start rendering, begin auto-advance
}

// 5. Rendering functions (DOM manipulation, no React)
function renderItem(item: DriftItem, kind: string) {
  // Clear previous content with cross-fade
  // Create DOM elements for image/video/audio/text
  // Apply Ken Burns animation via CSS
  // Start progress tracking
}

// 6. Auto-advance logic (mirrors DriftMode.tsx timing)
function scheduleAdvance(durationMs: number) {
  // Set timeout for next item
  // Update progress bar
}

// 7. Send state updates back to sender
function sendStateUpdate() {
  const state = { currentIndex, totalItems, isPlaying, currentMemory, currentItem };
  // context.sendCustomMessage(NAMESPACE, senderId, JSON.stringify({ type: "DRIFT_STATE", ...state }));
}
```

#### 3.2.3 Receiver CSS Animations — `apps/web/src/cast/receiver.css`

CSS-only animations that replicate the Drift Mode visual experience without Framer Motion:

```css
/* Ken Burns effect — slow zoom */
@keyframes ken-burns {
  from { transform: scale(1.0); }
  to { transform: scale(1.06); }
}

/* Cross-fade between items */
.drift-content {
  transition: opacity 0.7s cubic-bezier(0.22, 0.61, 0.36, 1);
}

/* Backdrop blur — applied to a background image layer */
.drift-backdrop {
  position: fixed;
  inset: -20px;
  background-size: cover;
  background-position: center;
  filter: blur(48px) saturate(1.2) brightness(0.6);
  transform: scale(1.12);
  opacity: 0;
  transition: opacity 1.2s cubic-bezier(0.22, 0.61, 0.36, 1);
}

/* Progress bar */
.drift-progress-fill {
  transition: width 0.05s linear;
}

/* Audio orb pulse */
@keyframes orb-pulse {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50% { transform: scale(1.1); opacity: 1; }
}
```

All animations should respect `prefers-reduced-motion` or a receiver-side flag.

#### 3.2.4 Receiver Build Step

The receiver is a standalone page that needs to be compiled separately from the main Next.js app. Options:

**Option A: Next.js API route that serves a pre-built HTML page** (Recommended for v1)
- Create `apps/web/public/cast/receiver.html` as a static file
- Compile `receiver.ts` and `receiver.css` with esbuild/swc into a single inline JS bundle
- The HTML page loads the Cast Receiver SDK from Google's CDN and the inline bundle
- Serve via `tessera.family/cast/receiver.html`

**Option B: Separate build step in monorepo**
- Add a `cast-receiver` package in `/packages/`
- Build with esbuild into a single HTML file
- Deploy the output to the web server's public directory

For v1 testing, Option A is simpler and sufficient.

### 3.3 Auth Token Flow

```
┌──────────┐    1. User signs in      ┌──────────┐
│  Browser  │ ────(cookie session)────▶│   API     │
│  (Sender) │                          │           │
└──────────┘                          └──────────┘
       │                                     ▲
       │ 2. Click "Cast"                    │
       ▼                                     │
┌──────────┐    3. POST /api/auth/         │
│  Cast SDK  │       cast-token             │
│            │ ─────────────────────────────▶│
│            │                               │
│            │ ◀───── { token } ────────────│
│            │                               │
│            │ 4. START_DRIFT message       │
└──────────┘    (with castToken)            │
       │                                     │
       │ 5. Media/data requests             │
       ┼────────────────────────────────────▶│
       │  (with ?cast_token= param)          │
       ▼                                     │
┌──────────┐    6. Loads drift data    ┌──────────┐
│Chromecast│ ─────────────────────────▶│   API     │
│Receiver  │    (with ?cast_token=)     │           │
│          │                             │           │
│          │ ◀─── JSON response ─────────│           │
│          │                             └──────────┘
│          │    7. Loads media files
│          │ ─────────────────────▶ MinIO / CDN
│          │    (with ?cast_token= via proxy)
└──────────┘
```

**Critical detail:** The cast token must work for BOTH the drift data API call AND the media URL requests. The receiver will construct URLs like:

```
/api/trees/{treeId}/drift?cast_token={token}
/api/media?key={minioKey}&cast_token={token}
```

Both endpoints must accept `cast_token` as an alternative to cookie auth.

## 4. Implementation Phases

### Phase 1: Foundation (Test Version)

The goal of Phase 1 is to prove the architecture works end-to-end with a minimal Drift experience on TV.

#### Phase 1a: Cast Token Auth

1. **Create `cast_tokens` table migration**
   - File: `packages/database/src/schema.ts` — add `castTokens` table
   - File: `packages/database/migrations/` — generate migration

2. **Create cast-token API endpoint**
   - File: `apps/api/src/routes/auth/cast-token.ts`
   - `POST /api/auth/cast-token` — validates session, generates token, stores in DB
   - Returns `{ token, expiresAt }`

3. **Modify drift API to accept cast_token**
   - File: `apps/api/src/routes/drift.ts`
   - Add `cast_token` query parameter support as alternative to cookie session
   - Validate token, extract userId, verify treeId match

4. **Modify media proxy to accept cast_token**
   - File: `apps/web/src/app/api/media/route.ts`
   - Add `cast_token` query parameter support
   - Validate token, construct appropriate upstream request headers

#### Phase 1b: Receiver Application

5. **Create receiver HTML page**
   - File: `apps/web/public/cast/receiver.html`
   - Self-contained HTML with:
     - Cast Receiver SDK script
     - Inline CSS for drift rendering
     - Loading/waiting state
     - Error state

6. **Create receiver JavaScript**
   - File: `apps/web/src/cast/receiver.ts`
   - Cast Receiver SDK initialization
   - Custom message listener setup
   - Data fetching with cast token
   - DOM-based drift rendering (no React)
   - Auto-advance timer logic
   - Ken Burns CSS animation toggling
   - Progress bar updates
   - State sync messages back to sender

7. **Create receiver build script**
   - File: `apps/web/scripts/build-cast-receiver.mjs`
   - Uses esbuild to bundle `receiver.ts` + `receiver.css` into inline JS
   - Outputs to `apps/web/public/cast/receiver.js`
   - Run as part of `pnpm build` or separately for development

8. **Create receiver CSS**
   - File: `apps/web/src/cast/receiver.css`
   - Dark background, Ken Burns keyframes, cross-fade transitions, progress bar, text overlays, audio orb
   - Responsive for Chromecast's 720p rendering plane

#### Phase 1c: Sender Integration

9. **Create Cast SDK loader**
   - File: `apps/web/src/lib/cast-loader.ts`
   - Lazy-loads SDK script
   - Handles availability check

10. **Create useChromecast hook**
    - File: `apps/web/src/hooks/useChromecast.ts`
    - Manages CastContext initialization
    - Session lifecycle (connect, disconnect, reconnect)
    - Custom message protocol
    - Cast token generation
    - Receiver state tracking

11. **Create CastButton component**
    - File: `apps/web/src/components/cast/CastButton.tsx`
    - Simple button that triggers device discovery
    - Shows connection state

12. **Create DriftCastControls component**
    - File: `apps/web/src/components/cast/DriftCastControls.tsx`
    - Mini controller UI: play/pause, advance, back, current item info
    - Reads from `useChromecast` state

13. **Modify DriftChooserSheet**
    - File: `apps/web/src/components/tree/DriftChooserSheet.tsx`
    - Add "Cast to TV" option or detect active Cast session
    - When Cast is connected and user picks a mode, send `START_DRIFT` instead of opening local DriftMode

14. **Modify DriftMode.tsx**
    - File: `apps/web/src/components/tree/DriftMode.tsx`
    - Add Cast integration: when Cast session is active, hide local rendering and show cast status
    - This is optional for v1 — can simply show a "Casting to TV" overlay and exit local drift

### Phase 2: Polish and Full Feature Parity

After Phase 1 proves the architecture works:

1. **Full receiver rendering** — Support all content types (video, audio with transcript, linked media, text stories with reading time)
2. **Remembrance mode** on receiver — Slower pacing, "In memory of" header, monocrome backdrop
3. **Filter switching** from sender — Change drift mode mid-session without restarting
4. **Backdrop styles** on receiver — Support all 6 backdrop styles
5. **Seen-memory tracking** — Send seen map back to sender for localStorage persistence
6. **Session resume** — Handle Chromecast stream transfer (preserve state when switching devices)

### Phase 3: Advanced Features

1. **Photo preloading** — Preload next 2-3 images on receiver for instant cross-fades
2. **Smart Display controls** — Touch-enabled receiver UI for Google Nest Hub
3. **Voice commands** — "Hey Google, next" / "Hey Google, pause" via Android TV remote
4. **QR code** — Display QR code on TV for phone-based remote control (alternative to cast sender)
5. **Offline caching** — Service worker on receiver for smoother operation

## 5. Testing Strategy

### 5.1 Local Development Testing

**Without a physical Chromecast** (using the Cast Simulator):

1. Register a test app in the [Cast Developer Console](https://cast.google.com/publish) ($5 one-time fee)
2. Use Chrome's built-in Cast simulator:
   - Open `chrome://inspect` on your development machine
   - Enable "Discover Cast devices" in Chrome flags
3. Use the [Command and Control (CaC) Tool](https://casttool.azurewebsites.net/) to simulate receiver behavior
4. Test receiver page directly in a browser at `http://localhost:3000/cast/receiver.html`

**With a physical Chromecast**:

1. Register your development machine's IP in the Cast Developer Console
2. Ensure both devices are on the same network
3. The receiver URL must be HTTPS-accessible — use `tessera.family` with a tunnel, or set up a local HTTPS proxy

### 5.2 Unit Tests

- **Cast token API**: Test generation, validation, expiry, treeId scoping
- **Drift API with cast_token**: Test that cast token auth works alongside cookie auth
- **Media proxy with cast_token**: Test that media URLs resolve correctly with token auth
- **Receiver message parsing**: Test all message types in the protocol

### 5.3 Integration Tests

- **End-to-end cast flow**: Start drift from sender → receiver renders → controls work
- **Session lifecycle**: Connect → start drift → pause → advance → back → disconnect
- **Auth flow**: Generate token → fetch drift data → fetch media → all succeed
- **Error handling**: Invalid token, expired token, network errors, device disconnect mid-drift

### 5.4 Manual Test Checklist

- [ ] Cast button appears when Chromecast is on network
- [ ] Selecting a Chromecast device establishes session
- [ ] Choosing "All memories" in Drift Chooser sends drift to TV
- [ ] Photos render on TV with Ken Burns effect
- [ ] Auto-advance works (6s for photos)
- [ ] Advance/Back buttons on phone control TV
- [ ] Play/Pause works from phone
- [ ] Switching filter modes restarts drift on TV
- [ ] Disconnecting Cast restores local control
- [ ] Cast token expires after 2 hours
- [ ] Video content autoplays on TV (muted by default)
- [ ] Audio content plays with visual orb + transcript
- [ ] Text stories display with reading-time pacing
- [ ] Progress bar advances on TV
- [ ] Person attribution shows at bottom of TV

## 6. Configuration

### Environment Variables

**Web app (`apps/web/.env`):**

```env
# Cast Receiver App ID (registered at Google Cast Developer Console)
NEXT_PUBLIC_CAST_APP_ID=992F4393
# Cast Receiver URL (where the receiver HTML page is hosted)
NEXT_PUBLIC_CAST_RECEIVER_URL=https://tessera.family/cast/receiver.html
```

**API (`apps/api/.env`):**

```env
# Cast token lifetime in seconds (default: 7200 = 2 hours)
CAST_TOKEN_LIFETIME=7200
```

### Google Cast Developer Console Setup

1. Go to https://cast.google.com/publish
2. Pay $5 registration fee
3. Add a new application:
   - Type: **Custom Web Receiver**
   - Name: "Tessera Drift"
   - URL: `https://tessera.family/cast/receiver.html`
4. Note the Application ID — this goes in `NEXT_PUBLIC_CAST_APP_ID`
5. Add your development machine's IP for testing

### Content Security Policy

The current `next.config.ts` sets `X-Frame-Options: DENY` and has a strict CSP. The receiver page needs:
- To load Cast Receiver SDK from `www.gstatic.com`
- To connect back to `tessera.family` API
- To load media from MinIO/CDN

Update CSP script-src and connect-src to allow:
- `www.gstatic.com` (Cast SDK)
- `fonts.googleapis.com` / `fonts.gstatic.com` (if using web fonts)
- The configured API and media origins

## 7. File Inventory

New files to create:

```
apps/api/src/routes/auth/cast-token.ts          # Cast token generation endpoint
apps/web/src/lib/cast-loader.ts                  # Lazy load Cast SDK
apps/web/src/hooks/useChromecast.ts              # React hook for Cast integration
apps/web/src/components/cast/CastButton.tsx       # Cast discovery/connection button
apps/web/src/components/cast/DriftCastControls.tsx # Mini drift controller for phone
apps/web/src/cast/receiver.ts                     # Receiver JS logic
apps/web/src/cast/receiver.css                    # Receiver CSS animations
apps/web/scripts/build-cast-receiver.mjs         # Build script for receiver bundle
```

Files to modify:

```
apps/api/src/routes/drift.ts                     # Add cast_token auth support
apps/api/src/lib/auth.ts                          # Export token validation helper
apps/web/src/app/api/media/route.ts              # Add cast_token auth support
apps/web/src/components/tree/DriftMode.tsx        # Add Cast-aware rendering
apps/web/src/components/tree/DriftChooserSheet.tsx # Add Cast option
packages/database/src/schema.ts                  # Add cast_tokens table
apps/web/next.config.ts                          # CSP updates for Cast SDK
apps/web/package.json                            # Add build-cast-receiver script
pnpm-workspace.yaml                              # (no change needed if scripts are in web)
```

## 8. Known Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Chromecast performance** — Framer Motion overhead, heavy JS | Receiver may be laggy or crash | Use CSS-only animations in receiver. No React, no Framer Motion. Preload images aggressively. |
| **Cookie auth doesn't work cross-device** | Receiver can't fetch drift data | Cast token exchange flow (Section 3.3) provides bearer auth alternative |
| **Network latency for image loading** | Cross-fades stutter if next image hasn't loaded | Preload next 2-3 items on receiver. Show loading state on slow networks. |
| **Cast SDK only works in Chrome** | Firefox/Safari users can't cast | This is a Chrome/Chromium limitation. Consider adding an AirPlay alternative or the `/drift?frame=1` kiosk route as a fallback. |
| **Chromecast has limited JS runtime** | Complex rendering may fail | Keep receiver JS minimal. No React, no animation libraries. Pure DOM + CSS. |
| **Cast Developer Console requires $5** | Can't test without registration | This is unavoidable for Custom Receivers. The Default Media Receiver is free but can't render custom UI. |
| **Media URLs need absolute paths with auth** | Receiver can't load images through Next.js proxy | Use `cast_token` query param for both API and media endpoints. Construct absolute URLs in receiver. |
| **Video autoplay on receiver** | Some Cast devices may block autoplay | Cast Receiver SDK has elevated autoplay privileges. Test on real hardware. |

## 9. Alternative Simplified Path (Phase 0)

If the full Chromecast integration is too complex for an initial test, there's a **Phase 0** that proves the concept with zero Cast SDK:

1. Create `/drift?frame=1` route that renders DriftMode with:
   - No close button
   - No chooser sheet
   - Auto-start on mount
   - Infinite loop
   - Hidden attribution bar
   - Accept filter params: `?frame=1&personId=xxx&mode=remembrance`

2. This page works on any smart TV browser, kiosk device, or even a laptop connected to a TV via HDMI.

3. Interactivity comes from a Bluetooth keyboard or TV remote (arrow keys, space, escape already work in DriftMode).

This gives 80% of the value with 5% of the effort, and validates the visual experience before investing in Cast SDK integration.

## 10. Receiver Rendering Specification

The receiver must replicate these Drift Mode behaviors using CSS + vanilla JS only:

### 10.1 Photo (image type)
- Full-screen image with Ken Burns animation (scale 1.0 → 1.06 over duration)
- Blurred backdrop behind image (same image, `filter: blur(48px) saturate(1.2) brightness(0.6)`)
- Vignette overlay
- 6-second display duration
- Cross-fade transition (0.7s ease)

### 10.2 Video
- Full-screen video, autoplay, muted by default
- Progress bar tracks video time
- Advance when video ends or at 60s max
- Mute toggle from sender

### 10.3 Audio
- Pulsing orb animation ("Listening")
- Transcript text below
- Advance when audio ends or at 60s max

### 10.4 Text story
- Large typography
- Reading-time based pacing (200 WPM, min 8s, max 45s)
- Gradient backdrop (warm archival tones)

### 10.5 Linked media
- Preview image + "Open in Drive" label
- 8-second display

### 10.6 Common overlay elements
- Kind chip: "Photo · 1974" or "Voice · In memory of..."
- Progress bar: thin track at bottom
- Person attribution: name + memory title at bottom

### 10.7 Remembrance mode
- Monochrome backdrop (grayscale filter)
- 1.6x pacing multiplier
- "In memory of [Name]" header
- Chronological ordering

## 11. Performance Budget

The Chromecast Gen 3 has a relatively limited CPU. The receiver must stay within these budgets:

| Metric | Budget | Notes |
|--------|--------|-------|
| Receiver JS bundle size | < 50 KB gzipped | No React, no animation libraries |
| Receiver CSS size | < 10 KB gzipped | Inline in HTML |
| Initial load time | < 3 seconds | From Cast session start to "Ready to drift" |
| Memory usage | < 100 MB | Total heap. Preload max 3 images. |
| DOM repaint budget | < 16ms per frame | CSS animations only, no JS-driven animation |
| API call to first render | < 5 seconds | Including drift data fetch + first image load |

## 12. Dependencies

### New npm dependencies

None for v1. The Cast SDK is loaded from Google's CDN (`gstatic.com`). The receiver is vanilla JS. The sender hook uses the global `cast` and `chrome.cast` namespaces injected by the SDK.

### Development dependencies

- `esbuild` (already in monorepo via Next.js) — for building receiver bundle
- A registered Google Cast Developer Console app — for testing

### Infrastructure

- HTTPS certificate must cover `tessera.family/cast/receiver.html`
- CSP headers must allow `www.gstatic.com` scripts and `connect-src` to the API
- The `$5` Google Cast Developer registration fee

## 13. Future Considerations

1. **AirPlay** — The Cast SDK is Chrome-only. For Safari/iOS users, consider an AirPlay sender via the Presentation API (`navigator.presentation`) or a native iOS app with AirPlay support.

2. **Smart TV native apps** — For Samsung Tizen / LG webOS, the same receiver HTML could be adapted into a Tizen/webOS app with minor modifications.

3. **Offline kiosk mode** — The `/drift?frame=1` approach (Section 9) is still valuable as a zero-config fallback for any device with a browser.

4. **Multi-user drift** — Allow multiple family members to control the same drift session from their own phones (each phone gets sender controls).

5. **Drift playlists** — Save a drift sequence as a "playlist" or "exhibit" that can be replayed or shared, similar to the Phase E plan in the Drift Expansion document.