/**
 * Fills the local emulators with fictional people and records for reviewing
 * access profiles. Run with `npm run seed:local` while `npm run emulators` runs.
 * Sign in with any seeded email and the SEED_PASSWORD from `.env.local`.
 */
import { randomUUID } from "node:crypto";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  DEFAULT_PROFILES,
  type PermissionKey,
} from "@/domain/access/permissions";
import { payslipId, payslipPeriod } from "@/domain/payslips";
import { getIsoWeekDates, timesheetId } from "@/lib/dates/iso-week";

const LOCAL_PROJECT = "debageri-portal-local";
const org = "debageri";

const isLoopback = (value?: string) =>
  /^(127\.0\.0\.1|localhost):\d+$/.test(value ?? "");

function assertLocal() {
  const safe =
    process.env.PORTAL_ENVIRONMENT === "local" &&
    process.env.FIREBASE_ADMIN_PROJECT_ID === LOCAL_PROJECT &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === LOCAL_PROJECT &&
    isLoopback(process.env.FIRESTORE_EMULATOR_HOST) &&
    isLoopback(process.env.FIREBASE_AUTH_EMULATOR_HOST) &&
    isLoopback(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
  if (!safe)
    throw new Error(
      "Refusing to seed: this script only runs against the local emulators.",
    );
  if ((process.env.SEED_PASSWORD ?? "").length < 8)
    throw new Error("Set SEED_PASSWORD (8+ characters) in .env.local.");
}

assertLocal();
initializeApp({
  projectId: LOCAL_PROJECT,
  credential: applicationDefault(),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});
const auth = getAuth();
const db = getFirestore();
const bucket = getStorage().bucket();
const now = Timestamp.now();
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

const sampleProfiles: Array<{
  id: string;
  name: string;
  description: string;
  audience: "staff" | "consultant";
  permissions: PermissionKey[];
}> = [
  {
    id: "seed-finance-read-only",
    name: "Finance read-only",
    description: "Sees income, expenses and invoices but cannot change them.",
    audience: "staff",
    permissions: [
      "finance.ledger.view",
      "finance.invoices.view",
      "finance.customers.view",
      "finance.categories.view",
      "finance.vat.view",
      "finance.incomingEmails.view",
    ],
  },
  {
    id: "seed-finance-import",
    name: "Finance with import",
    description: "Can view, import and export, but not add by hand.",
    audience: "staff",
    permissions: [
      "finance.ledger.view",
      "finance.ledger.import",
      "finance.ledger.export",
      "finance.invoices.view",
      "finance.invoices.import",
    ],
  },
  {
    id: "seed-consultant-no-invoices",
    name: "Consultant without invoices",
    description: "Own data without invoices or estimated income.",
    audience: "consultant",
    permissions: [
      "my.time.report",
      "my.time.history",
      "my.finance",
      "my.transactions",
      "my.contracts",
      "my.payslips",
      "my.receipts",
      "my.receipts.upload",
    ],
  },
];

const defaultProfileId = (role: string) => `${org}_default_${role}`;
const managerProfile = defaultProfileId("manager");
const accountantProfile = defaultProfileId("accountant");
const consultantProfile = defaultProfileId("consultant");

const people = [
  ["seed-admin", "admin@debageri.test", "Alva Admin", "admin", null, false],
  [
    "seed-manager",
    "manager@debageri.test",
    "Mira Manager",
    "manager",
    managerProfile,
    true,
  ],
  [
    "seed-manager-finance",
    "manager.finance@debageri.test",
    "Felix Fors",
    "manager",
    "seed-finance-read-only",
    false,
  ],
  [
    "seed-accountant",
    "accountant@debageri.test",
    "Asta Ek",
    "accountant",
    accountantProfile,
    false,
  ],
  [
    "seed-accountant-limited",
    "accountant.limited@debageri.test",
    "Lina Berg",
    "accountant",
    "seed-finance-import",
    false,
  ],
  [
    "seed-consultant-flexible",
    "consultant.flexible@debageri.test",
    "Cleo Lind",
    "consultant",
    consultantProfile,
    true,
  ],
  [
    "seed-consultant-fixed",
    "consultant.fixed@debageri.test",
    "Noah Ström",
    "consultant",
    consultantProfile,
    true,
  ],
  [
    "seed-consultant-limited",
    "consultant.limited@debageri.test",
    "Tove Holm",
    "consultant",
    "seed-consultant-no-invoices",
    true,
  ],
  [
    "seed-manager-unassigned",
    "manager.unassigned@debageri.test",
    "Olle Dahl",
    "manager",
    null,
    false,
  ],
] as const;

async function seedPeople() {
  for (const [index, person] of people.entries()) {
    const [uid, email, displayName, role, accessProfileId, reportsTime] =
      person;
    const account = {
      email,
      displayName,
      password: process.env.SEED_PASSWORD!,
    };
    await auth
      .updateUser(uid, account)
      .catch(() => auth.createUser({ uid, ...account }));
    await db
      .collection("users")
      .doc(uid)
      .set({
        organizationId: org,
        employeeNumber: `T${String(index + 1).padStart(3, "0")}`,
        email,
        displayName,
        role,
        reportsTime,
        employmentStartDate: "2026-01-01",
        employmentEndDate: null,
        reportingStartDate: reportsTime ? "2026-01-01" : null,
        accessProfileId,
        status: "active",
        managerId: null,
        timezone: "Europe/Stockholm",
        locale: "en-SE",
        createdAt: now,
        updatedAt: now,
      });
  }
}

async function seedProfiles() {
  const batch = db.batch();
  for (const profile of DEFAULT_PROFILES)
    batch.set(
      db
        .collection("accessProfiles")
        .doc(defaultProfileId(profile.defaultForRole)),
      {
        ...profile,
        permissions: [...profile.permissions],
        organizationId: org,
        description: "",
        createdAt: now,
        updatedAt: now,
      },
    );
  for (const { id, ...profile } of sampleProfiles)
    batch.set(db.collection("accessProfiles").doc(id), {
      ...profile,
      organizationId: org,
      defaultForRole: null,
      createdAt: now,
      updatedAt: now,
    });
  await batch.commit();
}

async function seedFinance() {
  const batch = db.batch();
  batch.set(db.collection("organizations").doc(org), {
    name: "Debageri",
    financeEnabled: true,
    timezone: "Europe/Stockholm",
    createdAt: now,
    // Fictional company details for generated invoices; the numbers only
    // pass the check digits.
    invoicing: {
      legalName: "Debageri Test AB",
      addressLine: "Testgatan 1",
      postalCode: "411 01",
      city: "Göteborg",
      country: "Sverige",
      phone: "+46 31 000 00 00",
      email: "faktura@debageri.test",
      website: "",
      orgNumber: "556677-8899",
      vatNumber: "SE556677889901",
      fSkatt: true,
      bankgiro: "123-4566",
      iban: "",
      bic: "",
      bankName: "",
      paymentTermsDays: 30,
      lateInterestText: "Referensränta + 8,0 %",
      defaultOurReference: "Alva Admin",
      nextInvoiceNumber: 20,
      nextCustomerNumber: 3,
      ocrEnabled: true,
    },
  });
  const categories = [
    [
      "seed-cat-consulting",
      "consulting",
      "Consulting income",
      "Konsultintäkter",
      "income",
    ],
    ["seed-cat-equipment", "equipment", "Equipment", "Utrustning", "expense"],
    ["seed-cat-travel", "travel", "Travel", "Resor", "expense"],
  ] as const;
  for (const [id, code, en, sv, direction] of categories)
    batch.set(db.collection("financeCategories").doc(id), {
      organizationId: org,
      code,
      name: { en, sv },
      direction,
      active: true,
      createdAt: now,
      createdBy: "seed-admin",
    });
  const articles = [
    [
      "seed-article-hours-cleo",
      "2",
      "Timmar",
      "h",
      850_00,
      "seed-consultant-flexible",
    ],
    ["seed-article-hours", "1", "Konsulttimmar", "h", 1_100_00, "all"],
    ["seed-article-licence", "10", "Licens", "st", 500_00, "company"],
  ] as const;
  for (const [id, articleNumber, description, unit, price, scope] of articles)
    batch.set(db.collection("invoiceArticles").doc(id), {
      organizationId: org,
      articleNumber,
      description,
      unit,
      unitPriceMinor: price,
      consultantScope: scope,
      vatRateBps: 2500,
      validFrom: "2026-01-01",
      validTo: null,
      createdAt: now,
    });
  batch.set(db.collection("financeCustomers").doc("seed-customer"), {
    organizationId: org,
    name: "Norrsken Fiktiv AB",
    contactPerson: "Kim Exempel",
    financeEmail: "faktura@norrsken.test",
    customerNumber: "2",
    addressLine: "Exempelvägen 52",
    postalCode: "111 34",
    city: "STOCKHOLM",
    country: "Sverige",
    orgNumber: "",
    vatNumber: "",
    defaultYourReference: "Job nr 52982",
    paymentTermsDays: 30,
    invoiceLocale: "sv-SE",
    createdAt: now,
  });
  const agreements = [
    ["seed-consultant-flexible", "flexible", 7_000, null, 5_000_000],
    ["seed-consultant-fixed", "fixed", 0, 4_500_000, null],
    ["seed-consultant-limited", "flexible", 6_500, null, 3_500_000],
    // Staff the company pays: an expense with no invoice income.
    ["seed-accountant", "salaried", 0, 4_200_000, null],
  ] as const;
  for (const [userId, model, shareBps, salary, requested] of agreements) {
    batch.set(db.collection("compensationAgreements").doc(`seed-${userId}`), {
      organizationId: org,
      userId,
      model,
      validFrom: "2026-01-01",
      validTo: null,
      shareBps,
      fixedMonthlySalaryMinor: salary,
      requestedMonthlySalaryMinor: requested,
      createdAt: now,
    });
    batch.update(db.collection("users").doc(userId), {
      compensationModel: model,
      ...(model === "salaried" ? { paysSalary: true } : {}),
    });
  }
  const invoices = [
    [
      "seed-invoice-1",
      "2026-101",
      "seed-consultant-flexible",
      "flexible",
      7_000,
      "paid",
      "2026-09-30",
    ],
    [
      "seed-invoice-2",
      "2026-102",
      "seed-consultant-flexible",
      "flexible",
      7_000,
      "issued",
      null,
    ],
    [
      "seed-invoice-3",
      "2026-103",
      "seed-consultant-fixed",
      "fixed",
      0,
      "issued",
      null,
    ],
  ] as const;
  for (const [
    id,
    invoiceNumber,
    consultantId,
    model,
    shareBps,
    status,
    paidDate,
  ] of invoices)
    batch.set(db.collection("invoices").doc(id), {
      organizationId: org,
      invoiceNumber,
      consultantId,
      customerId: "seed-customer",
      customerName: "Norrsken Fiktiv AB",
      customerContactPerson: "Kim Exempel",
      customerFinanceEmail: "faktura@norrsken.test",
      visibleDescription: "Consulting services",
      internalNote: "Internal: fictional seed note",
      currency: "SEK",
      vatRateBps: 2_500,
      issueDate: "2026-09-01",
      dueDate: "2026-09-30",
      periodFrom: "2026-08-01",
      periodTo: "2026-08-31",
      netMinor: 10_000_000,
      vatMinor: 2_500_000,
      roundingMinor: 0,
      grossMinor: 12_500_000,
      compensationModel: model,
      shareBps,
      status,
      paidDate,
      incomeTransactionId: null,
      incomeTransactionIds: [],
      createdAt: now,
      createdBy: "seed-accountant",
      updatedAt: now,
      importKey: null,
    });
  const transactions = [
    [
      "seed-tx-1",
      "income",
      "seed-cat-consulting",
      null,
      "seed-invoice-1",
      null,
      "2026-09-30",
      3_000_000,
      750_000,
      0,
      "Invoice 2026-101, company share",
    ],
    [
      "seed-tx-2",
      "income",
      "seed-cat-consulting",
      "seed-consultant-flexible",
      "seed-invoice-1",
      null,
      "2026-09-30",
      7_000_000,
      1_750_000,
      7_000_000,
      "Invoice 2026-101, consultant share",
    ],
    [
      "seed-tx-3",
      "expense",
      "seed-cat-equipment",
      "seed-consultant-flexible",
      null,
      "consultant",
      "2026-10-05",
      1_200_000,
      300_000,
      -1_200_000,
      "Laptop",
    ],
    [
      "seed-tx-4",
      "expense",
      "seed-cat-travel",
      null,
      null,
      "company",
      "2026-10-12",
      240_000,
      14_400,
      0,
      "Train tickets",
    ],
  ] as const;
  for (const [
    id,
    direction,
    categoryId,
    consultantId,
    invoiceId,
    funding,
    date,
    netMinor,
    vatMinor,
    delta,
    description,
  ] of transactions)
    batch.set(db.collection("financialTransactions").doc(id), {
      organizationId: org,
      direction,
      categoryId,
      consultantId,
      invoiceId,
      funding,
      date,
      netMinor,
      vatRateBps:
        direction === "income"
          ? 2_500
          : Math.round((vatMinor / netMinor) * 10_000),
      vatMinor,
      roundingMinor: 0,
      grossMinor: netMinor + vatMinor,
      consultantBalanceDeltaMinor: delta,
      visibleDescription: description,
      internalNote: "Internal: fictional seed note",
      applyConsultantShare: false,
      shareBpsOverride: null,
      status: "posted",
      reversedByTransactionId: null,
      importKey: null,
      createdAt: now,
      createdBy: "seed-accountant",
    });
  batch.set(db.collection("vatSettlements").doc("seed-vat"), {
    organizationId: org,
    paymentDate: "2026-10-12",
    periodFrom: "2026-07-01",
    periodTo: "2026-09-30",
    amountMinor: 1_000_000,
    roundingMinor: 0,
    currency: "SEK",
    reference: "Q3 2026",
    note: "",
    status: "active",
    reversalReason: null,
    createdAt: now,
    createdBy: "seed-accountant",
  });
  await batch.commit();
}

async function seedTimeReports() {
  const batch = db.batch();
  batch.set(db.collection("timeCodes").doc("seed-code-work"), {
    organizationId: org,
    code: "WORK",
    name: { en: "Work", sv: "Arbete" },
    category: "work",
    requiresComment: false,
    countsAsWorkedTime: true,
    countsTowardExpectedTime: true,
    employeeCanSelect: true,
    assignedUserId: null,
    active: true,
    validFrom: "2026-01-01",
    validTo: null,
    sortOrder: 1,
    hourlyRate: 1_100,
  });
  const weeks = [
    ["seed-consultant-flexible", 41, "approved"],
    ["seed-consultant-flexible", 42, "rejected"],
    ["seed-consultant-flexible", 43, "submitted"],
    ["seed-consultant-fixed", 43, "submitted"],
    ["seed-consultant-limited", 43, "approved"],
    ["seed-manager", 43, "submitted"],
  ] as const;
  for (const [userId, isoWeek, status] of weeks) {
    const dates = getIsoWeekDates(2026, isoWeek).slice(0, 5);
    const id = timesheetId(org, userId, 2026, isoWeek);
    batch.set(db.collection("timesheets").doc(id), {
      organizationId: org,
      userId,
      managerId: null,
      isoYear: 2026,
      isoWeek,
      part: 1,
      partCount: 1,
      periodStart: dates[0],
      periodEnd: dates.at(-1),
      status,
      rejectionReason: status === "rejected" ? "Please check Friday." : null,
      expectedMinutes: 2_400,
      reportedMinutes: 2_400,
      workedMinutes: 2_400,
      absenceMinutes: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    for (const date of dates)
      batch.set(db.collection("timeEntries").doc(`${id}_${date}`), {
        organizationId: org,
        timesheetId: id,
        userId,
        date,
        isoYear: 2026,
        isoWeek,
        part: 1,
        partCount: 1,
        year: Number(date.slice(0, 4)),
        month: Number(date.slice(5, 7)),
        dateTimestamp: Timestamp.fromDate(new Date(`${date}T12:00:00Z`)),
        timeCodeId: "seed-code-work",
        timeCodeSnapshot: {
          code: "WORK",
          name: "Work",
          category: "work",
          countsAsWorkedTime: true,
          countsTowardExpectedTime: true,
          hourlyRate: 1_100,
        },
        minutes: 480,
        createdAt: now,
        updatedAt: now,
      });
  }
  await batch.commit();
}

async function storeFile(path: string) {
  await bucket.file(path).save(pdf, {
    resumable: false,
    metadata: { contentType: "application/pdf" },
  });
  return path;
}

async function seedDocuments() {
  const consultant = "seed-consultant-flexible";
  await db.collection("contracts").doc("seed-contract").set({
    organizationId: org,
    name: "Consulting agreement",
    documentDate: "2026-01-01",
    validTo: null,
    ownerType: "consultant",
    consultantId: consultant,
    consultantName: "Cleo Lind",
    visibleToConsultant: true,
    confidential: false,
    createdAt: now,
    createdBy: "seed-manager",
    updatedAt: now,
    updatedBy: "seed-manager",
  });
  await db
    .collection("contractFiles")
    .doc("seed-contract-file")
    .set({
      organizationId: org,
      contractId: "seed-contract",
      name: "agreement.pdf",
      size: pdf.length,
      contentType: "application/pdf",
      storagePath: await storeFile(
        `organizations/${org}/documents/contracts/seed-contract/${randomUUID()}`,
      ),
      createdAt: now,
      createdBy: "seed-manager",
    });
  const period = payslipPeriod(2026, 10);
  await db
    .collection("payslips")
    .doc(payslipId(org, consultant, period))
    .set({
      organizationId: org,
      userId: consultant,
      userName: "Cleo Lind",
      period,
      year: 2026,
      month: 10,
      fileName: "payslip-2026-10.pdf",
      contentType: "application/pdf",
      size: pdf.length,
      storagePath: await storeFile(
        `organizations/${org}/documents/payslips/${consultant}/${period}-${randomUUID()}`,
      ),
      createdAt: now,
      createdBy: "seed-accountant",
    });
  await db
    .collection("receipts")
    .doc("seed-receipt")
    .set({
      organizationId: org,
      userId: consultant,
      userName: "Cleo Lind",
      employeeNumber: "T006",
      date: "2026-10-20",
      name: "Team lunch",
      description: "Fictional receipt",
      netMinor: 80_000,
      vatMinor: 9_600,
      grossMinor: 89_600,
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      size: pdf.length,
      storagePath: await storeFile(
        `organizations/${org}/receipts/${consultant}/seed-receipt-${randomUUID()}`,
      ),
      status: "pending",
      reviewNote: "",
      expenseTransactionId: null,
      createdAt: now,
      updatedAt: now,
    });
}

async function main() {
  await seedProfiles();
  await seedPeople();
  await seedFinance();
  await seedTimeReports();
  await seedDocuments();
  console.log("Seeded the local emulators:");
  for (const [, email, displayName, role, profile] of people)
    console.log(
      `  ${email}  ${displayName} (${role}, ${profile ?? "no profile"})`,
    );
}

void main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
