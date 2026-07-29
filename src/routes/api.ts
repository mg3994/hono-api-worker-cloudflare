import { Hono } from 'hono';
import { sValidator } from '@hono/standard-validator';
import { authMiddleware } from '../middlewares/authMiddleware';
import { containerMiddleware } from '../middlewares/containerMiddleware';
import { UserContext, AssignClaimRequestSchema, StandardResponse } from '../domain/types';
import { ValidationError, PermissionDeniedError, AuthenticationError } from '../domain/errors';

const api = new Hono<{ Bindings: CloudflareBindings }>();

// Bind the Clean Architecture container middleware
api.use('*', containerMiddleware());

// Bind our optional-bearer auth middleware globally across all /api endpoints
api.use('*', authMiddleware());

/**
 * GET /api/me
 * Decodes the calling user's current token claims, and also does a fresh lookup
 * in Firebase Auth DB to get their absolute latest claims.
 * Returns a helper boolean "needsRefresh" if the token is out of sync with Firebase.
 *
 * Compulsory authentication endpoint.
 */
api.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
  }

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
 *
 * Compulsory authentication endpoint.
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
    const user = c.get('user');
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

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

/**
 * GET /api/payments
 * Sample payments endpoint where Authorization is a plus but not compulsory.
 * - If user is logged in, provides customized business payment methods and metadata.
 * - If user is not logged in, returns standard guest payment packages.
 */
api.get('/payments', async (c) => {
  const user = c.get('user');

  if (user) {
    // Authenticated experience (custom claims enhance the user experience)
    const customizedInfo = {
      isGuest: false,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
      assignedBusinessesCount: (user.claims.o?.length || 0) + (user.claims.m?.length || 0) + (user.claims.s?.length || 0),
      paymentTier: user.isSuperAdmin ? 'Enterprise / Super Admin Plan' : 'Business Partner Tier',
      customMethods: ['Corporate Credit Card', 'ACH Direct Debit', 'Crypto Settlement'],
    };

    return c.json<StandardResponse>({
      success: true,
      data: customizedInfo,
    });
  }

  // Unauthenticated guest experience
  const guestInfo = {
    isGuest: true,
    paymentTier: 'Guest / Standard Tier',
    customMethods: ['Stripe', 'PayPal', 'Google Pay'],
    specialOffer: 'Sign up and verify your account to access Corporate Billing rates!',
  };

  return c.json<StandardResponse>({
    success: true,
    data: guestInfo,
  });
});

export default api;
