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
    message: string;
    details?: any;
  };
}
