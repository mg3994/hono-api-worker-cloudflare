import { Context } from 'hono';
import { UserContext, StandardResponse, DeviceSyncRequest, SendNotificationRequest, RevokeClaimRequest, CreateOrderRequest, ProcessPaymentRequest, CreateBlogPostRequest, UpdateBlogPostRequest, CreateBlogRequest } from '../domain/types';
import { AuthenticationError, PermissionDeniedError } from '../domain/errors';
import { DeviceSessionRecord } from '../domain/sessionRepository';

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
   * Controller for POST /api/claims/revoke
   */
  public static async revokeClaims(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const payload = c.req.valid('json') as RevokeClaimRequest;
    const container = c.get('container');

    const updatedClaims = await container.revokeClaimsUseCase.execute(user, payload);

    return c.json<StandardResponse>({
      success: true,
      data: {
        message: `Successfully revoked all roles for business ID ${payload.businessId} from target user ${payload.targetEmail}`,
        updatedClaims,
      },
    });
  }

  /**
   * Controller for GET /api/business/:id/users
   * Retrieves all users (emails, roles) mapped to a specific business ID from D1.
   */
  public static async getBusinessUsers(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const businessId = c.req.param('id');
    if (!businessId) {
      throw new Error('Business ID parameter is missing.');
    }

    // Security Gate: Super Admin or Associated User
    const isSuperAdmin = user.isSuperAdmin;
    const isAssociated =
      user.claims.o?.includes(businessId) ||
      user.claims.m?.includes(businessId) ||
      user.claims.s?.includes(businessId);

    if (!isSuperAdmin && !isAssociated) {
      throw new PermissionDeniedError('Permission denied: You must be associated with this business to view its users.');
    }

    const container = c.get('container');
    const usersList = await container.getBusinessUsersUseCase.execute(businessId);

    return c.json<StandardResponse>({
      success: true,
      data: usersList,
    });
  }

  /**
   * Controller for POST /api/devices/sync
   * Unified session, browser, and FCM token tracker.
   */
  public static async syncDeviceSession(c: Context) {
    const payload = c.req.valid('json') as DeviceSyncRequest;

    const container = c.get('container');
    const sessionRepo = container.sessionRepository;

    if (payload.action === 'LOGOUT_DEVICE') {
      await sessionRepo.logoutDevice(payload.clientId);

      return c.json<StandardResponse>({
        success: true,
        data: { message: `Successfully logged out browser device session: ${payload.clientId}` },
      });
    }

    if (payload.action === 'SYNC_DEVICE') {
      const { clientId, idToken, deviceToken, clientName } = payload;
      if (!deviceToken) {
        throw new Error('Missing deviceToken for device sync.');
      }

      // Check if this is an authenticated user session vs a guest session
      let uid = 'guest';
      if (idToken && idToken !== 'guest_session') {
        try {
          // Verify ID token locally on the edge!
          const userContext = await container.tokenService.verifyToken(idToken);
          uid = userContext.uid;
        } catch (err: any) {
          // Graceful fallback to guest or throw warning depending on client auth requirements
        }
      }

      const sessionRecord: DeviceSessionRecord = {
        browserClientId: clientId,
        uid,
        deviceToken,
        clientName: clientName || 'Unknown Web Client',
        updatedAt: Date.now(),
      };

      await sessionRepo.syncDeviceSession(sessionRecord);

      return c.json<StandardResponse>({
        success: true,
        data: {
          message: 'Device session synced successfully.',
          session: sessionRecord,
        },
      });
    }

    throw new Error(`Unsupported sync action payload: ${(payload as any).action}`);
  }

  /**
   * Controller for POST /api/notifications/send
   * Exposes push notification delivery.
   * Access Controls: Super Admins, OR Owners ('o') / Managers ('m') of the provided business ID.
   */
  public static async sendPushNotification(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const payload = c.req.valid('json') as SendNotificationRequest;
    const { targetUid, businessId, title, body, imageUrl, deepLinkUrl, customData } = payload;

    // Access Check Strategy
    const isSuperAdmin = user.isSuperAdmin;
    let isAuthorizedBusinessSender = false;

    if (businessId) {
      const isOwner = user.claims?.o?.includes(businessId) || false;
      const isManager = user.claims?.m?.includes(businessId) || false;
      isAuthorizedBusinessSender = isOwner || isManager;
    }

    if (!isSuperAdmin && !isAuthorizedBusinessSender) {
      throw new PermissionDeniedError(
        'Permission denied: Only Super Admins, Business Owners, or Managers are authorized to dispatch push notifications.'
      );
    }

    const container = c.get('container');
    const result = await container.messagingService.sendNotificationToUser(targetUid, {
      title,
      body,
      imageUrl,
      deepLinkUrl,
      customData,
    });

    return c.json<StandardResponse>({
      success: true,
      data: {
        message: `Successfully executed push notification delivery sequence. Sent to ${result.successCount} active devices.`,
        failures: result.failures,
      },
    });
  }

  /**
   * Controller for POST /api/orders
   */
  public static async createOrder(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const payload = c.req.valid('json') as CreateOrderRequest;
    const container = c.get('container');

    const order = await container.createOrderUseCase.execute(user, payload);

    return c.json<StandardResponse>({
      success: true,
      data: order,
    });
  }

  /**
   * Controller for GET /api/orders
   */
  public static async getOrders(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const businessId = c.req.query('businessId');
    const container = c.get('container');

    const orders = await container.getOrdersUseCase.execute(user, businessId);

    return c.json<StandardResponse>({
      success: true,
      data: orders,
    });
  }

  /**
   * Controller for POST /api/payments/process
   */
  public static async processPayment(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const payload = c.req.valid('json') as ProcessPaymentRequest;
    const container = c.get('container');

    const payment = await container.processPaymentUseCase.execute(user, payload);

    return c.json<StandardResponse>({
      success: true,
      data: payment,
    });
  }

  /**
   * Controller for GET /api/users/phone
   */
  public static async getUserByPhone(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const phoneNumber = c.req.query('phoneNumber') || '';
    const container = c.get('container');

    const targetUser = await container.getUserByPhoneUseCase.execute(user, phoneNumber);

    return c.json<StandardResponse>({
      success: true,
      data: targetUser,
    });
  }

  /**
   * Controller for POST /api/blogs
   */
  public static async createSelfBlog(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const authHeader = c.req.header('Authorization') || '';
    let bloggerToken = '';
    if (authHeader.startsWith('Bearer ')) bloggerToken = authHeader.substring(7).trim();
    const customHeader = c.req.header('X-Blogger-Access-Token') || '';
    if (customHeader) bloggerToken = customHeader.trim();

    const payload = c.req.valid('json') as CreateBlogRequest;
    const container = c.get('container');

    const blog = await container.createSelfBlogUseCase.execute(user, bloggerToken, payload);

    return c.json<StandardResponse>({
      success: true,
      data: blog,
    });
  }

  /**
   * Controller for POST /api/blogs/:blogId/posts
   */
  public static async createBlogPost(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const blogId = c.req.param('blogId');
    if (!blogId) {
      throw new Error('Blog ID parameter is missing.');
    }

    const authHeader = c.req.header('Authorization') || '';
    let bloggerToken = '';
    if (authHeader.startsWith('Bearer ')) bloggerToken = authHeader.substring(7).trim();
    const customHeader = c.req.header('X-Blogger-Access-Token') || '';
    if (customHeader) bloggerToken = customHeader.trim();

    const payload = c.req.valid('json') as CreateBlogPostRequest;
    const container = c.get('container');

    const post = await container.createBlogPostUseCase.execute(user, blogId, bloggerToken, payload);

    return c.json<StandardResponse>({
      success: true,
      data: post,
    });
  }

  /**
   * Controller for PUT /api/blogs/:blogId/posts/:postId
   */
  public static async updateBlogPost(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const blogId = c.req.param('blogId');
    const postId = c.req.param('postId');
    if (!blogId || !postId) {
      throw new Error('Blog ID or Post ID parameter is missing.');
    }

    const authHeader = c.req.header('Authorization') || '';
    let bloggerToken = '';
    if (authHeader.startsWith('Bearer ')) bloggerToken = authHeader.substring(7).trim();
    const customHeader = c.req.header('X-Blogger-Access-Token') || '';
    if (customHeader) bloggerToken = customHeader.trim();

    const payload = c.req.valid('json') as UpdateBlogPostRequest;
    const container = c.get('container');

    const post = await container.updateBlogPostUseCase.execute(user, blogId, postId, bloggerToken, payload);

    return c.json<StandardResponse>({
      success: true,
      data: post,
    });
  }

  /**
   * Controller for GET /api/blogs/:blogId/posts/:postId
   */
  public static async getBlogPost(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const blogId = c.req.param('blogId');
    const postId = c.req.param('postId');
    if (!blogId || !postId) {
      throw new Error('Blog ID or Post ID parameter is missing.');
    }

    const authHeader = c.req.header('Authorization') || '';
    let bloggerToken = '';
    if (authHeader.startsWith('Bearer ')) bloggerToken = authHeader.substring(7).trim();
    const customHeader = c.req.header('X-Blogger-Access-Token') || '';
    if (customHeader) bloggerToken = customHeader.trim();

    const container = c.get('container');
    const post = await container.getBlogPostUseCase.execute(user, blogId, postId, bloggerToken);

    return c.json<StandardResponse>({
      success: true,
      data: post,
    });
  }

  /**
   * Controller for DELETE /api/blogs/:blogId/posts/:postId
   */
  public static async deleteBlogPost(c: Context) {
    const user = c.get('user') as UserContext | null;
    if (!user) {
      throw new AuthenticationError('Authentication required: Missing or invalid Authorization header.');
    }

    const blogId = c.req.param('blogId');
    const postId = c.req.param('postId');
    if (!blogId || !postId) {
      throw new Error('Blog ID or Post ID parameter is missing.');
    }

    const authHeader = c.req.header('Authorization') || '';
    let bloggerToken = '';
    if (authHeader.startsWith('Bearer ')) bloggerToken = authHeader.substring(7).trim();
    const customHeader = c.req.header('X-Blogger-Access-Token') || '';
    if (customHeader) bloggerToken = customHeader.trim();

    const container = c.get('container');
    await container.deleteBlogPostUseCase.execute(user, blogId, postId, bloggerToken);

    return c.json<StandardResponse>({
      success: true,
      data: {
        message: `Successfully deleted Blogger post with ID ${postId} under blog ${blogId}`,
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
