# Native Web API Feasibility Audit (Project Fugu)

## Executive Summary
This audit evaluates 5 native browser APIs to enhance the "Premium App" feel of the SYD Chatbot.
**Focus**: Immersion, Accuracy, Convenience.

---

## 1. Device Orientation (Gyroscope)
**Verdict: ✅ IMPLEMENT (Conditional)**
*   **The "Why"**: The "Holographic" Parallax effect is a subtle but powerful "delight" feature. It makes static renders feel like 3D windows. It distinguishes a "Premium" app from a basic website.
*   **Caveat**: Must be subtle (max 10-15px shift) to avoid motion sickness. Disable if user has "Reduce Motion" enabled.
*   **Difficulty**: Low.
*   **Implementation Pattern**:
    ```typescript
    // hooks/useParallax.ts
    const useParallax = () => {
      const [tilt, setTilt] = useState({ x: 0, y: 0 });
      
      useEffect(() => {
        if (!window.DeviceOrientationEvent) return;
        
        const handleOrientation = (e: DeviceOrientationEvent) => {
           // Clamp values to prevent extreme rotation
           const x = Math.min(Math.max(e.gamma || 0, -20), 20); // Left/Right
           const y = Math.min(Math.max(e.beta || 0, -20), 20);  // Front/Back
           setTilt({ x, y });
        };
        
        window.addEventListener('deviceorientation', handleOrientation);
        return () => window.removeEventListener('deviceorientation', handleOrientation);
      }, []);
      
      return tilt;
    };
    ```

## 2. Geolocation API
**Verdict: ✅ IMPLEMENT**
*   **The "Why"**: **Accuracy**. Renovation costs in Italy vary by +/- 40% between regions (e.g., Lombardy vs Calabria). Passing coordinates to the AI allows it to query specific regional price lists (Prezziari DEI regionali) via Perplexity.
*   **Privacy**: Ask ONLY when the user intends to get a quote. "Per darti una stima precisa sui costi della manodopera locale, posso accedere alla tua posizione?"
*   **Difficulty**: Low.
*   **Implementation Pattern**:
    ```typescript
    const getLocation = () => {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) reject("No Geo");
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => reject(err),
          { enableHighAccuracy: false } // Rough location is fine for pricing
        );
      });
    };
    ```

## 3. Screen Wake Lock API
**Verdict: ✅ IMPLEMENT**
*   **The "Why"**: **Convenience/Reliability**. We are now uploading large video files (100MB+). iOS/Android screens often dim after 30s. If the phone locks, the upload (XHR) might pause or fail. Wake Lock keeps the screen alive *only* during the upload process.
*   **Difficulty**: Low.
*   **Implementation Pattern**:
    ```typescript
    // Inside useVideoUpload.ts
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          const lock = await (navigator as any).wakeLock.request('screen');
          return lock;
        }
      } catch (err) {
        console.log('Wake Lock failed', err);
      }
    };
    ```

## 4. Native Web Share API
**Verdict: ✅ IMPLEMENT**
*   **The "Why"**: **Professionalism**. Custom "Share Modals" (with Facebook/Twitter icons) look cheap and dated. The OS-native share sheet (`navigator.share`) allows sharing directly to WhatsApp contacts, AirDrop, or 'Save to Files'. This is the expectation for 2026 apps.
*   **Difficulty**: Very Low.
*   **Implementation Pattern**:
    ```typescript
    const shareQuote = async (title: string, text: string, url: string) => {
      if (navigator.share) {
        try {
          await navigator.share({ title, text, url });
        } catch (err) {
          // User cancelled
        }
      } else {
        // Fallback to clipboard copy
      }
    };
    ```

## 5. Native Speech Recognition
**Verdict: ❌ DISCARD (Stick to Whisper)**
*   **The "Why"**: 
    1.  **Inconsistency**: `webkitSpeechRecognition` works on Chrome but has varying support/behavior on iOS Safari (often times out or requires specific interaction).
    2.  **Accuracy Risk**: For *technical* renovation terms ("Parquet rovere", "Gres porcellanato"), native dictation is often worse than OpenAI Whisper Model.
    3.  **UX**: We can achieve low latency by streaming audio chunks to the server, keeping the high accuracy of the server-side model. The "Native" trade-off isn't worth the support nightmare.
*   **Alternative**: Optimize the existing Audio Recorder to stream chunks faster.

---

## Summary of Next Steps
1.  **Phase 1**: Update `useVideoUpload` to include **Wake Lock**.
2.  **Phase 2**: Add **Web Share** to the Quote/Render view.
3.  **Phase 3**: Integrate **Device Orientation** in the `ImageLightbox` viewer.
4.  **Phase 4**: Add **Geolocation** trigger in the "Estimator" logic.
