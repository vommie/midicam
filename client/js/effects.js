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
 *     Inside your new folder, create a file named `effect.js` (or similar, like the effect name). This file must export a
 *     class that implements the specification described below.
 *     (e.g., `effects/fireworks/fireworks.js`)
 *
 * 3.  **Effect-Specific CSS (Optional):**
 *     If your effect requires specific CSS, create a file inside your
 *     effect's folder. The path must be specified in your effect class.
 *     (e.g., `effects/fireworks/fireworks.css`)
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
 * Your effect class MUST adhere to the following structure:
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
 *   Example: 'effects/fireworks/fireworks.css'
 *
 * @property {number} [duration]
 *   The default duration of the effect in milliseconds. If `start()` returns a number,
 *   that value will be used instead. A progress bar will be shown for this duration.
 *   Example: 15000 (for 15 seconds)
 *
 * --- REQUIRED METHODS ---
 *
 * @method constructor(options)
 *   The constructor. It receives an `options` object which contains the `logger` instance.
 *
 * @method start(container, onFinishCallback, isRemote, data, onSendMessage)
 *   This method is called to begin the effect. It can be async.
 *   @param {HTMLElement} container - A pre-made, empty `<div>` layered over the viewport.
 *   @param {Function} onFinishCallback - A function that MUST be called when the effect is done.
 *   @param {boolean} isRemote - True if the effect is triggered by the peer.
 *   @param {object} data - The data from `prepareData` (for the initiator) or from the peer.
 *   @param {Function} onSendMessage - A function to send data to the peer for this specific effect.
 *   @returns {number | Promise<number> | void} Optionally returns the effect's duration in ms.
 *
 * --- OPTIONAL METHODS ---
 *
 * @method [stop()]
 *   If this method exists, it can be called to prematurely end the effect. It MUST call `onFinishCallback`.
 *
 * @method [prepareData()]
 *   If this method exists, it will be called for the initiator before the effect starts.
 *   It must return a Promise that resolves with a data object to be sent to the peer,
 *   or `null` to cancel the effect start.
 *
 * @method [handleRemoteData(data)]
 *   If this method exists, it's called on both clients when an effect-specific message arrives.
 *
 * @method [toggleVisibility()]
 *   Allows an active effect's UI to be hidden/shown without stopping it (e.g., for chat windows).
 *
 * ==========================================================================================
 */

import { RainEffect } from '../effects/rain/rain.js';
import { TumbleweedEffect } from '../effects/tumbleweed/tumbleweed.js';
import { JizzEffect } from '../effects/jizz/jizz.js';
import { WunderlichEffect } from '../effects/wunderlich/wunderlich.js';
import { PianoTeacherEffect } from '../effects/piano-teacher/pianoteacher.js';
import { MoodBarometerEffect } from '../effects/moodbarometer/moodbarometer.js';
import { ApplauseEffect } from '../effects/applause/applause.js';

