class Metronome {
    constructor(opts) {
        this.opts = opts;
        this.onStateChange = opts.onStateChange || (() => {});
        this.audioContext = opts.audioContext;
        this.soundBuffer = null;

        this.elements = {};
        this.isPlaying = false;
        this.currentBeat = 0;

        this.nextBeatTime = 0;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.schedulerTimer = null;

        this.isMutedByRemote = false;

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
        if (!this.soundBuffer) return;
        if (this.gainNode.gain.value === 0) return;

        const source = this.audioContext.createBufferSource();
        source.buffer = this.soundBuffer;
        source.connect(this.gainNode);
        source.start(time);
    }

    scheduler() {
        while (this.nextBeatTime < this.audioContext.currentTime + this.scheduleAheadTime) {
            this.playSound(this.nextBeatTime);
            this.scheduleVisualUpdate(this.nextBeatTime);

            const beatsPerMeasure = parseInt(this.elements.beatsInput.value);
            this.currentBeat = this.currentBeat % beatsPerMeasure + 1;

            const secondsPerBeat = 60.0 / this.getTempo('bpm');
            this.nextBeatTime += secondsPerBeat;
        }
        this.schedulerTimer = setTimeout(() => this.scheduler(), this.lookahead);
    }

    scheduleVisualUpdate(time) {
        const scheduleTime = (time - this.audioContext.currentTime) * 1000;
        const beatToVisualize = this.currentBeat;
        setTimeout(() => this.setBeatVisual(beatToVisualize), scheduleTime);
    }

    start(syncState = null) {
        if (this.isPlaying) return;
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        this.isPlaying = true;
        this.elements.playBtn.classList.remove('paused');

        const secondsPerBeat = 60.0 / this.getTempo('bpm');

        if (syncState && syncState.perfStartTime > 0) {
            const timeElapsedOnSenderPerf = (performance.now() - syncState.perfStartTime) / 1000.0;
            const senderAudioTimeNow = syncState.audioStartTime + timeElapsedOnSenderPerf;

            const timeSinceSenderStart = senderAudioTimeNow - syncState.audioStartTime;
            const beatsPassedOnSender = Math.floor(timeSinceSenderStart / secondsPerBeat);
            const timeOfNextBeatOnSender = syncState.audioStartTime + (beatsPassedOnSender + 1) * secondsPerBeat;

            this.nextBeatTime = this.audioContext.currentTime + (timeOfNextBeatOnSender - senderAudioTimeNow);
            this.currentBeat = (beatsPassedOnSender % parseInt(this.elements.beatsInput.value)) + 1;

        } else {
            this.currentBeat = 1;
            this.nextBeatTime = this.audioContext.currentTime + 0.05;
        }

        this.scheduler();
    }

    pause() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.elements.playBtn.classList.add('paused');
        clearTimeout(this.schedulerTimer);
        this.schedulerTimer = null;
        this.elements.beatVisuals.forEach(visual => visual.classList.remove('active'));
    }

    changeTempo() {
        if (this.isPlaying) {
            this.pause();
            this.start();
        }
        this.notifyStateChange();
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
        this.changeBeatVisualsAmount(beats);
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
            this.changeTempo();
        });

        this.elements.playBtn.addEventListener('click', () => {
            if (this.elements.playBtn.classList.contains('paused')) this.start();
            else this.pause();
            this.notifyStateChange();
        });

        this.elements.beatsInput.addEventListener('input', () => {
            const beats = parseInt(this.elements.beatsInput.value);
            localStorage.setItem('metronomeBeats', beats);
            this.changeBeatVisualsAmount(beats);
            this.changeTempo();
        });

        this.elements.volumeSlider.addEventListener('input', () => {
            this.isMutedByRemote = false;
            this.adjustVolume();
            this.lastVolume = this.elements.volumeSlider.value;
        });

        this.elements.volumeIcon.addEventListener('click', () => {
            this.isMutedByRemote = false;
            if (parseFloat(this.elements.volumeSlider.value) > 0) {
                this.lastVolume = this.elements.volumeSlider.value;
                this.elements.volumeSlider.value = 0;
            } else {
                this.elements.volumeSlider.value = this.lastVolume > 0 ? this.lastVolume : 1;
            }
            this.adjustVolume();
        });
    }

    adjustVolume(save = true) {
        const oldMuteState = this.gainNode.gain.value === 0;
        const volume = parseFloat(this.elements.volumeSlider.value);
        this.gainNode.gain.value = volume;
        this.elements.volumeIcon.classList.toggle('muted', volume === 0);
        const newMuteState = volume === 0;

        if (save) {
            localStorage.setItem('metronomeVolume', volume);
            if (oldMuteState !== newMuteState && !this.isMutedByRemote) {
                this.notifyStateChange();
            }
        }
    }

    insertInto(containerElement) {
        if (!containerElement) return false;
        containerElement.appendChild(this.elements.container);
        return true;
    }

    getState() {
        return {
            bpm: parseInt(this.elements.bpmInput.value),
            beats: parseInt(this.elements.beatsInput.value),
            isPlaying: this.isPlaying,
            isMuted: parseFloat(this.elements.volumeSlider.value) === 0,
            audioStartTime: this.isPlaying ? this.nextBeatTime - (60.0 / this.getTempo('bpm')) : 0,
            perfStartTime: this.isPlaying ? performance.now() : 0,
        };
    }

    setState(state) {
        const bpmChanged = this.elements.bpmInput.value != state.bpm;
        if (bpmChanged) {
            this.elements.bpmInput.value = state.bpm;
            this.elements.bpmName.textContent = this.getTempoName(state.bpm);
            localStorage.setItem('metronomeBpm', state.bpm);
        }

        const beatsChanged = this.elements.beatsInput.value != state.beats;
        if (beatsChanged) {
            this.elements.beatsInput.value = state.beats;
            this.changeBeatVisualsAmount(state.beats);
            localStorage.setItem('metronomeBeats', state.beats);
        }

        const localVolume = parseFloat(this.elements.volumeSlider.value);
        const isCurrentlyMuted = this.gainNode.gain.value === 0;
        if (state.isMuted !== isCurrentlyMuted) {
            this.isMutedByRemote = true;
            this.gainNode.gain.value = state.isMuted ? 0 : localVolume;
            this.elements.volumeIcon.classList.toggle('muted', state.isMuted);
        }

        const playingChanged = this.isPlaying !== state.isPlaying;
        if (playingChanged || (this.isPlaying && (bpmChanged || beatsChanged))) {
            if (this.isPlaying) this.pause();
            if (state.isPlaying) this.start(state);
        }
    }

    notifyStateChange() {
        this.onStateChange(this.getState());
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
