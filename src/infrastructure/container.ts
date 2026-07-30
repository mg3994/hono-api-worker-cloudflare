import { FirebaseRepository, IFirebaseRepository } from '../repositories/firebaseRepository';
import { ClaimsService } from '../services/claimsService';
import { GoogleAuthService } from '../services/googleAuthService';
import { AssignClaimsUseCase } from '../usecases/assignClaimsUseCase';
import { GetUserClaimsUseCase } from '../usecases/getUserClaimsUseCase';
import { FirebaseServiceAccount } from '../services/firebaseUtils';

export interface AppContainer {
  firebaseRepository: IFirebaseRepository;
  claimsService: ClaimsService;
  assignClaimsUseCase: AssignClaimsUseCase;
  getUserClaimsUseCase: GetUserClaimsUseCase;
}

const mockServiceAccount: FirebaseServiceAccount = {
  project_id: 'mock-test-project',
  client_email: 'mock-client@example.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSlAgEAAoIBAQC3\n-----END PRIVATE KEY-----',
};

/**
 * Factory to create and wire up all Clean Architecture layers (SOLID dependency injection).
 */
export function createContainer(env?: CloudflareBindings): AppContainer {
  let serviceAccount = mockServiceAccount;

  if (env && env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as FirebaseServiceAccount;
    } catch (err) {
      // Fallback to mock service account during local test runs
    }
  }

  // Read MAX_ENTITIES_LIMIT dynamically from Cloudflare bindings (default to 20)
  const maxLimitStr = env?.MAX_ENTITIES_LIMIT || '20';
  const maxLimit = parseInt(maxLimitStr, 10) || 20;

  // Services - Injecting GOOGLE_OAUTH_TOKEN_KV cleanly as a dependency
  const googleAuthService = new GoogleAuthService(serviceAccount, env?.GOOGLE_OAUTH_TOKEN_KV);
  const claimsService = new ClaimsService();

  // Repositories (injecting googleAuthService dependency)
  const firebaseRepository = new FirebaseRepository(googleAuthService);

  // UseCases (injecting dependencies and config)
  const assignClaimsUseCase = new AssignClaimsUseCase(firebaseRepository, claimsService, maxLimit);
  const getUserClaimsUseCase = new GetUserClaimsUseCase(firebaseRepository, claimsService);

  return {
    firebaseRepository,
    claimsService,
    assignClaimsUseCase,
    getUserClaimsUseCase,
  };
}
