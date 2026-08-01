import { ICompanyRepository, CompanyUserRoleRecord } from '../domain/companyRepository';
import { CustomClaims } from '../domain/types';

export class CompanyRepository implements ICompanyRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Synchronizes the target user's custom claims to the D1 database.
   * Clears old rows and populates latest active assignments.
   */
  public async syncClaimsToD1(uid: string, email: string, claims: CustomClaims): Promise<void> {
    const updatedAt = Date.now();
    const statements: D1PreparedStatement[] = [];

    // 1. Delete all existing roles for this user in D1 to prepare for overwrite sync
    statements.push(
      this.db.prepare('DELETE FROM user_business_roles WHERE uid = ?').bind(uid)
    );

    // 2. Prepare insert statements for each role array
    if (claims.o && claims.o.length > 0) {
      for (const bizId of claims.o) {
        statements.push(
          this.db
            .prepare(
              'INSERT INTO user_business_roles (id, uid, email, business_id, role, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
            )
            .bind(`${uid}_${bizId}`, uid, email, bizId, 'o', updatedAt)
        );
      }
    }

    if (claims.m && claims.m.length > 0) {
      for (const bizId of claims.m) {
        statements.push(
          this.db
            .prepare(
              'INSERT INTO user_business_roles (id, uid, email, business_id, role, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
            )
            .bind(`${uid}_${bizId}`, uid, email, bizId, 'm', updatedAt)
        );
      }
    }

    if (claims.s && claims.s.length > 0) {
      for (const bizId of claims.s) {
        statements.push(
          this.db
            .prepare(
              'INSERT INTO user_business_roles (id, uid, email, business_id, role, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
            )
            .bind(`${uid}_${bizId}`, uid, email, bizId, 's', updatedAt)
        );
      }
    }

    // 3. Batch execute statements safely in D1 transaction
    if (statements.length > 0) {
      await this.db.batch(statements);
    }
  }

  /**
   * Retrieves all users (emails and roles) for a specific business ID from D1.
   */
  public async getBusinessUsers(businessId: string): Promise<CompanyUserRoleRecord[]> {
    const query = 'SELECT uid, email, business_id as businessId, role, updated_at as updatedAt FROM user_business_roles WHERE business_id = ?';
    const result = await this.db.prepare(query).bind(businessId).all<any>();

    return (result.results || []).map((row) => ({
      uid: row.uid,
      email: row.email,
      businessId: row.businessId,
      role: row.role,
      updatedAt: row.updatedAt,
    }));
  }
}
