# Configurazione Gemini 2.5 Flash & Imagen - Logica Modelli

Questa documentazione centralizza tutte le impostazioni relative all'utilizzo dei modelli **Gemini 2.5 Flash** e **Imagen** nel progetto di ristrutturazione.

---

## 🎯 Panoramica Architettura

Il sistema utilizza un'architettura **JIT (Just-In-Time)** per la generazione di immagini:

```
User Photo → Triage → Architect → Painter → Final Image
             (Flash)   (Flash)     (Flash-Image)
```

---

## 📦 Modelli Utilizzati

### 1. **Gemini 3 Flash Preview** (Text/Vision)
- **Scopo**: Chat, Analisi, Prompt Engineering
- **File di configurazione**: `CHAT_MODEL_VERSION`
- **Default**: `gemini-3-flash-preview`
- **Località**: `us-central1`

### 2. **Gemini 3 Pro Image Preview** (Multimodal per I2I - "Nano Banana Pro")
- **Scopo**: Image-to-Image renovation (Painter)
- **File di configurazione**: `VISION_MODEL_VERSION`  
- **Default**: `gemini-3-pro-image-preview`
- **Località**: `us-central1`

### 3. **Imagen 3.0 Generate** (Text-to-Image fallback)
- **Scopo**: Creazione da zero (T2I)
- **File di configurazione**: `IMAGEN_MODEL_VERSION`
- **Default**: `imagen-3.0-generate-001`
- **Località**: `us-central1`

---

## ⚙️ Variabili d'Ambiente

### File: `.env.local` (web_client)

```env
# Chat & Vision Models
CHAT_MODEL_VERSION=gemini-3-flash-preview
VISION_MODEL_VERSION=gemini-3-pro-image-preview

# Imagen Fallback Model
IMAGEN_MODEL_VERSION=imagen-3.0-generate-001

# Firebase/GCP Project
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Gemini API Key (for chat)
GEMINI_API_KEY=your-gemini-api-key
```

---

## 🔧 Configurazioni per Componente

### A. **Chat API** (route.ts)

**File**: `web_client/app/api/chat/route.ts`

```typescript
// Linea 662
model: googleProvider(process.env.CHAT_MODEL_VERSION || 'gemini-3-flash-preview')
```

**Configurazione**:
- Modello utilizzato per il chatbot SYD
- Tools: `generate_render`, `submit_lead_data`, `get_market_prices`
- MaxSteps: 5
- MaxToolRoundtrips: 2

---

### B. **Triage** (Analisi Immagine)

**File**: `ai_core/src/vision/triage.ts`

```typescript
// Linea 29
const modelName = process.env.CHAT_MODEL_VERSION || 'gemini-3-flash-preview';
```

**Ruolo**: Analizza l'immagine caricata dall'utente per estrarre:
- Tipo di stanza
- Dimensioni approssimative
- Elementi strutturali presenti

**Output**: JSON con dati tecnici per quote e rendering

---

### C. **Architect** (Prompt Engineering)

**File**: `ai_core/src/vision/architect.ts`

```typescript
// Linea 14
const modelName = process.env.CHAT_MODEL_VERSION || 'gemini-3-flash-preview';
```

**Ruolo**: Genera un "Locked Prompt" professionale per il Painter

**System Prompt Highlights**:
- PHASE 1: Structural Analysis (preserve geometry)
- PHASE 2: Furnishing Rules (occlusion permission)
- PHASE 3: Styling & Atmosphere (magazine quality)
- PHASE 4: Prompt Engineering (golden stack)

**Mandatory Keywords**:
- **Lighting**: "Volumetric lighting", "Global illumination", "Cinematic soft light"
- **Realism**: "Photorealistic", "8k resolution", "Unreal Engine 5 render"
- **Camera**: "24mm wide angle lens", "f/8 aperture", "Depth of field"

**Output**: String prompt ottimizzato (200-500 chars)

---

### D. **Painter** (Image Generation)

**File**: `ai_core/src/imagen/generator.ts`

```typescript
// Linea 41-42
const envModel = process.env.VISION_MODEL_VERSION;
const modelName = envModel || 'gemini-3-pro-image-preview';
```

**Configurazione Vertex AI**:

```typescript
const generativeModel = vertex_ai.getGenerativeModel({
    model: 'gemini-3-pro-image-preview',
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    ],
    generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.2,  // LOW: respect Locked Prompt instructions
        topP: 0.95,
    }
});
```

**Input**: 
- Immagine originale (JPEG base64)
- Locked Prompt dall'Architect

**Output**: Buffer immagine generata (JPEG)

