module.exports=[63925,e=>{"use strict";var r=e.i(29642);async function o(e){let o=process.env.CHAT_MODEL_VERSION||"gemini-2.5-flash";console.log("[Triage] Starting analysis..."),console.log(`[Triage] Model: ${o}`);let t=process.env.GEMINI_API_KEY;if(!t)throw Error("GEMINI_API_KEY not found");let a=new r.GoogleGenerativeAI(t).getGenerativeModel({model:o,generationConfig:{responseMimeType:"application/json"}}),i=`Analyze this image for a home renovation context. 
    First, determine if this is an image of a room, building interior, or architectural space suitable for renovation.
    If it is a picture of a pet, food, person (without room context), car, or landscape without buildings, set "is_relevant" to false.

    Return ONLY a JSON object with this structure: 
    { 
        "is_relevant": boolean,
        "relevance_reason": "Brief explanation of why it is relevant or not",
        "summary_for_chat": "A brief, natural language description of what you see (max 2 sentences) to be used by a chatbot. If irrelevant, describe what it is.", 
        "technical_data": { 
            "room_type": "string (or 'unknown' if irrelevant)", 
            "condition": "good|average|poor|shell", 
            "complexity_score": number (1-10), 
            "detected_materials": ["string"] 
        } 
    }`;try{let r=e.toString("base64"),o=(await a.generateContent([i,{inlineData:{data:r,mimeType:"image/jpeg"}}])).response.text();console.log("[Triage] Raw response:",o.substring(0,100)+"...");let t=o.replace(/```json\n?|```/g,"").trim(),n=JSON.parse(t);if(!n.summary_for_chat||!n.technical_data)throw Error("Invalid JSON structure: missing required fields");return console.log("[Triage] ✅ Analysis complete:",n.technical_data.room_type),n}catch(e){throw console.error("[Triage] Error:",e),Error(`Triage analysis failed: ${e instanceof Error?e.message:"Unknown error"}`)}}e.s(["analyzeImageForChat",()=>o])}];

//# sourceMappingURL=ai_core_src_vision_triage_ts_077e289f._.js.map