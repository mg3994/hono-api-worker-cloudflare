import { IFirebaseTokenVerifier } from './firebaseTokenVerifier';
import { UserContext, CustomClaims, CustomClaimsSchema } from '../domain/types';
import { AuthenticationError } from '../domain/errors';

export class TokenService {
  private tokenVerifier: IFirebaseTokenVerifier;
  private projectId: string;
  private superAdminsList: string[];

  constructor(tokenVerifier: IFirebaseTokenVerifier, projectId: string, superAdminsStr: string) {
    this.tokenVerifier = tokenVerifier;
    this.projectId = projectId;
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
      const decoded = await this.tokenVerifier.verifyToken(token, this.projectId);

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
