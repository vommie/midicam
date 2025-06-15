import { SoundPlayer } from "./soundPlayer.js";

class Pianos {

    constructor() {
        this.midiEnabled = false;
        this.pianos = [];
        this.keys = this.createKeys();
    }

    _getStorageKey(id) {
        return `piano_settings_${id}`;
    }

    savePianoSettings(id, opts) {
        const settingsToSave = {
            enableMidi: opts.enableMidi,
            playMidiNotes: opts.playMidiNotes,
            keyPressedLocalRGB: opts.keyPressedLocalRGB,
            keyPressedRemoteRGB: opts.keyPressedRemoteRGB,
            fromKey: opts.fromKey,
            toKey: opts.toKey
        };
        try {
            localStorage.setItem(this._getStorageKey(id), JSON.stringify(settingsToSave));
            console.log(`Piano ${id} settings saved to localStorage.`);
        } catch (e) {
            console.error(`Failed to save piano ${id} settings:`, e);
        }
    }

    loadPianoSettings(id) {
        try {
            const savedSettings = localStorage.getItem(this._getStorageKey(id));
            if (savedSettings) {
                console.log(`Piano ${id} settings loaded from localStorage.`);
                return JSON.parse(savedSettings);
            }
        } catch (e) {
            console.error(`Failed to load or parse piano ${id} settings:`, e);
        }
        return {};
    }

    requestMidi() {
        if(this.midiEnabled) return;
        document.addEventListener("DOMContentLoaded", ()=> {
            navigator.requestMIDIAccess()
                .then(this.onMIDISuccess, this.onMIDIFailure);
        });
    }

    onMIDIFailure() {
        console.log('Error: No midi device acccess!');
        this.midiEnabled = false;
    }

    onMIDISuccess = (midiAccess) => {
        console.log('Midi access available.');
        this.midiEnabled = true;
        for(let input of midiAccess.inputs.values()) {
            input.onmidimessage = this.getMIDIMessage;
        }
    }

    getMIDIMessage = (message, src='local') => {
        let command = message.data[0];
        let note = message.data[1];
        let velocity = (message.data.length > 2) ? message.data[2] : 0;

        switch(command) {
            case 144: // noteOn
                if (velocity > 0) {
                    this.noteOn(note, velocity, src);
                } else {
                    this.noteOff(note);
                }
                break;
            case 128: // noteOff
                this.noteOff(note);
                break;
            case 176: // CC command
                if(note === 64) { // sustain pedal
                    this.sustainPedal(velocity);
                }
                else if(note === 66) { // sostenuto pedal
                    this.sostenutoPedal(velocity === 127);
                }
                else if(note === 67) { // soft pedal
                    this.softPedal(velocity === 127);
                }
                break;
        }
    }

    noteOn = (note, velocity, src='local') => {
        console.log('Note On: ', note, ', Velocity: ', velocity);
        this.pianos.forEach(piano=>{
            piano.elements.keys.forEach(keyElement=>{
                if(keyElement.dataset.midiNote == note) {
                    if(piano.opts.enableMidi) {
                        piano.addKeyPressedStyle(keyElement, velocity, src);
                        if(piano.pressedKeys.indexOf(keyElement.dataset.id) === -1) piano.pressedKeys.push(keyElement.dataset.id);
                    }
                    piano.playNote(keyElement.dataset.id, velocity);
                }
            });
        });
    }

    noteOff = (note) => {
        console.log('Note Off: ', note);
        this.pianos.forEach(piano=>{
            piano.elements.keys.forEach(keyElement=>{
                if(keyElement.dataset.midiNote == note) {
                    if(piano.opts.enableMidi) {
                        piano.removeKeyPressedStyle(keyElement);
                        piano.pressedKeys.splice(piano.pressedKeys.indexOf(keyElement.dataset.id), 1);
                    }
                    if(piano.opts.playMidiNotes) {
                        piano.stopNote(keyElement.dataset.id);
                    }
                }
            });
        });
    }

    sustainPedal(velocity) {
        console.log('Sustain Pedal: ', velocity);
        this.pianos.forEach(piano=>{
            piano.sustainPedal(velocity, 'local');
        });
    }

    sostenutoPedal(state) {
        console.log('Sostenuto Pedal: ', state);
        this.pianos.forEach(piano=>{
            piano.sostenutoPedal(state, 'local');
        });
    }

