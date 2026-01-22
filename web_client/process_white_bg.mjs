import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Using the latest uploaded image
const INPUT_PATH = "C:/Users/User01/.gemini/antigravity/brain/9b67df8c-2099-475f-aeb5-b9fad8b203eb/uploaded_image_1769024965901.png";
// New filename to bust cache
const OUTPUT_PATH = path.resolve("public/assets/syd_transparent_v4.png");

// Strict configs
const WHITE_THRESHOLD = 210; // White > 210
const GREY_THRESHOLD = 150;  // Grey > 150
const SATURATION_TOLERANCE = 25; // Max difference between channels (R=G=B)

function isWhiteOrShadow(r, g, b) {
    // 1. Pure White Check
    if (r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD) {
        return true;
    }

    // 2. Aggressive Grey Shadow Check
    // If pixel is bright enough to be shadow (>150) AND is neutral colour (low saturation)
    if (r > GREY_THRESHOLD && g > GREY_THRESHOLD && b > GREY_THRESHOLD) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);

        // If the 'colorfulness' is low, it's grey.
        // Robot is Blue, so B will be much higher than R/G -> won't match.
        if ((max - min) < SATURATION_TOLERANCE) {
            return true;
        }
    }

    return false;
}

async function processImage() {
    console.log("🎨 Global Processing (Hole Removal Mode)...");

    try {
        const image = sharp(INPUT_PATH).ensureAlpha();
        const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

        let removedCount = 0;

        // Iterate EVERY pixel (Global, no flood fill)
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            if (isWhiteOrShadow(r, g, b)) {
                data[i + 3] = 0; // Transparent
                removedCount++;
            }
        }

        console.log(`✨ Removed ${removedCount} pixels (including internal holes).`);

        await sharp(data, {
            raw: { width: info.width, height: info.height, channels: 4 }
        })
            .png({ compressionLevel: 9 })
            .toFile(OUTPUT_PATH);

        console.log(`✅ Saved new version to ${OUTPUT_PATH}`);

    } catch (err) {
        console.error("❌ Error:", err);
    }
}

processImage();
