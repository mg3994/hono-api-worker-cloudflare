import { IFirebaseRepository } from '../domain/firebaseRepository';
import { IClaimsService } from '../domain/claimsService';
import { CustomClaims } from '../domain/types';

export class GetUserClaimsUseCase {
  private firebaseRepo: IFirebaseRepository;
  private claimsService: IClaimsService;

  constructor(firebaseRepo: IFirebaseRepository, claimsService: IClaimsService) {
    this.firebaseRepo = firebaseRepo;
    this.claimsService = claimsService;
  }

  /**
   * Looks up the user's custom claims directly from Firebase.
   * This is useful to get the absolute latest claims even if the ID token hasn't refreshed.
   */
  async execute(email: string): Promise<CustomClaims> {
    const targetUser = await this.firebaseRepo.getUserByEmail(email);
    if (!targetUser) {
      return { o: [], m: [], s: [] };
    }

    // Safely parse user's custom claims using centralized claims parsing service
    return this.claimsService.parseClaims(targetUser.customAttributes);
  }
}
