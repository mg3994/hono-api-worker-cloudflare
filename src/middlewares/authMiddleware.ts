import { MiddlewareHandler } from 'hono';
import { AuthenticationError } from '../domain/errors';
import { UserContext } from '../domain/types';

declare module 'hono' {
  interface ContextVariableMap {
    user: UserContext | null;
  }
}

/**
 * Middleware that parses and verifies the Bearer ID Token if present.
 * Resolves the TokenService cleanly from the injected Clean Architecture dependency container.
 * If the Authorization header is missing or invalid, it gracefully lets the request proceed
 * and sets c.get('user') to null, supporting optional authentication (e.g. for payments).
 * Throws an AuthenticationError ONLY if a Bearer token is provided but is expired/invalid.
 */
export const authMiddleware = (): MiddlewareHandler<{ Bindings: CloudflareBindings }> => {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');

    // If Authorization header is missing or does not start with "Bearer ", treat as optional / unauthenticated guest
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      c.set('user', null);
      return await next();
    }

    const token = authHeader.substring(7);

    // Clean Architecture & SOLID: Resolve TokenService from the request-scoped Container
    const container = c.get('container');
    if (!container) {
      throw new Error('Dependency Injection Container has not been initialized.');
    }

    const userContext = await container.tokenService.verifyToken(token);

    c.set('user', userContext);
    await next();
  };
};
