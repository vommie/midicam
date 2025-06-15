class Metronome {
    constructor(opts) {
        this.opts = opts;
        this.onStateChange = opts.onStateChange || (() => {});
        this.onTick = opts.onTick || (() => {});
        this.audioContext = opts.audioContext;
        this.soundBuffer = null;

        this.elements = {};
        this.isMaster = false;
        this.isPlaying = false;
        this.currentBeat = 0;

        this.nextBeatTime = 0;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.schedulerTimer = null;

        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        this.lastVolume = 1;

        this.loadSound();
        this.createTemplate();
        this.addEventListeners();
        this.adjustVolume(false);
    }

    async loadSound() {
        try {
            const response = await fetch('assets/samples/metronome/01.wav');
            const arrayBuffer = await response.arrayBuffer();
            this.soundBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        } catch(e) {
            console.error("Metronom-Sound konnte nicht geladen werden:", e);
        }
    }

    playSound(time) {
        if (!this.soundBuffer || this.gainNode.gain.value === 0) return;
        const source = this.audioContext.createBufferSource();
        source.buffer = this.soundBuffer;
        source.connect(this.gainNode);
        source.start(time);
    }

    scheduler() {
        if (!this.isMaster || !this.isPlaying) return;

        while (this.nextBeatTime < this.audioContext.currentTime + this.scheduleAheadTime) {
            this.playSound(this.nextBeatTime);
            this.scheduleVisualUpdate(this.nextBeatTime, this.currentBeat);

            this.onTick({
                beat: this.currentBeat,
                nextBeatTime: this.nextBeatTime,
                masterAudioTimeNow: this.audioContext.currentTime
            });

            const beatsPerMeasure = parseInt(this.elements.beatsInput.value);
            this.currentBeat = (this.currentBeat % beatsPerMeasure) + 1;
            this.nextBeatTime += 60.0 / this.getTempo('bpm');
        }
        this.schedulerTimer = setTimeout(() => this.scheduler(), this.lookahead);
    }

    handleMasterTick(data) {
        if (this.isMaster || !this.isPlaying) return;
        const timeToNextBeat = data.nextBeatTime - data.masterAudioTimeNow;
        const scheduledTime = this.audioContext.currentTime + timeToNextBeat;
        this.playSound(scheduledTime);
        this.scheduleVisualUpdate(scheduledTime, data.beat);
    }

    scheduleVisualUpdate(time, beatToVisualize) {
        const scheduleTime = (time - this.audioContext.currentTime) * 1000;
        setTimeout(() => this.setBeatVisual(beatToVisualize), scheduleTime);
    }

    start() {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        this.isPlaying = true;
        this.updatePlayButtonVisuals();

        if (this.isMaster) {
            this.currentBeat = 1;
            this.nextBeatTime = this.audioContext.currentTime + 0.05;
            this.scheduler();
        }
    }

    pause() {
        this.isPlaying = false;
        this.updatePlayButtonVisuals();
        this.elements.beatVisuals.forEach(visual => visual.classList.remove('active'));

        if (this.isMaster) {
            clearTimeout(this.schedulerTimer);
            this.schedulerTimer = null;
        }
    }

    setMaster(isMaster) {
        this.isMaster = isMaster;
        const container = this.elements.container.parentElement;
        container.classList.toggle('master', this.isMaster);
        container.classList.toggle('slave', !this.isMaster);
        if (this.isPlaying) {
            this.pause();
            this.start();
        }
    }

    claimMastership() {
        if (this.isMaster) return;
        this.setMaster(true);
        this.notifyStateChange(true);
    }

    setBeatVisual(beatNumber) {
        this.elements.beatVisuals.forEach((visual, index) => {
            if (index + 1 === beatNumber) visual.classList.add('active');
            else visual.classList.remove('active');
        });
    }

    createTemplate() {
        const container = document.createElement('div');
        container.classList.add('metronome');
        const bpm = this.loadBpm();
        const beats = this.loadBeats();
        const volume = this.loadVolume();
        container.innerHTML = `
        <input id="bpm" type="number" min=20 max=400 value="${bpm}" class="input-scrollable" readonly>
        <div id="tempo-name">${this.getTempoName(bpm)}</div>
        <div id="beat-visuals"></div>
        <div class="controls">
            <div class="play-beats-container">
                <button id="play" class="paused"></button>
                <input id="beats" type="number" min=1 max=6 value="${beats}" class="input-scrollable" readonly>
            </div>
            <div class="volume-control">
                <img src="assets/volume_metronome.svg" id="metronomeVolumeIcon" title="Mute metronome">
                <input type="range" id="metronomeVolume" min="0" max="1" step="0.05" value="${volume}" title="Metronome volume">
            </div>
        </div>
        `;
        this.elements.container = container;
        this.elements.bpmInput = container.querySelector('#bpm');
        this.elements.bpmName = container.querySelector('#tempo-name');
        this.elements.playBtn = container.querySelector('#play');
        this.elements.beatsInput = container.querySelector('#beats');
        this.elements.beatVisualsContainer = container.querySelector('#beat-visuals');
        this.elements.volumeSlider = container.querySelector('#metronomeVolume');
        this.elements.volumeIcon = container.querySelector('#metronomeVolumeIcon');
        this.updateBeatVisualsAmount(beats);
    }

    updatePlayButtonVisuals() {
        if (this.isPlaying) {
            this.elements.playBtn.classList.remove('paused');
        } else {
            this.elements.playBtn.classList.add('paused');
        }
    }

    adjustTempoNameFontSize() {
        const el = this.elements.bpmName;
        if (!el) return;

        const maxFontSize = 16;
        const minFontSize = 8;
        const containerWidth = el.clientWidth;

        let currentSize = maxFontSize;
        el.style.fontSize = `${currentSize}px`;

        while (el.scrollWidth > containerWidth && currentSize > minFontSize) {
            currentSize -= 0.5;
            el.style.fontSize = `${currentSize}px`;
        }
    }

    addEventListeners() {
        [this.elements.bpmInput, this.elements.beatsInput].forEach(input => {
            input.addEventListener('wheel', e => {
                e.preventDefault();
                const stepSize = e.ctrlKey ? 10 : 1;
                if (e.deltaY < 0) for (let i = 0; i < stepSize; i++) input.stepUp();
                else for (let i = 0; i < stepSize; i++) input.stepDown();
                input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            });
            document.addEventListener('click', e => { if (!input.contains(e.target)) input.readOnly = true; });
            input.addEventListener('dblclick', e => { input.readOnly = false; });
            input.addEventListener('focus', (e) => { if (input.readOnly) e.target.blur(); });
        });

        this.elements.bpmInput.addEventListener('input', () => {
            const bpm = parseInt(this.elements.bpmInput.value);
            this.elements.bpmName.textContent = this.getTempoName(bpm);
            localStorage.setItem('metronomeBpm', bpm);
            this.adjustTempoNameFontSize();
            this.notifyStateChange();
        });

        this.elements.beatsInput.addEventListener('input', () => {
            const beats = parseInt(this.elements.beatsInput.value);
            localStorage.setItem('metronomeBeats', beats);
            this.updateBeatVisualsAmount(beats);
            this.notifyStateChange();
        });

        this.elements.playBtn.addEventListener('click', () => {
            if (this.isPlaying) {
                this.pause();
            } else {
                this.start();
            }
            this.notifyStateChange();
        });

        this.elements.volumeSlider.addEventListener('input', () => {
            this.adjustVolume();
            this.lastVolume = this.elements.volumeSlider.value;
        });
        this.elements.volumeIcon.addEventListener('click', () => {
            if (parseFloat(this.elements.volumeSlider.value) > 0) {
                this.lastVolume = this.elements.volumeSlider.value;
                this.elements.volumeSlider.value = 0;
            } else {
                this.elements.volumeSlider.value = this.lastVolume > 0 ? this.lastVolume : 1;
            }
            this.adjustVolume();
        });
    }

    setState(state, isFromMasterClaim) {
        if (isFromMasterClaim) {
            this.setMaster(false);
        }
        if (this.elements.bpmInput.value != state.bpm) {
            this.elements.bpmInput.value = state.bpm;
            this.elements.bpmName.textContent = this.getTempoName(state.bpm);
            localStorage.setItem('metronomeBpm', state.bpm);
            this.adjustTempoNameFontSize();
        }
        if (this.elements.beatsInput.value != state.beats) {
            this.elements.beatsInput.value = state.beats;
            localStorage.setItem('metronomeBeats', state.beats);
            this.updateBeatVisualsAmount(state.beats);
        }
        if (this.isPlaying !== state.isPlaying) {
            if (state.isPlaying) {
                this.start();
            } else {
                this.pause();
            }
        } else if (this.isPlaying && this.isMaster) {
            this.pause();
            this.start();
        }
    }

    notifyStateChange(isClaimingMaster = false) {
        this.onStateChange(this.getState(), isClaimingMaster);
    }

    updateBeatVisualsAmount(beats) {
        if (this.elements.beatVisuals && this.elements.beatVisuals.length === beats) return;
        let beatsHtml = '';
        for (let i = 1; i <= beats; i++) {
            beatsHtml = `${beatsHtml}<div class="beat-visual" data-id="${i}"></div>`;
        }
        this.elements.beatVisualsContainer.innerHTML = beatsHtml;
        this.elements.beatVisuals = this.elements.beatVisualsContainer.querySelectorAll('.beat-visual');
    }

    getState() {
        return {
            bpm: parseInt(this.elements.bpmInput.value),
            beats: parseInt(this.elements.beatsInput.value),
            isPlaying: this.isPlaying,
        };
    }

    adjustVolume(save = true) {
        const volume = parseFloat(this.elements.volumeSlider.value);
        this.gainNode.gain.value = volume;
        this.elements.volumeIcon.classList.toggle('muted', volume === 0);
        if (save) localStorage.setItem('metronomeVolume', volume);
    }

    insertInto(containerElement) {
        if (!containerElement) return false;
        containerElement.appendChild(this.elements.container);
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.adjustTempoNameFontSize();
                    observer.unobserve(entry.target);
                }
            });
        });
        observer.observe(this.elements.container);
        return true;
    }

    getState() {
        return {
            bpm: parseInt(this.elements.bpmInput.value),
            beats: parseInt(this.elements.beatsInput.value),
            isPlaying: this.isPlaying,
        };
    }

    setState(state, isFromMasterClaim) {
        if (isFromMasterClaim) {
            this.setMaster(false);
        }

        const bpmChanged = this.elements.bpmInput.value != state.bpm;
        if (bpmChanged) {
            this.elements.bpmInput.value = state.bpm;
            this.elements.bpmName.textContent = this.getTempoName(state.bpm);
            localStorage.setItem('metronomeBpm', state.bpm);
            this.adjustTempoNameFontSize();
        }

        const beatsChanged = this.elements.beatsInput.value != state.beats;
        if (beatsChanged) {
            this.elements.beatsInput.value = state.beats;
            this.changeBeatVisualsAmount(state.beats);
            localStorage.setItem('metronomeBeats', state.beats);
        }

        const playingChanged = this.isPlaying !== state.isPlaying;
        if (playingChanged || (this.isPlaying && (bpmChanged || beatsChanged))) {
            if (state.isPlaying) this.start(); else this.pause();
        }
    }

    notifyStateChange(isClaimingMaster = false) {
        this.onStateChange(this.getState(), isClaimingMaster);
    }

    changeBeatVisualsAmount(beats) {
        if (this.elements.beatVisuals && this.elements.beatVisuals.length === beats) return;
        let beatsHtml = '';
        for (let i = 1; i <= beats; i++) {
            beatsHtml = `${beatsHtml}<div class="beat-visual" data-id="${i}"></div>`;
        }
        this.elements.beatVisualsContainer.innerHTML = beatsHtml;
        this.elements.beatVisuals = this.elements.beatVisualsContainer.querySelectorAll('.beat-visual');
    }

    getTempo(type = 'bpm') {
        const bpm = parseInt(this.elements.bpmInput.value);
        return type === 'ms' ? 60000 / bpm : bpm;
    }

    getTempoName(bpm) {
        if (bpm < 20) return "";
        if (bpm <= 39) return "Larghissimo";
        if (bpm <= 51) return "Largo";
        if (bpm <= 59) return "Largo - Lento";
        if (bpm === 60) return "Largo - Lento - Adagio";
        if (bpm <= 68) return "Lento - Adagio";
        if (bpm <= 75) return "Adagio";
        if (bpm <= 80) return "Adagio - Andante";
        if (bpm <= 87) return "Andante";
        if (bpm <= 99) return "Andante - Moderato";
        if (bpm === 100) return "Andante - Moderato - Allegretto";
        if (bpm <= 111) return "Moderato - Allegretto";
        if (bpm === 112) return "Moderato - Allegretto - Allegro";
        if (bpm <= 128) return "Allegretto - Allegro";
        if (bpm <= 137) return "Allegro";
        if (bpm <= 139) return "Allegro - Vivace";
        if (bpm <= 142) return "Allegro - Vivace - Presto";
        if (bpm <= 160) return "Allegro - Presto";
        if (bpm <= 187) return "Presto";
        if (bpm <= 200) return "Presto - Prestissimo";
        if (bpm <= 260) return "Prestissimo";
        if (bpm > 260) return "";
        return "Invalid Input";
    }

    loadBpm() {
        let bpm = parseInt(localStorage.getItem('metronomeBpm'));
        if (!bpm || bpm < 20) bpm = 120;
        return bpm;
    }

    loadBeats() {
        let beats = parseInt(localStorage.getItem('metronomeBeats'));
        if (!beats || beats < 1) beats = 4;
        return beats;
    }

    loadVolume() {
        let volume = parseFloat(localStorage.getItem('metronomeVolume'));
        if (isNaN(volume)) volume = 0.5;
        this.lastVolume = volume > 0 ? volume : 1;
        return volume;
    }
}

export { Metronome };
