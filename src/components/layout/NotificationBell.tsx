"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  fill,
  notificationValuesFor,
  type InAppNotificationKind,
  type NotificationParams,
} from "@/domain/notifications";
import { appCheckFetch } from "@/lib/firebase/client";

type PortalNotification = {
  id: string;
  kind: InAppNotificationKind;
  params: NotificationParams;
  link: string;
  read: boolean;
  createdAt: string;
};

const REFRESH_MS = 60_000;

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 5 2 5.5 2 5.5h-15s2-.5 2-5.5Z" />
      <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

function relativeTime(iso: string, locale: string) {
  if (!iso) return "";
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps)
    if (Math.abs(seconds) >= size)
      return Math.abs(seconds) >= 7 * 86_400
        ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
            new Date(iso),
          )
        : format.format(Math.round(seconds / size), unit);
  return format.format(0, "minute");
}

export function NotificationBell() {
  const { t, locale } = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PortalNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await appCheckFetch("/api/notifications");
      if (!response.ok) throw new Error("notificationsUnavailable");
      const result = (await response.json()) as {
        notifications: PortalNotification[];
        unread: number;
      };
      setItems(result.notifications);
      setUnread(result.unread);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function markRead(body: { all: true } | { ids: string[] }) {
    const ids = "ids" in body ? new Set(body.ids) : null;
    setItems((current) =>
      current.map((item) =>
        !ids || ids.has(item.id) ? { ...item, read: true } : item,
      ),
    );
    setUnread((count) => (ids ? Math.max(0, count - ids.size) : 0));
    await appCheckFetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  }

  const badge = unread > 9 ? "9+" : String(unread);
  const label =
    unread > 0
      ? t("notificationsUnread").replace("{count}", badge)
      : t("notifications");

  return (
    <div className="notification-control" ref={ref}>
      <button
        type="button"
        className="notification-trigger"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void load();
        }}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <section
          className="notification-panel"
          role="dialog"
          aria-label={t("notifications")}
        >
          <header className="notification-panel-header">
            <strong>{t("notifications")}</strong>
            {unread > 0 && (
              <button
                type="button"
                className="notification-mark-all"
                onClick={() => void markRead({ all: true })}
              >
                {t("markAllAsRead")}
              </button>
            )}
          </header>
          {failed && !items.length ? (
            <p className="notification-empty">{t("notificationsLoadFailed")}</p>
          ) : !items.length ? (
            <p className="notification-empty">{t("noNotifications")}</p>
          ) : (
            <ul className="notification-list">
              {items.map((item) => {
                const values = notificationValuesFor(
                  item.params,
                  locale === "sv-SE" ? "sv-SE" : "en-SE",
                );
                const comment = item.params.comment?.trim();
                return (
                  <li key={item.id}>
                    <Link
                      href={
                        item.link.startsWith("/") && !item.link.startsWith("//")
                          ? item.link
                          : "/"
                      }
                      className={`notification-item${item.read ? "" : " unread"}`}
                      onClick={() => {
                        setOpen(false);
                        if (!item.read) void markRead({ ids: [item.id] });
                      }}
                    >
                      <span className="notification-text">
                        {fill(t(`notificationTitle_${item.kind}`), values)}
                      </span>
                      {comment && (
                        <span className="notification-comment">
                          {fill(t("notificationComment"), { comment })}
                        </span>
                      )}
                      <time dateTime={item.createdAt}>
                        {relativeTime(item.createdAt, locale)}
                      </time>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
