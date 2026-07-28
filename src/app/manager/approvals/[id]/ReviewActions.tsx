"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";

export function ReviewActions({
  id,
  returnTo = "/manager/approvals",
}: {
  id: string;
  returnTo?: string;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action: "approve" | "reject") {
    setBusy(true);
    setError("");
    const response = await appCheckFetch(
      `/api/timesheets/${encodeURIComponent(id)}/${action}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: action === "reject" ? reason : null }),
      },
    );
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error);
    router.push(returnTo);
    router.refresh();
  }
  return (
    <div style={{ marginTop: 20 }}>
      <label>
        {t("rejectionReason")}
        <textarea
          className="field"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="actions" style={{ marginTop: 14 }}>
        <button
          className="button"
          disabled={busy}
          onClick={() => act("approve")}
        >
          {t("approve")}
        </button>
        <button
          className="button danger"
          disabled={busy || reason.trim().length < 3}
          onClick={() => act("reject")}
        >
          {t("reject")}
        </button>
      </div>
    </div>
  );
}
