/**
 * ============================================================================
 * NETWORK FAILURE & AUTOMATIC RECOVERY SIMULATOR
 * Interactive Step-by-Step Simulation Engine & Dashboard Controller
 * ============================================================================
 */

(function () {
    "use strict";

    /* ========================================================================
       1. NETWORK DATA STRUCTURES & SVG POSITIONS (640x400 Canvas)
       ======================================================================== */

    const INITIAL_NODES = {
        PC: {
            id: "PC",
            name: "PC (Client Host)",
            ip: "192.168.1.10",
            pos: { x: 70, y: 200 },
            status: "ACTIVE",
            role: "INIT"
        },
        R1: {
            id: "R1",
            name: "Router R1 (Gateway)",
            ip: "10.0.1.1",
            pos: { x: 190, y: 200 },
            status: "ACTIVE",
            role: "GATEWAY"
        },
        R2: {
            id: "R2",
            name: "Router R2 (Primary Core)",
            ip: "10.0.2.1",
            pos: { x: 340, y: 80 },
            status: "ACTIVE",
            role: "PRIMARY"
        },
        R3: {
            id: "R3",
            name: "Router R3 (Backup Core)",
            ip: "10.0.3.1",
            pos: { x: 340, y: 320 },
            status: "ACTIVE",
            role: "BACKUP"
        },
        R4: {
            id: "R4",
            name: "Router R4 (Aggregation)",
            ip: "10.0.4.1",
            pos: { x: 470, y: 200 },
            status: "ACTIVE",
            role: "AGGR"
        },
        Server: {
            id: "Server",
            name: "Server (Destination)",
            ip: "172.16.0.100",
            pos: { x: 580, y: 200 },
            status: "ACTIVE",
            role: "ACCEPT"
        }
    };

    const INITIAL_LINKS = [
        { id: "PC-R1", source: "PC", target: "R1", weight: 1, status: "ACTIVE", note: "Access Link" },
        { id: "R1-R2", source: "R1", target: "R2", weight: 2, status: "ACTIVE", note: "Primary Core Path" },
        { id: "R1-R3", source: "R1", target: "R3", weight: 3, status: "ACTIVE", note: "Backup Core Path" },
        { id: "R2-R4", source: "R2", target: "R4", weight: 2, status: "ACTIVE", note: "Primary Aggregation" },
        { id: "R3-R4", source: "R3", target: "R4", weight: 2, status: "ACTIVE", note: "Backup Aggregation" },
        { id: "R4-Server", source: "R4", target: "Server", weight: 1, status: "ACTIVE", note: "Datacenter Link" }
    ];

    let nodes = JSON.parse(JSON.stringify(INITIAL_NODES));
    let links = JSON.parse(JSON.stringify(INITIAL_LINKS));

    // Telemetry & Runtime State
    const stats = {
        packetsSent: 0,
        packetsDelivered: 0,
        packetsDropped: 0,
        currentStep: 0,
        activeRoute: null,
        activeCost: 6,
        isPartitioned: false
    };

    // Step-by-Step Simulation Controller State
    const simState = {
        isInitialized: false,
        isComplete: false,
        isAnimating: false,
        currentHopIndex: 0,      // 0 = at PC, 1 = at R1, 2 = at R2/R3, etc.
        activePath: ["PC", "R1", "R2", "R4", "Server"],
        accumulatedCost: 0,
        recordedLogsCount: 0
    };

    /* ========================================================================
       2. WEB AUDIO SYNTHESIZER (Crisp UI sounds matching reference)
       ======================================================================== */

    class AudioSynth {
        constructor() {
            this.ctx = null;
        }

        init() {
            if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioCtx();
            }
            if (this.ctx && this.ctx.state === "suspended") {
                this.ctx.resume();
            }
        }

        playChirp() {
            try {
                this.init();
                if (!this.ctx) return;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(800, this.ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(1300, this.ctx.currentTime + 0.07);

                gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.07);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.07);
            } catch (e) { }
        }

        playSuccess() {
            try {
                this.init();
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                [523.25, 659.25, 783.99].forEach((freq, i) => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = "triangle";
                    osc.frequency.setValueAtTime(freq, now + i * 0.08);

                    gain.gain.setValueAtTime(0.15, now + i * 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.24);

                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(now + i * 0.08);
                    osc.stop(now + i * 0.08 + 0.25);
                });
            } catch (e) { }
        }

        playAlert() {
            try {
                this.init();
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = "sawtooth";
                osc.frequency.setValueAtTime(280, now);
                osc.frequency.linearRampToValueAtTime(150, now + 0.2);

                gain.gain.setValueAtTime(0.16, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.21);
            } catch (e) { }
        }
    }

    const sound = new AudioSynth();

    /* ========================================================================
       3. DIJKSTRA'S SHORTEST PATH FIRST (SPF) IMPLEMENTATION
       Pure JavaScript algorithm ignoring failed components
       ======================================================================== */

    function dijkstra(start = "PC", target = "Server") {
        const adj = {};
        Object.keys(nodes).forEach(n => (adj[n] = []));

        links.forEach(l => {
            if (l.status !== "ACTIVE") return;
            if (nodes[l.source].status !== "ACTIVE" || nodes[l.target].status !== "ACTIVE") return;

            adj[l.source].push({ neighbor: l.target, weight: l.weight, linkId: l.id });
            adj[l.target].push({ neighbor: l.source, weight: l.weight, linkId: l.id });
        });

        const distances = {};
        const previous = {};
        const unvisited = new Set();

        Object.keys(nodes).forEach(n => {
            distances[n] = Infinity;
            previous[n] = null;
            if (nodes[n].status === "ACTIVE") unvisited.add(n);
        });

        if (nodes[start].status !== "ACTIVE" || nodes[target].status !== "ACTIVE") {
            return { path: null, cost: Infinity, unreachable: true };
        }

        distances[start] = 0;

        while (unvisited.size > 0) {
            let current = null;
            let minDist = Infinity;

            for (const node of unvisited) {
                if (distances[node] < minDist) {
                    minDist = distances[node];
                    current = node;
                }
            }

            if (current === null || minDist === Infinity) break;
            unvisited.delete(current);
            if (current === target) break;

            for (const edge of adj[current] || []) {
                if (!unvisited.has(edge.neighbor)) continue;
                const candidate = distances[current] + edge.weight;
                if (candidate < distances[edge.neighbor]) {
                    distances[edge.neighbor] = candidate;
                    previous[edge.neighbor] = current;
                }
            }
        }

        if (distances[target] === Infinity) {
            return { path: null, cost: Infinity, unreachable: true };
        }

        const path = [];
        let curr = target;
        while (curr !== null) {
            path.unshift(curr);
            curr = previous[curr];
        }

        return { path, cost: distances[target], unreachable: false };
    }

    /* ========================================================================
       4. TOPOLOGY RENDERER, DYNAMIC LINK PARSER & VISUAL CONTROLLER
       ======================================================================== */

    function computePathCost(nodeList) {
        let total = 0;
        for (let i = 0; i < nodeList.length - 1; i++) {
            const u = nodeList[i];
            const v = nodeList[i + 1];
            if (!nodes[u] || !nodes[v] || nodes[u].status !== "ACTIVE" || nodes[v].status !== "ACTIVE") return Infinity;
            const lk = links.find(l => ((l.source === u && l.target === v) || (l.source === v && l.target === u)) && l.status === "ACTIVE");
            if (!lk) return Infinity;
            total += lk.weight;
        }
        return total;
    }

    /**
     * Determines the secondary standby route by testing alternate paths
     */
    function findStandbyAlternatePath(primaryPath) {
        if (!primaryPath || primaryPath.length <= 3) return null;
        const candidateHop = primaryPath[2] || primaryPath[1];
        if (!nodes[candidateHop]) return null;
        const prevStatus = nodes[candidateHop].status;
        nodes[candidateHop].status = "FAILED";
        const alt = dijkstra("PC", "Server");
        nodes[candidateHop].status = prevStatus;
        if (alt && !alt.unreachable && alt.path) {
            return alt;
        }
        return null;
    }

    /**
     * Dynamically generates the SVG lines, glow overlays, weight badges, and broken indicators
     * for all current links in `links`. Whenever weights or routes change, this draws them to the diagram.
     */
    function renderLinksDiagram() {
        const linksGroup = document.getElementById("linksGroup");
        if (!linksGroup) return;

        let svgHtml = "";
        links.forEach(l => {
            const s = nodes[l.source];
            const t = nodes[l.target];
            if (!s || !t) return;

            const x1 = s.pos.x;
            const y1 = s.pos.y;
            const x2 = t.pos.x;
            const y2 = t.pos.y;
            const midX = Math.round((x1 + x2) / 2);
            const midY = Math.round((y1 + y2) / 2);

            const isDead = l.status === "FAILED" || s.status === "FAILED" || t.status === "FAILED";

            svgHtml += `
                <g class="link-item ${isDead ? 'failed' : ''}" id="linkItem-${l.id}" data-link="${l.id}">
                    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="hit-line" stroke="transparent" stroke-width="26" pointer-events="stroke" cursor="pointer"/>
                    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="base-line"/>
                    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="active-line" id="flow-${l.id}"/>
                    <g class="weight-tag" transform="translate(${midX}, ${midY})">
                        <rect x="-18" y="-11" width="36" height="22" rx="11" class="weight-rect"/>
                        <text x="0" y="4" text-anchor="middle" class="weight-text">${l.weight}</text>
                    </g>
                    <g class="broken-tag" id="broken-${l.id}" style="display: ${isDead ? 'block' : 'none'};">
                        <circle cx="${midX}" cy="${midY}" r="11" class="broken-circle"/>
                        <text x="${midX}" y="${midY + 4}" text-anchor="middle" class="broken-x">✕</text>
                    </g>
                </g>
            `;
        });

        linksGroup.innerHTML = svgHtml;
        setupLinkClickHandlers();
    }

    function toggleLinkState(linkId) {
        sound.init();
        const l = links.find(x => x.id === linkId);
        if (!l) return;
        if (l.status === "ACTIVE") {
            failLink(l.id);
        } else {
            l.status = "ACTIVE";
            sound.playSuccess();
            addLogStep(simState.currentHopIndex, "Topology", l.id, "REPAIR", `Link ${l.id} restored.`, "success");
            handleTopologyUpdate();
        }
        if (typeof syncZoomSvg === "function" && document.getElementById("zoomTopologyModal")?.style.display === "flex") {
            syncZoomSvg();
            if (typeof updateZoomTelemetry === "function") updateZoomTelemetry();
        }
    }

    function setupLinkClickHandlers() {
        links.forEach(l => {
            const g = document.getElementById(`linkItem-${l.id}`);
            if (g) {
                g.onclick = (e) => {
                    e.stopPropagation();
                    toggleLinkState(l.id);
                };
            }
        });
    }

    /**
     * Computes SVG coordinates for router nodes spanning between PC (70, 200) and Server (580, 200).
     */
    function computePositionsForRouters(routerIdList) {
        const sorted = [...routerIdList].sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, "")) || 0;
            const numB = parseInt(b.replace(/\D/g, "")) || 0;
            return numA - numB;
        });

        const count = sorted.length;
        const positions = {};

        if (count === 1) {
            positions[sorted[0]] = { x: 330, y: 200 };
        } else if (count === 2) {
            positions[sorted[0]] = { x: 230, y: 200 };
            positions[sorted[1]] = { x: 420, y: 200 };
        } else if (count === 3) {
            positions[sorted[0]] = { x: 190, y: 200 };
            positions[sorted[1]] = { x: 330, y: 130 };
            positions[sorted[2]] = { x: 470, y: 200 };
        } else if (count === 4) {
            positions[sorted[0]] = { x: 190, y: 200 };
            positions[sorted[1]] = { x: 340, y: 80 };
            positions[sorted[2]] = { x: 340, y: 320 };
            positions[sorted[3]] = { x: 470, y: 200 };
        } else if (count === 5) {
            positions[sorted[0]] = { x: 180, y: 200 };
            positions[sorted[1]] = { x: 325, y: 80 };
            positions[sorted[2]] = { x: 325, y: 200 };
            positions[sorted[3]] = { x: 325, y: 320 };
            positions[sorted[4]] = { x: 475, y: 200 };
        } else if (count === 6) {
            positions[sorted[0]] = { x: 175, y: 200 };
            positions[sorted[1]] = { x: 275, y: 95 };
            positions[sorted[2]] = { x: 275, y: 305 };
            positions[sorted[3]] = { x: 385, y: 95 };
            positions[sorted[4]] = { x: 385, y: 305 };
            positions[sorted[5]] = { x: 485, y: 200 };
        } else if (count === 7) {
            positions[sorted[0]] = { x: 175, y: 200 };
            positions[sorted[1]] = { x: 275, y: 80 };
            positions[sorted[2]] = { x: 275, y: 200 };
            positions[sorted[3]] = { x: 275, y: 320 };
            positions[sorted[4]] = { x: 385, y: 125 };
            positions[sorted[5]] = { x: 385, y: 275 };
            positions[sorted[6]] = { x: 485, y: 200 };
        } else if (count === 8) {
            positions[sorted[0]] = { x: 175, y: 200 };
            positions[sorted[1]] = { x: 275, y: 80 };
            positions[sorted[2]] = { x: 275, y: 200 };
            positions[sorted[3]] = { x: 275, y: 320 };
            positions[sorted[4]] = { x: 385, y: 80 };
            positions[sorted[5]] = { x: 385, y: 200 };
            positions[sorted[6]] = { x: 385, y: 320 };
            positions[sorted[7]] = { x: 485, y: 200 };
        } else {
            // General layout for count > 8
            positions[sorted[0]] = { x: 170, y: 200 };
            positions[sorted[count - 1]] = { x: 490, y: 200 };
            const middle = sorted.slice(1, count - 1);
            const cols = Math.min(3, Math.ceil(middle.length / 3));
            const colWidth = 260 / (cols + 1);
            const perCol = Math.ceil(middle.length / cols);
            middle.forEach((id, idx) => {
                const colIdx = Math.floor(idx / perCol);
                const rowIdx = idx % perCol;
                const totalInCol = Math.min(perCol, middle.length - colIdx * perCol);
                const x = Math.round(200 + (colIdx + 1) * colWidth);
                const ySpacing = totalInCol > 1 ? (240 / (totalInCol - 1)) : 0;
                const y = Math.round(totalInCol === 1 ? 200 : 80 + rowIdx * ySpacing);
                positions[id] = { x, y };
            });
        }

        return positions;
    }

    /**
     * Generates a clean mesh topology preset for a given router count (2..8).
     */
    function generateTopologyForRouterCount(count) {
        count = Math.max(2, Math.min(count, 8));
        const newNodes = {
            PC: {
                id: "PC",
                name: "PC (Client Host)",
                ip: "192.168.1.10",
                pos: { x: 70, y: 200 },
                status: "ACTIVE",
                role: "INIT"
            }
        };

        const routerConfigs = {
            2: [
                { id: "R1", name: "Router R1 (Gateway)", ip: "10.0.1.1", pos: { x: 230, y: 200 }, role: "GATEWAY" },
                { id: "R2", name: "Router R2 (Aggregation)", ip: "10.0.2.1", pos: { x: 420, y: 200 }, role: "AGGR" }
            ],
            3: [
                { id: "R1", name: "Router R1 (Gateway)", ip: "10.0.1.1", pos: { x: 190, y: 200 }, role: "GATEWAY" },
                { id: "R2", name: "Router R2 (Primary Core)", ip: "10.0.2.1", pos: { x: 330, y: 130 }, role: "PRIMARY" },
                { id: "R3", name: "Router R3 (Aggregation)", ip: "10.0.3.1", pos: { x: 470, y: 200 }, role: "AGGR" }
            ],
            4: [
                { id: "R1", name: "Router R1 (Gateway)", ip: "10.0.1.1", pos: { x: 190, y: 200 }, role: "GATEWAY" },
                { id: "R2", name: "Router R2 (Primary Core)", ip: "10.0.2.1", pos: { x: 340, y: 80 }, role: "PRIMARY" },
                { id: "R3", name: "Router R3 (Backup Core)", ip: "10.0.3.1", pos: { x: 340, y: 320 }, role: "BACKUP" },
                { id: "R4", name: "Router R4 (Aggregation)", ip: "10.0.4.1", pos: { x: 470, y: 200 }, role: "AGGR" }
            ],
            5: [
                { id: "R1", name: "Router R1 (Gateway)", ip: "10.0.1.1", pos: { x: 180, y: 200 }, role: "GATEWAY" },
                { id: "R2", name: "Router R2 (Primary Core)", ip: "10.0.2.1", pos: { x: 325, y: 80 }, role: "PRIMARY" },
                { id: "R3", name: "Router R3 (Mid Core)", ip: "10.0.3.1", pos: { x: 325, y: 200 }, role: "DIRECT" },
                { id: "R4", name: "Router R4 (Backup Core)", ip: "10.0.4.1", pos: { x: 325, y: 320 }, role: "BACKUP" },
                { id: "R5", name: "Router R5 (Aggregation)", ip: "10.0.5.1", pos: { x: 475, y: 200 }, role: "AGGR" }
            ],
            6: [
                { id: "R1", name: "Router R1 (Gateway)", ip: "10.0.1.1", pos: { x: 175, y: 200 }, role: "GATEWAY" },
                { id: "R2", name: "Router R2 (Primary Core)", ip: "10.0.2.1", pos: { x: 275, y: 95 }, role: "PRIMARY" },
                { id: "R3", name: "Router R3 (Backup Core)", ip: "10.0.3.1", pos: { x: 275, y: 305 }, role: "BACKUP" },
                { id: "R4", name: "Router R4 (Primary Egress)", ip: "10.0.4.1", pos: { x: 385, y: 95 }, role: "CORE" },
                { id: "R5", name: "Router R5 (Backup Egress)", ip: "10.0.5.1", pos: { x: 385, y: 305 }, role: "CORE" },
                { id: "R6", name: "Router R6 (Aggregation)", ip: "10.0.6.1", pos: { x: 485, y: 200 }, role: "AGGR" }
            ],
            7: [
                { id: "R1", name: "Router R1 (Gateway)", ip: "10.0.1.1", pos: { x: 175, y: 200 }, role: "GATEWAY" },
                { id: "R2", name: "Router R2 (Core Upper)", ip: "10.0.2.1", pos: { x: 275, y: 80 }, role: "PRIMARY" },
                { id: "R3", name: "Router R3 (Core Center)", ip: "10.0.3.1", pos: { x: 275, y: 200 }, role: "CORE" },
                { id: "R4", name: "Router R4 (Core Lower)", ip: "10.0.4.1", pos: { x: 275, y: 320 }, role: "BACKUP" },
                { id: "R5", name: "Router R5 (Dist Upper)", ip: "10.0.5.1", pos: { x: 385, y: 125 }, role: "CORE" },
                { id: "R6", name: "Router R6 (Dist Lower)", ip: "10.0.6.1", pos: { x: 385, y: 275 }, role: "CORE" },
                { id: "R7", name: "Router R7 (Aggregation)", ip: "10.0.7.1", pos: { x: 485, y: 200 }, role: "AGGR" }
            ],
            8: [
                { id: "R1", name: "Router R1 (Gateway)", ip: "10.0.1.1", pos: { x: 175, y: 200 }, role: "GATEWAY" },
                { id: "R2", name: "Router R2 (Core 1)", ip: "10.0.2.1", pos: { x: 275, y: 80 }, role: "PRIMARY" },
                { id: "R3", name: "Router R3 (Core 2)", ip: "10.0.3.1", pos: { x: 275, y: 200 }, role: "CORE" },
                { id: "R4", name: "Router R4 (Core 3)", ip: "10.0.4.1", pos: { x: 275, y: 320 }, role: "BACKUP" },
                { id: "R5", name: "Router R5 (Dist 1)", ip: "10.0.5.1", pos: { x: 385, y: 80 }, role: "CORE" },
                { id: "R6", name: "Router R6 (Dist 2)", ip: "10.0.6.1", pos: { x: 385, y: 200 }, role: "CORE" },
                { id: "R7", name: "Router R7 (Dist 3)", ip: "10.0.7.1", pos: { x: 385, y: 320 }, role: "CORE" },
                { id: "R8", name: "Router R8 (Aggregation)", ip: "10.0.8.1", pos: { x: 485, y: 200 }, role: "AGGR" }
            ]
        };

        const rList = routerConfigs[count] || routerConfigs[4];
        rList.forEach(r => {
            newNodes[r.id] = {
                id: r.id,
                name: r.name,
                ip: r.ip,
                pos: r.pos,
                status: "ACTIVE",
                role: r.role
            };
        });

        newNodes.Server = {
            id: "Server",
            name: "Server (Destination)",
            ip: "172.16.0.100",
            pos: { x: 580, y: 200 },
            status: "ACTIVE",
            role: "ACCEPT"
        };

        const linkConfigs = {
            2: [
                { id: "PC-R1", source: "PC", target: "R1", weight: 1, status: "ACTIVE", note: "Access Link" },
                { id: "R1-R2", source: "R1", target: "R2", weight: 2, status: "ACTIVE", note: "Backbone Link" },
                { id: "R2-Server", source: "R2", target: "Server", weight: 1, status: "ACTIVE", note: "Datacenter Link" }
            ],
            3: [
                { id: "PC-R1", source: "PC", target: "R1", weight: 1, status: "ACTIVE", note: "Access Link" },
                { id: "R1-R2", source: "R1", target: "R2", weight: 2, status: "ACTIVE", note: "Primary Core" },
                { id: "R2-R3", source: "R2", target: "R3", weight: 2, status: "ACTIVE", note: "Aggregation Path" },
                { id: "R1-R3", source: "R1", target: "R3", weight: 5, status: "ACTIVE", note: "Direct Backup" },
                { id: "R3-Server", source: "R3", target: "Server", weight: 1, status: "ACTIVE", note: "Datacenter Link" }
            ],
            4: [
                { id: "PC-R1", source: "PC", target: "R1", weight: 1, status: "ACTIVE", note: "Access Link" },
                { id: "R1-R2", source: "R1", target: "R2", weight: 2, status: "ACTIVE", note: "Primary Core Path" },
                { id: "R1-R3", source: "R1", target: "R3", weight: 3, status: "ACTIVE", note: "Backup Core Path" },
                { id: "R2-R4", source: "R2", target: "R4", weight: 2, status: "ACTIVE", note: "Primary Aggregation" },
                { id: "R3-R4", source: "R3", target: "R4", weight: 2, status: "ACTIVE", note: "Backup Aggregation" },
                { id: "R4-Server", source: "R4", target: "Server", weight: 1, status: "ACTIVE", note: "Datacenter Link" }
            ],
            5: [
                { id: "PC-R1", source: "PC", target: "R1", weight: 1, status: "ACTIVE", note: "Access Link" },
                { id: "R1-R2", source: "R1", target: "R2", weight: 2, status: "ACTIVE", note: "Primary Core Path" },
                { id: "R1-R3", source: "R1", target: "R3", weight: 4, status: "ACTIVE", note: "Mid Core Path" },
                { id: "R1-R4", source: "R1", target: "R4", weight: 3, status: "ACTIVE", note: "Backup Core Path" },
                { id: "R2-R5", source: "R2", target: "R5", weight: 2, status: "ACTIVE", note: "Primary Aggregation" },
                { id: "R3-R5", source: "R3", target: "R5", weight: 3, status: "ACTIVE", note: "Mid Aggregation" },
                { id: "R4-R5", source: "R4", target: "R5", weight: 2, status: "ACTIVE", note: "Backup Aggregation" },
                { id: "R5-Server", source: "R5", target: "Server", weight: 1, status: "ACTIVE", note: "Datacenter Link" }
            ],
            6: [
                { id: "PC-R1", source: "PC", target: "R1", weight: 1, status: "ACTIVE", note: "Access Link" },
                { id: "R1-R2", source: "R1", target: "R2", weight: 2, status: "ACTIVE", note: "Core Ingress Upper" },
                { id: "R1-R3", source: "R1", target: "R3", weight: 3, status: "ACTIVE", note: "Core Ingress Lower" },
                { id: "R2-R4", source: "R2", target: "R4", weight: 2, status: "ACTIVE", note: "Inter-Core Primary" },
                { id: "R3-R5", source: "R3", target: "R5", weight: 2, status: "ACTIVE", note: "Inter-Core Backup" },
                { id: "R2-R5", source: "R2", target: "R5", weight: 4, status: "ACTIVE", note: "Cross-Mesh Upper" },
                { id: "R3-R4", source: "R3", target: "R4", weight: 4, status: "ACTIVE", note: "Cross-Mesh Lower" },
                { id: "R4-R6", source: "R4", target: "R6", weight: 2, status: "ACTIVE", note: "Aggregation Upper" },
                { id: "R5-R6", source: "R5", target: "R6", weight: 2, status: "ACTIVE", note: "Aggregation Lower" },
                { id: "R6-Server", source: "R6", target: "Server", weight: 1, status: "ACTIVE", note: "Datacenter Link" }
            ],
            7: [
                { id: "PC-R1", source: "PC", target: "R1", weight: 1, status: "ACTIVE", note: "Access Link" },
                { id: "R1-R2", source: "R1", target: "R2", weight: 2, status: "ACTIVE", note: "Ingress Upper" },
                { id: "R1-R3", source: "R1", target: "R3", weight: 3, status: "ACTIVE", note: "Ingress Center" },
                { id: "R1-R4", source: "R1", target: "R4", weight: 4, status: "ACTIVE", note: "Ingress Lower" },
                { id: "R2-R5", source: "R2", target: "R5", weight: 2, status: "ACTIVE", note: "Mesh Upper" },
                { id: "R3-R5", source: "R3", target: "R5", weight: 3, status: "ACTIVE", note: "Mesh Center-Up" },
                { id: "R3-R6", source: "R3", target: "R6", weight: 2, status: "ACTIVE", note: "Mesh Center-Down" },
                { id: "R4-R6", source: "R4", target: "R6", weight: 3, status: "ACTIVE", note: "Mesh Lower" },
                { id: "R5-R7", source: "R5", target: "R7", weight: 2, status: "ACTIVE", note: "Egress Upper" },
                { id: "R6-R7", source: "R6", target: "R7", weight: 2, status: "ACTIVE", note: "Egress Lower" },
                { id: "R7-Server", source: "R7", target: "Server", weight: 1, status: "ACTIVE", note: "Datacenter Link" }
            ],
            8: [
                { id: "PC-R1", source: "PC", target: "R1", weight: 1, status: "ACTIVE", note: "Access Link" },
                { id: "R1-R2", source: "R1", target: "R2", weight: 2, status: "ACTIVE", note: "Ingress Upper" },
                { id: "R1-R3", source: "R1", target: "R3", weight: 3, status: "ACTIVE", note: "Ingress Center" },
                { id: "R1-R4", source: "R1", target: "R4", weight: 4, status: "ACTIVE", note: "Ingress Lower" },
                { id: "R2-R5", source: "R2", target: "R5", weight: 2, status: "ACTIVE", note: "Inter-Core Upper" },
                { id: "R3-R6", source: "R3", target: "R6", weight: 2, status: "ACTIVE", note: "Inter-Core Center" },
                { id: "R4-R7", source: "R4", target: "R7", weight: 2, status: "ACTIVE", note: "Inter-Core Lower" },
                { id: "R2-R6", source: "R2", target: "R6", weight: 4, status: "ACTIVE", note: "Cross Mesh 1" },
                { id: "R4-R6", source: "R4", target: "R6", weight: 4, status: "ACTIVE", note: "Cross Mesh 2" },
                { id: "R5-R8", source: "R5", target: "R8", weight: 2, status: "ACTIVE", note: "Egress Upper" },
                { id: "R6-R8", source: "R6", target: "R8", weight: 2, status: "ACTIVE", note: "Egress Center" },
                { id: "R7-R8", source: "R7", target: "R8", weight: 3, status: "ACTIVE", note: "Egress Lower" },
                { id: "R8-Server", source: "R8", target: "Server", weight: 1, status: "ACTIVE", note: "Datacenter Link" }
            ]
        };

        const newLinks = linkConfigs[count] || linkConfigs[4];
        return { nodes: newNodes, links: newLinks };
    }

    /**
     * Dynamically renders all network nodes into the SVG `<g id="nodesGroup">`.
     */
    function renderNodesDiagram() {
        const nodesGroup = document.getElementById("nodesGroup");
        if (!nodesGroup) return;

        let html = `
            <!-- START ARROW TO PC -->
            <text x="24" y="204" class="start-text">START</text>
            <path d="M42 200 L56 200 M50 196 L56 200 L50 204" class="start-arrow"/>
        `;

        // Render PC Host
        const pc = nodes.PC || { pos: { x: 70, y: 200 }, status: "ACTIVE" };
        html += `
            <g class="node-state-group node-cyan ${pc.status === 'FAILED' ? 'failed' : ''}" id="nodeGroup-PC" data-node="PC" transform="translate(${pc.pos.x}, ${pc.pos.y})">
                <circle cx="0" cy="0" r="32" class="state-outer-ring ring-cyan"/>
                <circle cx="0" cy="0" r="26" class="state-inner-circle"/>
                <text x="0" y="3" text-anchor="middle" class="state-name">PC</text>
                <text x="0" y="15" text-anchor="middle" class="state-sub">INIT</text>
            </g>
        `;

        // Render all router nodes (R1..Rn)
        const routerKeys = Object.keys(nodes).filter(k => k !== "PC" && k !== "Server");
        routerKeys.sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, "")) || 0;
            const numB = parseInt(b.replace(/\D/g, "")) || 0;
            return numA - numB;
        });

        routerKeys.forEach((k, idx) => {
            const n = nodes[k];
            let colorClass = "node-blue";
            let ringClass = "ring-blue";
            let role = n.role || (idx === 0 ? "GATEWAY" : (idx === routerKeys.length - 1 ? "AGGR" : "CORE"));

            if (role === "PRIMARY") {
                colorClass = "node-green";
                ringClass = "ring-green";
            } else if (role === "INIT") {
                colorClass = "node-cyan";
                ringClass = "ring-cyan";
            }

            const isFailed = n.status === "FAILED";
            html += `
                <g class="node-state-group ${colorClass} ${isFailed ? 'failed' : ''}" id="nodeGroup-${k}" data-node="${k}" transform="translate(${n.pos.x}, ${n.pos.y})">
                    <circle cx="0" cy="0" r="32" class="state-outer-ring ${ringClass}"/>
                    <circle cx="0" cy="0" r="26" class="state-inner-circle"/>
                    <text x="0" y="3" text-anchor="middle" class="state-name">${k}</text>
                    <text x="0" y="15" text-anchor="middle" class="state-sub">${role}</text>
                </g>
            `;
        });

        // Render Server Destination
        const srv = nodes.Server || { pos: { x: 580, y: 200 }, status: "ACTIVE" };
        html += `
            <g class="node-state-group node-purple ${srv.status === 'FAILED' ? 'failed' : ''}" id="nodeGroup-Server" data-node="Server" transform="translate(${srv.pos.x}, ${srv.pos.y})">
                <circle cx="0" cy="0" r="32" class="state-outer-ring ring-purple"/>
                <circle cx="0" cy="0" r="29" class="state-double-ring"/>
                <circle cx="0" cy="0" r="24" class="state-inner-circle"/>
                <text x="0" y="3" text-anchor="middle" class="state-name">Server</text>
                <text x="0" y="14" text-anchor="middle" class="state-sub">ACCEPT</text>
            </g>
        `;

        nodesGroup.innerHTML = html;
        setupNodeInteractions();
    }

    /**
     * Binds click toggles and hover tooltips for all active SVG nodes.
     */
    function setupNodeInteractions() {
        Object.keys(nodes).forEach(nodeId => {
            const g = document.getElementById(`nodeGroup-${nodeId}`);
            if (!g) return;

            g.onclick = (e) => {
                e.stopPropagation();
                sound.init();
                if (nodes[nodeId].status === "ACTIVE") {
                    failRouter(nodeId);
                } else {
                    nodes[nodeId].status = "ACTIVE";
                    sound.playSuccess();
                    addLogStep(simState.currentHopIndex, nodeId, "REPAIR", "ACTIVE", `Node ${nodeId} hardware repaired.`, "success");
                    handleTopologyUpdate();
                }
            };

            const tooltip = document.getElementById("svgHoverTooltip");
            if (tooltip) {
                g.onmouseenter = () => {
                    const n = nodes[nodeId];
                    if (!n) return;
                    tooltip.innerHTML = `
                        <strong>${n.name || nodeId}</strong><br>
                        <span>IP: ${n.ip || 'DHCP'}</span><br>
                        <span>Role: ${n.role || 'Router'}</span><br>
                        <span style="color: ${n.status === 'ACTIVE' ? 'var(--accent-green)' : 'var(--accent-red)'}">Status: ${n.status}</span>
                    `;
                    tooltip.style.display = "block";
                };
                g.onmousemove = (e) => {
                    const vp = document.getElementById("canvasViewport");
                    if (!vp) return;
                    const rect = vp.getBoundingClientRect();
                    tooltip.style.left = `${e.clientX - rect.left + 12}px`;
                    tooltip.style.top = `${e.clientY - rect.top + 12}px`;
                };
                g.onmouseleave = () => {
                    tooltip.style.display = "none";
                };
            }
        });
    }

    /**
     * Updates the Fault Injection router selection dropdown
     */
    function updateRouterSelectOptions() {
        const sel = document.getElementById("routerFailSelect");
        if (!sel) return;
        const currentVal = sel.value;
        const routerKeys = Object.keys(nodes).filter(k => k !== "PC" && k !== "Server");
        routerKeys.sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, "")) || 0;
            const numB = parseInt(b.replace(/\D/g, "")) || 0;
            return numA - numB;
        });

        sel.innerHTML = routerKeys.map(k => {
            const n = nodes[k];
            return `<option value="${k}" ${k === currentVal ? 'selected' : ''}>${n.name || ('Router ' + k)}</option>`;
        }).join("");
    }

    /**
     * Sets the router count R (2..8) and regenerates the diagram
     */
    function setRouterCount(newCount) {
        newCount = Math.max(2, Math.min(newCount, 8));
        const input = document.getElementById("routerCountInput");
        if (input) input.value = newCount;

        // Reset any active packet simulation
        resetSimulation();

        // Generate topology for new count
        const topo = generateTopologyForRouterCount(newCount);
        nodes = topo.nodes;
        links = topo.links;

        // Synchronize textarea & select boxes
        syncTextareaFromLinks();
        renderNodesDiagram();
        renderLinksDiagram();
        updateRouterSelectOptions();
        updateLinkSelectOptions();

        sound.playChirp();
        const res = dijkstra("PC", "Server");
        updateTopologyVisuals(res);

        addLogStep(
            0,
            "Topology",
            `${newCount} Routers`,
            res.cost === Infinity ? "∞" : `${res.cost}`,
            `Router count set to ${newCount}. Diagram redrawn with ${newCount} routers (R1..R${newCount}) and ${links.length} links.`,
            "reroute"
        );

        const guideText = document.getElementById("simGuideText");
        if (guideText) {
            if (!res.unreachable && res.path) {
                guideText.innerHTML = `👉 <strong>Routers set to ${newCount}:</strong> Optimal path is <strong>${res.path.join(" → ")}</strong> (Total Metric: ${res.cost}). Click <strong>Start Simulation</strong> to run!`;
            } else {
                guideText.innerHTML = `❌ <strong>Routers set to ${newCount}:</strong> Network is partitioned.`;
            }
        }
    }

    /**
     * Updates the Fault Injection link selection dropdown to reflect current links and weights
     */
    function updateLinkSelectOptions() {
        const sel = document.getElementById("linkFailSelect");
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = links.map(l => {
            return `<option value="${l.id}" ${l.id === currentVal ? 'selected' : ''}>${l.source} - ${l.target} (Cost ${l.weight})</option>`;
        }).join("");
    }

    /**
     * Parses the Link Adjacency & Edge Weights textarea text into structured link definitions.
     */
    function parseEdgeWeightsText(text) {
        if (!text) return [];
        const lines = text.split("\n");
        const parsed = [];

        lines.forEach(line => {
            line = line.trim();
            if (!line || line.startsWith("#") || line.startsWith("//")) return;

            // Regex matches: Node1 [-/->/to/,] Node2 [:=,\s] Weight [(Optional note)]
            const regex = /^([A-Za-z0-9_]+)\s*(?:-|–|—|->|to|,|\s)\s*([A-Za-z0-9_]+)\s*[:=,\s]\s*(\d+(?:\.\d+)?)(?:\s*(?:\((.*?)\)|.*))?$/i;
            const match = line.match(regex);
            if (match) {
                let src = match[1].trim();
                let dst = match[2].trim();
                const weightVal = parseFloat(match[3]);
                const note = match[4] ? match[4].trim() : "";

                // Normalize casing
                if (src.toUpperCase() === "PC") src = "PC";
                else if (src.toUpperCase() === "SERVER") src = "Server";
                else if (/^r\d+$/i.test(src)) src = src.toUpperCase();

                if (dst.toUpperCase() === "PC") dst = "PC";
                else if (dst.toUpperCase() === "SERVER") dst = "Server";
                else if (/^r\d+$/i.test(dst)) dst = dst.toUpperCase();

                if (src && dst && !isNaN(weightVal) && weightVal >= 0 && src !== dst) {
                    parsed.push({
                        id: `${src}-${dst}`,
                        source: src,
                        target: dst,
                        weight: weightVal,
                        note: note
                    });
                }
            }
        });

        return parsed;
    }

    /**
     * Synchronizes textarea contents from current links array
     */
    function syncTextareaFromLinks() {
        const textarea = document.getElementById("edgeWeightsTextarea");
        if (!textarea) return;
        textarea.value = links.map(l => {
            const notePart = l.note ? ` (${l.note})` : "";
            return `${l.source} - ${l.target}: ${l.weight}${notePart}`;
        }).join("\n");
    }

    /**
     * Reads the textarea and redraws the SVG diagram with the exact entered links.
     * Also detects any newly added routers, places them dynamically on canvas,
     * and updates the router counter and dropdowns.
     */
    function applyDiagramFromTextarea(showFeedback = true) {
        const textarea = document.getElementById("edgeWeightsTextarea");
        if (!textarea) return;

        let val = textarea.value.trim();
        if (!val) {
            const countInput = document.getElementById("routerCountInput");
            const curCount = countInput ? parseInt(countInput.value) || 4 : 4;
            const topo = generateTopologyForRouterCount(curCount);
            links = topo.links;
            syncTextareaFromLinks();
            val = textarea.value.trim();
        }

        const parsed = parseEdgeWeightsText(val);
        if (parsed.length === 0) {
            sound.playAlert();
            const btn = document.getElementById("updateDiagramBtn");
            if (btn && showFeedback) {
                btn.innerHTML = `<span>⚠ Check Syntax</span>`;
                setTimeout(() => {
                    btn.innerHTML = `<span>🔄 Update Diagram</span>`;
                }, 1800);
            }
            return;
        }

        // 1. Detect all unique router names in the parsed links
        const detectedNodes = new Set();
        parsed.forEach(p => {
            detectedNodes.add(p.source);
            detectedNodes.add(p.target);
        });

        const detectedRouters = Array.from(detectedNodes).filter(n => n !== "PC" && n !== "Server");
        detectedRouters.sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, "")) || 0;
            const numB = parseInt(b.replace(/\D/g, "")) || 0;
            return numA - numB;
        });

        // Check if router list changed
        const currentRouters = Object.keys(nodes).filter(k => k !== "PC" && k !== "Server");
        const routerListChanged = detectedRouters.length !== currentRouters.length ||
            detectedRouters.some(r => !currentRouters.includes(r));

        if (routerListChanged && detectedRouters.length > 0) {
            // Recompute positions for all detected routers
            const positions = computePositionsForRouters(detectedRouters);
            const updatedNodes = {
                PC: nodes.PC || { id: "PC", name: "PC (Client Host)", ip: "192.168.1.10", pos: { x: 70, y: 200 }, status: "ACTIVE", role: "INIT" }
            };

            detectedRouters.forEach((rId, idx) => {
                const existing = nodes[rId];
                const role = idx === 0 ? "GATEWAY" : (idx === detectedRouters.length - 1 ? "AGGR" : (idx === 1 ? "PRIMARY" : "CORE"));
                updatedNodes[rId] = {
                    id: rId,
                    name: existing ? existing.name : `Router ${rId}`,
                    ip: existing ? existing.ip : `10.0.${idx + 1}.1`,
                    pos: positions[rId] || { x: 300, y: 200 },
                    status: existing ? existing.status : "ACTIVE",
                    role: existing ? existing.role : role
                };
            });

            updatedNodes.Server = nodes.Server || { id: "Server", name: "Server (Destination)", ip: "172.16.0.100", pos: { x: 580, y: 200 }, status: "ACTIVE", role: "ACCEPT" };
            nodes = updatedNodes;

            const routerCountInput = document.getElementById("routerCountInput");
            if (routerCountInput) {
                routerCountInput.value = detectedRouters.length;
            }

            renderNodesDiagram();
            updateRouterSelectOptions();
        }

        // 2. Replace active links with the exact parsed links
        links = parsed.map(p => {
            const existing = links.find(l => (l.source === p.source && l.target === p.target) || (l.source === p.target && l.target === p.source));
            return {
                id: p.id,
                source: p.source,
                target: p.target,
                weight: p.weight,
                status: existing ? existing.status : "ACTIVE",
                note: p.note || ""
            };
        });

        // 3. Redraw SVG diagram links with entered weights
        renderLinksDiagram();

        // 4. Update the Fault Injection select box
        updateLinkSelectOptions();

        // 5. Re-run SPF and update visuals and FIB details
        const spf = dijkstra("PC", "Server");
        updateTopologyVisuals(spf);

        // 6. Feedback
        if (showFeedback) {
            sound.playSuccess();
            const btn = document.getElementById("updateDiagramBtn");
            if (btn) {
                btn.classList.add("btn-success-flash");
                btn.innerHTML = `<span>✓ Diagram Updated!</span>`;
                setTimeout(() => {
                    btn.classList.remove("btn-success-flash");
                    btn.innerHTML = `<span>🔄 Update Diagram</span>`;
                }, 1500);
            }

            const guideText = document.getElementById("simGuideText");
            if (guideText) {
                if (!spf.unreachable && spf.path) {
                    guideText.innerHTML = `👉 <strong>Diagram Updated:</strong> Optimal path is <strong>${spf.path.join(" → ")}</strong> (Total Metric: ${spf.cost}). Click <strong>Start Simulation</strong> to run!`;
                } else {
                    guideText.innerHTML = `❌ <strong>Diagram Updated:</strong> Network is <strong>Unreachable</strong> from PC to Server.`;
                }
            }

            addLogStep(
                simState.currentHopIndex,
                "Diagram",
                `${parsed.length} Links`,
                spf.cost === Infinity ? "∞" : `${spf.cost}`,
                `Custom network topology applied: ${detectedRouters.length} routers, ${parsed.length} link(s) drawn. Optimal path: ${spf.path ? spf.path.join(" → ") : "Unreachable"}.`,
                "normal"
            );
        }
    }

    /**
     * Real-time input handler when user types in textarea
     */
    function onEdgeWeightsInput() {
        applyDiagramFromTextarea(false);
    }

    function updateTopologyVisuals(spfResult) {
        // 1. Update Links and Broken Tags
        links.forEach(l => {
            const flowLine = document.getElementById(`flow-${l.id}`);
            const brokenTag = document.getElementById(`broken-${l.id}`);
            const linkItem = document.getElementById(`linkItem-${l.id}`);

            const isConnectedToDeadNode =
                nodes[l.source].status === "FAILED" || nodes[l.target].status === "FAILED";

            if (l.status === "FAILED" || isConnectedToDeadNode) {
                if (linkItem) linkItem.classList.add("failed");
                if (brokenTag) brokenTag.style.display = "block";
                if (flowLine) flowLine.classList.remove("active");
            } else {
                if (linkItem) linkItem.classList.remove("failed");
                if (brokenTag) brokenTag.style.display = "none";
                if (flowLine) flowLine.classList.remove("active");
            }
        });

        // 2. Highlight Active Shortest Path
        if (spfResult && spfResult.path) {
            simState.activePath = spfResult.path;
            for (let i = 0; i < spfResult.path.length - 1; i++) {
                const u = spfResult.path[i];
                const v = spfResult.path[i + 1];
                const linkObj = links.find(
                    l => (l.source === u && l.target === v) || (l.source === v && l.target === u)
                );
                if (linkObj) {
                    const flow = document.getElementById(`flow-${linkObj.id}`);
                    if (flow) flow.classList.add("active");
                }
            }
        }

        // 3. Update Node Rings (Failed vs Active)
        Object.keys(nodes).forEach(nodeId => {
            const group = document.getElementById(`nodeGroup-${nodeId}`);
            if (!group) return;

            if (nodes[nodeId].status === "FAILED") {
                group.classList.add("failed");
            } else {
                group.classList.remove("failed");
            }
        });

        // 4. Update Hop Breadcrumb Structure
        updateBreadcrumbChain(spfResult);

        // 5. Update Machine Dashboard & Canvas Bottom Bar
        updateDashboard(spfResult);

        // 6. Synchronize Zoom Modal if open
        if (typeof updateZoomTelemetry === "function") updateZoomTelemetry();
        if (typeof syncZoomSvg === "function" && document.getElementById("zoomTopologyModal")?.style.display === "flex") {
            syncZoomSvg();
        }
    }

    function updateBreadcrumbChain(spfResult) {
        const container = document.getElementById("hopBreadcrumb");
        if (!container) return;

        if (!spfResult || spfResult.unreachable || !spfResult.path) {
            container.innerHTML = `
                <span class="breadcrumb-pill active" style="color: var(--accent-red); border-color: var(--accent-red);">PARTITIONED (NO ROUTE)</span>
            `;
            return;
        }

        const path = spfResult.path;
        container.innerHTML = path.map((node, i) => {
            let cls = "breadcrumb-pill";
            if (simState.isInitialized) {
                if (i < simState.currentHopIndex) cls += " completed";
                else if (i === simState.currentHopIndex) cls += " active";
            } else if (i === 0) {
                cls += " active";
            }
            return `<span class="${cls}" id="crumb-${node}">${i < simState.currentHopIndex ? "✓ " : ""}${node}</span>${i < path.length - 1 ? '<span class="breadcrumb-arrow">→</span>' : ''}`;
        }).join("");
    }

    function updateDashboard(spfResult) {
        const dashStepVal = document.getElementById("dashStepVal");
        const dashActiveState = document.getElementById("dashActiveState");
        const dashCostVal = document.getElementById("dashCostVal");
        const dashRouteText = document.getElementById("dashRouteText");
        const dashHealthChip = document.getElementById("dashHealthChip");
        const dashTelemetryInfo = document.getElementById("dashTelemetryInfo");

        const canvasStatusBadge = document.getElementById("canvasStatusBadge");
        const canvasStatusText = document.getElementById("canvasStatusText");

        const engineStatusDot = document.getElementById("engineStatusDot");
        const engineStatusText = document.getElementById("engineStatusText");

        const parsedPrimaryPath = document.getElementById("parsedPrimaryPath");
        const parsedAlternatePath = document.getElementById("parsedAlternatePath");
        const parsedGatewayDecision = document.getElementById("parsedGatewayDecision");
        const parsedSPFState = document.getElementById("parsedSPFState");

        const failedCount =
            Object.values(nodes).filter(n => n.status === "FAILED").length +
            links.filter(l => l.status === "FAILED").length;

        if (spfResult && !spfResult.unreachable && spfResult.path) {
            stats.isPartitioned = false;
            stats.activeRoute = spfResult.path;
            stats.activeCost = spfResult.cost;

            dashCostVal.textContent = spfResult.cost;
            dashRouteText.textContent = spfResult.path.join(" → ");

            const r2Cost = computePathCost(["PC", "R1", "R2", "R4", "Server"]);
            const r3Cost = computePathCost(["PC", "R1", "R3", "R4", "Server"]);

            const isUsingR2 = spfResult.path.includes("R2");
            const isUsingR3 = spfResult.path.includes("R3");

            const nextHop = spfResult.path[1];
            const nextHopNode = nodes[nextHop];
            const nextHopIp = nextHopNode ? nextHopNode.ip : "10.0.1.1";

            if (failedCount === 0) {
                dashHealthChip.textContent = "HEALTHY";
                dashHealthChip.className = "telemetry-chip healthy";

                engineStatusDot.className = "status-dot healthy";
                engineStatusText.textContent = "Network Healthy";

                parsedGatewayDecision.textContent = `Next Hop → ${nextHopIp} (${nextHop || 'Direct'})`;
                parsedSPFState.textContent = "Optimal (Dijkstra Shortest Path First)";
                parsedSPFState.className = "detail-val text-green";
            } else {
                dashHealthChip.textContent = "FAILOVER ACTIVE";
                dashHealthChip.className = "telemetry-chip degraded";

                engineStatusDot.className = "status-dot degraded";
                engineStatusText.textContent = "Alternate Route Active";

                parsedGatewayDecision.textContent = `Next Hop → ${nextHopIp} (${nextHop || 'Direct'})`;
                parsedSPFState.textContent = "Alternate Route Converged (Dijkstra SPF)";
                parsedSPFState.className = "detail-val text-yellow";
            }

            const primaryPathStr = spfResult.path.join(" → ");
            parsedPrimaryPath.textContent = `${primaryPathStr} (Cost: ${spfResult.cost}) [ACTIVE]`;

            const altRoute = findStandbyAlternatePath(spfResult.path);
            if (altRoute && altRoute.path) {
                parsedAlternatePath.textContent = `${altRoute.path.join(" → ")} (Cost: ${altRoute.cost}) [STANDBY]`;
            } else {
                parsedAlternatePath.textContent = "No Secondary Route Available [STANDBY]";
            }

            // Update step indicator
            if (!simState.isInitialized) {
                dashStepVal.textContent = "0";
                const routeLabel = isUsingR2 ? "R2 (Optimal)" : (isUsingR3 ? "R3 (Failover)" : spfResult.path[1] || "Direct");
                dashActiveState.textContent = routeLabel;
                dashActiveState.className = isUsingR2 ? "triplet-val text-green" : "triplet-val text-yellow";

                canvasStatusBadge.textContent = "IDLE";
                canvasStatusBadge.className = "idle-badge";
                canvasStatusText.textContent = `Click "Start Simulation" to initialize, then click "Next Step" to advance hop-by-hop (Cost: ${spfResult.cost})`;
            }

        } else {
            // UNREACHABLE STATE
            stats.isPartitioned = true;
            stats.activeRoute = null;
            stats.activeCost = Infinity;

            dashCostVal.textContent = "∞";
            dashRouteText.textContent = "NO ROUTE AVAILABLE (PARTITIONED)";

            dashActiveState.textContent = "NONE (Down)";
            dashActiveState.className = "triplet-val text-red";

            dashHealthChip.textContent = "UNREACHABLE";
            dashHealthChip.className = "telemetry-chip failed";

            engineStatusDot.className = "status-dot failed";
            engineStatusText.textContent = "Destination Unreachable";

            canvasStatusBadge.textContent = "UNREACHABLE";
            canvasStatusBadge.className = "idle-badge unreachable-mode";
            canvasStatusText.textContent = "Network partitioned! No valid path exists from PC to Server. Packets will be dropped.";

            parsedPrimaryPath.textContent = "PC → R1 → R2 → R4 → Server (Cost: ∞) [DOWN]";
            parsedAlternatePath.textContent = "PC → R1 → R3 → R4 → Server (Cost: ∞) [DOWN]";
            parsedGatewayDecision.textContent = "Next Hop → NULL0 (Discard / Drop)";
            parsedSPFState.textContent = "Unreachable (No Route in FIB)";
            parsedSPFState.className = "detail-val text-red";
        }

        const totalSent = stats.packetsSent;
        const totalDelivered = stats.packetsDelivered;
        const totalDropped = stats.packetsDropped;
        const lossRate = totalSent > 0 ? ((totalDropped / totalSent) * 100).toFixed(0) : 0;

        dashTelemetryInfo.textContent = `Delivery: ${totalDelivered}/${totalSent} Sent • Loss: ${lossRate}%`;
    }

    /* ========================================================================
       5. SIMULATION STEP LOG ENGINE
       ======================================================================== */

    function addLogStep(stepNum, nodeName, transitLink, costStr, actionText, type = "normal") {
        const tbody = document.getElementById("stepLogBody");
        const emptyRow = document.getElementById("emptyLogRow");
        const badge = document.getElementById("logRecordBadge");

        if (emptyRow) emptyRow.remove();

        simState.recordedLogsCount++;
        badge.textContent = `${simState.recordedLogsCount} Recorded`;

        const tr = document.createElement("tr");
        tr.className = "highlight-row";

        let stateColor = "#ffffff";
        if (type === "init") stateColor = "var(--accent-cyan)";
        if (type === "success") stateColor = "var(--accent-green)";
        if (type === "drop" || type === "fail") stateColor = "var(--accent-red)";
        if (type === "reroute") stateColor = "var(--accent-yellow)";

        tr.innerHTML = `
            <td class="log-step-num">#${stepNum}</td>
            <td class="log-node-tag" style="color: ${stateColor};">${nodeName}</td>
            <td><code>${transitLink}</code></td>
            <td><strong>${costStr}</strong></td>
            <td>${actionText}</td>
        `;

        tbody.appendChild(tr);

        // Auto-scroll table to bottom so user sees latest step immediately
        const wrap = document.querySelector(".step-log-table-wrap");
        if (wrap) wrap.scrollTop = wrap.scrollHeight;
    }

    function clearLog() {
        const tbody = document.getElementById("stepLogBody");
        tbody.innerHTML = `
            <tr class="empty-row" id="emptyLogRow">
                <td colspan="5" class="empty-text">No simulation steps recorded. Click "Start Simulation" or "Next Step" to begin.</td>
            </tr>
        `;
        simState.recordedLogsCount = 0;
        document.getElementById("logRecordBadge").textContent = "0 Recorded";
    }

    /* ========================================================================
       6. CORE STEP-BY-STEP SIMULATION CONTROLLER
       Addresses user requirement:
       - "Start Simulation" initializes without running directly
       - "Next Step" triggers VISUAL, CLEAR, STEPPED changes every time
       ======================================================================== */

    /**
     * Initializes simulation mode at Step 0 (PC Host).
     * Does NOT auto-run through hops, granting full access to Next Step!
     */
    function initSimulation() {
        const routeResult = dijkstra("PC", "Server");

        // UNREACHABLE CASE: Handle immediately
        if (routeResult.unreachable || !routeResult.path) {
            stats.packetsSent++;
            stats.packetsDropped++;
            sound.playAlert();
            updateDashboard(routeResult);

            const dropToken = document.getElementById("dropToken");
            dropToken.setAttribute("transform", "translate(70, 200)");
            dropToken.style.display = "block";
            setTimeout(() => (dropToken.style.display = "none"), 2400);

            addLogStep(
                1,
                "PC (INIT)",
                "None",
                "∞",
                "Transmission blocked: Destination Server is completely UNREACHABLE. Packet dropped.",
                "drop"
            );
            return;
        }

        // Initialize Step Mode
        simState.isInitialized = true;
        simState.isComplete = false;
        simState.currentHopIndex = 0;
        simState.activePath = routeResult.path;
        simState.accumulatedCost = 0;

        stats.packetsSent++;
        sound.playChirp();

        // 1. Position packet docked at PC
        const packetToken = document.getElementById("packetToken");
        const dropToken = document.getElementById("dropToken");
        dropToken.style.display = "none";
        packetToken.style.display = "block";
        packetToken.setAttribute("transform", `translate(${nodes.PC.pos.x}, ${nodes.PC.pos.y})`);

        // 2. Highlight Node PC with active glowing beacon
        highlightActiveHopNode("PC");

        // 3. Update Breadcrumb Stepper
        updateBreadcrumbChain(routeResult);

        // 4. Update Step Counter Badges
        document.getElementById("dashStepVal").textContent = "0";
        document.getElementById("stepBadgeNum").textContent = "0";

        // 5. Update Machine Dashboard
        document.getElementById("dashActiveState").textContent = "PC (Source Ready)";
        document.getElementById("dashActiveState").className = "triplet-val text-cyan";
        document.getElementById("dashCostVal").textContent = `0 / ${routeResult.cost}`;

        // 6. Update Canvas Bottom Strip
        const nextTarget = simState.activePath[1] || "R1";
        document.getElementById("canvasStatusBadge").textContent = "STEP 0";
        document.getElementById("canvasStatusBadge").className = "idle-badge active-mode";
        document.getElementById("canvasStatusText").innerHTML = `<strong>Simulation Initialized!</strong> Packet buffered at <code>PC (192.168.1.10)</code>. Click <strong>Next Step</strong> to transmit to <code>${nextTarget}</code>.`;

        removeDeliveryBadge();

        // 7. Update Buttons: Start Sim indicates ready, Next Step pulses green!
        const startBtn = document.getElementById("startSimBtn");
        const nextBtn = document.getElementById("nextStepBtn");
        const prevBtn = document.getElementById("prevStepBtn");
        const zoomNextBtn = document.getElementById("zoomNextStepBtn");
        const guideText = document.getElementById("simGuideText");

        if (nextBtn) nextBtn.classList.remove("btn-delivered");
        if (zoomNextBtn) {
            zoomNextBtn.classList.remove("btn-delivered");
            zoomNextBtn.innerHTML = `<span class="btn-icon">⏭</span><span class="btn-text">Next Step</span>`;
        }

        startBtn.innerHTML = `<span class="btn-icon">⚡</span><span>Ready (At PC)</span>`;
        startBtn.title = "Simulation initialized. Packet docked at PC.";
        nextBtn.innerHTML = `<span>&rarr; Next Step</span>`;
        nextBtn.title = `Hop 1: PC → ${nextTarget}`;
        nextBtn.classList.add("ready-pulse");
        prevBtn.disabled = true;

        if (guideText) {
            guideText.innerHTML = `👉 Step 0 active: Click <strong>Next Step</strong> to transmit packet from <strong>PC</strong> to <strong>${nextTarget}</strong>!`;
        }

        // 8. Add Step 0 to Log
        addLogStep(
            0,
            "PC (INIT)",
            "Local Buffer",
            "0",
            `Packet initialized at source PC [Src: 192.168.1.10 → Dst: 172.16.0.100, TTL: 64]. Ready for Hop 1.`,
            "init"
        );
    }

    /**
     * Executes ONE single hop forward with full visual feedback
     */
    async function stepNextHop() {
        if (simState.isAnimating) return;

        // If not initialized yet, clicking Next Step automatically initializes Step 0 first!
        if (!simState.isInitialized) {
            initSimulation();
            return;
        }

        // If already reached destination Server
        if (simState.isComplete) {
            sound.playSuccess();
            document.getElementById("canvasStatusText").innerHTML = `<strong>Derivation Complete!</strong> Packet is already at destination Server (172.16.0.100). Click <strong>Reset</strong> to run again.`;
            return;
        }

        // Dynamic route check: verify remaining path in case topology changed
        const currentNode = simState.activePath[simState.currentHopIndex];
        const currentRouteCheck = dijkstra("PC", "Server");

        if (currentRouteCheck.unreachable || !currentRouteCheck.path) {
            // Drop packet right at current node
            stats.packetsDropped++;
            sound.playAlert();
            updateDashboard(currentRouteCheck);

            const dropToken = document.getElementById("dropToken");
            const curPos = nodes[currentNode].pos;
            dropToken.setAttribute("transform", `translate(${curPos.x}, ${curPos.y})`);
            dropToken.style.display = "block";
            document.getElementById("packetToken").style.display = "none";

            addLogStep(
                simState.currentHopIndex + 1,
                currentNode,
                "Severed",
                "∞",
                `Network Partitioned! No path exists to Server. Packet DROPPED at ${currentNode} (ICMP Host Unreachable).`,
                "drop"
            );

            document.getElementById("canvasStatusBadge").textContent = "DROPPED";
            document.getElementById("canvasStatusBadge").className = "idle-badge unreachable-mode";
            document.getElementById("canvasStatusText").innerHTML = `<strong>Packet Dropped!</strong> Network partitioned. No path to Server from <code>${currentNode}</code>.`;
            return;
        }

        // Update active path in case Dijkstra recalculated alternate route (e.g. failover to R3)
        simState.activePath = currentRouteCheck.path;

        const fromNode = simState.activePath[simState.currentHopIndex];
        const toNode = simState.activePath[simState.currentHopIndex + 1];

        if (!toNode) return;

        const fromPos = nodes[fromNode].pos;
        const toPos = nodes[toNode].pos;

        // Find edge weight
        const lk = links.find(
            l => (l.source === fromNode && l.target === toNode) ||
                (l.source === toNode && l.target === fromNode)
        );
        const linkWeight = lk ? lk.weight : 1;
        const linkId = lk ? lk.id : `${fromNode}-${toNode}`;

        simState.isAnimating = true;

        // Visual: Flash the traversing link line
        const linkItem = document.getElementById(`linkItem-${linkId}`);
        if (linkItem) linkItem.classList.add("traversing");

        // Sound effect
        sound.playChirp();

        // Animate packet coordinate smoothly across this hop
        const packetToken = document.getElementById("packetToken");
        await animatePacket(packetToken, fromPos, toPos, 420);

        if (linkItem) linkItem.classList.remove("traversing");
        simState.isAnimating = false;

        // Advance hop state
        simState.currentHopIndex++;
        simState.accumulatedCost += linkWeight;

        const hopNumber = simState.currentHopIndex;
        const totalHops = simState.activePath.length - 1;

        // Update UI highlights:
        // Set fromNode as passed-hop, toNode as active-hop
        highlightActiveHopNode(toNode, fromNode);

        // Update Step Badges
        document.getElementById("dashStepVal").textContent = `${hopNumber} / ${totalHops}`;
        document.getElementById("stepBadgeNum").textContent = hopNumber;

        // Update Machine Dashboard
        document.getElementById("dashActiveState").textContent = `${toNode} (${nodes[toNode].role})`;
        document.getElementById("dashActiveState").className = toNode === "Server" ? "triplet-val text-purple" : "triplet-val text-green";
        document.getElementById("dashCostVal").textContent = `${simState.accumulatedCost} / ${currentRouteCheck.cost}`;

        // Update Breadcrumbs
        updateBreadcrumbChain(currentRouteCheck);

        // Buttons state
        const prevBtn = document.getElementById("prevStepBtn");
        const nextBtn = document.getElementById("nextStepBtn");
        prevBtn.disabled = false;

        // Build descriptive action explanation
        let actionDesc = "";
        if (toNode === "Server") {
            // Delivery reached
            simState.isComplete = true;
            stats.packetsDelivered++;
            sound.playSuccess();
            updateDashboard(currentRouteCheck);

            actionDesc = `Packet successfully delivered to destination Server! HTTP 200 OK Response (Total Path Cost: ${simState.accumulatedCost}).`;

            document.getElementById("canvasStatusBadge").textContent = "✓ DELIVERED";
            document.getElementById("canvasStatusBadge").className = "idle-badge delivered-mode";
            document.getElementById("canvasStatusText").innerHTML = `🎉 <strong>Packet Delivered!</strong> Reached <code>Server (172.16.0.100)</code> with total metric cost <strong>${simState.accumulatedCost}</strong>. Click <strong>Reset</strong> to rerun.`;

            nextBtn.innerHTML = `<span>✓ Delivered</span>`;
            nextBtn.title = `Packet successfully delivered to Server! (Cost: ${simState.accumulatedCost})`;
            nextBtn.classList.remove("ready-pulse");
            nextBtn.classList.add("btn-delivered");

            // Also update zoom modal Next Step button & status chip if present
            const zoomNextBtn = document.getElementById("zoomNextStepBtn");
            if (zoomNextBtn) {
                zoomNextBtn.innerHTML = `<span class="btn-icon">✓</span><span class="btn-text">Delivered</span>`;
                zoomNextBtn.classList.add("btn-delivered");
            }
            const zoomStatusChip = document.getElementById("zoomStatusChip");
            if (zoomStatusChip) {
                zoomStatusChip.className = "telemetry-chip healthy";
                zoomStatusChip.textContent = "✓ DELIVERED";
            }

            renderDeliveryBadgeOnServer();

            const guideText = document.getElementById("simGuideText");
            if (guideText) {
                guideText.innerHTML = `🎉 <strong>Delivery Complete:</strong> Packet reached <strong>Server</strong> with green checkmark! Click <strong>Reset</strong> or test another scenario below.`;
            }

        } else {
            const nextNode = simState.activePath[hopNumber + 1];
            actionDesc = `Traversed link ${linkId} (+${linkWeight}). Docked at ${toNode}. Forwarding table directs next hop towards ${nextNode}.`;

            document.getElementById("canvasStatusBadge").textContent = `HOP ${hopNumber}/${totalHops}`;
            document.getElementById("canvasStatusBadge").className = "idle-badge active-mode";
            document.getElementById("canvasStatusText").innerHTML = `<strong>Hop ${hopNumber}/${totalHops} Complete:</strong> Packet reached <code>${toNode} (${nodes[toNode].ip})</code> via <code>${linkId}</code>. Next target: <code>${nextNode}</code>.`;

            nextBtn.innerHTML = `<span>&rarr; Next Step</span>`;
            nextBtn.title = `Next Hop ${hopNumber + 1}: ${toNode} → ${nextNode}`;
            nextBtn.classList.add("ready-pulse");

            const guideText = document.getElementById("simGuideText");
            if (guideText) {
                guideText.innerHTML = `👉 <strong>Hop ${hopNumber} reached:</strong> Packet is at <strong>${toNode}</strong>. Click <strong>Next Step</strong> to forward to <strong>${nextNode}</strong>!`;
            }
        }

        // Add Step to Log with highlight row animation
        addLogStep(
            hopNumber,
            `${toNode} (${nodes[toNode].role})`,
            `${linkId} (w=${linkWeight})`,
            `Cost: ${simState.accumulatedCost}`,
            actionDesc,
            toNode === "Server" ? "success" : "normal"
        );
    }

    /**
     * Steps one hop backward to allow reviewing prior routing decisions
     */
    function stepPrevHop() {
        if (simState.isAnimating || !simState.isInitialized || simState.currentHopIndex <= 0) return;

        simState.isComplete = false;

        const currentToNode = simState.activePath[simState.currentHopIndex];
        const prevNode = simState.activePath[simState.currentHopIndex - 1];

        // Find weight to subtract
        const lk = links.find(
            l => (l.source === currentToNode && l.target === prevNode) ||
                (l.source === prevNode && l.target === currentToNode)
        );
        const linkWeight = lk ? lk.weight : 1;

        simState.currentHopIndex--;
        simState.accumulatedCost = Math.max(0, simState.accumulatedCost - linkWeight);

        sound.playChirp();

        // Move packet back
        const packetToken = document.getElementById("packetToken");
        packetToken.setAttribute("transform", `translate(${nodes[prevNode].pos.x}, ${nodes[prevNode].pos.y})`);

        // Highlight
        highlightActiveHopNode(prevNode);

        // Update dashboard & breadcrumb
        const currentRouteCheck = dijkstra("PC", "Server");
        updateBreadcrumbChain(currentRouteCheck);

        const hopNumber = simState.currentHopIndex;
        const totalHops = simState.activePath.length - 1;

        document.getElementById("dashStepVal").textContent = `${hopNumber} / ${totalHops}`;
        document.getElementById("stepBadgeNum").textContent = hopNumber;
        document.getElementById("dashActiveState").textContent = `${prevNode} (${nodes[prevNode].role})`;
        document.getElementById("dashCostVal").textContent = `${simState.accumulatedCost} / ${currentRouteCheck.cost}`;

        const nextNode = simState.activePath[hopNumber + 1];
        document.getElementById("canvasStatusBadge").textContent = `HOP ${hopNumber}/${totalHops}`;
        document.getElementById("canvasStatusText").innerHTML = `<strong>Stepped Back to ${prevNode}:</strong> Packet docked at <code>${prevNode}</code>. Next forward step: <code>${nextNode}</code>.`;

        removeDeliveryBadge();

        const nextBtn = document.getElementById("nextStepBtn");
        nextBtn.innerHTML = `<span>&rarr; Next Step</span>`;
        nextBtn.title = `Step forward to ${nextNode}`;
        nextBtn.classList.remove("btn-delivered");
        nextBtn.classList.add("ready-pulse");

        const zoomNextBtn = document.getElementById("zoomNextStepBtn");
        if (zoomNextBtn) {
            zoomNextBtn.classList.remove("btn-delivered");
            zoomNextBtn.innerHTML = `<span class="btn-icon">⏭</span><span class="btn-text">Next Step</span>`;
        }

        if (hopNumber === 0) {
            document.getElementById("prevStepBtn").disabled = true;
        }

        addLogStep(
            hopNumber,
            `${prevNode} (BACK)`,
            "Reversed",
            `Cost: ${simState.accumulatedCost}`,
            `Stepped backward to ${prevNode}. Reviewing hop state.`,
            "init"
        );
    }

    /**
     * Renders a glowing SVG badge with green checkmark over destination Server
     */
    function renderDeliveryBadgeOnServer() {
        removeDeliveryBadge();
        const srvPos = nodes.Server ? nodes.Server.pos : { x: 580, y: 200 };
        const badgeX = srvPos.x;
        const badgeY = srvPos.y - 48;

        const badgeHtml = `
            <g class="delivery-success-badge" id="serverDeliveryBadge" transform="translate(${badgeX}, ${badgeY})">
                <rect x="-56" y="-14" width="112" height="28" rx="14" class="delivery-badge-rect"/>
                <text x="0" y="5" text-anchor="middle" class="delivery-badge-text">✓ DELIVERED</text>
            </g>
        `;

        const mainSvg = document.getElementById("networkSvg");
        if (mainSvg) {
            mainSvg.insertAdjacentHTML("beforeend", badgeHtml);
        }

        const zoomSvg = document.getElementById("zoomNetworkSvg");
        if (zoomSvg) {
            const existingZoomBadge = zoomSvg.querySelector("#serverDeliveryBadge");
            if (!existingZoomBadge) {
                zoomSvg.insertAdjacentHTML("beforeend", badgeHtml);
            }
        }
    }

    /**
     * Removes all delivery badges from main SVG and zoom SVG
     */
    function removeDeliveryBadge() {
        document.querySelectorAll("#serverDeliveryBadge").forEach(el => el.remove());
    }

    /**
     * Resets the simulation back to initial clean state
     */
    function resetSimulation() {
        simState.isInitialized = false;
        simState.isComplete = false;
        simState.isAnimating = false;
        simState.currentHopIndex = 0;
        simState.accumulatedCost = 0;

        stats.currentStep = 0;

        removeDeliveryBadge();

        document.getElementById("packetToken").style.display = "none";
        document.getElementById("dropToken").style.display = "none";

        // Remove active node highlights
        Object.keys(nodes).forEach(n => {
            const g = document.getElementById(`nodeGroup-${n}`);
            if (g) g.classList.remove("active-hop", "passed-hop");
        });

        // Reset Buttons
        const startBtn = document.getElementById("startSimBtn");
        const nextBtn = document.getElementById("nextStepBtn");
        const prevBtn = document.getElementById("prevStepBtn");
        const zoomNextBtn = document.getElementById("zoomNextStepBtn");

        startBtn.innerHTML = `<span class="btn-icon">▶</span><span>Start Simulation</span>`;
        startBtn.title = "Send animated packet through network";
        startBtn.disabled = false;
        nextBtn.innerHTML = `<span>&rarr; Next Step</span>`;
        nextBtn.title = "Step forward one hop";
        nextBtn.classList.remove("ready-pulse", "btn-delivered");
        prevBtn.disabled = true;

        if (zoomNextBtn) {
            zoomNextBtn.classList.remove("btn-delivered");
            zoomNextBtn.innerHTML = `<span class="btn-icon">⏭</span><span class="btn-text">Next Step</span>`;
        }

        const guideText = document.getElementById("simGuideText");
        if (guideText) {
            guideText.innerHTML = `Click <strong>Start Simulation</strong> to initialize packet, then click <strong>Next Step</strong> to advance hop-by-hop!`;
        }

        clearLog();

        const res = dijkstra("PC", "Server");
        updateTopologyVisuals(res);
        sound.playChirp();
    }

    function highlightActiveHopNode(activeNodeId, passedNodeId = null) {
        Object.keys(nodes).forEach(n => {
            const g = document.getElementById(`nodeGroup-${n}`);
            if (!g) return;

            g.classList.remove("active-hop");

            if (passedNodeId && n === passedNodeId) {
                g.classList.add("passed-hop");
            }
            if (n === activeNodeId) {
                g.classList.remove("passed-hop");
                g.classList.add("active-hop");
            }
        });
    }

    function animatePacket(element, fromPos, toPos, duration) {
        return new Promise(resolve => {
            const start = performance.now();
            function frame(now) {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

                const curX = fromPos.x + (toPos.x - fromPos.x) * ease;
                const curY = fromPos.y + (toPos.y - fromPos.y) * ease;

                element.setAttribute("transform", `translate(${curX}, ${curY})`);
                const zoomPacket = document.querySelector("#zoomNetworkSvg #packetToken");
                if (zoomPacket) {
                    zoomPacket.setAttribute("transform", `translate(${curX}, ${curY})`);
                    zoomPacket.style.display = "block";
                }

                if (progress < 1) {
                    requestAnimationFrame(frame);
                } else {
                    element.setAttribute("transform", `translate(${toPos.x}, ${toPos.y})`);
                    if (zoomPacket) {
                        zoomPacket.setAttribute("transform", `translate(${toPos.x}, ${toPos.y})`);
                        zoomPacket.style.display = "block";
                    }
                    resolve();
                }
            }
            requestAnimationFrame(frame);
        });
    }

    /* ========================================================================
       7. FAILURE INJECTION & AUTOMATIC RECOVERY
       ======================================================================== */

    function failRouter(routerId) {
        if (!nodes[routerId]) return;
        nodes[routerId].status = "FAILED";
        sound.playAlert();

        addLogStep(
            simState.currentHopIndex,
            routerId,
            "FAULT",
            "DOWN",
            `Hardware crash detected on ${routerId}! Link-State Advertisement flooded. Alternate route recalculating...`,
            "fail"
        );

        handleTopologyUpdate();
    }

    function failLink(linkId) {
        const lk = links.find(l => l.id === linkId);
        if (!lk) return;
        lk.status = "FAILED";
        sound.playAlert();

        addLogStep(
            simState.currentHopIndex,
            "Topology",
            linkId,
            "CUT",
            `Physical link ${linkId} severed! Loss of Signal (LOS) detected. Dijkstra recalculating...`,
            "fail"
        );

        handleTopologyUpdate();
    }

    function recoverEntireNetwork() {
        Object.keys(nodes).forEach(n => (nodes[n].status = "ACTIVE"));
        links.forEach(l => (l.status = "ACTIVE"));

        sound.playSuccess();
        renderLinksDiagram();
        addLogStep(
            simState.currentHopIndex,
            "Network",
            "ALL",
            "RECOVERED",
            "Network recovery complete: All 6 routers and links restored to ACTIVE.",
            "success"
        );

        handleTopologyUpdate();
    }

    function handleTopologyUpdate() {
        const spfResult = dijkstra("PC", "Server");
        updateTopologyVisuals(spfResult);

        // If currently in step simulation, adjust next step button text and banner
        if (simState.isInitialized && !simState.isComplete) {
            if (!spfResult.unreachable && spfResult.path) {
                simState.activePath = spfResult.path;
                const nextTarget = simState.activePath[simState.currentHopIndex + 1] || "Server";

                document.getElementById("canvasStatusBadge").textContent = "REROUTED";
                document.getElementById("canvasStatusBadge").className = "idle-badge failover-mode";
                document.getElementById("canvasStatusText").innerHTML = `⚠ <strong>Route Alteration:</strong> Network converged on alternate path <code>${spfResult.path.join(" → ")}</code> (Cost: ${spfResult.cost}). Click <strong>Next Step</strong> to follow alternate route!`;

                const nextBtn = document.getElementById("nextStepBtn");
                nextBtn.innerHTML = `<span>&rarr; Next Step</span>`;
                nextBtn.title = `Rerouted → ${nextTarget}`;

                addLogStep(
                    simState.currentHopIndex,
                    "SPF Engine",
                    "REROUTE",
                    `Cost: ${spfResult.cost}`,
                    `Dijkstra dynamically converged on alternate path: ${spfResult.path.join(" → ")}`,
                    "reroute"
                );
            } else {
                document.getElementById("canvasStatusBadge").textContent = "UNREACHABLE";
                document.getElementById("canvasStatusBadge").className = "idle-badge unreachable-mode";
                document.getElementById("canvasStatusText").innerHTML = `❌ <strong>Partition Detected:</strong> No connected path to Server! Next Step will show packet drop.`;
            }
        }
    }

    /* ========================================================================
       8. QUICK TEST CASES (PRESET SCENARIOS)
       ======================================================================== */

    function loadScenario(scenarioKey) {
        // Reset state
        Object.keys(nodes).forEach(n => (nodes[n].status = "ACTIVE"));
        links.forEach(l => (l.status = "ACTIVE"));

        // Highlight active test chip
        document.querySelectorAll(".test-chip").forEach(chip => {
            if (chip.dataset.scenario === scenarioKey) {
                chip.classList.add("active-chip");
            } else {
                chip.classList.remove("active-chip");
            }
        });

        // Reset step state so user can immediately step through new scenario
        simState.isInitialized = false;
        simState.isComplete = false;
        simState.currentHopIndex = 0;
        document.getElementById("packetToken").style.display = "none";
        document.getElementById("dropToken").style.display = "none";

        Object.keys(nodes).forEach(n => {
            const g = document.getElementById(`nodeGroup-${n}`);
            if (g) g.classList.remove("active-hop", "passed-hop");
        });

        const startBtn = document.getElementById("startSimBtn");
        const nextBtn = document.getElementById("nextStepBtn");
        startBtn.innerHTML = `<span class="btn-icon">▶</span><span>Start Simulation</span>`;
        startBtn.title = "Send animated packet through network";
        nextBtn.innerHTML = `<span>&rarr; Next Step</span>`;
        nextBtn.title = "Step forward one hop";
        nextBtn.classList.remove("ready-pulse");

        if (scenarioKey !== "normal" && Object.keys(nodes).length !== 6) {
            setRouterCount(4);
        }

        switch (scenarioKey) {
            case "normal":
                setRouterCount(4);
                addLogStep(0, "Test Case", "Scenario 1", "6", "Loaded Normal Baseline (Optimal Route via R2). Click Start Simulation or Next Step.", "normal");
                break;
            case "fail-r2":
                nodes.R2.status = "FAILED";
                addLogStep(0, "Test Case", "Scenario 2", "7", "Loaded Router R2 Failure (Automatic failover to R3). Click Next Step to observe.", "reroute");
                break;
            case "fail-link-r1-r2":
                links.find(l => l.id === "R1-R2").status = "FAILED";
                addLogStep(0, "Test Case", "Scenario 3", "7", "Loaded Link R1-R2 Cut (Automatic failover via R1-R3). Click Next Step to observe.", "reroute");
                break;
            case "fail-link-r2-r4":
                links.find(l => l.id === "R2-R4").status = "FAILED";
                addLogStep(0, "Test Case", "Scenario 4", "7", "Loaded Link R2-R4 Severed (Rerouting through R3). Click Next Step to observe.", "reroute");
                break;
            case "unreachable-core":
                nodes.R2.status = "FAILED";
                nodes.R3.status = "FAILED";
                addLogStep(0, "Test Case", "Scenario 5", "∞", "Loaded Core Partition (Both R2 & R3 Down). Click Next Step to observe packet drop.", "drop");
                break;
            case "unreachable-r4":
                nodes.R4.status = "FAILED";
                addLogStep(0, "Test Case", "Scenario 6", "∞", "Loaded Aggregation Router R4 Down (Unreachable). Click Next Step to observe packet drop.", "drop");
                break;
        }

        renderLinksDiagram();
        const res = dijkstra("PC", "Server");
        updateTopologyVisuals(res);
    }

    /* ========================================================================
       9. EVENT LISTENERS & SETUP
       ======================================================================== */

    function setupEventListeners() {
        // Start Simulation Button: Initializes simulation mode without rushing!
        document.getElementById("startSimBtn").addEventListener("click", () => {
            sound.init();
            initSimulation();
        });

        // Next Step Button: Advances one discrete, visual hop every click
        document.getElementById("nextStepBtn").addEventListener("click", () => {
            sound.init();
            stepNextHop();
        });

        // Previous Step Button: Steps one hop backward
        document.getElementById("prevStepBtn").addEventListener("click", () => {
            sound.init();
            stepPrevHop();
        });

        // Reset Button: Clears packet & steps
        document.getElementById("resetSimBtn").addEventListener("click", resetSimulation);
        document.getElementById("clearLogBtn").addEventListener("click", clearLog);

        // Recalculate Button: Re-reads edited weights and solves SPF
        document.getElementById("recalcDijkstraBtn").addEventListener("click", () => {
            sound.init();
            applyDiagramFromTextarea(true);
        });

        // Update Diagram Button: Redraws the diagram from entered links
        const updateDiagramBtn = document.getElementById("updateDiagramBtn");
        if (updateDiagramBtn) {
            updateDiagramBtn.addEventListener("click", () => {
                sound.init();
                applyDiagramFromTextarea(true);
            });
        }

        // Editable Link Adjacency & Edge Weights Textarea
        const weightsTextarea = document.getElementById("edgeWeightsTextarea");
        if (weightsTextarea) {
            weightsTextarea.addEventListener("input", onEdgeWeightsInput);
            weightsTextarea.addEventListener("change", () => {
                applyDiagramFromTextarea(true);
            });
        }

        // Fault Injection Buttons
        document.getElementById("failRouterBtn").addEventListener("click", () => {
            const r = document.getElementById("routerFailSelect").value;
            failRouter(r);
        });

        document.getElementById("failLinkBtn").addEventListener("click", () => {
            const lk = document.getElementById("linkFailSelect").value;
            failLink(lk);
        });

        document.getElementById("recoverNetworkBtn").addEventListener("click", recoverEntireNetwork);

        // Quick Test Case Chips
        document.querySelectorAll(".test-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                sound.init();
                loadScenario(chip.dataset.scenario);
            });
        });

        // Routers (R) Stepper Controls
        const incRouterBtn = document.getElementById("incRouterBtn");
        if (incRouterBtn) {
            incRouterBtn.addEventListener("click", () => {
                sound.init();
                const cur = parseInt(document.getElementById("routerCountInput").value) || 4;
                if (cur < 8) {
                    setRouterCount(cur + 1);
                }
            });
        }

        const decRouterBtn = document.getElementById("decRouterBtn");
        if (decRouterBtn) {
            decRouterBtn.addEventListener("click", () => {
                sound.init();
                const cur = parseInt(document.getElementById("routerCountInput").value) || 4;
                if (cur > 2) {
                    setRouterCount(cur - 1);
                }
            });
        }

        const routerCountInput = document.getElementById("routerCountInput");
        if (routerCountInput) {
            routerCountInput.addEventListener("change", () => {
                sound.init();
                const val = parseInt(routerCountInput.value);
                if (!isNaN(val)) {
                    setRouterCount(val);
                }
            });
        }

        // Direct Click on SVG Nodes (Interactive Fail/Repair)
        setupNodeInteractions();

        // Collapsible Theory Card
        const toggleHeader = document.getElementById("toggleTheoryHeader");
        const theoryContent = document.getElementById("theoryContent");
        const caret = document.getElementById("collapseCaret");
        if (toggleHeader) {
            toggleHeader.addEventListener("click", () => {
                const isHidden = theoryContent.style.display === "none";
                theoryContent.style.display = isHidden ? "block" : "none";
                caret.textContent = isHidden ? "▼" : "▶";
            });
        }

        // ====================================================================
        // AI TUTOR CONTROLLER (Gemini Live & Built-in TOC/CN Knowledge Engine)
        // ====================================================================

        const GEMINI_CONFIG = {
            DEFAULT_KEY: "", // Zero hardcoded secrets! Credentials kept in backend / Vercel env
            MODELS: ["gemini-flash-lite-latest", "gemini-3.8-flash", "gemini-flash-latest"],
            STORAGE_KEY: "cn_gemini_api_key"
        };

        let tutorChatHistory = [];
        let isTutorThinking = false;

        function getActiveApiKey() {
            const saved = localStorage.getItem(GEMINI_CONFIG.STORAGE_KEY);
            if (saved && saved.trim()) return saved.trim();
            return GEMINI_CONFIG.DEFAULT_KEY;
        }

        function updateAiBadge(mode) {
            const badge = document.querySelector(".ai-badge-live");
            if (!badge) return;
            if (mode === "gemini") {
                badge.textContent = "Gemini Live";
                badge.style.color = "var(--accent-green)";
                badge.style.borderColor = "rgba(0, 230, 118, 0.35)";
            } else {
                badge.textContent = "Offline Tutor";
                badge.style.color = "var(--accent-cyan)";
                badge.style.borderColor = "rgba(0, 240, 255, 0.35)";
            }
        }

        function escapeTutorHtml(str) {
            if (!str) return "";
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }

        function formatTutorMarkdown(md) {
            if (!md) return "";
            let text = md.trim();

            // Clean LaTeX dollar signs and arrow symbols
            text = text.replace(/\\rightarrow|\\to/g, "→");
            text = text.replace(/\$\$([^$]+)\$\$/g, "$1");
            text = text.replace(/\$([^$]+)\$/g, "$1");

            // Extract and protect code blocks
            const codeBlocks = [];
            text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
                const idx = codeBlocks.length;
                codeBlocks.push({ lang: lang || "text", code: escapeTutorHtml(code.trim()) });
                return `__CODE_BLOCK_${idx}__`;
            });

            // Inline code
            text = text.replace(/`([^`]+)`/g, (m, c) => `<code>${escapeTutorHtml(c)}</code>`);

            // Bold and Italic
            text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
            text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

            // Blockquotes
            text = text.replace(/^>\s*(.+)$/gm, "<blockquote>$1</blockquote>");

            // Paragraphs and lists
            const lines = text.split("\n");
            const result = [];
            let inList = false;

            for (let line of lines) {
                const trimmed = line.trim();
                if (/^[-*•]\s+(.+)/.test(trimmed)) {
                    if (!inList) {
                        result.push("<ul>");
                        inList = true;
                    }
                    const item = trimmed.replace(/^[-*•]\s+/, "");
                    result.push(`<li>${item}</li>`);
                } else if (/^\d+\.\s+(.+)/.test(trimmed)) {
                    if (!inList) {
                        result.push("<ol>");
                        inList = true;
                    }
                    const item = trimmed.replace(/^\d+\.\s+/, "");
                    result.push(`<li>${item}</li>`);
                } else {
                    if (inList) {
                        result.push("</ul>");
                        inList = false;
                    }
                    if (trimmed.length > 0) {
                        result.push(`<p>${line}</p>`);
                    }
                }
            }
            if (inList) result.push("</ul>");

            let html = result.join("");

            // Reinsert code blocks
            codeBlocks.forEach((cb, idx) => {
                const blockHtml = `<pre><code>${cb.code}</code></pre>`;
                html = html.replace(`__CODE_BLOCK_${idx}__`, blockHtml);
            });

            return html;
        }

        function getLiveSimulationContext() {
            const activeNodes = Object.values(nodes).filter(n => n.status === "ACTIVE").map(n => n.id);
            const failedNodes = Object.values(nodes).filter(n => n.status === "FAILED").map(n => n.id);
            const activeLinks = links.filter(l => l.status === "ACTIVE").map(l => `${l.source}-${l.target}(w:${l.weight})`);
            const failedLinks = links.filter(l => l.status === "FAILED").map(l => `${l.source}-${l.target}`);

            return {
                activeRoute: stats.activeRoute ? stats.activeRoute.join(" → ") : "Unreachable (No Active Path)",
                activeCost: stats.activeCost !== null && stats.activeCost !== Infinity ? stats.activeCost : "∞ (Partitioned)",
                isPartitioned: stats.isPartitioned,
                activeNodes,
                failedNodes,
                activeLinks,
                failedLinks,
                packetsSent: stats.packetsSent,
                packetsDelivered: stats.packetsDelivered,
                packetsDropped: stats.packetsDropped,
                currentStep: stats.currentStep
            };
        }

        function generateOfflineTutorResponse(query, ctx) {
            const q = query.toLowerCase();

            // 1. Dijkstra / Shortest Path
            if (q.includes("dijkstra") || q.includes("shortest") || q.includes("spf") || q.includes("algorithm")) {
                return `**🎯 Core Idea:** Dijkstra calculates the lowest total metric path from source **PC** to **Server**.
