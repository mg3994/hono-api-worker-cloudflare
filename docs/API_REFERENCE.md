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
    "code": "ERROR_CODE", // Machine-readable programmatic error identifier
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

#### Authentication Error (`401 Unauthorized`)
Returned when the compulsory token is missing, expired, or bears an invalid signature.
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
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
Returned when payload data schema validation fails (e.g. invalid email format, missing fields, incorrect role values).
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
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

#### Target User Not Found (`400 Bad Request`)
Returned when the target user email cannot be resolved to an active account inside the Firebase Auth database.
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "User with email \"nonexistent_user@gmail.com\" was not found in Firebase Auth."
  }
}
```

#### Entities Capacity Limit Exceeded (`400 Bad Request`)
Returned when adding the new role assignment exceeds the maximum threshold allowed for that user, protecting the 1000-byte token size limit.
```json
{
  "success": false,
  "error": {
    "code": "LIMIT_EXCEEDED",
    "message": "Limit exceeded: A user cannot be assigned to more than 20 total businesses across all roles."
  }
}
```

#### Action Not Authorized / Non-Owner Error (`403 Forbidden`)
Returned when a user attempts to modify roles for a business ID where they are neither a Super Admin nor an Owner.
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Permission denied: You must be a Super Admin or an Owner of this business to assign roles."
  }
}
```

#### Self-Downgrade Prevention Error (`403 Forbidden`)
Returned when an Owner tries to modify their own email to Moderator or Staff of their own business.
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Permission denied: An Owner cannot downgrade themselves or assign themselves to other roles for their own business."
  }
}
```

#### Owner Demotion Guardrails Error (`403 Forbidden`)
Returned when a standard Owner attempts to demote or remove the Owner role (`o`) of another user. This operation is restricted exclusively to Super Admins.
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Permission denied: Only Super Admins are authorized to remove or demote an Owner role."
  }
}
```

---

### 3. `GET /api/business/:id/users`
Retrieves all users, their emails, and active assigned roles (`o` for owner, `m` for moderator, `s` for staff) associated with the specific business ID.

#### Headers
- `Authorization: Bearer <Firebase_ID_Token>` (Required)

#### Authorization Rules
- The caller must be a Super Admin OR hold an active role (`o`, `m`, `s`) inside the specified `businessId` to fetch its staff list.

#### Successful Response (`200 OK`)
```json
{
  "success": true,
  "data": [
    {
      "uid": "target_user_uid_1",
      "email": "owner@biz.com",
      "businessId": "118774185466060931",
      "role": "o",
      "updatedAt": 1711204899201
    },
    {
      "uid": "target_user_uid_2",
      "email": "moderator@biz.com",
      "businessId": "118774185466060931",
      "role": "m",
      "updatedAt": 1711204910340
    }
  ]
}
```

---

### 4. `POST /api/devices/sync`
Synchronizes current active FCM registration tokens and client browser IDs with the back-end relational D1 database. Supports tracking guest sessions and seamlessly merging browser sessions upon Firebase user logins.

#### Request Payload Schema
```json
{
  "action": "SYNC_DEVICE", // Must be either "SYNC_DEVICE" or "LOGOUT_DEVICE"
  "clientId": "client-36zfd9-1711204899", // browser profile unique identifier
  "idToken": "Firebase_ID_Token_Here", // optional (can pass "guest_session" or oauth id token)
  "deviceToken": "fcm_device_registration_token", // required for sync
  "clientName": "Chrome (Mobile)" // optional client platform name description
}
```

#### Successful Sync Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "message": "Device session synced successfully.",
    "session": {
      "browserClientId": "client-36zfd9-1711204899",
      "uid": "authenticated_uid_or_guest",
      "deviceToken": "fcm_device_registration_token",
      "clientName": "Chrome (Mobile)",
      "updatedAt": 1711204911220
    }
  }
}
```

#### Successful Logout Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "message": "Successfully logged out browser device session: client-36zfd9-1711204899"
  }
}
```

---

### 5. `POST /api/notifications/send`
Dispatches an FCM push notification securely through Google's HTTP/v1 API. It automatically integrates webpush configurations to support deep-linking click focus states.

#### Headers
- `Authorization: Bearer <Firebase_ID_Token>` (Required)

#### Request Payload Schema
```json
{
  "targetUid": "recipient_firebase_uid",
  "businessId": "118774185466060931", // optional context business ID for Owner/Manager authorization
  "title": "New Order Placed",
  "body": "A customer placed an order at Shop #123.",
  "imageUrl": "https://example.com/logo.png", // optional
  "deepLinkUrl": "/orders/detail/abc" // optional navigation target
}
```

#### Authorization Rules
- The caller must be a Super Admin, OR hold an Owner (`o`) or Manager/Moderator (`m`) custom claim matching the provided `businessId`.

#### Successful Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "message": "Successfully executed push notification delivery sequence. Sent to 2 active devices.",
    "failures": []
  }
}
```

---

### 6. `GET /api/payments`
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
