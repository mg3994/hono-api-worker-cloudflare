import { ErrorHandler } from 'hono';
import { AppError, ValidationError } from '../domain/errors';
import { StandardResponse } from '../domain/types';

export const globalErrorHandler = (): ErrorHandler => {
  return async (err, c) => {
    // Check if the error is an instance of our typed AppError
    if (err instanceof AppError) {
      const response: StandardResponse = {
        success: false,
        error: {
          code: err.errorCode,
          message: err.message,
          ...(err instanceof ValidationError ? { details: err.details } : {}),
        },
      };
      return c.json(response, err.statusCode as any);
    }

    // Default error response for unexpected internal server errors
    console.error('Unhandled Server Error:', err);
    const fallbackResponse: StandardResponse = {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
        details: err.message,
      },
    };
    return c.json(fallbackResponse, 500);
  };
};
