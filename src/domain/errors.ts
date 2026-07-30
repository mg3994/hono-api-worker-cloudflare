export class AppError extends Error {
  public statusCode: number;
  public errorCode: string;

  constructor(message: string, statusCode: number = 500, errorCode: string = 'INTERNAL_SERVER_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class PermissionDeniedError extends AppError {
  constructor(message: string = 'Permission denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class LimitExceededError extends AppError {
  constructor(message: string = 'Limit exceeded') {
    super(message, 400, 'LIMIT_EXCEEDED');
  }
}

export class UserNotFoundError extends AppError {
  constructor(message: string = 'User not found') {
    super(message, 400, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  public details: any;

  constructor(message: string = 'Validation failed', details: any = null) {
    super(message, 400, 'VALIDATION_FAILED');
    this.details = details;
  }
}
