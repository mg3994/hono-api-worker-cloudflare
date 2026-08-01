import { CustomClaims } from './types';

export interface CompanyUserRoleRecord {
  uid: string;
  email: string;
  businessId: string;
  role: 'o' | 'm' | 's';
  updatedAt: number;
}

export interface ICompanyRepository {
  /**
   * Synchronizes the target user's custom claims to the D1 database.
   * Parses the Claims object and inserts/replaces rows in `user_business_roles`.
   */
  syncClaimsToD1(uid: string, email: string, claims: CustomClaims): Promise<void>;

  /**
   * Retrieves all users (emails and roles) for a specific business ID from D1.
   */
  getBusinessUsers(businessId: string): Promise<CompanyUserRoleRecord[]>;
}
