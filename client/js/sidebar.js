export class Sidebar {
    constructor() {
        this.sidebar = document.getElementById('sidebar-right');
        if (!this.sidebar) return;

        this.resizeHandle = document.getElementById('sidebar-resize-handle');
        this.mainContainer = document.querySelector('main');
        this.sections = this.sidebar.querySelectorAll('.sidebar-section');

        this.minWidth = 320;
        this.defaultWidth = 485;
        this.boundResize = this.resize.bind(this);
        this.boundStopResize = this.stopResize.bind(this);

        this.volumeTooltipEl = null;
        this.activeSlider = null;
        this.boundUpdateVolumeTooltip = this.updateVolumeTooltip.bind(this);
        this.boundHideVolumeTooltip = this.hideVolumeTooltip.bind(this);

        this.tooltipEl = null;
        this.boundShowTooltip = this.showTooltip.bind(this);
        this.boundHideTooltip = this.hideTooltip.bind(this);

        this.tooltipTimer = null;

        this.init();
    }

    init() {
        this.initResizing();
        this.initCollapsibleSections();
        this.initDynamicTooltips();
        this.initVolumeTooltips();
        this.loadState();
        this.sidebar.style.visibility = 'visible';
    }

    initResizing() {
        this.resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.resizeHandle.classList.add('is-dragging');
            document.addEventListener('mousemove', this.boundResize);
            document.addEventListener('mouseup', this.boundStopResize);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
    }

    resize(e) {
        let newWidth = window.innerWidth - e.clientX;
        if (newWidth < this.minWidth) {
            newWidth = this.minWidth;
        }
        requestAnimationFrame(() => {
            this.mainContainer.style.gridTemplateColumns = `1fr ${newWidth}px`;
        });
    }

    stopResize() {
        document.removeEventListener('mousemove', this.boundResize);
        document.removeEventListener('mouseup', this.boundStopResize);
        this.resizeHandle.classList.remove('is-dragging');
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
        this.saveState();
    }

    initCollapsibleSections() {
        this.sections.forEach(section => {
            const header = section.querySelector('.sidebar-section-header');
            if (header) {
                header.addEventListener('click', () => {
                    section.classList.toggle('collapsed');
                    this.saveState();
                });
            }
        });
    }

    initDynamicTooltips() {
        this.tooltipEl = document.createElement('div');
        this.tooltipEl.className = 'sidebar-custom-tooltip';
        this.sidebar.appendChild(this.tooltipEl);

        const tooltipTriggers = this.sidebar.querySelectorAll('[data-tooltip]');
        tooltipTriggers.forEach(trigger => {
            if (trigger.getAttribute('title')) {
                trigger.setAttribute('data-tooltip', trigger.getAttribute('title'));
                trigger.removeAttribute('title');
            }
            trigger.addEventListener('mouseenter', this.boundShowTooltip);
            trigger.addEventListener('mouseleave', this.boundHideTooltip);
        });
    }

    showTooltip(e) {
        const triggerEl = e.currentTarget;
        const tooltipText = triggerEl.getAttribute('data-tooltip');
        if (!tooltipText) return;

        clearTimeout(this.tooltipTimer);

        this.tooltipTimer = setTimeout(() => {
            this.tooltipEl.textContent = tooltipText;
            this.tooltipEl.classList.add('visible');

            const triggerRect = triggerEl.getBoundingClientRect();
            const sidebarRect = this.sidebar.getBoundingClientRect();
            const tooltipRect = this.tooltipEl.getBoundingClientRect();

            const top = triggerRect.top - sidebarRect.top - tooltipRect.height - 8;

            let left = triggerRect.left - sidebarRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);

            const sidebarPadding = 8;

            if (left < sidebarPadding) {
                left = sidebarPadding;
            }

            if (left + tooltipRect.width > sidebarRect.width - sidebarPadding) {
                left = sidebarRect.width - tooltipRect.width - sidebarPadding;
            }

            this.tooltipEl.style.top = `${top}px`;
            this.tooltipEl.style.left = `${left}px`;
        }, 500);
    }

    hideTooltip() {
        clearTimeout(this.tooltipTimer);
        this.tooltipEl.classList.remove('visible');
    }

    initVolumeTooltips() {
        const volumeSliders = this.sidebar.querySelectorAll('#volumes input[type="range"]');
        volumeSliders.forEach(slider => {
            slider.addEventListener('mousedown', (e) => {
                this.activeSlider = e.target;
                this.createVolumeTooltip();
                this.updateVolumeTooltip();
                this.volumeTooltipEl.style.display = 'block';

                this.activeSlider.addEventListener('input', this.boundUpdateVolumeTooltip);
                document.addEventListener('mouseup', this.boundHideVolumeTooltip, { once: true });
            });
        });
    }

    createVolumeTooltip() {
        if (this.volumeTooltipEl) return;
        this.volumeTooltipEl = document.createElement('div');
        this.volumeTooltipEl.className = 'volume-tooltip';
        this.sidebar.appendChild(this.volumeTooltipEl);
    }

    updateVolumeTooltip() {
        if (!this.activeSlider || !this.volumeTooltipEl) return;

        const slider = this.activeSlider;
        const rect = slider.getBoundingClientRect();
        const sidebarRect = this.sidebar.getBoundingClientRect();

        const value = parseFloat(slider.value);
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 1;

        const percentage = Math.round(((value - min) / (max - min)) * 100);
        this.volumeTooltipEl.textContent = `${percentage}%`;

        const progress = (value - min) / (max - min);
        const thumbWidth = 18;
        const trackWidth = rect.width - thumbWidth;
        const thumbLeft = progress * trackWidth;
        const tooltipX = rect.left - sidebarRect.left + thumbLeft + (thumbWidth / 2);
        const tooltipY = rect.top - sidebarRect.top;

        requestAnimationFrame(() => {
            this.volumeTooltipEl.style.left = `${tooltipX}px`;
            this.volumeTooltipEl.style.top = `${tooltipY}px`;
        });
    }

    hideVolumeTooltip() {
        if (this.volumeTooltipEl) {
            this.volumeTooltipEl.style.display = 'none';
        }
        if (this.activeSlider) {
            this.activeSlider.removeEventListener('input', this.boundUpdateVolumeTooltip);
            this.activeSlider = null;
        }
    }

    saveState() {
        const collapsedStates = {};
        this.sections.forEach(section => {
            if (section.id) {
                collapsedStates[section.id] = section.classList.contains('collapsed');
            }
        });

        const sidebarState = {
            width: this.mainContainer.style.gridTemplateColumns.split(' ')[1],
            collapsed: collapsedStates
        };
        localStorage.setItem('sidebarState', JSON.stringify(sidebarState));
    }

    loadState() {
        const savedState = localStorage.getItem('sidebarState');
        if (savedState) {
            const state = JSON.parse(savedState);

            const width = state.width || `${this.defaultWidth}px`;
            this.mainContainer.style.gridTemplateColumns = `1fr ${width}`;

            if (state.collapsed) {
                Object.keys(state.collapsed).forEach(id => {
                    const section = document.getElementById(id);
                    if (section) {
                        section.classList.toggle('collapsed', state.collapsed[id]);
                    }
                });
            }
        } else {
             this.mainContainer.style.gridTemplateColumns = `1fr ${this.defaultWidth}px`;
        }
    }
}
