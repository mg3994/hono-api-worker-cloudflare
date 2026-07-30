# Clean Architecture & SOLID Design Guide

This codebase implements a high-performance, modular API server on Cloudflare Workers using the Hono framework. It conforms strictly to **CLEAN Architecture**, **SOLID**, and **DRY** principles.

---

## Directory Structure & Architectural Layers

```
src/
├── domain/                      # Domain Entities, Schemas, and Custom Errors
│   ├── types.ts                 # Domain Type definitions and Zod request schemas
│   └── errors.ts                # Unified domain exceptions (AuthenticationError, ValidationError, etc.)
├── repositories/                # Persistence & Data Access Adapters
│   └── firebaseRepository.ts    # Communicates with Google Identity Platform REST APIs
├── services/                    # Domain Helpers and Core Calculations
│   ├── claimsService.ts         # Mutually exclusive role merges & maximum capacity validations
│   ├── googleAuthService.ts     # Service account OAuth JWT signing & KV token caching
│   ├── firebaseTokenVerifier.ts # Edge-native Web Crypto RS256 verifier with key pruning
│   ├── tokenService.ts          # Orchestrates token verification & Super Admin mapping
│   └── firebaseUtils.ts         # Clean Web Crypto JWT utilities (Base64url, PEM import, RS256 sign)
├── usecases/                    # Application Business Rules (Orchestrates Usecases)
│   ├── assignClaimsUseCase.ts   # Evaluates role promotions, demotions, limits & self-modification rules
│   └── getUserClaimsUseCase.ts  # Fresh lookups of live claims
├── infrastructure/              # Dependency Injection Container Factory
│   └── container.ts             # AppContainer assembling and wiring the dependency graph
├── middlewares/                 # Infrastructure Interceptors (Cross-cutting Concerns)
│   ├── containerMiddleware.ts   # Injects scoped AppContainer once per request
│   ├── authMiddleware.ts        # Optional/Compulsory Bearer token extraction and validation
│   └── errorHandler.ts          # Catch-all error formatting boundary mapping typed AppErrors
├── routes/                      # Delivery / Controller Layer
│   └── api.ts                   # Router files containing endpoints resolved purely from container UseCases
├── index.tsx                    # Hono application root hosting the React renderer & global handler
└── renderer.tsx                 # JSX Server-Side Renderer hosting React SPA templates on root '/'
```

---

## Core SOLID Design Practices

### 1. Single Responsibility Principle (SRP)
- **`ClaimsService`** has a single reason to change: modifications to role array calculations, size constraints, or deduplication.
- **`FirebaseTokenVerifier`** is solely responsible for verifying RS256 signatures of ID tokens.
- **`GoogleAuthService`** is solely responsible for minting and caching Google Identity REST access tokens.

### 2. Open-Closed Principle (OCP)
- The JWT verifier relies on standard JWKS keys. It automatically adapts to Google key rotations without requiring code modifications, dynamically refreshing keys and pruning cached cryptokeys.

### 3. Liskov Substitution Principle (LSP)
- All repositories and services implement explicit interfaces (`IFirebaseRepository`, `IGoogleAuthService`, `IFirebaseTokenVerifier`). Any mock or alternative persistence engine can substitute them seamlessly without crashing the application.

### 4. Interface Segregation Principle (ISP)
- Clients of the repository or verification service only see highly cohesive and focused methods defined inside individual interfaces.

### 5. Dependency Inversion Principle (DIP)
- Concrete classes depend on abstractions, never on concrete implementations.
- For instance, `FirebaseRepository` depends on the `IGoogleAuthService` interface, which is instantiated and dynamically injected into its constructor at runtime via the `createContainer` factory.

---

## High-Performance Caching & Resiliency Systems

### 1. Multi-Level Google Access Token Cache
To avoid hitting Google's rate-limiting token endpoint and minimize overhead:
- **Level 1 (Memory):** Persists the token locally in memory inside the Worker instance.
- **Level 2 (Cloudflare KV Namespace `GOOGLE_OAUTH_TOKEN_KV`):** Persists the token globally across all instances on the edge with an expiration TTL parsed dynamically from Google's `expires_in` response.

### 2. Multi-Level Public Verification Key Cache with Rotation Pruning
- **Level 1 (Memory Cache):** Caches imported public `CryptoKey` objects by `kid` so Web Crypto verification doesn't have to redundantly import big-integer JWKs.
- **Level 2 (Cloudflare KV Namespace `FIREBASE_PUBLIC_KEY_KV`):** Stores retrieved JWKs across all edge locations with dynamic TTLs from Google's Cache-Control response headers.
- **JWK Key Rotation Pruning:** During a cache miss where Google's JWKs are re-fetched, the verifier automatically cross-references keys and prunes any previously imported `CryptoKey` from our local memory cache whose `kid` is no longer active, guaranteeing security and avoiding memory leaks!
