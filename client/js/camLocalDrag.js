class CamLocalDrag {
    constructor() {
        this.localVideoWrapper = document.getElementById('localVideoWrapper');
        this.localVideo = document.getElementById('localVideo');
        this.resizeHandle = document.getElementById('resizeHandle');
        this.isDragging = false;
        this.isResizing = false;
        this.startX = 0;
        this.startY = 0;
        this.startWidth = 0;
        this.startHeight = 0;
        this.startRight = 0;
        this.minVisiblePx = 20;

        const savedPosition = localStorage.getItem('localVideoPosition');
        const savedSize = localStorage.getItem('localVideoSize');

        if (savedPosition) {
            const { right, top } = JSON.parse(savedPosition);
            this.localVideoWrapper.style.right = right + 'px';
            this.localVideoWrapper.style.top = top + 'px';
        } else {
            this.localVideoWrapper.style.right = '20px';
            this.localVideoWrapper.style.top = '20px';
        }

        if (savedSize) {
            const { width, height } = JSON.parse(savedSize);
            this.localVideoWrapper.style.width = width + 'px';
            this.localVideoWrapper.style.height = height + 'px';
        } else {
            this.localVideoWrapper.style.width = '300px';
            this.localVideoWrapper.style.height = '200px';
        }

        this.localVideo.addEventListener('loadedmetadata', () => {
            this.ensureWithinViewport();
        });

        this.ensureWithinViewport();
        window.addEventListener('resize', () => this.ensureWithinViewport());

        this.addEventListeners();
    }

    addEventListeners() {
        this.localVideo.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.localVideoWrapper.style.cursor = 'move';
            const rect = this.localVideoWrapper.getBoundingClientRect();
            this.startX = (window.innerWidth - e.clientX) - parseInt(this.localVideoWrapper.style.right);
            this.startY = e.clientY - rect.top;
            e.preventDefault();
        });

        this.localVideo.addEventListener('touchstart', (e) => {
            this.isDragging = true;
            this.localVideoWrapper.style.cursor = 'move';
            const touch = e.touches[0];
            const rect = this.localVideoWrapper.getBoundingClientRect();
            this.startX = (window.innerWidth - touch.clientX) - parseInt(this.localVideoWrapper.style.right);
            this.startY = touch.clientY - rect.top;
            e.preventDefault();
        });

        this.resizeHandle.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            this.startX = e.clientX;
            this.startY = e.clientY;
            this.startWidth = this.localVideoWrapper.offsetWidth;
            this.startHeight = this.localVideoWrapper.offsetHeight;
            this.startRight = parseInt(this.localVideoWrapper.style.right);
            e.preventDefault();
        });

        this.resizeHandle.addEventListener('touchstart', (e) => {
            this.isResizing = true;
            const touch = e.touches[0];
            this.startX = touch.clientX;
            this.startY = touch.clientY;
            this.startWidth = this.localVideoWrapper.offsetWidth;
            this.startHeight = this.localVideoWrapper.offsetHeight;
            this.startRight = parseInt(this.localVideoWrapper.style.right);
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            this.handleMove(e);
        });

        document.addEventListener('touchmove', (e) => {
            this.handleMove(e.touches[0]);
            e.preventDefault();
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.isResizing = false;
        });

        document.addEventListener('touchend', () => {
            this.isDragging = false;
            this.isResizing = false;
        });

        this.localVideoWrapper.setAttribute('tabindex', '0');
        this.localVideoWrapper.setAttribute('aria-label', 'Lokales Videofenster, verwenden Sie Pfeiltasten zum Verschieben');

        this.localVideoWrapper.addEventListener('keydown', (e) => {
            let right = parseInt(this.localVideoWrapper.style.right) || 20;
            let top = parseInt(this.localVideoWrapper.style.top) || 20;
            const step = 10;

            if (e.key === 'ArrowRight') {
                right -= step;
            } else if (e.key === 'ArrowLeft') {
                right += step;
            } else if (e.key === 'ArrowUp') {
                top -= step;
            } else if (e.key === 'ArrowDown') {
                top += step;
            } else {
                return;
            }

            const maxRight = window.innerWidth - this.minVisiblePx;
            const minRight = -(this.localVideoWrapper.offsetWidth - this.minVisiblePx);
            const maxTop = window.innerHeight - this.minVisiblePx;
            const minTop = -(this.localVideoWrapper.offsetHeight - this.minVisiblePx);

            right = Math.max(minRight, Math.min(right, maxRight));
            top = Math.max(minTop, Math.min(top, maxTop));

            this.localVideoWrapper.style.right = right + 'px';
            this.localVideoWrapper.style.top = top + 'px';
            this.triggerChangeEvent('position', { right, top });
        });

        this.localVideoWrapper.addEventListener('mouseup', (e) => {
            const rect = this.localVideoWrapper.getBoundingClientRect();
            const resizeAreaSize = 15;
            const inResizeArea =
                e.clientX >= rect.right - resizeAreaSize &&
                e.clientY >= rect.bottom - resizeAreaSize;
            this.localVideoWrapper.style.cursor = inResizeArea ? 'nw-resize' : 'grab';
        });

        this.localVideoWrapper.addEventListener('mouseleave', () => {
            this.localVideoWrapper.style.cursor = 'grab';
        });

        this.localVideoWrapper.addEventListener('videoChange', (e) => {
            console.log('Video geändert:', e.detail);
        });
    }

    handleMove(e) {
        if (this.isDragging) {
            let newRight = (window.innerWidth - e.clientX) - this.startX;
            let newTop = e.clientY - this.startY;

            const maxRight = window.innerWidth - this.minVisiblePx;
            const minRight = -(this.localVideoWrapper.offsetWidth - this.minVisiblePx);
            const maxTop = window.innerHeight - this.minVisiblePx;
            const minTop = -(this.localVideoWrapper.offsetHeight - this.minVisiblePx);

            newRight = Math.max(minRight, Math.min(newRight, maxRight));
            newTop = Math.max(minTop, Math.min(newTop, maxTop));

            this.localVideoWrapper.style.right = newRight + 'px';
            this.localVideoWrapper.style.top = newTop + 'px';
            this.triggerChangeEvent('position', { right: newRight, top: newTop });
        }

        if (this.isResizing) {
            const widthChange = e.clientX - this.startX;
            const newWidth = this.startWidth + widthChange;
            const aspectRatio = (this.localVideo.videoWidth && this.localVideo.videoHeight)
                ? this.localVideo.videoWidth / this.localVideo.videoHeight
                : 16 / 9;
            const newHeight = newWidth / aspectRatio;

            const maxWidth = window.innerWidth - this.startRight + (this.startWidth - this.minVisiblePx);
            const maxHeight = window.innerHeight - parseInt(this.localVideoWrapper.style.top) + (this.localVideoWrapper.offsetHeight - this.minVisiblePx);

            const boundedWidth = Math.max(100, Math.min(newWidth, maxWidth));
            const boundedHeight = Math.max(100 * aspectRatio, Math.min(newHeight, maxHeight));

            const newRight = this.startRight + (this.startWidth - boundedWidth);

            this.localVideoWrapper.style.width = boundedWidth + 'px';
            this.localVideoWrapper.style.height = boundedHeight + 'px';
            this.localVideoWrapper.style.right = newRight + 'px';

            this.triggerChangeEvent('size', { width: boundedWidth, height: boundedHeight });
            this.triggerChangeEvent('position', { right: newRight, top: parseInt(this.localVideoWrapper.style.top) });
        }
    }

    ensureWithinViewport() {
        const rect = this.localVideoWrapper.getBoundingClientRect();
        let right = parseInt(this.localVideoWrapper.style.right) || 20;
        let top = parseInt(this.localVideoWrapper.style.top) || 20;

        const maxRight = window.innerWidth - this.minVisiblePx;
        const minRight = -(rect.width - this.minVisiblePx);
        const maxTop = window.innerHeight - this.minVisiblePx;
        const minTop = -(rect.height - this.minVisiblePx);

        right = Math.max(minRight, Math.min(right, maxRight));
        top = Math.max(minTop, Math.min(top, maxTop));

        this.localVideoWrapper.style.right = right + 'px';
        this.localVideoWrapper.style.top = top + 'px';

        this.triggerChangeEvent('position', { right, top });
    }

    triggerChangeEvent(type, data) {
        const event = new CustomEvent('videoChange', {
            detail: { type, ...data }
        });
        this.localVideoWrapper.dispatchEvent(event);

        if (type === 'position') {
            localStorage.setItem('localVideoPosition', JSON.stringify({
                right: data.right,
                top: data.top
            }));
        } else if (type === 'size') {
            localStorage.setItem('localVideoSize', JSON.stringify({
                width: data.width,
                height: data.height
            }));
        }
    }
}

export { CamLocalDrag };
