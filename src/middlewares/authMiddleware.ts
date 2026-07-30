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

const mockServiceAccount: FirebaseServiceAccount = {
  project_id: 'mock-test-project',
  client_email: 'mock-client@example.com',
  private_key: 'mock-key',
};

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
    const serviceAccountStr = c.env?.FIREBASE_SERVICE_ACCOUNT_JSON;
    let serviceAccount = mockServiceAccount;

    if (serviceAccountStr) {
      try {
        serviceAccount = JSON.parse(serviceAccountStr) as FirebaseServiceAccount;
      } catch (err) {
        // Fallback to mock in test modes
      }
    }

    const projectId = serviceAccount.project_id;
    const superAdminsStr = c.env?.SUPER_ADMINS || '';

    // Clean Architecture & Dependency Injection: Inject verifier dependency (with FIREBASE_PUBLIC_KEY_KV binding) into TokenService
    const tokenVerifier = new FirebaseTokenVerifier(c.env?.FIREBASE_PUBLIC_KEY_KV);
    const tokenService = new TokenService(tokenVerifier, projectId, superAdminsStr);

    const userContext = await tokenService.verifyToken(token);

    c.set('user', userContext);
    await next();
  };
};
