/** Deterministic ArchNova golden demo identifiers (do not collide with SEED-* / @office.local). */

export const ARCHNOVA = {
  companyName: "ArchNova Technologies LLP",
  password: "ArchNovaDemo@2026",
  emailDomain: "archnova.com",
  idPrefix: "AN",
} as const;

export const GOLDEN = {
  mdEmail: "md@archnova.com",
  adminEmail: "admin@archnova.com",
  sathish: {
    key: "sathish",
    email: "sathish@archnova.com",
    employeeId: "AN-EMP-SATHISH",
    employeeCode: "AN-E-SATHISH",
    firstName: "Sathish",
    lastName: "Raman",
  },
  projects: {
    villa: {
      projectId: "AN-PROJ-GOLDEN-VILLA",
      code: "AN-CHN-VILLA",
      name: "Chennai Villa Project",
      budget: 25_000_000,
      progress: 78,
      actualExpense: 14_800_000,
      status: "ACTIVE" as const,
      projectType: "RESIDENTIAL" as const,
      location: "Adyar, Chennai",
    },
    omr: {
      projectId: "AN-PROJ-GOLDEN-OMR",
      code: "AN-OMR-COMM",
      name: "OMR Commercial Project",
      budget: 80_000_000,
      progress: 42,
      actualExpense: 41_200_000,
      status: "AT_RISK" as const,
      projectType: "COMMERCIAL" as const,
      location: "Sholinganallur, OMR, Chennai",
    },
    cbe: {
      projectId: "AN-PROJ-GOLDEN-CBE",
      code: "AN-CBE-INT",
      name: "Coimbatore Interior Project",
      budget: 8_000_000,
      progress: 55,
      actualExpense: 7_400_000,
      status: "ACTIVE" as const,
      projectType: "OTHER" as const,
      location: "RS Puram, Coimbatore",
    },
  },
  tasks: {
    sathishTodayPending: "AN-TASK-GOLDEN-SATHISH-TODAY-PENDING",
    sathishTodayCompleted: "AN-TASK-GOLDEN-SATHISH-TODAY-DONE",
    sathishOverdue: "AN-TASK-GOLDEN-SATHISH-OVERDUE",
    sathishInProgress: "AN-TASK-GOLDEN-SATHISH-INPROG",
  },
  meetings: {
    sathishToday: "AN-MTG-GOLDEN-SATHISH-TODAY",
    mdToday: "AN-MTG-GOLDEN-MD-TODAY",
  },
  customers: {
    villa: "AN-CUST-GOLDEN-VILLA",
    omr: "AN-CUST-GOLDEN-OMR",
    cbe: "AN-CUST-GOLDEN-CBE",
  },
  leads: {
    villa: "AN-LEAD-GOLDEN-VILLA",
    omr: "AN-LEAD-GOLDEN-OMR",
    cbe: "AN-LEAD-GOLDEN-CBE",
  },
  opportunities: {
    villa: "AN-OPP-GOLDEN-VILLA",
    omr: "AN-OPP-GOLDEN-OMR",
    cbe: "AN-OPP-GOLDEN-CBE",
  },
} as const;

export const EXPECTED_COUNTS = {
  users: 52,
  employees: 52,
  customers: 120,
  leads: 320,
  opportunities: 140,
  salesActivities: 220,
  projects: 40,
  tasks: 650,
  meetings: 200,
  accounts: 6,
  financeCategories: 12,
  financeTransactions: 400,
  budgets: 40,
  notifications: 200,
  reminders: 120,
} as const;

export function expectedTotal(): number {
  return Object.values(EXPECTED_COUNTS).reduce((a, b) => a + b, 0);
}
