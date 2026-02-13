# reCAPTCHA & Firebase App Check - Configuration Audit

**Date**: 2026-02-13
**Project**: SYD Bioedilizia (Renovation Next)
**Firebase Project**: chatbotluca-a8a73 (Project #972229558318)
**Status**: ⚠️ **PARTIALLY CONFIGURED - Missing Critical Environment Variables**

---

## Executive Summary

Firebase App Check with reCAPTCHA v3 is **code-ready but NOT ACTIVE** due to missing environment variables. The application infrastructure is correctly configured, but the deployment pipeline lacks the necessary secrets to enable App Check protection.

### Critical Findings

| Component | Status | Impact |
|-----------|--------|--------|
| **reCAPTCHA Enterprise API** | ✅ Enabled | Ready |
| **Firebase App Check API** | ✅ Enabled | Ready |
| **reCAPTCHA Keys Created** | ✅ 2 Keys Active | Ready |
| **Code Integration** | ✅ Implemented | Ready |
| **Environment Variables** | ❌ **MISSING** | **BLOCKING** |
| **App Check Registration** | ❌ **NOT CONFIGURED** | **BLOCKING** |

**Result**: App Check is **disabled** in production. The application is vulnerable to bot attacks and unauthorized API access.

---

## 1. Google Cloud Infrastructure - ✅ Correctly Configured

### 1.1 APIs Enabled

Both required APIs are active:

```bash
✅ Firebase App Check API (firebaseappcheck.googleapis.com)
   - State: ENABLED
   - Launch Stage: BETA
   - Monitoring: Active (verdict_count, verification_count metrics available)

✅ reCAPTCHA Enterprise API (recaptchaenterprise.googleapis.com)
   - State: ENABLED
   - Launch Stage: GA (Generally Available)
   - Monitoring: Active (score_counts, assessments, executes metrics available)
```

### 1.2 reCAPTCHA Keys Created

Two reCAPTCHA v3 (SCORE-based) keys are registered:

#### Key 1: `6LfdIlUsAAAAANkoXu9A5-R6tdJ08H3zto6C9Rwx`
- **Display Name**: SYD Brain
- **Created**: 2026-01-24T17:07:42Z
- **Type**: reCAPTCHA v3 (SCORE integration)
- **Allowed Domains**:
  - `website-renovation.vercel.app` ✅
  - `localhost` ✅
- **Challenge Preference**: Unspecified
- **Status**: ✅ Active

#### Key 2: `6LfYIlUsAAAAAJDFgQ86kMfynwu8RRTOqijlHa0A`
- **Display Name**: SYD Brain
- **Created**: 2026-01-24T17:07:00Z
- **Type**: reCAPTCHA v3 (SCORE integration)
- **Allowed Domains**:
  - `website-renovation.vercel.app` ✅ (duplicated entry)
- **Status**: ✅ Active

**Recommendation**: Use Key 1 (`6LfdIlUsAAAAANkoXu9A5-R6tdJ08H3zto6C9Rwx`) as it includes `localhost` for local development.

---

## 2. Firebase Configuration - ✅ Correctly Configured

### 2.1 Firebase Project

```json
{
  "projectId": "chatbotluca-a8a73",
  "projectNumber": "972229558318",
  "storageBucket": "chatbotluca-a8a73.firebasestorage.app",
  "authDomain": "chatbotluca-a8a73.firebaseapp.com"
}
```

### 2.2 Firebase Web Apps

Two web apps registered:

1. **Renovation Chatbot Web** (Current Production App)
   - App ID: `1:972229558318:web:c8714ddede695eb8449fbf`
   - API Key: `AIzaSyDqSvnr0Vs0v7J2AIDrm2NDEQPi0zh1Vi4`
   - ⚠️ **App Check Status**: NOT CONFIGURED

2. **SYD**
   - App ID: `1:972229558318:web:3f386991b7f47ef7449fbf`
   - Status: Secondary/Legacy app

---

## 3. Code Implementation - ✅ Correctly Implemented

### 3.1 Firebase Client SDK ([web_client/lib/firebase.ts](../web_client/lib/firebase.ts))

App Check initialization is correctly implemented:

```typescript
// Lines 63-81
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_ENABLE_APP_CHECK === 'true') {
    const { initializeAppCheck, ReCaptchaV3Provider } = require('firebase/app-check');
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    if (siteKey) {
        try {
            if (!window._firebaseAppCheckInitialized) {
                appCheck = initializeAppCheck(app, {
                    provider: new ReCaptchaV3Provider(siteKey),
                    isTokenAutoRefreshEnabled: true
                });
                window._firebaseAppCheckInitialized = true;
            }
        } catch (error) {
            console.error('[Firebase] App Check initialization failed:', error);
        }
    }
}
```

**Status**: ✅ Code is production-ready

### 3.2 App Check Provider ([web_client/components/providers/AppCheckProvider.tsx](../web_client/components/providers/AppCheckProvider.tsx))

```typescript
// Lines 12-20
useEffect(() => {
    if (typeof window === 'undefined') return;

    if (process.env.NEXT_PUBLIC_ENABLE_APP_CHECK === 'true') {
        console.log("[AppCheck] 🛡️ Active (Managed via lib/firebase)");
    } else {
        console.log("[AppCheck] 🛑 Disabled (Feature Flag)");
    }
}, []);
```

**Status**: ✅ Provider correctly defers to firebase.ts configuration

### 3.3 API Client Integration ([web_client/lib/api-client.ts:82](../web_client/lib/api-client.ts))

```typescript
if (process.env.NEXT_PUBLIC_ENABLE_APP_CHECK === 'true' && appCheck) {
    // X-Firebase-AppCheck header injection
}
```

**Status**: ✅ Header injection ready

### 3.4 Upload Hook Integration ([web_client/hooks/useUpload.ts:181](../web_client/hooks/useUpload.ts))

```typescript
if (process.env.NEXT_PUBLIC_ENABLE_APP_CHECK === 'true' && appCheck) {
    // App Check token attachment for Firebase Storage uploads
}
```

**Status**: ✅ Upload protection ready

---

## 4. ❌ CRITICAL ISSUE: Missing Environment Variables

### 4.1 Required Variables (NOT CONFIGURED)

The following environment variables are **MISSING** from the deployment:

```bash
# MISSING - Required for App Check activation
NEXT_PUBLIC_ENABLE_APP_CHECK=true

# MISSING - Required for reCAPTCHA v3 provider
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6LfdIlUsAAAAANkoXu9A5-R6tdJ08H3zto6C9Rwx
```

### 4.2 Where to Configure

#### Vercel Deployment (Production)

1. Navigate to: https://vercel.com/your-team/website-renovation/settings/environment-variables
2. Add the following variables:

```bash
# Enable Firebase App Check globally
NEXT_PUBLIC_ENABLE_APP_CHECK=true

# reCAPTCHA v3 Site Key (PUBLIC - safe for client-side)
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6LfdIlUsAAAAANkoXu9A5-R6tdJ08H3zto6C9Rwx
```

3. **Environment Scope**: Select **Production, Preview, Development** (all)
4. **Redeploy** the application after adding variables

#### Local Development (.env.local)

Create `.env.local` in `web_client/`:

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDqSvnr0Vs0v7J2AIDrm2NDEQPi0zh1Vi4
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=chatbotluca-a8a73.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=chatbotluca-a8a73
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=chatbotluca-a8a73.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=972229558318
NEXT_PUBLIC_FIREBASE_APP_ID=1:972229558318:web:c8714ddede695eb8449fbf

# App Check Configuration
NEXT_PUBLIC_ENABLE_APP_CHECK=true
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6LfdIlUsAAAAANkoXu9A5-R6tdJ08H3zto6C9Rwx
```

**Note**: Add `.env.local` to `.gitignore` (already configured at line 38)

---

## 5. ❌ CRITICAL ISSUE: Firebase App Check Not Registered

### 5.1 Problem

Firebase App Check configuration for the web app **does not exist**:

```bash
# Attempted query returned 404
GET https://firebaseappcheck.googleapis.com/v1/projects/972229558318/apps/1:972229558318:web:c8714ddede695eb8449fbf/appCheckConfig
→ Error 404: Resource not found
```

### 5.2 Required Action: Register App with App Check

You must explicitly register the web app with Firebase App Check:

#### Option 1: Firebase Console (Recommended)

1. Go to: [Firebase Console → App Check](https://console.firebase.google.com/project/chatbotluca-a8a73/appcheck)
2. Click **"Apps"** tab
3. Find app: **"Renovation Chatbot Web"** (`1:972229558318:web:c8714ddede695eb8449fbf`)
4. Click **"Register"** or **"Configure"**
5. Select **"reCAPTCHA v3"** as provider
6. Enter site key: `6LfdIlUsAAAAANkoXu9A5-R6tdJ08H3zto6C9Rwx`
7. **Save configuration**

#### Option 2: Firebase CLI

```bash
# Authenticate
firebase login

# Register App Check for web app
firebase appcheck:apps:register web \
  --app-id 1:972229558318:web:c8714ddede695eb8449fbf \
  --provider recaptcha-v3 \
  --site-key 6LfdIlUsAAAAANkoXu9A5-R6tdJ08H3zto6C9Rwx \
  --project chatbotluca-a8a73
```

#### Option 3: gcloud API Call

```bash
gcloud auth print-access-token | xargs -I {} \
curl -X PATCH \
  "https://firebaseappcheck.googleapis.com/v1/projects/972229558318/apps/1:972229558318:web:c8714ddede695eb8449fbf/recaptchaV3Config?updateMask=tokenTtl" \
  -H "Authorization: Bearer {}" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenTtl": "3600s",
    "siteSecretKey": "projects/972229558318/keys/6LfdIlUsAAAAANkoXu9A5-R6tdJ08H3zto6C9Rwx"
  }'
