import { SplendidGrandPiano, CacheStorage } from "../libs/smplr/smplr.mjs";

class SoundPlayer {

    constructor() {
        this.ac = null;
        this.started = {};
        console.log('init AudioPlayer ...');
        this.ac = new AudioContext();
        const storage = new CacheStorage();
        this.piano = new SplendidGrandPiano(this.ac, {
            baseUrl: 'assets/samples/SplendidGrandPiano', storage
        });
        document.addEventListener("click", () => {
            this.ac.resume();
        });
    }

    playNote(note, midiVelocity = 64, sustain = false) {
        this.piano.start({note: note, velocity: midiVelocity});
    }

    stopNote(note) {
        this.piano.stop({note: note});
    }

  }

  export {
    SoundPlayer
  }
