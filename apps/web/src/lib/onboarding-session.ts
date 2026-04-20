const KEY = "heirloom_onboarding";

export type OnboardingSession = {
  treeId?: string;
  selfPersonId?: string;
  relativeAdded?: boolean;
  memoryAdded?: boolean;
};

export function readOnboardingSession(): OnboardingSession {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as OnboardingSession;
  } catch {
    return {};
  }
}

export function writeOnboardingSession(patch: Partial<OnboardingSession>): void {
  if (typeof window === "undefined") return;
  const current = readOnboardingSession();
  sessionStorage.setItem(KEY, JSON.stringify({ ...current, ...patch }));
}

export function clearOnboardingSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
}
