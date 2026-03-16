const fetch = require('node-fetch');

async function testFeedback() {
    console.log("Testing direct to backend (8080)...");
    const res1 = await fetch('http://127.0.0.1:8080/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'test_session', message_id: 'test_msg', rating: 1 })
    });
    console.log("Backend status:", res1.status, await res1.text());
}
testFeedback();
