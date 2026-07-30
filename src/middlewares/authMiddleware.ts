import { MiddlewareHandler } from 'hono';
import { TokenService } from '../services/tokenService';
import { FirebaseTokenVerifier } from '../services/firebaseTokenVerifier';
import { FirebaseServiceAccount } from '../services/firebaseUtils';
import { AuthenticationError } from '../domain/errors';
import { UserContext } from '../domain/types';

declare module 'hono' {
  interface ContextVariableMap {
    user: UserContext | null;
  }
}

/**
 * Middleware that parses and verifies the Bearer ID Token if present.
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

    // Instantiate token validation components
    const serviceAccountStr = c.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountStr) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured in environment variables.');
    }

    const serviceAccount = JSON.parse(serviceAccountStr) as FirebaseServiceAccount;
    const projectId = serviceAccount.project_id;
    const superAdminsStr = c.env.SUPER_ADMINS || '';

    // Clean Architecture & Dependency Injection: Inject verifier dependency (with PUBLIC_KEY_KV binding) into TokenService
    const tokenVerifier = new FirebaseTokenVerifier(c.env.PUBLIC_KEY_KV);
    const tokenService = new TokenService(tokenVerifier, projectId, superAdminsStr);

    const userContext = await tokenService.verifyToken(token);

    c.set('user', userContext);
    await next();
  };
};
