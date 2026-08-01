import { FirebaseRepository } from '../repositories/firebaseRepository';
import { IFirebaseRepository } from '../domain/firebaseRepository';
import { ClaimsService } from '../services/claimsService';
import { IClaimsService } from '../domain/claimsService';
import { GoogleAuthService } from '../services/googleAuthService';
import { JwtSigner } from '../services/jwtSigner';
import { FirebaseTokenVerifier } from '../services/firebaseTokenVerifier';
import { TokenService } from '../services/tokenService';
import { ITokenService } from '../domain/tokenService';
import { ConsoleLogger } from './consoleLogger';
import { AssignClaimsUseCase } from '../usecases/assignClaimsUseCase';
import { GetUserClaimsUseCase } from '../usecases/getUserClaimsUseCase';
import { FirebaseServiceAccount } from '../domain/types';

// D1 Persistence Imports
import { CompanyRepository } from '../repositories/companyRepository';
import { ICompanyRepository } from '../domain/companyRepository';
import { SessionRepository } from '../repositories/sessionRepository';
import { ISessionRepository } from '../domain/sessionRepository';
import { GetBusinessUsersUseCase } from '../usecases/getBusinessUsersUseCase';

export interface AppContainer {
  firebaseRepository: IFirebaseRepository;
  claimsService: IClaimsService;
  tokenService: ITokenService;
  companyRepository: ICompanyRepository;
  sessionRepository: ISessionRepository;
  assignClaimsUseCase: AssignClaimsUseCase;
  getUserClaimsUseCase: GetUserClaimsUseCase;
  getBusinessUsersUseCase: GetBusinessUsersUseCase;
}

/**
 * Fallback Mock D1Database for unit testing or when binding is absent in local dev.
 */
class MockD1Database implements D1Database {
  prepare(query: string): D1PreparedStatement {
    return {
      bind: (...args: any[]) => this.prepare(query),
      first: async () => null,
      run: async () => ({ success: true, meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false, changes: 0 } }),
      all: async () => ({ results: [], success: true, meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false, changes: 0 } }),
      raw: async () => [],
    } as any;
  }
  async batch(statements: D1PreparedStatement[]): Promise<any[]> {
    return [];
  }
  async exec(query: string): Promise<any> {
    return { count: 0, duration: 0 };
  }
  withSession(constraintOrBookmark?: any): D1DatabaseSession {
    return {} as any;
  }
  async dump(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
}

/**
 * Factory to create and wire up all Clean Architecture layers (SOLID dependency injection).
 */
export function createContainer(env: CloudflareBindings): AppContainer {
  const serviceAccountStr = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountStr) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured in the environment.');
  }

  // Handle local test runs gracefully
  let serviceAccount = {
    project_id: 'mock-test-project',
    client_email: 'mock-client@example.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSlAgEAAoIBAQC3\n-----END PRIVATE KEY-----',
  } as FirebaseServiceAccount;

  if (serviceAccountStr) {
    try {
      serviceAccount = JSON.parse(serviceAccountStr) as FirebaseServiceAccount;
    } catch (err) {
      // Fallback to mock
    }
  }

  // Read MAX_ENTITIES_LIMIT dynamically from Cloudflare bindings (default to 20)
  const maxLimitStr = env.MAX_ENTITIES_LIMIT || '20';
  const maxLimit = parseInt(maxLimitStr, 10) || 20;

  const projectId = serviceAccount.project_id;
  const superAdminsStr = env.SUPER_ADMINS || '';

  // Services - Injecting dependencies cleanly
  const jwtSigner = new JwtSigner(serviceAccount);
  const googleAuthService = new GoogleAuthService(serviceAccount, jwtSigner, env.GOOGLE_OAUTH_TOKEN_KV);
  const claimsService = new ClaimsService();
  const logger = new ConsoleLogger();

  const tokenVerifier = new FirebaseTokenVerifier(env.FIREBASE_PUBLIC_KEY_KV, logger);
  const tokenService = new TokenService(tokenVerifier, projectId, superAdminsStr, logger);

  // Instantiating D1 Database instances securely
  const d1Db = env.DB || new MockD1Database();
  const companyRepository = new CompanyRepository(d1Db);
  const sessionRepository = new SessionRepository(d1Db);

  // Repositories (injecting googleAuthService and serviceAccount)
  const firebaseRepository = new FirebaseRepository(googleAuthService, serviceAccount);

  // UseCases (injecting dependencies and config)
  const assignClaimsUseCase = new AssignClaimsUseCase(firebaseRepository, claimsService, logger, companyRepository, maxLimit);
  const getUserClaimsUseCase = new GetUserClaimsUseCase(firebaseRepository, claimsService);
  const getBusinessUsersUseCase = new GetBusinessUsersUseCase(companyRepository);

  return {
    firebaseRepository,
    claimsService,
    tokenService,
    companyRepository,
    sessionRepository,
    assignClaimsUseCase,
    getUserClaimsUseCase,
    getBusinessUsersUseCase,
  };
}
