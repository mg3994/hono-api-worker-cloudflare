import { IFirebaseRepository } from '../repositories/firebaseRepository';
import { UserContext, CustomClaims, CustomClaimsSchema } from '../domain/types';

export class GetUserClaimsUseCase {
  private firebaseRepo: IFirebaseRepository;

  constructor(firebaseRepo: IFirebaseRepository) {
    this.firebaseRepo = firebaseRepo;
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

    return currentClaims;
  }
}
