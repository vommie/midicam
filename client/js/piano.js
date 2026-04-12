import { SoundPlayer } from "./soundPlayer.js";

export class Pianos {

    constructor() {
        this.midiEnabled = false;
        this.pianos = [];
        this.keys = this.createKeys();
        this.logger = {
            info: () => {},
            debug: () => {},
            error: console.error
        };
    }

    _getStorageKey(id) {
        return `piano_settings_${id}`;
    }

    savePianoSettings(id, opts) {
        const settingsToSave = {
            sendMidi: opts.sendMidi,
            receiveMidi: opts.receiveMidi,
            playMidiNotes: opts.playMidiNotes,
            keyPressedLocalRGB: opts.keyPressedLocalRGB,
            keyPressedRemoteRGB: opts.keyPressedRemoteRGB,
            fromKey: opts.fromKey,
            toKey: opts.toKey,
            height: opts.height
        };
        try {
            localStorage.setItem(this._getStorageKey(id), JSON.stringify(settingsToSave));
            this.logger.debug(`Piano ${id} settings saved to localStorage.`);
        } catch (e) {
            this.logger.error(`Failed to save piano ${id} settings:`, e);
        }
    }

    loadPianoSettings(id) {
        try {
            const savedSettings = localStorage.getItem(this._getStorageKey(id));
            if (savedSettings) {
                this.logger.info(`Piano ${id} settings loaded from localStorage.`);
                return JSON.parse(savedSettings);
            }
        } catch (e) {
            this.logger.error(`Failed to load or parse piano ${id} settings:`, e);
        }
        return {};
    }

    requestMidi() {
        if(this.midiEnabled) return;
        document.addEventListener("DOMContentLoaded", ()=> {
            if (navigator.requestMIDIAccess) {
                navigator.requestMIDIAccess()
                    .then(this.onMIDISuccess, this.onMIDIFailure);
            } else {
                this.logger.warn('Web MIDI API not supported in this browser.');
            }
        });
    }

    onMIDIFailure = () => {
        this.logger.error('No midi device access!');
        this.midiEnabled = false;
    }

    onMIDISuccess = (midiAccess) => {
        this.logger.info('Midi access available.');
        this.midiEnabled = true;
        for(let input of midiAccess.inputs.values()) {
            input.onmidimessage = this.getMIDIMessage;
        }
    }

    getMIDIMessage = (message, src='local') => {
        const command = message.data[0];
        const note = message.data[1];
        const velocity = (message.data.length > 2) ? message.data[2] : 0;

        switch(command) {
            case 144: // noteOn
                if (velocity > 0) {
                    this.noteOn(note, velocity, src);
                } else {
                    this.noteOff(note, src);
                }
                break;
            case 128: // noteOff
                this.noteOff(note, src);
                break;
            case 176: // CC command
                if(note === 64) { // sustain pedal
                    this.sustainPedal(velocity, src);
                }
                else if(note === 66) { // sostenuto pedal
                    this.sostenutoPedal(velocity === 127, src);
                }
                else if(note === 67) { // soft pedal
                    this.softPedal(velocity === 127, src);
                }
                break;
        }
    }

    noteOn = (note, velocity, src = 'local') => {
        this.pianos.forEach(piano => piano.handleNoteOn(note, velocity, src));
    }

    noteOff = (note, src = 'local') => {
        this.pianos.forEach(piano => piano.handleNoteOff(note, src));
    }

    sustainPedal(velocity, src) {
        this.pianos.forEach(piano => piano.sustainPedal(velocity, src));
    }

    sostenutoPedal(state, src) {
        this.pianos.forEach(piano => piano.sostenutoPedal(state, src));
    }

    softPedal(state, src) {
        this.pianos.forEach(piano => piano.softPedal(state, src));
    }

    createPiano(opts = {}, logger = false) {
        if(logger) this.logger = logger;

        const pianoId = this.pianos.length;
        const loadedOpts = this.loadPianoSettings(pianoId);
        const finalOpts = { ...opts, ...loadedOpts };

        if(finalOpts.fromKey == undefined) finalOpts.fromKey = 1;
        if(finalOpts.toKey == undefined) finalOpts.toKey = 88;
        if(finalOpts.sendMidi == undefined) finalOpts.sendMidi = true;
        if(finalOpts.receiveMidi == undefined) finalOpts.receiveMidi = true;
        if(finalOpts.playMidiNotes == undefined) finalOpts.playMidiNotes = false;
        if(!this.validateOptRGBArray(finalOpts.keyPressedLocalRGB)) finalOpts.keyPressedLocalRGB = [0, 255, 0];
        if(!this.validateOptRGBArray(finalOpts.keyPressedRemoteRGB)) finalOpts.keyPressedRemoteRGB = [255, 0, 0];
        if(finalOpts.pedalSoft == undefined) finalOpts.pedalSoft = true;
        if(finalOpts.pedalSostenuto == undefined) finalOpts.pedalSostenuto = true;
        if(finalOpts.pedalSustain == undefined) finalOpts.pedalSustain = true;
        if(finalOpts.undampedStrings == undefined) finalOpts.undampedStrings =['G6', 'C8'];
        else if(finalOpts.undampedStrings === false) finalOpts.undampedStrings = [];

        const piano = new Piano(pianoId, this.keys, finalOpts, this);
        this.pianos.push(piano);
    }

