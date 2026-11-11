"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import {
  canCancelHandover,
  canChangeHolder,
  canDeleteAsset,
  canIssueHandover,
  canRetire,
  canReturnHandover,
  canSell,
} from "@/domain/assets";
import { appCheckFetch } from "@/lib/firebase/client";
import { assetErrorKey } from "./AssetForm";
import type { AssetItem } from "./asset-types";

/** What a menu action did, for the notice on the register. */
export type AssetActionResult = "returned" | "removed" | "cancelled";

/** Room the menu needs below the button before it opens upwards instead. */
const MENU_HEIGHT = 340;

/**
 * The ⋮ button on a register row: hand over, return, sell and the other
 * actions for one asset, with the confirmations they need.
 */
export function AssetActionsMenu({
  asset,
  othersOnReceipt,
  onDone,
}: {
  asset: AssetItem;
  /** Other assets on the same open receipt; they come back with this one. */
  othersOnReceipt: number;
  onDone: (result: AssetActionResult) => void;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  /** The receipt is closed: given back, or cancelled before it was signed. */
  const [closing, setClosing] = useState<"return" | "cancel" | null>(null);
  const [removing, setRemoving] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const phrase = t("attachmentDeleteConfirmationPhrase");
  const id = encodeURIComponent(asset.id);
  const receipt =
    asset.activeHandoverId && asset.handoverStatus
      ? { id: asset.activeHandoverId, status: asset.handoverStatus }
      : null;
  const canReturn = receipt !== null && canReturnHandover(receipt);
  const canCancel = receipt !== null && canCancelHandover(receipt);

  useEffect(() => {
    if (!position) return;
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : event.type !== "mousedown" ||
            !(
              anchorRef.current?.contains(event.target as Node) ||
              menuRef.current?.contains(event.target as Node)
            )
      )
        setPosition(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [position]);

  function toggle() {
    if (position) return setPosition(null);
    // The table scrolls sideways and would clip the menu, so it is drawn on
    // the page body, next to the button.
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const right = document.documentElement.clientWidth - rect.right;
    setPosition(
      rect.bottom + MENU_HEIGHT > document.documentElement.clientHeight
        ? {
            right,
            bottom: document.documentElement.clientHeight - rect.top + 8,
          }
        : { right, top: rect.bottom + 8 },
    );
  }

  function open(dialog: "return" | "cancel" | "remove") {
    setPosition(null);
    setError("");
    setConfirmation("");
    if (dialog === "remove") setRemoving(true);
    else setClosing(dialog);
  }

  async function send(url: string, init: RequestInit) {
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(url, init);
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(t(assetErrorKey(result.error)));
        return false;
      }
      return true;
    } catch {
      setError(t("serverUnavailable"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function closeReceipt() {
    if (!receipt || !closing) return;
    const ok = await send(
      `/api/assets/handovers/${encodeURIComponent(receipt.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          closing === "return"
            ? { action: "return", location: "" }
            : { action: "cancel" },
        ),
      },
    );
    if (!ok) return;
    setClosing(null);
    onDone(closing === "return" ? "returned" : "cancelled");
    router.refresh();
  }

  async function removeAsset() {
    const ok = await send(`/api/assets/${id}`, { method: "DELETE" });
    if (!ok) return;
    setRemoving(false);
    onDone("removed");
    router.refresh();
  }

  const removable = canDeleteAsset(asset);

  return (
    <>
      <div className="more-anchor" ref={anchorRef}>
        <button
          type="button"
          className="table-action icon-action"
          aria-haspopup="menu"
          aria-expanded={position !== null}
          aria-label={t("assetMoreActions")}
          title={t("assetMoreActions")}
          onClick={toggle}
        >
          <ActionIcon type="more" />
        </button>
        {position &&
          createPortal(
            <div
              ref={menuRef}
              className="more-menu more-menu-floating"
              role="menu"
              style={position}
            >
              {canIssueHandover(asset) && (
                <Link
                  role="menuitem"
                  href={`/assets/handovers/new?assetId=${id}`}
                >
                  {t("handoverNew")}
                </Link>
              )}
              {canReturn && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => open("return")}
                >
                  {t("assetReturnToCompany")}
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => open("cancel")}
                >
                  {t("assetCancelReceipt")}
                </button>
              )}
              {asset.activeHandoverId && (
                <Link
                  role="menuitem"
                  href={`/assets/handovers/${encodeURIComponent(asset.activeHandoverId)}`}
                >
                  {t("handoverOpen")}
                </Link>
              )}
              {canChangeHolder(asset) && (
                <Link role="menuitem" href={`/assets/${id}/holder`}>
                  {t("assetChangeHolder")}
                </Link>
              )}
              {canSell(asset) && (
                <Link role="menuitem" href={`/assets/${id}/sell`}>
                  {t("assetSell")}
                </Link>
              )}
              {canRetire(asset) && (
                <Link role="menuitem" href={`/assets/${id}/retire`}>
                  {t("assetRetire")}
                </Link>
              )}
              <button
                type="button"
                role="menuitem"
                className="more-menu-danger"
                disabled={!removable}
                title={removable ? undefined : t("assetRemoveBlocked")}
                onClick={() => open("remove")}
              >
                {t("assetRemove")}
              </button>
            </div>,
            document.body,
          )}
      </div>
      {removing &&
        createPortal(
          <div className="modal-backdrop" role="presentation">
            <section
              className="modal modal-small"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={`asset-remove-title-${asset.id}`}
            >
              <header className="modal-header">
                <div>
                  <h2 id={`asset-remove-title-${asset.id}`}>
                    {t("assetRemoveTitle")}
                  </h2>
                  <p>
                    {t("assetRemoveQuestion").replace("{name}", asset.name)}
                  </p>
                </div>
                <button
                  className="modal-close"
                  type="button"
                  aria-label={t("close")}
                  onClick={() => setRemoving(false)}
                >
                  ×
                </button>
              </header>
              <label>
                {t("typeAttachmentDeleteConfirmation").replace(
                  "{phrase}",
                  phrase,
                )}
                <input
                  className="field"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </label>
              {error && (
                <p className="notice notice-error" role="alert">
                  {error}
                </p>
              )}
              <footer className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setRemoving(false)}
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  className="button danger"
                  disabled={busy || confirmation.trim() !== phrase}
                  onClick={() => void removeAsset()}
                >
                  {busy ? t("saving") : t("assetRemove")}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
      {closing &&
        createPortal(
          <div className="modal-backdrop" role="presentation">
            <section
              className="modal modal-small"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={`asset-return-title-${asset.id}`}
            >
              <header className="modal-header">
                <div>
                  <h2 id={`asset-return-title-${asset.id}`}>
                    {t(
                      closing === "return"
                        ? "assetReturnTitle"
                        : "assetCancelReceiptTitle",
                    )}
                  </h2>
                  <p>
                    {t(
                      closing === "return"
                        ? "assetReturnQuestion"
                        : "assetCancelReceiptQuestion",
                    ).replace("{name}", asset.holder.name)}
                  </p>
                  {othersOnReceipt > 0 && (
                    <p>
                      {t(
                        closing === "return"
                          ? "assetReturnOthers"
                          : "assetCancelReceiptOthers",
                      ).replace("{count}", String(othersOnReceipt))}
                    </p>
                  )}
                </div>
                <button
                  className="modal-close"
                  type="button"
                  aria-label={t("close")}
                  onClick={() => setClosing(null)}
                >
                  ×
                </button>
              </header>
              {error && (
                <p className="notice notice-error" role="alert">
                  {error}
                </p>
              )}
              <footer className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setClosing(null)}
                >
                  {t(closing === "cancel" ? "close" : "cancel")}
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => void closeReceipt()}
                >
                  {busy
                    ? t("saving")
                    : t(
                        closing === "return"
                          ? "assetReturnToCompany"
                          : "assetCancelReceipt",
                      )}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