• **Algorithm:** Greedily relaxes edge weights: \`dist[v] = min(dist[v], dist[u] + weight)\`.
• **Optimal Normal Route:** **PC → R1 → R2 → R4 → Server** (Total Cost = **6**).
• **Live Simulator State:** Route: \`${ctx.activeRoute}\` • Cost: **${ctx.activeCost}** (${ctx.isPartitioned ? "❌ Unreachable" : "✅ Healthy"}).`;
            }

            // 2. R2 Failure & Automatic Recovery
            if (q.includes("r2") || q.includes("failover") || q.includes("recover") || q.includes("alternate") || q.includes("backup")) {
                return `**🎯 Core Idea:** Automatic failover reroutes traffic instantly when Router **R2** crashes.
• **Failure Trigger:** Ingress link \`R1-R2\` or egress link \`R2-R4\` goes down.
• **Dynamic Recalculation:** Dijkstra activates backup router **R3**: **PC → R1 → R3 → R4 → Server** (Cost = **7**).
• **Key Takeaway:** Zero packet loss with automated Link-State convergence!`;
            }

            // 3. Packet Drop & Unreachable States
            if (q.includes("drop") || q.includes("unreach") || q.includes("loss") || q.includes("lost") || q.includes("partition")) {
                return `**🎯 Core Idea:** Packets drop when **no valid connected path** exists to Server.
• **Root Causes:** Both core routers (**R2 & R3**) down, gateway (**R1**) down, or aggregator (**R4**) down.
• **SPF Reaction:** Dijkstra evaluates metric as **∞**; simulator halts forwarding and drops packet.
• **Live Stats:** Delivered: **${ctx.packetsDelivered}** • Dropped: **${ctx.packetsDropped}** (Status: ${ctx.isPartitioned ? "⚠️ Partitioned" : "Active"}).`;
            }

            // 4. Code & Animation
            if (q.includes("code") || q.includes("animation") || q.includes("how does") || q.includes("javascript") || q.includes("logic")) {
                return `**🎯 Core Idea:** Modular event-driven JavaScript powers the SVG network simulator.
• **State Machine:** Nodes & links are stored as graph objects evaluated dynamically by \`dijkstra()\`.
• **Step Engine:** \`stepNextHop()\` advances discrete hops and animates SVG coordinate transforms.
• **Interactive Canvas:** Direct clicking on routers or link lines triggers fault injection.`;
            }

            // 5. Link Weights
            if (q.includes("weight") || q.includes("metric") || q.includes("cost") || q.includes("delay")) {
                return `**🎯 Core Idea:** Lower link weight represents higher bandwidth / lower latency.
• **Why R2 Beats R3:** \`R1-R2\` has cost **2**, while \`R1-R3\` has cost **3**.
• **Path Comparison:** Via R2 = cost **6** (preferred) vs Via R3 = cost **7** (backup).
• **Customization:** Modify weights in the adjacency text panel to see routes update live!`;
            }

            // 6. Current Simulator State
            if (q.includes("current") || q.includes("my") || q.includes("status") || q.includes("state") || q.includes("now")) {
                const failedR = ctx.failedNodes.length ? ctx.failedNodes.join(", ") : "None (All online)";
                return `**🎯 Core Idea:** Real-time telemetry snapshot of your network simulator:
• **Active Route:** \`${ctx.activeRoute}\` (Total Metric: **${ctx.activeCost}**)
• **Failed Hardware:** Routers: **${failedR}** • Partitioned: **${ctx.isPartitioned ? "YES ❌" : "NO ✅"}**
• **Traffic Record:** Sent: **${ctx.packetsSent}** | Delivered: **${ctx.packetsDelivered}** | Dropped: **${ctx.packetsDropped}**`;
            }

            // 7. General Networking Concepts
            if (q.includes("router") || q.includes("gateway") || q.includes("ttl") || q.includes("mtu") || q.includes("ospf")) {
                return `**🎯 Core Idea:** Key networking building blocks explained:
• **Router:** Layer 3 device routing packets using shortest path algorithms (OSPF/Dijkstra).
• **Default Gateway (R1):** Ingress router connecting source PC to external network.
• **TTL (Time-To-Live):** Hop limit counter decremented per hop to stop infinite loops.
• **Convergence:** Time taken for routers to discover topology changes and recalculate routes.`;
            }

            // Default fallback response
            return `**🎯 Core Idea:** Dynamic Link-State Routing & Recovery Simulator:
• **Shortest Path:** \`${ctx.activeRoute}\` (Total Cost: **${ctx.activeCost}**).
• **Quick Questions:**
  - *"How does Dijkstra find the path?"*
  - *"What happens when R2 fails?"*
  - *"Why are packets dropped?"*`;
        }

        async function callGeminiApiForTutor(apiKey, userQuestion, context) {
            const systemPrompt = `You are a concise, high-yield Computer Networks AI Tutor.
The student wants SHORT, CLEAR, and DIRECT answers with only the MOST IMPORTANT points in an easily understandable format.

STRICT FORMAT RULES:
1. MAXIMUM 3 TO 4 BULLET POINTS TOTAL.
2. Structure your response EXACTLY like this:
   **🎯 Core Idea:** One brief sentence explaining the primary concept.
   • **Key Point 1:** Short bullet with bold term (**Dijkstra**, **Failover**, etc.).
   • **Key Point 2:** Short bullet with the mechanism or metric.
   • **Live State:** One short line linking to current simulation: Route \`${context.activeRoute}\`, Cost \`${context.activeCost}\`.
3. NEVER write long paragraphs, preambles, or filler ("Hello student!", "Certainly!", etc.).
4. NO LaTeX dollar signs ($); use plain text and arrows (→).
5. Maximum length: 70-90 words.`;

            const historyContents = tutorChatHistory.slice(-2).map(m => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }]
            }));

            const contents = [
                ...historyContents,
                { role: "user", parts: [{ text: userQuestion }] }
            ];

            let lastErr = null;
            for (const model of GEMINI_CONFIG.MODELS) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                    const res = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            system_instruction: { parts: [{ text: systemPrompt }] },
                            contents: contents,
                            generationConfig: {
                                temperature: 0.25,
                                maxOutputTokens: 200
                            }
                        })
                    });

                    if (!res.ok) {
                        const errBody = await res.text();
                        throw new Error(`${model} (${res.status}): ${errBody.slice(0, 100)}`);
                    }

                    const data = await res.json();
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text && text.trim()) {
                        return text.trim();
                    }
                } catch (err) {
                    console.warn(`[AI Tutor] Model ${model} unavailable:`, err.message);
                    lastErr = err;
                }
            }

            throw lastErr || new Error("All candidate Gemini models failed");
        }

        function appendTutorUserMsg(text) {
            const thread = document.getElementById("tutorChatThread");
            if (!thread) return;

            const msgDiv = document.createElement("div");
            msgDiv.className = "chat-msg msg-user";
            msgDiv.innerHTML = `
                <div class="msg-avatar">👤</div>
                <div class="msg-bubble">
                    <div class="msg-author">You (Student)</div>
                    <div class="msg-body"><p>${escapeTutorHtml(text)}</p></div>
                </div>
            `;
            thread.appendChild(msgDiv);
            thread.scrollTop = thread.scrollHeight;
        }

        function appendTutorThinking() {
            const thread = document.getElementById("tutorChatThread");
            if (!thread) return null;

            const thinkingDiv = document.createElement("div");
            thinkingDiv.className = "chat-msg msg-ai";
            thinkingDiv.id = "tutorThinkingIndicator";
            thinkingDiv.innerHTML = `
                <div class="msg-avatar">🤖</div>
                <div class="msg-bubble">
                    <div class="msg-author">AI Tutor</div>
                    <div class="msg-body">
                        <div class="ai-thinking-row">
                            <span style="font-size:0.75rem; color:var(--text-muted);">Analyzing network topology &amp; generating answer...</span>
                            <div class="ai-thinking-dots">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            thread.appendChild(thinkingDiv);
            thread.scrollTop = thread.scrollHeight;
            return thinkingDiv;
        }

        function replaceTutorThinkingWithAnswer(rawMarkdown, isLiveGemini) {
            const thinking = document.getElementById("tutorThinkingIndicator");
            const thread = document.getElementById("tutorChatThread");
            if (!thread) return;

            const formattedHtml = formatTutorMarkdown(rawMarkdown);
            const sourceBadge = isLiveGemini
                ? `<span style="font-size: 0.62rem; color: var(--accent-green); margin-left: 6px;">● Gemini Live</span>`
                : `<span style="font-size: 0.62rem; color: var(--accent-cyan); margin-left: 6px;">● Offline Tutor</span>`;

            const replyDiv = document.createElement("div");
            replyDiv.className = "chat-msg msg-ai";
            replyDiv.innerHTML = `
                <div class="msg-avatar">🤖</div>
                <div class="msg-bubble">
                    <div class="msg-author">AI Tutor ${sourceBadge}</div>
                    <div class="msg-body">${formattedHtml}</div>
                </div>
            `;

            if (thinking) {
                thinking.replaceWith(replyDiv);
            } else {
                thread.appendChild(replyDiv);
            }

            thread.scrollTop = thread.scrollHeight;
        }

        async function handleTutorSubmit(questionOverride) {
            const input = document.getElementById("tutorQuestionInput");
            const sendBtn = document.getElementById("tutorSendBtn");

            const q = (questionOverride !== undefined)
                ? questionOverride.trim()
                : (input ? input.value.trim() : "");

            if (!q || isTutorThinking) return;

            if (input && questionOverride === undefined) {
                input.value = "";
            }

            // Append user message
            appendTutorUserMsg(q);
            tutorChatHistory.push({ role: "user", content: q });

            // Show thinking
            isTutorThinking = true;
            if (sendBtn) sendBtn.disabled = true;
            appendTutorThinking();

            const ctx = getLiveSimulationContext();
            const apiKey = getActiveApiKey();
            let aiReply = "";
            let isLive = false;

            if (apiKey) {
                try {
                    aiReply = await callGeminiApiForTutor(apiKey, q, ctx);
                    isLive = true;
                    updateAiBadge("gemini");
                } catch (geminiErr) {
                    console.warn("[AI Tutor] Direct Gemini error, falling back to backend or offline:", geminiErr.message);
                }
            }

            // If no user-entered key or direct call failed, query backend / Vercel API
            if (!aiReply) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 6000);
                    const resp = await fetch("/api/chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            message: q,
                            simulatorContext: ctx,
                            history: tutorChatHistory.slice(-4)
                        }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data && data.reply) {
                            aiReply = data.reply;
                            isLive = data.mode === "gemini" || data.mode === "openai";
                            updateAiBadge(isLive ? "gemini" : "offline");
                        }
                    }
                } catch (apiErr) {
                    // Backend unavailable or offline; proceed to built-in engine
                }
            }

            // High-yield offline fallback if neither direct key nor backend responded
            if (!aiReply) {
                aiReply = generateOfflineTutorResponse(q, ctx);
                updateAiBadge("offline");
            }

            replaceTutorThinkingWithAnswer(aiReply, isLive);
            tutorChatHistory.push({ role: "assistant", content: aiReply });

            isTutorThinking = false;
            if (sendBtn) sendBtn.disabled = false;
            if (input) input.focus();
        }

        function setupAiTutor() {
            const modal = document.getElementById("aiTutorModal");
            const openBtn = document.getElementById("aiTutorBtn");
            const closeBtn = document.getElementById("closeTutorModalBtn");
            const toggleKeyBtn = document.getElementById("toggleApiKeyBtn");
            const keyDrawer = document.getElementById("apiKeyConfigDrawer");
            const keyInput = document.getElementById("geminiApiKeyInput");
            const saveKeyBtn = document.getElementById("saveApiKeyBtn");
            const clearKeyBtn = document.getElementById("clearApiKeyBtn");
            const sendBtn = document.getElementById("tutorSendBtn");
            const input = document.getElementById("tutorQuestionInput");
            const chips = document.querySelectorAll(".prompt-chip");

            // Open Modal
            if (openBtn && modal) {
                openBtn.addEventListener("click", () => {
                    modal.style.display = "flex";
                    updateAiBadge(getActiveApiKey() ? "gemini" : "offline");
                    if (input) {
                        setTimeout(() => input.focus(), 150);
                    }
                });
            }

            // Close Modal
            if (closeBtn && modal) {
                closeBtn.addEventListener("click", () => {
                    modal.style.display = "none";
                });
            }

            if (modal) {
                modal.addEventListener("click", (e) => {
                    if (e.target === modal) modal.style.display = "none";
                });
            }

            window.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && modal && modal.style.display !== "none") {
                    modal.style.display = "none";
                }
            });

            // Toggle API Key Drawer
            if (toggleKeyBtn && keyDrawer) {
                toggleKeyBtn.addEventListener("click", () => {
                    const isHidden = keyDrawer.style.display === "none";
                    keyDrawer.style.display = isHidden ? "flex" : "none";
                    if (isHidden && keyInput) {
                        const curKey = localStorage.getItem(GEMINI_CONFIG.STORAGE_KEY) || "";
                        keyInput.value = curKey;
                        keyInput.focus();
                    }
                });
            }

            // Save API Key
            if (saveKeyBtn && keyInput) {
                saveKeyBtn.addEventListener("click", () => {
                    const val = keyInput.value.trim();
                    if (val) {
                        localStorage.setItem(GEMINI_CONFIG.STORAGE_KEY, val);
                        updateAiBadge("gemini");
                        if (keyDrawer) keyDrawer.style.display = "none";
                        alert("Gemini API Key saved successfully! AI Tutor is now in Live mode.");
                    } else {
                        alert("Please enter a valid Gemini API key first.");
                    }
                });
            }

            // Clear API Key
            if (clearKeyBtn && keyInput) {
                clearKeyBtn.addEventListener("click", () => {
                    localStorage.removeItem(GEMINI_CONFIG.STORAGE_KEY);
                    keyInput.value = "";
                    updateAiBadge("offline");
                    alert("API Key cleared. AI Tutor will use built-in offline knowledge base.");
                });
            }

            // Send Question on Button Click
            if (sendBtn) {
                sendBtn.addEventListener("click", () => handleTutorSubmit());
            }

            // Send Question on Enter Key (Shift+Enter for newline if multiline)
            if (input) {
                input.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleTutorSubmit();
                    }
                });
            }

            // Quick Prompt Chips
            chips.forEach(chip => {
                chip.addEventListener("click", () => {
                    const qText = chip.dataset.question || chip.textContent;
                    handleTutorSubmit(qText);
                });
            });

            // Initialize badge state
            updateAiBadge(getActiveApiKey() ? "gemini" : "offline");
        }

        setupAiTutor();

        // ====================================================================
        // ZOOM TOPOLOGY MODAL CONTROLLER
        // ====================================================================

        function syncZoomSvg() {
            const mainSvg = document.getElementById("networkSvg");
            const zoomSvg = document.getElementById("zoomNetworkSvg");
            if (!mainSvg || !zoomSvg) return;

            zoomSvg.innerHTML = mainSvg.innerHTML;
            const vb = mainSvg.getAttribute("viewBox");
            if (vb) zoomSvg.setAttribute("viewBox", vb);

            setupZoomNodeInteractions();
            setupZoomLinkInteractions();
        }

        function setupZoomLinkInteractions() {
            const zoomSvg = document.getElementById("zoomNetworkSvg");
            if (!zoomSvg) return;

            links.forEach(l => {
                const g = zoomSvg.querySelector(`#linkItem-${l.id}`);
                if (g) {
                    g.onclick = (e) => {
                        e.stopPropagation();
                        toggleLinkState(l.id);
                    };
                }
            });
        }

        function setupZoomNodeInteractions() {
            const zoomSvg = document.getElementById("zoomNetworkSvg");
            const tooltip = document.getElementById("zoomHoverTooltip");
            if (!zoomSvg) return;

            Object.keys(nodes).forEach(nodeId => {
                const g = zoomSvg.querySelector(`#nodeGroup-${nodeId}`);
                if (!g) return;

                g.onclick = (e) => {
                    e.stopPropagation();
                    sound.init();
                    if (nodes[nodeId].status === "ACTIVE") {
                        failRouter(nodeId);
                    } else {
                        nodes[nodeId].status = "ACTIVE";
                        sound.playSuccess();
                        addLogStep(simState.currentHopIndex, nodeId, "REPAIR", "ACTIVE", `Node ${nodeId} hardware repaired.`, "success");
                        handleTopologyUpdate();
                    }
                    syncZoomSvg();
                    updateZoomTelemetry();
                };

                if (tooltip) {
                    g.onmouseenter = () => {
                        const n = nodes[nodeId];
                        if (!n) return;
                        tooltip.innerHTML = `
                            <strong>${n.name || nodeId}</strong><br>
                            <span>IP: ${n.ip || 'DHCP'}</span><br>
                            <span>Role: ${n.role || 'Router'}</span><br>
                            <span style="color: ${n.status === 'ACTIVE' ? 'var(--accent-green)' : 'var(--accent-red)'}">Status: ${n.status}</span>
                        `;
                        tooltip.style.display = "block";
                    };
                    g.onmousemove = (e) => {
                        const vp = document.getElementById("zoomCanvasViewport");
                        if (!vp) return;
                        const rect = vp.getBoundingClientRect();
                        tooltip.style.left = `${e.clientX - rect.left + 14}px`;
                        tooltip.style.top = `${e.clientY - rect.top + 14}px`;
                    };
                    g.onmouseleave = () => {
                        tooltip.style.display = "none";
                    };
                }
            });
        }

        function updateZoomTelemetry() {
            const stepNum = document.getElementById("zoomStepBadgeNum");
            const statusChip = document.getElementById("zoomStatusChip");
            const routeText = document.getElementById("zoomActiveRouteText");
            const costText = document.getElementById("zoomActiveCostText");

            if (stepNum) stepNum.textContent = simState.currentHopIndex || 0;
            if (routeText) {
                routeText.textContent = stats.activeRoute ? stats.activeRoute.join(" → ") : "Unreachable (No Path)";
            }
            if (costText) {
                costText.textContent = (stats.activeCost !== null && stats.activeCost !== Infinity) ? stats.activeCost : "∞";
            }
            if (statusChip) {
                if (simState.isComplete) {
                    statusChip.className = "telemetry-chip healthy";
                    statusChip.textContent = "✓ DELIVERED";
                } else if (stats.isPartitioned) {
                    statusChip.className = "telemetry-chip failed";
                    statusChip.textContent = "UNREACHABLE";
                } else if (nodes.R2 && nodes.R2.status === "FAILED") {
                    statusChip.className = "telemetry-chip degraded";
                    statusChip.textContent = "FAILOVER";
                } else {
                    statusChip.className = "telemetry-chip healthy";
                    statusChip.textContent = "HEALTHY";
                }
            }
        }

        function setupZoomModal() {
            const modal = document.getElementById("zoomTopologyModal");
            const openBtn = document.getElementById("zoomViewBtn");
            const closeBtn = document.getElementById("closeZoomModalBtn");
            const startBtn = document.getElementById("zoomStartSimBtn");
            const nextBtn = document.getElementById("zoomNextStepBtn");
            const prevBtn = document.getElementById("zoomPrevStepBtn");
            const resetBtn = document.getElementById("zoomResetSimBtn");

            function isZoomOpen() {
                return modal && modal.style.display === "flex";
            }

            function openZoom() {
                if (!modal) return;
                modal.style.display = "flex";
                syncZoomSvg();
                updateZoomTelemetry();
            }

            function closeZoom() {
                if (!modal) return;
                modal.style.display = "none";
                const tooltip = document.getElementById("zoomHoverTooltip");
                if (tooltip) tooltip.style.display = "none";
            }

            if (openBtn) openBtn.addEventListener("click", openZoom);
            if (closeBtn) closeBtn.addEventListener("click", closeZoom);
            if (modal) {
                modal.addEventListener("click", (e) => {
                    if (e.target === modal) closeZoom();
                });
            }

            window.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && isZoomOpen()) {
                    closeZoom();
                }
            });

            // Control buttons inside zoom modal
            if (startBtn) {
                startBtn.addEventListener("click", () => {
                    sound.init();
                    initSimulation();
                    syncZoomSvg();
                    updateZoomTelemetry();
                });
            }

            if (nextBtn) {
                nextBtn.addEventListener("click", async () => {
                    sound.init();
                    await stepNextHop();
                    syncZoomSvg();
                    updateZoomTelemetry();
                });
            }

            if (prevBtn) {
                prevBtn.addEventListener("click", () => {
                    sound.init();
                    stepPrevHop();
                    syncZoomSvg();
                    updateZoomTelemetry();
                });
            }

            if (resetBtn) {
                resetBtn.addEventListener("click", () => {
                    sound.init();
                    resetSimulation();
                    syncZoomSvg();
                    updateZoomTelemetry();
                });
            }

            // MutationObserver on networkSvg to automatically keep zoomSvg synced
            const mainSvg = document.getElementById("networkSvg");
            if (mainSvg && window.MutationObserver) {
                const observer = new MutationObserver(() => {
                    if (isZoomOpen()) {
                        syncZoomSvg();
                        updateZoomTelemetry();
                    }
                });
                observer.observe(mainSvg, { childList: true, subtree: true, attributes: true });
            }
        }

        setupZoomModal();

        // Theme Toggle
        const themeBtn = document.getElementById("themeToggleBtn");
        const themeIcon = document.getElementById("themeIcon");
        const themeLabel = document.getElementById("themeLabel");
        themeBtn.addEventListener("click", () => {
            const isLight = document.body.classList.toggle("light-theme");
            document.body.classList.toggle("dark-theme", !isLight);
            themeIcon.textContent = isLight ? "🌙" : "☀️";
            themeLabel.textContent = isLight ? "Dark Mode" : "Light Mode";
        });
    }

    /* ========================================================================
       10. INITIALIZATION
       ======================================================================== */

    function init() {
        renderNodesDiagram();
        renderLinksDiagram();
        updateRouterSelectOptions();
        updateLinkSelectOptions();
        setupEventListeners();
        const res = dijkstra("PC", "Server");
        updateTopologyVisuals(res);
        addLogStep(0, "System", "START", "READY", "Network simulator initialized. Engine ready. Click 'Start Simulation' or 'Next Step' to step through.", "init");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();