import { FirebaseRepository, IFirebaseRepository } from '../repositories/firebaseRepository';
import { ClaimsService } from '../services/claimsService';
import { AssignClaimsUseCase } from '../usecases/assignClaimsUseCase';
import { GetUserClaimsUseCase } from '../usecases/getUserClaimsUseCase';
import { FirebaseServiceAccount } from '../services/firebaseUtils';

export interface AppContainer {
  firebaseRepository: IFirebaseRepository;
  claimsService: ClaimsService;
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

  // Repositories
  const firebaseRepository = new FirebaseRepository(serviceAccount);

  // Services
  const claimsService = new ClaimsService();

  // UseCases (injecting dependencies)
  const assignClaimsUseCase = new AssignClaimsUseCase(firebaseRepository, claimsService);
  const getUserClaimsUseCase = new GetUserClaimsUseCase(firebaseRepository);

  return {
    firebaseRepository,
    claimsService,
    assignClaimsUseCase,
    getUserClaimsUseCase,
  };
}
