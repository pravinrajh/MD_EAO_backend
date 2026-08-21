import { INVOICE_STATUSES, LAND_PARCEL_STATUSES, MD_NOTE_RELATED_TYPES, VENDOR_STATUSES } from "../utils/constants";
import {
  JWT,
  created,
  idParam,
  item,
  jsonBody,
  jwtReadErrors,
  jwtWriteErrors,
  list,
  op,
  pageQuery,
  queryEnum,
  queryObjectId,
  queryString,
  searchQuery,
  type OperationObject,
  type ParameterObject,
} from "./helpers";

type PathItem = Partial<Record<"get" | "post" | "patch" | "delete", OperationObject>>;

function jwtOp(
  tag: string,
  summary: string,
  extra: Omit<OperationObject, "tags" | "summary" | "operationId" | "security"> & { roles?: string },
): OperationObject {
  const description = [extra.description, extra.roles ? `Authorization: ${extra.roles}` : ""].filter(Boolean).join("\n\n");
  return op({
    tags: [tag],
    summary,
    description: description || undefined,
    operationId: `${tag}_${summary}`.replace(/[^A-Za-z0-9]+/g, "_"),
    security: JWT,
    parameters: extra.parameters,
    requestBody: extra.requestBody,
    responses: extra.responses,
  });
}

const invoiceQuery: ParameterObject[] = [
  ...pageQuery,
  searchQuery(),
  queryEnum("status", INVOICE_STATUSES),
  queryObjectId("customerId"),
  queryObjectId("projectId"),
];

const vendorQuery: ParameterObject[] = [...pageQuery, searchQuery(), queryEnum("status", VENDOR_STATUSES)];
const landQuery: ParameterObject[] = [...pageQuery, searchQuery(), queryEnum("status", LAND_PARCEL_STATUSES), queryObjectId("projectId")];
const noteQuery: ParameterObject[] = [
  ...pageQuery,
  searchQuery(),
  queryEnum("relatedType", MD_NOTE_RELATED_TYPES),
  queryObjectId("relatedId"),
  queryString("createdBy"),
];

export const officePaths: Record<string, PathItem> = {
  "/api/v1/invoices": {
    get: jwtOp("Office", "List invoices", {
      roles: "MD/ADMIN/MANAGER; employees see own created invoices",
      parameters: invoiceQuery,
      responses: { "200": list("Invoice"), ...jwtReadErrors },
    }),
    post: jwtOp("Office", "Create invoice", {
      roles: "MD/ADMIN/MANAGER",
      requestBody: jsonBody("CreateInvoiceRequest"),
      responses: { "201": created("Invoice"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/invoices/{id}": {
    get: jwtOp("Office", "Get invoice", {
      parameters: [idParam],
      responses: { "200": item("Invoice"), ...jwtReadErrors },
    }),
    patch: jwtOp("Office", "Update invoice", {
      roles: "MD/ADMIN/MANAGER",
      parameters: [idParam],
      requestBody: jsonBody("UpdateInvoiceRequest"),
      responses: { "200": item("Invoice"), ...jwtWriteErrors },
    }),
    delete: jwtOp("Office", "Soft-delete invoice", {
      roles: "MD/ADMIN",
      parameters: [idParam],
      responses: { "200": item("Invoice"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/invoices/{id}/payments": {
    post: jwtOp("Office", "Record invoice payment", {
      description:
        "Updates Invoice.paidAmount/balance. Optional postToFinance (MD/ADMIN) creates a COMPLETED INCOME FinanceTransaction with referenceType INVOICE and idempotency key invoice-payment:{paymentId}.",
      roles: "MD/ADMIN/MANAGER (postToFinance requires MD/ADMIN)",
      parameters: [idParam],
      requestBody: jsonBody("RecordInvoicePaymentRequest"),
      responses: { "200": item("Invoice"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/vendors": {
    get: jwtOp("Office", "List vendors", { parameters: vendorQuery, responses: { "200": list("Vendor"), ...jwtReadErrors } }),
    post: jwtOp("Office", "Create vendor", {
      roles: "MD/ADMIN/MANAGER",
      requestBody: jsonBody("CreateVendorRequest"),
      responses: { "201": created("Vendor"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/vendors/{id}": {
    get: jwtOp("Office", "Get vendor", { parameters: [idParam], responses: { "200": item("Vendor"), ...jwtReadErrors } }),
    patch: jwtOp("Office", "Update vendor", {
      roles: "MD/ADMIN/MANAGER",
      parameters: [idParam],
      requestBody: jsonBody("UpdateVendorRequest"),
      responses: { "200": item("Vendor"), ...jwtWriteErrors },
    }),
    delete: jwtOp("Office", "Soft-delete vendor", {
      roles: "MD/ADMIN",
      parameters: [idParam],
      responses: { "200": item("Vendor"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/land-parcels": {
    get: jwtOp("Office", "List land parcels", { parameters: landQuery, responses: { "200": list("LandParcel"), ...jwtReadErrors } }),
    post: jwtOp("Office", "Create land parcel", {
      roles: "MD/ADMIN/MANAGER",
      requestBody: jsonBody("CreateLandParcelRequest"),
      responses: { "201": created("LandParcel"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/land-parcels/{id}": {
    get: jwtOp("Office", "Get land parcel", { parameters: [idParam], responses: { "200": item("LandParcel"), ...jwtReadErrors } }),
    patch: jwtOp("Office", "Update land parcel", {
      roles: "MD/ADMIN/MANAGER",
      parameters: [idParam],
      requestBody: jsonBody("UpdateLandParcelRequest"),
      responses: { "200": item("LandParcel"), ...jwtWriteErrors },
    }),
    delete: jwtOp("Office", "Soft-delete land parcel", {
      roles: "MD/ADMIN",
      parameters: [idParam],
      responses: { "200": item("LandParcel"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/md-notes": {
    get: jwtOp("Office", "List MD notes", { parameters: noteQuery, responses: { "200": list("MdNote"), ...jwtReadErrors } }),
    post: jwtOp("Office", "Create MD note", {
      roles: "MD/ADMIN (owners) and managers per policy",
      requestBody: jsonBody("CreateMdNoteRequest"),
      responses: { "201": created("MdNote"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/md-notes/{id}": {
    get: jwtOp("Office", "Get MD note", { parameters: [idParam], responses: { "200": item("MdNote"), ...jwtReadErrors } }),
    patch: jwtOp("Office", "Update MD note", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateMdNoteRequest"),
      responses: { "200": item("MdNote"), ...jwtWriteErrors },
    }),
    delete: jwtOp("Office", "Soft-delete MD note", {
      parameters: [idParam],
      responses: { "200": item("MdNote"), ...jwtWriteErrors },
    }),
  },
};
