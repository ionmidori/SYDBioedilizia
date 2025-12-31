
import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    console.log('AI SDK Version Check');
    try {
        const google = createGoogleGenerativeAI({
            apiKey: process.env.GEMINI_API_KEY,
        });

        const result = streamText({
            model: google('gemini-1.5-flash'), // Use a known working model
            messages: [{ role: 'user', content: 'Hello' }],
        });

        console.log('Result keys:', Object.keys(result));
        console.log('Result prototype:', Object.getPrototypeOf(result));
        console.log('Has toDataStreamResponse?', 'toDataStreamResponse' in result);
        console.log('Has toAIStreamResponse?', 'toAIStreamResponse' in result);
        console.log('Has toTextStreamResponse?', 'toTextStreamResponse' in result);

        // Print all properties including non-enumerable
        console.log('All props:', Object.getOwnPropertyNames(Object.getPrototypeOf(result)));

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
