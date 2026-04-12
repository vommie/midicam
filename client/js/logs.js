export class Log {
    constructor(options) {
        this.toggleButton = document.querySelector(options.toggleButtonSelector);
        this._createModal();

        this.modalElement = document.getElementById('log-modal');
        this.closeButton = document.getElementById('log-modal-close');
        this.logContainer = document.getElementById('log-container');
        this.searchInput = document.getElementById('log-search-input');
        this.levelFilter = document.getElementById('log-level-filter');
        this.exportButton = document.getElementById('log-export-btn');
        this.verbositySelector = document.getElementById('log-verbosity-level');

        if (!this.toggleButton || !this.modalElement) {
            console.error('Log UI elements could not be created or found. Logging will be to console only.');
            this.info = console.info;
            this.warn = console.warn;
            this.debug = console.log;
            this.error = console.error;
            return;
        }

        this.isVisible = false;

        this.allEntries = [];
        this.maxEntries = 50000;
        this.maxVisibleEntries = 1000;

        this.currentSearchTerm = '';
        this.currentLevelFilter = 'all';

        this.logLevels = { 'error': 4, 'warn': 3, 'info': 2, 'debug': 1 };
        this.verbosityLevel = 'info';

        this.pendingLogs = [];
        this.logUpdateQueued = false;

        this._loadSettings();
        this._initEventListeners();
    }

    _createModal() {
        if (document.getElementById('log-modal')) return;

        const modalHTML = `
            <div id="log-modal" class="log-modal-overlay hidden">
                <div class="log-modal-content">
                    <div class="log-modal-header">
                        <h2>Log</h2>
                        <button id="log-modal-close" class="log-modal-close-btn" title="Close Log">×</button>
                    </div>
                    <div class="log-modal-controls">
                        <input type="text" id="log-search-input" class="log-search-input" placeholder="Search logs...">
                        <select id="log-level-filter" class="log-level-filter">
                            <option value="all">All Levels</option>
                            <option value="error">Error</option>
                            <option value="warn">Warn</option>
                            <option value="info">Info</option>
                            <option value="debug">Debug</option>
                        </select>
                        <label for="log-verbosity-level" class="log-verbosity-label">Min. Level:</label>
                        <select id="log-verbosity-level" class="log-level-filter">
                            <option value="error">Error</option>
                            <option value="warn">Warn</option>
                            <option value="info">Info</option>
                            <option value="debug">Debug</option>
                        </select>
                        <button id="log-export-btn" class="log-export-btn">Export Log</button>
                    </div>
                    <div id="log-container" class="log-container"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    _initEventListeners() {
        this.toggleButton.addEventListener('click', () => this.toggle());
        this.closeButton.addEventListener('click', () => this.hide());
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.hide();
            }
        });

        this.searchInput.addEventListener('input', () => {
            this.currentSearchTerm = this.searchInput.value.toLowerCase();
            this._applyFilters();
        });

        this.levelFilter.addEventListener('change', () => {
            this.currentLevelFilter = this.levelFilter.value;
            this._applyFilters();
        });

        this.verbositySelector.addEventListener('change', () => {
            this.verbosityLevel = this.verbositySelector.value;
            this._saveSettings();
            this._applyFilters();
        });

        this.exportButton.addEventListener('click', () => this._exportLogs());
    }

    _loadSettings() {
        const settings = localStorage.getItem('log_settings');
        if (settings) {
            const parsed = JSON.parse(settings);
            this.verbosityLevel = parsed.verbosity || 'info';
        }
        this.verbositySelector.value = this.verbosityLevel;
    }

    _saveSettings() {
        const settings = { verbosity: this.verbosityLevel };
        localStorage.setItem('log_settings', JSON.stringify(settings));
    }

    show() {
        if (this.isVisible) return;
        this.isVisible = true;
        this.toggleButton.classList.add('active');
        this.modalElement.classList.remove('hidden');
        this._applyFilters();
    }

    hide() {
        if (!this.isVisible) return;
        this.isVisible = false;
        this.toggleButton.classList.remove('active');
        this.modalElement.classList.add('hidden');
    }

    toggle() {
        this.isVisible ? this.hide() : this.show();
    }

    _escapeHTML(str) {
        return String(str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag]));
    }

    _applyFilters() {
        if (!this.logContainer || !this.isVisible) return;

        const filtered = this.allEntries.filter(entry => {
            if (this.logLevels[entry.level] < this.logLevels[this.verbosityLevel]) return false;
            if (this.currentLevelFilter !== 'all' && entry.level !== this.currentLevelFilter) return false;
            if (this.currentSearchTerm && !entry.message.toLowerCase().includes(this.currentSearchTerm)) return false;
            return true;
        });

        const toRender = filtered.slice(-this.maxVisibleEntries);
        let htmlChunk = '';
        toRender.forEach(entry => {
            const timeStr = entry.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
            htmlChunk += `<div class="log-entry ${entry.level}"><span class="timestamp">${timeStr}</span><span class="level">${entry.level.toUpperCase()}</span><span class="message">${this._escapeHTML(entry.message)}</span></div>`;
        });

        this.logContainer.innerHTML = htmlChunk;
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    _exportLogs() {
        const date = new Date();
        const header = `MidiCam Log Export - ${date.toLocaleString()}\n==================================================\n\n`;

        const logContent = this.allEntries.map(entry => {
            const timestamp = entry.timestamp.toISOString();
            const level = entry.level.toUpperCase().padEnd(7, ' ');
            return `[${timestamp}] [${level}] ${entry.message}`;
        }).join('\n');

        const blob = new Blob([header + logContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        const dateTime = date.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
        a.href = url;
        a.download = `midicam_${dateTime}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    _add(level, message) {
        if (level === 'error') console.error(`[${level.toUpperCase()}] ${message}`);
        else if (level === 'warn') console.warn(`[${level.toUpperCase()}] ${message}`);
        else if (level === 'info') console.info(`[${level.toUpperCase()}] ${message}`);
        else console.log(`[${level.toUpperCase()}] ${message}`);

        const entry = {
            level,
            message,
            timestamp: new Date()
        };

        this.allEntries.push(entry);
        if (this.allEntries.length > this.maxEntries) {
            this.allEntries.shift();
        }

        if (!this.isVisible) return;

        if (this.logLevels[level] < this.logLevels[this.verbosityLevel]) return;
        if (this.currentLevelFilter !== 'all' && level !== this.currentLevelFilter) return;
        if (this.currentSearchTerm && !message.toLowerCase().includes(this.currentSearchTerm)) return;

        this.pendingLogs.push(entry);

        if (!this.logUpdateQueued) {
            this.logUpdateQueued = true;
            requestAnimationFrame(() => this._flushLogs());
        }
    }

    _flushLogs() {
        this.logUpdateQueued = false;

        if (!this.logContainer || !this.isVisible) {
            this.pendingLogs = [];
            return;
        }

        const isScrolledToBottom = this.logContainer.scrollHeight - this.logContainer.scrollTop <= this.logContainer.clientHeight + 20;

        let htmlChunk = '';
        this.pendingLogs.forEach(entry => {
            const timeStr = entry.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
            htmlChunk += `<div class="log-entry ${entry.level}"><span class="timestamp">${timeStr}</span><span class="level">${entry.level.toUpperCase()}</span><span class="message">${this._escapeHTML(entry.message)}</span></div>`;
        });

        if (htmlChunk) {
            this.logContainer.insertAdjacentHTML('beforeend', htmlChunk);
        }

        this.pendingLogs = [];
        if (this.logContainer.children.length > this.maxVisibleEntries) {
            const removeCount = this.logContainer.children.length - this.maxVisibleEntries;
            for (let i = 0; i < removeCount; i++) {
                this.logContainer.removeChild(this.logContainer.firstChild);
            }
        }

        if (isScrolledToBottom) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
    }

    info(message) { this._add('info', message); }
    warn(message) { this._add('warn', message); }
    debug(message) { this._add('debug', message); }
    error(message) { this._add('error', message); }
}
