export class AppError extends Error {
  statusCode: number;
  errors: unknown[];
  isOperational: boolean;

  constructor(message: string, statusCode = 500, errors: unknown[] = []) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", errors: unknown[] = []) {
    super(message, 400, errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", errors: unknown[] = []) {
    super(message, 401, errors);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", errors: unknown[] = []) {
    super(message, 403, errors);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", errors: unknown[] = []) {
    super(message, 404, errors);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", errors: unknown[] = []) {
    super(message, 409, errors);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", errors: unknown[] = []) {
    super(message, 422, errors);
  }
}

export class TimeoutError extends AppError {
  constructor(message = "The request took too long to complete", errors: unknown[] = []) {
    super(message, 504, errors);
  }
}
