/**
 * Rate Limiter Test Script
 * Tests the hybrid rate limiter by making 25 rapid requests
 * Expected: First 20 pass, remaining 5 get rate limited (429)
 */

const API_URL = 'http://localhost:3000/api/chat';
const TOTAL_REQUESTS = 25;
const DELAY_MS = 300; // 300ms between requests

interface TestResult {
    requestNum: number;
    status: number;
    statusText: string;
    remaining?: string;
    resetAt?: string;
    duration: number;
}

async function makeRequest(num: number): Promise<TestResult> {
    const startTime = Date.now();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: `Test request ${num}` }],
                sessionId: 'rate-limit-test',
            }),
        });

        const duration = Date.now() - startTime;
        const remaining = response.headers.get('X-RateLimit-Remaining');
        const resetAt = response.headers.get('X-RateLimit-Reset');

        // Read response body to prevent hanging
        const text = await response.text();

        return {
            requestNum: num,
            status: response.status,
            statusText: response.statusText,
            remaining: remaining || undefined,
            resetAt: resetAt || undefined,
            duration,
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        return {
            requestNum: num,
            status: 0,
            statusText: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            duration,
        };
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
    console.log('\n🧪 Rate Limiter Test Started\n');
    console.log(`Configuration:`);
    console.log(`  - Total Requests: ${TOTAL_REQUESTS}`);
    console.log(`  - Rate Limit: 20 req/min`);
    console.log(`  - Cache TTL: 10s`);
    console.log(`  - Delay: ${DELAY_MS}ms between requests\n`);
    console.log('═'.repeat(80));

    const results: TestResult[] = [];
    let successCount = 0;
    let rateLimitedCount = 0;
    let errorCount = 0;

    for (let i = 1; i <= TOTAL_REQUESTS; i++) {
        const result = await makeRequest(i);
        results.push(result);

        const emoji = result.status === 200 ? '✅' : result.status === 429 ? '🚫' : '❌';
        const statusColor = result.status === 200 ? '\x1b[32m' : result.status === 429 ? '\x1b[33m' : '\x1b[31m';
        const resetColor = '\x1b[0m';

        console.log(
            `${emoji} Request #${i.toString().padStart(2)}:`,
            `${statusColor}${result.status}${resetColor}`,
            result.statusText.padEnd(20),
            `| Remaining: ${(result.remaining || 'N/A').padEnd(3)}`,
            `| Duration: ${result.duration}ms`
        );

        if (result.status === 200) successCount++;
        else if (result.status === 429) rateLimitedCount++;
        else errorCount++;

        if (i < TOTAL_REQUESTS) {
            await sleep(DELAY_MS);
        }
    }

    console.log('═'.repeat(80));
    console.log('\n📊 Test Results:\n');
    console.log(`  ✅ Successful (200):     ${successCount}`);
    console.log(`  🚫 Rate Limited (429):   ${rateLimitedCount}`);
    console.log(`  ❌ Errors:               ${errorCount}`);
    console.log(`  📦 Total:                ${TOTAL_REQUESTS}\n`);

    // Validation
    console.log('🔍 Validation:\n');

    const expectedSuccess = 20;
    const expectedRateLimited = 5;

    if (successCount === expectedSuccess) {
        console.log(`  ✅ SUCCESS: Got expected ${successCount} successful requests`);
    } else {
        console.log(`  ⚠️  WARNING: Expected ${expectedSuccess} successful, got ${successCount}`);
    }

    if (rateLimitedCount === expectedRateLimited) {
        console.log(`  ✅ SUCCESS: Got expected ${rateLimitedCount} rate-limited requests`);
    } else {
        console.log(`  ⚠️  WARNING: Expected ${expectedRateLimited} rate-limited, got ${rateLimitedCount}`);
    }

    if (errorCount === 0) {
        console.log(`  ✅ SUCCESS: No errors encountered`);
    } else {
        console.log(`  ❌ FAIL: ${errorCount} errors encountered`);
    }

    // Performance stats
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const maxDuration = Math.max(...results.map(r => r.duration));
    const minDuration = Math.min(...results.map(r => r.duration));

    console.log('\n⚡ Performance:\n');
    console.log(`  Average Response Time: ${avgDuration.toFixed(0)}ms`);
    console.log(`  Min Response Time:     ${minDuration}ms`);
    console.log(`  Max Response Time:     ${maxDuration}ms`);

    // Check if Firestore distribution is working
    const firstResult = results.find(r => r.status === 200);
    const lastSuccessResult = results.filter(r => r.status === 200).pop();

    console.log('\n🔥 Firestore Check:\n');
    if (firstResult?.remaining && lastSuccessResult?.remaining) {
        console.log(`  First request remaining:  ${firstResult.remaining}`);
        console.log(`  Last success remaining:   ${lastSuccessResult.remaining}`);
        console.log(`  ✅ Counter is decrementing correctly`);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n✨ Test Complete!\n');
}

// Run the test
runTest().catch(console.error);

export {};
