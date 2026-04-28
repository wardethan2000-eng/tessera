export const EASE_TESSERA: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

export const CAMERA_GLIDE_DURATION = 1.8;
export const CAMERA_GLIDE_ZOOM_MID = 0.7;
export const CAMERA_FOCUSED_ZOOM = 1.35;
export const CAMERA_ZOOM_MIN = 0.3;
export const CAMERA_ZOOM_MAX = 2.4;
export const PIN_EXPAND_DURATION = 0.6;
export const PIN_CONTRACT_DURATION = 0.4;
export const THREAD_PULSE_DURATION = 0.5;
export const BOARD_ENTRY_DURATION = 1.2;
export const CONTENT_REVEAL_DURATION = 0.8;

export const AMBIENT_DRIFT_SPEED = 0.3;
export const IDLE_THRESHOLD_MS = 5000;

export const FOCUS_VIGNETTE_INNER_FACTOR = 0.7;
export const FOCUS_VIGNETTE_OUTER_FACTOR = 1.4;

export const PIN_ROTATION_RANGE = 2;
export const PIN_MIN_SPACING = 700;
export const PIN_JITTER_RANGE = 120;
export const BOARD_PADDING = 200;
export const BOARD_BASE_WIDTH = 8000;
export const BOARD_BASE_HEIGHT = 6000;
export const MAX_OUTGOING_THREADS_PER_PIN = 6;

export const DURATION_PHOTO = 16000;
export const DURATION_STORY_MIN = 12000;
export const DURATION_STORY_MAX = 45000;
export const DURATION_MEDIA_MAX = 60000;
export const DURATION_DOCUMENT = 14000;
export const WORDS_PER_MINUTE = 200;
export const REMEMBRANCE_PACING = 1.6;

export const SEEN_STORAGE_KEY_PREFIX = "tessera:drift:seen:";
export const MAX_SEEN_ENTRIES = 500;

export const cameraTransitionVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: BOARD_ENTRY_DURATION, ease: EASE_TESSERA },
};

export const pinExpandVariants = {
  collapsed: {
    scale: 1,
    opacity: 1,
    transition: { duration: PIN_CONTRACT_DURATION, ease: EASE_TESSERA },
  },
  expanded: {
    scale: 1.4,
    opacity: 1,
    transition: { duration: PIN_EXPAND_DURATION, ease: EASE_TESSERA },
  },
};

export const contentRevealVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: CONTENT_REVEAL_DURATION, ease: EASE_TESSERA },
  },
};

export const boardEntryVariants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1, transition: { duration: BOARD_ENTRY_DURATION, ease: EASE_TESSERA } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.5, ease: EASE_TESSERA } },
};
