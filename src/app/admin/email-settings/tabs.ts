/** Shared by the server page and the client tabs, so not in a client module. */
export type EmailSettingsTab =
  "smtp" | "notifications" | "templates" | "accounting" | "incoming";

export const EMAIL_SETTINGS_TABS: EmailSettingsTab[] = [
  "smtp",
  "notifications",
  "templates",
  "accounting",
  "incoming",
];
