import * as fs from 'fs';
import * as path from 'path';
const rootDir = process.cwd();
const envPath = path.join(rootDir, '.env');
const webClientEnvPath = path.join(rootDir, '../web_client/.env.local');
function cleanEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`❌ File not found: ${filePath}`);
        return;
    }
    console.log(`🔧 Cleaning ${filePath}...`);
    // Read as buffer to handle null bytes
    const buffer = fs.readFileSync(filePath);
    let content = buffer.toString('utf8');
    // Remove null bytes and BOM
    content = content.replace(/\u0000/g, ''); // Null bytes
    content = content.replace(/^\uFEFF/, ''); // BOM
    // Fix multiline keys if present (simple heuristic for BEGIN PRIVATE KEY)
    // This looks for the start of the key, captures the content until END PRIVATE KEY, and removes newlines within it
    const keyRegex = /(FIREBASE_PRIVATE_KEY=)([\s\S]*?)(-----END PRIVATE KEY-----)/;
    const match = content.match(keyRegex);
    if (match) {
        let keyPart = match[2];
        let endPart = match[3];
        // If the key part contains actual newlines, flatten them
        if (keyPart.includes('\n')) {
            console.log('   Found multiline key, flattening...');
            // 1. Remove newlines from the key body
            let flattenedKey = keyPart.replace(/\r?\n/g, '\\n');
            // 2. Ensure it's wrapped in quotes if not already
            // We reconstruct the line
            const fullKey = `FIREBASE_PRIVATE_KEY="${match[2].trim().replace(/\r?\n/g, '\\n')}${endPart}\\n"`;
            // Replace the original multiline block with the single line version
            content = content.replace(match[0], fullKey);
        }
    }
    // Write back
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Cleaned and saved: ${filePath}`);
}
cleanEnvFile(envPath);
cleanEnvFile(webClientEnvPath);
