import { IFirebaseRepository } from '../repositories/firebaseRepository';
import { ClaimsService } from '../services/claimsService';
import { CustomClaims, CustomClaimsSchema, AssignClaimRequest, UserContext } from '../domain/types';
import { PermissionDeniedError, UserNotFoundError } from '../domain/errors';

export class AssignClaimsUseCase {
  private firebaseRepo: IFirebaseRepository;
  private claimsService: ClaimsService;

  constructor(firebaseRepo: IFirebaseRepository, claimsService: ClaimsService) {
    this.firebaseRepo = firebaseRepo;
    this.claimsService = claimsService;
  }

  /**
   * Assigns custom claims (owner, moderator, staff) of a business ID to a target email.
   */
  async execute(caller: UserContext, request: AssignClaimRequest): Promise<CustomClaims> {
    const { targetEmail, role, businessId } = request;

    // Check permissions
    const isSuperAdmin = caller.isSuperAdmin;
    const isOwnerOfBusiness = caller.claims?.o?.includes(businessId) || false;

    if (!isSuperAdmin && !isOwnerOfBusiness) {
      throw new PermissionDeniedError('Permission denied: You must be a Super Admin or an Owner of this business to assign roles.');
    }

    // Owner cannot assign itself as a moderator or staff of its own business
    if (caller.email.toLowerCase() === targetEmail.toLowerCase()) {
      if (role !== 'o') {
        throw new PermissionDeniedError('Permission denied: An Owner cannot assign themselves as a moderator or staff of their own business.');
      }
    }

    // Fetch target user from firebase repository
    const targetUser = await this.firebaseRepo.getUserByEmail(targetEmail);
    if (!targetUser) {
      throw new UserNotFoundError(`User with email "${targetEmail}" was not found in Firebase Auth.`);
    }

    // Parse target user's existing custom claims
    let currentClaims: CustomClaims = { o: [], m: [], s: [] };
    if (targetUser.customAttributes) {
      try {
        const parsed = JSON.parse(targetUser.customAttributes);
        const parsedResult = CustomClaimsSchema.safeParse(parsed);
        if (parsedResult.success) {
          currentClaims = parsedResult.data;
        }
      } catch (err) {
        // Fallback to empty if parse fails
      }
    }

    // Determine the updated claims using the ClaimsService promotion/demotion logic
    const updatedClaims = this.claimsService.updateBusinessRole(currentClaims, businessId, role);

    // Save claims to Firebase auth
    await this.firebaseRepo.setCustomClaims(targetUser.localId, updatedClaims);

    return updatedClaims;
  }
}
