// Vercel Serverless Function: /api/chat
// Securely proxies AI Tutor requests without exposing API keys to the client.

const SYSTEM_PROMPT = `You are a concise, direct Computer Networks and Theory of Computation AI Tutor.
The student explicitly wants SHORT, HIGH-YIELD answers with only the MOST IMPORTANT points in an easily understandable format.

STRICT INSTRUCTIONS:
1. MAXIMUM 3 TO 4 BULLET POINTS TOTAL.
2. Structure your response:
   **🎯 Core Idea:** 1 short sentence stating the primary concept.
   • **Key Takeaway 1:** Short bullet with bold term (**Dijkstra**, **Failover**, etc.).
   • **Key Takeaway 2:** Short bullet with the specific mechanism or rule.
3. NEVER write long paragraphs, greetings, or filler text.
4. NO LaTeX dollar signs ($); use plain text and arrows (→).
5. Maximum length: 70-85 words. Keep it punchy, direct, and crystal clear.`;

const CANDIDATE_MODELS = [
    'gemini-flash-lite-latest',
    'gemini-3.8-flash',
    'gemini-flash-latest'
];

function getEducationalFallback(query, ctx) {
    const q = (query || "").toLowerCase();
    const route = ctx?.activeRoute || "PC → R1 → R2 → R4 → Server";
    const cost = ctx?.activeCost ?? "6";

    if (q.includes("dijkstra") || q.includes("shortest") || q.includes("spf")) {
        return `**🎯 Core Idea:** Dijkstra calculates the lowest total metric path from source **PC** to **Server**.\n• **Algorithm:** Greedily relaxes edges: \`dist[v] = min(dist[v], dist[u] + weight)\`.\n• **Optimal Route:** **PC → R1 → R2 → R4 → Server** (Cost = **6**).\n• **Live State:** Route: \`${route}\` • Cost: **${cost}**.`;
    }
    if (q.includes("r2") || q.includes("failover") || q.includes("recover")) {
        return `**🎯 Core Idea:** Automatic failover reroutes traffic instantly when Router **R2** crashes.\n• **Reaction:** Loss of signal marks links \`R1-R2\` and \`R2-R4\` down.\n• **Alternate Path:** Dijkstra reroutes via backup core **R3**: **PC → R1 → R3 → R4 → Server** (Cost = **7**).\n• **Takeaway:** Zero packet drop with automated dynamic Link-State convergence!`;
    }
    if (q.includes("drop") || q.includes("unreach") || q.includes("loss")) {
        return `**🎯 Core Idea:** Packets drop when **no connected path** exists from PC to Server.\n• **Triggers:** Both core routers (R2 & R3) down, or edge gateway R1 down.\n• **Simulator Reaction:** Dijkstra returns metric = **∞**; packet forwarding is halted.\n• **Live State:** Route: \`${route}\` • Cost: **${cost}**.`;
    }
    return `**🎯 Core Idea:** Network Failure & Automatic Recovery Simulator:\n• **Optimal Route:** \`${route}\` (Cost: **${cost}**).\n• **Try asking:** *"How does Dijkstra work?"* or *"What happens when R2 fails?"*`;
}

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(200).json({ status: 'ok', service: 'AI Tutor Serverless API' });
    }

    try {
        const { message, simulatorContext, history = [] } = req.body || {};
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'Message cannot be empty.' });
        }

        const apiKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim();

        if (!apiKey) {
            // High-yield fallback when no API key is configured in Vercel environment
            return res.status(200).json({
                reply: getEducationalFallback(message, simulatorContext),
                mode: 'offline-demo'
            });
        }

        // Prepare message payload
        const contents = [];
        if (Array.isArray(history)) {
            for (const h of history.slice(-4)) {
                if (h.role && h.content) {
                    contents.push({
                        role: h.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: h.content }]
                    });
                }
            }
        }
        contents.push({ role: 'user', parts: [{ text: message.trim() }] });

        let reply = "";
        let lastErr = null;

        for (const model of CANDIDATE_MODELS) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const fetchRes = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
                        contents: contents,
                        generationConfig: {
                            temperature: 0.25,
                            maxOutputTokens: 200
                        }
                    })
                });

                if (fetchRes.ok) {
                    const data = await fetchRes.json();
                    reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (reply && reply.trim()) break;
                } else {
                    lastErr = new Error(`Model ${model} returned ${fetchRes.status}`);
                }
            } catch (err) {
                lastErr = err;
            }
        }

        if (!reply) {
            reply = getEducationalFallback(message, simulatorContext);
        }

        return res.status(200).json({
            reply: reply.trim(),
            mode: 'gemini'
        });

    } catch (err) {
        console.error('Serverless Chat Error:', err);
        return res.status(500).json({
            error: "Unable to process tutor request.",
            details: err.message
        });
    }
};
