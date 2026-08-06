import { Hono } from 'hono';
import { sValidator } from '@hono/standard-validator';
import { authMiddleware } from '../middlewares/authMiddleware';
import { containerMiddleware } from '../middlewares/containerMiddleware';
import { AssignClaimRequestSchema, DeviceSyncRequestSchema, SendNotificationRequestSchema, RevokeClaimRequestSchema, CreateOrderRequestSchema, ProcessPaymentRequestSchema, CreateBlogPostRequestSchema, UpdateBlogPostRequestSchema, RefundPaymentRequestSchema, CreateBlogCommentRequestSchema } from '../domain/types';
import { ValidationError } from '../domain/errors';
import { ApiControllers } from '../controllers/apiControllers';

const api = new Hono<{ Bindings: CloudflareBindings }>();

// Bind the Clean Architecture container middleware
api.use('*', containerMiddleware());

// Bind our optional-bearer auth middleware globally across all /api endpoints
api.use('*', authMiddleware());

/**
 * GET /api/me
 * Decodes the calling user's current token claims, and also does a fresh lookup
 * in Firebase Auth DB to get their absolute latest claims.
 */
api.get('/me', ApiControllers.getMe);

/**
 * POST /api/claims/assign
 * Assigns owner ('o'), moderator ('m'), or staff ('s') for a given business ID to targetEmail.
 */
api.post(
  '/claims/assign',
  sValidator('json', AssignClaimRequestSchema, (result, c) => {
    if (!result.success) {
      throw new ValidationError('Validation failed', result.issues);
    }
  }),
  ApiControllers.assignClaims
);

/**
 * POST /api/claims/revoke
 * Revokes custom role claims for a specific user and business ID from both Firebase and D1.
 */
api.post(
  '/claims/revoke',
  sValidator('json', RevokeClaimRequestSchema, (result, c) => {
    if (!result.success) {
      throw new ValidationError('Validation failed', result.issues);
    }
  }),
  ApiControllers.revokeClaims
);

/**
 * GET /api/users/phone
 * Retrieves a user account from Firebase matching the specified phone number.
 */
api.get('/users/phone', ApiControllers.getUserByPhone);

/**
 * Blogger Posts CRUD API Routes
 * Only Super Admins, Business Owners, or Managers can manage blogs they belong to.
 */
api.post(
  '/blogs/:blogId/posts',
  sValidator('json', CreateBlogPostRequestSchema, (result, c) => {
    if (!result.success) {
      throw new ValidationError('Validation failed', result.issues);
    }
  }),
  ApiControllers.createBlogPost
);

api.put(
  '/blogs/:blogId/posts/:postId',
  sValidator('json', UpdateBlogPostRequestSchema, (result, c) => {
    if (!result.success) {
      throw new ValidationError('Validation failed', result.issues);
    }
  }),
  ApiControllers.updateBlogPost
);

api.get('/blogs/:blogId/posts/:postId', ApiControllers.getBlogPost);
api.delete('/blogs/:blogId/posts/:postId', ApiControllers.deleteBlogPost);

/**
 * GET /api/business/:id/users
 * Retrieves all users (emails, roles) mapped to a specific business ID from D1.
 */
api.get('/business/:id/users', ApiControllers.getBusinessUsers);

/**
 * POST /api/devices/sync
 * Unified session, browser, and FCM token tracker.
 */
api.post(
  '/devices/sync',
  sValidator('json', DeviceSyncRequestSchema, (result, c) => {
    if (!result.success) {
      throw new ValidationError('Validation failed', result.issues);
    }
  }),
  ApiControllers.syncDeviceSession
);

/**
 * POST /api/notifications/send
 * Exposes push notification delivery to target uids, restricted to Super Admins, Owners, or Managers.
 */
api.post(
  '/notifications/send',
  sValidator('json', SendNotificationRequestSchema, (result, c) => {
    if (!result.success) {
      throw new ValidationError('Validation failed', result.issues);
    }
  }),
  ApiControllers.sendPushNotification
);

/**
 * POST /api/orders
 * Creates a new order for a specific business.
 */
api.post(
  '/orders',
  sValidator('json', CreateOrderRequestSchema, (result, c) => {
    if (!result.success) {
      throw new ValidationError('Validation failed', result.issues);
    }
  }),
  ApiControllers.createOrder
);

/**
 * GET /api/orders
 * Retrieves orders for a specific business, or all orders globally for Super Admin.
 */
api.get('/orders', ApiControllers.getOrders);

/**
 * POST /api/payments/process
 * Processes payment for a specific order.
 */
api.post(
  '/payments/process',
  sValidator('json', ProcessPaymentRequestSchema, (result, c) => {
    if (!result.success) {
      throw new ValidationError('Validation failed', result.issues);
    }
  }),
  ApiControllers.processPayment
);

/**
 * POST /api/payments/refund
 * Processes refund for a specific payment.
 */
api.post(
  '/payments/refund',
  sValidator('json', RefundPaymentRequestSchema, (result, c) => {
    if (!result.success) {
      throw new ValidationError('Validation failed', result.issues);
    }
  }),
  ApiControllers.refundPayment
);

/**
 * GET /api/blogs/:blogId/posts/:postId/comments
 * Retrieves list of comments for a specific post.
 */
api.get('/blogs/:blogId/posts/:postId/comments', ApiControllers.listComments);

/**
 * POST /api/blogs/:blogId/posts/:postId/comments
 * Submits a new comment for a specific post.
 */
api.post(
  '/blogs/:blogId/posts/:postId/comments',
  sValidator('json', CreateBlogCommentRequestSchema, (result, c) => {
    if (!result.success) {
      throw new ValidationError('Validation failed', result.issues);
    }
  }),
  ApiControllers.createComment
);

/**
 * GET /api/payments
 * Sample payments endpoint where Authorization is a plus but not compulsory.
 */
api.get('/payments', ApiControllers.getPayments);

export default api;
