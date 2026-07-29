import { verifyFirebaseIdToken, FirebaseServiceAccount } from './firebaseUtils';
import { UserContext, CustomClaims, CustomClaimsSchema } from '../domain/types';
import { AuthenticationError } from '../domain/errors';

export class TokenService {
  private serviceAccount: FirebaseServiceAccount;
  private superAdminsList: string[];

  constructor(serviceAccount: FirebaseServiceAccount, superAdminsStr: string) {
    this.serviceAccount = serviceAccount;
    this.superAdminsList = superAdminsStr
      ? superAdminsStr.split(',').map((e) => e.trim().toLowerCase())
      : [];
  }

  /**
   * Decodes and verifies a Firebase Bearer ID Token.
   * Maps it to a structured UserContext domain model.
   * Throws an AuthenticationError if token is invalid or expired.
   */
  public async verifyToken(token: string): Promise<UserContext> {
    try {
      const projectId = this.serviceAccount.project_id;
      const decoded = await verifyFirebaseIdToken(token, projectId);

      // Map raw claims into domain-compliant CustomClaims types
      let claims: CustomClaims = { o: [], m: [], s: [] };
      const rawClaims = {
        o: decoded.o,
        m: decoded.m,
        s: decoded.s,
      };

      const claimsParse = CustomClaimsSchema.safeParse(rawClaims);
      if (claimsParse.success) {
        claims = claimsParse.data;
      }

      const email = decoded.email || '';
      const isSuperAdmin = this.superAdminsList.includes(email.trim().toLowerCase());

      return {
        uid: decoded.uid,
        email,
        isSuperAdmin,
        claims,
      };
    } catch (err: any) {
      throw new AuthenticationError(err.message);
    }
  }
}
