export class TumbleweedEffect {
    constructor(options) {
        this.logger = options.logger;
        this.id = 'tumbleweed';
        this.name = 'Tumbleweed';
        this.icon = `<img src="js/effects/tumbleweed/cricket.svg" alt="Cricket Icon">`;
        this.cssPath = 'js/effects/tumbleweed/effect.css';
        this.duration = 6000;

        this.onFinish = null;
        this.container = null;
        this.audio = null;
        this.mainTimer = null;
        this.mainElement = document.querySelector('main');
        this.filterId = 'tumbleweed-heat-shimmer-svg';

        this.isStopping = false;
        this.FADE_DURATION = 1500;
    }

    _animateValue(start, end, duration, onUpdate) {
        return new Promise(resolve => {
            const startTime = performance.now();
            const tick = (currentTime) => {
                const elapsed = currentTime - startTime;
                if (elapsed >= duration) {
                    onUpdate(end);
                    resolve();
                    return;
                }
                const progress = elapsed / duration;
                const value = start + (end - start) * progress;
                onUpdate(value);
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    }

    _createHeatShimmerFilter() {
        if (document.getElementById(this.filterId)) return;
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute('id', this.filterId);
        svg.style.position = 'absolute';
        svg.style.width = '0';
        svg.style.height = '0';
        const filter = document.createElementNS(svgNS, "filter");
        filter.setAttribute("id", "heat-shimmer");
        const feTurbulence = document.createElementNS(svgNS, "feTurbulence");
        feTurbulence.setAttribute("type", "fractalNoise");
        feTurbulence.setAttribute("baseFrequency", "0.01 0.04");
        feTurbulence.setAttribute("numOctaves", "2");
        const animate = document.createElementNS(svgNS, "animate");
        animate.setAttribute("attributeName", "baseFrequency");
        animate.setAttribute("dur", "10s");
        animate.setAttribute("values", "0.01 0.04;0.015 0.06;0.01 0.04");
        animate.setAttribute("repeatCount", "indefinite");
        feTurbulence.appendChild(animate);
        const feDisplacementMap = document.createElementNS(svgNS, "feDisplacementMap");
        feDisplacementMap.setAttribute("in", "SourceGraphic");
        feDisplacementMap.setAttribute("in2", "turbulence");
        feDisplacementMap.setAttribute("scale", "5");
        feDisplacementMap.setAttribute("xChannelSelector", "R");
        feDisplacementMap.setAttribute("yChannelSelector", "G");
        filter.appendChild(feTurbulence);
        filter.appendChild(feDisplacementMap);
        svg.appendChild(filter);
        document.body.appendChild(svg);
    }

    async start(container, onFinishCallback) {
        this.logger.info(`Starting ${this.name} effect.`);
        this.isStopping = false;
        this.container = container;
        this.onFinish = onFinishCallback;

        this._createHeatShimmerFilter();

        this.container.style.opacity = 0;
        if (this.mainElement) {
            this.mainElement.style.filter = 'sepia(0)';
        }

        try {
            this.audio = new Audio('js/effects/tumbleweed/cricket.aac');
            this.audio.loop = true;
            this.audio.volume = 0;
            this.audio.play().catch(e => this.logger.warn(`Audio playback failed: ${e.message}.`));
        } catch (e) {
            this.logger.error(`Could not create Audio object: ${e}`);
        }

        const tumbleweedEl = document.createElement('div');
        tumbleweedEl.className = 'tumbleweed';
        const tumbleweedImage = document.createElement('img');
        tumbleweedImage.src = 'js/effects/tumbleweed/tumbleweed.png';
        tumbleweedImage.alt = 'A rolling tumbleweed';
        tumbleweedEl.appendChild(tumbleweedImage);
        this.container.appendChild(tumbleweedEl);

        const fadeInAnimations = [
            this._animateValue(0, 1, this.FADE_DURATION, value => this.container.style.opacity = value),
            this._animateValue(0, 0.7, this.FADE_DURATION, value => {
                if (this.mainElement) this.mainElement.style.filter = `sepia(${value}) url(#heat-shimmer)`;
            }),
            this._animateValue(0, 0.7, this.FADE_DURATION, value => {
                if (this.audio) this.audio.volume = Math.max(0, Math.min(1, value));
            })
        ];

        await Promise.all(fadeInAnimations);

        this.mainTimer = setTimeout(() => this.stop(), this.duration);
    }

    async stop() {
        if (this.isStopping) return;
        this.isStopping = true;

        this.logger.debug(`${this.name} stop routine initiated.`);
        if (this.mainTimer) clearTimeout(this.mainTimer);

        const currentOpacity = this.container ? parseFloat(this.container.style.opacity) : 0;
        const currentVolume = this.audio ? this.audio.volume : 0;
        const currentSepia = 0.7;

        const fadeOutAnimations = [
            this._animateValue(currentOpacity, 0, this.FADE_DURATION, value => {
                if(this.container) this.container.style.opacity = value;
            }),
            this._animateValue(currentSepia, 0, this.FADE_DURATION, value => {
                if (this.mainElement) this.mainElement.style.filter = `sepia(${value}) url(#heat-shimmer)`;
            }),
            this._animateValue(currentVolume, 0, this.FADE_DURATION, value => {
                if (this.audio) this.audio.volume = Math.max(0, Math.min(1, value));
            })
        ];

        await Promise.all(fadeOutAnimations);

        this._cleanup();
    }

    _cleanup() {
        this.logger.debug("Running cleanup for Tumbleweed effect.");

        const svgFilter = document.getElementById(this.filterId);
        if (svgFilter) svgFilter.remove();

        if (this.mainElement) this.mainElement.style.filter = '';

        if (this.audio) {
            this.audio.pause();
            this.audio.src = '';
            this.audio = null;
        }

        if (this.container) {
            this.container.innerHTML = '';
            if (this.container.parentNode) {
                this.container.parentNode.removeChild(this.container);
            }
            this.container = null;
        }

        if (this.onFinish) {
            this.onFinish();
        }
    }
}
