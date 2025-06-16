export class Sidebar {
    constructor() {
        this.sidebar = document.getElementById('sidebar-right');
        if (!this.sidebar) return;

        this.resizeHandle = document.getElementById('sidebar-resize-handle');
        this.mainContainer = document.querySelector('main');
        this.sections = this.sidebar.querySelectorAll('.sidebar-section');

        this.minWidth = 320;
        this.defaultWidth = 485;

        // Binden der Funktionen an 'this' und Speichern der Referenz
        // Dies ist der entscheidende Fix für den Resize-Bug.
        this.boundResize = this.resize.bind(this);
        this.boundStopResize = this.stopResize.bind(this);

        this.init();
    }

    init() {
        this.initResizing();
        this.initCollapsibleSections();
        this.initTooltips();
        this.loadState(); // Lade den Zustand NACH dem Initialisieren, um alles korrekt anzuwenden
        this.sidebar.style.visibility = 'visible';
    }

    initResizing() {
        this.resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            // Verwende die gespeicherten, gebundenen Funktionen
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
        // Verwende die gespeicherten, gebundenen Funktionen zum Entfernen
        document.removeEventListener('mousemove', this.boundResize);
        document.removeEventListener('mouseup', this.boundStopResize);
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
        // Diese Funktion bleibt unverändert, ist aber weiterhin wichtig.
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
