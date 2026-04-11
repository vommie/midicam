import { Dialog } from './dialog.js';

export class MidiDiagnostics {
    constructor(options) {
        this.logger = options.logger;
        this.applyMidiSettings = options.applyMidiSettings;
        this.sendSyncData = options.sendSyncData;

        this.stats = {
            local: { ping: 0, jitter: 0, packetsSent: 0, packetsReceived: 0, packetLoss: 0, maxLatency: 0 },
            remote: { ping: 0, jitter: 0, packetsSent: 0, packetsReceived: 0, packetLoss: 0, maxLatency: 0 }
        };

        this.settings = {
            transport: 'webrtc_unordered',
            jitterBufferMs: 15,
            flushMode: 'immediate',
            syncIntervalMs: 2000
        };

        this.lastSeqReceived = -1;
        this.seqCounter = 0;
        this.pingTimestamps = new Map();

        this.midiLog =[];
        this.syncInterval = null;
        this.dialog = null;

        this.loadSettings();
        this.initButtonListener();
        this.startBackgroundSync();
    }

    loadSettings() {
        const saved = localStorage.getItem('midi_diagnostics_settings');
        if (saved) {
            try {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
                this.logger.info("MIDI diagnostic settings loaded from localStorage.");
            } catch(e) {
                this.logger.error("Failed parsing MIDI settings");
            }
        }
    }

    saveSettings() {
        localStorage.setItem('midi_diagnostics_settings', JSON.stringify(this.settings));
        this.applyMidiSettings(this.settings);
        this.logger.debug("MIDI diagnostic settings saved and applied.");
    }

    initButtonListener() {
        const btn = document.getElementById('showMidiDiagnosticsButton');
        if (btn) {
            btn.addEventListener('click', () => {
                if (this.dialog && this.dialog.element) {
                    this.dialog.close();
                } else {
                    this.showDialog();
                }
            });
        }
    }

    showDialog() {
        if (this.dialog && this.dialog.element) {
            return;
        }

        const btn = document.getElementById('showMidiDiagnosticsButton');
        if (btn) btn.classList.add('active');

        this.dialog = new Dialog({
            title: 'MIDI Diagnostics & Tuning',
            width: '750px',
            modal: false,
            body: this.getHTMLTemplate(),
            buttons:[
                { text: 'Export Report', className: 'primary', callback: () => this.exportReport() },
                { text: 'Close', callback: (dlg) => dlg.close() }
            ]
        });

        this.dialog.show();
        this.bindDOMListeners();
        this.updateJitterDisabledState();
        this.updateUIDisplay();

        this.dialog.options.onClose = () => {
            if (btn) btn.classList.remove('active');
            this.dialog = null;
        };
    }

    startBackgroundSync() {
        this.syncInterval = setInterval(() => {
            this.sendSyncData({ type: 'midi_diag_sync', stats: this.stats.local });
            if (this.dialog && this.dialog.element) {
                this.updateUIDisplay();
            }
        }, this.settings.syncIntervalMs);
    }

