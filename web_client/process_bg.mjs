import { removeBackground } from "@imgly/background-removal-node";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Input is the absolute path to the uploaded file from artifacts
const INPUT_PATH = "C:/Users/User01/.gemini/antigravity/brain/9b67df8c-2099-475f-aeb5-b9fad8b203eb/uploaded_image_1769023353679.png";

// Output relative to this script (running in web_client root)
const OUTPUT_PATH = path.join(__dirname, "public", "assets", "syd_avatar_v2.png");

async function run() {
    console.log("🚀 Starting background removal...");
    console.log("Input:", INPUT_PATH);
    console.log("Output:", OUTPUT_PATH);

    try {
        // Check if input exists
        if (!fs.existsSync(INPUT_PATH)) {
            throw new Error(`Input file not found: ${INPUT_PATH}`);
        }

        const blob = await removeBackground(INPUT_PATH);
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        fs.writeFileSync(OUTPUT_PATH, buffer);
        console.log("✅ Success! Image saved to:", OUTPUT_PATH);
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

run();
