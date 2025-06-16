class FloatingWindow {
    constructor(options) {
        this.options = {
            container: document.body,
            stream: null,
            title: 'Stream',
            isClosable: true,
            initialWidth: 300,
            initialHeight: 200,
            initialRight: 20,
            initialTop: 20,
            id: `window-${Date.now()}`,
            ...options
        };

        this.isDragging = false;
        this.isResizing = false;
        this.startX = 0;
        this.startY = 0;
        this.startWidth = 0;
        this.startHeight = 0;
        this.startRight = 0;
        this.minVisiblePx = 20;

        this.createElement();
        this.addEventListeners();
        this.ensureWithinViewport();
    }

    createElement() {
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'floating-window-wrapper';
        this.wrapper.id = this.options.id;
        this.wrapper.style.width = this.options.initialWidth + 'px';
        this.wrapper.style.height = this.options.initialHeight + 'px';
        this.wrapper.style.right = this.options.initialRight + 'px';
        this.wrapper.style.top = this.options.initialTop + 'px';
        this.wrapper.setAttribute('tabindex', '0');
        this.wrapper.setAttribute('aria-label', `Floating window: ${this.options.title}. Use arrow keys to move.`);

        const header = document.createElement('div');
        header.className = 'floating-window-header';
        header.textContent = this.options.title;

        if (this.options.isClosable) {
            const closeButton = document.createElement('button');
            closeButton.className = 'floating-window-close';
            closeButton.innerHTML = '×';
            closeButton.title = 'Close';
            closeButton.onclick = () => this.destroy(true);
            header.appendChild(closeButton);
        }

        this.video = document.createElement('video');
        this.video.autoplay = true;
        this.video.muted = true; // All local previews are muted
        if (this.options.stream) {
            this.video.srcObject = this.options.stream;
        }

        this.resizeHandle = document.createElement('div');
        this.resizeHandle.className = 'floating-window-resize-handle';

        this.wrapper.appendChild(header);
        this.wrapper.appendChild(this.video);
        this.wrapper.appendChild(this.resizeHandle);

        this.options.container.appendChild(this.wrapper);
    }

    addEventListeners() {
        this.wrapper.addEventListener('mousedown', (e) => {
            // Only start dragging if the mousedown is on the header
            if (e.target.classList.contains('floating-window-header')) {
                this.isDragging = true;
                this.wrapper.style.cursor = 'move';
                const rect = this.wrapper.getBoundingClientRect();
                this.startX = (window.innerWidth - e.clientX) - parseInt(this.wrapper.style.right);
                this.startY = e.clientY - rect.top;
                e.preventDefault();
            }
        });

        this.resizeHandle.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            this.startX = e.clientX;
            this.startY = e.clientY;
            this.startWidth = this.wrapper.offsetWidth;
            this.startHeight = this.wrapper.offsetHeight;
            this.startRight = parseInt(this.wrapper.style.right);
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('mousemove', this.handleMove.bind(this));
        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.isResizing = false;
            this.wrapper.style.cursor = 'default';
        });

        this.video.addEventListener('dblclick', () => this.toggleFullscreen());

        window.addEventListener('resize', this.ensureWithinViewport.bind(this));
    }

    handleMove(e) {
        if (this.isDragging) {
            let newRight = (window.innerWidth - e.clientX) - this.startX;
            let newTop = e.clientY - this.startY;
            this.setPosition(newRight, newTop);
        }

        if (this.isResizing) {
            const widthChange = e.clientX - this.startX;
            const newWidth = this.startWidth - widthChange;

            const aspectRatio = (this.video.videoWidth && this.video.videoHeight)
                ? this.video.videoWidth / this.video.videoHeight
                : 16 / 9;

            const newHeight = newWidth / aspectRatio;

            const boundedWidth = Math.max(150, newWidth);
            const boundedHeight = boundedWidth / aspectRatio;

            const newRight = this.startRight + (this.startWidth - boundedWidth);

            this.wrapper.style.width = boundedWidth + 'px';
            this.wrapper.style.height = boundedHeight + 'px';
            this.wrapper.style.right = newRight + 'px';
        }
    }

    setPosition(right, top) {
        const maxRight = window.innerWidth - this.minVisiblePx;
        const minRight = -(this.wrapper.offsetWidth - this.minVisiblePx);
        const maxTop = window.innerHeight - this.minVisiblePx;
        const minTop = -(this.wrapper.offsetHeight - this.minVisiblePx);

        const newRight = Math.max(minRight, Math.min(right, maxRight));
        const newTop = Math.max(minTop, Math.min(top, maxTop));

        this.wrapper.style.right = newRight + 'px';
        this.wrapper.style.top = newTop + 'px';
    }

    ensureWithinViewport() {
        let right = parseInt(this.wrapper.style.right, 10) || this.options.initialRight;
        let top = parseInt(this.wrapper.style.top, 10) || this.options.initialTop;
        this.setPosition(right, top);
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.video.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            document.exitFullscreen();
        }
    }

    destroy(notify = false) {
        if (this.wrapper && this.wrapper.parentElement) {
            this.wrapper.parentElement.removeChild(this.wrapper);
        }
        if (notify) {
            const closeEvent = new CustomEvent('close', { detail: { id: this.options.id } });
            this.wrapper.dispatchEvent(closeEvent);
        }
    }
}

export { FloatingWindow };
