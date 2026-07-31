import { IFirebaseRepository, FirebaseUserRecord } from '../domain/firebaseRepository';
import { IGoogleAuthService } from '../services/googleAuthService';
import { CustomClaims, FirebaseServiceAccount } from '../domain/types';

export class FirebaseRepository implements IFirebaseRepository {
  private googleAuthService: IGoogleAuthService;
  private projectId: string;

  constructor(googleAuthService: IGoogleAuthService, serviceAccount: FirebaseServiceAccount) {
    this.googleAuthService = googleAuthService;
    this.projectId = serviceAccount.project_id;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const accessToken = await this.googleAuthService.getAccessToken();
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async getUserByEmail(email: string): Promise<FirebaseUserRecord | null> {
    const headers = await this.getHeaders();
    const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        targetProjectId: this.projectId,
        email: [email],
      }),
      signal: AbortSignal.timeout(5000), // 5s timeout safeguard
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firebase accounts:lookup by email failed: ${errText}`);
    }

    const data = (await response.json()) as { users?: FirebaseUserRecord[] };
    if (!data.users || data.users.length === 0) {
      return null;
    }

    return data.users[0];
  }

  async getUserByUid(uid: string): Promise<FirebaseUserRecord | null> {
    const headers = await this.getHeaders();
    const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        targetProjectId: this.projectId,
        localId: [uid],
      }),
      signal: AbortSignal.timeout(5000), // 5s timeout safeguard
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firebase accounts:lookup by UID failed: ${errText}`);
    }

    const data = (await response.json()) as { users?: FirebaseUserRecord[] };
    if (!data.users || data.users.length === 0) {
      return null;
    }

    return data.users[0];
  }

  async setCustomClaims(uid: string, claims: CustomClaims): Promise<void> {
    const headers = await this.getHeaders();
    const url = 'https://identitytoolkit.googleapis.com/v1/accounts:setAccountInfo';

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        targetProjectId: this.projectId,
        localId: uid, // localId is the UID in the Google REST API
        customAttributes: JSON.stringify(claims),
      }),
      signal: AbortSignal.timeout(5000), // 5s timeout safeguard
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firebase accounts:setAccountInfo failed: ${errText}`);
    }
  }
}
