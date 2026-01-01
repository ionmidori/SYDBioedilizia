/**
 * Instant Burst Test - No delay between requests
 * This will exceed rate limit for sure
 */

async function burstTest() {
    console.log('\n💥 BURST TEST - 25 instant requests\\n');

    const promises = Array.from({ length: 25 }, (_, i) =>
        fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: `Burst ${i + 1}` }],
                sessionId: 'burst-test',
            }),
        }).then(async (res) => {
            const remaining = res.headers.get('X-RateLimit-Remaining');
            await res.text(); // Consume
            return { num: i + 1, status: res.status, remaining };
        })
    );

    const results = await Promise.all(promises);

    results.sort((a, b) => a.num - b.num);

    let passCount = 0;
    let blockCount = 0;

    results.forEach((r) => {
        const emoji = r.status === 200 ? '✅' : r.status === 429 ? '🚫' : '❌';
        const color = r.status === 200 ? '\x1b[32m' : r.status === 429 ? '\x1b[33m' : '\x1b[31m';
        console.log(`${emoji} #${r.num.toString().padStart(2)}: ${color}${r.status}\x1b[0m | Remaining: ${r.remaining || 'N/A'}`);

        if (r.status === 200) passCount++;
        if (r.status === 429) blockCount++;
    });

    console.log(`\n📊 Results: ${passCount} passed, ${blockCount} blocked\n`);

    if (blockCount > 0) {
        console.log('🎉 SUCCESS! Rate limiter is working!\n');
    } else {
        console.log('⚠️  WARNING: No requests were blocked\n');
    }
}

burstTest();

export {};
