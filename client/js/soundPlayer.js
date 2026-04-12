import { SplendidGrandPiano, CacheStorage } from "../libs/smplr/smplr.mjs";

export class SoundPlayer {
    constructor(logger) {
        this.logger = logger || console;

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ac = new AudioContextClass();

        this.storage = new CacheStorage();
        this.isLoaded = false;
        this.loadPromise = null;

        // Tracks the exact start time of notes to prevent instantaneous stop commands
        this.noteStartTimes = new Map();

        this.piano = new SplendidGrandPiano(this.ac, {
            baseUrl: 'assets/samples/SplendidGrandPiano',
            storage: this.storage,
            decayTime: 0.5
        });

        const resumeAudio = () => {
            if (this.ac.state === 'suspended') {
                this.ac.resume().then(() => this.logger.debug('SoundPlayer: AudioContext resumed.'));
            }
            document.removeEventListener("click", resumeAudio);
            document.removeEventListener("keydown", resumeAudio);
            document.removeEventListener("pointerdown", resumeAudio);
        };

        document.addEventListener("click", resumeAudio);
        document.addEventListener("keydown", resumeAudio);
        document.addEventListener("pointerdown", resumeAudio);

        document.addEventListener("visibilitychange", () => {
            if (!document.hidden && this.ac.state === 'suspended') {
                this.ac.resume().then(() => this.logger.debug('SoundPlayer: AudioContext resumed after visibility change.'));
            }
        });

        this.logger.info('SoundPlayer: Initialized using smplr API with Jitter-Protection.');
    }

    async preload() {
        if (this.isLoaded) return Promise.resolve();
        if (this.loadPromise) return this.loadPromise;

        this.logger.info('SoundPlayer: Preloading SplendidGrandPiano samples into RAM...');

        try {
            this.loadPromise = Promise.resolve(this.piano.load).then(() => {
                this.isLoaded = true;
                this.logger.info('SoundPlayer: Samples successfully preloaded and ready.');
            });
        } catch (err) {
            this.logger.error(`SoundPlayer: Failed to preload samples: ${err.message}`);
            this.loadPromise = null;
        }

        return this.loadPromise;
    }

    playNote(note, midiVelocity = 64) {
        if (this.ac.state === 'suspended') {
            this.ac.resume();
        }

        const now = this.ac.currentTime;
        this.noteStartTimes.set(note, now);

        // Safeguard to ensure velocity is never completely silent if a note triggers
        const safeVelocity = Math.max(10, midiVelocity);

        this.piano.start({ note: note, velocity: safeVelocity, time: now });
        this.logger.debug(`SoundPlayer: Started ${note} (vel: ${safeVelocity}) at ${now.toFixed(3)}s`);
    }

    stopNote(note) {
        let stopTime = this.ac.currentTime;
        const startTime = this.noteStartTimes.get(note);

        // JITTER-COLLAPSE PROTECTION:
        // If the network bundles NoteOn and NoteOff in the same tick, we force a minimum
        // acoustic duration of 60ms so the staccato strike is clearly audible.
        if (startTime !== undefined && (stopTime - startTime) < 0.06) {
            stopTime = startTime + 0.06;
            this.logger.debug(`SoundPlayer: Jitter-Protection engaged. Extended ${note} cutoff to ensure audibility.`);
        }

        this.piano.stop({ note: note, time: stopTime });
        this.noteStartTimes.delete(note);
    }
}
