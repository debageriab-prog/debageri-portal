export type UserRole = "employee" | "manager" | "admin";
export type UserStatus = "active" | "inactive";
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
  timezone: "Europe/Stockholm";
  locale: "sv-SE" | "en-SE";
}

export interface WeeklySchedule {
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
}

export interface EmploymentTerm {
  id: string;
  organizationId: string;
  userId: string;
  validFrom: string;
  validTo: string | null;
  reportingStartDate?: string;
  employmentPercentage: number;
  weeklyMinutes: number;
  schedule: WeeklySchedule;
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
