# Implementation Plan: Biometric Authentication Integration (Passkeys)

**Objective**: Enable users to register biometric credentials (FaceID, TouchID, Windows Hello) from their profile settings to facilitate passwordless login, and provide clear guidance when biometric login is attempted but not configured.

**Context**: 
- Backend (`/api/passkey`) fully supports WebAuthn registration/authentication.
- Frontend hook (`usePasskey`) is implemented but only partially utilized.
- UI Component (`PasskeyButton`) exists but uses non-compliant styles and lacks robust error handling for "user not found" scenarios.

## 1. Architectural Impact Analysis

### Components Affected
1.  **`web_client/components/auth/PasskeyButton.tsx`** (Modification)
    - **Current State**: Functional logic, but styling is inconsistent. Error handling shows raw text.
    - **Proposed Change**: 
        - Refactor to use `bg-luxury-gold`.
        - **NEW**: Implement a "Not Found" handling logic. If authentication fails with a specific error (e.g., "User not found" or "No credentials"), trigger a `Dialog` explaining that the user must login via Email/Google first.
    
2.  **`web_client/app/dashboard/profile/page.tsx`** (Integration)
    - **Current State**: Contains "Security" section with only "Change Password".
    - **Proposed Change**: Inject `PasskeyButton` into the Security section. Add logic to show success toast notification upon registration.

3.  **`web_client/hooks/usePasskey.ts`** (No Change Required - Verified)
    - Logic for `navigator.credentials.create` appears correct and robust.

### Risk Assessment
- **Low Risk**: Additive feature.
- **UX Consideration**: The "User Not Found" dialog is critical to prevent user frustration when they mistakenly try biometric login without prior setup.

## 2. Step-by-Step Execution Plan

### Step 1: Refactor `PasskeyButton.tsx` (UI & UX)
- **Goal**: Align with Design System and implement "First Time" guidance.
- **Tasks**:
    1.  Replace `bg-gradient-to-r` with `bg-luxury-gold`.
    2.  Add a local state `showGuidanceDialog` (boolean).
    3.  Wrap the logic in a `try/catch` block. If `authenticateWithPasskey` throws an error indicative of "No credentials found" (or if user cancels), catch it.
    4.  **Logic**: 
        - If error is "No credentials" -> Set `showGuidanceDialog(true)`.
        - Else -> Show inline error message.
    5.  Render a `Dialog` (from `@/components/ui/dialog`) when `showGuidanceDialog` is true:
        - Title: "Biometria non attiva"
        - Body: "Per usare FaceID/TouchID, devi prima accedere con Email o Google/Apple, poi attivare la biometria dal tuo Profilo."
        - Action: "Ho capito" (closes dialog).

### Step 2: Integrate into `ProfilePage.tsx`
- **Goal**: Expose the feature to the user.
- **Tasks**:
    1.  Import `PasskeyButton`.
    2.  Locate the "Sicurezza" section (near `Lock` icon).
    3.  Insert the button below the "Cambia Password" button.
    4.  Add a callback handler `handlePasskeySuccess` that sets the page-level `successMessage` (e.g., "Dispositivo biometrico registrato con successo!").

### Step 3: Verification Protocol
- **Manual Verification**:
    1.  **Negative Case**: From Login screen, click "Accedi con Biometria" (without setup).
        - **Expectation**: Browser prompt appears -> Cancel it (or use unrecognized finger).
        - **Expectation**: "Biometria non attiva" Dialog appears.
    2.  **Positive Case**:
        - Login with Email/Password.
        - Navigate to `/dashboard/profile`.
        - Click "Attiva Accesso Biometrico".
        - Register success.
        - Logout and login successfully with Biometrics.

## 3. Rollback Strategy
If the implementation causes build errors or runtime crashes:
1.  Revert changes to `web_client/app/dashboard/profile/page.tsx`.
2.  Revert `PasskeyButton.tsx` to previous state.

## 4. Future Considerations (Post-MVP)
- **"Passkey-First" Login**: Implementing a flow where users can sign up *only* with biometrics.
- **Device Management**: List registered keys.
