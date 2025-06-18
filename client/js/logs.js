import { Dialog } from './dialog.js';

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
        this.currentSearchTerm = '';
        this.currentLevelFilter = 'all';

        this.logLevels = { 'error': 4, 'warn': 3, 'info': 2, 'debug': 1 };
        this.verbosityLevel = 'info'; // Default verbosity

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
                        <label for="log-verbosity-level" class="log-verbosity-label">Log Level:</label>
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
            const newLevel = this.verbositySelector.value;
            const oldLevel = this.verbosityLevel;

            if (newLevel === 'debug') {
                new Dialog({
                    title: 'Performance Warning',
                    body: `
                        <p>Enabling the "Debug" log level can generate a very high volume of log entries.</p>
                        <p>This may negatively impact application performance, especially affecting real-time operations like MIDI processing, and could lead to high CPU usage.</p>
                        <p><strong>Are you sure you want to proceed?</strong></p>
                    `,
                    width: '550px',
                    buttons: [
                        {
                            text: 'Cancel',
                            callback: (dialog) => {
                                this.verbositySelector.value = oldLevel;
                                dialog.close();
                            }
                        },
                        {
                            text: 'Proceed',
                            className: 'danger',
                            callback: (dialog) => {
                                this.verbosityLevel = newLevel;
                                this._saveSettings();
                                dialog.close();
                            }
                        }
                    ],
                    onClose: (reason) => {
                        if (this.verbositySelector.value === 'debug' && this.verbosityLevel !== 'debug') {
                             this.verbositySelector.value = oldLevel;
                        }
                    }
                }).show();
            } else {
                this.verbosityLevel = newLevel;
                this._saveSettings();
            }
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

    _applyFilters() {
        this.allEntries.forEach(entry => {
            const searchMatch = entry.message.toLowerCase().includes(this.currentSearchTerm);
            const levelMatch = this.currentLevelFilter === 'all' || entry.level === this.currentLevelFilter;

            if (searchMatch && levelMatch) {
                entry.element.classList.remove('hidden');
            } else {
                entry.element.classList.add('hidden');
            }
        });
    }

    _exportLogs() {
        const header = `MidiCam Log Export - ${new Date().toLocaleString()}\n==================================================\n\n`;

        const logContent = this.allEntries.map(entry => {
            const timestamp = entry.timestamp.toISOString();
            const level = entry.level.toUpperCase().padEnd(7, ' ');
            return `[${timestamp}] [${level}] ${entry.message}`;
        }).join('\n');

        const blob = new Blob([header + logContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `midicam_${date}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    _add(level, message) {
        if (this.logLevels[level] < this.logLevels[this.verbosityLevel]) {
            return;
        }

        if (!this.logContainer) {
            console[level === 'error' ? 'error' : 'log'](`[${level.toUpperCase()}] ${message}`);
            return;
        }

        const isScrolledToBottom = this.logContainer.scrollHeight - this.logContainer.scrollTop <= this.logContainer.clientHeight + 20;

        const timestamp = new Date();
        const entryElement = document.createElement('div');
        entryElement.className = `log-entry ${level}`;

        const displayedTimestamp = timestamp.toLocaleTimeString('de-DE', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        entryElement.innerHTML = `
            <span class="timestamp">${displayedTimestamp}</span>
            <span class="level">${level.toUpperCase()}</span>
            <span class="message">${message}</span>
        `;

        this.allEntries.push({ level, message, timestamp, element: entryElement });

        const searchMatch = message.toLowerCase().includes(this.currentSearchTerm);
        const levelMatch = this.currentLevelFilter === 'all' || level === this.currentLevelFilter;
        if (!searchMatch || !levelMatch) {
            entryElement.classList.add('hidden');
        }

        this.logContainer.appendChild(entryElement);

        if (isScrolledToBottom) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
    }

    info(message) {
        this._add('info', message);
    }

    warn(message) {
        this._add('warn', message);
    }

    debug(message) {
        this._add('debug', message);
    }

    error(message) {
        this._add('error', message);
    }
}
