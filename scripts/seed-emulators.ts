import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getIsoWeekDates, timesheetId } from "../src/lib/dates/iso-week";

if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
) {
  throw new Error("Seed may run only against Firebase emulators");
}
const projectId = "debageri-portal-local";
const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);
const users = [
  {
    uid: "admin-demo",
    email: "admin@portal.local",
    displayName: "Erik Lind",
    employeeNumber: "DB-001",
    role: "admin",
    managerId: null,
  },
  {
    uid: "manager-demo",
    email: "manager@portal.local",
    displayName: "Maria Holm",
    employeeNumber: "DB-002",
    role: "manager",
    managerId: "admin-demo",
  },
  {
    uid: "employee-anna",
    email: "anna@portal.local",
    displayName: "Anna Sjöberg",
    employeeNumber: "DB-004",
    role: "employee",
    managerId: "manager-demo",
  },
  {
    uid: "employee-oskar",
    email: "oskar@portal.local",
    displayName: "Oskar Berg",
    employeeNumber: "DB-005",
    role: "employee",
    managerId: "manager-demo",
  },
] as const;
const batch = db.batch();
batch.set(db.doc("organizations/debageri"), {
  name: "Debageri AB",
  timezone: "Europe/Stockholm",
  locale: "sv-SE",
  weekStartsOn: 1,
  defaultDailyMinutes: 480,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
for (const user of users) {
  try {
    await auth.createUser({
      uid: user.uid,
      email: user.email,
      password: "PortalDemo!2026",
      displayName: user.displayName,
    });
  } catch {}
  await auth.setCustomUserClaims(user.uid, {
    role: user.role,
    organizationId: "debageri",
  });
  batch.set(db.doc(`users/${user.uid}`), {
    organizationId: "debageri",
    employeeNumber: user.employeeNumber,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: "active",
    managerId: user.managerId,
    timezone: "Europe/Stockholm",
    locale: "sv-SE",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
const codeDefinitions = [
  ["REG", "Ordinarie arbetstid", "Regular work", "work", true, true, false],
  ["VAC", "Semester", "Vacation", "vacation", false, true, false],
  [
    "PARENTAL",
    "Föräldraledighet",
    "Parental leave",
    "parental_leave",
    false,
    true,
    true,
  ],
  ["SICK", "Sjukfrånvaro", "Sick leave", "sick_leave", false, true, false],
  [
    "VAB",
    "Vård av barn",
    "Care of sick child",
    "care_leave",
    false,
    true,
    true,
  ],
  [
    "UNPAID",
    "Tjänstledighet",
    "Unpaid leave",
    "unpaid_leave",
    false,
    false,
    true,
  ],
  ["OVERTIME", "Övertid", "Overtime", "overtime", true, false, true],
  [
    "COMP",
    "Kompensationsledighet",
    "Compensatory leave",
    "compensatory_leave",
    false,
    true,
    false,
  ],
] as const;
codeDefinitions.forEach(
  ([code, sv, en, category, worked, expected, comment], index) =>
    batch.set(db.doc(`timeCodes/${code}`), {
      organizationId: "debageri",
      code,
      name: { sv, en },
      category,
      requiresComment: comment,
      requiresProject: false,
      requiresApproval: true,
      countsAsWorkedTime: worked,
      countsTowardExpectedTime: expected,
      affectsVacationBalance: code === "VAC",
      employeeCanSelect: true,
      active: true,
      validFrom: "2026-01-01",
      validTo: null,
      sortOrder: index,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "admin-demo",
      updatedAt: FieldValue.serverTimestamp(),
    }),
);
for (const userId of ["employee-anna", "employee-oskar"])
  batch.set(db.doc(`employmentTerms/${userId}_2026-01-01`), {
    organizationId: "debageri",
    userId,
    validFrom: "2026-01-01",
    validTo: null,
    employmentPercentage: userId === "employee-oskar" ? 80 : 100,
    weeklyMinutes: userId === "employee-oskar" ? 1920 : 2400,
    schedule: {
      monday: 480,
      tuesday: 480,
      wednesday: 480,
      thursday: 480,
      friday: userId === "employee-oskar" ? 0 : 480,
      saturday: 0,
      sunday: 0,
    },
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "admin-demo",
  });
const dates = getIsoWeekDates(2026, 31);
for (const [index, status] of [
  "draft",
  "submitted",
  "approved",
  "rejected",
].entries()) {
  const userId = index % 2 ? "employee-oskar" : "employee-anna";
  const week = 31 - index;
  const id = timesheetId("debageri", userId, 2026, week);
  batch.set(db.doc(`timesheets/${id}`), {
    organizationId: "debageri",
    userId,
    managerId: "manager-demo",
    isoYear: 2026,
    isoWeek: week,
    periodStart: dates[0],
    periodEnd: dates[6],
    status,
    expectedMinutes: userId === "employee-oskar" ? 1920 : 2400,
    reportedMinutes:
      status === "draft" ? 480 : userId === "employee-oskar" ? 1920 : 2400,
    workedMinutes:
      status === "draft" ? 480 : userId === "employee-oskar" ? 1920 : 2280,
    absenceMinutes:
      status === "draft" ? 0 : userId === "employee-oskar" ? 0 : 120,
    rejectionReason:
      status === "rejected" ? "Kontrollera fredagens registrering." : null,
    version: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
await batch.commit();
console.log(
  `Seeded ${users.length} local users and portal demo data at ${Timestamp.now().toDate().toISOString()}`,
);