export class Effects {
    constructor(options) {
        this.logger = options.logger;
        this.onSendMessage = options.onSendMessage;
        this.container = document.getElementById('effects-grid');
        this.effectModules = [RainEffect, TumbleweedEffect, /*JizzEffect*/, WunderlichEffect, PianoTeacherEffect, MoodBarometerEffect, ApplauseEffect];
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
            try {
                const effectInstance = new EffectClass({ logger: this.logger });
                if (effectInstance.id) {
                    this.effects.set(effectInstance.id, effectInstance);
                    this.logger.info(`Loaded effect: ${effectInstance.name}`);
                } else {
                    this.logger.error('An effect class is missing a required "id" property.', EffectClass);
                }
            } catch(e) {
                this.logger.error(`Failed to instantiate effect class: ${e.message}`);
            }
        }
    }

    createUI() {
        this.effects.forEach(effect => {
            const wrapper = document.createElement('div');
            wrapper.className = 'effect-button-wrapper';

            const button = document.createElement('button');
            button.className = 'effect-button';
            button.dataset.tooltip = `Activate ${effect.name} effect`;
            button.innerHTML = effect.icon;
            button.addEventListener('click', () => this.startEffect(effect.id, false));

            wrapper.appendChild(button);
            this.container.appendChild(wrapper);

            this.effectButtons.set(effect.id, { button, wrapper });
        });
    }

    async startEffect(id, isRemote = false, data = {}) {
        if (this.activeEffect) {
            if (this.activeEffect.id === id && typeof this.activeEffect.toggleVisibility === 'function') {
                this.activeEffect.toggleVisibility();
            } else {
                this.logger.warn(`An effect is already active ('${this.activeEffect.name}'). You must close it before starting a new one.`);
            }
            return;
        }

        const effect = this.effects.get(id);
        if (!effect) {
            this.logger.error(`Attempted to start unknown effect with id: ${id}`);
            return;
        }

        if (effect.cssPath) {
            this.loadEffectCss(effect.id, effect.cssPath);
        }

        if (!isRemote && typeof this.onSendMessage === 'function') {
            if (typeof effect.prepareData === 'function') {
                const preparedData = await effect.prepareData();
                if (preparedData === null) {
                    this.logger.info(`Effect ${effect.name} cancelled by user during preparation.`);
                    if (effect.cssPath) {
                        this.unloadEffectCss(effect.id);
                    }
                    return;
                }
                data = preparedData;
            }
            this.onSendMessage({ subType: 'start', id: effect.id, data: data });
        }

        this.logger.info(`Starting effect: ${effect.name} (isRemote: ${isRemote})`);
        this.activeEffect = effect;

        this.effectButtons.forEach((btnInfo, buttonId) => {
            btnInfo.button.disabled = true;
            if (buttonId === id) {
                btnInfo.button.classList.add('active');
                if (isRemote) {
                    btnInfo.button.classList.add('remote-active');
                }
            }
        });

        const effectContainer = document.createElement('div');
        effectContainer.id = 'effect-main-container';
        document.body.appendChild(effectContainer);

        const onFinishCallback = () => {
             this.cleanUpAfterEffect();
        };

        const onSendMessageForEffect = (payload) => {
            if (typeof this.onSendMessage === 'function') {
                this.onSendMessage({ ...payload, id: effect.id });
            }
        };

        const returnedDuration = await effect.start(effectContainer, onFinishCallback, isRemote, data, onSendMessageForEffect);

        const progressBarDuration = returnedDuration || effect.duration;
        if (progressBarDuration) {
            this.startProgressBar(id, progressBarDuration, isRemote);
        }
    }

    cleanUpAfterEffect() {
        if (!this.activeEffect) return;
        const effectToStop = this.activeEffect;
        this.logger.info(`Cleaning up after effect: ${effectToStop.name}`);

        if (effectToStop.cssPath) {
            this.unloadEffectCss(effectToStop.id);
        }

        const effectContainer = document.getElementById('effect-main-container');
        if (effectContainer) {
            effectContainer.remove();
        }

        this.stopProgressBar();
        this.activeEffect = null;

        this.effectButtons.forEach(btnInfo => {
            btnInfo.button.classList.remove('active', 'remote-active');
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

        const effect = this.effects.get(msg.id);
        if (!effect) {
            this.logger.warn(`Received command for unknown effect ID: '${msg.id}'`);
            return;
        }

        switch (msg.subType) {
             case 'start':
                if (this.activeEffect && this.activeEffect.id === msg.id) {
                    this.logger.info(`Received start for already active remote effect '${msg.id}'. Replacing it.`);
                    if (typeof this.activeEffect.stop === 'function') {
                        this.activeEffect.stop();
                    } else {
                        this.cleanUpAfterEffect();
                    }
                }
                this.startEffect(msg.id, true, msg.data || {});
                break;

            case 'initiator_left':
                if (this.activeEffect && this.activeEffect.id === msg.id && typeof this.activeEffect.handleInitiatorLeft === 'function') {
                    this.activeEffect.handleInitiatorLeft();
                }
                break;

            case 'stop':
                if (this.activeEffect && this.activeEffect.id === msg.id && typeof this.activeEffect.stop === 'function') {
                    this.activeEffect.stop();
                }
                break;
            case 'data':
                if (this.activeEffect && this.activeEffect.id === msg.id && typeof this.activeEffect.handleRemoteData === 'function') {
                    this.activeEffect.handleRemoteData(msg.data);
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
