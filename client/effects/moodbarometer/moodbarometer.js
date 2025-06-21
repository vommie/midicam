export class MoodBarometerEffect {
    constructor(options) {
        this.logger = options.logger;
        this.id = 'moodbarometer';
        this.name = 'Mood Barometer';
        this.icon = `<img src="effects/moodbarometer/mood_icon.svg">`;
        this.cssPath = 'effects/moodbarometer/moodbarometer.css';
        this.duration = 15000;

        this.onFinish = null;
        this.container = null;
        this.onSendMessage = null;
        this.isStopping = false;

        this.userBarometers = new Map();
        this.localMoodValue = 50;
        this.audios = {};
    }

    async updateMe() {
        this.logger.info(`[${this.id}] Updating local mood.`);
        const data = await this.prepareData();
        if (data !== null) {
            this._createOrUpdateBarometer('local', data.initialMood);
            this.onSendMessage({ subType: 'data', data: { event: 'mood_update', value: data.initialMood } });
        }
    }

    async prepareData() {
        return new Promise(resolve => {
            const selectorContainer = this._createMoodSelector(this.localMoodValue);
            document.body.appendChild(selectorContainer);
            const handleRelease = (value) => {
                this.localMoodValue = value;
                selectorContainer.remove();
                resolve({ initialMood: value });
            };

            const handleCancel = () => {
                selectorContainer.remove();
                resolve(null);
            };

            this._initDrag(selectorContainer, handleRelease, handleCancel);
        });
    }

    async start(container, onFinishCallback, isRemote, data, onSendMessage) {
        this.logger.info(`[${this.id}] Starting. isRemote: ${isRemote}`);
        this.isStopping = false;
        this.container = container;
        this.onFinish = onFinishCallback;
        this.onSendMessage = onSendMessage;

        this._preloadSounds();

        if (!document.getElementById('mood-barometers-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.id = 'mood-barometers-wrapper';
            this.container.appendChild(wrapper);
        }

        if (isRemote) {
            this._createOrUpdateBarometer('peer', data.initialMood);
        } else {
            this._createOrUpdateBarometer('local', data.initialMood);
        }
    }

    handleRemoteData(msg) {
        this.logger.debug(`[${this.id}] Received remote data: ${JSON.stringify(msg)}`);
        if (msg.event === 'peer_joined') {
            this._createOrUpdateBarometer('peer', msg.data.initialMood);
        }
        if (msg.event === 'mood_update') {
            this._createOrUpdateBarometer('peer', msg.value);
        }
    }

    _createOrUpdateBarometer(type, value) {
        if (!this.container) return;
        const wrapper = document.getElementById('mood-barometers-wrapper');
        if (!wrapper) return;

        let barometerData = this.userBarometers.get(type);

        if (barometerData && barometerData.element) {
            clearTimeout(barometerData.timer);
        } else {
            const barometerEl = document.createElement('div');
            barometerEl.className = `mood-barometer ${type}`;
            barometerEl.innerHTML = `
                <div class="mood-emoji"></div>
                <div class="mood-bar-wrapper">
                    <div class="mood-bar-track">
                        <div class="mood-bar-fill"></div>
                    </div>
                    <div class="mood-bar-markers">
                        <span>100</span><span>75</span><span>50</span><span>25</span><span>0</span>
                    </div>
                </div>
                <div class="mood-user-label">${type === 'local' ? 'Me' : 'Peer'}</div>
            `;
            wrapper.appendChild(barometerEl);
            barometerData = { element: barometerEl };
            this.userBarometers.set(type, barometerData);
            requestAnimationFrame(() => barometerEl.classList.add('visible'));
        }

        this._updateBarometerUI(barometerData.element, value);

        this._playSoundForValue(value);

        barometerData.timer = setTimeout(() => {
            this._removeBarometer(type);
        }, this.duration);
    }

    _updateBarometerUI(element, value) {
        const fill = element.querySelector('.mood-bar-fill');
        const emoji = element.querySelector('.mood-emoji');
        const { emoji: emojiChar } = this._getMoodDetails(value);

        element.style.setProperty('--mood-value', value);
        emoji.textContent = emojiChar;
    }

    _removeBarometer(type) {
        const barometerData = this.userBarometers.get(type);
        if (barometerData && barometerData.element) {
            barometerData.element.classList.remove('visible');
            barometerData.element.addEventListener('transitionend', () => {
                barometerData.element.remove();
            }, { once: true });
        }
        this.userBarometers.delete(type);

        if (this.userBarometers.size === 0) {
            this.stop();
        }
    }

    _getMoodDetails(value) {
        if (value >= 75) return { range: 'hot', emoji: '🤩', sound: '3.aac' };
        if (value >= 50) return { range: 'warm', emoji: '🙂', sound: '2.aac' };
        if (value >= 25) return { range: 'cool', emoji: '😐', sound: '1.aac' };
        return { range: 'ice', emoji: '🥶', sound: '0.aac' };
    }

    _preloadSounds() {
        ['0.aac', '1.aac', '2.aac', '3.aac'].forEach(sound => {
            if (!this.audios[sound]) {
                this.audios[sound] = new Audio(`effects/moodbarometer/${sound}`);
                this.audios[sound].volume = 0.6;
            }
        });
    }

    _playSoundForValue(value) {
        const { sound } = this._getMoodDetails(value);
        if (this.audios[sound]) {
            this.audios[sound].currentTime = 0;
            this.audios[sound].play().catch(e => this.logger.warn(`Audio failed: ${e.message}`));
        }
    }

    _createMoodSelector(initialValue) {
        const selectorEl = document.createElement('div');
        selectorEl.className = 'mood-selector-overlay';
        selectorEl.innerHTML = `
            <div class="mood-selector-container">
                <div class="mood-selector-title">Set your Mood</div>
                <div class="mood-barometer-selector" style="--mood-value: ${initialValue};">
                     <div class="mood-emoji"></div>
                     <div class="mood-bar-wrapper">
                         <div class="mood-bar-track">
                             <div class="mood-bar-fill"></div>
                             <div class="mood-drag-handle"></div>
                         </div>
                     </div>
                </div>
                <div class="mood-selector-info">Drag the handle to set your mood</div>
            </div>
        `;
        return selectorEl;
    }

    _initDrag(selectorContainer, onRelease, onCancel) {
        const selector = selectorContainer.querySelector('.mood-barometer-selector');
        const handle = selector.querySelector('.mood-drag-handle');
        const track = selector.querySelector('.mood-bar-track');

        const updateSelectorUI = (value) => {
            const clampedValue = Math.max(0, Math.min(100, value));
            selector.style.setProperty('--mood-value', clampedValue);
            const emojiEl = selector.querySelector('.mood-emoji');
            emojiEl.textContent = this._getMoodDetails(clampedValue).emoji;
        };

        updateSelectorUI(this.localMoodValue);

        let isDragging = false;

        const handleMove = (e) => {
            if (!isDragging) return;
            const rect = track.getBoundingClientRect();
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const relativeY = clientY - rect.top;
            let value = 100 - (relativeY / rect.height * 100);
            updateSelectorUI(value);
        };

        const handleEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('mouseup', handleEnd);
            document.removeEventListener('touchend', handleEnd);

            const finalValue = parseFloat(selector.style.getPropertyValue('--mood-value'));
            this._playSoundForValue(finalValue);
            setTimeout(() => onRelease(finalValue), 250);
        };

        const handleStart = (e) => {
            e.preventDefault();
            isDragging = true;
            document.addEventListener('mousemove', handleMove);
            document.addEventListener('touchmove', handleMove);
            document.addEventListener('mouseup', handleEnd);
            document.addEventListener('touchend', handleEnd);
            handleMove(e);
        };

        handle.addEventListener('mousedown', handleStart);
        handle.addEventListener('touchstart', handleStart);

        selectorContainer.addEventListener('click', (e) => {
            if (e.target === selectorContainer) {
                onCancel();
            }
        });
    }

    stop() {
        if (this.isStopping) return;
        this.isStopping = true;
        this.logger.info(`[${this.id}] Stopping all active barometers.`);

        for (const type of this.userBarometers.keys()) {
            const barometerData = this.userBarometers.get(type);
            if (barometerData) {
                clearTimeout(barometerData.timer);
                if(barometerData.element) barometerData.element.remove();
            }
        }
        this.userBarometers.clear();

        const wrapper = document.getElementById('mood-barometers-wrapper');
        if (wrapper) wrapper.remove();

        if (this.onFinish) {
            this.onFinish();
        }
    }
}
