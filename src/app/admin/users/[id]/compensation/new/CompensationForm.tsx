"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  compensationInput,
  defaultCompensationValues,
} from "@/domain/finance/compensation";
import {
  CompensationFields,
  postCompensationAction,
} from "../../../CompensationFields";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function CompensationForm({ employeeId }: { employeeId: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [values, setValues] = useState(() =>
    defaultCompensationValues(today()),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const failure = await postCompensationAction({
        action: "setCompensation",
        userId: employeeId,
        ...compensationInput(values),
      });
      if (failure) {
        setError(t(`financeError_${failure}` as Parameters<typeof t>[0]));
        return;
      }
      router.push(
        `/admin/users/${encodeURIComponent(employeeId)}/edit?tab=compensation&saved=compensation`,
      );
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <form className="form-grid" onSubmit={submit}>
        <CompensationFields
          values={values}
          onChange={(change) =>
            setValues((current) => ({ ...current, ...change }))
          }
        />
        <div className="form-wide actions">
          <button className="button" disabled={busy}>
            {t("saveCompensation")}
          </button>
        </div>
        {error && <p className="form-wide notice notice-error">{error}</p>}
      </form>
    </section>
  );
}
