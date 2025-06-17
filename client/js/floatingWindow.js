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

        this.HEADER_HEIGHT = 24;

        this.isDragging = false;
        this.isResizing = false;
        this.startX = 0;
        this.startY = 0;
        this.startWidth = 0;
        this.startHeight = 0;
        this.startRight = 0;
        this.minVisiblePx = 20;
        this.aspectRatio = 16 / 9;

        this.createElement();
        this.addEventListeners();

        if (this.video.readyState >= 1) {
            this.updateSizeForAspectRatio();
        }

        this.ensureWithinViewport();
    }

    createElement() {
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'floating-window-wrapper';
        this.wrapper.id = this.options.id;
        this.wrapper.style.width = this.options.initialWidth + 'px';
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
        this.video.muted = true;
        if (this.options.stream) {
            this.video.srcObject = this.options.stream;
        }

        this.placeholder = document.createElement('div');
        this.placeholder.className = 'video-placeholder';
        this.placeholder.innerHTML = `<div class="placeholder-avatar avatar-local">Me</div>`;

        this.muteIndicator = document.createElement('div');
        this.muteIndicator.className = 'mute-indicator';
        this.muteIndicator.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19 11h-1.7c0 .58-.1 1.13-.27 1.64l1.27 1.27c.44-.88.7-1.87.7-2.91zM4.41 2.86L3 4.27l6 6V11c0 1.66 1.34 3 3 3 .23 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.55-.9L19.73 21l1.41-1.41L4.41 2.86zM10.17 11l-2-2H9v2h1.17zM15 11V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.17l4.73 4.73c.65-1.03 1.27-2.22 1.27-3.9z"/></svg>`;

        this.resizeHandle = document.createElement('div');
        this.resizeHandle.className = 'floating-window-resize-handle';

        this.wrapper.appendChild(header);
        this.wrapper.appendChild(this.video);
        this.wrapper.appendChild(this.placeholder);
        this.wrapper.appendChild(this.muteIndicator);
        this.wrapper.appendChild(this.resizeHandle);

        this.options.container.appendChild(this.wrapper);
    }

    updateSizeForAspectRatio() {
        if (!this.video.videoWidth || !this.video.videoHeight) {
            return;
        }

        this.aspectRatio = this.video.videoWidth / this.video.videoHeight;

        const currentWidth = this.wrapper.offsetWidth;
        const videoHeight = currentWidth / this.aspectRatio;
        const totalHeight = videoHeight + this.HEADER_HEIGHT;

        this.wrapper.style.height = totalHeight + 'px';
    }


    addEventListeners() {
        this.wrapper.addEventListener('mousedown', (e) => {
            const onResizeHandle = e.target.closest('.floating-window-resize-handle');
            const onCloseButton = e.target.closest('.floating-window-close');

            if (onResizeHandle || onCloseButton) {
                return;
            }

            this.isDragging = true;
            this.wrapper.style.cursor = 'move';
            const rect = this.wrapper.getBoundingClientRect();
            this.startX = (window.innerWidth - e.clientX) - parseInt(this.wrapper.style.right);
            this.startY = e.clientY - rect.top;
            e.preventDefault();
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

        this.video.addEventListener('loadedmetadata', () => {
            this.updateSizeForAspectRatio();
        });

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
            const newWidth = this.startWidth + widthChange;

            const boundedWidth = Math.max(150, newWidth);

            this.wrapper.style.width = boundedWidth + 'px';

            const newRight = this.startRight - (boundedWidth - this.startWidth);
            this.wrapper.style.right = newRight + 'px';

            this.updateSizeForAspectRatio();
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

    setPlaceholderActive(isActive) {
        this.placeholder.classList.toggle('active', isActive);
        this.video.style.display = isActive ? 'none' : 'block';
    }

    setMuteIndicatorActive(isActive) {
        this.muteIndicator.classList.toggle('active', isActive);
    }
}

export { FloatingWindow };
