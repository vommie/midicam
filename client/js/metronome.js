class Metronome {
    constructor(opts) {
        this.opts = opts;
        this.onStateChange = opts.onStateChange || (() => {});
        this.audioContext = opts.audioContext;
        this.soundBuffer = null;

        this.elements = {};
        this.isPlaying = false;
        this.currentBeat = 0;

        this.startTime = 0;
        this.nextBeatTime = 0;
        this.lookahead = 10.0;
        this.scheduleAheadTime = 0.1;
        this.schedulerTimer = null;

        this.isMutedByRemote = false;

        this.loadSound();
        this.createTemplate();
        this.addEventListeners();
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
        const source = this.audioContext.createBufferSource();
        source.buffer = this.soundBuffer;
        source.connect(this.audioContext.destination);
        source.start(time);
    }

    scheduler() {
        while (this.nextBeatTime < this.audioContext.currentTime + this.scheduleAheadTime) {
            this.playSound(this.nextBeatTime);
            this.scheduleVisualUpdate(this.nextBeatTime);
            const secondsPerBeat = 60.0 / this.getTempo('bpm');
            this.nextBeatTime += secondsPerBeat;
            this.currentBeat++;
            if (this.currentBeat > parseInt(this.elements.beatsInput.value)) {
                this.currentBeat = 1;
            }
        }
        this.schedulerTimer = setTimeout(this.scheduler.bind(this), this.lookahead);
    }

    scheduleVisualUpdate(time) {
        const scheduleTime = (time - this.audioContext.currentTime) * 1000;
        setTimeout(() => this.setBeatVisual(this.currentBeat), scheduleTime);
    }

    start() {
        if (this.isPlaying) return;
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        this.isPlaying = true;
        this.elements.playBtn.classList.remove('paused');

        this.currentBeat = 1;
        this.nextBeatTime = this.audioContext.currentTime + 0.1;
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
    }

    setBeatVisual(beatNumber) {
        this.elements.beatVisuals.forEach(visual => {
            if (visual.dataset.id == beatNumber) visual.classList.add('active');
            else visual.classList.remove('active');
        });
    }

    createTemplate() {
        const container = document.createElement('div');
        container.classList.add('metronome');
        const bpm = this.loadBpm();
        const beats = this.loadBeats();
        container.innerHTML = `
        <input id="bpm" type="number" min=20 max=400 value="${bpm}" class="input-scrollable" readonly>
        <div id="tempo-name">${this.getTempoName(bpm)}</div>
        <div id="beat-visuals"></div>
        <div class="controls">
            <button id="play" class="paused"></button>
            <input id="beats" type="number" min=1 max=6 value="${beats}" class="input-scrollable" readonly>
        </div>
        `;
        this.elements.container = container;
        this.elements.bpmInput = container.querySelector('#bpm');
        this.elements.bpmName = container.querySelector('#tempo-name');
        this.elements.playBtn = container.querySelector('#play');
        this.elements.beatsInput = container.querySelector('#beats');
        this.elements.beatVisualsContainer = container.querySelector('#beat-visuals');
        this.changeBeatVisualsAmount(beats);
    }

    addEventListeners() {
        [this.elements.bpmInput, this.elements.beatsInput].forEach(input => {
            input.addEventListener('wheel', e => {
                e.preventDefault();
                const stepSize = e.ctrlKey ? 10 : 1;
                if (e.deltaY < 0) {
                    for (let i = 0; i < stepSize; i++) input.stepUp();
                } else {
                    for (let i = 0; i < stepSize; i++) input.stepDown();
                }
                input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            });
            document.addEventListener('click', e => { if (!input.contains(e.target)) input.readOnly = true; });
            input.addEventListener('dblclick', e => { input.readOnly = false; });
            input.addEventListener('focus', (e) => { if (input.readOnly) e.target.blur(); });
        });

        this.elements.bpmInput.addEventListener('input', (e) => {
            const bpm = parseInt(this.elements.bpmInput.value);
            this.elements.bpmName.textContent = this.getTempoName(bpm);
            localStorage.setItem('metronomeBpm', bpm);
            this.changeTempo();
            this.notifyStateChange();
        });

        this.elements.playBtn.addEventListener('click', e => {
            if (this.elements.playBtn.classList.contains('paused')) this.start();
            else this.pause();
            this.notifyStateChange();
        });

        this.elements.beatsInput.addEventListener('input', (e) => {
            const beats = parseInt(this.elements.beatsInput.value);
            localStorage.setItem('metronomeBeats', beats);
            this.changeBeatVisualsAmount(beats);
            this.changeTempo();
            this.notifyStateChange();
        });
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
            isPlaying: this.isPlaying
        };
    }

    setState(state, fromRemote = false) {
        this.isMutedByRemote = fromRemote;

        if (this.elements.bpmInput.value != state.bpm) {
            this.elements.bpmInput.value = state.bpm;
            this.elements.bpmName.textContent = this.getTempoName(state.bpm);
            localStorage.setItem('metronomeBpm', state.bpm);
        }

        if (this.elements.beatsInput.value != state.beats) {
            this.elements.beatsInput.value = state.beats;
            this.changeBeatVisualsAmount(state.beats);
            localStorage.setItem('metronomeBeats', state.beats);
        }

        if (this.isPlaying !== state.isPlaying) {
            if (state.isPlaying) this.start();
            else this.pause();
        } else if (state.isPlaying) {
            this.changeTempo();
        }

        this.isMutedByRemote = false;
    }

    notifyStateChange() {
        if (this.isMutedByRemote) return;
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
        if(bpm < 20) {
            return "";
        } else if(bpm >= 20 && bpm <= 39) {
                return "Larghissimo";
        } else if(bpm >= 40 && bpm <= 51) {
            return "Largo";
        } else if(bpm >= 52 && bpm <= 59) {
            return "Largo - Lento";
        } else if(bpm === 60) {
            return "Largo - Lento - Adagio";
        } else if(bpm >= 61 && bpm <= 68) {
            return "Lento - Adagio";
        } else if(bpm >= 69 && bpm <= 75) {
            return "Adagio";
        } else if(bpm >= 76 && bpm <= 80) {
            return "Adagio - Andante";
        } else if(bpm >= 81 && bpm <= 87) {
            return "Andante";
        } else if(bpm >= 88 && bpm <= 99) {
            return "Andante - Moderato";
        } else if(bpm === 100) {
            return "Andante - Moderato - Allegretto";
        } else if(bpm >= 101 && bpm <= 111) {
            return "Moderato - Allegretto";
        } else if(bpm === 112) {
            return "Moderato - Allegretto - Allegro";
        } else if(bpm >= 113 && bpm <= 128) {
            return "Allegretto - Allegro";
        } else if(bpm >= 129 && bpm <= 137) {
            return "Allegro";
        } else if(bpm >= 138 && bpm <= 139) {
            return "Allegro - Vivace";
        } else if(bpm >= 140 && bpm <= 142) {
            return "Allegro - Vivace - Presto";
        } else if(bpm >= 143 && bpm <= 160) {
            return "Allegro - Presto";
        } else if(bpm >= 161 && bpm <= 187) {
            return "Presto";
        } else if(bpm >= 188 && bpm <= 200) {
            return "Presto - Prestissimo";
        } else if(bpm >= 201 && bpm <= 260) {
            return "Prestissimo";
        } else if(bpm > 260) {
            return "";
        } else {
            return "Invalid Input";
        }
    }

    loadBpm() {
        let bpm = parseInt(localStorage.getItem('metronomeBpm'));
        if(!bpm || bpm < 20) bpm = 120;
        return bpm;
    }

    loadBeats() {
        let beats = parseInt(localStorage.getItem('metronomeBeats'));
        if(!beats || beats < 1) beats = 4;
        return beats;
    }

}

export { Metronome }
