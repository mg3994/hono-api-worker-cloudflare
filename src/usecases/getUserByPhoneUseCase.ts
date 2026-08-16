import { IFirebaseRepository, FirebaseUserRecord } from '../domain/firebaseRepository';
import { UserContext } from '../domain/types';
import { PermissionDeniedError, ValidationError } from '../domain/errors';

export class GetUserByPhoneUseCase {
  private firebaseRepo: IFirebaseRepository;

  constructor(firebaseRepo: IFirebaseRepository) {
    this.firebaseRepo = firebaseRepo;
  }

  /**
   * Retrieves user details matching a phone number.
   * Access Controls: Only Super Admins, Business Owners ('o' claim exists), or Business Managers/Moderators ('m' claim exists).
   */
  async execute(caller: UserContext, phoneNumber: string): Promise<FirebaseUserRecord | null> {
    if (!phoneNumber || phoneNumber.trim() === '') {
      throw new ValidationError('Phone number query parameter is required and cannot be empty.');
    }

    const isSuperAdmin = caller.isSuperAdmin;
    const isOwner = (caller.claims?.o && caller.claims.o.length > 0) || false;
    const isManager = (caller.claims?.m && caller.claims.m.length > 0) || false;

    if (!isSuperAdmin && !isOwner && !isManager) {
      throw new PermissionDeniedError(
        'Permission denied: Only Super Admins, Business Owners, or Managers are authorized to lookup users by phone number.'
      );
    }

    return this.firebaseRepo.getUserByPhone(phoneNumber.trim());
  }
}
