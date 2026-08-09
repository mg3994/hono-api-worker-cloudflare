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
import { ILogger } from '../domain/logger';
import { AssignClaimsUseCase } from '../usecases/assignClaimsUseCase';
import { GetUserClaimsUseCase } from '../usecases/getUserClaimsUseCase';
import { RevokeClaimsUseCase } from '../usecases/revokeClaimsUseCase';
import { FirebaseServiceAccount } from '../domain/types';

// D1 Persistence Imports
import { CompanyRepository } from '../repositories/companyRepository';
import { ICompanyRepository } from '../domain/companyRepository';
import { SessionRepository } from '../repositories/sessionRepository';
import { ISessionRepository } from '../domain/sessionRepository';
import { GetBusinessUsersUseCase } from '../usecases/getBusinessUsersUseCase';

// Orders & Payments Imports
import { IOrderRepository } from '../domain/orderRepository';
import { OrderRepository } from '../repositories/orderRepository';
import { IPaymentRepository } from '../domain/paymentRepository';
import { PaymentRepository } from '../repositories/paymentRepository';
import { CreateOrderUseCase } from '../usecases/createOrderUseCase';
import { GetOrdersUseCase } from '../usecases/getOrdersUseCase';
import { ProcessPaymentUseCase } from '../usecases/processPaymentUseCase';
import { GetUserByPhoneUseCase } from '../usecases/getUserByPhoneUseCase';
import { CreateBlogPostUseCase } from '../usecases/createBlogPostUseCase';
import { UpdateBlogPostUseCase } from '../usecases/updateBlogPostUseCase';
import { GetBlogPostUseCase } from '../usecases/getBlogPostUseCase';
import { DeleteBlogPostUseCase } from '../usecases/deleteBlogPostUseCase';

// Verification Engine & Blogger CRUD Service
import { IOrderVerificationService } from '../domain/orderVerificationService';
import { OrderVerificationService } from '../services/orderVerificationService';
import { IBloggerService } from '../domain/bloggerService';
import { BloggerService } from '../services/bloggerService';

// Messaging Imports
import { IMessagingService } from '../domain/messagingService';
import { MessagingService } from '../services/messagingService';

export interface AppContainer {
  logger: ILogger;
  firebaseRepository: IFirebaseRepository;
  claimsService: IClaimsService;
  tokenService: ITokenService;
  companyRepository: ICompanyRepository;
  sessionRepository: ISessionRepository;
  messagingService: IMessagingService;
  assignClaimsUseCase: AssignClaimsUseCase;
  getUserClaimsUseCase: GetUserClaimsUseCase;
  getBusinessUsersUseCase: GetBusinessUsersUseCase;
  revokeClaimsUseCase: RevokeClaimsUseCase;
  orderRepository: IOrderRepository;
  paymentRepository: IPaymentRepository;
  createOrderUseCase: CreateOrderUseCase;
  getOrdersUseCase: GetOrdersUseCase;
  processPaymentUseCase: ProcessPaymentUseCase;
  getUserByPhoneUseCase: GetUserByPhoneUseCase;
  orderVerificationService: IOrderVerificationService;
  bloggerService: IBloggerService;
  createBlogPostUseCase: CreateBlogPostUseCase;
  updateBlogPostUseCase: UpdateBlogPostUseCase;
  getBlogPostUseCase: GetBlogPostUseCase;
  deleteBlogPostUseCase: DeleteBlogPostUseCase;
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

  // Messaging Service with OAuth and Token dependency injected
  const messagingService = new MessagingService(googleAuthService, sessionRepository, projectId);

  // Repositories (injecting googleAuthService and serviceAccount)
  const firebaseRepository = new FirebaseRepository(googleAuthService, serviceAccount);

  // Orders & Payments Repositories
  const orderRepository = new OrderRepository(d1Db);
  const paymentRepository = new PaymentRepository(d1Db);

  // UseCases (injecting dependencies and config)
  const assignClaimsUseCase = new AssignClaimsUseCase(firebaseRepository, claimsService, logger, companyRepository, maxLimit);
  const getUserClaimsUseCase = new GetUserClaimsUseCase(firebaseRepository, claimsService);
  const getBusinessUsersUseCase = new GetBusinessUsersUseCase(companyRepository);
  const revokeClaimsUseCase = new RevokeClaimsUseCase(firebaseRepository, claimsService, logger, companyRepository);

  const createOrderUseCase = new CreateOrderUseCase(orderRepository);
  const getOrdersUseCase = new GetOrdersUseCase(orderRepository);
  const processPaymentUseCase = new ProcessPaymentUseCase(orderRepository, paymentRepository);
  const getUserByPhoneUseCase = new GetUserByPhoneUseCase(firebaseRepository);
  const orderVerificationService = new OrderVerificationService(env.BLOGGER_API_KEY || 'blogger_mock_api_key');
  const bloggerService = new BloggerService(env.BLOGGER_API_KEY || 'blogger_mock_api_key');

  const createBlogPostUseCase = new CreateBlogPostUseCase(bloggerService);
  const updateBlogPostUseCase = new UpdateBlogPostUseCase(bloggerService);
  const getBlogPostUseCase = new GetBlogPostUseCase(bloggerService);
  const deleteBlogPostUseCase = new DeleteBlogPostUseCase(bloggerService);

  return {
    logger,
    firebaseRepository,
    claimsService,
    tokenService,
    companyRepository,
    sessionRepository,
    messagingService,
    assignClaimsUseCase,
    getUserClaimsUseCase,
    getBusinessUsersUseCase,
    revokeClaimsUseCase,
    orderRepository,
    paymentRepository,
    createOrderUseCase,
    getOrdersUseCase,
    processPaymentUseCase,
    getUserByPhoneUseCase,
    orderVerificationService,
    bloggerService,
    createBlogPostUseCase,
    updateBlogPostUseCase,
    getBlogPostUseCase,
    deleteBlogPostUseCase,
  };
}