```

---

## 6. Backend Configuration - ⚠️ Needs Verification

### 6.1 Python Backend App Check Middleware

The backend implements App Check verification ([backend_python/src/middleware/app_check.py](../backend_python/src/middleware/app_check.py)):

```python
# Expected behavior (from SECURITY_AUDIT_REPORT.md)
def verify_app_check_token(token: str) -> bool:
    """Verifies X-Firebase-AppCheck header using Firebase Admin SDK"""
    # Implementation should use firebase_admin.app_check.verify_token()
```

**Action Required**: Verify that backend middleware is:
1. ✅ Extracting `X-Firebase-AppCheck` header from requests
2. ✅ Calling `firebase_admin.app_check.verify_token(token)`
3. ✅ Rejecting requests with invalid/missing tokens
4. ⚠️ Properly configured with `FIREBASE_PROJECT_ID` environment variable

### 6.2 Backend Environment Variables

Ensure backend (Cloud Run) has:

```bash
# Required for App Check verification
FIREBASE_PROJECT_ID=chatbotluca-a8a73

# Service account for Firebase Admin SDK
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
# OR use Workload Identity (recommended for Cloud Run)
```

**Check Cloud Run secrets**:

```bash
gcloud run services describe syd-brain \
  --region=europe-west1 \
  --project=chatbotluca-a8a73 \
  --format="value(spec.template.spec.containers[0].env)"
