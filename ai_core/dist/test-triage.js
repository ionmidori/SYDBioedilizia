import { analyzeImageForChat } from './vision/triage';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
async function runTest() {
    console.log('🧪 Testing Triage Analyzer...');
    // 1. Setup - Find a test image
    // Using a known image in the brain folder or creating a dummy if needed?
    // User context shows "uploaded_image_..." artifacts. Let's try to use one if exists, or fail gracefully.
    // Hardcoded path to one of the artifacts mentioned in context for testing purposes
    // "C:\Users\User01\.gemini\antigravity\brain\a8a00739-6f37-49b0-b270-5e40c66c01ab\uploaded_image_1767575797974.png"
    const testImagePath = String.raw `C:\Users\User01\.gemini\antigravity\brain\a8a00739-6f37-49b0-b270-5e40c66c01ab\uploaded_image_1767575797974.png`;
    if (!fs.existsSync(testImagePath)) {
        console.error(`❌ Test image not found at: ${testImagePath}`);
        console.log('Skipping actual API call test. Please ensure a valid image path.');
        return;
    }
    try {
        const imageBuffer = fs.readFileSync(testImagePath);
        console.log(`📸 Image loaded (${(imageBuffer.length / 1024).toFixed(2)} KB)`);
        // 2. Execute Triage
        const result = await analyzeImageForChat(imageBuffer);
        // 3. Verification
        console.log('\n--- 📊 Triage Result ---');
        console.log(JSON.stringify(result, null, 2));
        // Assertions
        if (result.summary_for_chat && result.technical_data && result.technical_data.complexity_score) {
            console.log('\n✅ TEST PASSED: Structure is valid.');
        }
        else {
            console.error('\n❌ TEST FAILED: Missing fields.');
        }
    }
    catch (error) {
        console.error('\n💥 TEST FAILED with Error:', error);
    }
}
runTest();
