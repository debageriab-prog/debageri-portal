"use client";

import { useEffect, useEffectEvent } from "react";
import type { FinanceExtraction } from "@/domain/ai";
import { appCheckFetch } from "@/lib/firebase/client";

/** An email from the finance mailbox that a new record is made from. */
export type IncomingEmailSource = {
  id: string;
  subject: string;
  from: string;
  extraction: FinanceExtraction | null;
  attachments: { id: string; name: string; contentType: string }[];
};

/**
 * Downloads the email's files so they are uploaded with the new record, then
 * hands them over, with `failed` set when they could not all be fetched.
 */
export function useIncomingEmailPrefill(
  email: IncomingEmailSource | undefined,
  onLoaded: (files: File[], failed: boolean) => void,
) {
  const loaded = useEffectEvent(onLoaded);
  useEffect(() => {
    if (!email) return;
    let active = true;
    void Promise.all(
      email.attachments.map(async (attachment) => {
        const response = await appCheckFetch(
          `/api/finance/incoming-emails/${encodeURIComponent(email.id)}/attachments/${encodeURIComponent(attachment.id)}`,
        );
        if (!response.ok) throw new Error("incomingEmailFileUnavailable");
        return new File([await response.blob()], attachment.name, {
          type: attachment.contentType,
        });
      }),
    )
      .then((files) => {
        if (active) loaded(files, false);
      })
      .catch(() => {
        if (active) loaded([], true);
      });
    return () => {
      active = false;
    };
  }, [email]);
}
