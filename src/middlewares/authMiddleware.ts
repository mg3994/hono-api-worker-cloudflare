import { MiddlewareHandler } from 'hono';
import { verifyFirebaseIdToken, FirebaseServiceAccount } from '../services/firebaseUtils';
import { UserContext, CustomClaims, CustomClaimsSchema } from '../domain/types';

// Helper to check if email is on the super admin list
export function isSuperAdminEmail(email: string, superAdminsStr: string): boolean {
  if (!superAdminsStr) return false;
  const list = superAdminsStr.split(',').map((e) => e.trim().toLowerCase());
  return list.includes(email.trim().toLowerCase());
}

export const authMiddleware = (): MiddlewareHandler<{ Bindings: CloudflareBindings }> => {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json(
        {
          success: false,
          error: {
            message: 'Missing or invalid Authorization header. Expected "Bearer <token>".',
          },
        },
        401
      );
    }

    const token = authHeader.substring(7);

    try {
      // In wrangler.jsonc or secret vars we have FIREBASE_SERVICE_ACCOUNT_JSON. Let's parse it to get project_id.
      // If it's empty/missing (e.g. during development), let's raise a helpful error or support mock token in non-prod.
      const serviceAccountStr = c.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!serviceAccountStr) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured in environment variables.');
      }

      const serviceAccount = JSON.parse(serviceAccountStr) as FirebaseServiceAccount;
      const projectId = serviceAccount.project_id;

      // Verify the token
      const decoded = await verifyFirebaseIdToken(token, projectId);

      // Extract custom claims if any are present on the token
      let claims: CustomClaims = { o: [], m: [], s: [] };
      const rawClaims = {
        o: decoded.o,
        m: decoded.m,
        s: decoded.s,
      };
      const claimsParse = CustomClaimsSchema.safeParse(rawClaims);
      if (claimsParse.success) {
        claims = claimsParse.data;
      }

      const email = decoded.email || '';
      const superAdminsStr = c.env.SUPER_ADMINS || '';
      const isSuperAdmin = isSuperAdminEmail(email, superAdminsStr);

      const userContext: UserContext = {
        uid: decoded.uid,
        email,
        isSuperAdmin,
        claims,
      };

      // Store in context state
      c.set('user', userContext);
      await next();
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: {
            message: 'Authentication failed',
            details: err.message,
          },
        },
        401
      );
    }
  };
};