---

## 🎨 Logica di Generazione

### Pipeline JIT (Image-to-Image)

1. **Triage** (Gemini 2.5 Flash)
   - Analizza immagine utente
   - Estrae dati tecnici (dimensioni, tipo stanza, elementi)

2. **Architect** (Gemini 2.5 Flash)
   - Riceve: immagine + stile target + keepElements
   - Genera: Locked Prompt professionale
   - Temperature: default (0.7-0.9)

3. **Painter** (Gemini 2.5 Flash Image)
   - Riceve: immagine + Locked Prompt
   - Genera: Immagine renovata
   - Temperature: 0.2 (bassa per fedeltà)

### Fallback T2I (Text-to-Image)

Se l'utente **non carica foto**:
- Usa `imagen-3.0-generate-001` (Imagen 3 REST API)
- Genera da prompt testuale
- File: `ai_core/src/imagen/generate-interior.ts`

---

## 🔐 Safety Settings

**Configurazione uniforme** per tutti i modelli generativi:

```typescript
safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
]
```

**Rationale**: BLOCK_ONLY_HIGH permette contenuti architettonici (mattoni, armi decorative) senza false positives

---

## 📍 Località e Endpoint

### Vertex AI
- **Project ID**: da `FIREBASE_PROJECT_ID`
- **Location**: `us-central1` (OBBLIGATORIO per modelli preview)
- **Auth**: Service Account credentials o Application Default Credentials

### Gemini API (Chat)
- **Endpoint**: automatico via `@ai-sdk/google`
- **Auth**: `GEMINI_API_KEY`

---

## 🔄 Temperatura per Caso d'Uso

| Componente | Modello | Temperature | Rationale |
|------------|---------|-------------|-----------|
| **Chat** | gemini-2.5-flash | Default (SDK) | Conversazione naturale |
| **Triage** | gemini-2.5-flash | Default | Analisi factual |
| **Architect** | gemini-2.5-flash | Default | Creatività prompt engineering |
| **Painter** | gemini-2.5-flash-image | **0.2** | Fedeltà al Locked Prompt |

---

## 🧪 Test e Debug

### File di Test
- `ai_core/src/test-jit-pipeline.ts` - Test completo JIT
- `ai_core/src/test-architect.ts` - Test singolo Architect
- `ai_core/src/debug-models.ts` - Lista modelli disponibili

### Comandi Utili

```bash
# Test pipeline completo
npm run test:jit

# Debug modelli disponibili
npm run debug:models
```

---

## 📝 Note Tecniche

### Gemini 3 Flash Preview vs Pro Image Preview

| Caratteristica | Gemini 3 Flash Preview | Gemini 3 Pro Image Preview |
|----------------|------------------------|----------------------------|
| **Input** | Text, Image (vision) | Text, Image (multimodal) |
| **Output** | **Text only** | **Text + Image** |
| **I2I** | ❌ No | ✅ Yes |
| **Prompt** | Text prompt | Text + Image prompt |

**Critical**: Per generazione immagini, DEVI usare `gemini-3-pro-image-preview`, NON `gemini-3-flash-preview`

### Nano Banana Pro

"Nano Banana Pro" è il codename interno di Google per **Gemini 3 Pro Image Preview**:
- Nano: lightweight runtime
- Banana: riferimento scherzoso alla pipeline di preprocessing
- Pro: versione potenziata con capacità architettoniche avanzate

---

## 🚀 Quick Reference

### Per cambiare modello Chat:
```env
CHAT_MODEL_VERSION=gemini-3-flash-preview
```

### Per cambiare modello Image Generation:
```env
VISION_MODEL_VERSION=gemini-3-pro-image-preview
```

### Per fallback Imagen:
```env
IMAGEN_MODEL_VERSION=imagen-3.0-generate-001
```

---

## ⚠️ Troubleshooting

### "Model not found" error
- **Causa**: Modello non disponibile in `us-central1`
- **Fix**: Verifica allowlist progetto o usa altro modello

### "No image in response"
- **Causa**: Usato `gemini-3-flash-preview` invece di `gemini-3-pro-image-preview`
- **Fix**: Cambia `VISION_MODEL_VERSION`

### "Temperature too high, images vary too much"
- **Causa**: Temperature default per Painter
- **Fix**: Abbassa a 0.1-0.2 in `generator.ts` linea 56

---

## 📚 Riferimenti

- [Vertex AI Gemini](https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini)
- [Imagen 3 API](https://cloud.google.com/vertex-ai/docs/generative-ai/image/generate-images)
- [AI SDK Google Provider](https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai)
