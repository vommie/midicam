class Metronome {

    constructor(opts) {0
        this.opts = opts;
        this.elements = {};
        this.audio = new Audio();
        this.audio.src = 'assets/samples/metronome/01.wav';
        this.currentBeat = 0;
        this.createTemplate();
        this.addEventListeners();
        const state = this.insertMetronome();
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
        // Input elements with middle mouse wheel changeable, dblick for edit
        [
            this.elements.bpmInput,
            this.elements.beatsInput
        ].forEach(input=>{
            input.addEventListener('wheel', e => {
                e.preventDefault();
                const stepSize = e.ctrlKey ? 10 : 1;
                if(e.deltaY < 0) {
                    for(let i = 0; i < stepSize; i++) {
                        input.stepUp();
                    }
                } else {
                    for(let i = 0; i < stepSize; i++) {
                        input.stepDown();
                    }
                }
                input.dispatchEvent(new Event('input', {bubbles: true, cancelable: true}));
            });
            document.addEventListener('click', e=>{
                if(!input.contains(e.target)) {
                    input.readOnly = true;
                }
            });
            input.addEventListener('dblclick', e=>{
                input.readOnly = false;
            });
            input.addEventListener('focus', (e)=> {
                if(input.readOnly) e.target.blur();
            });
        });

        this.elements.bpmInput.addEventListener('input', (e) => {
            const bpm = parseInt(this.elements.bpmInput.value);
            this.elements.bpmName.textContent = this.getTempoName(bpm);
            localStorage.setItem('metronomeBpm', bpm);
            if(!this.elements.playBtn.classList.contains('paused')) this.changeTempo();
        });

        this.elements.playBtn.addEventListener('click', e=>{
            if(this.elements.playBtn.classList.contains('paused')) this.start();
            else this.pause();
        });

        this.elements.beatsInput.addEventListener('input', (e) => {
            const beats = parseInt(this.elements.beatsInput.value);
            localStorage.setItem('metronomeBeats', beats);
            this.changeBeatVisualsAmount(beats);
            if(!this.elements.playBtn.classList.contains('paused')) this.changeTempo();
        });

    }

    insertMetronome() {
        const container = document.querySelector(this.opts.selector);
        if(!container) return false;
        container.appendChild(this.elements.container);
    }

    start() {
        this.elements.playBtn.classList.remove('paused');
        this.changeTempo();
    }

    pause() {
        this.currentBeat = 1;
        clearInterval(this.running);
        this.audio.currentTime = 0;
        this.audio.pause();
        this.elements.playBtn.classList.add('paused');
        this.setBeatVisual();
    }

    changeTempo() {
        if(this.running) clearInterval(this.running);
        this.currentBeat = 1;
        this.setBeatVisual();
        this.audio.currentTime = 0;
        this.audio.play();
        this.running = setInterval(()=>{
            this.currentBeat++;
            if(this.currentBeat > parseInt(this.elements.beatsInput.value)) this.currentBeat = 1;
            this.audio.currentTime = 0;
            this.audio.play();
            this.setBeatVisual();
        }, this.getTempo('ms'));
    }

    setBeatVisual() {
        this.elements.beatVisuals.forEach(visual=>{
            if(!this.elements.playBtn.classList.contains('paused') && visual.dataset.id == this.currentBeat) visual.classList.add('active');
            else visual.classList.remove('active');
        });
    }

    changeBeatVisualsAmount(beats) {
        if(this.elements.beatVisuals && this.elements.beatVisuals.length === beats) return;
        let beatsHtml = '';
        for(let i = 1; i <= beats; i++) {
            beatsHtml = `${beatsHtml}<div class="beat-visual" data-id="${i}"></div>`;
        }
        this.elements.beatVisualsContainer.innerHTML = beatsHtml;
        this.elements.beatVisuals = this.elements.beatVisualsContainer.querySelectorAll('.beat-visual');

    }

    /**
     * Gets the tempo of the metronome
     *
     * @param {string} type Tempo as "bpm" or in "ms" (milliseconds)
     * @returns {int}
     */
    getTempo(type='bpm') {
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

export {
    Metronome
}
