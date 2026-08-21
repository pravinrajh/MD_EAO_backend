/** Synthetic South-Indian name/location catalogs for ArchNova demo data. */

export const FIRST_NAMES = [
  "Arun", "Bala", "Deepa", "Eshwar", "Ganesh", "Hari", "Indira", "Jaya", "Karthik", "Lakshmi",
  "Murali", "Nithya", "Pradeep", "Revathi", "Suresh", "Thenmozhi", "Usha", "Vignesh", "Yamini", "Anitha",
  "Chitra", "Dinesh", "Gowri", "Hemant", "Ilango", "Janani", "Kavitha", "Lokesh", "Madhavi", "Naveen",
  "Padma", "Ramesh", "Saravanan", "Tharun", "Vasanth", "Aishwarya", "Bharath", "Divya", "Gopal", "Hema",
  "Ishwarya", "Kannan", "Meenakshi", "Nandhini", "Omprakash", "Priya", "Raghavan", "Shalini", "Tamilselvan", "Vimal",
] as const;

export const LAST_NAMES = [
  "Raman", "Iyer", "Krishnan", "Nair", "Subramanian", "Pillai", "Reddy", "Rao", "Murugan", "Sundaram",
  "Venkatesan", "Balaji", "Chandran", "Devaraj", "Ganesan", "Harikrishnan", "Jayakumar", "Kumar", "Mani", "Narayanan",
] as const;

export const CUSTOMER_FIRST = [
  "Ashok", "Bhuvana", "Chetan", "Devi", "Farook", "Geetha", "Hitesh", "Inba", "Jegan", "Kala",
  "Latha", "Mohan", "Nirmala", "Oviya", "Prakash", "Quinn", "Ravi", "Selvi", "Tejas", "Uday",
] as const;

export const COMPANY_SUFFIXES = [
  "Homes", "Builders", "Estates", "Infra", "Spaces", "Properties", "Developers", "Holdings", "Living", "Realty",
] as const;

export const CHENNAI_LOCALITIES = [
  "OMR", "Sholinganallur", "Perungudi", "Thoraipakkam", "Velachery", "Adyar", "Anna Nagar", "Porur",
  "Guindy", "Ambattur", "Tambaram", "Medavakkam", "Pallikaranai", "ECR", "Kelambakkam", "Navalur",
] as const;

export const CITY_WEIGHTS: Array<{ city: string; weight: number; localities: string[] }> = [
  { city: "Chennai", weight: 60, localities: [...CHENNAI_LOCALITIES] },
  { city: "Coimbatore", weight: 15, localities: ["RS Puram", "Peelamedu", "Saravanampatti", "Gandhipuram"] },
  { city: "Madurai", weight: 8, localities: ["Anna Nagar", "KK Nagar", "Goripalayam"] },
  { city: "Trichy", weight: 5, localities: ["Thillai Nagar", "Srirangam", "Cantonment"] },
  { city: "Salem", weight: 4, localities: ["Hasthampatti", "Fairlands"] },
  { city: "Bengaluru", weight: 5, localities: ["Whitefield", "Electronic City", "Indiranagar"] },
  { city: "Hyderabad", weight: 2, localities: ["Gachibowli", "Hitech City"] },
  { city: "Other South India", weight: 1, localities: ["Pondicherry", "Tirunelveli"] },
];

export const DEPARTMENTS = [
  "Management",
  "Projects",
  "Construction",
  "Interior",
  "Sales",
  "CRM",
  "Finance",
  "Procurement",
  "HR",
  "Operations",
] as const;

export const EXPENSE_CATEGORIES = [
  { code: "AN-CAT-LAND", name: "Land", type: "EXPENSE" as const },
  { code: "AN-CAT-MAT", name: "Material", type: "EXPENSE" as const },
  { code: "AN-CAT-LAB", name: "Labour", type: "EXPENSE" as const },
  { code: "AN-CAT-VEN", name: "Vendor", type: "EXPENSE" as const },
  { code: "AN-CAT-DES", name: "Design", type: "EXPENSE" as const },
  { code: "AN-CAT-LEG", name: "Legal", type: "EXPENSE" as const },
  { code: "AN-CAT-APP", name: "Approval", type: "EXPENSE" as const },
  { code: "AN-CAT-TRN", name: "Transport", type: "EXPENSE" as const },
  { code: "AN-CAT-MKT", name: "Marketing", type: "EXPENSE" as const },
  { code: "AN-CAT-OFF", name: "Office", type: "EXPENSE" as const },
] as const;

export const INCOME_CATEGORIES = [
  { code: "AN-CAT-CLI", name: "Client Receipt", type: "INCOME" as const },
  { code: "AN-CAT-OTH", name: "Other Income", type: "INCOME" as const },
] as const;

export const ACCOUNTS = [
  { accountId: "AN-ACC-BANK-MAIN", code: "AN-BANK", name: "ArchNova Main Bank", type: "BANK" as const, opening: 50_000_000 },
  { accountId: "AN-ACC-CASH", code: "AN-CASH", name: "ArchNova Petty Cash", type: "CASH" as const, opening: 500_000 },
  { accountId: "AN-ACC-RECV", code: "AN-RECV", name: "ArchNova Receivable Control", type: "RECEIVABLE" as const, opening: 12_000_000 },
  { accountId: "AN-ACC-PAY", code: "AN-PAY", name: "ArchNova Payable Control", type: "PAYABLE" as const, opening: 8_000_000 },
  { accountId: "AN-ACC-EXP", code: "AN-EXP", name: "ArchNova Expense Clearing", type: "EXPENSE" as const, opening: 0 },
  { accountId: "AN-ACC-INC", code: "AN-INC", name: "ArchNova Income Clearing", type: "INCOME" as const, opening: 0 },
] as const;

export function createRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

export function pickCity(rng: () => number): { city: string; locality: string; label: string } {
  const total = CITY_WEIGHTS.reduce((s, c) => s + c.weight, 0);
  let roll = rng() * total;
  for (const entry of CITY_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) {
      const locality = pick(rng, entry.localities);
      return { city: entry.city, locality, label: `${locality}, ${entry.city}` };
    }
  }
  const fallback = CITY_WEIGHTS[0]!;
  return { city: fallback.city, locality: fallback.localities[0]!, label: `${fallback.localities[0]}, ${fallback.city}` };
}

export function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

export function syntheticPhone(rng: () => number, index: number): string {
  const base = 9000000000 + ((index * 7919 + Math.floor(rng() * 1000)) % 899999999);
  return String(base);
}

export function dayOffset(days: number, hour = 10, minute = 0): Date {
  const date = new Date();
  date.setUTCHours(hour, minute, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}
