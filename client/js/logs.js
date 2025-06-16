export class Log {
    constructor(options) {
        this.toggleButton = document.querySelector(options.toggleButtonSelector);
        this.modalElement = document.getElementById('log-modal');
        this.closeButton = document.getElementById('log-modal-close');
        this.logContainer = document.getElementById('log-container');

        if (!this.toggleButton || !this.modalElement || !this.closeButton || !this.logContainer) {
            console.error('Log UI elements not found. Logging will be to console only.');
            this.info = console.info;
            this.debug = console.log;
            this.error = console.error;
            return;
        }

        this.isVisible = false;
        this._initEventListeners();
    }

    _initEventListeners() {
        this.toggleButton.addEventListener('click', () => this.toggle());
        this.closeButton.addEventListener('click', () => this.hide());
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.hide();
            }
        });
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

    _add(level, message) {
        const isScrolledToBottom = this.logContainer.scrollHeight - this.logContainer.scrollTop <= this.logContainer.clientHeight + 20;

        const entry = document.createElement('div');
        entry.className = `log-entry ${level}`;

        const timestamp = new Date().toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        entry.innerHTML = `
            <span class="timestamp">${timestamp}</span>
            <span class="level">${level.toUpperCase()}</span>
            <span class="message">${message}</span>
        `;

        this.logContainer.appendChild(entry);

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
