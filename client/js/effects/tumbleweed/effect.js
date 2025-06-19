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
    }

    start(container, onFinishCallback) {
        this.logger.info(`Starting ${this.name} effect.`);
        this.container = container;
        this.onFinish = onFinishCallback;

        if (this.mainElement) {
            this.mainElement.classList.add('sepia-filter-active');
        }

        try {
            this.audio = new Audio('js/effects/tumbleweed/cricket.aac');
            this.audio.loop = true;
            this.audio.volume = 0;
            this.audio.play().catch(e => this.logger.warn(`Audio playback for cricket failed: ${e.message}.`));
            this._fadeAudio(0.7, 1000);
        } catch (e) {
            this.logger.error(`Could not create Audio object for cricket: ${e}`);
        }

        const tumbleweedEl = document.createElement('div');
        tumbleweedEl.className = 'tumbleweed';

        const tumbleweedImage = document.createElement('img');
        tumbleweedImage.src = 'js/effects/tumbleweed/tumbleweed.png';
        tumbleweedImage.alt = 'A rolling tumbleweed';
        tumbleweedEl.appendChild(tumbleweedImage);

        this.container.appendChild(tumbleweedEl);

        this.mainTimer = setTimeout(() => this.stop(), this.duration);
    }

    stop() {
        this.logger.debug(`${this.name} stop routine initiated.`);
        if (this.mainTimer) clearTimeout(this.mainTimer);

        if (this.mainElement) {
            this.mainElement.classList.remove('sepia-filter-active');
        }

        if (this.audio) {
            this._fadeAudio(0, 1000);
        }

        if (this.container) {
            this.container.style.opacity = "0";
        }

        const cleanupDelay = 1000;

        setTimeout(() => {
            if (this.audio) {
                this.audio.pause();
                this.audio.src = '';
                this.audio = null;
            }

            if (this.container && this.container.parentNode) {
                this.container.parentNode.removeChild(this.container);
            }
            this.container = null;

            if (this.onFinish) {
                this.onFinish();
            }
        }, cleanupDelay);
    }

    _fadeAudio(targetVolume, duration) {
        return new Promise(resolve => {
            if (!this.audio || isNaN(this.audio.volume)) return resolve();
            const startVolume = this.audio.volume;
            const startTime = performance.now();

            const tick = (currentTime) => {
                if (!this.audio) return resolve();
                const elapsedTime = currentTime - startTime;
                if (elapsedTime >= duration) {
                    this.audio.volume = targetVolume;
                    return resolve();
                }
                const progress = elapsedTime / duration;
                const newVolume = startVolume + (targetVolume - startVolume) * progress;
                this.audio.volume = Math.max(0, Math.min(1, newVolume));
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    }
}
