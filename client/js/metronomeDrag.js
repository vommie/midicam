// js/metronomeDrag.js

class MetronomeDrag {
    constructor() {
        this.metronomeContainer = document.getElementById('metronomeContainer');
        this.isDragging = false;
        this.offsetX = 0;
        this.offsetY = 0;
        this.minVisiblePx = 20;
        this.isInitialized = false;

        const observer = new MutationObserver((mutationsList, observer) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const isVisible = this.metronomeContainer.classList.contains('visible');
                    if (isVisible && !this.isInitialized) {
                        this.initializePosition();
                        this.isInitialized = true;
                        observer.disconnect();
                    }
                }
            }
        });
        observer.observe(this.metronomeContainer, { attributes: true });
        this.addEventListeners();
    }

    initializePosition() {
        const savedPosition = localStorage.getItem('metronomePosition');
        if (savedPosition) {
            const { left, top } = JSON.parse(savedPosition);
            this.metronomeContainer.style.left = left + 'px';
            this.metronomeContainer.style.top = top + 'px';
        } else {
            this.metronomeContainer.style.left = '20px';
            this.metronomeContainer.style.top = '20px';
        }

        this.ensureWithinViewport();
        window.addEventListener('resize', () => this.ensureWithinViewport());
    }

    addEventListeners() {
        this.metronomeContainer.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
                return;
            }
            this.isDragging = true;
            const rect = this.metronomeContainer.getBoundingClientRect();
            this.offsetX = e.clientX - rect.left;
            this.offsetY = e.clientY - rect.top;
            this.metronomeContainer.style.cursor = 'move';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            this.handleMove(e);
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.metronomeContainer.style.cursor = 'grab';
                this.savePosition();
            }
        });
    }

    handleMove(e) {
        if (!this.isDragging) return;

        let newLeft = e.clientX - this.offsetX;
        let newTop = e.clientY - this.offsetY;

        const maxLeft = window.innerWidth - this.minVisiblePx;
        const minLeft = -(this.metronomeContainer.offsetWidth - this.minVisiblePx);
        const maxTop = window.innerHeight - this.minVisiblePx;
        const minTop = -(this.metronomeContainer.offsetHeight - this.minVisiblePx);

        newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
        newTop = Math.max(minTop, Math.min(newTop, maxTop));

        this.metronomeContainer.style.left = newLeft + 'px';
        this.metronomeContainer.style.top = newTop + 'px';
    }

    ensureWithinViewport() {
        if (!this.metronomeContainer.classList.contains('visible')) return;

        const rect = this.metronomeContainer.getBoundingClientRect();
        let left = rect.left;
        let top = rect.top;

        const maxLeft = window.innerWidth - this.minVisiblePx;
        const minLeft = -(rect.width - this.minVisiblePx);
        const maxTop = window.innerHeight - this.minVisiblePx;
        const minTop = -(rect.height - this.minVisiblePx);

        left = Math.max(minLeft, Math.min(left, maxLeft));
        top = Math.max(minTop, Math.min(top, maxTop));

        this.metronomeContainer.style.left = left + 'px';
        this.metronomeContainer.style.top = top + 'px';
    }

    savePosition() {
        if (!this.isInitialized) return;

        localStorage.setItem('metronomePosition', JSON.stringify({
            left: parseInt(this.metronomeContainer.style.left),
            top: parseInt(this.metronomeContainer.style.top)
        }));
    }
}

export { MetronomeDrag };
