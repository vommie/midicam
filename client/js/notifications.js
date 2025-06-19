export class Notifications {
    constructor(options) {
        this.logger = options.logger || console;
        this.defaults = {
            position: 'ne', // nw, n, ne, e, se, s, sw, w, center
            title: null,
            text: 'Notification text is missing.',
            icon: 'info', // info, warn, error, chat, help
            duration: 5000, // in ms
            showProgress: true,
            sound: false,
            html: true, // Allow HTML in text
        };

        this.icons = {
            info: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
            warn: '<svg viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
            error: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
            chat: '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>',
            help: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>',
        };
        this.notificationSound = new Audio('assets/notification.wav');

        this._createWrapper();
        this.logger.info('Notification module initialized.');
    }

    _createWrapper() {
        this.wrapper = document.createElement('div');
        this.wrapper.id = 'notification-wrapper';

        const positions = ['nw', 'n', 'ne', 'w', 'center', 'e', 'sw', 's', 'se'];
        this.containers = {};

        positions.forEach(pos => {
            const container = document.createElement('div');
            container.className = `notification-container pos-${pos}`;
            this.containers[pos] = container;
            this.wrapper.appendChild(container);
        });

        document.body.appendChild(this.wrapper);
    }

    show(userOptions = {}) {
        const options = { ...this.defaults, ...userOptions };

        const notificationEl = document.createElement('div');
        notificationEl.className = 'notification-item';

        if (options.icon && this.icons[options.icon]) {
            notificationEl.innerHTML += `<div class="notification-icon">${this.icons[options.icon]}</div>`;
            notificationEl.innerHTML += `<div class="notification-separator"></div>`;
        }

        const contentEl = document.createElement('div');
        contentEl.className = 'notification-content';

        if (options.title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'notification-title';
            titleEl.textContent = options.title;
            contentEl.appendChild(titleEl);
        }

        if (options.text) {
            const textContainer = document.createElement('div');
            textContainer.className = 'notification-text';

            if (options.text instanceof Node) {
                textContainer.appendChild(options.text);
            } else if (options.html) {
                textContainer.innerHTML = options.text;
            } else {
                textContainer.textContent = options.text;
            }
            contentEl.appendChild(textContainer);
        }

        notificationEl.appendChild(contentEl);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.title = 'Close notification';
        closeBtn.addEventListener('click', () => this._close(notificationEl));
        notificationEl.appendChild(closeBtn);

        if (options.duration && options.showProgress) {
            const progressEl = document.createElement('div');
            progressEl.className = 'notification-progress-bar';
            progressEl.style.animationDuration = `${options.duration}ms`;
            notificationEl.appendChild(progressEl);
        }

        notificationEl.classList.add('fade-in');

        const container = this.containers[options.position] || this.containers.ne;
        container.appendChild(notificationEl);

        if (options.duration) {
            notificationEl.closeTimer = setTimeout(() => {
                this._close(notificationEl);
            }, options.duration);
        }

        if (options.sound) {
            this.notificationSound.play().catch(e => this.logger.error("Error playing notification sound:", e));
        }

        const logText = typeof options.text === 'string' ? options.text.substring(0, 20) : '[DOM Element]';
        this.logger.debug(`Notification shown: "${options.title || logText}"`);
    }

    _close(notificationEl) {
        if (!notificationEl || !notificationEl.parentNode) return;

        clearTimeout(notificationEl.closeTimer);
        notificationEl.classList.remove('fade-in');
        notificationEl.classList.add('fade-out');

        setTimeout(() => {
            notificationEl.remove();
        }, 300);
    }
}
