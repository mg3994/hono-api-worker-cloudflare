export class AppError extends Error {
  public statusCode: number;
  public errorCode: string;
  public details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: string = 'INTERNAL_SERVER_ERROR',
    details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', details?: any) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

export class PermissionDeniedError extends AppError {
  constructor(message: string = 'Permission denied', details?: any) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class LimitExceededError extends AppError {
  constructor(message: string = 'Limit exceeded', details?: any) {
    super(message, 400, 'LIMIT_EXCEEDED', details);
  }
}

export class UserNotFoundError extends AppError {
  constructor(message: string = 'User not found', details?: any) {
    super(message, 400, 'NOT_FOUND', details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 400, 'VALIDATION_FAILED', details);
  }
}
