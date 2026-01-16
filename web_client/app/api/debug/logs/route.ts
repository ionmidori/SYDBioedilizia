import { NextResponse } from 'next/server';
import { stat, readFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
    try {
        const logsDir = join(process.cwd(), '.next', 'dev', 'logs');
        const logFile = join(logsDir, 'next-development.log');

        // Leggi gli ultimi 200 caratteri del log
        const stats = await stat(logFile);
        const fileSize = stats.size;

        const content = await readFile(logFile, 'utf-8');
        const lastLines = content.split('\n').slice(-30);

        return NextResponse.json({
            timestamp: new Date().toISOString(),
            logFile: logFile,
            fileSize: fileSize,
            lastLines: lastLines,
        });
    } catch (error) {
        return NextResponse.json({
            error: 'Unable to read logs',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
