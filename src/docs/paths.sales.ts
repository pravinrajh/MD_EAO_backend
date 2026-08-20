import {
  CUSTOMER_STATUSES,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  OPPORTUNITY_STAGES,
  SALES_ACTIVITY_STATUSES,
  SALES_ACTIVITY_TYPES,
} from "../utils/constants";
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
  queryDateTime,
  queryEnum,
  queryObjectId,
  queryString,
  searchQuery,
  sortBy,
  sortOrder,
  success,
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

const leadQuery: ParameterObject[] = [
  ...pageQuery,
  searchQuery(),
  queryEnum("status", LEAD_STATUSES),
  queryEnum("priority", LEAD_PRIORITIES),
  queryEnum("source", LEAD_SOURCES),
  queryObjectId("assignedTo"),
  queryDateTime("from"),
  queryDateTime("to"),
  sortBy(["createdAt", "expectedCloseDate", "nextFollowUpAt", "estimatedValue", "name", "status"]),
  sortOrder,
];

const crm: Record<string, PathItem> = {
  "/api/v1/leads": {
    get: jwtOp("CRM", "List leads", { parameters: leadQuery, responses: { "200": list("Lead"), ...jwtReadErrors } }),
    post: jwtOp("CRM", "Create lead", {
      description: "email or phone is required. Monetary estimatedValue is whole INR.",
      requestBody: jsonBody("CreateLeadRequest"),
      responses: { "201": created("Lead"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/leads/{id}/status": {
    patch: jwtOp("CRM", "Update lead status", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateLeadStatusRequest"),
      responses: { "200": item("Lead"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/leads/{id}/follow-up": {
    patch: jwtOp("CRM", "Set lead follow-up", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateLeadFollowUpRequest"),
      responses: { "200": item("Lead"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/leads/{id}/convert": {
    post: jwtOp("CRM", "Convert lead", {
      parameters: [idParam],
      requestBody: jsonBody("ConvertLeadRequest"),
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtWriteErrors },
    }),
  },
  "/api/v1/leads/{id}": {
    get: jwtOp("CRM", "Get lead", { parameters: [idParam], responses: { "200": item("Lead"), ...jwtReadErrors } }),
    patch: jwtOp("CRM", "Update lead", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateLeadRequest"),
      responses: { "200": item("Lead"), ...jwtWriteErrors },
    }),
    delete: jwtOp("CRM", "Delete lead", {
      roles: "MD or ADMIN.",
      parameters: [idParam],
      responses: { "200": item("Lead"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/customers": {
    get: jwtOp("CRM", "List customers", {
      parameters: [
        ...pageQuery,
        searchQuery(),
        queryEnum("status", CUSTOMER_STATUSES),
        queryObjectId("assignedTo"),
        queryString("industry"),
        queryString("location"),
        sortBy(["createdAt", "name", "companyName", "status"]),
        sortOrder,
      ],
      responses: { "200": list("Customer"), ...jwtReadErrors },
    }),
    post: jwtOp("CRM", "Create customer", {
      roles: "MD, ADMIN, or MANAGER.",
      requestBody: jsonBody("CreateCustomerRequest"),
      responses: { "201": created("Customer"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/customers/{id}/status": {
    patch: jwtOp("CRM", "Update customer status", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateCustomerStatusRequest"),
      responses: { "200": item("Customer"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/customers/{id}": {
    get: jwtOp("CRM", "Get customer", { parameters: [idParam], responses: { "200": item("Customer"), ...jwtReadErrors } }),
    patch: jwtOp("CRM", "Update customer", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateCustomerRequest"),
      responses: { "200": item("Customer"), ...jwtWriteErrors },
    }),
    delete: jwtOp("CRM", "Delete customer", {
      roles: "MD or ADMIN.",
      parameters: [idParam],
      responses: { "200": item("Customer"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/opportunities/pipeline": {
    get: jwtOp("CRM", "Opportunity pipeline", {
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/opportunities/forecast": {
    get: jwtOp("CRM", "Opportunity forecast", {
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/opportunities": {
    get: jwtOp("CRM", "List opportunities", {
      parameters: [
        ...pageQuery,
        searchQuery(),
        queryEnum("stage", OPPORTUNITY_STAGES),
        queryObjectId("assignedTo"),
        queryObjectId("customerId"),
        queryObjectId("projectId"),
        queryDateTime("from"),
        queryDateTime("to"),
        sortBy(["createdAt", "expectedCloseDate", "nextFollowUpAt", "estimatedValue", "probability", "title", "stage"]),
        sortOrder,
      ],
      responses: { "200": list("Opportunity"), ...jwtReadErrors },
    }),
    post: jwtOp("CRM", "Create opportunity", {
      roles: "MD, ADMIN, or MANAGER.",
      requestBody: jsonBody("CreateOpportunityRequest"),
      responses: { "201": created("Opportunity"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/opportunities/{id}/stage": {
    patch: jwtOp("CRM", "Update opportunity stage", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateOpportunityStageRequest"),
      responses: { "200": item("Opportunity"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/opportunities/{id}": {
    get: jwtOp("CRM", "Get opportunity", { parameters: [idParam], responses: { "200": item("Opportunity"), ...jwtReadErrors } }),
    patch: jwtOp("CRM", "Update opportunity", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateOpportunityRequest"),
      responses: { "200": item("Opportunity"), ...jwtWriteErrors },
    }),
    delete: jwtOp("CRM", "Delete opportunity", {
      roles: "MD or ADMIN.",
      parameters: [idParam],
      responses: { "200": item("Opportunity"), ...jwtWriteErrors },
    }),
  },
};

const sales: Record<string, PathItem> = {
  "/api/v1/sales-activities": {
    get: jwtOp("Sales", "List sales activities", {
      parameters: [
        ...pageQuery,
        searchQuery(),
        queryObjectId("leadId"),
        queryObjectId("customerId"),
        queryObjectId("opportunityId"),
        queryObjectId("employeeId"),
        queryEnum("type", SALES_ACTIVITY_TYPES),
        queryEnum("status", SALES_ACTIVITY_STATUSES),
        queryDateTime("from"),
        queryDateTime("to"),
        sortBy(["createdAt", "scheduledAt", "status", "type", "title"]),
        sortOrder,
      ],
      responses: { "200": list("SalesActivity"), ...jwtReadErrors },
    }),
    post: jwtOp("Sales", "Create sales activity", {
      description: "Must link a lead, customer, or opportunity.",
      requestBody: jsonBody("CreateSalesActivityRequest"),
      responses: { "201": created("SalesActivity"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/sales-activities/{id}/status": {
    patch: jwtOp("Sales", "Update sales activity status", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateSalesActivityStatusRequest"),
      responses: { "200": item("SalesActivity"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/sales-activities/{id}": {
    get: jwtOp("Sales", "Get sales activity", {
      parameters: [idParam],
      responses: { "200": item("SalesActivity"), ...jwtReadErrors },
    }),
    patch: jwtOp("Sales", "Update sales activity", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateSalesActivityRequest"),
      responses: { "200": item("SalesActivity"), ...jwtWriteErrors },
    }),
    delete: jwtOp("Sales", "Delete sales activity", {
      roles: "MD or ADMIN.",
      parameters: [idParam],
      responses: { "200": item("SalesActivity"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/sales/summary": {
    get: jwtOp("Sales", "Sales summary", {
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/sales/my": {
    get: jwtOp("Sales", "My sales snapshot", {
      parameters: pageQuery,
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/sales/follow-ups": {
    get: jwtOp("Sales", "Follow-ups due", {
      description: "Employees cannot filter another assignee's follow-ups.",
      parameters: [...pageQuery, queryObjectId("assignedTo"), queryDateTime("from"), queryDateTime("to")],
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
};

export const salesPaths = { ...crm, ...sales };