```

---

## 7. Security Implications

### 7.1 Current Vulnerability Surface

Without App Check enabled, the following attacks are possible:

| Attack Vector | Risk Level | Mitigation Status |
|---------------|------------|-------------------|
| **Bot Scraping** | 🔴 HIGH | ❌ NO PROTECTION |
| **API Replay Attacks** | 🔴 HIGH | ⚠️ Partial (JWT only) |
| **Credential Stuffing** | 🟡 MEDIUM | ⚠️ Partial (Firebase Auth) |
| **DDoS via Client** | 🔴 HIGH | ❌ NO PROTECTION |
| **Unauthorized Clients** | 🔴 HIGH | ❌ NO PROTECTION |

### 7.2 Post-Activation Security Posture

Once App Check is enabled:

```
┌─────────────────────────────────────────────────────────┐
│ REQUEST FLOW WITH APP CHECK ACTIVE                      │
└─────────────────────────────────────────────────────────┘

1. Browser loads Next.js app
   ↓
2. reCAPTCHA v3 executes invisibly (scores user 0.0-1.0)
   ↓
3. Firebase App Check SDK requests token
   ↓ (Only if score > threshold, e.g., 0.5)
4. App Check token issued (TTL: 1 hour)
   ↓
5. Client attaches X-Firebase-AppCheck header to API calls
   ↓
6. Backend verifies token via Firebase Admin SDK
   ↓ (Rejects if invalid/missing)
7. ✅ Request processed

RESULT:
✅ Bots blocked (low reCAPTCHA score)
✅ Replay attacks prevented (token TTL + nonce)
✅ Only verified clients can access API
```

---

## 8. Verification Checklist

After configuration, verify the following:

### 8.1 Client-Side Verification

```bash
# Start local development server
cd web_client
npm run dev

# Open browser console (http://localhost:3000)
# Expected output:
> [Firebase] ✅ Persistence configured
> [AppCheck] 🛡️ Active (Managed via lib/firebase)
> [Firebase] App Check initialized with reCAPTCHA v3

# Check network tab
# Look for requests to:
> https://firebaseappcheck.googleapis.com/v1/projects/chatbotluca-a8a73/apps/1:972229558318:web:c8714ddede695eb8449fbf:exchangeRecaptchaV3Token
# Should return 200 with { "token": "..." }
```

### 8.2 Backend Verification

```bash
# Test protected endpoint without App Check token
curl https://syd-brain-972229558318.europe-west1.run.app/api/chat \
  -H "Authorization: Bearer <valid-firebase-jwt>" \
  -d '{"message": "test"}'

