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

export interface StandardResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
