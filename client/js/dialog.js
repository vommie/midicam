class DialogManager {
    constructor() {
        this.stack = [];
        this.container = null;
        this._createContainer();
    }

    _createContainer() {
        if (document.getElementById('dialog-container')) {
            this.container = document.getElementById('dialog-container');
            return;
        }
        this.container = document.createElement('div');
        this.container.id = 'dialog-container';
        document.body.appendChild(this.container);
    }

    push(dialogInstance) {
        if (this.stack.length > 0) {
            const topDialog = this.stack[this.stack.length - 1];
            topDialog.setInteractive(false);
        }
        this.stack.push(dialogInstance);

        if (dialogInstance.overlayElement) {
            this.container.appendChild(dialogInstance.overlayElement);
        }
        this.container.appendChild(dialogInstance.element);

        this._updateOverlay();
    }

    pop() {
        const poppedDialog = this.stack.pop();
        if (!poppedDialog) return null;

        if (poppedDialog.overlayElement && poppedDialog.overlayElement.parentNode === this.container) {
            this.container.removeChild(poppedDialog.overlayElement);
        }
        if (poppedDialog.element && poppedDialog.element.parentNode === this.container) {
            this.container.removeChild(poppedDialog.element);
        }

        if (this.stack.length > 0) {
            const topDialog = this.stack[this.stack.length - 1];
            topDialog.setInteractive(true);
        }
        this._updateOverlay();
        return poppedDialog;
    }

    peek() {
        return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
    }

    _updateOverlay() {
        const topDialog = this.peek();
        if (topDialog && topDialog.options.modal && !topDialog.overlayElement.classList.contains('visible')) {
             topDialog.overlayElement.classList.add('visible');
        } else if (!topDialog) {
            const overlays = this.container.querySelectorAll('.dialog-overlay.visible');
            overlays.forEach(o => o.classList.remove('visible'));
        }
    }

    closeAll() {
        while(this.peek()) {
            this.peek().destroy();
        }
    }
}

const dialogManager = new DialogManager();