    softPedal(state) {
        console.log('Soft Pedal: ', state);
        this.pianos.forEach(piano=>{
            piano.softPedal(state, 'local');
        });
    }

    // MODIFIZIERT: Lädt Einstellungen, bevor das Klavier erstellt wird
    createPiano(opts = {}) {
        const pianoId = this.pianos.length;
        const loadedOpts = this.loadPianoSettings(pianoId);

        // Standard-Optionen mit geladenen Optionen zusammenführen
        // Geladene Optionen überschreiben die Standardwerte
        const finalOpts = { ...opts, ...loadedOpts };

        if(finalOpts.fromKey == undefined) finalOpts.fromKey = 1;
        if(finalOpts.toKey == undefined) finalOpts.toKey = 88;
        if(finalOpts.enableMidi == undefined) finalOpts.enableMidi = true;
        if(finalOpts.playMidiNotes == undefined) finalOpts.playMidiNotes = false;
        if(!this.validateOptRGBArray(finalOpts.keyPressedLocalRGB)) finalOpts.keyPressedLocalRGB = [0, 255, 0];
        if(!this.validateOptRGBArray(finalOpts.keyPressedRemoteRGB)) finalOpts.keyPressedRemoteRGB = [255, 0, 0];
        if(finalOpts.pedalSoft == undefined) finalOpts.pedalSoft = true;
        if(finalOpts.pedalSostenuto == undefined) finalOpts.pedalSostenuto = true;
        if(finalOpts.pedalSustain == undefined) finalOpts.pedalSustain = true;
        if(finalOpts.enableMidi) this.requestMidi();
        if(finalOpts.undampedStrings == undefined) finalOpts.undampedStrings = ['G6', 'C8'];
        else if(finalOpts.undampedStrings === false) finalOpts.undampedStrings = [];

        const piano = new Piano(pianoId, this.keys, finalOpts, this);
        this.pianos.push(piano);
    }

    // MODIFIZIERT: Speichert die Einstellungen, wenn das Klavier neu erstellt wird
    recreatePiano(id, newOpts) {
        const oldPiano = this.pianos[id];
        if (!oldPiano) return;

        const finalOpts = { ...oldPiano.opts, ...newOpts };

        // HIER werden die Einstellungen gespeichert, da dies bei jeder Änderung aufgerufen wird
        this.savePianoSettings(id, finalOpts);

        const container = document.querySelector(oldPiano.opts.selector);
        if (container) {
            const pianoElement = container.querySelector(`.piano[data-id='${id}']`);
            if (pianoElement) pianoElement.remove();
        }

        const newPiano = new Piano(id, this.keys, finalOpts, this);
        this.pianos[id] = newPiano;
    }


    validateOptRGBArray(array) {
        if(array == undefined) return false;
        if(!Array.isArray(array)) {
            console.log('The RGB option is not an array.');
            return false;
        }
        if(array.length !== 3) {
            console.log('The RGB option does not contain exactly three elements.');
            return false;
        }
        for(let i = 0; i < array.length; i++) {
            if (typeof array[i] !== 'number' || !Number.isInteger(array[i]) || array[i] < 0 || array[i] > 255) {
                console.log('An entry of the RGB option array is not an integer between 0 and 255.');
                return false;
            }
        }
        return true;
    }

    /**
     * Creates all 88 keys with their specifications
     */
    createKeys() {
        let keys = {}, octave = 0;
        const blackKeyIndexes = [0, 2, 5, 7, 10];
        for(let i = 1; i <= 88; i++) {
            let keyIndex = i%12;
            keys[i] = this.createKey(octave, (octave * 12) + (i+8)%12, blackKeyIndexes.includes(keyIndex));
            if(keyIndex === 3) octave++;
        }
        return keys;
    }

