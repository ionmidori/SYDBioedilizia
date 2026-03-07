async function test() {
    try {
        const res = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer DUMMY_TOKEN'
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'ciao' }],
                sessionId: 'test-session-123',
                is_authenticated: false
            })
        });

        console.log('Status:', res.status);
        console.log('Headers:', Object.fromEntries(res.headers.entries()));

        const reader = res.body?.getReader();
        if (!reader) {
            console.log("No body reader");
            return;
        }
        console.log('Got reader, starting to read...');

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log('\nStream finished.');
                break;
            }
            process.stdout.write(new TextDecoder().decode(value));
        }
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

test();
