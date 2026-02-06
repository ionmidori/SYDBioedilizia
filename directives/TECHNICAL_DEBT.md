# 📉 Technical Debt & Future Refactorings

## 🔧 Hook Consolidation (PRIORITY: MEDIUM)

**Context**: During the Phase 4 Remediation (2026-02-06), `useMediaUpload` was refactored with a **Conservative Approach**. It currently acts as a compatibility wrapper that delegates logic to `useImageUpload`.

**Current Issue**:
- `ChatWidget.tsx` depends on the complex `MediaUploadState` interface of `useMediaUpload`.
- Logic is split between a wrapper (`useMediaUpload`) and specific hooks (`useImageUpload`, `useVideoUpload`).
- Duplication of "synthetic event" creation to trigger uploads.

**Planned Refactoring**:
1. **Deprecate `useMediaUpload`**: Move all remaining unique logic (if any) to specialized hooks.
2. **Standardize Interfaces**: Align `useImageUpload` and `useVideoUpload` to return a unified `AssetState` or similar.
3. **Refactor `ChatWidget.tsx`**: Update the internal state management to handle an array of `Asset` objects instead of using hook-specific states.
4. **Remove Wrapper**: Delete `useMediaUpload.ts` entirely once `ChatWidget` is fully migrated.

---

## 🏗️ API Protocol Alignment

**Planned**:
- Implement a single `useUpload` hook that detects file types and routes to the correct backend endpoint (`/image`, `/video`, `/document`) automatically.
- Centralize metadata extraction (like `trimRange`) into a unified `MediaMetadata` Pydantic model on the backend.

---

## 🧪 Testing Coverage

**Planned**:
- Rewrite `useChatHistory.test.ts` to mock SWR instead of global fetch.
- Add integration tests for the Python `upload` endpoints.
