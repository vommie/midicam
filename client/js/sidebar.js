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

        this.init();
    }

    init() {
        this.initResizing();
        this.initCollapsibleSections();
        this.initTooltips();
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

    initTooltips() {
        const tooltipElements = this.sidebar.querySelectorAll('[data-tooltip]');
        tooltipElements.forEach(el => {
            if (el.getAttribute('title')) {
                el.setAttribute('data-tooltip', el.getAttribute('title'));
                el.removeAttribute('title');
            }
        });
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