    getHTMLTemplate() {
        return `
            <div id="midi-diag-container" style="display: flex; flex-direction: column; gap: 15px;">
                <div style="background: #333; padding: 15px; border-radius: 6px;">
                    <h3 style="margin-top:0; color:#87ceeb; border-bottom: 1px solid #555; padding-bottom:5px;">
                        Outbound Transport Control
                    </h3>
                    <p style="font-size: 0.8rem; color: #aaa; margin-bottom: 15px;">
                        These settings dictate how YOUR client sends MIDI data to the peer. Your peer can use different settings.
                    </p>

                    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;"
                         title="Protocol determines the underlying network rule for your outgoing notes.">
                        <label style="width: 140px; cursor: help; border-bottom: 1px dotted #888;">Protocol:</label>
                        <select id="diag-transport" style="flex-grow:1;">
                            <option value="webrtc_unordered" title="UDP-like: Fastest method. Notes are fired and forgotten. Does not pause if a packet is lost. Best for preventing the rubber-band effect." ${this.settings.transport === 'webrtc_unordered' ? 'selected' : ''}>WebRTC UDP-like (Best for Time)</option>
                            <option value="webrtc_ordered" title="TCP-like: Guarantees delivery and order. If a note gets lost, the stream halts until it is re-sent, causing rubber-banding." ${this.settings.transport === 'webrtc_ordered' ? 'selected' : ''}>WebRTC TCP-like (Best for Reliability)</option>
                            <option value="websocket" title="Uses the signaling server to relay notes instead of P2P. Very slow, only use if WebRTC fails." ${this.settings.transport === 'websocket' ? 'selected' : ''}>WebSocket (Fallback Relay)</option>
                        </select>
                    </div>

                    <div id="jitter-container" style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px; transition: opacity 0.2s;"
                         title="Jitter Buffer: Adds an artificial delay to incoming notes to smooth out irregular network arrivals. Only available and useful for UDP.">
                        <label style="width: 140px; cursor: help; border-bottom: 1px dotted #888;">Jitter Buffer:</label>
                        <input type="range" id="diag-jitter" min="0" max="1000" value="${this.settings.jitterBufferMs}" style="flex-grow:1;">
                        <span id="diag-jitter-val" style="width:55px; text-align:right; font-family: monospace;">${this.settings.jitterBufferMs}ms</span>
                    </div>

                    <div style="display: flex; gap: 10px; align-items: center;"
                         title="Send Mode: How fast your browser dispatches the network packets.">
                        <label style="width: 140px; cursor: help; border-bottom: 1px dotted #888;">Send Mode:</label>
                        <select id="diag-flush" style="flex-grow:1;">
                            <option value="immediate" title="Dispatches the note instantly. Provides the absolute lowest latency but increases CPU/Network packet overhead." ${this.settings.flushMode === 'immediate' ? 'selected' : ''}>Immediate (Lowest Latency)</option>
                            <option value="batch" title="Bundles notes played in the exact same millisecond (like chords) into one packet. Slightly higher latency, highly efficient." ${this.settings.flushMode === 'batch' ? 'selected' : ''}>Microtask Batch (High Throughput)</option>
                        </select>
                    </div>
                </div>

                <div style="display: flex; gap: 15px;">
                    <div style="flex: 1; background: #252525; padding: 10px; border-radius: 6px; border: 1px solid #444;">
                        <h4 style="margin:0 0 10px 0; color:#4CAF50;">Local Metrics</h4>
                        <div style="font-family: monospace; font-size: 0.9rem; color: #ccc; display: grid; gap: 4px;">
                            <div title="Round Trip Time (RTT). Time for a signal to go to the peer and back. Ideal: < 40ms."><span style="border-bottom: 1px dotted #666; cursor:help;">Ping (RTT):</span> <span id="local-ping" style="float:right;">0 ms</span></div>
                            <div title="Variance in Ping. If ping fluctuates wildly, jitter is high. Causes rubber-banding. Ideal: < 5ms."><span style="border-bottom: 1px dotted #666; cursor:help;">Jitter:</span> <span id="local-jitter" style="float:right;">0 ms</span></div>
                            <div title="Percentage of lost data. UDP allows this. TCP hides it by pausing the stream. Ideal: 0%"><span style="border-bottom: 1px dotted #666; cursor:help;">Packet Loss:</span> <span id="local-loss" style="float:right;">0 %</span></div>
                            <div>Sent Packets: <span id="local-sent" style="float:right;">0</span></div>
                            <div>Received Packets: <span id="local-recv" style="float:right;">0</span></div>
                        </div>
                    </div>
                    <div style="flex: 1; background: #252525; padding: 10px; border-radius: 6px; border: 1px solid #444;">
                        <h4 style="margin:0 0 10px 0; color:#9D1919;">Peer Metrics</h4>
                        <div style="font-family: monospace; font-size: 0.9rem; color: #ccc; display: grid; gap: 4px;">
                            <div title="Peer's Round Trip Time to you."><span style="border-bottom: 1px dotted #666; cursor:help;">Ping (RTT):</span> <span id="remote-ping" style="float:right;">0 ms</span></div>
                            <div title="Variance in latency experienced by the peer."><span style="border-bottom: 1px dotted #666; cursor:help;">Jitter:</span> <span id="remote-jitter" style="float:right;">0 ms</span></div>
                            <div title="Data lost on the way to the peer."><span style="border-bottom: 1px dotted #666; cursor:help;">Packet Loss:</span> <span id="remote-loss" style="float:right;">0 %</span></div>
                            <div>Sent Packets: <span id="remote-sent" style="float:right;">0</span></div>
                            <div>Received Packets: <span id="remote-recv" style="float:right;">0</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    bindDOMListeners() {
        const transEl = document.getElementById('diag-transport');
        const jitterEl = document.getElementById('diag-jitter');
        const jitterVal = document.getElementById('diag-jitter-val');
        const flushEl = document.getElementById('diag-flush');

        transEl.onchange = () => {
            this.settings.transport = transEl.value;
            this.updateJitterDisabledState();
            this.saveSettings();
        };
        flushEl.onchange = () => {
            this.settings.flushMode = flushEl.value;
            this.saveSettings();
        };
        jitterEl.oninput = () => {
            this.settings.jitterBufferMs = parseInt(jitterEl.value);
            jitterVal.textContent = `${this.settings.jitterBufferMs}ms`;
            this.saveSettings();
        };
    }

    updateJitterDisabledState() {
        const jitterEl = document.getElementById('diag-jitter');
        const container = document.getElementById('jitter-container');
        if (!jitterEl || !container) return;

        const isUDP = this.settings.transport === 'webrtc_unordered';
        jitterEl.disabled = !isUDP;

        if (!isUDP) {
            container.style.opacity = '0.4';
            container.title = "Disabled: Jitter buffering is only useful and active when using UDP-like transport. TCP inherently blocks and buffers data on the OS level.";
        } else {
            container.style.opacity = '1';
            container.title = "Jitter Buffer: Adds an artificial delay to incoming notes to smooth out irregular network arrivals. Only available and useful for UDP.";
        }
    }

    getEffectiveJitter() {
        if (this.settings.transport !== 'webrtc_unordered') return 0;
        return this.settings.jitterBufferMs;
    }

    startSync() {
        this.updateUIDisplay();
        this.syncInterval = setInterval(() => {
            this.sendSyncData({ type: 'midi_diag_sync', stats: this.stats.local });
            this.updateUIDisplay();
        }, this.settings.syncIntervalMs);
    }

    stopSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    handleRemoteSync(remoteStats) {
        this.stats.remote = remoteStats;
        this.updateUIDisplay();
    }

    updateUIDisplay() {
        if(!document.getElementById('local-ping')) return;
        document.getElementById('local-ping').textContent = `${this.stats.local.ping.toFixed(1)} ms`;
        document.getElementById('local-jitter').textContent = `${this.stats.local.jitter.toFixed(2)} ms`;
        document.getElementById('local-loss').textContent = `${this.stats.local.packetLoss.toFixed(2)} %`;
        document.getElementById('local-sent').textContent = this.stats.local.packetsSent;
        document.getElementById('local-recv').textContent = this.stats.local.packetsReceived;

        document.getElementById('remote-ping').textContent = `${this.stats.remote.ping.toFixed(1)} ms`;
        document.getElementById('remote-jitter').textContent = `${this.stats.remote.jitter.toFixed(2)} ms`;
        document.getElementById('remote-loss').textContent = `${this.stats.remote.packetLoss.toFixed(2)} %`;
        document.getElementById('remote-sent').textContent = this.stats.remote.packetsSent;
        document.getElementById('remote-recv').textContent = this.stats.remote.packetsReceived;
    }

    trackSend() {
        this.stats.local.packetsSent++;
        return this.seqCounter++;
    }

    trackReceive(sendTimestamp, seq) {
        this.stats.local.packetsReceived++;

        if (this.lastSeqReceived !== -1) {
            const expected = this.lastSeqReceived + 1;
            if (seq > expected) {
                const lost = seq - expected;
                this.stats.local.packetLoss = ((this.stats.local.packetLoss * 99) + (lost * 100)) / 100;
                this.logDebug(`Packet loss detected. Expected ${expected}, got ${seq}`);
            } else if (seq < this.lastSeqReceived) {
                this.logDebug(`Out of order packet received. Got ${seq}, expected > ${this.lastSeqReceived}`);
            } else {
                this.stats.local.packetLoss = this.stats.local.packetLoss * 0.99;
            }
        }
        if (seq > this.lastSeqReceived) this.lastSeqReceived = seq;

        const receiveTime = performance.now();
        const transitTime = receiveTime - sendTimestamp;

        if (this.lastTransitTime !== undefined) {
            const d = transitTime - this.lastTransitTime;
            this.stats.local.jitter = this.stats.local.jitter + (Math.abs(d) - this.stats.local.jitter) / 16;
        }
        this.lastTransitTime = transitTime;
    }

    measurePing(sendFunc) {
        const id = Math.random().toString(36).substring(7);
        this.pingTimestamps.set(id, performance.now());
        sendFunc({ type: 'ping', id });
    }

    handlePingReply(id) {
        const sendTime = this.pingTimestamps.get(id);
        if (sendTime) {
            const rtt = performance.now() - sendTime;
            this.stats.local.ping = (this.stats.local.ping * 0.8) + (rtt * 0.2);
            this.pingTimestamps.delete(id);
        }
    }

    logDebug(msg) {
        const line = `[${new Date().toISOString()}] ${msg}`;
        this.midiLog.push(line);
        if (this.midiLog.length > 2000) this.midiLog.shift();
        this.logger.debug(`[MIDI-DIAG] ${msg}`);
    }

    exportReport() {
        const lines =[
            `MidiCam Diagnostics Report - ${new Date().toLocaleString()}`,
            `=============================================================`,
            `SETTINGS:`,
            JSON.stringify(this.settings, null, 2),
            `\nLOCAL STATS:`,
            JSON.stringify(this.stats.local, null, 2),
            `\nREMOTE STATS:`,
            JSON.stringify(this.stats.remote, null, 2),
            `\nLOGS:`
        ];

        const blob = new Blob([lines.join('\n') + '\n' + this.midiLog.join('\n')], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `midicam_diagnostic_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}
