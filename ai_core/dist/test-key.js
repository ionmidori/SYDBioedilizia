import * as dotenv from 'dotenv';
import * as path from 'path';
const rootDir = process.cwd();
console.log('Current working directory:', rootDir);
// Simple relative paths from ai_core root
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(rootDir, '../web_client/.env.local') });
const key = process.env.FIREBASE_PRIVATE_KEY;
console.log('--- FIREBASE KEY DIAGNOSTICS ---');
if (!key) {
    console.error('❌ FATAL: FIREBASE_PRIVATE_KEY is undefined/empty');
    process.exit(1);
}
// Log generic details
console.log(`Raw Key Length: ${key.length}`);
console.log(`Contains literal "\\n": ${key.includes('\\n')}`);
console.log(`Contains actual newline "\n": ${key.includes('\n')}`);
console.log(`Wrapped in quotes (double): ${key.startsWith('"') && key.endsWith('"')}`);
console.log(`Wrapped in quotes (single): ${key.startsWith("'") && key.endsWith("'")}`);
// Simulate sanitization logic from firebase-admin.ts
let sanitized = key.replace(/\\n/g, '\n');
if (sanitized.startsWith('"') && sanitized.endsWith('"'))
    sanitized = sanitized.slice(1, -1);
if (sanitized.startsWith("'") && sanitized.endsWith("'"))
    sanitized = sanitized.slice(1, -1);
console.log('\n--- AFTER SANITIZATION ---');
console.log(`Length: ${sanitized.length}`);
console.log(`Contains actual newline "\n": ${sanitized.includes('\n')}`);
console.log(`Start: ${sanitized.substring(0, 40)}...`);
console.log(`End: ...${sanitized.substring(sanitized.length - 40)}`);
const hasHeader = sanitized.includes('BEGIN PRIVATE KEY');
const hasFooter = sanitized.includes('END PRIVATE KEY');
console.log(`\nValid Header: ${hasHeader ? '✅' : '❌'}`);
console.log(`Valid Footer: ${hasFooter ? '✅' : '❌'}`);
if (!hasHeader || !hasFooter) {
    console.error('❌ INVALID: Missing PEM headers');
}
else if (!sanitized.includes('\n')) {
    console.error('❌ INVALID: No newlines detected in PEM body (key is one long line)');
}
else {
    console.log('✅ Key format appears CORRECT');
}
