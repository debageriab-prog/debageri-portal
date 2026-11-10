import type { UserRole } from "@/domain/types";

export const PERMISSION_KEYS = [
  "finance.ledger.view",
  "finance.ledger.add",
  "finance.ledger.edit",
  "finance.ledger.delete",
  "finance.ledger.import",
  "finance.ledger.export",
  "finance.overview.export",
  "finance.invoices.view",
  "finance.invoices.add",
  "finance.invoices.edit",
  "finance.invoices.delete",
  "finance.invoices.import",
  "finance.invoices.send",
  "finance.articles.view",
  "finance.articles.add",
  "finance.articles.edit",
  "finance.customers.view",
  "finance.customers.add",
  "finance.customers.edit",
  "finance.categories.view",
  "finance.categories.add",
  "finance.categories.edit",
  "finance.vat.view",
  "finance.vat.add",
  "finance.vat.edit",
  "finance.vat.delete",
  "finance.salary.view",
  "finance.salary.edit",
  "finance.salary.book",
  "finance.incomingEmails.view",
  "finance.incomingEmails.process",
  "finance.accountingEmail",
  "finance.aiExtraction",
  "time.reports.view",
  "time.reports.viewIncome",
  "time.reports.export",
  "time.approvals.review",
  "time.reminders.view",
  "time.reminders.send",
  "time.reminders.schedule",
  "documents.contracts.view",
  "documents.contracts.add",
  "documents.contracts.edit",
  "documents.contracts.delete",
  "documents.payslips.view",
  "documents.payslips.upload",
  "documents.payslips.delete",
  "documents.receipts.review",
  "documents.receipts.book",
  "documents.requests.review",
  "documents.requests.book",
  "my.time.report",
  "my.time.history",
  "my.time.income",
  "my.time.export",
  "my.finance",
  "my.finance.export",
  "my.transactions",
  "my.invoices",
  "my.contracts",
  "my.payslips",
  "my.receipts",
  "my.receipts.upload",
  "my.requests",
  "my.requests.equipment",
  "my.requests.education",
  "my.requests.seminar",
  "my.requests.travel",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type PermissionNode = {
  key: PermissionKey;
  children?: PermissionNode[];
};
export type PermissionGroup = {
  id: "time" | "finance" | "documents" | "requests";
  nodes: PermissionNode[];
};
export type ProfileAudience = "consultant" | "staff";

/** Follows the portal's menu, so each group matches what people see. */
export const PERMISSION_TREE: PermissionGroup[] = [
  {
    id: "time",
    nodes: [
      { key: "my.time.report" },
      {
        key: "my.time.history",
        children: [{ key: "my.time.income" }, { key: "my.time.export" }],
      },
      {
        key: "time.reports.view",
        children: [
          { key: "time.reports.viewIncome" },
          { key: "time.reports.export" },
        ],
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
    id: "finance",
    nodes: [
      { key: "my.finance", children: [{ key: "my.finance.export" }] },
      { key: "my.transactions" },
      { key: "my.invoices" },
      {
        key: "finance.ledger.view",
        children: [
          { key: "finance.ledger.add" },
          { key: "finance.ledger.edit" },
          { key: "finance.ledger.delete" },
          { key: "finance.ledger.import" },
          { key: "finance.ledger.export" },
          { key: "finance.overview.export" },
        ],
      },
      {
        key: "finance.invoices.view",
        children: [
          { key: "finance.invoices.add" },
          { key: "finance.invoices.edit" },
          { key: "finance.invoices.delete" },
          { key: "finance.invoices.import" },
          { key: "finance.invoices.send" },
        ],
      },
      {
        key: "finance.articles.view",
        children: [
          { key: "finance.articles.add" },
          { key: "finance.articles.edit" },
        ],
      },
      {
        key: "finance.vat.view",
        children: [
          { key: "finance.vat.add" },
          { key: "finance.vat.edit" },
          { key: "finance.vat.delete" },
        ],
      },
      {
        key: "finance.salary.view",
        children: [
          { key: "finance.salary.edit" },
          { key: "finance.salary.book" },
        ],
      },
      {
        key: "finance.incomingEmails.view",
        children: [{ key: "finance.incomingEmails.process" }],
      },
      {
        key: "finance.categories.view",
        children: [
          { key: "finance.categories.add" },
          { key: "finance.categories.edit" },
        ],
      },
      {
        key: "finance.customers.view",
        children: [
          { key: "finance.customers.add" },
          { key: "finance.customers.edit" },
        ],
      },
      { key: "finance.accountingEmail" },
      { key: "finance.aiExtraction" },
    ],
  },
  {
    id: "documents",
    nodes: [
      { key: "my.contracts" },
      { key: "my.payslips" },
      {
        key: "documents.contracts.view",
        children: [
          { key: "documents.contracts.add" },
          { key: "documents.contracts.edit" },
          { key: "documents.contracts.delete" },
        ],
      },
      {
        key: "documents.payslips.view",
        children: [
          { key: "documents.payslips.upload" },
          { key: "documents.payslips.delete" },
        ],
      },
    ],
  },
  {
    id: "requests",
    nodes: [
      {
        key: "my.requests",
        children: [
          { key: "my.requests.equipment" },
          { key: "my.requests.education" },
          { key: "my.requests.seminar" },
          { key: "my.requests.travel" },
        ],
      },
      {
        key: "documents.requests.review",
        children: [{ key: "documents.requests.book" }],
      },
      { key: "my.receipts", children: [{ key: "my.receipts.upload" }] },
      {
        key: "documents.receipts.review",
        children: [{ key: "documents.receipts.book" }],
      },
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
  "my.finance.export",
  "my.transactions",
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

function descendantsOf(key: PermissionKey): PermissionKey[] {
  const find = (nodes: PermissionNode[]): PermissionNode | undefined =>
    nodes
      .flatMap((node) => [node, find(node.children ?? [])])
      .find((node) => node?.key === key);
  const collect = (node?: PermissionNode): PermissionKey[] =>
    (node?.children ?? []).flatMap((child) => [child.key, ...collect(child)]);
  return collect(
    PERMISSION_TREE.map((group) => find(group.nodes)).find(Boolean),
  );
}

/**
 * Rows whose children are all ticked along with them, because the row on its
 * own grants nothing useful. Each child can still be unticked afterwards.
 */
const TICKS_CHILDREN: readonly PermissionKey[] = ["my.requests"];

/**
 * Ticking adds the parents (and, for `TICKS_CHILDREN`, the children);
 * unticking also clears everything underneath.
 */
export function togglePermission(
  selected: readonly PermissionKey[],
  key: PermissionKey,
  checked: boolean,
  audience: ProfileAudience,
) {
  if (checked)
    return normalizePermissions(
      [
        ...selected,
        key,
        ...(TICKS_CHILDREN.includes(key) ? descendantsOf(key) : []),
      ],
      audience,
    );
  const removed = new Set([key, ...descendantsOf(key)]);
  return selected.filter((item) => !removed.has(item));
}

/** The tree an audience can be granted, without branches it cannot hold. */
export function permissionTreeFor(audience: ProfileAudience) {
  const allowed = permissionsForAudience(audience);
  const prune = (nodes: PermissionNode[]): PermissionNode[] =>
    nodes
      .filter((node) => allowed.includes(node.key))
      .map((node) =>
        node.children
          ? { ...node, children: prune(node.children) }
          : { key: node.key },
      );
  return PERMISSION_TREE.map((group) => ({
    ...group,
    nodes: prune(group.nodes),
  })).filter((group) => group.nodes.length > 0);
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
  ["finance.salary.view", "/finance/salaries"],
  ["finance.incomingEmails.view", "/finance/incoming-emails"],
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
  transaction: {
    view: "finance.ledger.view",
    add: "finance.ledger.add",
    edit: "finance.ledger.edit",
  },
  invoice: {
    view: "finance.invoices.view",
    add: "finance.invoices.add",
    edit: "finance.invoices.edit",
  },
  vatSettlement: {
    view: "finance.vat.view",
    add: "finance.vat.add",
    edit: "finance.vat.edit",
  },
} as const satisfies Record<
  string,
  { view: PermissionKey; add: PermissionKey; edit: PermissionKey }
>;

const FALLBACK_PAGES: Array<[PermissionKey, string]> = [
  ["my.time.history", "/employee/timesheets"],
  ["my.finance", "/finance"],
  ["my.transactions", "/finance?section=transactions"],
  ["my.invoices", "/finance?section=invoices"],
  ["documents.contracts.view", "/documents/contracts"],
  ["my.contracts", "/documents/contracts"],
  ["documents.payslips.view", "/documents/payslips"],
  ["my.payslips", "/documents/payslips"],
  ["documents.receipts.review", "/receipts"],
  ["my.receipts", "/receipts"],
  ["documents.requests.review", "/requests"],
  ["my.requests", "/requests"],
  ["time.reminders.view", "/reminders"],
];

type Reporter = Holder & { reportsTime: boolean };

/** Being expected to report is set per person; the profile opens the pages. */
export const canReportTime = (user: Reporter) =>
  user.reportsTime && can(user, "my.time.report");
export const canViewOwnHistory = (user: Reporter) =>
  user.reportsTime && can(user, "my.time.history");

export function homePath(user: Reporter) {
  if (can(user, "time.approvals.review")) return "/manager/approvals";
  if (can(user, "time.reports.view")) return "/time-reports";
  if (canReportTime(user)) return "/employee/timesheets/current";
  return (
    financeHome(user) ??
    FALLBACK_PAGES.find(
      ([key]) =>
        can(user, key) && (!key.startsWith("my.time.") || user.reportsTime),
    )?.[1] ??
    "/unauthorized"
  );
}

const ownTimePermissions: PermissionKey[] = [
  "my.time.report",
  "my.time.history",
  "my.time.income",
  "my.time.export",
];

const managerPermissions: PermissionKey[] = [
  "time.reports.view",
  "time.reports.viewIncome",
  "time.reports.export",
  "time.approvals.review",
  "time.reminders.view",
  "time.reminders.send",
  "time.reminders.schedule",
  "documents.contracts.view",
  "documents.contracts.add",
  "documents.contracts.edit",
  "documents.contracts.delete",
  "documents.requests.review",
  "documents.requests.book",
  ...ownTimePermissions,
];

const accountantPermissions: PermissionKey[] = [
  "finance.ledger.view",
  "finance.ledger.add",
  "finance.ledger.edit",
  "finance.ledger.delete",
  "finance.ledger.import",
  "finance.ledger.export",
  "finance.overview.export",
  "finance.invoices.view",
  "finance.invoices.add",
  "finance.invoices.edit",
  "finance.invoices.delete",
  "finance.invoices.import",
  "finance.invoices.send",
  "finance.articles.view",
  "finance.articles.add",
  "finance.articles.edit",
  "finance.customers.view",
  "finance.customers.add",
  "finance.customers.edit",
  "finance.categories.view",
  "finance.vat.view",
  "finance.vat.add",
  "finance.vat.edit",
  "finance.vat.delete",
  "finance.salary.view",
  "finance.salary.edit",
  "finance.salary.book",
  "finance.incomingEmails.view",
  "finance.incomingEmails.process",
  "finance.accountingEmail",
  "finance.aiExtraction",
  "time.reports.view",
  "time.reports.viewIncome",
  "time.reports.export",
  "time.reminders.view",
  "time.reminders.send",
  "time.reminders.schedule",
  "documents.contracts.view",
  "documents.payslips.view",
  "documents.payslips.upload",
  "documents.payslips.delete",
  "documents.receipts.review",
  "documents.receipts.book",
  "documents.requests.review",
  "documents.requests.book",
  ...ownTimePermissions,
];

/** Admins do everything for the company and have no own records to open. */
const ADMIN_PERMISSIONS = PERMISSION_KEYS.filter(
  (key) => !key.startsWith("my."),
);

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

export type StoredProfile = {
  organizationId: string;
  audience: ProfileAudience;
  permissions: readonly unknown[];
};

/**
 * Admins hold everything. Otherwise the assigned profile decides, and no
 * profile, or one that is missing, foreign or for the wrong audience, grants
 * nothing.
 */
export function resolvePermissions(
  user: {
    role: string;
    organizationId: string;
    accessProfileId?: string | null;
  },
  profile: StoredProfile | null,
): PermissionKey[] {
  if (user.role === "admin") return [...ADMIN_PERMISSIONS];
  const audience = audienceForRole(user.role);
  if (
    !user.accessProfileId ||
    !profile ||
    !audience ||
    profile.organizationId !== user.organizationId ||
    profile.audience !== audience
  )
    return [];
  return normalizePermissions(profile.permissions, audience);
}
