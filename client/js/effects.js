/**
 * ==========================================================================================
 *                          --- Effects Module Documentation ---
 *
 * ! DO NOT REMOVE THIS COMMENT !
 * This comment is the official guide for integrating new visual/audio effects into the app.
 *
 * The Effects class is the central controller for discovering, displaying, and managing
 * all special effects. It handles UI generation in the sidebar, state management (ensuring
 * only one effect is active), network synchronization with the peer, and lifecycle management
.
 *
 * ------------------------------------------------------------------------------------------
 *
 * HOW TO ADD A NEW EFFECT:
 *
 * 1.  **File Structure:**
 *     Create a new folder for your effect inside `effects/`. The folder name should be
 *     a unique, simple identifier for your effect (e.g., `effects/fireworks/`).
 *
 * 2.  **Effect Class File (Required):**
 *     Inside your new folder, create a file named `effect.js`. This file must export a
 *     default class that implements the specification described below.
 *     (e.g., `effects/fireworks/effect.js`)
 *
 * 3.  **Effect-Specific CSS (Optional):**
 *     If your effect requires specific CSS, create a file named `effect.css` inside your
 *     effect's folder. The path must be specified in your effect class.
 *     (e.g., `effects/fireworks/effect.css`)
 *
 * 4.  **Other Assets (Optional):**
 *     Place any other assets, like audio files (`.wav`, `.mp3`) or images, inside your
 *     effect's folder to keep it self-contained.
 *
 * 5.  **Registration:**
 *     Open `effects.js` and import your new effect class at the top. Then, add the
 *     imported class to the `this.effectModules` array in the constructor.
 *
 * ------------------------------------------------------------------------------------------
 *
 * EFFECT CLASS SPECIFICATION:
 *
 * Your effect class in `effect.js` MUST adhere to the following structure:
 *
 * --- REQUIRED PROPERTIES ---
 *
 * @property {string} id
 *   A unique, machine-readable string identifier for the effect. MUST match the folder name.
 *   Example: 'fireworks'
 *
 * @property {string} name
 *   The human-readable name of the effect, displayed as a tooltip on the button.
 *   Example: 'Fireworks'
 *
 * @property {string} icon
 *   An SVG string that will be injected into the button in the sidebar. The SVG should
 *   be viewbox-based and use `currentColor` for fills/strokes to inherit color.
 *   Example: '<svg viewBox="0 0 24 24" fill="currentColor">...</svg>'
 *
 * --- OPTIONAL PROPERTIES ---
 *
 * @property {string} [cssPath]
 *   The relative path to the effect-specific CSS file. If provided, this CSS will be
 *   dynamically loaded when the effect starts and unloaded when it stops.
 *   Example: 'effects/fireworks/effect.css'
 *
 * @property {number} [duration]
 *   The total duration of the effect in milliseconds. If provided, a progress bar
 *   will be displayed under the button for this amount of time.
 *   Example: 15000 (for 15 seconds)
 *
 * --- REQUIRED METHODS ---
 *
 * @method constructor(options)
 *   The constructor. It receives an `options` object which contains the `logger` instance.
 *
 * @method start(container, onFinishCallback)
 *   This method is called to begin the effect.
 *   @param {HTMLElement} container - A pre-made, empty `<div>` that is layered over the
 *                                    entire viewport. Your effect should render into this container.
 *   @param {Function} onFinishCallback - A function that MUST be called when your effect
 *                                        has completely finished its animation and cleanup.
 *                                        Failure to call this will result in a frozen state.
 *
 * --- OPTIONAL METHODS ---
 *
 * @method [stop()]
 *   If this method exists, it can be called by the system (e.g., if the peer disconnects)
 *   to prematurely end the effect. This method is responsible for its own cleanup and
 *   MUST ALSO CALL the `onFinishCallback` provided in `start()` to signal completion.
 *
 * ------------------------------------------------------------------------------------------
 *
 * MINIMAL EXAMPLE: `effects/my-effect/effect.js`
 *
 * export class MyEffect {
 *     constructor(options) {
 *         this.logger = options.logger;
 *         this.id = 'my-effect';
 *         this.name = 'My Awesome Effect';
 *         this.icon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="..."/></svg>`;
 *         this.duration = 5000; // This effect lasts 5 seconds
 *
 *         this.onFinish = null;
 *         this.container = null;
 *         this.timer = null;
 *     }
 *
 *     start(container, onFinishCallback) {
 *         this.logger.info(`Starting ${this.name}`);
 *         this.container = container;
 *         this.onFinish = onFinishCallback;
 *
 *         // Your effect logic here...
 *         this.container.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
 *
 *         // When the effect is done, call the cleanup and the callback.
 *         this.timer = setTimeout(() => {
 *             this.stop();
 *         }, this.duration);
 *     }
 *
 *     stop() {
 *         if (this.timer) {
 *             clearTimeout(this.timer);
 *             this.timer = null;
 *         }
 *
 *         this.logger.info(`Stopping ${this.name}`);
 *
 *         // Cleanup logic...
 *         if (this.container) {
 *             this.container.remove();
 *             this.container = null;
 *         }
 *
 *         // CRUCIAL: Signal to the controller that we are done.
 *         if (this.onFinish) {
 *             this.onFinish();
 *         }
 *     }
 * }
 *
 * ==========================================================================================
 */

import { RainEffect } from '../effects/rain/rain.js';
import { TumbleweedEffect } from '../effects/tumbleweed/tumbleweed.js';
import { JizzEffect } from '../effects/jizz/jizz.js';
import { WunderlichEffect } from '../effects/wunderlich/wunderlich.js';

