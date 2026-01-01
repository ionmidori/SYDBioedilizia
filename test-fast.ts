/**
 * Fast Rate Limiter Test
 * Makes requests rapidly (50ms delay) to stay within 60s window
 */

const API_URL = 'http://localhost:3000/api/chat';
const TOTAL_REQUESTS = 25;
const DELAY_MS = 50; // Faster!

async function makeRequest(num: number) {
    const startTime = Date.now();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: `Test ${num}` }],
                sessionId: 'rate-test-fast',
            }),
        });

        const duration = Date.now() - startTime;
        const remaining = response.headers.get('X-RateLimit-Remaining');
        await response.text(); // Consume body

        return { num, status: response.status, remaining, duration };
    } catch (error) {
        return { num, status: 0, remaining: 'ERR', duration: 0 };
    }
}

function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
    console.log('\n⚡ FAST Rate Limiter Test\n');
    console.log(`Making ${TOTAL_REQUESTS} requests with ${DELAY_MS}ms delay...\\n`);

    for (let i = 1; i <= TOTAL_REQUESTS; i++) {
        const result = await makeRequest(i);
        const emoji = result.status === 200 ? '✅' : result.status === 429 ? '🚫' : '❌';
        const color = result.status === 200 ? '\x1b[32m' : result.status === 429 ? '\x1b[33m' : '\x1b[31m';

        console.log(
            `${emoji} #${i.toString().padStart(2)}: ${color}${result.status}\x1b[0m | Remaining: ${(result.remaining || 'N/A').padEnd(3)} | ${result.duration}ms`
        );

        if (result.status === 429) {
            console.log(`\n🎉 SUCCESS! Rate limit kicked in at request #${i}\n`);
            break;
        }

        if (i < TOTAL_REQUESTS) await sleep(DELAY_MS);
    }
}

runTest();

export {};