    validateOptRGBArray(array) {
        if(array == undefined) return false;
        if(!Array.isArray(array)) {
            this.logger.error('The RGB option is not an array.');
            return false;
        }
        if(array.length !== 3) {
            this.logger.error('The RGB option does not contain exactly three elements.');
            return false;
        }
        for(let i = 0; i < array.length; i++) {
            if (typeof array[i] !== 'number' || !Number.isInteger(array[i]) || array[i] < 0 || array[i] > 255) {
                this.logger.error('An entry of the RGB option array is not an integer between 0 and 255.');
                return false;
            }
        }
        return true;
    }

    createKeys() {
        let keys = {}, octave = 0;
        const blackKeyIndexes = [0, 2, 5, 7, 10];
        for(let i = 1; i <= 88; i++) {
            let keyIndex = i % 12;
            keys[i] = this.createKey(octave, (octave * 12) + (i+8)%12, blackKeyIndexes.includes(keyIndex));
            if(keyIndex === 3) octave++;
        }
        return keys;
    }

    createKey(octave, pitch, isBlack) {
        let key = {};
        if(octave === parseInt(octave, 10) && octave >= 0 && octave < 9) key.octave = octave;
        else throw Error('Octave must be between 0 and 8');
        key.pitch = pitch;
        key.isBlack = isBlack;
        return key;
    }
}

class Piano {

