import { Context } from 'hono';
import { UserContext, StandardResponse } from '../domain/types';
import { AuthenticationError } from '../domain/errors';

export class ApiControllers {
  /**
   * Controller for GET /api/me
   */
  public static async getMe(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const container = c.get('container');
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
  }

  /**
   * Controller for POST /api/claims/assign
   */
  public static async assignClaims(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const payload = c.req.valid('json');
    const container = c.get('container');

    const updatedClaims = await container.assignClaimsUseCase.execute(user, payload);

    return c.json<StandardResponse>({
      success: true,
      data: {
        message: `Successfully updated roles for ${payload.targetEmail}`,
        updatedClaims,
      },
    });
  }

  /**
   * Controller for GET /api/payments
   */
  public static async getPayments(c: Context) {
    const user = c.get('user') as UserContext | null;

    if (user) {
      // Authenticated experience (custom claims enhance user experience)
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
  }
}
