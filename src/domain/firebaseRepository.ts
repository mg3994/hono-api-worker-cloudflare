import { CustomClaims } from './types';

export interface FirebaseUserRecord {
  /**
   * The unique Firebase Auth User ID (UID).
   * In raw Firebase Identity Toolkit REST APIs, this is named `localId`.
   */
  localId: string;
  email: string;
  customAttributes?: string; // stringified custom claims JSON
}

export interface IFirebaseRepository {
  getUserByEmail(email: string): Promise<FirebaseUserRecord | null>;
  setCustomClaims(uid: string, claims: CustomClaims): Promise<void>;
}
