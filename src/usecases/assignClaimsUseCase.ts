import { IFirebaseRepository } from '../repositories/firebaseRepository';
import { IClaimsService } from '../domain/claimsService';
import { ILogger } from '../domain/logger';
import { CustomClaims, AssignClaimRequest, UserContext } from '../domain/types';
import { PermissionDeniedError, UserNotFoundError } from '../domain/errors';

export class AssignClaimsUseCase {
  private firebaseRepo: IFirebaseRepository;
  private claimsService: IClaimsService;
  private logger: ILogger;
  private maxLimit: number;

  constructor(
    firebaseRepo: IFirebaseRepository,
    claimsService: IClaimsService,
    logger: ILogger,
    maxLimit: number = 20
  ) {
    this.firebaseRepo = firebaseRepo;
    this.claimsService = claimsService;
    this.logger = logger;
    this.maxLimit = maxLimit;
  }

  /**
   * Assigns custom claims (owner, moderator, staff) of a business ID to a target email.
   *
   * Rules:
   * 1. Super Admins can assign any role (o, m, s) for any business ID to any user, and can remove/demote Owner roles.
   * 2. Owners (o) of a business can assign other owners, moderators, or staff to that business.
   * 3. Owners CANNOT downgrade themselves or assign themselves to other roles (m or s) for that business.
   * 4. Only Super Admins can remove or demote an existing Owner role ('o') for any business.
   */
  async execute(caller: UserContext, request: AssignClaimRequest): Promise<CustomClaims> {
    const { targetEmail, role, businessId } = request;

    // Check permissions
    const isSuperAdmin = caller.isSuperAdmin;
    const isOwnerOfBusiness = caller.claims?.o?.includes(businessId) || false;

    if (!isSuperAdmin && !isOwnerOfBusiness) {
      throw new PermissionDeniedError('Permission denied: You must be a Super Admin or an Owner of this business to assign roles.');
    }

    // Owner cannot downgrade themselves or assign themselves to other roles (m, s) for that business
    if (caller.email.toLowerCase() === targetEmail.toLowerCase()) {
      if (role !== 'o') {
        throw new PermissionDeniedError('Permission denied: An Owner cannot downgrade themselves or assign themselves to other roles for their own business.');
      }
    }

    // Fetch target user from firebase repository
    const targetUser = await this.firebaseRepo.getUserByEmail(targetEmail);
    if (!targetUser) {
      throw new UserNotFoundError(`User with email "${targetEmail}" was not found in Firebase Auth.`);
    }

    // Safely parse target user's existing custom claims (using centralized DRY ClaimsService)
    const currentClaims = this.claimsService.parseClaims(targetUser.customAttributes);

    // Rule: "only super admin can remove the role of owner (i mean only super admin can remove custom claims of owner)"
    // Check if the target user currently has 'o' (Owner) for this businessId
    const targetIsCurrentlyOwner = currentClaims.o?.includes(businessId) || false;
    // If they are currently owner, and the new requested role is NOT 'o' (meaning they are being removed/demoted from 'o')
    if (targetIsCurrentlyOwner && role !== 'o') {
      if (!isSuperAdmin) {
        throw new PermissionDeniedError('Permission denied: Only Super Admins are authorized to remove or demote an Owner role.');
      }
    }

    // Audit trace calculations: Find out what roles are being removed before we merge
    const removedRoles: string[] = [];
    if (currentClaims.o?.includes(businessId)) removedRoles.push('o');
    if (currentClaims.m?.includes(businessId)) removedRoles.push('m');
    if (currentClaims.s?.includes(businessId)) removedRoles.push('s');

    // Determine the updated claims using the ClaimsService promotion/demotion logic
    const updatedClaims = this.claimsService.updateBusinessRole(currentClaims, businessId, role, this.maxLimit);

    // Save claims to Firebase auth
    await this.firebaseRepo.setCustomClaims(targetUser.localId, updatedClaims);

    // Descriptive logging for upgrades/demotions/assignments via injected audit logger
    this.logger.info(
      `AUDIT LOG: Caller <${caller.email}> assigned Role <${role}> on Business ID <${businessId}> for Target User <${targetEmail}>. Previous Roles Removed: [${removedRoles.join(', ')}].`
    );

    return updatedClaims;
  }
}