    constructor(id, keys, opts = {}, manager) {
        this.id = id;
        this.keys = keys;
        this.manager = manager;
        this.logger = manager.logger;
        this.opts = { ...opts };

        this.boxShadows = {};
        this.scaleFactor = 1;

        this.sustainedKeyIds = new Set();
        this.pressedKeys = new Set();

        this.soundPlayer = new SoundPlayer(this.logger);

        if(this.opts.undampedStrings.length > 1) {
            this.opts.undampedStrings = this.getUndampedStringsRangeNotes(this.opts.undampedStrings[0], this.opts.undampedStrings[1]);
        }

        this.logger.info(`Creating new Piano (ID: ${this.id})`);
        this.logger.debug(`Piano ${this.id} created with options: ${JSON.stringify(this.opts)}`);

        this.pedalStates = { soft: false, sostenuto: false, sustain: false };
        this.pendingVisualUpdates = new Map();
        this.pendingPedalUpdates = new Map();
        this.visualFrameRequested = false;

        this.templates = this.getTemplates();
        this.elements = {};
        this.elements.piano = this.insertPiano();
        this.elements.keys = [];
        this.elements.pedals = this.initPedalElements();

        if (this.opts.height) {
            this.elements.piano.container.style.height = `${this.opts.height}px`;
        }

        this.createSettingsUI();
        this.updateDynamicStyles();
        this.setPedalButtonsVisibility();
        this.insertKeys();

        this.activePointers = new Map();
        this.initPointerHandling();

        if(!opts.noScale === true) this.handleResize();
        this.initResizing();
        this.sendMidiMessage = this.opts.sendMidiMessage || (() => {});

        if (this.opts.playMidiNotes) {
            this.soundPlayer.preload();
        }

        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                if (this.visualFrameRequested) {
                    this.applyVisualUpdates();
                }
                this.releaseAllLocalKeys();
            }
        });
    }

    queueVisualUpdate(keyId, velocity, src, state) {
        this.pendingVisualUpdates.set(keyId, { velocity, src, state });
        if (!this.visualFrameRequested) {
            this.visualFrameRequested = true;
            if (document.hidden) {
                queueMicrotask(() => this.applyVisualUpdates());
            } else {
                requestAnimationFrame(() => this.applyVisualUpdates());
            }
        }
    }

    queuePedalVisualUpdate(pedalName, state, src) {
        this.pendingPedalUpdates.set(pedalName, { state, src });
        if (!this.visualFrameRequested) {
            this.visualFrameRequested = true;
            if (document.hidden) {
                queueMicrotask(() => this.applyVisualUpdates());
            } else {
                requestAnimationFrame(() => this.applyVisualUpdates());
            }
        }
    }

    applyVisualUpdates() {
        this.visualFrameRequested = false;

        this.pendingVisualUpdates.forEach((data, keyId) => {
            const keyElement = this.elements.keys[keyId];
            if (!keyElement) return;
            if (data.state === 'on') {
                this.addKeyPressedStyle(keyElement, data.velocity, data.src);
            } else {
                this.removeKeyPressedStyle(keyElement);
            }
        });
        this.pendingVisualUpdates.clear();

        this.pendingPedalUpdates.forEach((data, pedalName) => {
            const pedalElement = this.elements.pedals[pedalName];
            if (!pedalElement) return;

            if (data.state) {
                pedalElement.classList.add('active', data.src);
                if (pedalName === 'soft') this.elements.piano.container.classList.add('soft');
            } else {
                pedalElement.classList.remove('active', 'local', 'remote');
                if (pedalName === 'soft') this.elements.piano.container.classList.remove('soft');
            }
        });
        this.pendingPedalUpdates.clear();
    }

    updateDynamicStyles() {
        const [r, g, b] = this.opts.keyPressedLocalRGB;
        const newR = Math.round(r * 0.9 + 255 * 0.2);
        const newG = Math.round(g * 0.9 + 255 * 0.2);
        const newB = Math.round(b * 0.9 + 255 * 0.2);

        const tintedColor = `rgb(${Math.min(255, newR)}, ${Math.min(255, newG)}, ${Math.min(255, newB)})`;

        this.elements.piano.container.style.setProperty('--local-hover-color-white', tintedColor);
        this.elements.piano.container.style.setProperty('--local-hover-color-black', tintedColor);
    }

    getTemplates() {
        let templates = {}
        const piano = document.createElement('div');
        piano.classList.add('piano');
        piano.innerHTML = `
        <div class="piano-resize-handle" title="Drag to resize piano height"></div>
        <div class="case">
            <div class="piano-settings-container"></div>
            <div class="pedals">
                <div class="pedal-soft"><button id="pedal-soft-${this.id}">Soft</button></div>
                <div class="pedal-sostenuto"><button id="pedal-sostenuto-${this.id}">Sost</button></div>
                <div class="pedal-sustain"><button id="pedal-sustain-${this.id}">Sus</button></div>
            </div>
        </div>
        <div class="felt"></div>
        <div class="bar white"></div>
        <div class="bar black"></div>`;
        templates['piano'] = piano;

        const pianoKey = document.createElement('div');
        pianoKey.classList.add('piano-key');
        templates['pianoKey'] = pianoKey;
        return templates;
    }

    insertPiano() {
        let piano = this.templates.piano.cloneNode(true);
        piano.dataset['id'] = this.id;
        if(this.opts.inline) piano.classList.add('inline');
        try {
            if(this.opts.selector) {
                let hookElement = document.querySelector(this.opts.selector);
                if(hookElement) {
                    hookElement.appendChild(piano);
                    this.logger.info(`Inserted piano to element with selector "${this.opts.selector}"`);
                }
                else throw `Cannot find element for given piano selector "${this.opts.selector}"`;
            }
            else document.body.appendChild(piano);
        }
        catch(err) {
            this.logger.error(err);
        }
        return {
            container: piano,
            barWhite: piano.querySelector('.bar.white'),
            barBlack: piano.querySelector('.bar.black'),
            case: piano.querySelector('.case'),
            resizeHandle: piano.querySelector('.piano-resize-handle')
        };
    }

    initResizing() {
        this.boundResize = this.resize.bind(this);
        this.boundStopResize = this.stopResize.bind(this);

        this.elements.piano.resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.elements.piano.resizeHandle.classList.add('is-dragging');
            document.addEventListener('mousemove', this.boundResize);
            document.addEventListener('mouseup', this.boundStopResize);
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
        });
    }

    resize(e) {
        const mainRect = this.elements.piano.container.parentElement.getBoundingClientRect();
        const newHeight = mainRect.bottom - e.clientY;
        const minHeight = 80;

        requestAnimationFrame(() => {
            this.elements.piano.container.style.height = `${Math.max(minHeight, newHeight)}px`;
            this.resizePiano();
        });
    }

    stopResize() {
        document.removeEventListener('mousemove', this.boundResize);
        document.removeEventListener('mouseup', this.boundStopResize);

        this.elements.piano.resizeHandle.classList.remove('is-dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        this.opts.height = this.elements.piano.container.offsetHeight;
        this.manager.savePianoSettings(this.id, this.opts);
        this.logger.info(`Piano height set to ${this.opts.height}px and saved.`);
    }

    insertKeys() {
        this.logger.info(`Piano ${this.id}: rendering keys, active range from ${this.opts.fromKey} to ${this.opts.toKey}`);
        for (let i = 1; i <= 88; i++) {
            if (this.keys[i] == undefined) return;
            this.insertKey(i, i === 1, i === 88);
        }
    }

    insertKey(id, isFirstKey, isLastKey) {
        let barWhite = this.elements.piano.barWhite;
        let barBlack = this.elements.piano.barBlack;
        if(!this.keys[id].isBlack) {
            barWhite.appendChild(this.createKey(id));
            try {
                if(!this.keys[id+1].isBlack) {
                    barBlack.appendChild(this.createKey(false,true));
                }
            } catch(error) {}
            if(!isLastKey) barBlack.appendChild(this.createKey(false, true, isFirstKey));
        }
        else {
            if(isFirstKey) {
                barWhite.appendChild(this.createKey(id-1));
                barBlack.appendChild(this.createKey(id, true, true));
            }
            barBlack.appendChild(this.createKey(id));
            if(isLastKey) {
                barWhite.appendChild(this.createKey(id+1));
            }
        }
    }

    createKey(id, hidden = false, offset = false) {
        let key = this.templates.pianoKey.cloneNode(true);
        if(id) {
            key.dataset.id = id;
            key.dataset.midiNote = id + 20;

            if (!this.isKeyInRange(id)) {
                key.classList.add('out-of-range');
            }
            this.elements.keys[id] = key;
        }
        if(hidden) key.classList.add('hidden');
        if(offset) key.classList.add('offset');
        key.innerHTML = `<div class="key-pressed"></div>`;
        return key;
    }

    initPointerHandling() {
        const container = this.elements.piano.container;

        container.addEventListener('pointerdown', this.handlePointerDown.bind(this));
        container.addEventListener('pointermove', this.handlePointerMove.bind(this));

        window.addEventListener('pointerup', this.handlePointerUp.bind(this));
        window.addEventListener('pointercancel', this.handlePointerUp.bind(this));
        window.addEventListener('blur', () => this.releaseAllLocalKeys());
    }

    handlePointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        const keyEl = e.target.closest('.piano-key');
        if (!keyEl) return;

        const id = parseInt(keyEl.dataset.id, 10);
        if (!this.isKeyInRange(id)) return;

        this.activePointers.set(e.pointerId, id);
        this.triggerLocalNoteOn(id, 127);

        try { this.elements.piano.container.setPointerCapture(e.pointerId); } catch(err) {}
    }

    handlePointerMove(e) {
        if (!this.activePointers.has(e.pointerId)) return;

        const el = document.elementFromPoint(e.clientX, e.clientY);
        const keyEl = el ? el.closest('.piano-key') : null;
        const previousId = this.activePointers.get(e.pointerId);

        if (!keyEl) {
            if (previousId) {
                this.triggerLocalNoteOff(previousId);
                this.activePointers.set(e.pointerId, null);
            }
            return;
        }

        const id = parseInt(keyEl.dataset.id, 10);
        if (!this.isKeyInRange(id)) {
            if (previousId) {
                this.triggerLocalNoteOff(previousId);
                this.activePointers.set(e.pointerId, null);
            }
            return;
        }

        if (id !== previousId) {
            if (previousId) this.triggerLocalNoteOff(previousId);
            this.activePointers.set(e.pointerId, id);
            this.triggerLocalNoteOn(id, 127);
        }
    }

    handlePointerUp(e) {
        if (!this.activePointers.has(e.pointerId)) return;

        const previousId = this.activePointers.get(e.pointerId);
        if (previousId) {
            this.triggerLocalNoteOff(previousId);
        }

        this.activePointers.delete(e.pointerId);
        try { this.elements.piano.container.releasePointerCapture(e.pointerId); } catch(err) {}
    }

    triggerLocalNoteOn(id, velocity) {
        this.queueVisualUpdate(id, velocity, 'local', 'on');
        this.playNote(id, velocity);
        if (this.opts.sendMidi) {
            const midiNote = parseInt(this.elements.keys[id].dataset.midiNote, 10);
            this.sendMidiMessage(new Uint8Array([144, midiNote, velocity]));
        }
    }

    triggerLocalNoteOff(id) {
        this.queueVisualUpdate(id, 0, 'local', 'off');
        this.stopNote(id);
        if (this.opts.sendMidi) {
            const midiNote = parseInt(this.elements.keys[id].dataset.midiNote, 10);
            this.sendMidiMessage(new Uint8Array([128, midiNote, 0]));
        }
    }

    releaseAllLocalKeys() {
        this.activePointers.forEach((keyId) => {
            if (keyId) this.triggerLocalNoteOff(keyId);
        });
        this.activePointers.clear();
    }

    createSettingsUI() {
        const container = this.elements.piano.case.querySelector('.piano-settings-container');
        const id = this.id;

        const settingsHTML = `
            <div class="piano-settings">
                <div class="setting-item">
                    <label for="sendMidi-${id}">Send MIDI</label>
                    <label class="toggle-switch">
                        <input type="checkbox" id="sendMidi-${id}" ${this.opts.sendMidi ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <div class="peer-status-led" id="peer-receive-status-led-${id}" title="Indicates if the peer has 'Receive MIDI' enabled. If red, your MIDI is not processed by the peer."></div>
                </div>
                 <div class="setting-item">
                    <label for="receiveMidi-${id}">Receive MIDI</label>
                    <label class="toggle-switch">
                        <input type="checkbox" id="receiveMidi-${id}" ${this.opts.receiveMidi ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <div class="peer-status-led" id="peer-send-status-led-${id}" title="Indicates if the peer has 'Send MIDI' enabled. If red, you will not receive MIDI from the peer."></div>
                </div>
                <div class="setting-item">
                    <label for="playMidiNotes-${id}">Play Notes</label>
                    <label class="toggle-switch">
                        <input type="checkbox" id="playMidiNotes-${id}" ${this.opts.playMidiNotes ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="setting-item">
                    <label for="localColor-${id}">Local Color</label>
                    <input type="color" id="localColor-${id}" value="${this.rgbToHex(this.opts.keyPressedLocalRGB)}">
                </div>
                <div class="setting-item">
                    <label for="remoteColor-${id}">Remote Color</label>
                    <input type="color" id="remoteColor-${id}" value="${this.rgbToHex(this.opts.keyPressedRemoteRGB)}">
                </div>
                <div class="setting-item range-setting">
                    <label for="fromKey-${id}">Key Range</label>
                    <div class="dual-range-container">
                        <div class="dual-range-slider">
                            <input type="range" id="fromKey-${id}" min="1" max="88" value="${this.opts.fromKey}">
                            <input type="range" id="toKey-${id}" min="1" max="88" value="${this.opts.toKey}">
                            <div class="range-track"></div>
                        </div>
                        <div class="range-values">${this.opts.fromKey} - ${this.opts.toKey}</div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = settingsHTML;
        this.addSettingsEventListeners();
        this.updateDualRangeSliderVisuals();
    }

    addSettingsEventListeners() {
        const id = this.id;
        document.getElementById(`sendMidi-${id}`).addEventListener('change', this.handleSettingsChange);
        document.getElementById(`receiveMidi-${id}`).addEventListener('change', this.handleSettingsChange);
        document.getElementById(`playMidiNotes-${id}`).addEventListener('change', this.handleSettingsChange);
        document.getElementById(`localColor-${id}`).addEventListener('input', this.handleSettingsChange);
        document.getElementById(`remoteColor-${id}`).addEventListener('input', this.handleSettingsChange);
        document.getElementById(`fromKey-${id}`).addEventListener('input', this.handleRangeSliderInput);
        document.getElementById(`toKey-${id}`).addEventListener('input', this.handleRangeSliderInput);
        document.getElementById(`fromKey-${id}`).addEventListener('change', this.handleSettingsChange);
        document.getElementById(`toKey-${id}`).addEventListener('change', this.handleSettingsChange);
    }

    handleSettingsChange = () => {
        const id = this.id;
        const newOpts = {
            sendMidi: document.getElementById(`sendMidi-${id}`).checked,
            receiveMidi: document.getElementById(`receiveMidi-${id}`).checked,
            playMidiNotes: document.getElementById(`playMidiNotes-${id}`).checked,
            keyPressedLocalRGB: this.hexToRgb(document.getElementById(`localColor-${id}`).value),
            keyPressedRemoteRGB: this.hexToRgb(document.getElementById(`remoteColor-${id}`).value),
            fromKey: parseInt(document.getElementById(`fromKey-${id}`).value, 10),
            toKey: parseInt(document.getElementById(`toKey-${id}`).value, 10),
        };
        this.updateSettings(newOpts);
    }

    updateSettings(newOpts) {
        this.logger.debug(`Updating piano ${this.id} settings dynamically.`);
        const oldOpts = { ...this.opts };
        this.opts = { ...this.opts, ...newOpts };

        if (JSON.stringify(oldOpts.keyPressedLocalRGB) !== JSON.stringify(this.opts.keyPressedLocalRGB)) {
            this.updateDynamicStyles();
        }

        if (oldOpts.fromKey !== this.opts.fromKey || oldOpts.toKey !== this.opts.toKey) {
            this.updateKeyRangeStyles();
        }

        if (this.opts.playMidiNotes && !oldOpts.playMidiNotes) {
            this.soundPlayer.preload();
        }

        this.manager.savePianoSettings(this.id, this.opts);

        if (this.opts.onSettingsChange) {
            this.opts.onSettingsChange(this.opts);
        }
    }

    updateKeyRangeStyles() {
        this.logger.debug(`Updating key range styles for piano ${this.id}: ${this.opts.fromKey}-${this.opts.toKey}`);
        for (let i = 1; i <= 88; i++) {
            const keyElement = this.elements.keys[i];
            if (keyElement) {
                if (this.isKeyInRange(i)) {
                    keyElement.classList.remove('out-of-range');
                } else {
                    keyElement.classList.add('out-of-range');
                    this.removeKeyPressedStyle(keyElement);
                }
            }
        }
    }

    handleRangeSliderInput = () => {
        const fromSlider = document.getElementById(`fromKey-${this.id}`);
        const toSlider = document.getElementById(`toKey-${this.id}`);
        let fromVal = parseInt(fromSlider.value, 10);
        let toVal = parseInt(toSlider.value, 10);

        if (fromVal >= toVal) {
             [fromSlider.value, toSlider.value] = [toVal, fromVal];
        }

        this.updateDualRangeSliderVisuals();

        const currentFrom = parseInt(fromSlider.value, 10);
        const currentTo = parseInt(toSlider.value, 10);

        if (this.opts.fromKey !== currentFrom || this.opts.toKey !== currentTo) {
            this.opts.fromKey = currentFrom;
            this.opts.toKey = currentTo;
            this.updateKeyRangeStyles();
        }
    }

    updateDualRangeSliderVisuals = () => {
        const id = this.id;
        const fromSlider = document.getElementById(`fromKey-${id}`);
        const toSlider = document.getElementById(`toKey-${id}`);
        const fromVal = parseInt(fromSlider.value, 10);
        const toVal = parseInt(toSlider.value, 10);

        const container = fromSlider.closest('.dual-range-container');
        if (!container) return;

        const rangeValues = container.querySelector('.range-values');
        const rangeTrack = container.querySelector('.range-track');

        rangeValues.textContent = `${fromVal} - ${toVal}`;

        const min = parseInt(fromSlider.min, 10);
        const max = parseInt(fromSlider.max, 10);

        const fromPercent = ((fromVal - min) / (max - min)) * 100;
        const toPercent = ((toVal - min) / (max - min)) * 100;

        rangeTrack.style.left = `${fromPercent}%`;
        rangeTrack.style.width = `${toPercent - fromPercent}%`;
    }

    rgbToHex(rgb) {
        if (!rgb) return '#000000';
        return "#" + rgb.map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? "0" + hex : hex;
        }).join('');
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : [0, 0, 0];
    }

    initPedalElements() {
        const container = this.elements.piano.case.querySelector('.pedals');
        let elements = {
            'container': container,
            'soft': container.querySelector(`#pedal-soft-${this.id}`),
            'sostenuto': container.querySelector(`#pedal-sostenuto-${this.id}`),
            'sustain': container.querySelector(`#pedal-sustain-${this.id}`),
        }
        elements.soft.addEventListener('pointerdown', e => { this.softPedal(null, 'local'); });
        elements.sostenuto.addEventListener('pointerdown', e => { this.sostenutoPedal(null, 'local'); });
        elements.sustain.addEventListener('pointerdown', e => { this.sustainPedal(null, 'local'); });
        return elements;
    }

    getKeyName(id, includeOctave = false, accidental = false, useUnicodeAccidental = true) {
        const noteNames = { 1: 'A', 3: 'B', 4: 'C', 6: 'D', 8: 'E', 9: 'F', 11: 'G' };
        let keyIndex = id % 12;
        let keyLeftIndex = keyIndex === 0 ? 11 : keyIndex -1;
        let keyRightIndex = keyIndex === 11 ? 0 : keyIndex +1;
        let octave = this.keys[id].octave;
        const flatChar = useUnicodeAccidental ? '♭' : 'b';
        const majorChar = useUnicodeAccidental ? '♯' : '#';

        if(keyIndex in noteNames) {
            if(!accidental || (keyIndex !== 3 && keyIndex !== 8)) return includeOctave ? `${noteNames[keyIndex]}${octave}` : noteNames[keyIndex];
            else if(!accidental || (keyIndex === 3 || keyIndex === 8)) return includeOctave ? `${noteNames[keyIndex]}${octave}` : noteNames[keyIndex];
            else if(accidental == 'flat') return includeOctave ? `${noteNames[keyRightIndex]}${flatChar}${octave}` : `${noteNames[keyRightIndex]}${flatChar}`;
            else if(accidental == 'major') return includeOctave ? `${noteNames[keyLeftIndex]}${majorChar}${octave}` : `${noteNames[keyLeftIndex]}${flatChar}`;
        } else {
            if(!accidental) return includeOctave ? `${noteNames[keyLeftIndex]}${majorChar}${octave}/${noteNames[keyRightIndex]}${flatChar}${octave}` : `${noteNames[keyLeftIndex]}${majorChar}/${noteNames[keyRightIndex]}${flatChar}`;
            else if(accidental == 'flat') return includeOctave ? `${noteNames[keyRightIndex]}${flatChar}${octave}` : `${noteNames[keyRightIndex]}${flatChar}`;
            else if(accidental == 'major') return includeOctave ? `${noteNames[keyLeftIndex]}${majorChar}${octave}` : `${noteNames[keyLeftIndex]}${majorChar}`;
        }
    }

    isKeyInRange(id) {
        const keyId = parseInt(id, 10);
        return (keyId >= this.opts.fromKey && keyId <= this.opts.toKey);
    }

    handleNoteOn(note, velocity, src) {
        const keyId = note - 20;
        if (!this.isKeyInRange(keyId)) return;
        if (src === 'remote' && !this.opts.receiveMidi) return;

        const keyElement = this.elements.keys[keyId];
        if (keyElement) {
            this.queueVisualUpdate(keyId, velocity, src, 'on');
            this.pressedKeys.add(keyId);
            this.playNote(keyId, velocity);

            if (src === 'remote') {
                this.logger.debug(`Piano ${this.id}: Remote NoteOn -> ${this.getKeyName(keyId)} (vel: ${velocity})`);
            }
        }
    }

    handleNoteOff(note, src) {
        const keyId = note - 20;
        if (!this.isKeyInRange(keyId)) return;
        if (src === 'remote' && !this.opts.receiveMidi) return;

        const keyElement = this.elements.keys[keyId];
        if (keyElement) {
            this.queueVisualUpdate(keyId, 0, src, 'off');
            this.pressedKeys.delete(keyId);
            this.stopNote(keyId);

            if (src === 'remote') {
                this.logger.debug(`Piano ${this.id}: Remote NoteOff -> ${this.getKeyName(keyId)}`);
            }
        }
    }

    playNote(id, velocity = 127) {
        if(this.opts.playMidiNotes) {
            this.soundPlayer.playNote(this.getKeyName(id, true, 'major', false), velocity);
        }
    }

    stopNote(id) {
        const keyName = this.getKeyName(id, true, 'major', false);
        if(this.opts.undampedStrings.includes(keyName)) return;

        if (this.pedalStates.sustain) {
            this.sustainedKeyIds.add(parseInt(id, 10));
            return;
        }
        if (this.opts.playMidiNotes && this.soundPlayer) {
            this.soundPlayer.stopNote(keyName);
        }
    }

    handleResize() {
        const ro = new ResizeObserver(entries => {
            for(let entry of entries) { this.resizePiano(); }
        });
        ro.observe(this.elements.piano.container, window.body);
        window.addEventListener('resize', e => { this.resizePiano(); });
    }

    resizePiano() {
        this.elements.piano.container.style.maxWidth = `100%`;
        let pianoRect = this.elements.piano.container.getBoundingClientRect();
        let keyWhiteWidth = pianoRect.width / this.elements.piano.barWhite.childElementCount;
        let factor = keyWhiteWidth / 20;
        this.scaleFactor = factor;
        let keyBlackWidth = keyWhiteWidth / 4;

        this.elements.piano.container.style.maxWidth = `${pianoRect.width}px`;
        this.elements.piano.barWhite.style.gridAutoColumns = `${keyWhiteWidth}px`;
        this.elements.piano.barBlack.style.gridAutoColumns = `${keyBlackWidth}px`;

        let keysWhite = this.elements.piano.container.querySelectorAll(`.bar.white .piano-key`);
        this.boxShadows.keyWhite = `inset 0px ${-4*factor}px ${1*factor}px rgba(0, 0, 0, .5)`;
        for(let i = 0; i < keysWhite.length; i++) {
            let key = keysWhite[i];
            key.style.borderBottomLeftRadius = `${3*factor}px`;
            key.style.borderBottomRightRadius = `${3*factor}px`;
            key.style.boxShadow = this.boxShadows.keyWhite;
        }

        let keysBlack = this.elements.piano.container.querySelectorAll(`.bar.black .piano-key`);
        this.boxShadows.keyBlack = `inset 0px ${-4*factor}px ${1*factor}px rgba(255, 255, 255, .5)`;
        for(let i = 0; i < keysBlack.length; i++) {
            let key = keysBlack[i];
            key.style.borderBottomLeftRadius = `${1*factor}px`;
            key.style.borderBottomRightRadius = `${1*factor}px`;
            key.style.boxShadow = this.boxShadows.keyBlack;
            key.querySelector('.key-pressed').boxShadow = `inset 0px ${-4*factor}px ${1*factor}px rgba(255, 255, 255, .2)`;
        }

        this.elements.pedals.container.style.height = `${12.5*factor}px`;
        const pedalWidth = `${45*factor}px`;
        this.elements.pedals.soft.parentElement.style.width = pedalWidth;
        this.elements.pedals.sostenuto.parentElement.style.width = pedalWidth;
        this.elements.pedals.sustain.parentElement.style.width = pedalWidth;
    }

    addKeyPressedStyle(keyElement, velocity=127, src='local') {
        if(keyElement.classList.contains('active')) return;
        keyElement.classList.add('active');
        keyElement.style.background = `rgba(255, 255, 255, 1)`;
        keyElement.style.boxShadow = `none`;

        const midiColor = keyElement.querySelector('.key-pressed');
        const rgb = src == 'local' ? this.opts.keyPressedLocalRGB.join(',') : this.opts.keyPressedRemoteRGB.join(',');
        midiColor.style.background = `rgba(${rgb}, ${this.scaleTransparency(velocity)})`;

        if(keyElement.parentElement.classList.contains('white')) {
            midiColor.style.boxShadow = `inset 0px ${2*this.scaleFactor}px ${14*this.scaleFactor}px 0px rgba(0, 0, 0, .5)`;
        }
        else {
            midiColor.style.boxShadow = `inset 0px ${-1*this.scaleFactor}px ${1*this.scaleFactor}px 0px rgba(255, 255, 255, .2)`;
        }
    }

    removeKeyPressedStyle(keyElement) {
        if(!keyElement.classList.contains('active')) return;
        keyElement.classList.remove('active');
        keyElement.style.background = '';
        keyElement.style.boxShadow = keyElement.parentElement.classList.contains('white') ? this.boxShadows.keyWhite : this.boxShadows.keyBlack;
        const midiColor = keyElement.querySelector('.key-pressed');
        midiColor.style.background = '';
        midiColor.style.boxShadow = '';
    }

    softPedal(state, src='local') {
        if(!this.opts.pedalSoft) return;

        let activate;
        if (src === 'local') {
            activate = !this.pedalStates.soft;
            if(this.opts.sendMidi) this.sendMidiMessage(new Uint8Array([176, 67, activate ? 127 : 0]));
        } else {
            if (!this.opts.receiveMidi) return;
            activate = state;
        }

        this.pedalStates.soft = activate;
        this.queuePedalVisualUpdate('soft', activate, src);
    }

    sostenutoPedal(state, src='local') {
        if(!this.opts.pedalSostenuto) return;

        let activate;
        if (src === 'local') {
            activate = !this.pedalStates.sostenuto;
            if(this.opts.sendMidi) this.sendMidiMessage(new Uint8Array([176, 66, activate ? 127 : 0]));
        } else {
            if (!this.opts.receiveMidi) return;
            activate = state;
        }

        this.pedalStates.sostenuto = activate;
        this.queuePedalVisualUpdate('sostenuto', activate, src);
    }

    sustainPedal(velocity, src='local') {
        if(!this.opts.pedalSustain) return;

        let activate;
        if (src === 'local' && velocity === null) {
            activate = !this.pedalStates.sustain;
            if (this.opts.sendMidi) this.sendMidiMessage(new Uint8Array([176, 64, activate ? 127 : 0]));
        } else {
            if (src === 'remote' && !this.opts.receiveMidi) return;
            activate = velocity > 0;
        }

        this.pedalStates.sustain = activate;
        this.queuePedalVisualUpdate('sustain', activate, src);

        if (!activate) {
            this.sustainedKeyIds.forEach(id => {
                if (this.pressedKeys.has(id)) return;

                const keyName = this.getKeyName(id, true, 'major', false);
                if (this.opts.playMidiNotes && this.soundPlayer) {
                    this.soundPlayer.stopNote(keyName);
                }
            });
            this.sustainedKeyIds.clear();
        }
    }

    scaleTransparency(velocity) {
        let minVel = 0;
        let maxVel = 127;
        let minTransparency = 0.2;
        let maxTransparency = 1.0;
        return (velocity - minVel) * (maxTransparency - minTransparency) / (maxVel - minVel) + minTransparency;
    }

    setPedalButtonsVisibility(pedal=null, state=null) {
        if(pedal === null && state === null) {
            if(!this.opts.pedalSoft) this.elements.pedals.soft.style.display = 'none';
            if(!this.opts.pedalSostenuto) this.elements.pedals.sostenuto.style.display = 'none';
            if(!this.opts.pedalSustain) this.elements.pedals.sustain.style.display = 'none';
        }
        if(pedal === 'soft') {
            if(state) this.elements.pedals.soft.style.display = 'block';
            else this.elements.pedals.soft.style.display = 'none';
        }
        else if(pedal === 'sostenuto') {
            if(state) this.elements.pedals.sostenuto.style.display = 'block';
            else this.elements.pedals.sostenuto.style.display = 'none';
        }
        else if(pedal === 'sustain') {
            if(state) this.elements.pedals.sustain.style.display = 'block';
            else this.elements.pedals.sustain.style.display = 'none';
        }
    }

    getUndampedStringsRangeNotes(startNote, endNote) {
        const notes =['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const startOctave = parseInt(startNote.substring(1));
        const endOctave = parseInt(endNote.substring(1));
        const startNoteIndex = notes.indexOf(startNote.substring(0, 1));
        const endNoteIndex = notes.indexOf(endNote.substring(0, 1));

        let result = [];
        for(let i = startOctave; i <= endOctave; i++) {
            for(let j = (i === startOctave ? startNoteIndex : 0); j < notes.length; j++) {
                if(i === endOctave && j > endNoteIndex) break;
                result.push(notes[j] + i);
            }
        }
        return result;
    }

    updatePeerMidiStatus(status) {
        const receiveLed = document.getElementById(`peer-receive-status-led-${this.id}`);
        const sendLed = document.getElementById(`peer-send-status-led-${this.id}`);

        if (!receiveLed || !sendLed) return;

        if (status.canReceive) {
            receiveLed.classList.remove('warning');
        } else {
            receiveLed.classList.add('warning');
        }

        if (status.isSending) {
            sendLed.classList.remove('warning');
        } else {
            sendLed.classList.add('warning');
        }
    }

    resetPeerMidiStatus() {
        const receiveLed = document.getElementById(`peer-receive-status-led-${this.id}`);
        const sendLed = document.getElementById(`peer-send-status-led-${this.id}`);
        if (receiveLed) receiveLed.classList.remove('warning');
        if (sendLed) sendLed.classList.remove('warning');
    }
}
