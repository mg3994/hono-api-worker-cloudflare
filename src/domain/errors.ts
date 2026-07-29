export class AppError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
  }
}

export class PermissionDeniedError extends AppError {
  constructor(message: string = 'Permission denied') {
    super(message, 403);
  }
}

export class LimitExceededError extends AppError {
  constructor(message: string = 'Limit exceeded') {
    super(message, 400);
  }
}

export class UserNotFoundError extends AppError {
  constructor(message: string = 'User not found') {
    super(message, 400);
  }
}

export class ValidationError extends AppError {
  public details: any;

  constructor(message: string = 'Validation failed', details: any = null) {
    super(message, 400);
    this.details = details;
  }
}
