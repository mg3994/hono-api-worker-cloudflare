import { FirebaseRepository, IFirebaseRepository } from '../repositories/firebaseRepository';
import { ClaimsService } from '../services/claimsService';
import { IClaimsService } from '../domain/claimsService';
import { GoogleAuthService } from '../services/googleAuthService';
import { ConsoleLogger } from './consoleLogger';
import { AssignClaimsUseCase } from '../usecases/assignClaimsUseCase';
import { GetUserClaimsUseCase } from '../usecases/getUserClaimsUseCase';
import { FirebaseServiceAccount } from '../services/firebaseUtils';

export interface AppContainer {
  firebaseRepository: IFirebaseRepository;
  claimsService: IClaimsService;
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

  const serviceAccount = JSON.parse(serviceAccountStr) as FirebaseServiceAccount;

  // Read MAX_ENTITIES_LIMIT dynamically from Cloudflare bindings (default to 20)
  const maxLimitStr = env.MAX_ENTITIES_LIMIT || '20';
  const maxLimit = parseInt(maxLimitStr, 10) || 20;

  // Services - Injecting GOOGLE_OAUTH_TOKEN_KV cleanly as a dependency
  const googleAuthService = new GoogleAuthService(serviceAccount, env.GOOGLE_OAUTH_TOKEN_KV);
  const claimsService = new ClaimsService();
  const logger = new ConsoleLogger();

  // Repositories (injecting googleAuthService dependency)
  const firebaseRepository = new FirebaseRepository(googleAuthService);

  // UseCases (injecting dependencies and config)
  const assignClaimsUseCase = new AssignClaimsUseCase(firebaseRepository, claimsService, logger, maxLimit);
  const getUserClaimsUseCase = new GetUserClaimsUseCase(firebaseRepository, claimsService);

  return {
    firebaseRepository,
    claimsService,
    assignClaimsUseCase,
    getUserClaimsUseCase,
  };
}
