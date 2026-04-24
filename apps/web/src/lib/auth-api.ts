import { getApiBase } from "@/lib/api-base";

type Result<T = unknown> = { data: T | null; error: { message: string } | null };

async function call<T = unknown>(path: string, body: unknown, method = "POST"): Promise<Result<T>> {
  const API = getApiBase();
  try {
    const res = await fetch(`${API}/api/auth${path}`, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        (data && (data.message || data.error || data.statusMessage)) ||
        `Request failed (${res.status})`;
      return { data: null, error: { message } };
    }
    return { data: data as T, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : "Network error" },
    };
  }
}

export const authApi = {
  forgetPassword: (body: { email: string; redirectTo?: string }) =>
    call("/request-password-reset", body),
  resetPassword: (body: { token: string; newPassword: string }) =>
    call("/reset-password", body),
  sendVerificationEmail: (body: { email: string; callbackURL?: string }) =>
    call("/send-verification-email", body),
  changePassword: (body: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions?: boolean;
  }) => call("/change-password", body),
  changeEmail: (body: { newEmail: string; callbackURL?: string }) =>
    call("/change-email", body),
  updateUser: (body: { name?: string; image?: string }) => call("/update-user", body),
  revokeOtherSessions: () => call("/revoke-other-sessions", {}),
};