---
name: mobile-camera-capture
description: Enterprise-grade patterns for implementing native mobile camera and video capture in React web applications using HTML5 attributes and memory-safe practices.
---

# Mobile Camera Capture in React

This skill provides the enterprise-standard patterns for implementing direct mobile camera (photo and video) capture within React web applications, specifically bypassing file pickers to open the native OS camera directly.

## Core Directives

1.  **The "Dual-Attribute" Capture Pattern**
    To ensure maximum compatibility across iOS and various Android browsers (Chrome, Firefox, WebViews), ALWAYS combine the `accept` attribute's `capture` directive with the explicit `capture` attribute.
    ```tsx
    // CORRECT - Enterprise Standard
    <input
        type="file"
        accept="image/*,video/mp4,video/quicktime;capture=camera"
        capture="environment" // Prioritize rear camera for project photos
        className="hidden"
        onChange={handleFileChange}
    />
    ```
    *Why*: Android 14+ Chrome often ignores `capture="environment"` standalone and shows a file picker. The combined approach forces the native camera intent.

2.  **Strict Memory Management (Memory Leaks Prevention)**
    When capturing high-resolution photos/videos on mobile, `URL.createObjectURL` is often used for previews. You MUST explicitly revoke these URLs to prevent out-of-memory crashes on mid-tier mobile devices.
    ```tsx
    // MUST perform in cleanup or when file is discarded/uploaded
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);
    ```

3.  **OS-Delegated Permissions**
    Do NOT use `navigator.mediaDevices.getUserMedia` unless a custom in-app camera viewfinder is explicitly required. Rely on the `<input type="file" capture>` approach.
    *Why*: The HTML5 input approach offloads camera permission handling entirely to the Mobile OS (iOS/Android) and the browser, eliminating the need for complex permission request UX and handling denied states within the React app.

4.  **UX Separation of Concerns (Mobile-First)**
    On mobile interfaces, separate the "Upload File" action from the "Take Photo/Video" action. Provide explicit, distinct buttons for each to reduce user cognitive load.
    *   Button 1: 📎 "Allega File" (Standard `<input type="file">` without `capture`)
    *   Button 2: 📷 "Scatta Foto" (The dual-attribute capture input)

5.  **Graceful Cancellation Handling**
    When a user opens the camera via the input but cancels (taps "Back" or "Cancel" on the OS camera UI), the `onChange` event might fire with an empty `FileList`, or not fire at all. Ensure the UI does not get stuck in a "loading" state and handles empty selections gracefully.

6.  **Pre-Upload Optimization (Tier 2 Responsibility)**
    Captured images from modern phones can easily exceed 5-10MB. The frontend MUST run compression (e.g., via Canvas API) BEFORE sending to the backend to conserve mobile bandwidth and adhere to standard API payload limits.

## Workflow Integration

When implementing mobile capture features:
1.  **Review existing upload hooks** (e.g., `useUpload.ts`) to ensure they handle the output of the capture input identically to standard file uploads.
2.  **Add the specific `<input>` element** alongside existing file inputs.
3.  **Bind a dedicated UI trigger** (Camera Icon) specifically to the new capture input's `ref`.
