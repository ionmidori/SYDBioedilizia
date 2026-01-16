# 🔐 Firebase Client Configuration - Environment Variables

Per far funzionare l'autenticazione client-side, aggiungi queste variabili d'ambiente al file `.env.local` (web_client):

```bash
# Firebase Client SDK (pubbliche, iniziano con NEXT_PUBLIC_)
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

## 📍 Dove Trovare questi Valori:

1. Vai alla [Firebase Console](https://console.firebase.google.com/)
2. Seleziona il tuo progetto
3. **Impostazioni progetto** (icona ingranaggio) → **Generali**
4. Scorri fino a "**Le tue app**"
5. Se non hai ancora un'app **Web**, clicca su "**Aggiungi app**" → icona Web (`</>`)
6. Copia la configurazione `firebaseConfig` che appare

## ⚠️ Note Importanti:

- Queste variabili iniziano con `NEXT_PUBLIC_` perché devono essere accessibili dal browser
- **NON** sono credenziali sensibili (API Key Firebase è pubblica per design)
- La sicurezza è garantita dalle **Firebase Security Rules** e dalla **verifica del ID Token lato server**

## ✅ Verifica Configurazione:

Dopo aver aggiunto le variabili, riavvia il server Next.js:

```bash
npm run dev
```

Se configurato correttamente, il browser inizierà a inviare il token Firebase nelle richieste API.
