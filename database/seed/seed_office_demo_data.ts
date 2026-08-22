/**
 * ArchNova office-module demo seed — invoices, payments, vendors, land parcels, MD notes.
 *
 * Upserts only AN-OFFICE-* / AN-INV-* / AN-PAY-* / AN-VND-* / AN-LND-* / AN-NOTE-* records.
 * Reuses existing customers, projects, tasks, meetings. Does not regenerate master data.
 */
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../../src/config/database";
import { env } from "../../src/config/env";
import { Customer } from "../../src/models/Customer";
import { Invoice } from "../../src/models/Invoice";
import { InvoicePayment } from "../../src/models/InvoicePayment";
import { LandParcel } from "../../src/models/LandParcel";
import { MdNote } from "../../src/models/MdNote";
import { Meeting } from "../../src/models/Meeting";
import { Project } from "../../src/models/Project";
import { Task } from "../../src/models/Task";
import { User } from "../../src/models/User";
import { Vendor } from "../../src/models/Vendor";
import { databaseNameFromUri } from "../../scripts/lib/perfGuard";
import { GOLDEN } from "./demo_data/golden";

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function upsert(
  model: mongoose.Model<mongoose.Document>,
  query: Record<string, unknown>,
  doc: Record<string, unknown>,
): Promise<mongoose.Types.ObjectId> {
  const updated = await model.findOneAndUpdate(query, { $set: doc }, { new: true, upsert: true, setDefaultsOnInsert: true });
  if (!updated) throw new Error(`Failed to upsert ${model.modelName}`);
  return updated._id as mongoose.Types.ObjectId;
}

function assertSafeDatabase(uri: string): string {
  if (env.NODE_ENV === "production") {
    throw new Error("Office seed refuses to run when NODE_ENV is production");
  }
  const name = databaseNameFromUri(uri);
  if (!name) throw new Error("Could not parse database name from MONGODB_URI");
  if (/performance/i.test(name) || name === "ai_md_test") {
    throw new Error(`Office seed refused database "${name}"`);
  }
  return name;
}

