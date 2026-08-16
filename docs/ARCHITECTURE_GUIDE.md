# Clean Architecture & SOLID Design Guide

This codebase implements a high-performance, modular API server on Cloudflare Workers using the Hono framework. It conforms strictly to **CLEAN Architecture**, **SOLID**, and **DRY** principles.

---

## Directory Structure & Architectural Layers

```
src/
├── domain/                      # Domain Entities, Schemas, and Custom Errors
│   ├── types.ts                 # Domain Type definitions and Zod request schemas
│   ├── errors.ts                # Unified domain exceptions (AuthenticationError, ValidationError, etc.)
│   ├── companyRepository.ts     # Domain Interface for D1 company roles lookups
│   ├── sessionRepository.ts     # Domain Interface for browser device and FCM session syncing
│   └── messagingService.ts      # Domain Interface for push notification payload delivery
├── repositories/                # Persistence & Data Access Adapters
│   ├── firebaseRepository.ts    # Communicates with Google Identity Platform REST APIs
│   ├── companyRepository.ts     # Implementation of ICompanyRepository utilizing Cloudflare D1 SQL queries
│   └── sessionRepository.ts     # Implementation of ISessionRepository managing D1 device sessions
├── services/                    # Domain Helpers and Core Calculations
│   ├── claimsService.ts         # Mutually exclusive role merges & maximum capacity validations
│   ├── googleAuthService.ts     # Service account OAuth JWT signing & KV token caching
│   ├── firebaseTokenVerifier.ts # Edge-native Web Crypto RS256 verifier with key pruning
│   ├── tokenService.ts          # Orchestrates token verification & Super Admin mapping
│   ├── messagingService.ts      # Concrete FCM push messaging implementation chunking device tokens at 499
│   └── firebaseUtils.ts         # Clean Web Crypto JWT utilities (Base64url, PEM import, RS256 sign)
├── usecases/                    # Application Business Rules (Orchestrates Usecases)
│   ├── assignClaimsUseCase.ts   # Evaluates role promotions, demotions, limits & self-modification rules
│   ├── getUserClaimsUseCase.ts  # Fresh lookups of live claims
│   └── getBusinessUsersUseCase.ts # Fetches user lists from relational D1 company records
├── controllers/                 # Delivery / Presenter Layer (Separation of Concerns)
│   └── apiControllers.ts        # Request handling and response mapping decoupled from Hono routes (SRP)
├── infrastructure/              # Dependency Injection Container Factory
│   └── container.ts             # AppContainer assembling and wiring the dependency graph
├── middlewares/                 # Infrastructure Interceptors (Cross-cutting Concerns)
│   ├── containerMiddleware.ts   # Injects scoped AppContainer once per request
│   ├── authMiddleware.ts        # Optional/Compulsory Bearer token extraction and validation
│   └── errorHandler.ts          # Catch-all error formatting boundary mapping typed AppErrors
├── routes/                      # Router Layer
│   └── api.ts                   # Router files containing endpoints resolved purely from container UseCases
├── index.tsx                    # Hono application root hosting the React renderer & global handler
└── renderer.tsx                 # JSX Server-Side Renderer hosting React SPA templates on root '/'
```

---

## Core SOLID Design Practices

### 1. Single Responsibility Principle (SRP)
- **`ApiControllers`** is solely responsible for handling web requests and mapping responses, delegating all domain rules strictly to Usecases.
- **`ClaimsService`** has a single reason to change: modifications to role array calculations, size constraints, or deduplication.
- **`FirebaseTokenVerifier`** is solely responsible for verifying RS256 signatures of ID tokens.
- **`GoogleAuthService`** is solely responsible for minting and caching Google Identity REST access tokens.

### 2. Open-Closed Principle (OCP)
- The JWT verifier relies on standard JWKS keys. It automatically adapts to Google key rotations without requiring code modifications, dynamically refreshing keys and pruning cached cryptokeys.

### 3. Liskov Substitution Principle (LSP)
- All repositories and services implement explicit interfaces (`IFirebaseRepository`, `ICompanyRepository`, `ISessionRepository`, `IMessagingService`). Any mock or alternative persistence engine can substitute them seamlessly without crashing the application.

### 4. Interface Segregation Principle (ISP)
- Clients of the repository or verification service only see highly cohesive and focused methods defined inside individual interfaces.

### 5. Dependency Inversion Principle (DIP)
- Concrete classes depend on abstractions, never on concrete implementations.
- For instance, `FirebaseRepository` depends on the `IGoogleAuthService` interface, which is instantiated and dynamically injected into its constructor at runtime via the `createContainer` factory.

---

## D1 Relational Schema & Persistence Sync

To support advanced reporting and rapid staff lists extraction without hitting heavy Firebase user list endpoints:
- Custom claims mutations executed in the `AssignClaimsUseCase` are dynamically synchronized in a batch transaction to the Cloudflare D1 SQLite relational table `user_business_roles`.
- Parameterized SQLite bindings (`?`) are strictly implemented inside `CompanyRepository` and `SessionRepository` to enforce bullet-proof protection against SQL injection attacks at the edge.

---

## High-Performance Caching & Resiliency Systems

### 1. Multi-Level Google Access Token Cache with Concurrency Promise Locks
To avoid hitting Google's rate-limiting token endpoint and minimize overhead:
- **Level 1 (Memory):** Persists the token locally in memory inside the Worker instance.
- **Level 2 (Cloudflare KV Namespace `GOOGLE_OAUTH_TOKEN_KV`):** Persists the token globally across all instances on the edge with an expiration TTL parsed dynamically from Google's `expires_in` response.
- **"Thundering Herd" Lock:** Employs an `inFlightTokenPromise` locking variable. If multiple concurrent edge requests hit an expired/empty cache, the lock ensures exactly one JWT assertion request is dispatched to Google, with all other concurrent requests reusing the resulting promise.

### 2. Multi-Level Public Verification Key Cache with Rotation Pruning
- **Level 1 (Memory Cache):** Caches imported public `CryptoKey` objects by `kid` so Web Crypto verification doesn't have to redundantly import big-integer JWKs.
- **Level 2 (Cloudflare KV Namespace `FIREBASE_PUBLIC_KEY_KV`):** Stores retrieved JWKs across all edge locations with dynamic TTLs from Google's Cache-Control response headers.
- **JWK Key Rotation Pruning:** During a cache miss where Google's JWKs are re-fetched, the verifier automatically cross-references keys and prunes any previously imported `CryptoKey` from our local memory cache whose `kid` is no longer active, guaranteeing security and avoiding memory leaks!

---

## Concurrent Chunked FCM Messaging System

To support high-throughput push notifications on the edge:
- **Parallel Chunk Sending:** Slices the registration tokens array into chunks of up to `499` elements (strictly under Google's 500 batch limit) and executes them concurrently using `Promise.allSettled`. This eliminates sequential edge latency and drastically improves dispatch performance.
- **Service-Worker Link Compatibility:** The payload populated by `MessagingService` automatically maps deep-link click states to both browser-level `data.url` and native `webpush.fcm_options.link` properties, aligning perfectly with standard Service Worker navigation parameters.
