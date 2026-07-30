# API Reference Documentation

This document describes the API design, schemas, request payloads, and response patterns for the Cloudflare Workers API Server.

---

## Response Envelope Pattern

All responses follow a uniform JSON structure:

### Successful Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "message": "Human readable error description",
    "details": { ... } // Optional error-specific metadata or validation issues
  }
}
```

---

## API Endpoints

### 1. `GET /api/me`
Decodes the caller's Firebase ID token from the `Authorization: Bearer <token>` header, verifies the signature, matches the email against the Super Admin list, and fetches fresh custom claims directly from the Firebase Auth database.

#### Headers
- `Authorization: Bearer <Firebase_ID_Token>` (Required)

#### Key Architectural Features
- **`needsRefresh` Boolean:** The response automatically compares the caller's current `tokenClaims` (embedded in the JWT) with their live `latestClaims` fetched directly from Firebase Auth. If a permission was changed since they logged in, `needsRefresh` becomes `true`. The client React SPA can detect this and immediately invoke `getIdToken(true)` in the background to cleanly refresh their token, keeping permissions synchronized and lagging-free!

#### Successful Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "uid": "caller_firebase_uid",
    "email": "caller_email@example.com",
    "isSuperAdmin": false,
    "tokenClaims": {
      "o": ["118774185466060931"],
      "m": ["118774185466060932"],
      "s": []
    },
    "latestClaims": {
      "o": ["118774185466060931"],
      "m": ["118774185466060932"],
      "s": ["118774185466060933"]
    },
    "needsRefresh": true
  }
}
```

#### Error Response (`401 Unauthorized`)
```json
{
  "success": false,
  "error": {
    "message": "Authentication failed",
    "details": "Token has expired"
  }
}
```

---

### 2. `POST /api/claims/assign`
Assigns a business role (Owner, Moderator, Staff) for a given business ID to a target user identified by their email.

#### Headers
- `Authorization: Bearer <Firebase_ID_Token>` (Required)

#### Request Payload Schema
```json
{
  "targetEmail": "user_to_assign@gmail.com",
  "role": "o", // Must be "o" (Owner), "m" (Moderator), or "s" (Staff)
  "businessId": "118774185466060931"
}
```

#### Authorization & Logic Rules
1. **Super Admin Access:** Users on the `SUPER_ADMINS` list from wrangler environment vars can assign any role for any business ID to any email address.
2. **Business Owner Access:** An Owner (`o`) of `businessId` is authorized to assign roles (`o`, `m`, `s`) for that business to other users.
3. **Deduplication & Partitioning (Promotion/Demotion):** When a user is assigned a role for a business, they are cleanly promoted or demoted. That business ID is automatically removed from any other roles (`o`, `m`, `s`) they might have possessed, ensuring exactly one role per business ID.
4. **Limits (1000-byte Limit Guard):** To fit Firebase's 1000-byte custom claims constraint, a single user cannot exceed `MAX_ENTITIES_LIMIT` total business ID assignments across all roles combined (defaults to 20).
5. **Self-Downgrade Prevention:** An Owner of a business cannot assign themselves as moderator (`m`) or staff (`s`) of their own business (re-assigning as Owner `o` is permitted as a noop).
6. **Owner Demotion Restrictions:** Demoting or removing an existing Owner (`o`) role for any business ID is strictly restricted to Super Admins. Standard business owners cannot demote other Owners.

#### Successful Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "message": "Successfully updated roles for user_to_assign@gmail.com",
    "updatedClaims": {
      "o": ["118774185466060931"],
      "m": [],
      "s": []
    }
  }
}
```

#### Validation Error (`400 Bad Request`)
Returned when schema validation fails (e.g. invalid email format, missing fields, incorrect role values).
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "details": [
      {
        "code": "invalid_enum_value",
        "options": ["o", "m", "s"],
        "path": ["role"],
        "message": "Role must be 'o', 'm', or 's'"
      }
    ]
  }
}
```

---

### 3. `GET /api/payments`
Optional authentication endpoint returning customized payment tiers and features.

#### Headers
- `Authorization: Bearer <Firebase_ID_Token>` (Optional)

#### Successful Response - Authenticated User (`200 OK`)
```json
{
  "success": true,
  "data": {
    "isGuest": false,
    "email": "user@gmail.com",
    "isSuperAdmin": false,
    "assignedBusinessesCount": 2,
    "paymentTier": "Business Partner Tier",
    "customMethods": ["Corporate Credit Card", "ACH Direct Debit", "Crypto Settlement"]
  }
}
```

#### Successful Response - Guest (`200 OK`)
```json
{
  "success": true,
  "data": {
    "isGuest": true,
    "paymentTier": "Guest / Standard Tier",
    "customMethods": ["Stripe", "PayPal", "Google Pay"],
    "specialOffer": "Sign up and verify your account to access Corporate Billing rates!"
  }
}
```
