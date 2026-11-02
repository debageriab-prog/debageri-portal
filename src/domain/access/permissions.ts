import type { DocumentAccess, FinanceAccess, UserRole } from "@/domain/types";

export const PERMISSION_KEYS = [
  "finance.ledger.view",
  "finance.ledger.edit",
  "finance.ledger.import",
  "finance.ledger.export",
  "finance.invoices.view",
  "finance.invoices.edit",
  "finance.invoices.import",
  "finance.customers.view",
  "finance.customers.edit",
  "finance.categories.view",
  "finance.categories.edit",
  "finance.vat.view",
  "finance.vat.edit",
  "finance.compensation.view",
  "finance.compensation.edit",
  "finance.accountingEmail",
  "finance.aiExtraction",
  "time.reports.view",
  "time.reports.viewIncome",
  "time.approvals.review",
  "time.reminders.view",
  "time.reminders.send",
  "time.reminders.schedule",
  "documents.contracts.view",
  "documents.contracts.edit",
  "documents.payslips.view",
  "documents.payslips.edit",
  "documents.receipts.review",
  "documents.receipts.book",
  "my.finance",
  "my.invoices",
  "my.contracts",
  "my.payslips",
  "my.receipts",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type PermissionNode = {
  key: PermissionKey;
  children?: PermissionNode[];
};
export type PermissionGroup = {
  id: "finance" | "time" | "documents" | "my";
  nodes: PermissionNode[];
};
export type ProfileAudience = "consultant" | "staff";

export const PERMISSION_TREE: PermissionGroup[] = [
  {
    id: "finance",
    nodes: [
      {
        key: "finance.ledger.view",
        children: [
          { key: "finance.ledger.edit" },
          { key: "finance.ledger.import" },
          { key: "finance.ledger.export" },
        ],
      },
      {
        key: "finance.invoices.view",
        children: [
          { key: "finance.invoices.edit" },
          { key: "finance.invoices.import" },
        ],
      },
      {
        key: "finance.customers.view",
        children: [{ key: "finance.customers.edit" }],
      },
      {
        key: "finance.categories.view",
        children: [{ key: "finance.categories.edit" }],
      },
      { key: "finance.vat.view", children: [{ key: "finance.vat.edit" }] },
      {
        key: "finance.compensation.view",
        children: [{ key: "finance.compensation.edit" }],
      },
      { key: "finance.accountingEmail" },
      { key: "finance.aiExtraction" },
    ],
  },
  {
    id: "time",
    nodes: [
      {
        key: "time.reports.view",
        children: [{ key: "time.reports.viewIncome" }],
      },
      { key: "time.approvals.review" },
      {
        key: "time.reminders.view",
        children: [
          { key: "time.reminders.send" },
          { key: "time.reminders.schedule" },
        ],
      },
    ],
  },
  {
    id: "documents",
    nodes: [
      {
        key: "documents.contracts.view",
        children: [{ key: "documents.contracts.edit" }],
      },
      {
        key: "documents.payslips.view",
        children: [{ key: "documents.payslips.edit" }],
      },
      {
        key: "documents.receipts.review",
        children: [{ key: "documents.receipts.book" }],
      },
    ],
  },
  {
    id: "my",
    nodes: [
      { key: "my.finance" },
      { key: "my.invoices" },
      { key: "my.contracts" },
      { key: "my.payslips" },
      { key: "my.receipts" },
    ],
  },
];

const parents = new Map<PermissionKey, PermissionKey>();
function indexParents(nodes: PermissionNode[]) {
  for (const node of nodes) {
    for (const child of node.children ?? []) parents.set(child.key, node.key);
    indexParents(node.children ?? []);
  }
}
PERMISSION_TREE.forEach((group) => indexParents(group.nodes));

/** Finance and contract records of one's own only exist for consultants. */
const consultantOnly: readonly PermissionKey[] = [
  "my.finance",
  "my.invoices",
  "my.contracts",
];

export function permissionsForAudience(audience: ProfileAudience) {
  return PERMISSION_KEYS.filter((key) =>
    audience === "consultant"
      ? key.startsWith("my.")
      : !consultantOnly.includes(key),
  );
}

export function audienceForRole(role: string): ProfileAudience | null {
  if (role === "consultant" || role === "employee") return "consultant";
  return role === "manager" || role === "accountant" ? "staff" : null;
}

export function parentOf(key: PermissionKey) {
  return parents.get(key) ?? null;
}

export function isPermissionKey(value: unknown): value is PermissionKey {
  return (PERMISSION_KEYS as readonly unknown[]).includes(value);
}

/**
 * Drops unknown keys and anything outside the audience, and adds every parent
 * of what remains so that an action never exists without its view.
 */
export function normalizePermissions(
  keys: readonly unknown[],
  audience: ProfileAudience,
): PermissionKey[] {
  const allowed = permissionsForAudience(audience);
  const selected = new Set<PermissionKey>();
  for (const key of keys) {
    let current = isPermissionKey(key) ? key : null;
    while (current && allowed.includes(current)) {
      selected.add(current);
      current = parentOf(current);
    }
  }
  return PERMISSION_KEYS.filter((key) => selected.has(key));
}

export function can(
  user: { permissions: readonly PermissionKey[] },
  key: PermissionKey,
) {
  return user.permissions.includes(key);
}

type Holder = { permissions: readonly PermissionKey[] };

const ORGANIZATION_FINANCE_PAGES: Array<[PermissionKey, string]> = [
  ["finance.ledger.view", "/finance"],
  ["finance.invoices.view", "/finance?section=invoices"],
  ["finance.vat.view", "/finance/vat-settlements"],
  ["finance.categories.view", "/finance?section=categories"],
  ["finance.customers.view", "/finance?section=customers"],
];

/** Where someone with company finance access lands, or null without any. */
export function financeHome(user: Holder) {
  return (
    ORGANIZATION_FINANCE_PAGES.find(([key]) => can(user, key))?.[1] ?? null
  );
}

export const hasOrganizationFinance = (user: Holder) =>
  financeHome(user) !== null;

export const FINANCE_ENTITY_PERMISSIONS = {
  transaction: { view: "finance.ledger.view", edit: "finance.ledger.edit" },
  invoice: { view: "finance.invoices.view", edit: "finance.invoices.edit" },
  vatSettlement: { view: "finance.vat.view", edit: "finance.vat.edit" },
} as const satisfies Record<
  string,
  { view: PermissionKey; edit: PermissionKey }
>;

const FALLBACK_PAGES: Array<[PermissionKey, string]> = [
  ["my.finance", "/finance"],
  ["my.invoices", "/finance?section=invoices"],
  ["documents.contracts.view", "/documents/contracts"],
  ["my.contracts", "/documents/contracts"],
  ["documents.payslips.view", "/documents/payslips"],
  ["my.payslips", "/documents/payslips"],
  ["documents.receipts.review", "/receipts"],
  ["my.receipts", "/receipts"],
  ["time.reminders.view", "/reminders"],
];

export function homePath(user: Holder & { reportsTime: boolean }) {
  if (can(user, "time.approvals.review")) return "/manager/approvals";
  if (can(user, "time.reports.view")) return "/time-reports";
  if (user.reportsTime) return "/employee/timesheets/current";
  return (
    financeHome(user) ??
    FALLBACK_PAGES.find(([key]) => can(user, key))?.[1] ??
    "/unauthorized"
  );
}

const managerPermissions: PermissionKey[] = [
  "time.reports.view",
  "time.reports.viewIncome",
  "time.approvals.review",
  "time.reminders.view",
  "time.reminders.send",
  "time.reminders.schedule",
  "documents.contracts.view",
  "documents.contracts.edit",
];

const accountantPermissions: PermissionKey[] = [
  "finance.ledger.view",
  "finance.ledger.edit",
  "finance.ledger.import",
  "finance.ledger.export",
  "finance.invoices.view",
  "finance.invoices.edit",
  "finance.invoices.import",
  "finance.customers.view",
  "finance.customers.edit",
  "finance.categories.view",
  "finance.vat.view",
  "finance.vat.edit",
  "finance.compensation.view",
  "finance.accountingEmail",
  "finance.aiExtraction",
  "time.reports.view",
  "time.reports.viewIncome",
  "time.reminders.view",
  "time.reminders.send",
  "time.reminders.schedule",
  "documents.contracts.view",
  "documents.payslips.view",
  "documents.payslips.edit",
  "documents.receipts.review",
  "documents.receipts.book",
];

/** The profiles that reproduce what each role could do before profiles. */
export const DEFAULT_PROFILES = [
  {
    defaultForRole: "manager",
    name: "Manager",
    audience: "staff",
    permissions: managerPermissions,
  },
  {
    defaultForRole: "accountant",
    name: "Accountant",
    audience: "staff",
    permissions: accountantPermissions,
  },
  {
    defaultForRole: "consultant",
    name: "Consultant",
    audience: "consultant",
    permissions: permissionsForAudience("consultant"),
  },
] as const satisfies ReadonlyArray<{
  defaultForRole: UserRole;
  name: string;
  audience: ProfileAudience;
  permissions: readonly PermissionKey[];
}>;

/** What a user without a profile may do, derived from the flags they carry. */
export function legacyPermissions(
  role: string,
  financeAccess?: Partial<FinanceAccess> | null,
  documentAccess?: Partial<DocumentAccess> | null,
): PermissionKey[] {
  if (role === "admin") return [...PERMISSION_KEYS];
  if (role === "accountant") return accountantPermissions;
  const keys: PermissionKey[] =
    role === "manager" ? [...managerPermissions] : [];
  if (role === "consultant") {
    if (financeAccess?.enabled && financeAccess.myFinance)
      keys.push("my.finance");
    if (financeAccess?.enabled && financeAccess.myInvoices)
      keys.push("my.invoices");
    if (documentAccess?.contracts) keys.push("my.contracts");
  }
  if (["employee", "consultant", "manager"].includes(role)) {
    if (documentAccess?.payslips) keys.push("my.payslips");
    if (documentAccess?.receipts) keys.push("my.receipts");
  }
  return keys;
}

export type StoredProfile = {
  organizationId: string;
  audience: ProfileAudience;
  permissions: readonly unknown[];
};

/**
 * Admins hold everything. Otherwise an assigned profile decides, and one that
 * is missing, foreign or for the wrong audience grants nothing. Users not yet
 * assigned a profile keep what their flags allowed.
 */
export function resolvePermissions(
  user: {
    role: string;
    organizationId: string;
    accessProfileId?: string | null;
    financeAccess?: Partial<FinanceAccess> | null;
    documentAccess?: Partial<DocumentAccess> | null;
  },
  profile: StoredProfile | null,
): PermissionKey[] {
  if (user.role === "admin") return [...PERMISSION_KEYS];
  if (!user.accessProfileId)
    return legacyPermissions(
      user.role,
      user.financeAccess,
      user.documentAccess,
    );
  const audience = audienceForRole(user.role);
  if (
    !profile ||
    !audience ||
    profile.organizationId !== user.organizationId ||
    profile.audience !== audience
  )
    return [];
  return normalizePermissions(profile.permissions, audience);
}
