import { IFirebaseRepository, FirebaseUserRecord } from '../domain/firebaseRepository';
import { UserContext } from '../domain/types';
import { PermissionDeniedError } from '../domain/errors';

export class CreateFirebaseUserUseCase {
  private firebaseRepo: IFirebaseRepository;

  constructor(firebaseRepo: IFirebaseRepository) {
    this.firebaseRepo = firebaseRepo;
  }

  /**
   * Creates a new Firebase Auth user account.
   * Access Controls: Super Admins, Business Owners, or Managers can perform this action.
   */
  async execute(
    caller: UserContext,
    email: string,
    password?: string,
    phoneNumber?: string
  ): Promise<FirebaseUserRecord> {
    const isSuperAdmin = caller.isSuperAdmin;
    const isOwnerOrManager =
      (caller.claims?.o && caller.claims.o.length > 0) ||
      (caller.claims?.m && caller.claims.m.length > 0) ||
      false;

    if (!isSuperAdmin && !isOwnerOrManager) {
      throw new PermissionDeniedError('Permission denied: Only Super Admins, Business Owners, or Managers can create new firebase users.');
    }

    if (!email) {
      throw new Error('Email is required to create a new user.');
    }

    return this.firebaseRepo.createUser(email, password, phoneNumber);
  }
}
