const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve static frontend files from project root
app.use(express.static(path.join(__dirname, '../../')));

// System prompt defining the AI Tutor's concise, direct persona
const SYSTEM_PROMPT = `You are a concise, direct, and focused Theory of Computation (TOC) AI Tutor for a CFG to PDA Converter and Simulator.

CRITICAL INSTRUCTIONS:
1. STRICTLY SHORT ANSWERS: Answer ONLY what was asked in 2 to 3 concise bullet points or 1 to 2 short sentences (under 50-70 words total).
2. NO DOLLAR SIGNS ($) OR LATEX:
   - NEVER use $ or $$ dollar signs (NO $S$, NO $$S$$, NO $Z$, NO $a$).
   - NEVER use LaTeX commands (NO \\rightarrow, NO \\varepsilon, NO \\alpha).
   - Use plain characters or clean Unicode: write S, Z, a, b, '→' (arrow), 'ε' (epsilon), 'α' (alpha).
   - For rules or transitions, use plain text or inline code: \`S -> aSb\` or \`(q1, ε, A) -> (q1, α)\`.
3. DIRECT TO THE POINT: State the direct answer immediately without greetings or filler.
4. BOLD KEY TERMS: Highlight key concepts using bold text.

Examples of desired clean format:

Q: "Why does PDA use a stack?"
A:
A **PDA uses a stack** as unbounded LIFO memory to match symbols.
- **Why DFA fails:** A DFA only has finite states and cannot count arbitrary symbols.
- **How stack helps:** Pushes on 'a', pops on 'b'—if stack is empty at the end, counts matched (aⁿbⁿ).

Q: "Explain PDA"
A:
A **Pushdown Automaton (PDA)** is a Finite Automaton with an added **stack memory (LIFO)**.
- **Language Class:** Recognizes **Context-Free Languages** (equivalent to CFGs).
- **Core Action:** Reads input, checks/pops stack top, and pushes replacement symbols.
- **Acceptance:** Accepts by entering an **accept state** or by **empty stack**.

Q: "Explain CFG to PDA conversion"
A:
**Top-down CFG to PDA construction (3 steps):**
1. **Start (q0 → q1):** Push start variable S and bottom marker Z.
2. **Expand (q1):** Replace variable A with rule RHS α: (q1, ε, A) → (q1, α).
3. **Match (q1):** Pop terminal a when matching input: (q1, a, a) → (q1, ε).
Accepts in q2 when input is consumed and stack is empty.`;

// Clean any accidental LaTeX math and dollar signs
function cleanLatexMath(str) {
    if (!str) return '';
    let text = str;
    text = text.replace(/\\rightarrow|\\to/g, '→');
    text = text.replace(/\\leftarrow/g, '←');
    text = text.replace(/\\Rightarrow/g, '⇒');
    text = text.replace(/\\varepsilon|\\epsilon/g, 'ε');
    text = text.replace(/\\alpha/g, 'α');
    text = text.replace(/\\beta/g, 'β');
    text = text.replace(/\\gamma/g, 'γ');
    text = text.replace(/\\Gamma/g, 'Γ');
    text = text.replace(/\\delta/g, 'δ');
    text = text.replace(/\\Delta/g, 'Δ');
    text = text.replace(/\\Sigma/g, 'Σ');
    text = text.replace(/\\sigma/g, 'σ');
    text = text.replace(/\\le|\\leq/g, '≤');
    text = text.replace(/\\ge|\\geq/g, '≥');
    text = text.replace(/\\neq/g, '≠');
    text = text.replace(/\\mid/g, '|');
    text = text.replace(/\\in/g, '∈');
    text = text.replace(/\\notin/g, '∉');
    text = text.replace(/\\times/g, '×');

    // Remove $$...$$ and $...$
    text = text.replace(/\$\$([^$]+)\$\$/g, '$1');
    text = text.replace(/\$([^$]+)\$/g, '$1');
    text = text.replace(/\$\$/g, '');
    text = text.replace(/\$/g, '');

    return text;
}

