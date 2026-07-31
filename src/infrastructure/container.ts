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

export interface AppContainer {
  firebaseRepository: IFirebaseRepository;
  claimsService: IClaimsService;
  tokenService: ITokenService;
  assignClaimsUseCase: AssignClaimsUseCase;
  getUserClaimsUseCase: GetUserClaimsUseCase;
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

  // Repositories (injecting googleAuthService dependency)
  const firebaseRepository = new FirebaseRepository(googleAuthService);

  // UseCases (injecting dependencies and config)
  const assignClaimsUseCase = new AssignClaimsUseCase(firebaseRepository, claimsService, logger, maxLimit);
  const getUserClaimsUseCase = new GetUserClaimsUseCase(firebaseRepository, claimsService);

  return {
    firebaseRepository,
    claimsService,
    tokenService,
    assignClaimsUseCase,
    getUserClaimsUseCase,
  };
}
