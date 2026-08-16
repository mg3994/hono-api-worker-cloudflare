import { IFirebaseRepository, FirebaseUserRecord } from '../domain/firebaseRepository';
import { UserContext } from '../domain/types';
import { PermissionDeniedError } from '../domain/errors';

export class LinkUserPhoneUseCase {
  private firebaseRepo: IFirebaseRepository;

  constructor(firebaseRepo: IFirebaseRepository) {
    this.firebaseRepo = firebaseRepo;
  }

  /**
   * Links or updates a phone number on a user account.
   * Access Controls: Super Admins, Business Owners, or Managers can perform this action.
   */
  async execute(caller: UserContext, uid: string, phoneNumber: string): Promise<FirebaseUserRecord> {
    const isSuperAdmin = caller.isSuperAdmin;
    const isOwnerOrManager =
      (caller.claims?.o && caller.claims.o.length > 0) ||
      (caller.claims?.m && caller.claims.m.length > 0) ||
      false;

    if (!isSuperAdmin && !isOwnerOrManager) {
      throw new PermissionDeniedError('Permission denied: Only Super Admins, Business Owners, or Managers can link phone numbers to accounts.');
    }

    if (!uid) {
      throw new Error('User UID (localId) is required.');
    }
    if (!phoneNumber) {
      throw new Error('Phone number is required.');
    }

    return this.firebaseRepo.linkPhone(uid, phoneNumber);
  }
}