// Local educational fallback knowledge base with short, direct answers
function getLocalEducationalResponse(query, context) {
    const q = query.toLowerCase();

    if (q.includes("why") && q.includes("stack")) {
        return `A **PDA uses a stack** as unbounded LIFO memory to count and match symbols:
- **DFA Limitation:** A regular DFA has finite states and cannot count arbitrarily large numbers (like matching aⁿ with bⁿ).
- **Stack Operation:** Pushes on a, pops on b. If the stack is empty at the end of input, the string is accepted!`;
    }

    if (q.includes("explain pda") || (q.includes("what is pda") || (q.includes("pushdown") && !q.includes("cfg")))) {
        return `A **Pushdown Automaton (PDA)** is a Finite Automaton equipped with a **memory stack (LIFO)**:
- **Power:** Recognizes **Context-Free Languages** (CFLs).
- **Operation:** Reads input, checks/pops top stack symbol, and pushes new symbols.
- **Acceptance:** By entering an **accept state** or by **empty stack**.`;
    }

    if (q.includes("cfg to pda") || q.includes("conversion") || q.includes("convert")) {
        return `**CFG to PDA Construction (3 Steps):**
1. **Start (q0 → q1):** Push start symbol S and bottom marker Z.
2. **Expand (q1):** For rule A → α, pop A and push α: (q1, ε, A) → (q1, α).
3. **Match (q1):** Pop terminal a on reading input a: (q1, a, a) → (q1, ε).
Accepts in q2 when input is consumed and stack is empty.`;
    }

    if (q.includes("leftmost") || q.includes("rightmost") || q.includes("derivation")) {
        return `**Derivations in CFG:**
- **Leftmost Derivation (LMD):** Replaces the leftmost non-terminal variable first at each step (simulated by top-down PDA).
- **Rightmost Derivation (RMD):** Replaces the rightmost non-terminal variable first at each step.
Both generate the exact same parse tree if the grammar is unambiguous.`;
    }

    if (q.includes("beginner") || q.includes("like i'm 5") || q.includes("simple analogy")) {
        return `Think of a PDA like a robot with a **stack of plates**:
- For every \`a\`, it puts a plate on the stack.
- For every \`b\`, it takes a plate off.
- If no plates are left when the string ends, it's **accepted**!`;
    }

    if (context && (q.includes("current") || q.includes("simulator") || q.includes("grammar") || q.includes("my"))) {
        const prod = context.productions || "S -> aSb | ε";
        const vars = context.variables || "S";
        const input = context.inputString || "(empty)";
        return `**Current Simulator Grammar:**
- **Variables:** \`${vars}\` | **Input:** \`${input}\`
- **Rules:** \`${prod.replace(/\n/g, ', ')}\`
**Action:** Starts with \`${vars.split(',')[0].trim()}\` on stack, expands variables using production rules, and matches terminals against \`${input}\`.`;
    }

    return `**${query.trim()}**
- **CFG (Context-Free Grammar):** Generates syntax rules for hierarchical languages.
- **PDA (Pushdown Automaton):** Recognizes CFG languages using a LIFO memory stack.
- **Key Operations:** Push (add to top), Pop (remove from top), and Match.`;
}

// Supported Gemini models in priority order
const GEMINI_CANDIDATE_MODELS = [
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-flash-latest'
];

// Call Google Gemini API with automatic model fallback
async function callGemini(apiKey, preferredModel, messages, systemPrompt) {
    // Map conversation to Gemini contents format
    const contents = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    // Build ordered list of models to try
    const modelsToTry = (preferredModel && !preferredModel.includes('1.5'))
        ? [preferredModel, ...GEMINI_CANDIDATE_MODELS.filter(m => m !== preferredModel)]
        : GEMINI_CANDIDATE_MODELS;

    let lastError = null;

    for (const model of modelsToTry) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

            const requestBody = {
                system_instruction: {
                    parts: [{ text: systemPrompt }]
                },
                contents: contents,
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 350,
                    topP: 0.95
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Model ${model} returned ${response.status}: ${errorData}`);
            }

            const data = await response.json();
            const candidate = data.candidates?.[0];
            const text = candidate?.content?.parts?.[0]?.text;

            if (text) {
                return text;
            }
        } catch (err) {
            console.warn(`[Gemini] ${model} unavailable:`, err.message.slice(0, 90));
            lastError = err;
        }
    }

    throw lastError || new Error('All candidate Gemini models failed.');
}

// Call OpenAI API
async function callOpenAI(apiKey, model, messages, systemPrompt) {
    const formattedMessages = [
        { role: 'system', content: systemPrompt },
        ...messages
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: formattedMessages,
            temperature: 0.4,
            max_tokens: 300
        })
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`OpenAI API Error (${response.status}): ${errorData}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
        throw new Error('OpenAI API returned an empty response.');
    }
    return text;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== '');

    let mode = 'offline-demo';
    if (hasGemini) mode = 'gemini';
    else if (hasOpenAI) mode = 'openai';

    res.json({
        status: 'ok',
        mode: mode,
        message: 'AI Tutor server is running',
        hasApiKey: hasGemini || hasOpenAI
    });
});

