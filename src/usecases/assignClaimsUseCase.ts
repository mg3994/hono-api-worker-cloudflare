import { IFirebaseRepository } from '../repositories/firebaseRepository';
import { ClaimsService } from '../services/claimsService';
import { CustomClaims, CustomClaimsSchema, AssignClaimRequest, UserContext } from '../domain/types';

export class AssignClaimsUseCase {
  private firebaseRepo: IFirebaseRepository;
  private claimsService: ClaimsService;

  constructor(firebaseRepo: IFirebaseRepository, claimsService: ClaimsService) {
    this.firebaseRepo = firebaseRepo;
    this.claimsService = claimsService;
  }

  /**
   * Assigns custom claims (owner, moderator, staff) of a business ID to a target email.
   *
   * Permission Rules:
   * 1. If calling user is a Super Admin:
   *    - Allowed to assign any claim (o, m, s) for any business ID to any user.
   * 2. If calling user is NOT a Super Admin, but is an Owner ('o') of the requested business ID:
   *    - Allowed to assign any role ('o', 'm', 's') for that business ID to OTHER users.
   *    - Enforces: Owner CANNOT assign themselves to a lower/different role of their own business.
   *      Wait, is the check "owner cannot assign *themselves* as moderator or staff of its own business"?
   *      Yes: "make sure owner can't assign itself as a moderator or staff of its own business"
   *      Wait! We should block any owner of a business from self-assigning/modifying their own role to 'm' or 's' for that business.
   * 3. If calling user is NOT a Super Admin and NOT an Owner of the business ID:
   *    - Forbidden.
   */
  async execute(caller: UserContext, request: AssignClaimRequest): Promise<CustomClaims> {
    const { targetEmail, role, businessId } = request;

    // Check permissions
    const isSuperAdmin = caller.isSuperAdmin;
    const isOwnerOfBusiness = caller.claims?.o?.includes(businessId) || false;

    if (!isSuperAdmin && !isOwnerOfBusiness) {
      throw new Error('Permission denied: You must be a Super Admin or an Owner of this business to assign roles.');
    }

    // Owner cannot assign itself as a moderator or staff of its own business
    // We should check if the targetEmail belongs to the caller's email, and they are trying to assign m or s.
    if (caller.email.toLowerCase() === targetEmail.toLowerCase()) {
      if (role !== 'o') {
        throw new Error('Permission denied: An Owner cannot assign themselves as a moderator or staff of their own business.');
      }
    }

    // Fetch target user from firebase repository
    const targetUser = await this.firebaseRepo.getUserByEmail(targetEmail);
    if (!targetUser) {
      throw new Error(`User with email "${targetEmail}" was not found in Firebase Auth.`);
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
