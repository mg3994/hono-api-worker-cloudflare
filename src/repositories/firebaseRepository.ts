import { FirebaseServiceAccount, getGoogleAccessToken } from '../services/firebaseUtils';
import { CustomClaims, CustomClaimsSchema } from '../domain/types';

export interface FirebaseUserRecord {
  localId: string;
  email: string;
  customAttributes?: string; // stringified custom claims JSON
}

export interface IFirebaseRepository {
  getUserByEmail(email: string): Promise<FirebaseUserRecord | null>;
  setCustomClaims(uid: string, claims: CustomClaims): Promise<void>;
}

export class FirebaseRepository implements IFirebaseRepository {
  private serviceAccount: FirebaseServiceAccount;

  constructor(serviceAccount: FirebaseServiceAccount) {
    this.serviceAccount = serviceAccount;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const accessToken = await getGoogleAccessToken(this.serviceAccount);
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
        email: [email],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firebase accounts:lookup failed: ${errText}`);
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
        localId: uid,
        customAttributes: JSON.stringify(claims),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firebase accounts:setAccountInfo failed: ${errText}`);
    }
  }
}
