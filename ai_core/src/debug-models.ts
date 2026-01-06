
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import process from 'process';

// Load envs
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// FIX for Vertex AI Local Auth: Point to the service account file if it exists
// OTHERWISE rely on 'gcloud auth application-default login' (ADC)
const serviceAccountPath = path.resolve(process.cwd(), 'firebase-service-account.json');
if (fs.existsSync(serviceAccountPath)) {
    console.log(`🔑 Setting GOOGLE_APPLICATION_CREDENTIALS to: ${serviceAccountPath}`);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountPath;
}

async function listFoundationModels() {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'chatbotluca-a8a73';
    const location = 'us-central1'; // Check central first
    console.log(`🔎 Checking Publisher Models for Project: ${projectId} in ${location}...`);

    const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        credentials: {
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        },
        projectId: projectId
    });

    const client = await auth.getClient();
    const token = (await client.getAccessToken()).token;

    if (!token) throw new Error('Failed to get access token');

    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${await response.text()}`);
        }

        const data = await response.json();
        const models = data.models || [];

        console.log(`\n📚 Found ${models.length} Publisher Models.`);
        console.log('---------------------------------------------------');

        // Filter for relevant models (Gemini + Image support)
        const relevantModels = models.filter((m: any) => {
            const id = m.name.split('/').pop();
            return id.includes('gemini') || id.includes('imagen');
        }).map((m: any) => {
            const id = m.name.split('/').pop();
            // Check if it supports image generation (heuristic)
            const isMultimodal = JSON.stringify(m).toLowerCase().includes('image');
            return { id, version: m.versionId, openSource: !!m.openSourceCategory };
        });

        console.log('✨ RELEVANT MODELS (Gemini/Imagen):');
        relevantModels.forEach((m: any) => console.log(`- ${m.id} (Version: ${m.version})`));

    } catch (error) {
        console.error('❌ Error listing models:', error);
    }
}

listFoundationModels();
