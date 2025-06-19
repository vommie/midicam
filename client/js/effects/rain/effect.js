export class RainEffect {
    constructor(options) {
        this.logger = options.logger;
        this.id = 'rain';
        this.name = 'Rain';
        this.icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"></path></svg>`;
        this.cssPath = 'js/effects/rain/effect.css';

        this.duration = 10000;
        this.container = null;
        this.onFinish = null;
        this.audio = null;
        this.canvas = null;
        this.ctx = null;
        this.animationFrameId = null;
        this.raindrops = [];
        this.splashes = [];
        this.mainTimer = null;
        this.fadeTimer = null;
    }

    start(container, onFinishCallback) {
        this.container = container;
        this.onFinish = onFinishCallback;

        this.container.style.transition = 'opacity 2s ease-in-out';
        this.container.style.opacity = '0';

        requestAnimationFrame(() => {
            if (this.container) {
                this.container.style.opacity = '1';
            }
        });

        this.container.classList.add('rain-effect');

        try {
            this.audio = new Audio('js/effects/rain/rain.aac');
            this.audio.loop = true;
            this.audio.volume = 0;
            this.audio.play().catch(e => this.logger.warn(`Audio playback failed: ${e.message}.`));
            this._fadeAudio(0.5, 2000);
        } catch (e) {
             this.logger.error(`Could not create Audio object: ${e}.`);
        }

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);

        this.boundResize = this.resizeCanvas.bind(this);
        window.addEventListener('resize', this.boundResize);
        this.resizeCanvas();

        for (let i = 0; i < 500; i++) {
            this.raindrops.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                length: Math.random() * 20 + 10,
                speed: Math.random() * 5 + 4,
                opacity: Math.random() * 0.5 + 0.2
            });
        }

        this.animate();

        this.mainTimer = setTimeout(() => this.stop(), this.duration);

        this.fadeTimer = setTimeout(() => {
            if (this.container) {
                this.container.style.opacity = '0';
            }
            this._fadeAudio(0, 1800);
        }, this.duration - 2000);
    }

    stop() {
        this.logger.debug('Rain effect stop routine initiated.');
        window.removeEventListener('resize', this.boundResize);

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        clearTimeout(this.mainTimer);
        clearTimeout(this.fadeTimer);

        if (this.audio) {
            this._fadeAudio(0, 500).then(() => {
                if (this.audio) {
                    this.audio.pause();
                    this.audio.src = '';
                    this.audio = null;
                }
            });
        }

        if (this.container) {
            this.container.style.opacity = '0';
            setTimeout(() => {
                if(this.container && this.container.parentNode) {
                    this.container.parentNode.removeChild(this.container);
                }
                this.container = null;

                if (this.onFinish) {
                    this.onFinish();
                }

            }, 2000);
        } else {
             if (this.onFinish) {
                this.onFinish();
            }
        }
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

    resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    animate() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.strokeStyle = 'rgba(174,194,224,0.5)';
        this.ctx.lineWidth = 1;
        this.ctx.lineCap = 'round';

        this.raindrops.forEach(drop => {
            this.ctx.globalAlpha = drop.opacity;
            this.ctx.beginPath();
            this.ctx.moveTo(drop.x, drop.y);
            this.ctx.lineTo(drop.x, drop.y + drop.length);
            this.ctx.stroke();

            drop.y += drop.speed;

            if (drop.y > this.canvas.height) {
                this.splashes.push({
                    x: drop.x,
                    radius: 0,
                    maxRadius: Math.random() * 5 + 3,
                    life: 1,
                    speed: Math.random() * 0.3 + 0.2
                });

                drop.y = -drop.length;
                drop.x = Math.random() * this.canvas.width;
            }
        });

        this.ctx.strokeStyle = 'rgba(174,194,224,0.8)';
        this.ctx.lineWidth = 1.5;

        this.splashes.forEach((splash, index) => {
             this.ctx.globalAlpha = splash.life;
             this.ctx.beginPath();
             this.ctx.arc(splash.x, this.canvas.height - 5, splash.radius, 0, Math.PI);
             this.ctx.stroke();

             splash.radius += splash.speed;
             splash.life -= 0.025;

             if (splash.life <= 0) {
                 this.splashes.splice(index, 1);
             }
        });

        this.ctx.globalAlpha = 1;
        this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
    }
}
