export type UserRole =
  "employee" | "consultant" | "manager" | "accountant" | "admin";
export type UserStatus = "active" | "inactive";
export type CompensationModel = "flexible" | "fixed";
export type FinanceDirection = "income" | "expense";
export type FinanceFunding = "company" | "consultant";
export type TimesheetStatus =
  "draft" | "submitted" | "approved" | "rejected" | "reopened";
export type TimeCategory =
  | "work"
  | "overtime"
  | "vacation"
  | "parental_leave"
  | "sick_leave"
  | "care_leave"
  | "unpaid_leave"
  | "compensatory_leave"
  | "holiday"
  | "other";

export interface PortalUser {
  id: string;
  organizationId: string;
  employeeNumber: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  managerId: string | null;
  reportsTime: boolean;
  employmentStartDate: string | null;
  employmentEndDate: string | null;
  reportingStartDate: string | null;
  timezone: "Europe/Stockholm";
  locale: "sv-SE" | "en-SE";
  compensationModel?: CompensationModel | null;
}

export interface CompensationAgreement {
  id: string;
  organizationId: string;
  userId: string;
  model: CompensationModel;
  validFrom: string;
  validTo: string | null;
  shareBps: number;
  fixedMonthlySalaryMinor: number | null;
}

export interface FinanceCategory {
  id: string;
  organizationId: string;
  code: string;
  name: { sv: string; en: string };
  direction: FinanceDirection;
  active: boolean;
}

export interface FinanceCustomer {
  id: string;
  organizationId: string;
  name: string;
  contactPerson: string;
  financeEmail: string;
}

export interface Invoice {
  id: string;
  organizationId: string;
  invoiceNumber: string;
  consultantId: string | null;
  customerId: string;
  customerName: string;
  customerContactPerson: string;
  customerFinanceEmail: string;
  issueDate: string;
  dueDate: string;
  paidDate: string | null;
  status: "issued" | "paid" | "void";
  currency: "SEK";
  netMinor: number;
  vatRateBps: number;
  vatMinor: number;
  grossMinor: number;
  compensationModel: CompensationModel | null;
  shareBps: number;
  visibleDescription: string;
  internalNote: string;
}

export interface FinancialTransaction {
  id: string;
  organizationId: string;
  direction: FinanceDirection;
  categoryId: string;
  consultantId: string | null;
  invoiceId: string | null;
  date: string;
  currency: "SEK";
  netMinor: number;
  vatRateBps: number;
  vatMinor: number;
  grossMinor: number;
  funding: FinanceFunding | null;
  consultantBalanceDeltaMinor: number;
  visibleDescription: string;
  internalNote: string;
  status: "posted" | "reversal";
  reversesTransactionId: string | null;
  reversedByTransactionId: string | null;
  importKey: string | null;
}

export interface TimeCode {
  id: string;
  organizationId: string;
  code: string;
  name: { sv: string; en: string };
  category: TimeCategory;
  requiresComment: boolean;
  countsAsWorkedTime: boolean;
  countsTowardExpectedTime: boolean;
  employeeCanSelect: boolean;
  assignedUserId?: string | null;
  active: boolean;
  validFrom: string;
  validTo: string | null;
  sortOrder: number;
  hourlyRate?: number;
}

export interface TimeCodeSnapshot {
  code: string;
  name: string;
  category: TimeCategory;
  countsAsWorkedTime: boolean;
  countsTowardExpectedTime: boolean;
  hourlyRate?: number;
}

export interface TimeEntry {
  id: string;
  organizationId: string;
  timesheetId: string;
  userId: string;
  date: string;
  isoYear: number;
  isoWeek: number;
  part?: number;
  partCount?: number;
  year: number;
  month: number;
  timeCodeId: string;
  timeCodeSnapshot: TimeCodeSnapshot;
  minutes: number;
  comment: string | null;
  projectId: string | null;
}

export interface TimesheetTotals {
  expectedMinutes: number;
  reportedMinutes: number;
  workedMinutes: number;
  absenceMinutes: number;
}

export interface Timesheet extends TimesheetTotals {
  id: string;
  organizationId: string;
  userId: string;
  managerId: string | null;
  isoYear: number;
  isoWeek: number;
  part?: number;
  partCount?: number;
  periodStart: string;
  periodEnd: string;
  status: TimesheetStatus;
  rejectionReason: string | null;
  version: number;
}

export interface ApprovalEvent {
  organizationId: string;
  timesheetId: string;
  userId: string;
  action: "submitted" | "approved" | "rejected" | "reopened" | "resubmitted";
  fromStatus: TimesheetStatus;
  toStatus: TimesheetStatus;
  comment: string | null;
  performedBy: string;
  timesheetVersion: number;
}
