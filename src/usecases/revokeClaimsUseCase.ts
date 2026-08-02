import { IFirebaseRepository } from '../domain/firebaseRepository';
import { IClaimsService } from '../domain/claimsService';
import { ICompanyRepository } from '../domain/companyRepository';
import { ILogger } from '../domain/logger';
import { CustomClaims, RevokeClaimRequest, UserContext } from '../domain/types';
import { PermissionDeniedError, UserNotFoundError } from '../domain/errors';

export class RevokeClaimsUseCase {
  private firebaseRepo: IFirebaseRepository;
  private claimsService: IClaimsService;
  private logger?: ILogger;
  private companyRepo?: ICompanyRepository;

  constructor(
    firebaseRepo: IFirebaseRepository,
    claimsService: IClaimsService,
    logger?: ILogger,
    companyRepo?: ICompanyRepository
  ) {
    this.firebaseRepo = firebaseRepo;
    this.claimsService = claimsService;
    this.logger = logger;
    this.companyRepo = companyRepo;
  }

  /**
   * Completely revokes/deletes all roles associated with a specific business ID for a target email.
   *
   * Rules:
   * 1. Super Admins can revoke roles for any business ID.
   * 2. Owners (o) of a business can revoke roles for other users in that business.
   * 3. Only Super Admins can revoke/remove an existing Owner role ('o') for any business.
   */
  async execute(caller: UserContext, request: RevokeClaimRequest): Promise<CustomClaims> {
    const { targetEmail, businessId } = request;

    // Check permissions
    const isSuperAdmin = caller.isSuperAdmin;
    const isOwnerOfBusiness = caller.claims?.o?.includes(businessId) || false;

    if (!isSuperAdmin && !isOwnerOfBusiness) {
      throw new PermissionDeniedError('Permission denied: You must be a Super Admin or an Owner of this business to revoke roles.');
    }

    // Fetch target user from firebase repository
    const targetUser = await this.firebaseRepo.getUserByEmail(targetEmail);
    if (!targetUser) {
      throw new UserNotFoundError(`User with email "${targetEmail}" was not found in Firebase Auth.`);
    }

    // Safely parse target user's existing custom claims
    const currentClaims = this.claimsService.parseClaims(targetUser.customAttributes);

    // Rule: Only Super Admins can demote or remove an existing Owner role ('o')
    const targetIsCurrentlyOwner = currentClaims.o?.includes(businessId) || false;
    if (targetIsCurrentlyOwner && !isSuperAdmin) {
      throw new PermissionDeniedError('Permission denied: Only Super Admins are authorized to remove or demote an Owner role.');
    }

    // Trace roles being removed for audit logs
    const removedRoles: string[] = [];
    if (currentClaims.o?.includes(businessId)) removedRoles.push('o');
    if (currentClaims.m?.includes(businessId)) removedRoles.push('m');
    if (currentClaims.s?.includes(businessId)) removedRoles.push('s');

    // Revoke target businessId using ClaimsService
    const updatedClaims = this.claimsService.revokeBusinessRole(currentClaims, businessId);

    // Save claims to Firebase Auth
    await this.firebaseRepo.setCustomClaims(targetUser.localId, updatedClaims);

    // Synchronize role deletion to Cloudflare D1 SQL repository
    if (this.companyRepo) {
      try {
        await this.companyRepo.syncClaimsToD1(targetUser.localId, targetUser.email, updatedClaims);
      } catch (err: any) {
        this.logger?.warn(`D1 sync failed during claims revocation: ${err.message}`);
      }
    }

    // Descriptive logging via UTC Console Logger
    this.logger?.info(
      `AUDIT LOG: Caller <${caller.email}> completely REVOKED all roles on Business ID <${businessId}> for Target User <${targetEmail}>. Roles Revoked: [${removedRoles.join(', ')}].`
    );

    return updatedClaims;
  }
}