async function seed(): Promise<void> {
  const dbName = assertSafeDatabase(env.MONGODB_URI);
  await connectDatabase();

  const md = await User.findOne({ email: GOLDEN.mdEmail, isDeleted: false });
  if (!md) throw new Error(`Missing MD user ${GOLDEN.mdEmail} — run seed:archnova first`);
  const createdBy = md._id as mongoose.Types.ObjectId;

  const projects = {
    villa: await Project.findOne({ projectId: GOLDEN.projects.villa.projectId, isDeleted: false }),
    omr: await Project.findOne({ projectId: GOLDEN.projects.omr.projectId, isDeleted: false }),
    cbe: await Project.findOne({ projectId: GOLDEN.projects.cbe.projectId, isDeleted: false }),
  };
  if (!projects.villa || !projects.omr || !projects.cbe) {
    throw new Error("Missing golden projects — run seed:archnova first");
  }

  const customers = {
    villa: await Customer.findOne({ customerId: GOLDEN.customers.villa, isDeleted: false }),
    omr: await Customer.findOne({ customerId: GOLDEN.customers.omr, isDeleted: false }),
    cbe: await Customer.findOne({ customerId: GOLDEN.customers.cbe, isDeleted: false }),
  };
  if (!customers.villa || !customers.omr || !customers.cbe) {
    throw new Error("Missing golden customers — run seed:archnova first");
  }

  const sathishTask = await Task.findOne({ taskId: GOLDEN.tasks.sathishOverdue, isDeleted: false });
  const sathishMeeting = await Meeting.findOne({ meetingId: GOLDEN.meetings.sathishToday, isDeleted: false });

  // Extra Chennai-linked active projects for invoice diversity (reuse, do not create).
  const chennaiProjects = await Project.find({
    isDeleted: false,
    location: /Chennai/i,
    status: { $in: ["ACTIVE", "AT_RISK", "PLANNING"] },
    projectId: { $nin: [GOLDEN.projects.villa.projectId, GOLDEN.projects.omr.projectId] },
  })
    .select("_id projectId name customerId")
    .limit(6)
    .lean();

  console.log("============================================================");
  console.log("ARCHNOVA OFFICE DEMO SEED");
  console.log("============================================================");
  console.log(`Database : ${dbName}`);
  console.log(`MD actor : ${GOLDEN.mdEmail}`);

  // --- Vendors (TN construction suppliers) ---
  const vendorDefs = [
    {
      vendorId: "AN-VND-001",
      name: "Chennai Steel Mart",
      phone: "9441001001",
      email: "accounts@chennainsteel.demo",
      location: "Guindy, Chennai",
      taxIdentifier: "33AABCC1111A1Z1",
      status: "ACTIVE" as const,
      notes: "Pending settlement ₹18,50,000 for OMR Commercial Project (basement steel). Hold site delivery until MD approves.",
    },
    {
      vendorId: "AN-VND-002",
      name: "OMR Ready Mix Concrete",
      phone: "9441001002",
      email: "billing@omrrmc.demo",
      location: "Sholinganallur, Chennai",
      taxIdentifier: "33AABCC2222B1Z2",
      status: "ACTIVE" as const,
      notes: "Pending settlement ₹9,75,000 for OMR slab pour. Linked project AN-PROJ-GOLDEN-OMR.",
    },
    {
      vendorId: "AN-VND-003",
      name: "Adyar Timber Works",
      phone: "9441001003",
      email: "hello@adyartimber.demo",
      location: "Adyar, Chennai",
      taxIdentifier: "33AABCC3333C1Z3",
      status: "ACTIVE" as const,
      notes: "Settled for Chennai Villa interiors. No pending dues.",
    },
    {
      vendorId: "AN-VND-004",
      name: "Coimbatore Electricals",
      phone: "9441001004",
      email: "ops@cbeelec.demo",
      location: "RS Puram, Coimbatore",
      taxIdentifier: "33AABCC4444D1Z4",
      status: "ACTIVE" as const,
      notes: "Pending settlement ₹4,20,000 for Coimbatore Interior Project wiring package.",
    },
    {
      vendorId: "AN-VND-005",
      name: "Tamil Nadu Earth Movers",
      phone: "9441001005",
      email: "dispatch@tnearth.demo",
      location: "Perungudi, Chennai",
      taxIdentifier: "33AABCC5555E1Z5",
      status: "ACTIVE" as const,
      notes: "Pending settlement ₹6,10,000 for land grading — Kelambakkam / OMR corridor.",
    },
    {
      vendorId: "AN-VND-006",
      name: "Madurai Stone Suppliers",
      phone: "9441001006",
      email: "sales@maduraistone.demo",
      location: "Madurai",
      taxIdentifier: "33AABCC6666F1Z6",
      status: "INACTIVE" as const,
      notes: "Inactive — previous granite supply for villa cladding completed.",
    },
    {
      vendorId: "AN-VND-007",
      name: "Porur Plumbing Hub",
      phone: "9441001007",
      email: "desk@porurplumb.demo",
      location: "Porur, Chennai",
      taxIdentifier: "33AABCC7777G1Z7",
      status: "ACTIVE" as const,
      notes: "Pending settlement ₹2,85,000 for Chennai Villa wet areas.",
    },
    {
      vendorId: "AN-VND-008",
      name: "Anna Nagar Glass & Aluminium",
      phone: "9441001008",
      email: "quotes@annaglass.demo",
      location: "Anna Nagar, Chennai",
      taxIdentifier: "33AABCC8888H1Z8",
      status: "ACTIVE" as const,
      notes: "Quote stage for OMR facade — no settlement due yet.",
    },
  ];

  for (const v of vendorDefs) {
    await upsert(Vendor as unknown as mongoose.Model<mongoose.Document>, { vendorId: v.vendorId }, { ...v, createdBy, isDeleted: false, deletedAt: null, deletedBy: null });
  }
  console.log(`Vendors upserted: ${vendorDefs.length}`);

  // --- Land parcels ---
  const landDefs = [
    {
      parcelId: "AN-LND-001",
      name: "Sholinganallur OMR Plot A",
      location: "Sholinganallur, OMR, Chennai",
      areaNote: "1.2 acres — DTCP approved layout",
      ownerName: "Synthetic Owner A",
      askingPrice: 48_000_000,
      status: "AVAILABLE" as const,
      projectId: null as mongoose.Types.ObjectId | null,
      notes: "Available for ArchNova commercial expansion near OMR site.",
    },
    {
      parcelId: "AN-LND-002",
      name: "Kelambakkam Junction Parcel",
      location: "Kelambakkam, Chennai",
      areaNote: "0.75 acres — road frontage",
      ownerName: "Synthetic Owner B",
      askingPrice: 22_500_000,
      status: "NEGOTIATION" as const,
      projectId: null,
      notes: "Negotiation ongoing — MD review required.",
    },
    {
      parcelId: "AN-LND-003",
      name: "Adyar Extension Plot",
      location: "Adyar, Chennai",
      areaNote: "8 grounds",
      ownerName: "Synthetic Owner C",
      askingPrice: 35_000_000,
      status: "LEGAL_VERIFICATION" as const,
      projectId: projects.villa._id as mongoose.Types.ObjectId,
      notes: "Linked to Chennai Villa Project — legal pack with advocate.",
    },
    {
      parcelId: "AN-LND-004",
      name: "Navalur ECR Corridor Land",
      location: "Navalur, Chennai",
      areaNote: "2.0 acres",
      ownerName: "Synthetic Owner D",
      askingPrice: 60_000_000,
      status: "AVAILABLE" as const,
      projectId: null,
      notes: "Available — strong for residential township pitch.",
    },
    {
      parcelId: "AN-LND-005",
      name: "OMR Site Expansion Strip",
      location: "Sholinganallur, OMR, Chennai",
      areaNote: "0.4 acres adjacent to AN-OMR-COMM",
      ownerName: "Synthetic Owner E",
      askingPrice: 18_000_000,
      status: "ACQUIRED" as const,
      projectId: projects.omr._id as mongoose.Types.ObjectId,
      notes: "Acquired for OMR Commercial Project staging yard.",
    },
    {
      parcelId: "AN-LND-006",
      name: "Thoraipakkam Warehouse Land",
      location: "Thoraipakkam, Chennai",
      areaNote: "1.0 acre",
      ownerName: "Synthetic Owner F",
      askingPrice: 28_000_000,
      status: "AVAILABLE" as const,
      projectId: null,
      notes: "Available for material yard.",
    },
    {
      parcelId: "AN-LND-007",
      name: "Coimbatore Peelamedu Parcel",
      location: "Peelamedu, Coimbatore",
      areaNote: "12 cents",
      ownerName: "Synthetic Owner G",
      askingPrice: 9_500_000,
      status: "DROPPED" as const,
      projectId: null,
      notes: "Dropped — title dispute flagged in legal note.",
    },
    {
      parcelId: "AN-LND-008",
      name: "Medavakkam Residential Plot",
      location: "Medavakkam, Chennai",
      areaNote: "2400 sq.ft",
      ownerName: "Synthetic Owner H",
      askingPrice: 7_800_000,
      status: "AVAILABLE" as const,
      projectId: null,
      notes: "Available — villa-plot client interest.",
    },
  ];

  for (const p of landDefs) {
    await upsert(LandParcel as unknown as mongoose.Model<mongoose.Document>, { parcelId: p.parcelId }, { ...p, createdBy, isDeleted: false, deletedAt: null, deletedBy: null });
  }
  console.log(`Land parcels upserted: ${landDefs.length}`);

  // --- Invoices + payments (amount = paid + balance) ---
  type InvDef = {
    invoiceId: string;
    invoiceNumber: string;
    customerId: mongoose.Types.ObjectId;
    project: mongoose.Types.ObjectId | null;
    amount: number;
    paidAmount: number;
    status: "PAID" | "PARTIALLY_PAID" | "ISSUED" | "OVERDUE";
    dueDays: number;
    issueDays: number;
    description: string;
    payments?: Array<{ paymentId: string; amount: number; daysAgo: number; method: "UPI" | "BANK_TRANSFER" | "CHEQUE" }>;
  };

  const invoiceDefs: InvDef[] = [
    {
      invoiceId: "AN-INV-001",
      invoiceNumber: "AN-INV-OMR-001",
      customerId: customers.omr._id as mongoose.Types.ObjectId,
      project: projects.omr._id as mongoose.Types.ObjectId,
      amount: 12_500_000,
      paidAmount: 12_500_000,
      status: "PAID",
      dueDays: -20,
      issueDays: -45,
      description: "OMR Commercial — milestone 2 (structure)",
      payments: [{ paymentId: "AN-PAY-001", amount: 12_500_000, daysAgo: 18, method: "BANK_TRANSFER" }],
    },
    {
      invoiceId: "AN-INV-002",
      invoiceNumber: "AN-INV-OMR-002",
      customerId: customers.omr._id as mongoose.Types.ObjectId,
      project: projects.omr._id as mongoose.Types.ObjectId,
      amount: 8_000_000,
      paidAmount: 3_000_000,
      status: "PARTIALLY_PAID",
      dueDays: 10,
      issueDays: -15,
      description: "OMR Commercial — MEP advance",
      payments: [{ paymentId: "AN-PAY-002", amount: 3_000_000, daysAgo: 7, method: "UPI" }],
    },
    {
      invoiceId: "AN-INV-003",
      invoiceNumber: "AN-INV-OMR-003",
      customerId: customers.omr._id as mongoose.Types.ObjectId,
      project: projects.omr._id as mongoose.Types.ObjectId,
      amount: 5_500_000,
      paidAmount: 0,
      status: "OVERDUE",
      dueDays: -12,
      issueDays: -40,
      description: "OMR Commercial — overdue steel reimbursement",
    },
    {
      invoiceId: "AN-INV-004",
      invoiceNumber: "AN-INV-VILLA-001",
      customerId: customers.villa._id as mongoose.Types.ObjectId,
      project: projects.villa._id as mongoose.Types.ObjectId,
      amount: 4_200_000,
      paidAmount: 4_200_000,
      status: "PAID",
      dueDays: -5,
      issueDays: -30,
      description: "Chennai Villa — interiors package",
      payments: [{ paymentId: "AN-PAY-003", amount: 4_200_000, daysAgo: 4, method: "BANK_TRANSFER" }],
    },
    {
      invoiceId: "AN-INV-005",
      invoiceNumber: "AN-INV-VILLA-002",
      customerId: customers.villa._id as mongoose.Types.ObjectId,
      project: projects.villa._id as mongoose.Types.ObjectId,
      amount: 2_800_000,
      paidAmount: 1_000_000,
      status: "PARTIALLY_PAID",
      dueDays: 5,
      issueDays: -10,
      description: "Chennai Villa — landscaping (partial)",
      payments: [{ paymentId: "AN-PAY-004", amount: 1_000_000, daysAgo: 3, method: "CHEQUE" }],
    },
    {
      invoiceId: "AN-INV-006",
      invoiceNumber: "AN-INV-VILLA-003",
      customerId: customers.villa._id as mongoose.Types.ObjectId,
      project: projects.villa._id as mongoose.Types.ObjectId,
      amount: 1_750_000,
      paidAmount: 0,
      status: "ISSUED",
      dueDays: 20,
      issueDays: -2,
      description: "Chennai Villa — pending final billing",
    },
    {
      invoiceId: "AN-INV-007",
      invoiceNumber: "AN-INV-CBE-001",
      customerId: customers.cbe._id as mongoose.Types.ObjectId,
      project: projects.cbe._id as mongoose.Types.ObjectId,
      amount: 1_200_000,
      paidAmount: 0,
      status: "OVERDUE",
      dueDays: -8,
      issueDays: -25,
      description: "Coimbatore Interior — overdue furniture invoice",
    },
    {
      invoiceId: "AN-INV-008",
      invoiceNumber: "AN-INV-CBE-002",
      customerId: customers.cbe._id as mongoose.Types.ObjectId,
      project: projects.cbe._id as mongoose.Types.ObjectId,
      amount: 900_000,
      paidAmount: 900_000,
      status: "PAID",
      dueDays: -1,
      issueDays: -14,
      description: "Coimbatore Interior — electrical package",
      payments: [{ paymentId: "AN-PAY-005", amount: 900_000, daysAgo: 2, method: "UPI" }],
    },
  ];

  // Attach a few more invoices to other Chennai projects / customers already in DB.
  let extraIdx = 0;
  for (const proj of chennaiProjects.slice(0, 4)) {
    extraIdx += 1;
    const custId = proj.customerId as mongoose.Types.ObjectId | undefined;
    if (!custId) continue;
    const amount = 1_500_000 + extraIdx * 250_000;
    const overdue = extraIdx % 2 === 1;
    const paidAmount = overdue ? 0 : Math.floor(amount / 2);
    invoiceDefs.push({
      invoiceId: `AN-INV-${String(8 + extraIdx).padStart(3, "0")}`,
      invoiceNumber: `AN-INV-CHN-${String(extraIdx).padStart(3, "0")}`,
      customerId: custId,
      project: proj._id as mongoose.Types.ObjectId,
      amount,
      paidAmount,
      status: overdue ? "OVERDUE" : "PARTIALLY_PAID",
      dueDays: overdue ? -6 - extraIdx : 14,
      issueDays: -20,
      description: `${proj.name} — milestone billing`,
      payments: overdue
        ? undefined
        : [{ paymentId: `AN-PAY-${String(5 + extraIdx).padStart(3, "0")}`, amount: paidAmount, daysAgo: 5, method: "BANK_TRANSFER" }],
    });
  }

  for (const inv of invoiceDefs) {
    const balance = inv.amount - inv.paidAmount;
    if (balance < 0 || inv.amount !== inv.paidAmount + balance) {
      throw new Error(`Bad invoice math for ${inv.invoiceId}`);
    }

    const id = await upsert(
      Invoice as unknown as mongoose.Model<mongoose.Document>,
      { invoiceId: inv.invoiceId },
      {
        invoiceId: inv.invoiceId,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        projectId: inv.project,
        amount: inv.amount,
        paidAmount: inv.paidAmount,
        balance,
        dueDate: daysFromNow(inv.dueDays),
        issueDate: daysFromNow(inv.issueDays),
        status: inv.status,
        description: inv.description,
        createdBy,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
      },
    );
    for (const pay of inv.payments ?? []) {
      await upsert(
        InvoicePayment as unknown as mongoose.Model<mongoose.Document>,
        { paymentId: pay.paymentId },
        {
          paymentId: pay.paymentId,
          invoiceId: id,
          amount: pay.amount,
          paidAt: daysFromNow(-pay.daysAgo),
          paymentMethod: pay.method,
          financeTransactionId: null,
          notes: `Demo payment for ${inv.invoiceNumber}`,
          createdBy,
        },
      );
    }
  }
  console.log(`Invoices upserted: ${invoiceDefs.length}; payments for paid/partial rows`);

  // --- MD Notes (OMR + relationships) ---
  const noteDefs: Array<{
    noteId: string;
    body: string;
    relatedType: "PROJECT" | "TASK" | "MEETING" | "CUSTOMER" | "NONE";
    relatedId: mongoose.Types.ObjectId | null;
  }> = [
    {
      noteId: "AN-NOTE-001",
      body: "OMR Commercial Project: steel delay is the main risk. Ask Sathish for daily basement update and chase overdue invoice AN-INV-OMR-003.",
      relatedType: "PROJECT",
      relatedId: projects.omr._id as mongoose.Types.ObjectId,
    },
    {
      noteId: "AN-NOTE-002",
      body: "OMR: vendor Chennai Steel Mart has pending settlement — approve only after quality check on rebar batch.",
      relatedType: "PROJECT",
      relatedId: projects.omr._id as mongoose.Types.ObjectId,
    },
    {
      noteId: "AN-NOTE-003",
      body: "Chennai Villa Project is healthy. Collect partial landscaping balance this week.",
      relatedType: "PROJECT",
      relatedId: projects.villa._id as mongoose.Types.ObjectId,
    },
    {
      noteId: "AN-NOTE-004",
      body: "Follow up Sathish overdue task — material delay at OMR basement must clear before Friday MD review.",
      relatedType: "TASK",
      relatedId: (sathishTask?._id as mongoose.Types.ObjectId | undefined) ?? null,
    },
    {
      noteId: "AN-NOTE-005",
      body: "After today's Sathish coordination meeting, confirm OMR steel delivery schedule in writing.",
      relatedType: "MEETING",
      relatedId: (sathishMeeting?._id as mongoose.Types.ObjectId | undefined) ?? null,
    },
    {
      noteId: "AN-NOTE-006",
      body: "Land: prioritize Sholinganallur OMR Plot A and Navalur ECR corridor for next board brief.",
      relatedType: "NONE",
      relatedId: null,
    },
    {
      noteId: "AN-NOTE-007",
      body: "Coimbatore Interior expenses are high vs budget — review vendor Coimbatore Electricals pending settlement.",
      relatedType: "PROJECT",
      relatedId: projects.cbe._id as mongoose.Types.ObjectId,
    },
    {
      noteId: "AN-NOTE-008",
      body: "Sales follow-ups: prioritize Chennai warm leads; do not chase dropped Madurai stone vendor deals.",
      relatedType: "NONE",
      relatedId: null,
    },
    {
      noteId: "AN-NOTE-009",
      body: "Important: MD wants cash-flow view of overdue invoices every morning before 10 AM.",
      relatedType: "NONE",
      relatedId: null,
    },
    {
      noteId: "AN-NOTE-010",
      body: "OMR project note for Viyan: at-risk due to overdue tasks + high spend + overdue client invoice.",
      relatedType: "PROJECT",
      relatedId: projects.omr._id as mongoose.Types.ObjectId,
    },
  ];

  // Fix relatedType when relatedId missing
  for (const n of noteDefs) {
    if (!n.relatedId && n.relatedType !== "NONE") {
      n.relatedType = "NONE";
    }
    await upsert(
      MdNote as unknown as mongoose.Model<mongoose.Document>,
      { noteId: n.noteId },
      {
        noteId: n.noteId,
        body: n.body,
        relatedType: n.relatedType,
        relatedId: n.relatedId,
        createdBy,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
      },
    );
  }
  console.log(`MD notes upserted: ${noteDefs.length}`);

  // Integrity quick check
  const bad = await Invoice.find({
    isDeleted: false,
    invoiceId: /^AN-INV-/,
    $expr: { $ne: ["$amount", { $add: ["$paidAmount", "$balance"] }] },
  }).select("invoiceId amount paidAmount balance");
  if (bad.length) throw new Error(`Invoice math failed: ${bad.map((b) => b.invoiceId).join(",")}`);

  const counts = {
    vendors: await Vendor.countDocuments({ vendorId: /^AN-VND-/, isDeleted: false }),
    landParcels: await LandParcel.countDocuments({ parcelId: /^AN-LND-/, isDeleted: false }),
    invoices: await Invoice.countDocuments({ invoiceId: /^AN-INV-/, isDeleted: false }),
    payments: await InvoicePayment.countDocuments({ paymentId: /^AN-PAY-/ }),
    mdNotes: await MdNote.countDocuments({ noteId: /^AN-NOTE-/, isDeleted: false }),
  };
  console.log("Office AN-* counts:", counts);
  console.log("OFFICE SEED COMPLETE");
  await disconnectDatabase();
}

seed().catch(async (err) => {
  console.error(err);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
