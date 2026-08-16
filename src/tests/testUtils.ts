import { FirebaseServiceAccount } from '../domain/types';

/**
 * Standardized mock Firebase Service Account for testing.
 */
export const mockServiceAccount: FirebaseServiceAccount = {
  project_id: 'mock-test-project',
  client_email: 'mock-client@example.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSlAgEAAoIBAQC3\n-----END PRIVATE KEY-----',
};

/**
 * Standardized mock Cloudflare Bindings/Environment for integration tests.
 */
export const mockEnv = {
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(mockServiceAccount),
  SUPER_ADMINS: 'admin@test.com,admin1@test.com,admin2@test.com',
  MAX_ENTITIES_LIMIT: '20',
};

/**
 * Standardized Mock DB preparation helper.
 */
export function createMockD1() {
  const statements: { sql: string; params: any[] }[] = [];

  const db: any = {
    prepare: (sql: string) => {
      return {
        bind: (...params: any[]) => {
          return {
            sql,
            params,
            run: async () => {
              statements.push({ sql, params });
              return { success: true };
            },
            all: async () => {
              statements.push({ sql, params });

              if (sql.includes('device_token as deviceToken')) {
                return {
                  success: true,
                  results: [
                    { deviceToken: 'fcm_token_999' }
                  ]
                };
              }

              return {
                success: true,
                results: [
                  {
                    uid: 'uid_1',
                    email: 'test@example.com',
                    businessId: 'biz_123',
                    role: 'o',
                    updatedAt: 1234567,
                  },
                ],
              };
            },
          };
        },
        run: async () => {
          statements.push({ sql, params: [] });
          return { success: true };
        },
      };
    },
    batch: async (batchStatements: any[]) => {
      for (const stmt of batchStatements) {
        statements.push({ sql: stmt.sql, params: stmt.params });
      }
      return [];
    },
    statements,
  };

  return db;
}
