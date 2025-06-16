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

        if (!this.toggleButton || !this.modalElement) {
            console.error('Log UI elements could not be created or found. Logging will be to console only.');
            this.info = console.info;
            this.debug = console.log;
            this.error = console.error;
            return;
        }

        this.isVisible = false;
        this.allEntries = [];
        this.currentSearchTerm = '';
        this.currentLevelFilter = 'all';

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

        this.exportButton.addEventListener('click', () => this._exportLogs());
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

    debug(message) {
        this._add('debug', message);
    }

    error(message) {
        this._add('error', message);
    }
}
