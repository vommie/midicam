export class ApplauseEffect {
    id = 'applause';
    name = 'Virtual Applause';
    icon = `<img src="effects/applause/applause_icon.svg">`;
    cssPath = 'effects/applause/applause.css';

    duration = 10000;

    constructor(options) {
        this.logger = options.logger;
        this.audioContext = null;

        this.onFinishCallback = null;
        this.onSendMessage = null;
        this.isRemote = false;
        this.container = null;
        this.elements = {};

        this.totalClicks = 0;
        this.cps = 0;
        this.avgCps = 0;
        this.lastTargetLevel = 0;
        this.finalBonusTriggered = false;
        this.clickTimestamps = [];

        this.stateUpdateInterval = null;
        this.effectTimeout = null;
        this.animationFrameId = null;

        this.audioSources = {};
    }

    async start(container, onFinishCallback, isRemote, data, onSendMessage) {
        if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.logger.info("New AudioContext created for effect run.");
        }

        this.container = container;
        this.onFinishCallback = onFinishCallback;
        this.isRemote = isRemote;
        this.onSendMessage = onSendMessage;

        this.clickTimestamps = [];
        this.totalClicks = 0;
        this.cps = 0;
        this.avgCps = 0;
        this.finalBonusTriggered = false;
        this.lastTargetLevel = 0;

        const startTime = performance.now();
        this.logger.info(`Starting Applause Effect (isRemote: ${this.isRemote})`);

        this.buildUI();
        await this.initAudio();

        if (!this.isRemote) {
            this.elements.handsContainer.addEventListener('click', this.handleLocalClick);
            this.stateUpdateInterval = setInterval(() => this.updateGameState(startTime), 100);
            this.effectTimeout = setTimeout(() => this.stop(), this.duration);
        }

        this.renderLoop();

        return this.duration;
    }

    buildUI() {
        this.container.innerHTML = `
            <div class="applause-game-container">
                <div class="applause-hands-container">
                    <img src="effects/applause/hand_left.svg" class="applause-hand hand-left" alt="Left Hand">
                    <img src="effects/applause/hand_right.svg" class="applause-hand hand-right" alt="Right Hand">
                </div>
                <div class="applause-counter-container">
                    <div class="applause-counter-label">CLAPS / SEC</div>
                    <div class="applause-counter-value">0.00</div>
                </div>
                <div class="cps-progress-bar">
                    <div class="cps-progress-segment"></div>
                    <div class="cps-progress-segment"></div>
                    <div class="cps-progress-segment"></div>
                    <div class="cps-progress-segment"></div>
                </div>
            </div>
        `;
        this.elements.gameContainer = this.container.querySelector('.applause-game-container');
        this.elements.handsContainer = this.container.querySelector('.applause-hands-container');
        this.elements.counterValue = this.container.querySelector('.applause-counter-value');
        this.elements.progressSegments = this.container.querySelectorAll('.cps-progress-segment');

        this.elements.gameContainer.classList.add(
            this.isRemote ? 'remote-player-glow' : 'local-player-glow'
        );

        setTimeout(() => this.elements.gameContainer.classList.add('visible'), 50);
    }

    async initAudio() {
        this.audioSources = {};
        const audioFiles = [0, 1, 2, 3, 4].map(i => `effects/applause/applause_${i}.aac`);
        audioFiles.push('effects/applause/confetti.aac');
        audioFiles.push('effects/applause/explosion.aac');

        const loadPromises = audioFiles.map(async (path) => {
            try {
                const response = await fetch(path);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                const key = path.split('/').pop().split('.')[0].replace('applause_', 'level');

                const gainNode = this.audioContext.createGain();
                gainNode.gain.value = 0;
                gainNode.connect(this.audioContext.destination);

                this.audioSources[key] = { buffer: audioBuffer, gainNode, isPlaying: false, sourceNode: null };
            } catch (error) {
                this.logger.error(`Failed to load or decode audio from ${path}:`, error);
            }
        });
        await Promise.all(loadPromises);
        this.logger.debug("All audio files initialized for this run.");
    }

    handleLocalClick = () => {
        this.clickTimestamps.push(performance.now());
        this.totalClicks++;
        this.triggerClapAnimation();
        this.onSendMessage({ subType: 'data', data: { type: 'click' } });
    }

    updateGameState = (startTime) => {
        const now = performance.now();
        const windowSize = 2000;
        const windowStart = now - windowSize;

        this.clickTimestamps = this.clickTimestamps.filter(timestamp => timestamp >= windowStart);

        if (this.clickTimestamps.length > 1) {
            const durationSeconds = (this.clickTimestamps[this.clickTimestamps.length - 1] - this.clickTimestamps[0]) / 1000;
            this.cps = durationSeconds > 0 ? (this.clickTimestamps.length - 1) / durationSeconds : 99;
        } else {
            this.cps = 0;
        }

        const elapsedTime = (now - startTime) / 1000;
        this.avgCps = this.totalClicks / (elapsedTime || 1);

        this.updateAudioLevel(this.cps);
        this.onSendMessage({ subType: 'data', data: { type: 'cpsUpdate', cps: this.cps } });

        if (!this.finalBonusTriggered && this.avgCps > 5 && (this.duration - (now - startTime)) <= 3000) {
            this.triggerFinalBonus();
            this.onSendMessage({ subType: 'data', data: { type: 'finalBonus' } });
        }
    }

    renderLoop = () => {
        this.render();
        this.animationFrameId = requestAnimationFrame(this.renderLoop);
    }

    render = () => {
        if (!this.elements.counterValue) return;

        if (this.finalBonusTriggered) {
            this.elements.counterValue.textContent = "MAX!";
        } else {
            this.elements.counterValue.textContent = this.isRemote ? this.cps.toFixed(2) : this.cps.toFixed(2);
        }

        const currentLevel = this.isRemote ? this.getAudioLevelForCps(this.cps) : this.lastTargetLevel;
        this.elements.progressSegments.forEach((segment, index) => {
            segment.classList.toggle('active', index < currentLevel);
        });

        this.elements.gameContainer.classList.toggle('max-applause-shake', currentLevel === 4);
    }

    handleRemoteData(data) {
        if (this.isRemote) {
            switch (data.type) {
                case 'click':
                    this.triggerClapAnimation();
                    break;
                case 'cpsUpdate':
                     if (!this.finalBonusTriggered) {
                        this.cps = data.cps;
                        this.updateAudioLevel(data.cps);
                     }
                    break;
                case 'finalBonus':
                    this.triggerFinalBonus();
                    break;
            }
        }
    }

    getAudioLevelForCps(cps) {
        if (cps > 6) return 4;
        if (cps > 4) return 3;
        if (cps > 2) return 2;
        if (cps > 0.1) return 1;
        return 0;
    }

    updateAudioLevel(cps) {
        if (this.finalBonusTriggered) return;

        const newTargetLevel = this.getAudioLevelForCps(cps);

        if (newTargetLevel === this.lastTargetLevel) return;

        this.transitionAudio(this.lastTargetLevel, newTargetLevel);
        this.lastTargetLevel = newTargetLevel;
    }

    startAudioSource(audio, when = 0) {
        if (audio.isPlaying || !audio.buffer) return;

        const sourceNode = this.audioContext.createBufferSource();
        sourceNode.buffer = audio.buffer;
        sourceNode.loop = true;
        sourceNode.connect(audio.gainNode);
        sourceNode.start(when);
        audio.sourceNode = sourceNode;
        audio.isPlaying = true;
    }

    transitionAudio(startLevel, endLevel) {
        if (startLevel === endLevel) return;

        const STEP_DURATION = 0.15;
        const FADE_OUT_DURATION = 0.4;
        const FINAL_FADE_IN_DURATION = 0.5;

        const now = this.audioContext.currentTime;
        this.logger.debug(`Audio level transition: ${startLevel} -> ${endLevel} at ${now.toFixed(2)}s`);

        Object.values(this.audioSources).forEach(audio => {
            if (audio.gainNode) {
                audio.gainNode.gain.cancelScheduledValues(now);
            }
        });

        const isIncreasing = endLevel > startLevel;
        const path = [];
        if (isIncreasing) {
            for (let i = startLevel + 1; i < endLevel; i++) path.push(i);
        } else {
            for (let i = startLevel - 1; i > endLevel; i--) path.push(i);
        }

        for (let i = 0; i <= 4; i++) {
            const audio = this.audioSources[`level${i}`];
            if (!audio) continue;
            if (i === endLevel || path.includes(i)) continue;
            if (audio.gainNode.gain.value > 0) {
                 audio.gainNode.gain.linearRampToValueAtTime(0, now + FADE_OUT_DURATION);
            }
        }

        let transitionDelay = 0;
        path.forEach((level, index) => {
            const audio = this.audioSources[`level${level}`];
            if (!audio) return;
            const startTime = now + index * STEP_DURATION;
            const peakTime = startTime + STEP_DURATION * 0.5;
            const endTime = startTime + STEP_DURATION;
            transitionDelay = (index + 1) * STEP_DURATION;
            this.startAudioSource(audio, startTime);
            audio.gainNode.gain.setValueAtTime(0, startTime);
            audio.gainNode.gain.linearRampToValueAtTime(0.7, peakTime);
            audio.gainNode.gain.linearRampToValueAtTime(0, endTime);
        });

        const finalAudio = this.audioSources[`level${endLevel}`];
        if (finalAudio && endLevel > 0) {
            const finalStartTime = now + transitionDelay;
            this.startAudioSource(finalAudio, finalStartTime);
            finalAudio.gainNode.gain.setValueAtTime(finalAudio.gainNode.gain.value, finalStartTime);
            finalAudio.gainNode.gain.linearRampToValueAtTime(0.7, finalStartTime + FINAL_FADE_IN_DURATION);
        }
    }

    triggerFinalBonus() {
        if (this.finalBonusTriggered) return;
        this.logger.info("Triggering FINAL BONUS!");
        this.finalBonusTriggered = true;

        if (!this.isRemote) {
             this.elements.handsContainer.removeEventListener('click', this.handleLocalClick);
        }

        const now = this.audioContext.currentTime;
        for (let i = 0; i <= 4; i++) {
            const audio = this.audioSources[`level${i}`];
            if (!audio) continue;
            audio.gainNode.gain.cancelScheduledValues(now);
            if (i === 4) {
                this.startAudioSource(audio, now);
                audio.gainNode.gain.linearRampToValueAtTime(0.7, now + 0.1);
            } else {
                audio.gainNode.gain.linearRampToValueAtTime(0, now + 1.0);
            }
        }
        this.playSound('explosion', 1.0);

        this.elements.gameContainer.classList.add('exploding');

        setTimeout(() => {
            this.triggerGlobalConfetti();
            this.playSound('confetti', 0.8);
        }, 200);
    }

    triggerClapAnimation() {
        const handsContainer = this.elements.handsContainer;
        if (handsContainer) {
            handsContainer.classList.add('clapping');
            handsContainer.addEventListener('animationend', () => {
                handsContainer.classList.remove('clapping');
            }, { once: true });
        }
    }

    triggerGlobalConfetti() {
        const confettiCount = 250;
        const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800'];
        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti-particle';
            confetti.style.left = `${Math.random() * 100}vw`;
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDelay = `${Math.random() * 2}s`;
            confetti.style.setProperty('--x-drift', `${Math.random() * 200 - 100}px`);
            confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
            this.container.appendChild(confetti);
        }
    }

    playSound(soundKey, volume) {
        const audio = this.audioSources[soundKey];
        if (audio && audio.buffer) {
            const sourceNode = this.audioContext.createBufferSource();
            sourceNode.buffer = audio.buffer;
            const oneShotGain = this.audioContext.createGain();
            oneShotGain.gain.setValueAtTime(volume, this.audioContext.currentTime);
            oneShotGain.connect(this.audioContext.destination);
            sourceNode.connect(oneShotGain);
            sourceNode.start();
        }
    }

    stop() {
        if (!this.isRemote && this.onSendMessage) {
            this.logger.info("I am the initiator. Sending 'stop' command to peer.");
            this.onSendMessage({ subType: 'stop' });
        }

        this.logger.info(`Stopping Applause Effect and cleaning up resources (isRemote: ${this.isRemote}).`);

        if (this.stateUpdateInterval) clearInterval(this.stateUpdateInterval);
        if (this.effectTimeout) clearTimeout(this.effectTimeout);
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

        this.stateUpdateInterval = null;
        this.effectTimeout = null;
        this.animationFrameId = null;
        this.finalBonusTriggered = false;

        Object.values(this.audioSources).forEach(audio => {
            if (audio.gainNode) {
                audio.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
                audio.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 1.5);
            }
        });

        if (this.elements.gameContainer) {
            this.elements.gameContainer.classList.remove('visible', 'exploding');
        }

        setTimeout(() => {
            if (!this.isRemote && this.elements.handsContainer) {
                this.elements.handsContainer.removeEventListener('click', this.handleLocalClick);
            }

            Object.values(this.audioSources).forEach(audio => {
                if (audio.sourceNode) {
                    try { audio.sourceNode.stop(); audio.sourceNode.disconnect(); } catch (e) {}
                }
                if(audio.gainNode) { audio.gainNode.disconnect(); }
                audio.isPlaying = false;
                audio.sourceNode = null;
            });

            if (this.audioContext && this.audioContext.state !== 'closed') {
                this.audioContext.close().then(() => this.logger.info(`AudioContext for this run closed successfully (isRemote: ${this.isRemote}).`));
            }

            if (this.container) this.container.innerHTML = '';
            if (this.onFinishCallback) this.onFinishCallback();
        }, 1800);
    }
}
