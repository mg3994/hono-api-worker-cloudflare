import { MiddlewareHandler } from 'hono';
import { TokenService } from '../services/tokenService';
import { FirebaseServiceAccount } from '../services/firebaseUtils';
import { AuthenticationError } from '../domain/errors';

export const authMiddleware = (): MiddlewareHandler<{ Bindings: CloudflareBindings }> => {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid Authorization header. Expected "Bearer <token>".');
    }

    const token = authHeader.substring(7);

    // Instantiate TokenService and verify
    const serviceAccountStr = c.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountStr) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured in environment variables.');
    }

    const serviceAccount = JSON.parse(serviceAccountStr) as FirebaseServiceAccount;
    const superAdminsStr = c.env.SUPER_ADMINS || '';

    const tokenService = new TokenService(serviceAccount, superAdminsStr);
    const userContext = await tokenService.verifyToken(token);

    c.set('user', userContext);
    await next();
  };
};
