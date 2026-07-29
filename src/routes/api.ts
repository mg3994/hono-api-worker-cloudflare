import { Hono } from 'hono';
import { z } from 'zod';
import { sValidator } from '@hono/standard-validator';
import { authMiddleware } from '../middlewares/authMiddleware';
import { UserContext, AssignClaimRequestSchema, StandardResponse } from '../domain/types';
import { FirebaseRepository } from '../repositories/firebaseRepository';
import { FirebaseServiceAccount } from '../services/firebaseUtils';
import { ClaimsService } from '../services/claimsService';
import { AssignClaimsUseCase } from '../usecases/assignClaimsUseCase';
import { GetUserClaimsUseCase } from '../usecases/getUserClaimsUseCase';

const api = new Hono<{ Bindings: CloudflareBindings }>();

// All API endpoints require Bearer auth middleware
api.use('*', authMiddleware());

/**
 * GET /api/me
 * Decodes the calling user's current token claims, and also does a fresh lookup
 * in Firebase Auth DB to get their absolute latest claims.
 * Returns a helper boolean "needsRefresh" if the token is out of sync with Firebase.
 */
api.get('/me', async (c) => {
  const user = c.get('user') as UserContext;

  try {
    const serviceAccount = JSON.parse(c.env.FIREBASE_SERVICE_ACCOUNT_JSON) as FirebaseServiceAccount;
    const firebaseRepo = new FirebaseRepository(serviceAccount);
    const getUserClaimsUseCase = new GetUserClaimsUseCase(firebaseRepo);

    // Fetch fresh claims directly from Firebase
    const latestClaims = await getUserClaimsUseCase.execute(user.email);

    // Compare token claims vs latest claims to determine if the client needs to force-refresh their ID token
    const needsRefresh = JSON.stringify(user.claims) !== JSON.stringify(latestClaims);

    const responseData = {
      uid: user.uid,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
      tokenClaims: user.claims,
      latestClaims,
      needsRefresh,
    };

    return c.json<StandardResponse>({
      success: true,
      data: responseData,
    });
  } catch (err: any) {
    return c.json<StandardResponse>(
      {
        success: false,
        error: {
          message: 'Failed to retrieve profile or fresh user claims.',
          details: err.message,
        },
      },
      500
    );
  }
});

/**
 * POST /api/claims/assign
 * Assigns owner ('o'), moderator ('m'), or staff ('s') for a given business ID to targetEmail.
 */
api.post(
  '/claims/assign',
  sValidator('json', AssignClaimRequestSchema, (result, c) => {
    if (!result.success) {
      // Standardized validation error response format
      return c.json<StandardResponse>(
        {
          success: false,
          error: {
            message: 'Validation failed',
            details: result.issues,
          },
        },
        400
      );
    }
  }),
  async (c) => {
    const user = c.get('user') as UserContext;
    const payload = c.req.valid('json');

    try {
      const serviceAccount = JSON.parse(c.env.FIREBASE_SERVICE_ACCOUNT_JSON) as FirebaseServiceAccount;
      const firebaseRepo = new FirebaseRepository(serviceAccount);
      const claimsService = new ClaimsService();
      const assignClaimsUseCase = new AssignClaimsUseCase(firebaseRepo, claimsService);

      const updatedClaims = await assignClaimsUseCase.execute(user, payload);

      return c.json<StandardResponse>({
        success: true,
        data: {
          message: `Successfully updated roles for ${payload.targetEmail}`,
          updatedClaims,
        },
      });
    } catch (err: any) {
      const isPermissionErr = err.message.toLowerCase().includes('permission denied');
      const isLimitErr = err.message.toLowerCase().includes('limit exceeded');
      const isNotFoundErr = err.message.toLowerCase().includes('not found');

      let statusCode = 500;
      if (isPermissionErr) {
        statusCode = 403;
      } else if (isLimitErr || isNotFoundErr) {
        statusCode = 400;
      }

      return c.json<StandardResponse>(
        {
          success: false,
          error: {
            message: err.message,
          },
        },
        statusCode as any
      );
    }
  }
);

export default api;
