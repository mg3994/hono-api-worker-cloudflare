import { z } from 'zod';

export const CustomClaimsSchema = z.object({
  o: z.array(z.string()).optional().default([]),
  m: z.array(z.string()).optional().default([]),
  s: z.array(z.string()).optional().default([]),
});

export type CustomClaims = z.infer<typeof CustomClaimsSchema>;

export const AssignClaimRequestSchema = z.object({
  targetEmail: z.string().email({ message: 'Invalid target email address' }),
  role: z.enum(['o', 'm', 's'], { message: "Role must be 'o', 'm', or 's'" }),
  businessId: z.string().min(1, { message: 'Business ID cannot be empty' }),
});

export type AssignClaimRequest = z.infer<typeof AssignClaimRequestSchema>;

export const RevokeClaimRequestSchema = z.object({
  targetEmail: z.string().email({ message: 'Invalid target email address' }),
  businessId: z.string().min(1, { message: 'Business ID cannot be empty' }),
});

export type RevokeClaimRequest = z.infer<typeof RevokeClaimRequestSchema>;

export const DeviceSyncRequestSchema = z.object({
  action: z.enum(['SYNC_DEVICE', 'LOGOUT_DEVICE'], { message: "Action must be 'SYNC_DEVICE' or 'LOGOUT_DEVICE'" }),
  clientId: z.string().min(1, { message: 'clientId cannot be empty' }),
  idToken: z.string().optional(),
  deviceToken: z.string().optional(),
  clientName: z.string().optional(),
});

export type DeviceSyncRequest = z.infer<typeof DeviceSyncRequestSchema>;

export const SendNotificationRequestSchema = z.object({
  targetUid: z.string().min(1, { message: 'targetUid cannot be empty' }),
  businessId: z.string().optional(),
  title: z.string().min(1, { message: 'title cannot be empty' }),
  body: z.string().min(1, { message: 'body cannot be empty' }),
  imageUrl: z.string().optional(),
  deepLinkUrl: z.string().optional(),
  customData: z.record(z.string()).optional(),
});

export type SendNotificationRequest = z.infer<typeof SendNotificationRequestSchema>;

export const CreateOrderRequestSchema = z.object({
  businessId: z.string().min(1, { message: 'businessId cannot be empty' }),
  amount: z.number().positive({ message: 'Amount must be a positive number' }),
});

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const ProcessPaymentRequestSchema = z.object({
  orderId: z.string().min(1, { message: 'orderId cannot be empty' }),
  amount: z.number().positive({ message: 'Amount must be a positive number' }),
  method: z.enum(['card', 'bank', 'crypto', 'google_pay', 'apple_pay'], { message: "Method must be 'card', 'bank', 'crypto', 'google_pay', or 'apple_pay'" }),

  // Rich Google Pay Payload Fields (Google Pay Web API specs)
  googlePayPayload: z.object({
    apiVersion: z.number().optional(),
    apiVersionMinor: z.number().optional(),
    paymentMethodData: z.object({
      type: z.string().optional(),
      description: z.string().optional(),
      info: z.any().optional(),
      tokenizationData: z.object({
        type: z.string().optional(),
        token: z.string().optional(), // containing encrypted token or Tez UPI response JSON
      }).optional(),
    }).optional(),
  }).optional(),

  // Rich Apple Pay PKPaymentToken Fields
  applePayPayload: z.object({
    token: z.object({
      paymentData: z.any().optional(),
      paymentMethod: z.any().optional(),
      transactionIdentifier: z.string().optional(),
    }).optional(),
  }).optional(),

  // Rich Gateway Response details (from CyberSource/Stripe/etc)
  gatewayResponse: z.object({
    id: z.string().optional(),
    status: z.string().optional(),
    receipt_number: z.string().optional(), // Bank RRN/ARN
    authorization_code: z.string().optional(),
    network_transaction_id: z.string().optional(),
  }).optional(),
});

export type ProcessPaymentRequest = z.infer<typeof ProcessPaymentRequestSchema>;

export const CreateBlogPostRequestSchema = z.object({
  title: z.string().min(1, { message: 'Title cannot be empty' }),
  content: z.string().min(1, { message: 'Content cannot be empty' }),
  labels: z.array(z.string()).optional(),
  isDraft: z.boolean().optional().default(false),
  publishDate: z.string().datetime({ message: 'Invalid RFC 3339 datetime format' }).optional(),
});

export type CreateBlogPostRequest = z.infer<typeof CreateBlogPostRequestSchema>;

export const UpdateBlogPostRequestSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  labels: z.array(z.string()).optional(),
  isDraft: z.boolean().optional(),
  publishDate: z.string().datetime({ message: 'Invalid RFC 3339 datetime format' }).optional(),
});

export type UpdateBlogPostRequest = z.infer<typeof UpdateBlogPostRequestSchema>;

export const CreateBlogCommentRequestSchema = z.object({
  content: z.string().min(1, { message: 'Comment content cannot be empty' }),
});

export type CreateBlogCommentRequest = z.infer<typeof CreateBlogCommentRequestSchema>;

export const CreateBlogRequestSchema = z.object({
  name: z.string().min(1, { message: 'Blog name cannot be empty' }),
  description: z.string().optional().default(''),
});

export type CreateBlogRequest = z.infer<typeof CreateBlogRequestSchema>;

export interface FirebaseServiceAccount {
  project_id: string;
  private_key: string;
  client_email: string;
}

export interface UserContext {
  uid: string;
  email: string;
  isSuperAdmin: boolean;
  claims: CustomClaims;
}

export interface OrderItemVerificationIssue {
  itemSkuOrId: string;
  type: 'price_mismatch' | 'out_of_stock' | 'business_closed' | 'other';
  message: string;
  expectedValue?: string | number;
  actualValue?: string | number;
}

export interface OrderVerificationResult {
  isValid: boolean;
  issues: OrderItemVerificationIssue[];
  details?: string;
}

export interface StandardResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