// Chat completion endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, simulatorContext, history = [] } = req.body;

        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'Message cannot be empty.' });
        }

        const trimmedMessage = message.trim();

        // Build enriched context into system instruction if available
        let enrichedSystemPrompt = SYSTEM_PROMPT;
        if (simulatorContext && (simulatorContext.variables || simulatorContext.productions)) {
            enrichedSystemPrompt += `\n\nCURRENT SIMULATOR STATE CONTEXT (For your reference if user asks about their grammar/input):\n` +
                `- Variables: ${simulatorContext.variables || 'None'}\n` +
                `- Terminals: ${simulatorContext.terminals || 'None'}\n` +
                `- Productions: ${simulatorContext.productions || 'None'}\n` +
                `- Input String: ${simulatorContext.inputString || 'None'}\n` +
                `- Current State: ${simulatorContext.currentState || 'q0'}\n` +
                `- Step Number: ${simulatorContext.step || '0'}`;
        }

        // Prepare messages array
        const messageList = [];
        if (Array.isArray(history)) {
            for (const h of history.slice(-6)) { // keep last 6 turns for context
                if (h.role && h.content) {
                    messageList.push({ role: h.role, content: h.content });
                }
            }
        }
        messageList.push({ role: 'user', content: trimmedMessage });

        const geminiKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim();
        const openaiKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim();

        let aiReply = "";

        if (geminiKey) {
            // Live dynamic response from Google Gemini
            const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
            try {
                aiReply = await callGemini(geminiKey, model, messageList, enrichedSystemPrompt);
            } catch (geminiErr) {
                console.warn('Gemini API call failed, falling back to local engine:', geminiErr.message);
                aiReply = getLocalEducationalResponse(trimmedMessage, simulatorContext);
                aiReply += `\n\n> ⚠️ **Notice:** Live Gemini API could not be reached (\`${geminiErr.message.slice(0, 100)}\`). Serving structured response from built-in TOC tutor knowledge base.`;
            }
        } else if (openaiKey) {
            // Live dynamic response from OpenAI
            const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
            try {
                aiReply = await callOpenAI(openaiKey, model, messageList, enrichedSystemPrompt);
            } catch (openaiErr) {
                console.warn('OpenAI API call failed, falling back to local engine:', openaiErr.message);
                aiReply = getLocalEducationalResponse(trimmedMessage, simulatorContext);
                aiReply += `\n\n> ⚠️ **Notice:** Live OpenAI API could not be reached. Serving structured response from built-in TOC tutor knowledge base.`;
            }
        } else {
            // High-quality local educational fallback if no API key is configured yet
            aiReply = getLocalEducationalResponse(trimmedMessage, simulatorContext);
            aiReply += `\n\n> 💡 **Notice:** Running in local educational mode. To activate live dynamic AI responses with Google Gemini, paste your free Gemini API key into \`ai-tutor/backend/.env\` and restart the server!`;
        }

        // Clean any residual LaTeX commands or dollar signs
        aiReply = cleanLatexMath(aiReply);

        return res.json({
            reply: aiReply,
            mode: geminiKey ? 'gemini' : (openaiKey ? 'openai' : 'local-demo')
        });

    } catch (err) {
        console.error('AI Tutor Chat Error:', err);
        return res.status(500).json({
            error: "Sorry, I couldn't generate a response right now. Please try again.",
            details: err.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🤖 AI Tutor Backend Server is active on port ${PORT}`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
