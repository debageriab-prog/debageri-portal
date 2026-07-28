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
import { useLocale } from "@/components/localization/LocaleProvider";
import type { Locale } from "@/lib/localization/locale";

type Dialog = "avatar" | "password" | null;

export function AccountMenu({ user }: { user: PortalUser }) {
  const { locale, setLocale, t } = useLocale();
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
        throw new Error(result.error ?? t("avatarUpdateFailed"));
      setAvatarAvailable(true);
      setAvatarVersion(Date.now());
      setDialog(null);
      setSuccess(t("avatarUpdated"));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("avatarUpdateFailed"),
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
      setError(t("passwordsDoNotMatch"));
      setBusy(false);
      return;
    }
    try {
      const { auth } = getFirebaseClient();
      await auth.authStateReady();
      const currentUser = auth.currentUser;
      if (!currentUser?.email) throw new Error(t("signInAgain"));
      await reauthenticateWithCredential(
        currentUser,
        EmailAuthProvider.credential(currentUser.email, currentPassword),
      );
      await updatePassword(currentUser, newPassword);
      setDialog(null);
      setSuccess(t("passwordChanged"));
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
          ? t("currentPasswordIncorrect")
          : code === "auth/weak-password"
            ? t("weakPassword")
            : reason instanceof Error
              ? reason.message
              : t("passwordChangeFailed"),
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
          aria-label={t("openAccountMenu")}
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
              {t("updateAvatar")}
            </button>
            <button role="menuitem" onClick={() => showDialog("password")}>
              {t("changePassword")}
            </button>
            <label className="account-language">
              <span>{t("language")}</span>
              <select
                aria-label={t("language")}
                value={locale}
                onChange={(event) => setLocale(event.target.value as Locale)}
              >
                <option value="en-SE">English</option>
                <option value="sv-SE">Svenska</option>
              </select>
            </label>
            <button className="account-logout" role="menuitem" onClick={logout}>
              {t("logOut")}
            </button>
          </div>
        )}
      </div>
      {success && (
        <div className="account-toast" role="status">
          {success}
          <button
            aria-label={t("dismissMessage")}
            onClick={() => setSuccess("")}
          >
            ×
          </button>
        </div>
      )}
      {dialog === "avatar" && (
        <div className="modal-backdrop">
          <form className="modal modal-small" onSubmit={uploadAvatar}>
            <DialogHeader
              eyebrow={t("accountSettings")}
              title={t("updateAvatar")}
              description={t("avatarDescription")}
              close={() => setDialog(null)}
            />
            <label>
              {t("profileImage")}
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
              action={t("updateAvatar")}
              busyAction={t("uploading")}
              cancel={t("cancel")}
              close={() => setDialog(null)}
            />
          </form>
        </div>
      )}
      {dialog === "password" && (
        <div className="modal-backdrop">
          <form className="modal modal-small" onSubmit={changePassword}>
            <DialogHeader
              eyebrow={t("accountSecurity")}
              title={t("changePassword")}
              description={t("passwordDescription")}
              close={() => setDialog(null)}
            />
            <div className="account-form">
              <PasswordField
                label={t("currentPassword")}
                name="currentPassword"
                autoComplete="current-password"
              />
              <PasswordField label={t("newPassword")} name="newPassword" />
              <PasswordField
                label={t("confirmNewPassword")}
                name="confirmation"
              />
            </div>
            <DialogFooter
              busy={busy}
              error={error}
              action={t("changePassword")}
              busyAction={t("changing")}
              cancel={t("cancel")}
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
  const { t } = useLocale();
  return (
    <div className="modal-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <button
        aria-label={t("close")}
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
  cancel,
  close,
}: {
  busy: boolean;
  error: string;
  action: string;
  busyAction: string;
  cancel: string;
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
          {cancel}
        </button>
        <button className="button" disabled={busy}>
          {busy ? busyAction : action}
        </button>
      </div>
    </>
  );
}
