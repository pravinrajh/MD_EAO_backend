import { logger } from "../config/logger";
import { customerRepository } from "../repositories/customer.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { projectRepository } from "../repositories/project.repository";
import type { InvoiceStatus, PaymentMethod } from "../utils/constants";
import { BadRequestError, NotFoundError } from "../utils/errors";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextInvoiceId, nextInvoicePaymentId } from "../utils/sequence";
import {
  type Actor,
  assertCanDeleteOffice,
  assertCanManageOffice,
  assertCanViewOffice,
  visibilityFilter,
} from "./office.policy";

type CreateInvoiceInput = {
  customerId: string;
  projectId?: string | null;
  amount: number;
  dueDate?: Date | null;
  issueDate?: Date;
  description?: string;
};

function displayStatus(invoice: { status: string; dueDate: Date | null; balance: number }): InvoiceStatus {
  if (invoice.status === "CANCELLED" || invoice.status === "PAID" || invoice.status === "DRAFT") {
    return invoice.status as InvoiceStatus;
  }
  if (invoice.balance > 0 && invoice.dueDate && invoice.dueDate.getTime() < Date.now()) return "OVERDUE";
  return invoice.status as InvoiceStatus;
}

async function loadInvoice(id: string, actor: Actor) {
  assertObjectId(id);
  const invoice = await invoiceRepository.findById(id);
  if (!invoice || invoice.isDeleted) throw new NotFoundError("Invoice not found");
  const publicInvoice = invoiceRepository.toPublic(invoice);
  assertCanViewOffice(actor, { createdBy: String(publicInvoice.createdBy) }, "this invoice");
  return { ...publicInvoice, status: displayStatus(publicInvoice as { status: string; dueDate: Date | null; balance: number }) };
}

export const invoiceService = {
  async list(query: Record<string, unknown>, actor: Actor) {
    const { page, limit, skip } = parsePagination(query);
    const result = await invoiceRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      status: query.status as InvoiceStatus | undefined,
      customerId: typeof query.customerId === "string" ? query.customerId : undefined,
      projectId: typeof query.projectId === "string" ? query.projectId : undefined,
      scope: visibilityFilter(actor),
      skip,
      limit,
    });
    return {
      items: result.items.map((item) => ({
        ...item,
        status: displayStatus(item as { status: string; dueDate: Date | null; balance: number }),
      })),
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async getById(id: string, actor: Actor) {
    const invoice = await loadInvoice(id, actor);
    const payments = await invoiceRepository.listPayments(id);
    return { ...invoice, payments: payments.map((row) => invoiceRepository.toPublicPayment({ ...row })) };
  },

  async create(input: CreateInvoiceInput, actor: Actor) {
    assertCanManageOffice(actor, "invoices");
    assertObjectId(input.customerId, "customerId");
    const customer = await customerRepository.findById(input.customerId);
    if (!customer || customer.isDeleted) throw new NotFoundError("Customer not found");
    if (input.projectId) {
      assertObjectId(input.projectId, "projectId");
      const project = await projectRepository.findById(input.projectId);
      if (!project || project.isDeleted) throw new NotFoundError("Project not found");
    }
    const invoiceId = await nextInvoiceId();
    const created = await invoiceRepository.create({
      invoiceId,
      invoiceNumber: invoiceId,
      customerId: input.customerId,
      projectId: input.projectId ?? null,
      amount: input.amount,
      paidAmount: 0,
      balance: input.amount,
      dueDate: input.dueDate ?? null,
      issueDate: input.issueDate ?? new Date(),
      status: "ISSUED",
      description: input.description ?? "",
      createdBy: actor.id,
    });
    logger.info({ invoiceId, createdBy: actor.id }, "Invoice created");
    return invoiceRepository.toPublic(created);
  },

  async update(id: string, input: Partial<CreateInvoiceInput> & { status?: InvoiceStatus }, actor: Actor) {
    assertCanManageOffice(actor, "invoices");
    const current = await loadInvoice(id, actor);
    if (current.status === "PAID" && input.amount) {
      throw new BadRequestError("Paid invoices cannot change amount");
    }
    const patch: Record<string, unknown> = {};
    if (input.description !== undefined) patch.description = input.description;
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
    if (input.status === "CANCELLED") {
      patch.status = "CANCELLED";
    }
    const updated = await invoiceRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("Invoice not found");
    return invoiceRepository.toPublic(updated);
  },

  async recordPayment(
    id: string,
    input: { amount: number; paidAt?: Date; paymentMethod?: PaymentMethod | ""; notes?: string },
    actor: Actor,
  ) {
    assertCanManageOffice(actor, "invoices");
    const invoice = await loadInvoice(id, actor);
    if (invoice.status === "CANCELLED") throw new BadRequestError("Cancelled invoices cannot accept payment");
    if (Number(invoice.balance) <= 0) throw new BadRequestError("Invoice is already paid");
    if (input.amount > Number(invoice.balance)) throw new BadRequestError("Payment exceeds outstanding balance");
    const paidAmount = Number(invoice.paidAmount) + input.amount;
    const balance = Number(invoice.amount) - paidAmount;
    const status: InvoiceStatus = balance === 0 ? "PAID" : "PARTIALLY_PAID";
    await invoiceRepository.createPayment({
      paymentId: await nextInvoicePaymentId(),
      invoiceId: id,
      amount: input.amount,
      paidAt: input.paidAt ?? new Date(),
      paymentMethod: input.paymentMethod ?? "",
      notes: input.notes ?? "",
      createdBy: actor.id,
    });
    const updated = await invoiceRepository.updateById(id, { paidAmount, balance, status });
    if (!updated) throw new NotFoundError("Invoice not found");
    logger.info({ invoiceId: invoice.invoiceId, amount: input.amount }, "Invoice payment recorded");
    return this.getById(id, actor);
  },

  async remove(id: string, actor: Actor) {
    assertCanDeleteOffice(actor, "invoices");
    await loadInvoice(id, actor);
    const updated = await invoiceRepository.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actor.id,
    });
    if (!updated) throw new NotFoundError("Invoice not found");
    return invoiceRepository.toPublic(updated);
  },
};
