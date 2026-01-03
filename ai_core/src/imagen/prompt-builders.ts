import { RoomAnalysis } from '../vision/analyze-room';

/**
 * Build a super-detailed T2I prompt from room structure analysis
 * 
 * This replaces the I2I approach with a T2I approach that uses detailed
 * structural description extracted by Gemini Vision.
 * 
 * @param analysis - Structural analysis from Gemini Vision
 * @param targetStyle - Desired design style (e.g., "modern industrial")
 * @param userRequest - User's specific renovation request
 * @returns Detailed T2I prompt that preserves structure
 */
export function buildPromptFromRoomAnalysis(
    analysis: RoomAnalysis,
    targetStyle: string,
    userRequest: string
): string {
    console.log('[Prompt Builder] Building detailed T2I prompt from analysis...');

    // Helper for formatting lists
    const formatList = (items: any[], formatter: (item: any) => string, emptyText = '') =>
        items && items.length > 0 ? items.map(formatter).join('\n') : emptyText;

    // Format architectural features
    const features = formatList(analysis.architectural_features, f => `- ${f}`);

    // Format windows
    const windowsDescription = formatList(
        analysis.windows,
        w => `- ${w.size} window on ${w.position}`,
        '- No visible windows'
    );

    // Format doors
    const doorsDescription = formatList(analysis.doors, d => `- Door on ${d.position}`);

    // Format special features
    const specialFeaturesList = formatList(analysis.special_features, f => `- ${f}`);
    const specialFeatures = specialFeaturesList ? `\nSpecial architectural elements:\n${specialFeaturesList}` : '';

    // Build comprehensive prompt
    const detailedPrompt = `
Professional architectural photography of a ${analysis.room_type}, approximately ${analysis.approximate_size_sqm} square meters.

ARCHITECTURAL LAYOUT (MUST PRESERVE EXACTLY):
${features}

Windows:
${windowsDescription}

${doorsDescription ? `Doors:\n${doorsDescription}\n` : ''}
Flooring: ${analysis.flooring_type}
Walls: ${analysis.wall_color}
Ceiling: ${analysis.ceiling_type}${specialFeatures}

DESIGN TRANSFORMATION:
Style: ${targetStyle}
User request: ${userRequest}

STRICT REQUIREMENTS:
- Preserve the EXACT architectural layout described above
- Keep all structural elements in their specified positions
- Maintain the same room dimensions and proportions
- Change ONLY: furniture, decorative elements, material textures, colors, lighting fixtures
- Do NOT move or alter: windows, doors, stairs, fireplace, built-in features
- Quality: Photorealistic, 8K resolution, architectural magazine quality
- Lighting: Natural sunlight through windows + ambient interior lighting
- Style: High-end professional interior design
- Perspective: Proper architectural perspective, sharp focus throughout
- Rendering: Physically based rendering, ray-traced reflections, realistic materials
    `.trim();

    console.log('[Prompt Builder] Generated prompt length:', detailedPrompt.length, 'characters');

    // Log a preview
    const preview = detailedPrompt.substring(0, 200) + '...';
    console.log('[Prompt Builder] Preview:', preview);

    return detailedPrompt;
}

/**
 * Build a fallback prompt if vision analysis fails
 * This is used as a safety net
 */
export function buildFallbackPrompt(
    roomType: string,
    style: string,
    userRequest: string
): string {
    return `
Professional ${style} style ${roomType}.
${userRequest}
Photorealistic, 8K, architectural photography, high-end interior design, natural lighting.
    `.trim();
}
