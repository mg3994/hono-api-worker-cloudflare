import { CustomClaims, CustomClaimsSchema } from '../domain/types';
import { LimitExceededError } from '../domain/errors';

export class ClaimsService {
  /**
   * Safely parses and validates a stringified custom claims JSON from Firebase Auth.
   * Returns a valid CustomClaims object with default arrays if empty or invalid.
   */
  public parseClaims(customAttributes?: string): CustomClaims {
    const defaults: CustomClaims = { o: [], m: [], s: [] };
    if (!customAttributes) {
      return defaults;
    }

    try {
      const parsed = JSON.parse(customAttributes);
      const parsedResult = CustomClaimsSchema.safeParse(parsed);
      if (parsedResult.success) {
        return parsedResult.data;
      }
    } catch (err) {
      // Fallback to empty if parse or validation fails
    }

    return defaults;
  }

  /**
   * Promotes or demotes a user for a given business ID.
   * Removes the business ID from all other roles (o, m, s) to ensure they have exactly one role.
   * Then appends the business ID to the desired role.
   *
   * Enforces constraints:
   * 1. Compact claims to keep under 1000-byte Firebase limit (max unique business ID assignments across o, m, s).
   * 2. Returns the modified CustomClaims object.
   */
  public updateBusinessRole(
    currentClaims: CustomClaims,
    businessId: string,
    role: 'o' | 'm' | 's',
    maxLimit: number = 20
  ): CustomClaims {
    // 1. Initialize clean copies of arrays, filtering out the business ID if it exists
    const o = (currentClaims.o || []).filter((id) => id !== businessId);
    const m = (currentClaims.m || []).filter((id) => id !== businessId);
    const s = (currentClaims.s || []).filter((id) => id !== businessId);

    // 2. Add the business ID to the selected target role array
    if (role === 'o') {
      o.push(businessId);
    } else if (role === 'm') {
      m.push(businessId);
    } else if (role === 's') {
      s.push(businessId);
    }

    // 3. Count total entries to ensure we respect limit of maxLimit
    const totalEntries = o.length + m.length + s.length;
    if (totalEntries > maxLimit) {
      throw new LimitExceededError(`Limit exceeded: A user cannot be assigned to more than ${maxLimit} total businesses across all roles.`);
    }

    return {
      o: Array.from(new Set(o)),
      m: Array.from(new Set(m)),
      s: Array.from(new Set(s)),
    };
  }
}
