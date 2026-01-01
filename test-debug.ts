/**
 * Simple Rate Limiter Debug Script
 * Makes 3 requests and shows detailed debug info
 */

async function testRateLimit() {
    console.log('\n🔍 Rate Limiter Debug Test\n');

    for (let i = 1; i <= 3; i++) {
        console.log(`\n--- Request ${i} ---`);

        try {
            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Test' }],
                    sessionId: 'debug-test'
                })
            });

            console.log('Status:', response.status, response.statusText);
            console.log('Headers:');
            response.headers.forEach((value, key) => {
                if (key.includes('rate') || key.includes('limit')) {
                    console.log(`  ${key}: ${value}`);
                }
            });

            const text = await response.text();
            console.log('Body preview:', text.substring(0, 200));

        } catch (error) {
            console.error('Error:', error);
        }

        if (i < 3) {
            await new Promise(r => setTimeout(r, 100));
        }
    }
}

testRateLimit();

export {};
