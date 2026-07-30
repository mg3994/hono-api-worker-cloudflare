import { CustomClaims } from './types';

export interface IClaimsService {
  parseClaims(customAttributes?: string): CustomClaims;
  updateBusinessRole(
    currentClaims: CustomClaims,
    businessId: string,
    role: 'o' | 'm' | 's',
    maxLimit?: number
  ): CustomClaims;
}