    /**
     * Creates a single key
     * @param {int} octave
     * @param {int} pitch
     * @param {bool} isBlack
     */
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
        this.opts = opts;
        this.manager = manager;
        this.boxShadows = {};
        this.scaleFactor = 1;
        this.sustainedKeyIds = [];
        this.pressedKeys = [];
        this.soundPlayer = new SoundPlayer();
        if(opts.undampedStrings.length > 1) this.opts.undampedStrings = this.getUndampedStringsRangeNotes(opts.undampedStrings[0], opts.undampedStrings[1]);
        console.log('creating new Piano ...')
        this.templates = this.getTemplates();
        console.log(`piano ID: ${this.id}`);
        this.elements = {};
        this.elements.piano = this.insertPiano();
        this.elements.keys = [];
        this.elements.pedals = this.initPedalElements();
        this.createSettingsUI();
        this.setPedalButtonsVisibility();
        this.insertKeys();
        this.mouseIsDown = false;
        this.addMouseHandling();
        if(!opts.noScale === true) this.handleResize();
        this.sendMidiMessage = opts.sendMidiMessage || (() => {});
    }

    getTemplates() {
        let templates = {}
        const piano = document.createElement('div');
        piano.classList.add('piano');
        piano.innerHTML = `
        <div class="case">
            <div class="piano-settings-container"></div>
            <div class="pedals">
                <div class="pedal-soft"><button id="pedal-soft-${this.id}">Soft</div>
                <div class="pedal-sostenuto"><button id="pedal-sostenuto-${this.id}">Sost</div>
                <div class="pedal-sustain"><button id="pedal-sustain-${this.id}">Sus</div>
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
                    console.log(`Inserted piano to element with selector "${this.opts.selector}"`);
                }
                else throw `Cannot find element for given piano selector "${this.opts.selector}"`;
            }
            else document.body.appendChild(piano);;
        }
        catch(err) {
            console.error(err);
        }
        return {
            container: piano,
            barWhite: piano.querySelector('.bar.white'),
            barBlack: piano.querySelector('.bar.black'),
            case: piano.querySelector('.case')
        };
    }

    insertKeys() {
        let fromKey = this.opts.fromKey != undefined && this.opts.fromKey >= 1 ? this.opts.fromKey : 1;
        let toKey = this.opts.toKey && this.opts.toKey <= 88 ? this.opts.toKey : 88;
        console.log(`piano ${this.id}: insert keys from index ${fromKey} to ${toKey} ...`);
        for(let i = fromKey; i <= toKey; i++) {
            if(this.keys[i] == undefined) return;
            this.insertKey(i, i === fromKey, i === toKey);
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
            }
            catch(error) {};
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
            key.dataset.midiNote = id+20;
            key.addEventListener('mousedown', e=>{ this.onKeyPress(e); });
            key.addEventListener('mouseup', e=>{ this.onKeyRelease(e); });
            key.addEventListener('mousemove', e=>{ this.onMouseMove(e); });
            this.elements.keys[id] = key;
        }
        if(hidden) key.classList.add('hidden');
        if(offset) key.classList.add('offset');
        key.innerHTML = `<div class="key-pressed"></div>`;
        return key;
    }

    createSettingsUI() {
        const container = this.elements.piano.case.querySelector('.piano-settings-container');
        const id = this.id;

        const settingsHTML = `
            <div class="piano-settings">
                <div class="setting-item">
                    <label for="enableMidi-${id}">Enable MIDI</label>
                    <label class="toggle-switch">
                        <input type="checkbox" id="enableMidi-${id}" ${this.opts.enableMidi ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
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
                    <label>Key Range</label>
                    <div class="dual-range-slider">
                        <div class="range-values">${this.opts.fromKey} - ${this.opts.toKey}</div>
                        <input type="range" id="fromKey-${id}" min="1" max="88" value="${this.opts.fromKey}">
                        <input type="range" id="toKey-${id}" min="1" max="88" value="${this.opts.toKey}">
                        <div class="range-track"></div>
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
        document.getElementById(`enableMidi-${id}`).addEventListener('change', this.handleSettingsChange);
        document.getElementById(`playMidiNotes-${id}`).addEventListener('change', this.handleSettingsChange);
        document.getElementById(`localColor-${id}`).addEventListener('change', this.handleSettingsChange);
        document.getElementById(`remoteColor-${id}`).addEventListener('change', this.handleSettingsChange);
        document.getElementById(`fromKey-${id}`).addEventListener('input', this.handleRangeSliderInput);
        document.getElementById(`toKey-${id}`).addEventListener('input', this.handleRangeSliderInput);
        document.getElementById(`fromKey-${id}`).addEventListener('change', this.handleSettingsChange);
        document.getElementById(`toKey-${id}`).addEventListener('change', this.handleSettingsChange);
    }

    handleSettingsChange = () => {
        const id = this.id;
        const newOpts = {
            enableMidi: document.getElementById(`enableMidi-${id}`).checked,
            playMidiNotes: document.getElementById(`playMidiNotes-${id}`).checked,
            keyPressedLocalRGB: this.hexToRgb(document.getElementById(`localColor-${id}`).value),
            keyPressedRemoteRGB: this.hexToRgb(document.getElementById(`remoteColor-${id}`).value),
            fromKey: parseInt(document.getElementById(`fromKey-${id}`).value, 10),
            toKey: parseInt(document.getElementById(`toKey-${id}`).value, 10),
        };
        this.manager.recreatePiano(this.id, newOpts);
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
    }

    updateDualRangeSliderVisuals = () => {
        const id = this.id;
        const fromSlider = document.getElementById(`fromKey-${id}`);
        const toSlider = document.getElementById(`toKey-${id}`);
        const fromVal = parseInt(fromSlider.value, 10);
        const toVal = parseInt(toSlider.value, 10);
        const container = fromSlider.parentElement;
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
        elements.soft.addEventListener('click', e=>{this.softPedal(null, 'click');});
        elements.sostenuto.addEventListener('click', e=>{this.sostenutoPedal(null, 'click');});
        elements.sustain.addEventListener('click', e=>{this.sustainPedal(null, 'click');});
        return elements;
    }

    /**
     * Gets the name of a key based on it's ID
     *
     * @param {int} id The id of the key
     * @param {bool} includeOctave If true, the octave is included in the key name.
     * @param {string} accidental "flat" or "major". If not provided, both accidentals get returned separeted by a slash character.
     * @param {bool} useUnicodeAccidental If true, the accidentals are "♯" and "♭" instead of "#"" and "b".
     */
    getKeyName(id, includeOctave = false, accidental = false, useUnicodeAccidental = true) {
        const noteNames = { 1: 'A', 3: 'B', 4: 'C', 6: 'D', 8: 'E', 9: 'F', 11: 'G' };
        let keyIndex = id%12;
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
        }
        else {
            if(!accidental) return includeOctave ? `${noteNames[keyLeftIndex]}${majorChar}${octave}/${noteNames[keyRightIndex]}${flatChar}${octave}` : `${noteNames[keyLeftIndex]}${majorChar}/${noteNames[keyRightIndex]}${flatChar}`;
            else if(accidental == 'flat') return includeOctave ? `${noteNames[keyRightIndex]}${flatChar}${octave}` : `${noteNames[keyRightIndex]}${flatChar}`;
            else if(accidental == 'major') return includeOctave ? `${noteNames[keyLeftIndex]}${majorChar}${octave}` : `${noteNames[keyLeftIndex]}${majorChar}`;
        }
    }

    onKeyPress(e) {
        if(e.which != 1) return;
        let id = e.currentTarget.dataset.id;
        this.lastKeyId = id;
        console.log(`piano ${this.id}: key ${id} pressed: ${this.getKeyName(id, true)}`);
        this.addKeyPressedStyle(this.elements.keys[id]);
        this.playNote(id);
        this.sendMidiMessage(new Uint8Array([144, parseInt(this.elements.keys[id].dataset.midiNote), 127]));
    }

    onKeyRelease(e) {
        if(e.which != 1) return;
        let id = e.currentTarget.dataset.id;
        console.log(`piano ${this.id}: key ${id} released: ${this.getKeyName(id, true)}`);
        this.removeKeyPressedStyle(this.elements.keys[id]);
        this.stopNote(id);
        this.sendMidiMessage(new Uint8Array([128, parseInt(this.elements.keys[id].dataset.midiNote), 0]));
    }

    onMouseMove(e) {
        if(!this.mouseIsDown || e.which != 1) return;
        let id = e.currentTarget.dataset.id;
        if(id == this.lastKeyId) return;
        console.log(`piano ${this.id}: gliss from key ${this.lastKeyId} (${this.getKeyName(this.lastKeyId, true)}) to ${id} (${this.getKeyName(id, true)})`);
        this.removeKeyPressedStyle(this.elements.keys[this.lastKeyId]);
        this.stopNote(this.lastKeyId);
        this.sendMidiMessage(new Uint8Array([128, parseInt(this.elements.keys[this.lastKeyId].dataset.midiNote), 0]));
        this.lastKeyId = id;
        this.playNote(id);
        this.sendMidiMessage(new Uint8Array([144, parseInt(this.elements.keys[id].dataset.midiNote), 127]));
        this.addKeyPressedStyle(this.elements.keys[id]);
    }

    addMouseHandling() {
        this.elements.piano.container.addEventListener('mousedown', e => {
            this.mouseIsDown = true;
        });
        this.elements.piano.container.addEventListener('mouseup', e => {
            this.mouseIsDown = false;
        });
    }

    playNote(id, velocity = 127) {
        if(this.opts.playMidiNotes) this.soundPlayer.playNote(this.getKeyName(id, true, 'major', false), velocity);
    }

    stopNote(id) {
        const keyName = this.getKeyName(id, true, 'major', false);
        if(this.opts.undampedStrings.includes(keyName)) return;
        if(this.elements.pedals.sustain.classList.contains('active')) {
            if(this.sustainedKeyIds.indexOf(id) === -1)  this.sustainedKeyIds.push(id);
            return;
        }
        this.soundPlayer.stopNote(keyName);
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
        let keyWhiteWidth = pianoRect.width/this.elements.piano.barWhite.childElementCount;
        let factor = keyWhiteWidth/20;
        this.scaleFactor = factor;
        console.log(`piano ${this.id}: scaling factor ${factor}`);
        let keyBlackWidth = keyWhiteWidth/4;
        this.elements.piano.container.style.maxWidth = `${pianoRect.width}px`;
        this.elements.piano.barWhite.style.gridAutoColumns = `${keyWhiteWidth}px`;
        this.elements.piano.barBlack.style.gridAutoColumns = `${keyBlackWidth}px`;
        this.elements.piano.container.style.height = `${keyWhiteWidth*6}px`;

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
            key.querySelector('.key-pressed').boxShadow = `inset 0px ${-4*factor}px ${1*factor}px rgba(255, 255, 255, .5)`;
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
        const rgb = src == 'local' ? this.opts.keyPressedLocalRGB.join(',') : this.opts.keyPressedRemoteRGB.join(',');
        let activate = false;
        if(src === 'local') activate = this.elements.pedals.soft.classList.contains('active') ? false : true;
        else if(state) activate = true;
        if(activate) {
            this.elements.pedals.soft.classList.add('active');
            this.elements.pedals.soft.style.background = `rgba(${rgb}, 1)`;
            this.elements.piano.container.classList.add('soft');
        }
        else {
            this.elements.pedals.soft.classList.remove('active');
            this.elements.pedals.soft.style.background = '';
            this.elements.piano.container.classList.remove('soft');
        }
    }

    sostenutoPedal(state, src='local') {
        if(!this.opts.pedalSostenuto) return;
        const rgb = src == 'local' ? this.opts.keyPressedLocalRGB.join(',') : this.opts.keyPressedRemoteRGB.join(',');
        let activate = false;
        if(src === 'local') activate = this.elements.pedals.sostenuto.classList.contains('active') ? false : true;
        if(state) activate = true;
        if(activate) {
            this.elements.pedals.sostenuto.classList.add('active');
            this.elements.pedals.sostenuto.style.background = `rgba(${rgb}, 1)`;
        }
        else {
            this.elements.pedals.sostenuto.classList.remove('active');
            this.elements.pedals.sostenuto.style.background = '';
        }
    }

    sustainPedal(velocity, src='local') {
        if(!this.opts.pedalSustain) return;
        const rgb = src == 'local' ? this.opts.keyPressedLocalRGB.join(',') : this.opts.keyPressedRemoteRGB.join(',');
        let activate = false;
        if(velocity === null && src === 'local') activate = this.elements.pedals.sustain.classList.contains('active') ? false : true;
        else if(velocity) activate = true;
        if(activate) {
            const transparency = velocity ? this.scaleTransparency(velocity) : '1';
            this.elements.pedals.sustain.classList.add('active');
            this.elements.pedals.sustain.style.background = `rgba(${rgb}, ${transparency})`;
        }
        else {
            this.elements.pedals.sustain.classList.remove('active');
            this.elements.pedals.sustain.style.background = '';
            this.sustainedKeyIds.forEach(id=>{
                if(this.pressedKeys.includes(id)) return;
                this.stopNote(id);
                this.sendMidiMessage(new Uint8Array([128, id, 0]));
            });
            this.sustainedKeyIds = [];
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

    /**
     * Creates a range of note names based on a given start and end note.
     *
     * @param {string} startNote The starting note
     * @param {string} endNote The end note
     */
    getUndampedStringsRangeNotes(startNote, endNote) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
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

}

export {
    Pianos
}
