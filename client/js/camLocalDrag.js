class CamLocalDrag {
    constructor() {
        this.localVideoWrapper = document.getElementById('localVideoWrapper');
        this.localVideo = document.getElementById('localVideo');
        this.resizeHandle = document.getElementById('resizeHandle');
        this.isDragging = false;
        this.isResizing = false;
        this.startX = 0; // Initialisierung erforderlich
        this.startY = 0;
        this.startWidth = 0;
        this.startHeight = 0;

        // Load saved position and size from localStorage
        const savedPosition = localStorage.getItem('localVideoPosition');
        const savedSize = localStorage.getItem('localVideoSize');

        if (savedPosition) {
            const { left, top } = JSON.parse(savedPosition);
            this.localVideoWrapper.style.left = left + 'px';
            this.localVideoWrapper.style.top = top + 'px';
        } else {
            // Default Position
            this.localVideoWrapper.style.left = '20px';
            this.localVideoWrapper.style.top = '20px';
        }

        if (savedSize) {
            const { width, height } = JSON.parse(savedSize);
            this.localVideoWrapper.style.width = width + 'px';
            this.localVideoWrapper.style.height = height + 'px';
        } else {
            // Default Größe
            this.localVideoWrapper.style.width = '300px';
            this.localVideoWrapper.style.height = '200px';
        }

        this.addEventListeners();
    }

    addEventListeners() {
        // Drag nur auf dem Video-Element
        this.localVideo.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.startX = e.clientX - parseInt(this.localVideoWrapper.style.left);
            this.startY = e.clientY - parseInt(this.localVideoWrapper.style.top);
            e.preventDefault(); // Verhindert unerwünschtes Verhalten wie Textauswahl
        });

        // Resize auf dem Handle
        this.resizeHandle.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            this.startX = e.clientX;
            this.startY = e.clientY;
            this.startWidth = this.localVideoWrapper.offsetWidth;
            this.startHeight = this.localVideoWrapper.offsetHeight;
            e.preventDefault();
        });

        // Mausbewegung für Drag und Resize
        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const newLeft = e.clientX - this.startX;
                const newTop = e.clientY - this.startY;
                this.localVideoWrapper.style.left = newLeft + 'px';
                this.localVideoWrapper.style.top = newTop + 'px';
                this.triggerChangeEvent('position', { left: newLeft, top: newTop });
            }

            if (this.isResizing) {
                const newWidth = this.startWidth + (e.clientX - this.startX);
                const newHeight = this.startHeight + (e.clientY - this.startY);
                this.localVideoWrapper.style.width = Math.max(100, newWidth) + 'px'; // Mindestgröße
                this.localVideoWrapper.style.height = Math.max(100, newHeight) + 'px'; // Mindestgröße
                this.triggerChangeEvent('size', { width: newWidth, height: newHeight });
            }
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.isResizing = false;
        });

        // Cursor-Änderung
        this.localVideoWrapper.addEventListener('mousemove', (e) => {
            const rect = this.localVideoWrapper.getBoundingClientRect();
            const resizeAreaSize = 15;
            const inResizeArea =
                e.clientX >= rect.right - resizeAreaSize &&
                e.clientY >= rect.bottom - resizeAreaSize;

            this.localVideoWrapper.style.cursor = inResizeArea ? 'nw-resize' : 'move';
        });

        this.localVideoWrapper.addEventListener('mouseleave', () => {
            this.localVideoWrapper.style.cursor = 'move';
        });

        // Event-Listener für Änderungen
        this.localVideoWrapper.addEventListener('videoChange', (e) => {
            console.log('Video geändert:', e.detail);
        });
    }

    triggerChangeEvent(type, data) {
        const event = new CustomEvent('videoChange', {
            detail: { type, ...data }
        });
        this.localVideoWrapper.dispatchEvent(event);

        // Speichere in localStorage
        if (type === 'position') {
            localStorage.setItem('localVideoPosition', JSON.stringify({
                left: data.left,
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
