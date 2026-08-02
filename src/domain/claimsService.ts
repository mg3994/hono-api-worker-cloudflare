import { CustomClaims } from './types';

export interface IClaimsService {
  parseClaims(customAttributes?: string): CustomClaims;
  updateBusinessRole(
    currentClaims: CustomClaims,
    businessId: string,
    role: 'o' | 'm' | 's',
    maxLimit?: number
  ): CustomClaims;

  /**
   * Completely revokes/removes a business ID from all of the user's role arrays (o, m, s).
   */
  revokeBusinessRole(currentClaims: CustomClaims, businessId: string): CustomClaims;
}
