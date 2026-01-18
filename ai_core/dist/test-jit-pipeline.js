import { generateRenovation } from './imagen/generator.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
// FIX for Vertex AI Local Auth: Point to the service account file
const serviceAccountPath = path.resolve(process.cwd(), 'firebase-service-account.json');
console.log('📂 CWD:', process.cwd());
console.log('📂 Files in CWD:', fs.readdirSync(process.cwd()));
if (fs.existsSync(serviceAccountPath)) {
    console.log(`🔑 Setting GOOGLE_APPLICATION_CREDENTIALS to: ${serviceAccountPath}`);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountPath;
}
else {
    console.warn(`⚠️ Service account file not found at: ${serviceAccountPath}`);
}
async function runTest() {
    console.log('🧪 Testing Full JIT Pipeline (Architect -> Painter)...');
    const testImagePath = String.raw `C:\Users\User01\.gemini\antigravity\brain\a8a00739-6f37-49b0-b270-5e40c66c01ab\uploaded_image_1767575797974.png`;
    if (!fs.existsSync(testImagePath)) {
        console.error(`❌ Test image not found at: ${testImagePath}`);
        return;
    }
    try {
        const imageBuffer = fs.readFileSync(testImagePath);
        console.log(`📸 Input Image loaded (${(imageBuffer.length / 1024).toFixed(2)} KB)`);
        const targetStyle = "Scandinavian Minimalist with warm lighting";
        // 1. ARCHITECT (Generate structural analysis and prompt)
        console.log('\\n🏗️ Running Architect analysis...');
        const { generateArchitecturalPrompt } = await import('./vision/architect.js');
        const architectOutput = await generateArchitecturalPrompt(imageBuffer, targetStyle, []);
        console.log(`✅ Architect complete! Skeleton: ${architectOutput.structuralSkeleton.substring(0, 50)}...`);
        // 2. PAINTER (Generate renovation image)
        const resultBuffer = await generateRenovation(imageBuffer, architectOutput, targetStyle);
        if (!resultBuffer || resultBuffer.length === 0) {
            throw new Error('PIPELINE FAILED: Empty result buffer.');
        }
        console.log(`\n✅ GENERATION SUCCESS! Size: ${(resultBuffer.length / 1024).toFixed(2)} KB`);
        // 2. UPLOAD (Storage)
        console.log('\n☁️ Testing Storage Upload...');
        const { uploadGeneratedImage } = await import('./storage/upload.js');
        const sessionId = 'test-session-' + Date.now();
        const slug = 'test-renovation';
        const imageUrl = await uploadGeneratedImage(resultBuffer, sessionId, slug);
        console.log(`✅ UPLOAD SUCCESS! URL: ${imageUrl.substring(0, 50)}...`);
        // 3. PERSIST (Database)
        console.log('\n💾 Testing Quote Persistence...');
        const { saveQuoteDraft } = await import('./db/quotes.js');
        // Mock Triage Data
        const mockTriage = {
            summary_for_chat: "Test summary",
            technical_data: {
                room_type: "living room",
                condition: "average",
                complexity_score: 5,
                detected_materials: ["wood", "plaster"]
            }
        };
        const quoteId = await saveQuoteDraft(sessionId, imageUrl, mockTriage);
        console.log(`✅ PERSISTENCE SUCCESS! Quote ID: ${quoteId}`);
    }
    catch (error) {
        console.error('\n💥 PIPELINE FAILED with Error:', error);
    }
}
runTest();
