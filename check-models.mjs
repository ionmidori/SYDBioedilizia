import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carica .env.local dal web_client
dotenv.config({ path: join(__dirname, '../web_client/.env.local') });

console.log('=== MODELS CONFIGURATION CHECK ===');
console.log('');
console.log('📊 Current Environment Variables:');
console.log('');
console.log('CHAT_MODEL_VERSION:', process.env.CHAT_MODEL_VERSION || '(not set - will use default)');
console.log('VISION_MODEL_VERSION:', process.env.VISION_MODEL_VERSION || '(not set - will use default)');
console.log('IMAGEN_MODEL_VERSION:', process.env.IMAGEN_MODEL_VERSION || '(not set - will use default)');
console.log('');
console.log('🎨 Expected Models:');
console.log('');
console.log('Chat Model:', process.env.CHAT_MODEL_VERSION || 'gemini-2.5-flash');
console.log('Vision Model (Painter):', process.env.VISION_MODEL_VERSION || 'gemini-2.5-flash-image');
console.log('Imagen Fallback:', process.env.IMAGEN_MODEL_VERSION || 'imagen-3.0-generate-001');
console.log('');
console.log('✅ Configuration loaded successfully');
