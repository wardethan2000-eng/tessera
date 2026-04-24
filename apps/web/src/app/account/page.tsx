"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";
import { authApi } from "@/lib/auth-api";

const API = getApiBase();

type Tab = "profile" | "security" | "notifications";

type NotificationPrefs = {
  invitationsEmail: boolean;
  promptsEmail: boolean;
  systemEmail: boolean;
};

export default function AccountPage() {
  const router = useRouter();
  const { data: session, isPending, refetch } = useSession();
  const [tab, setTab] = useState<Tab>("profile");

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.replace("/auth/signin");
    }
  }, [isPending, session, router]);

  if (isPending || !session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 text-sm text-stone-500">
        Loading…
      </main>
    );
  }

  const user = session.user;

  return (
    <main className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-400">Tessera</p>
            <h1 className="text-xl font-semibold text-stone-900">Account</h1>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
          >
            Back to app
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <nav className="mb-6 flex gap-1 rounded-xl bg-stone-100 p-1">
          {(
            [
              ["profile", "Profile"],
              ["security", "Security"],
              ["notifications", "Notifications"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === id
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "profile" && (
          <ProfileTab user={user} onUpdated={() => refetch?.()} />
        )}
        {tab === "security" && <SecurityTab />}
        {tab === "notifications" && <NotificationsTab />}
      </div>
    </main>
  );
}

function ProfileTab({
  user,
  onUpdated,
}: {
  user: { id: string; email: string; name?: string | null; image?: string | null; emailVerified: boolean };
  onUpdated: () => void;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [image, setImage] = useState(user.image ?? "");
  const [newEmail, setNewEmail] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg("");
    setSaving(true);
    const { error } = await authApi.updateUser({ name, image: image || undefined });
    setSaving(false);
    if (error) {
      setProfileMsg(error.message ?? "Could not save profile.");
      return;
    }
    setProfileMsg("Profile saved.");
    onUpdated();
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg("");
    setChangingEmail(true);
    const { error } = await authApi.changeEmail({
      newEmail,
      callbackURL: "/account",
    });
    setChangingEmail(false);
    if (error) {
      setEmailMsg(error.message ?? "Could not change email.");
      return;
    }
    setEmailMsg(
      `Verification link sent to ${newEmail}. The change will apply once you click the link.`
    );
    setNewEmail("");
  }

  async function handleResendVerification() {
    setResendMsg("");
    const { error } = await authApi.sendVerificationEmail({
      email: user.email,
      callbackURL: "/account",
    });
    setResendMsg(error ? error.message ?? "Could not send." : "Verification email sent.");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">Profile</h2>
        <p className="mt-1 text-sm text-stone-500">
          Your display name and avatar are visible to family members you share trees with.
        </p>
        <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
          <Field label="Name" value={name} onChange={setName} />
          <Field
            label="Avatar image URL (optional)"
            value={image}
            onChange={setImage}
            placeholder="https://…"
            type="url"
          />
          {profileMsg && (
            <p
              className={`text-sm ${profileMsg === "Profile saved." ? "text-emerald-700" : "text-red-600"}`}
            >
              {profileMsg}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">Email address</h2>
        <p className="mt-1 text-sm text-stone-500">
          Current email: <strong>{user.email}</strong>{" "}
          {user.emailVerified ? (
            <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Verified
            </span>
          ) : (
            <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              Not verified
            </span>
          )}
        </p>
        {!user.emailVerified && (
          <div className="mt-3">
            <button
              type="button"
              onClick={handleResendVerification}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              Resend verification email
            </button>
            {resendMsg && <p className="mt-2 text-xs text-stone-500">{resendMsg}</p>}
          </div>
        )}
        <form onSubmit={handleChangeEmail} className="mt-4 space-y-3">
          <Field
            label="New email"
            type="email"
            value={newEmail}
            onChange={setNewEmail}
            placeholder="you@example.com"
          />
          {emailMsg && (
            <p
              className={`text-sm ${emailMsg.startsWith("Verification") ? "text-emerald-700" : "text-red-600"}`}
            >
              {emailMsg}
            </p>
          )}
          <button
            type="submit"
            disabled={changingEmail || !newEmail}
            className="rounded-xl border border-stone-900 bg-white px-4 py-2 text-sm font-medium text-stone-900 hover:bg-stone-50 disabled:opacity-50"
          >
            {changingEmail ? "Sending…" : "Send verification link"}
          </button>
        </form>
      </section>
    </div>
  );
}

function SecurityTab() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revokeOther, setRevokeOther] = useState(true);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (next.length < 8) {
      setMsg("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setMsg("Passwords do not match.");
      return;
    }
    setSaving(true);
    const { error } = await authApi.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: revokeOther,
    });
    setSaving(false);
    if (error) {
      setMsg(error.message ?? "Could not change password.");
      return;
    }
    setMsg("Password updated.");
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/auth/signin");
  }

  async function handleSignOutEverywhere() {
    setSigningOutAll(true);
    await authApi.revokeOtherSessions();
    await authClient.signOut();
    router.push("/auth/signin");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">Change password</h2>
        <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
          <Field label="Current password" type="password" value={current} onChange={setCurrent} />
          <Field label="New password" type="password" value={next} onChange={setNext} />
          <Field label="Confirm new password" type="password" value={confirm} onChange={setConfirm} />
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={revokeOther}
              onChange={(e) => setRevokeOther(e.target.checked)}
            />
            Sign out of all other sessions
          </label>
          {msg && (
            <p className={`text-sm ${msg === "Password updated." ? "text-emerald-700" : "text-red-600"}`}>
              {msg}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {saving ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">Sessions</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Sign out
          </button>
          <button
            type="button"
            onClick={handleSignOutEverywhere}
            disabled={signingOutAll}
            className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {signingOutAll ? "Signing out…" : "Sign out everywhere"}
          </button>
        </div>
      </section>
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/me/notification-preferences`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Could not load preferences.");
        const body = await res.json();
        setPrefs({
          invitationsEmail: !!body.invitationsEmail,
          promptsEmail: !!body.promptsEmail,
          systemEmail: !!body.systemEmail,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load preferences.");
      }
    })();
  }, []);

  async function savePref(patch: Partial<NotificationPrefs>) {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`${API}/api/me/notification-preferences`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("Save failed.");
      setMsg("Saved.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 2000);
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (!prefs) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500 shadow-sm">
        Loading preferences…
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-stone-900">Email notifications</h2>
      <p className="mt-1 text-sm text-stone-500">
        Choose which Tessera emails you&apos;d like to receive.
      </p>
      <div className="mt-4 space-y-1">
        <Toggle
          label="Invitations to join a tree"
          description="When a family member invites you to a tree."
          checked={prefs.invitationsEmail}
          onChange={(v) => savePref({ invitationsEmail: v })}
        />
        <Toggle
          label="Memory prompts"
          description="Requests for stories and photos, and replies to your own prompts."
          checked={prefs.promptsEmail}
          onChange={(v) => savePref({ promptsEmail: v })}
        />
        <Toggle
          label="Account & security"
          description="Password resets and email verification. Recommended."
          checked={prefs.systemEmail}
          onChange={(v) => savePref({ systemEmail: v })}
        />
      </div>
      {(saving || msg) && (
        <p className="mt-3 text-xs text-stone-500">{saving ? "Saving…" : msg}</p>
      )}
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl px-2 py-3 hover:bg-stone-50">
      <div>
        <div className="text-sm font-medium text-stone-900">{label}</div>
        <div className="text-xs text-stone-500">{description}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 cursor-pointer"
      />
    </label>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
      />
    </label>
  );
}
