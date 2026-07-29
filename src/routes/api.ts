import { Hono } from 'hono';
import { sValidator } from '@hono/standard-validator';
import { authMiddleware } from '../middlewares/authMiddleware';
import { containerMiddleware } from '../middlewares/containerMiddleware';
import { UserContext, AssignClaimRequestSchema, StandardResponse } from '../domain/types';
import { ValidationError } from '../domain/errors';

const api = new Hono<{ Bindings: CloudflareBindings }>();

// Bind the Clean Architecture container middleware
api.use('*', containerMiddleware());

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
  const container = c.get('container');

  // Resolve UseCase cleanly from injected container
  const latestClaims = await container.getUserClaimsUseCase.execute(user.email);

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
});

/**
 * POST /api/claims/assign
 * Assigns owner ('o'), moderator ('m'), or staff ('s') for a given business ID to targetEmail.
 */
api.post(
  '/claims/assign',
  sValidator('json', AssignClaimRequestSchema, (result, c) => {
    if (!result.success) {
      // Direct ValidationError is caught by our global error handler to return structured error envelopes
      throw new ValidationError('Validation failed', result.issues);
    }
  }),
  async (c) => {
    const user = c.get('user') as UserContext;
    const payload = c.req.valid('json');
    const container = c.get('container');

    // Resolve UseCase cleanly from injected container
    const updatedClaims = await container.assignClaimsUseCase.execute(user, payload);

    return c.json<StandardResponse>({
      success: true,
      data: {
        message: `Successfully updated roles for ${payload.targetEmail}`,
        updatedClaims,
      },
    });
  }
);

export default api;