export class Effects {
    constructor(options) {
        this.logger = options.logger;
        this.onSendMessage = options.onSendMessage;
        this.container = document.getElementById('effects-grid');
        this.effectModules = [RainEffect, TumbleweedEffect, JizzEffect, WunderlichEffect];
        this.effects = new Map();
        this.activeEffect = null;
        this.effectButtons = new Map();
        this.progressInterval = null;

        if (!this.container) {
            this.logger.warn('Effects container #effects-grid not found. Module will not be initialized.');
            return;
        }

        this.init();
    }

    init() {
        this.logger.info('Initializing Effects module...');
        this.loadEffects();
        this.createUI();
    }

    loadEffects() {
        for (const EffectClass of this.effectModules) {
            const effectInstance = new EffectClass({ logger: this.logger });
            if (effectInstance.id) {
                this.effects.set(effectInstance.id, effectInstance);
                this.logger.info(`Loaded effect: ${effectInstance.name}`);
            } else {
                this.logger.error('An effect class is missing a required "id" property.');
            }
        }
    }

    createUI() {
        this.effects.forEach(effect => {
            const wrapper = document.createElement('div');
            wrapper.className = 'effect-button-wrapper';

            const button = document.createElement('button');
            button.className = 'effect-button';
            button.title = `Activate ${effect.name} effect`;
            button.innerHTML = effect.icon;
            button.addEventListener('click', () => this.startEffect(effect.id, false));

            wrapper.appendChild(button);
            this.container.appendChild(wrapper);

            this.effectButtons.set(effect.id, { button, wrapper });
        });
    }

    async startEffect(id, isRemote = false, data = {}) {
        if (this.activeEffect) {
            this.logger.debug('Another effect is already active. Ignoring request.');
            return;
        }
        const effect = this.effects.get(id);
        if (!effect) {
            this.logger.error(`Attempted to start unknown effect with id: ${id}`);
            return;
        }

        this.logger.info(`Starting effect: ${effect.name}`);
        this.activeEffect = effect;

        if (!isRemote && typeof this.onSendMessage === 'function') {
            if (typeof effect.prepareData === 'function') {
                data = await effect.prepareData();
            }
            this.onSendMessage({ subType: 'start', id: effect.id, data: data });
        }

        if (effect.cssPath) {
            this.loadEffectCss(effect.id, effect.cssPath);
        }

        this.effectButtons.forEach((btnInfo, buttonId) => {
            btnInfo.button.classList.toggle('active', buttonId === id);
            btnInfo.button.disabled = true;
        });

        const effectContainer = document.createElement('div');
        effectContainer.id = 'effect-main-container';
        document.body.appendChild(effectContainer);

        const onFinishCallback = () => {
             this.stopActiveEffect(isRemote);
        };

        const duration = await effect.start(effectContainer, onFinishCallback, isRemote, data);

        const progressBarDuration = duration || effect.duration;
        if (progressBarDuration) {
            this.startProgressBar(id, progressBarDuration, isRemote);
        }
    }

    stopActiveEffect(isRemote = false) {
        if (!this.activeEffect) return;
        const effectToStop = this.activeEffect;
        this.logger.info(`Stopping effect: ${effectToStop.name}`);

        if (!isRemote && typeof this.onSendMessage === 'function') {
            this.onSendMessage({ subType: 'stop', id: effectToStop.id });
        }

        if (effectToStop.cssPath) {
            this.unloadEffectCss(effectToStop.id);
        }

        this.stopProgressBar();

        this.activeEffect = null;

        this.effectButtons.forEach(btnInfo => {
            btnInfo.button.classList.remove('active');
            btnInfo.button.disabled = false;
        });
    }

    startProgressBar(id, duration, isRemote) {
        if (!duration) return;

        const { wrapper } = this.effectButtons.get(id);
        if (!wrapper) return;

        const existingBar = wrapper.querySelector('.effect-progress-bar');
        if(existingBar) existingBar.remove();

        const progressBar = document.createElement('div');
        progressBar.className = 'effect-progress-bar';

        if (isRemote) {
            progressBar.classList.add('remote');
        }

        const innerBar = document.createElement('div');
        innerBar.className = 'effect-progress-bar-inner';
        progressBar.appendChild(innerBar);
        wrapper.appendChild(progressBar);

        const startTime = performance.now();

        this.progressInterval = setInterval(() => {
            const elapsed = performance.now() - startTime;
            const remainingPercent = Math.max(0, 100 - (elapsed / duration * 100));
            innerBar.style.width = `${remainingPercent}%`;

            if (elapsed >= duration) {
                this.stopProgressBar();
            }
        }, 50);
    }

    stopProgressBar() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }

        const existingBars = document.querySelectorAll('.effect-progress-bar');
        existingBars.forEach(bar => bar.remove());
    }

    handleRemoteMessage(msg) {
        this.logger.debug(`Received remote effect command: ${msg.subType} for ${msg.id}`);
        switch (msg.subType) {
            case 'start':
                this.startEffect(msg.id, true, msg.data || {});
                break;
            case 'stop':
                if (this.activeEffect && this.activeEffect.id === msg.id && typeof this.activeEffect.stop === 'function') {
                    this.activeEffect.stop();
                }
                break;
        }
    }

    loadEffectCss(id, path) {
        const cssId = `effect-css-${id}`;
        if (document.getElementById(cssId)) return;

        const link = document.createElement('link');
        link.id = cssId;
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = path;
        document.head.appendChild(link);
        this.logger.debug(`Loaded CSS for effect '${id}': ${path}`);
    }

    unloadEffectCss(id) {
        const cssId = `effect-css-${id}`;
        const link = document.getElementById(cssId);
        if (link) {
            document.head.removeChild(link);
            this.logger.debug(`Unloaded CSS for effect '${id}'.`);
        }
    }
}