# Expected response:
# HTTP 403 Forbidden
# { "error": "Missing or invalid App Check token" }
```

### 8.3 Production Deployment Check

```bash
# Check environment variables in Vercel
vercel env ls --scope production

# Expected output:
NEXT_PUBLIC_ENABLE_APP_CHECK=true
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6LfdIlUsAAAAANkoXu9A5-R6tdJ08H3zto6C9Rwx
```

---

## 9. Action Plan - Immediate Steps

### Priority 1: Environment Variables (5 minutes)

1. ✅ Add to Vercel project settings:
   ```
   NEXT_PUBLIC_ENABLE_APP_CHECK=true
   NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6LfdIlUsAAAAANkoXu9A5-R6tdJ08H3zto6C9Rwx
   ```
2. ✅ Redeploy application
3. ✅ Create `.env.local` for local development

### Priority 2: Firebase App Check Registration (10 minutes)

1. ✅ Open [Firebase Console → App Check](https://console.firebase.google.com/project/chatbotluca-a8a73/appcheck)
2. ✅ Register "Renovation Chatbot Web" app
3. ✅ Select reCAPTCHA v3 provider
4. ✅ Configure with site key `6LfdIlUsAAAAANkoXu9A5-R6tdJ08H3zto6C9Rwx`
5. ✅ Verify configuration saved

### Priority 3: Backend Verification (15 minutes)

1. ✅ Check Cloud Run environment variables
2. ✅ Verify `FIREBASE_PROJECT_ID` is set
3. ✅ Test middleware with valid/invalid App Check tokens
4. ✅ Review logs for App Check verification errors

### Priority 4: Production Testing (10 minutes)

1. ✅ Deploy to production
2. ✅ Open browser console on live site
3. ✅ Verify App Check token exchange
4. ✅ Test API calls include `X-Firebase-AppCheck` header
5. ✅ Confirm backend accepts requests

**Total Estimated Time**: ~40 minutes

---

## 10. Cost & Performance Implications

### 10.1 reCAPTCHA Enterprise Pricing

- **Free Tier**: 10,000 assessments/month
- **Paid Tier**: $1 per 1,000 assessments beyond free tier

**Estimated Cost** (assuming 1,000 daily active users):
- Monthly assessments: ~30,000 (token refresh every hour)
- Cost: **$0 - $20/month** (within free tier for MVP)

### 10.2 Performance Impact

- **Initial page load**: +50-100ms (reCAPTCHA script load)
- **Token exchange**: +100-200ms (first request only)
- **Token refresh**: Background (no user-facing latency)
- **Backend verification**: +10-30ms per request

**Net Impact**: Negligible for end users (<200ms one-time delay)

---

## 11. References

### Documentation
- [Firebase App Check Docs](https://firebase.google.com/docs/app-check)
- [reCAPTCHA v3 Docs](https://developers.google.com/recaptcha/docs/v3)
- [reCAPTCHA Enterprise](https://cloud.google.com/recaptcha-enterprise/docs)

### Internal Docs
- [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md) - App Check middleware implementation
- [FRONTEND_AUDIT_REPORT.md](./FRONTEND_AUDIT_REPORT.md) - App Check provider integration
- [web_client/lib/firebase.ts](../web_client/lib/firebase.ts) - Client-side initialization
- [backend_python/src/middleware/app_check.py](../backend_python/src/middleware/app_check.py) - Backend verification

### Firebase Console Links
- [App Check Dashboard](https://console.firebase.google.com/project/chatbotluca-a8a73/appcheck)
- [reCAPTCHA Keys](https://console.cloud.google.com/security/recaptcha?project=chatbotluca-a8a73)
- [Project Settings](https://console.firebase.google.com/project/chatbotluca-a8a73/settings/general)

---

## Conclusion

**Summary**: The infrastructure is **99% ready**, but App Check remains **inactive** due to two missing configuration steps:

1. ❌ **Environment variables not set** (Vercel deployment)
2. ❌ **Firebase App Check registration incomplete** (Firebase Console)

**Impact**: Application is currently vulnerable to bot attacks and unauthorized API access.

**Resolution Time**: ~40 minutes to fully activate App Check protection.

**Next Step**: Execute Priority 1 action (add environment variables to Vercel).

---

**Prepared by**: Claude Code
**Review Status**: Pending user confirmation
**Last Updated**: 2026-02-13
