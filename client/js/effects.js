import { RainEffect } from './effects/rain/effect.js';

export class Effects {
    constructor(options) {
        this.logger = options.logger;
        this.onSendMessage = options.onSendMessage; // Callback zum Senden von Daten
        this.container = document.getElementById('effects-grid');
        this.effectModules = [RainEffect];
        this.effects = new Map();
        this.activeEffect = null;
        this.effectButtons = new Map();

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
            const button = document.createElement('button');
            button.className = 'effect-button';
            button.title = `Activate ${effect.name} effect`;
            button.innerHTML = effect.icon;
            button.addEventListener('click', () => this.startEffect(effect.id, false)); // false = not remote

            this.container.appendChild(button);
            this.effectButtons.set(effect.id, button);
        });
    }

    // `isRemote` Flag verhindert, dass eine empfangene Nachricht zurückgesendet wird.
    startEffect(id, isRemote = false) {
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
            this.onSendMessage({ subType: 'start', id: effect.id });
        }

        if (effect.cssPath) {
            this.loadEffectCss(effect.id, effect.cssPath);
        }

        this.effectButtons.forEach((button, buttonId) => {
            button.classList.toggle('active', buttonId === id);
            button.disabled = true; // Alle Buttons deaktivieren, solange einer läuft
        });

        const effectContainer = document.createElement('div');
        effectContainer.id = 'effect-main-container';
        document.body.appendChild(effectContainer);

        effect.start(effectContainer, () => {
             // WICHTIG: Die `stop`-Methode des Effekts ruft diesen Callback auf.
             // Wir rufen hier `stopActiveEffect` auf, um den Zustand zu bereinigen und den Peer zu informieren.
             this.stopActiveEffect(isRemote);
        });
    }

    stopActiveEffect(isRemote = false) {
        if (!this.activeEffect) return;
        const effectToStop = this.activeEffect;
        this.logger.info(`Stopping effect: ${effectToStop.name}`);

        // FIX: Rufen Sie nicht erneut `effect.stop()` auf. Dies verursacht die Endlosschleife.
        // Die `stop`-Methode des Effekts wurde bereits aufgerufen, um hierher zu gelangen.

        if (!isRemote && typeof this.onSendMessage === 'function') {
            this.onSendMessage({ subType: 'stop', id: effectToStop.id });
        }

        if (effectToStop.cssPath) {
            this.unloadEffectCss(effectToStop.id);
        }

        this.activeEffect = null;

        this.effectButtons.forEach(button => {
            button.classList.remove('active');
            button.disabled = false;
        });
    }

    // Wird von app.js aufgerufen, wenn eine Nachricht vom Peer kommt
    handleRemoteMessage(msg) {
        this.logger.debug(`Received remote effect command: ${msg.subType} for ${msg.id}`);
        switch (msg.subType) {
            case 'start':
                this.startEffect(msg.id, true);
                break;
            case 'stop':
                // Wenn ein Effekt aktiv ist und die ID übereinstimmt, stoppe ihn.
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
