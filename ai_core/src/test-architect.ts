
import { generateArchitecturalPrompt } from './vision/architect';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runTest() {
    console.log('🧪 Testing Architect (Geometry Lock)...');

    // Hardcoded path to the test image
    const testImagePath = String.raw`C:\Users\User01\.gemini\antigravity\brain\a8a00739-6f37-49b0-b270-5e40c66c01ab\uploaded_image_1767575797974.png`;

    if (!fs.existsSync(testImagePath)) {
        console.error(`❌ Test image not found at: ${testImagePath}`);
        return;
    }

    try {
        const imageBuffer = fs.readFileSync(testImagePath);
        console.log(`📸 Image loaded (${(imageBuffer.length / 1024).toFixed(2)} KB)`);

        // Execute Architect
        const targetStyle = "Modern Industrial";
        const architectOutput = await generateArchitecturalPrompt(imageBuffer, targetStyle, []);

        // Verification
        console.log('\n--- 🔒 Architect Output ---');
        console.log('Skeleton:', architectOutput.structuralSkeleton.substring(0, 100) + '...');
        console.log('Materials:', architectOutput.materialPlan.substring(0, 100) + '...');
        console.log('Furnishing:', architectOutput.furnishingStrategy.substring(0, 100) + '...');

        // Assertions
        if (architectOutput.structuralSkeleton && architectOutput.materialPlan) {
            console.log('\n✅ TEST PASSED: ArchitectOutput contains required fields.');
        } else {
            console.error('\n❌ TEST FAILED: Output format incorrect.');
        }

    } catch (error) {
        console.error('\n💥 TEST FAILED with Error:', error);
    }
}

runTest();
