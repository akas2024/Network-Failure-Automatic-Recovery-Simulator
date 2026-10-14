/**
 * ============================================================
 * AI TUTOR CHAT CONTROLLER
 * Theory of Computation (CFG & PDA) Educational Assistant
 * ============================================================
 */

(function () {
    'use strict';

    // Backend endpoint configuration
    // If running over HTTP/HTTPS (e.g. localhost or ngrok tunnel), use current origin; otherwise default to localhost:5000
    const BACKEND_URL = (window.location.protocol && window.location.protocol.startsWith('http')) 
        ? window.location.origin 
        : 'http://localhost:5000';

    // Conversation state
    let chatHistory = [];
    let isWaitingForResponse = false;

    // ------------------------------------------------------------
    // 1. SIMPLE & SECURE MARKDOWN RENDERER
    // ------------------------------------------------------------
    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

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

    function renderMarkdown(md) {
        if (!md) return '';

        // Pre-clean LaTeX math and dollar signs
        md = cleanLatexMath(md);

        // Separate and protect code blocks
        const codeBlocks = [];
        let text = md.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const index = codeBlocks.length;
            codeBlocks.push({ lang: lang || 'text', code: code.trim() });
            return `__CODE_BLOCK_${index}__`;
        });

        // Split into lines for block-level parsing
        const lines = text.split('\n');
        const output = [];
        let inList = null; // 'ul' or 'ol'
        let inBlockquote = false;
        let bqContent = [];

        function closeList() {
            if (inList) {
                output.push(`</${inList}>`);
                inList = null;
            }
        }

        function closeBlockquote() {
            if (inBlockquote) {
                output.push(`<blockquote>${bqContent.join('<br>')}</blockquote>`);
                inBlockquote = false;
                bqContent = [];
            }
        }

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            // Check for code block placeholder line
            if (line.trim().startsWith('__CODE_BLOCK_') && line.trim().endsWith('__')) {
                closeList();
                closeBlockquote();
                output.push(line.trim());
                continue;
            }

            // Blockquote
            if (line.startsWith('>')) {
                closeList();
                inBlockquote = true;
                const bqLine = line.replace(/^>\s?/, '');
                bqContent.push(formatInline(bqLine));
                continue;
            } else if (inBlockquote) {
                closeBlockquote();
            }

            // Headings
            const h4Match = line.match(/^####\s+(.+)$/);
            const h3Match = line.match(/^###\s+(.+)$/);
            const h2Match = line.match(/^##\s+(.+)$/);
            const h1Match = line.match(/^#\s+(.+)$/);

            if (h4Match) {
                closeList();
                output.push(`<h4>${formatInline(h4Match[1])}</h4>`);
                continue;
            }
            if (h3Match) {
                closeList();
                output.push(`<h3>${formatInline(h3Match[1])}</h3>`);
                continue;
            }
            if (h2Match) {
                closeList();
                output.push(`<h2>${formatInline(h2Match[1])}</h2>`);
                continue;
            }
            if (h1Match) {
                closeList();
                output.push(`<h1>${formatInline(h1Match[1])}</h1>`);
                continue;
            }

            // Ordered list
            const olMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
            if (olMatch) {
                if (inList !== 'ol') {
                    closeList();
                    output.push('<ol>');
                    inList = 'ol';
                }
                output.push(`<li>${formatInline(olMatch[2])}</li>`);
                continue;
            }

            // Unordered list
            const ulMatch = line.match(/^\s*[-*•]\s+(.+)$/);
            if (ulMatch) {
                if (inList !== 'ul') {
                    closeList();
                    output.push('<ul>');
                    inList = 'ul';
                }
                output.push(`<li>${formatInline(ulMatch[1])}</li>`);
                continue;
            }

            // Regular paragraph line
            closeList();
            if (line.trim() === '') {
                // blank line
                continue;
            } else {
                output.push(`<p>${formatInline(line)}</p>`);
            }
        }

        closeList();
        closeBlockquote();

        let rendered = output.join('\n');

        // Restore code blocks with syntax wrapper and copy button
        rendered = rendered.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
            const block = codeBlocks[parseInt(index, 10)];
            if (!block) return '';
            const safeCode = escapeHtml(block.code);
            return `
                <div class="ai-code-block-wrapper">
                    <div class="ai-code-header">
                        <span>${escapeHtml(block.lang)}</span>
                        <button class="ai-code-copy-btn" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(block.code)}')).then(() => { this.textContent = 'Copied!'; setTimeout(() => this.textContent = 'Copy', 1500); })">Copy</button>
                    </div>
                    <pre><code>${safeCode}</code></pre>
                </div>
            `;
        });

        return rendered;
    }

    function formatInline(str) {
        if (!str) return '';
        // Pre-clean LaTeX math and dollar signs
        str = cleanLatexMath(str);
        // Escape raw HTML first
        let res = escapeHtml(str);

        // Inline code `...`
        res = res.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // Bold **...** or __...__
        res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        res = res.replace(/__([^_]+)__/g, '<strong>$1</strong>');

        // Italic *...*
        res = res.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        return res;
    }

    // ------------------------------------------------------------
    // 2. DOM CREATION AND INJECTION
    // ------------------------------------------------------------
    function ensureChatMarkup() {
        if (document.getElementById('aiTutorPanel')) return;

        // Overlay
        const overlay = document.createElement('div');
        overlay.id = 'aiTutorOverlay';
        overlay.className = 'ai-tutor-overlay';
        document.body.appendChild(overlay);

        // Chat Panel Drawer
        const panel = document.createElement('aside');
        panel.id = 'aiTutorPanel';
        panel.className = 'ai-tutor-panel';
        panel.setAttribute('aria-label', 'AI Tutor Panel');
        panel.innerHTML = `
            <!-- Panel Header -->
            <div class="ai-tutor-header">
                <div class="ai-tutor-header-info">
                    <div class="ai-tutor-avatar">🤖</div>
                    <div class="ai-tutor-title-group">
                        <div class="ai-tutor-title-row">
                            <span class="ai-tutor-title">AI Tutor</span>
                            <span class="ai-tutor-status-badge" id="aiTutorStatusBadge">
                                <span class="badge-dot"></span> Ready
                            </span>
                        </div>
                        <span class="ai-tutor-subtitle">Your CFG &amp; PDA Learning Assistant</span>
                    </div>
                </div>
                <div class="ai-tutor-header-actions">
                    <button id="aiTutorClearBtn" class="ai-tutor-header-btn" title="Clear chat history" aria-label="Clear chat">🗑️</button>
                    <button id="aiTutorCloseBtn" class="ai-tutor-header-btn ai-tutor-close-btn" title="Close AI Tutor (Esc)" aria-label="Close AI Tutor">&times;</button>
                </div>
            </div>

            <!-- Starter Suggestion Chips -->
            <div class="ai-tutor-chips-bar" id="aiTutorChipsBar">
                <button class="ai-chip" data-question="Why does PDA use a stack?">⚡ Why stack?</button>
                <button class="ai-chip" data-question="Explain CFG to PDA conversion step by step">📖 CFG to PDA</button>
                <button class="ai-chip" data-question="Explain PDA like I'm a beginner with a simple analogy">👶 Explain like I'm 5</button>
                <button class="ai-chip" data-question="What is the difference between leftmost and rightmost derivation?">🌳 Derivations</button>
                <button class="ai-chip" data-question="Can you explain the current grammar loaded in the simulator?">🔍 Current Grammar</button>
            </div>

            <!-- Messages Container -->
            <div class="ai-tutor-messages" id="aiTutorMessages" role="log" aria-live="polite">
                <!-- Initial Welcome Greeting -->
                <div class="ai-message-row bot-row">
                    <div class="ai-bubble-bot-container">
                        <div class="ai-bot-avatar-tiny">🤖</div>
                        <div class="ai-bubble-bot">
                            <h3>👋 Welcome to your AI Tutor!</h3>
                            <p>I am your dedicated <strong>Theory of Computation (TOC)</strong> learning assistant. I can help explain concepts in simple, beginner-friendly language, step by step.</p>
                            <p>You can ask me anything about:</p>
                            <ul>
                                <li><strong>Context-Free Grammars (CFG)</strong> &amp; Derivations</li>
                                <li><strong>Pushdown Automata (PDA)</strong> &amp; Stack Operations</li>
                                <li><strong>CFG &rarr; PDA Conversion Algorithm</strong></li>
                                <li><strong>Transitions &amp; Acceptance vs. Rejection</strong></li>
                            </ul>
                            <blockquote>💡 <strong>Try clicking any suggestion chip above</strong> or type your own question below!</blockquote>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Panel Footer / Input Area -->
            <div class="ai-tutor-footer">
                <div class="ai-tutor-input-box">
                    <textarea 
                        id="aiTutorInput" 
                        class="ai-tutor-textarea" 
                        placeholder="Ask anything about CFG, PDA, or Automata..."
                        rows="1"
                        aria-label="Ask AI Tutor"></textarea>
                    <button id="aiTutorSendBtn" class="ai-tutor-send-btn" title="Send Question" aria-label="Send">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
                <div class="ai-tutor-input-hint">
                    <span>Press <strong>Enter</strong> to send &bull; <strong>Shift+Enter</strong> for newline</span>
                    <span id="aiTutorEngineNotice" style="font-size: 9.5px; opacity: 0.8;"></span>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
    }

    // ------------------------------------------------------------
    // 3. EXTRACT ACTIVE SIMULATOR CONTEXT
    // ------------------------------------------------------------
    function getSimulatorContext() {
        try {
            const vars = document.getElementById('variables')?.value || '';
            const terms = document.getElementById('terminals')?.value || '';
            const prods = document.getElementById('productions')?.value || '';
            const inputStr = document.getElementById('inputString')?.value || '';
            const curState = document.getElementById('currentState')?.textContent || '';
            const stepNum = document.getElementById('stepBadgeCounter')?.textContent || '0';

            return {
                variables: vars,
                terminals: terms,
                productions: prods,
                inputString: inputStr,
                currentState: curState,
                step: stepNum
            };
        } catch (e) {
            return {};
        }
    }

    // ------------------------------------------------------------
    // 4. UI INTERACTION & TOGGLE CONTROLS
    // ------------------------------------------------------------
    function toggleChat(open) {
        const panel = document.getElementById('aiTutorPanel');
        const overlay = document.getElementById('aiTutorOverlay');
        const tutorBtn = document.getElementById('aiTutorBtn');
        const input = document.getElementById('aiTutorInput');

        if (!panel) return;

        const shouldOpen = (open !== undefined) 
            ? Boolean(open) 
            : !panel.classList.contains('is-open');

        if (shouldOpen) {
            panel.classList.add('is-open');
            if (overlay && window.innerWidth <= 768) {
                overlay.classList.add('is-visible');
            }
            if (tutorBtn) tutorBtn.classList.add('is-active');
            if (input) {
                setTimeout(() => input.focus(), 150);
            }
            checkBackendHealth();
        } else {
            panel.classList.remove('is-open');
            if (overlay) overlay.classList.remove('is-visible');
            if (tutorBtn) tutorBtn.classList.remove('is-active');
        }
    }

    function checkBackendHealth() {
        const statusBadge = document.getElementById('aiTutorStatusBadge');
        const engineNotice = document.getElementById('aiTutorEngineNotice');

        fetch(`${BACKEND_URL}/api/health`)
            .then(res => res.json())
            .then(data => {
                if (statusBadge) {
                    if (data.mode === 'gemini') {
                        statusBadge.innerHTML = '<span class="badge-dot" style="background:#00EA64;"></span> Gemini Live';
                    } else if (data.mode === 'openai') {
                        statusBadge.innerHTML = '<span class="badge-dot" style="background:#00EA64;"></span> GPT Live';
                    } else {
                        statusBadge.innerHTML = '<span class="badge-dot" style="background:#38bdf8;"></span> Local Tutor';
                    }
                }
                if (engineNotice) {
                    if (data.mode === 'gemini') {
                        engineNotice.textContent = 'Powered by Gemini AI';
                    } else if (data.mode === 'openai') {
                        engineNotice.textContent = 'Powered by OpenAI';
                    } else {
                        engineNotice.textContent = 'Local Educational Mode';
                    }
                }
            })
            .catch(() => {
                if (statusBadge) {
                    statusBadge.innerHTML = '<span class="badge-dot" style="background:#f59e0b;"></span> Standalone';
                }
                if (engineNotice) {
                    engineNotice.textContent = 'Start backend for live AI';
                }
            });
    }

    // ------------------------------------------------------------
    // 5. MESSAGE APPENDING & SCROLLING
    // ------------------------------------------------------------
    function appendUserMessage(text) {
        const messagesContainer = document.getElementById('aiTutorMessages');
        if (!messagesContainer) return;

        const row = document.createElement('div');
        row.className = 'ai-message-row user-row';
        row.innerHTML = `<div class="ai-bubble-user">${escapeHtml(text)}</div>`;
        messagesContainer.appendChild(row);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function appendThinkingIndicator() {
        const messagesContainer = document.getElementById('aiTutorMessages');
        if (!messagesContainer) return null;

        const row = document.createElement('div');
        row.className = 'ai-message-row bot-row';
        row.id = 'aiThinkingRow';
        row.innerHTML = `
            <div class="ai-bubble-bot-container">
                <div class="ai-bot-avatar-tiny">🤔</div>
                <div class="ai-thinking-indicator">
                    <span>AI Tutor is thinking...</span>
                    <div class="ai-dot-pulse">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            </div>
        `;
        messagesContainer.appendChild(row);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return row;
    }

    function replaceThinkingWithResponse(markdownReply) {
        const thinkingRow = document.getElementById('aiThinkingRow');
        const messagesContainer = document.getElementById('aiTutorMessages');
        if (!messagesContainer) return;

        const botRow = document.createElement('div');
        botRow.className = 'ai-message-row bot-row';
        botRow.innerHTML = `
            <div class="ai-bubble-bot-container">
                <div class="ai-bot-avatar-tiny">🤖</div>
                <div class="ai-bubble-bot">
                    ${renderMarkdown(markdownReply)}
                </div>
            </div>
        `;

        if (thinkingRow) {
            thinkingRow.replaceWith(botRow);
        } else {
            messagesContainer.appendChild(botRow);
        }
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // ------------------------------------------------------------
    // 6. SENDING QUESTIONS TO BACKEND
    // ------------------------------------------------------------
    async function sendMessage(questionText) {
        const text = (questionText !== undefined) 
            ? questionText.trim() 
            : (document.getElementById('aiTutorInput')?.value || '').trim();

        if (!text || isWaitingForResponse) return;

        // Clear input
        const input = document.getElementById('aiTutorInput');
        if (input && questionText === undefined) {
            input.value = '';
            input.style.height = 'auto';
        }

        // Show user message
        appendUserMessage(text);
        chatHistory.push({ role: 'user', content: text });

        // Show thinking indicator
        isWaitingForResponse = true;
        const sendBtn = document.getElementById('aiTutorSendBtn');
        if (sendBtn) sendBtn.disabled = true;
        appendThinkingIndicator();

        // Get context from simulator
        const context = getSimulatorContext();

        try {
            const response = await fetch(`${BACKEND_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    simulatorContext: context,
                    history: chatHistory.slice(-8)
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Server error');
            }

            const data = await response.json();
            const reply = data.reply || "Sorry, I couldn't generate a response right now. Please try again.";

            replaceThinkingWithResponse(reply);
            chatHistory.push({ role: 'assistant', content: reply });

        } catch (err) {
            console.warn('AI Tutor communication error:', err);
            const fallbackMsg = "Sorry, I couldn't generate a response right now. Please try again.\n\n*(Tip: Make sure the AI Tutor backend server is running with `npm start` in `ai-tutor/backend`)*";
            replaceThinkingWithResponse(fallbackMsg);
        } finally {
            isWaitingForResponse = false;
            if (sendBtn) sendBtn.disabled = false;
            if (input) input.focus();
        }
    }

    // ------------------------------------------------------------
    // 7. INITIALIZATION & EVENT BINDINGS
    // ------------------------------------------------------------
    function init() {
        ensureChatMarkup();

        const tutorBtn = document.getElementById('aiTutorBtn');
        const closeBtn = document.getElementById('aiTutorCloseBtn');
        const clearBtn = document.getElementById('aiTutorClearBtn');
        const overlay = document.getElementById('aiTutorOverlay');
        const input = document.getElementById('aiTutorInput');
        const sendBtn = document.getElementById('aiTutorSendBtn');
        const chipsBar = document.getElementById('aiTutorChipsBar');

        // Toggle on header button click
        if (tutorBtn) {
            tutorBtn.addEventListener('click', (e) => {
                e.preventDefault();
                toggleChat();
            });
        }

        // Close on close button click
        if (closeBtn) {
            closeBtn.addEventListener('click', () => toggleChat(false));
        }

        // Close on backdrop overlay click
        if (overlay) {
            overlay.addEventListener('click', () => toggleChat(false));
        }

        // Clear chat
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                const messagesContainer = document.getElementById('aiTutorMessages');
                if (messagesContainer) {
                    chatHistory = [];
                    messagesContainer.innerHTML = `
                        <div class="ai-message-row bot-row">
                            <div class="ai-bubble-bot-container">
                                <div class="ai-bot-avatar-tiny">🤖</div>
                                <div class="ai-bubble-bot">
                                    <h3>Conversation Cleared</h3>
                                    <p>I am ready for your next question! Ask anything about CFG, PDA, stack transitions, or automata theory.</p>
                                </div>
                            </div>
                        </div>
                    `;
                }
            });
        }

        // Send on send button click
        if (sendBtn) {
            sendBtn.addEventListener('click', () => sendMessage());
        }

        // Input keyboard events (Enter to send, Shift+Enter for newline)
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });

            // Auto-expand input height up to max
            input.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 100) + 'px';
            });
        }

        // Quick suggestion chips click
        if (chipsBar) {
            chipsBar.addEventListener('click', (e) => {
                const chip = e.target.closest('.ai-chip');
                if (chip && chip.dataset.question) {
                    sendMessage(chip.dataset.question);
                }
            });
        }

        // Close on Escape key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const panel = document.getElementById('aiTutorPanel');
                if (panel && panel.classList.contains('is-open')) {
                    toggleChat(false);
                }
            }
        });

        // Initial health check
        checkBackendHealth();
    }

    // Auto-init on DOMContentLoaded or immediately if DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export public helper to window if needed
    window.aiTutor = {
        open: () => toggleChat(true),
        close: () => toggleChat(false),
        toggle: () => toggleChat(),
        ask: (q) => {
            toggleChat(true);
            sendMessage(q);
        }
    };

})();
