import { Hono } from 'hono';
import { sValidator } from '@hono/standard-validator';
import { authMiddleware } from '../middlewares/authMiddleware';
import { containerMiddleware } from '../middlewares/containerMiddleware';
import { AssignClaimRequestSchema, DeviceSyncRequestSchema, SendNotificationRequestSchema } from '../domain/types';
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
 * GET /api/payments
 * Sample payments endpoint where Authorization is a plus but not compulsory.
 */
api.get('/payments', ApiControllers.getPayments);

export default api;