export class Dialog {
    constructor(options = {}) {
        this.options = {
            title: '',
            body: '',
            buttons: [{ text: 'OK' }],
            showCloseButton: true,
            onClose: () => {},
            onOpen: () => {},
            width: '500px',
            height: 'auto',
            id: `dialog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            modal: true,
            closeOnOverlayClick: false,
            ...options
        };

        this.isDraggable = !this.options.modal;

        this.element = null;
        this.overlayElement = null;
        this._isInteractive = true;
        this._boundDragMove = null;
        this._boundDragEnd = null;
        this._create();
    }

    _create() {
        if (this.options.modal) {
            this.overlayElement = document.createElement('div');
            this.overlayElement.className = 'dialog-overlay';
        }

        this.element = document.createElement('div');
        this.element.className = 'dialog-wrapper';
        this.element.id = this.options.id;
        this.element.style.width = this.options.width;
        if (this.options.height !== 'auto') this.element.style.height = this.options.height;
        this.element.setAttribute('role', 'dialog');
        this.element.setAttribute('aria-modal', this.options.modal);
        if (this.options.title) this.element.setAttribute('aria-labelledby', `${this.options.id}-title`);

        let headerHTML = '';
        if (this.options.title || this.options.showCloseButton) {
            const headerClass = this.isDraggable ? 'dialog-header draggable' : 'dialog-header';
            headerHTML += `<div class="${headerClass}">`;
            if (this.options.title) {
                headerHTML += `<h2 id="${this.options.id}-title" class="dialog-title">${this.options.title}</h2>`;
            }
            if (this.options.showCloseButton) {
                headerHTML += `<button class="dialog-close-btn" aria-label="Close dialog" title="Close">×</button>`;
            }
            headerHTML += '</div>';
        }

        const bodyHTML = `<div class="dialog-body">${this.options.body}</div>`;

        let footerHTML = '';
        if (this.options.buttons && this.options.buttons.length > 0) {
            footerHTML += '<div class="dialog-footer">';
            this.options.buttons.forEach(btn => {
                const btnClass = `dialog-button ${btn.className || ''}`;
                const iconHTML = btn.icon ? `<svg viewBox="0 0 24 24">${btn.icon}</svg>` : '';
                footerHTML += `<button class="${btnClass}">${iconHTML}<span>${btn.text}</span></button>`;
            });
            footerHTML += '</div>';
        }

        this.element.innerHTML = headerHTML + bodyHTML + footerHTML;

        this._addEventListeners();
    }

    _addEventListeners() {
        if (this.options.showCloseButton) {
            this.element.querySelector('.dialog-close-btn').addEventListener('click', () => this.close('close-button'));
        }

        if (this.overlayElement && this.options.closeOnOverlayClick) {
             this.overlayElement.addEventListener('click', () => this.close('overlay-click'));
        }

        this.element.querySelectorAll('.dialog-button').forEach((buttonEl, index) => {
            const btnConfig = this.options.buttons[index];
            buttonEl.addEventListener('click', () => {
                if (btnConfig.callback) btnConfig.callback(this);
                else this.close(`button-click-${index}`);
            });
        });

        this.escapeKeyListener = (e) => {
             if (e.key === 'Escape' && this._isInteractive && this.options.showCloseButton) {
                this.close('escape-key');
            }
        };
        document.addEventListener('keydown', this.escapeKeyListener);

        if (this.isDraggable) {
            this._initDrag();
        }
    }

    _initDrag() {
        const header = this.element.querySelector('.dialog-header');
        if (!header) return;

        const dragStart = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();

            this.element.classList.add('is-dragging');

            const rect = this.element.getBoundingClientRect();
            this.element.style.top = `${rect.top}px`;
            this.element.style.left = `${rect.left}px`;
            this.element.style.transform = 'none';

            const initialX = e.clientX;
            const initialY = e.clientY;
            const initialLeft = rect.left;
            const initialTop = rect.top;

            this._boundDragMove = (moveEvent) => {
                const dx = moveEvent.clientX - initialX;
                const dy = moveEvent.clientY - initialY;
                this.element.style.left = `${initialLeft + dx}px`;
                this.element.style.top = `${initialTop + dy}px`;
            };

            this._boundDragEnd = () => {
                this.element.classList.remove('is-dragging');
                document.removeEventListener('mousemove', this._boundDragMove);
                document.removeEventListener('mouseup', this._boundDragEnd);
            };

            document.addEventListener('mousemove', this._boundDragMove);
            document.addEventListener('mouseup', this._boundDragEnd);
        };

        header.addEventListener('mousedown', dragStart);
    }

    show() {
        dialogManager.push(this);
        requestAnimationFrame(() => {
            if (this.overlayElement) this.overlayElement.classList.add('visible');
            this.element.classList.add('visible');
        });
        if (this.options.onOpen) this.options.onOpen(this);
        return this;
    }

    close(reason = 'programmatic') {
        const topDialog = dialogManager.peek();
        if (topDialog !== this) return;

        this.element.classList.remove('visible');
        if (this.overlayElement) this.overlayElement.classList.remove('visible');

        this.element.addEventListener('transitionend', () => this.destroy(), { once: true });

        if (this.options.onClose) this.options.onClose(reason);
    }

    destroy() {
        const wasPopped = dialogManager.pop();
        if (!wasPopped) return;

        document.removeEventListener('keydown', this.escapeKeyListener);
        if (this._boundDragMove) {
            document.removeEventListener('mousemove', this._boundDragMove);
            document.removeEventListener('mouseup', this._boundDragEnd);
        }

        this.element = null;
        this.overlayElement = null;
    }

    setInteractive(isInteractive) {
        this._isInteractive = isInteractive;
        this.element.style.pointerEvents = isInteractive ? 'auto' : 'none';

        if (!isInteractive) {
             this.element.style.filter = 'brightness(0.7)';
             this.element.setAttribute('aria-hidden', 'true');
        } else {
             this.element.style.filter = 'none';
             this.element.removeAttribute('aria-hidden');
        }
    }
}
