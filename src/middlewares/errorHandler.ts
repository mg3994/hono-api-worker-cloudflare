import { ErrorHandler } from 'hono';
import { AppError } from '../domain/errors';
import { StandardResponse } from '../domain/types';
import { ConsoleLogger } from '../infrastructure/consoleLogger';

export const globalErrorHandler = (): ErrorHandler => {
  return async (err, c) => {
    // Attempt to resolve logger via DI Container to enforce Dependency Inversion Principle (SOLID)
    let logger = null;
    try {
      const container = c.get('container');
      if (container) {
        // ConsoleLogger is typically wired, but any implementation of ILogger can be used
        logger = (container as any).assignClaimsUseCase?.logger || null;
      }
    } catch {
      // Graceful fallback if container is not available
    }

    if (!logger) {
      logger = new ConsoleLogger();
    }

    // Check if the error is an instance of our typed AppError
    if (err instanceof AppError) {
      const response: StandardResponse = {
        success: false,
        error: {
          code: err.errorCode,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      };

      if (err.statusCode >= 500) {
        logger.error(`AppError [${err.errorCode}]: ${err.message}`, err);
      } else {
        logger.warn(`AppWarning [${err.errorCode}]: ${err.message}`);
      }

      return c.json(response, err.statusCode as any);
    }

    // Default error response for unexpected internal server errors
    logger.error('Unhandled Server Error:', err);

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
