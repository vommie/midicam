export class BackgroundTimer {
    constructor() {
        const workerCode = `
            const timers = new Map();
            self.onmessage = function(e) {
                if (e.data.cmd === 'start') {
                    const id = setTimeout(() => {
                        self.postMessage(e.data.id);
                        timers.delete(e.data.id);
                    }, e.data.delay);
                    timers.set(e.data.id, id);
                } else if (e.data.cmd === 'clear') {
                    clearTimeout(timers.get(e.data.id));
                    timers.delete(e.data.id);
                }
            };
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        this.callbacks = new Map();
        this.idCounter = 0;

        this.worker.onmessage = (e) => {
            const id = e.data;
            const cb = this.callbacks.get(id);
            if (cb) {
                this.callbacks.delete(id);
                cb(); // Execute the callback
            }
        };
    }

    setTimeout(cb, delay) {
        const id = ++this.idCounter;
        this.callbacks.set(id, cb);
        this.worker.postMessage({ cmd: 'start', id, delay });
        return id;
    }

    clearTimeout(id) {
        this.callbacks.delete(id);
        this.worker.postMessage({ cmd: 'clear', id });
    }
}
