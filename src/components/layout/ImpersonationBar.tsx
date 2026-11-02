"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { appCheckFetch } from "@/lib/firebase/client";

let channel: BroadcastChannel | null = null;
const impersonationChannel = () =>
  (channel ??= new BroadcastChannel("debageri-view-as"));

/** Cookies are shared, so every open tab changes user together. */
export function announceImpersonationChange() {
  impersonationChannel().postMessage("changed");
}

export async function endImpersonation() {
  const response = await appCheckFetch("/api/admin/impersonation", {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("viewAsExitFailed");
  announceImpersonationChange();
}

/** Reloads tabs another tab has switched, so none shows the wrong person. */
export function ImpersonationSync() {
  useEffect(() => {
    const reload = () => window.location.reload();
    const current = impersonationChannel();
    current.addEventListener("message", reload);
    return () => current.removeEventListener("message", reload);
  }, []);
  return null;
}

export function ImpersonationBar({ name }: { name: string | null }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function exit() {
    setBusy(true);
    setFailed(false);
    try {
      await endImpersonation();
      // Closes the tab the view opened in; any other tab goes back to admin.
      // Closing at once would drop the announcement to the other tabs.
      window.setTimeout(() => {
        window.close();
        window.location.assign("/admin/users");
      }, 200);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="impersonation-bar" role="status">
      <span>
        {failed
          ? t("viewAsExitFailed")
          : name
            ? t("viewAsBar").replace("{name}", name)
            : t("viewAsEnded")}
      </span>
      <button type="button" disabled={busy} onClick={exit}>
        {t("viewAsExit")}
      </button>
    </div>
  );
}
