"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
} from "firebase/auth";
import type { PortalUser } from "@/domain/types";
import { appCheckFetch, getFirebaseClient } from "@/lib/firebase/client";

type Dialog = "avatar" | "password" | null;

export function AccountMenu({ user }: { user: PortalUser }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarAvailable, setAvatarAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function showDialog(next: Dialog) {
    setOpen(false);
    setError("");
    setSuccess("");
    setDialog(next);
  }

  async function logout() {
    setBusy(true);
    await appCheckFetch("/api/auth/session", { method: "DELETE" });
    window.location.assign("/auth/login");
  }

  async function uploadAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch("/api/account/avatar", {
        method: "PUT",
        body: new FormData(event.currentTarget),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? "The avatar could not be updated.");
      setAvatarAvailable(true);
      setAvatarVersion(Date.now());
      setDialog(null);
      setSuccess("Your avatar was updated successfully.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The avatar could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword"));
    const newPassword = String(form.get("newPassword"));
    if (newPassword !== String(form.get("confirmation"))) {
      setError("The new passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const { auth } = getFirebaseClient();
      await auth.authStateReady();
      const currentUser = auth.currentUser;
      if (!currentUser?.email)
        throw new Error("Sign in again before changing your password.");
      await reauthenticateWithCredential(
        currentUser,
        EmailAuthProvider.credential(currentUser.email, currentPassword),
      );
      await updatePassword(currentUser, newPassword);
      setDialog(null);
      setSuccess(
        "Your password has been changed. You will be redirected to the login page.",
      );
      await appCheckFetch("/api/auth/session", { method: "DELETE" }).catch(
        () => undefined,
      );
      window.setTimeout(() => {
        void signOut(auth).finally(() => {
          window.location.assign("/auth/login");
        });
      }, 2500);
    } catch (reason) {
      const code =
        typeof reason === "object" && reason && "code" in reason
          ? String(reason.code)
          : "";
      setError(
        code === "auth/invalid-credential"
          ? "Your current password is incorrect."
          : code === "auth/weak-password"
            ? "Use a stronger password with at least 8 characters."
            : reason instanceof Error
              ? reason.message
              : "The password could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const avatar = (
    <span className="account-avatar">
      {avatarAvailable ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={`/api/account/avatar?v=${avatarVersion}`}
          onError={() => setAvatarAvailable(false)}
        />
      ) : (
        user.displayName.charAt(0).toUpperCase()
      )}
    </span>
  );

  return (
    <>
      <div className="account-control" ref={menuRef}>
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Open account menu"
          className="account-trigger"
          onClick={() => setOpen((value) => !value)}
        >
          {avatar}
        </button>
        {open && (
          <div className="account-menu" role="menu">
            <div className="account-menu-header">
              {avatar}
              <span>
                <strong>{user.displayName}</strong>
                <small>{user.email}</small>
              </span>
            </div>
            <button role="menuitem" onClick={() => showDialog("avatar")}>
              Update avatar
            </button>
            <button role="menuitem" onClick={() => showDialog("password")}>
              Change password
            </button>
            <button className="account-logout" role="menuitem" onClick={logout}>
              Log out
            </button>
          </div>
        )}
      </div>
      {success && (
        <div className="account-toast" role="status">
          {success}
          <button aria-label="Dismiss message" onClick={() => setSuccess("")}>
            ×
          </button>
        </div>
      )}
      {dialog === "avatar" && (
        <div className="modal-backdrop">
          <form className="modal modal-small" onSubmit={uploadAvatar}>
            <DialogHeader
              eyebrow="Account settings"
              title="Update avatar"
              description="Choose a JPEG, PNG or WebP image up to 2 MB."
              close={() => setDialog(null)}
            />
            <label>
              Profile image
              <input
                accept="image/jpeg,image/png,image/webp"
                className="field"
                name="avatar"
                required
                type="file"
              />
            </label>
            <DialogFooter
              busy={busy}
              error={error}
              action="Update avatar"
              busyAction="Uploading..."
              close={() => setDialog(null)}
            />
          </form>
        </div>
      )}
      {dialog === "password" && (
        <div className="modal-backdrop">
          <form className="modal modal-small" onSubmit={changePassword}>
            <DialogHeader
              eyebrow="Account security"
              title="Change password"
              description="Confirm your current password, then choose a new one."
              close={() => setDialog(null)}
            />
            <div className="account-form">
              <PasswordField
                label="Current password"
                name="currentPassword"
                autoComplete="current-password"
              />
              <PasswordField label="New password" name="newPassword" />
              <PasswordField label="Confirm new password" name="confirmation" />
            </div>
            <DialogFooter
              busy={busy}
              error={error}
              action="Change password"
              busyAction="Changing..."
              close={() => setDialog(null)}
            />
          </form>
        </div>
      )}
    </>
  );
}

function DialogHeader({
  eyebrow,
  title,
  description,
  close,
}: {
  eyebrow: string;
  title: string;
  description: string;
  close: () => void;
}) {
  return (
    <div className="modal-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <button
        aria-label="Close"
        className="modal-close"
        type="button"
        onClick={close}
      >
        ×
      </button>
    </div>
  );
}

function PasswordField({
  label,
  name,
  autoComplete = "new-password",
}: {
  label: string;
  name: string;
  autoComplete?: string;
}) {
  return (
    <label>
      {label}
      <input
        autoComplete={autoComplete}
        className="field"
        minLength={8}
        name={name}
        required
        type="password"
      />
    </label>
  );
}

function DialogFooter({
  busy,
  error,
  action,
  busyAction,
  close,
}: {
  busy: boolean;
  error: string;
  action: string;
  busyAction: string;
  close: () => void;
}) {
  return (
    <>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button secondary" type="button" onClick={close}>
          Cancel
        </button>
        <button className="button" disabled={busy}>
          {busy ? busyAction : action}
        </button>
      </div>
    </>
  );
}
