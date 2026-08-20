export type JsonSchema = Record<string, unknown>;

export type ParameterObject = {
  name: string;
  in: "query" | "path" | "header";
  required?: boolean;
  description?: string;
  schema: JsonSchema;
  example?: unknown;
};

export type OperationObject = {
  tags: string[];
  summary: string;
  description?: string;
  operationId: string;
  security?: Array<Record<string, string[]>>;
  parameters?: ParameterObject[];
  requestBody?: Record<string, unknown>;
  responses: Record<string, unknown>;
};

export function ref(name: string): JsonSchema {
  return { $ref: `#/components/schemas/${name}` };
}

export function responseRef(name: string): JsonSchema {
  return { $ref: `#/components/responses/${name}` };
}

export function enumOf(values: readonly string[], description?: string): JsonSchema {
  return {
    type: "string",
    enum: [...values],
    ...(description ? { description } : {}),
  };
}

export const JWT = [{ BearerAuth: [] }];
export const PUBLIC: Array<Record<string, string[]>> = [];

export function jsonBody(schemaName: string, example?: unknown, required = true): Record<string, unknown> {
  return {
    required,
    content: {
      "application/json": {
        schema: ref(schemaName),
        ...(example ? { example } : {}),
      },
    },
  };
}

export function success(data: JsonSchema | null, options?: { meta?: boolean; example?: unknown; description?: string }) {
  const properties: JsonSchema = {
    success: { type: "boolean", example: true },
    message: { type: "string" },
    data: data ?? { nullable: true },
  };
  const required = ["success", "message"];
  if (options?.meta) properties.meta = ref("PaginationMeta");
  return {
    description: options?.description ?? "Success",
    content: {
      "application/json": {
        schema: { type: "object", required, properties },
        ...(options?.example ? { example: options.example } : {}),
      },
    },
  };
}

export function item(schemaName: string, options?: { example?: unknown; description?: string }) {
  return success(ref(schemaName), options);
}

export function list(schemaName: string, options?: { example?: unknown; description?: string }) {
  return success({ type: "array", items: ref(schemaName) }, { ...options, meta: true });
}

export function created(schemaName: string, options?: { example?: unknown }) {
  return success(ref(schemaName), { ...options, description: "Created" });
}

export const idParam: ParameterObject = {
  name: "id",
  in: "path",
  required: true,
  description: "MongoDB ObjectId",
  schema: ref("ObjectId"),
};

export const pageQuery: ParameterObject[] = [
  {
    name: "page",
    in: "query",
    schema: { type: "integer", minimum: 1, default: 1 },
  },
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
  },
];

export const sortOrder: ParameterObject = {
  name: "sortOrder",
  in: "query",
  schema: { type: "string", enum: ["asc", "desc"] },
};

export function sortBy(values: string[]): ParameterObject {
  return { name: "sortBy", in: "query", schema: { type: "string", enum: values } };
}

export function searchQuery(max = 50): ParameterObject {
  return { name: "search", in: "query", schema: { type: "string", maxLength: max } };
}

export function queryEnum(name: string, values: readonly string[], description?: string): ParameterObject {
  return { name, in: "query", schema: enumOf(values), description };
}

export function queryString(name: string, description?: string): ParameterObject {
  return { name, in: "query", schema: { type: "string" }, description };
}

export function queryDateTime(name: string, description?: string): ParameterObject {
  return {
    name,
    in: "query",
    description: description ?? "ISO-8601 date-time (UTC)",
    schema: { type: "string", format: "date-time" },
  };
}

export function queryObjectId(name: string): ParameterObject {
  return { name, in: "query", schema: ref("ObjectId") };
}

export const jwtErrors = {
  "401": responseRef("Unauthorized"),
  "403": responseRef("Forbidden"),
  "429": responseRef("TooManyRequests"),
  "500": responseRef("InternalServerError"),
};

export const jwtWriteErrors = {
  ...jwtErrors,
  "400": responseRef("BadRequest"),
  "404": responseRef("NotFound"),
  "409": responseRef("Conflict"),
  "422": responseRef("ValidationError"),
};

export const jwtReadErrors = {
  ...jwtErrors,
  "400": responseRef("BadRequest"),
  "404": responseRef("NotFound"),
  "422": responseRef("ValidationError"),
};

export function op(input: OperationObject): OperationObject {
  return input;
}

export function dateTime(description?: string): JsonSchema {
  return {
    type: "string",
    format: "date-time",
    example: "2026-08-21T10:00:00.000Z",
    description: description ?? "ISO-8601 instant stored in UTC. Send timezone-aware values as UTC.",
  };
}

export function money(description?: string): JsonSchema {
  return {
    type: "integer",
    minimum: 0,
    example: 150000,
    description: description ?? "Whole INR rupees (not paise). Integer only.",
  };
}
