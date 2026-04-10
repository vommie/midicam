import { Pianos } from "./piano.js";
import { Metronome } from "./metronome.js";
import { CamLocalDrag } from "./camLocalDrag.js";
import { MetronomeDrag } from "./metronomeDrag.js";
import { FloatingWindow } from "./floatingWindow.js";
import { Chat } from './chat.js';
import { FileSharing } from './filesharing.js';
import { Log } from './logs.js';
import { Sidebar } from './sidebar.js';
import { Dialog } from './dialog.js';
import { Notifications } from './notifications.js';
import { Effects } from './effects.js';

// --- Logger Initialization ---
const logger = new Log({ toggleButtonSelector: '#toggleLogButton' });

// --- DOM Elements ---
const remoteVideo = document.getElementById('remoteVideo');
const remotePlaceholder = document.getElementById('remotePlaceholder');
const remoteMuteIndicator = document.getElementById('remoteMuteIndicator');
const peerSelfMutedIndicator = document.getElementById('peerSelfMutedIndicator');
const videoSelect = document.getElementById('videoSelect');
const audioSelect = document.getElementById('audioSelect');
const micVolume = document.getElementById('micVolume');
const remoteVolume = document.getElementById('remoteVolume');
const micVolumeIcon = document.getElementById('micVolumeIcon');
const remoteVolumeIcon = document.getElementById('remoteVolumeIcon');
const midiSelect = document.getElementById('midiSelect');
const midiOutputSelect = document.getElementById('midiOutputSelect');
const serverUrlInput = document.getElementById('serverUrl');
const startConnectionButton = document.getElementById('startConnection');
const toggleMetronomeButton = document.getElementById('toggleMetronome');
const metronomeContainer = document.getElementById('metronomeContainer');
const shareScreenButton = document.getElementById('shareScreenButton');
const additionalStreamsContainer = document.getElementById('additionalStreamsContainer');

// --- Global State & WebRTC Variables ---
let pc = null;
let ws = null;
let localStream = null;
let audioContext = null;
let gainNode = null;
let currentVideoId = 'none';
let currentAudioId = 'none';
let midiAccess = null;

// --- Data Channels ---
let midiChannel = null;
let fileChannel = null;
let chatChannel = null;
let metronomeChannel = null;
let commonDataChannel = null;

// --- Application State Variables ---
let isMetronomeVisible = false;
let lastMicVolume = 1;
let lastRemoteVolume = 1;
let isSelfMuted = false;
let iceReconnectTimer = null;

// --- Perfect Negotiation Variables ---
let polite = false;
let makingOffer = false;
let ignoreOffer = false;
let isSettingRemoteAnswerPending = false;
let pendingIceCandidates =[];

// --- High Performance MIDI Variables ---
let midiOutBuffer =[];
let midiOutQueued = false;

// --- Constants ---
const MIDI_BUFFER_THRESHOLD = 2048;
const VIDEO_QUALITY = {
    DEFAULT: { maxBitrate: 6000 * 1000 },
    FULLSCREEN: { maxBitrate: 10000 * 1000 }
};

// --- Instances ---
const pianos = new Pianos();
let metronome = null;
let chat = null;
let notifier = null;
let fileSharing = null;
let camLocalDrag = null;
let effects = null;

const activeScreenShares = new Map();
const pendingStreams = new Map();

let saveSettingsTimeout = null;

function parseServerUrl(url) {
    try {
        const isSecure = url.startsWith('https') || url.startsWith('wss');
        const cleanUrl = url.replace(/^wss?:\/\//i, '').replace(/^https?:\/\//i, '');
        const urlObj = new URL(`http://${cleanUrl}`);
        let port = urlObj.port;

        if (!port) {
            if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
                port = '8080';
            } else {
                port = isSecure ? '443' : '80';
            }
        }

        logger.debug(`Parsed URL -> IP: ${urlObj.hostname}, Port: ${port}, Secure: ${isSecure}`);
        return { serverIp: urlObj.hostname, serverPort: port, isSecure: isSecure };
    } catch (err) {
        logger.error(`Error parsing URL: ${err.message}`);
        return null;
    }
}

function saveSettings() {
    if (saveSettingsTimeout) {
        clearTimeout(saveSettingsTimeout);
    }
    saveSettingsTimeout = setTimeout(() => {
        const settings = {
            videoDeviceId: videoSelect.value,
            audioDeviceId: audioSelect.value,
            micVolume: micVolume.value,
            remoteVolume: remoteVolume.value,
            midiDeviceId: midiSelect.value,
            midiOutputDeviceId: midiOutputSelect.value,
            serverUrl: serverUrlInput.value
        };
        localStorage.setItem('settings', JSON.stringify(settings));
        logger.debug('Settings successfully saved to LocalStorage.');
    }, 500);
}

function loadSettings() {
    const savedSettings = localStorage.getItem('settings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            if (settings.serverUrl) serverUrlInput.value = settings.serverUrl;
            return settings;
        } catch (err) {
            logger.error(`Failed to parse saved settings: ${err.message}`);
        }
    }
    return { serverUrl: 'http://localhost:8080' };
}

async function setupMedia() {
    logger.info("Initializing media devices...");
    const devices = await navigator.mediaDevices.enumerateDevices();

    const hasInputs = devices.some(d => d.kind === 'videoinput' || d.kind === 'audioinput');
    const needsUnmasking = !hasInputs || devices.some(d => d.kind !== 'audiooutput' && d.label === '');

    if (needsUnmasking) {
        logger.info("Device labels are masked. Prompting user for access...");
        await new Promise((resolve) => {
            let isDone = false;
            const done = () => { if (!isDone) { isDone = true; resolve(); } };

            const poll = setInterval(async () => {
                const devs = await navigator.mediaDevices.enumerateDevices();
                if (devs.some(d => d.label !== '')) {
                    clearInterval(poll);
                    logger.info("Permissions granted (detected via polling). Unmasking complete.");
                    done();
                }
            }, 500);

            navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                .then(stream => {
                    clearInterval(poll);
                    stream.getTracks().forEach(t => t.stop());
                    logger.info("Permission prompt resolved normally.");
                    done();
                })
                .catch(err => {
                    clearInterval(poll);
                    logger.warn(`Permission prompt rejected/failed: ${err.message}. Will proceed with masked devices or 'none'.`);
                    done();
                });
        });
    } else {
        logger.info("Device labels are already unmasked.");
    }

    await populateDeviceOptions();
    startMedia().catch(e => logger.error(`startMedia error: ${e.message}`));
}

async function populateDeviceOptions() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        const audioDevices = devices.filter(d => d.kind === 'audioinput');

        logger.info(`Populating UI: Found ${videoDevices.length} cameras, ${audioDevices.length} microphones.`);

        const createOption = (type, index, device) => {
            const label = (device.label && device.label.trim() !== '') ? device.label : `${type} ${index + 1} (Masked)`;
            const val = device.deviceId || 'default';
            return `<option value="${val}">${label}</option>`;
        };

        videoSelect.innerHTML = '<option value="none">No camera</option>' + videoDevices.map((d, i) => createOption('Camera', i, d)).join('');
        audioSelect.innerHTML = '<option value="none">No microphone</option>' + audioDevices.map((d, i) => createOption('Microphone', i, d)).join('');

        const settings = loadSettings();

        if (settings && settings.videoDeviceId && settings.videoDeviceId !== 'none' && videoDevices.some(d => d.deviceId === settings.videoDeviceId)) {
            videoSelect.value = settings.videoDeviceId;
        } else {
            videoSelect.value = videoDevices.length > 0 ? (videoDevices[0].deviceId || 'default') : 'none';
        }

        if (settings && settings.audioDeviceId && settings.audioDeviceId !== 'none' && audioDevices.some(d => d.deviceId === settings.audioDeviceId)) {
            audioSelect.value = settings.audioDeviceId;
        } else {
            audioSelect.value = audioDevices.length > 0 ? (audioDevices[0].deviceId || 'default') : 'none';
        }

        currentVideoId = videoSelect.value;
        currentAudioId = audioSelect.value;

    } catch (err) {
        logger.error(`Error populating device options: ${err.message}`);
    }
}

async function setupMidi() {
    logger.info("Initializing Web MIDI API...");
    if (!navigator.requestMIDIAccess) {
        logger.warn('Web MIDI API is not supported by this browser. MIDI features disabled.');
        disableMidiUI();
        return;
    }

    try {
        midiAccess = await navigator.requestMIDIAccess();
        logger.info("MIDI access granted.");
        populateMidiUI();

        midiAccess.onstatechange = (event) => {
            logger.info(`MIDI device state changed: ${event.port.name} (${event.port.state})`);
            populateMidiUI();
            connectMidi();
        };
        connectMidi();
    } catch (err) {
        logger.error(`MIDI access denied or failed (${err.name}): ${err.message}.`);
        disableMidiUI();
    }
}

function disableMidiUI() {
    midiSelect.innerHTML = '<option value="none">Permission Denied/Unsupported</option>';
    midiOutputSelect.innerHTML = '<option value="none">Permission Denied/Unsupported</option>';
    midiSelect.disabled = true;
    midiOutputSelect.disabled = true;
}

function populateMidiUI() {
    if (!midiAccess) return;
    const inputs = Array.from(midiAccess.inputs.values());
    const outputs = Array.from(midiAccess.outputs.values());

    logger.info(`Populating MIDI UI. Inputs: ${inputs.length}, Outputs: ${outputs.length}`);

    const buildOptionList = (devices, fallbackPrefix) => {
        return devices.map((d, i) => `<option value="${d.id}">${d.name || fallbackPrefix + ' ' + (i+1)}</option>`).join('');
    };

    midiSelect.innerHTML = '<option value="none">No MIDI input</option>' + buildOptionList(inputs, 'MIDI-In');
    midiOutputSelect.innerHTML = '<option value="none">No MIDI output</option>' + buildOptionList(outputs, 'MIDI-Out');

    const settings = loadSettings();
    midiSelect.value = settings?.midiDeviceId && inputs.some(i => i.id === settings.midiDeviceId) ? settings.midiDeviceId : 'none';
    midiOutputSelect.value = settings?.midiOutputDeviceId && outputs.some(o => o.id === settings.midiOutputDeviceId) ? settings.midiOutputDeviceId : 'none';
}

function createAudioProcessingGraph(rawStream) {
    if (rawStream.getAudioTracks().length === 0) {
        gainNode = null;
        return null;
    }

    if (!audioContext || audioContext.state === 'closed') {
        logger.error("AudioContext is missing or closed. Cannot process microphone.");
        return null;
    }

    const source = audioContext.createMediaStreamSource(rawStream);
    gainNode = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();

    source.connect(gainNode);
    gainNode.connect(destination);

    gainNode.gain.value = parseFloat(micVolume.value);
    return destination.stream.getAudioTracks()[0];
}

function stopLocalStreamTracks() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
}

async function startMedia() {
    try {
        stopLocalStreamTracks();

        const vVal = videoSelect.value;
        const aVal = audioSelect.value;

        let videoConstraint = false;
        if (vVal === 'default') videoConstraint = { width: { ideal: 1920 }, height: { ideal: 1080 } };
        else if (vVal !== 'none' && vVal !== '') videoConstraint = { deviceId: { exact: vVal }, width: { ideal: 1920 }, height: { ideal: 1080 } };

        let audioConstraint = false;
        if (aVal === 'default') audioConstraint = true;
        else if (aVal !== 'none' && aVal !== '') audioConstraint = { deviceId: { exact: aVal } };

        if (!videoConstraint && !audioConstraint) {
            applyStreamToApp(null);
            return true;
        }

        const constraints = { video: videoConstraint, audio: audioConstraint };
        logger.info(`Starting media with constraints: ${JSON.stringify(constraints)}`);

        let isHanging = true;
        const hangTimer = setTimeout(() => {
            if (isHanging) {
                logger.warn("getUserMedia is taking longer than 5 seconds. The device or driver might be hanging. Try selecting a different device.");
                if (notifier) notifier.show({ title: 'Device Timeout', text: 'The selected camera or microphone is not responding.', icon: 'warn', duration: 10000 });
            }
        }, 5000);

        const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
        isHanging = false;
        clearTimeout(hangTimer);

        logger.info("Media stream acquired successfully.");
        applyStreamToApp(rawStream);
        return true;
    } catch (err) {
        logger.error(`Media start failed: ${err.name} - ${err.message}`);
        applyStreamToApp(null);
        return false;
    }
}

async function switchMedia() {
    const newVideoId = videoSelect.value;
    const newAudioId = audioSelect.value;

    if (newVideoId === currentVideoId && newAudioId === currentAudioId) return;

    logger.info(`Switching media -> Video: ${newVideoId}, Audio: ${newAudioId}`);

    try {
        let videoConstraint = false;
        if (newVideoId !== 'none') {
            videoConstraint = newVideoId === 'default' ? { width: { ideal: 1920 }, height: { ideal: 1080 } } : { deviceId: { exact: newVideoId }, width: { ideal: 1920 }, height: { ideal: 1080 } };
        }

        let audioConstraint = false;
        if (newAudioId !== 'none') {
            audioConstraint = newAudioId === 'default' ? true : { deviceId: { exact: newAudioId } };
        }

        if (!videoConstraint && !audioConstraint) {
            applyStreamToApp(null);
            currentVideoId = newVideoId;
            currentAudioId = newAudioId;
            return;
        }

        const constraints = { video: videoConstraint, audio: audioConstraint };

        let isHanging = true;
        const hangTimer = setTimeout(() => {
            if (isHanging) {
                logger.warn("Switching device is taking too long. Driver might be hanging.");
            }
        }, 5000);

        const newRawStream = await navigator.mediaDevices.getUserMedia(constraints);
        isHanging = false;
        clearTimeout(hangTimer);

        applyStreamToApp(newRawStream);

        currentVideoId = newVideoId;
        currentAudioId = newAudioId;
        logger.info('Media switched successfully.');
    } catch (err) {
        logger.error(`Error switching media (${err.name}): ${err.message}`);
        videoSelect.value = currentVideoId;
        audioSelect.value = currentAudioId;
        if (notifier) notifier.show({ title: 'Device Error', text: `Failed to switch device: ${err.message}`, icon: 'error' });
    }
}

function applyStreamToApp(stream) {
    stopLocalStreamTracks();

    if (!stream) {
        camLocalDrag.floatingWindow.setPlaceholderActive(true);
        camLocalDrag.floatingWindow.setMuteIndicatorActive(true);
        localStream = null;
        if (pc) {
            replaceRTCSenderTrack('video', null);
            replaceRTCSenderTrack('audio', null);
        }
        return;
    }

    const videoTrack = stream.getVideoTracks()[0] || null;
    const processedAudioTrack = createAudioProcessingGraph(stream);

    camLocalDrag.floatingWindow.setPlaceholderActive(!videoTrack);

    if (!processedAudioTrack && !isSelfMuted) {
        sendSelfMuteStatus(true);
        camLocalDrag.floatingWindow.setMuteIndicatorActive(true);
    } else if (processedAudioTrack && isSelfMuted && gainNode) {
        gainNode.gain.value = 0;
        camLocalDrag.floatingWindow.setMuteIndicatorActive(true);
    } else {
        camLocalDrag.floatingWindow.setMuteIndicatorActive(false);
        sendSelfMuteStatus(false);
    }

    const finalTracks =[videoTrack, processedAudioTrack].filter(Boolean);
    localStream = new MediaStream(finalTracks);
    logger.info(`Local stream applied with ${localStream.getTracks().length} track(s).`);

    camLocalDrag.floatingWindow.video.srcObject = localStream;

    if (pc) {
        logger.info("WebRTC connection exists. Injecting tracks dynamically.");
        replaceRTCSenderTrack('video', videoTrack);
        replaceRTCSenderTrack('audio', processedAudioTrack);
    }

    saveSettings();
}

async function replaceRTCSenderTrack(kind, newTrack) {
    if (!pc) return;

    const transceiver = pc.getTransceivers().find(t => t.receiver.track.kind === kind || (t.sender.track && t.sender.track.kind === kind));

    if (transceiver && transceiver.sender) {
        logger.debug(`Replacing ${kind} track on existing sender.`);
        try {
            await transceiver.sender.replaceTrack(newTrack);
        } catch (err) {
            logger.error(`Failed to replace ${kind} track: ${err.message}`);
        }
    } else if (newTrack) {
        logger.debug(`No existing ${kind} sender found. Adding new track.`);
        try {
            pc.addTrack(newTrack, localStream);
        } catch (err) {
            logger.error(`Failed to add new ${kind} track: ${err.message}`);
        }
    }
}

function adjustMicVolume() {
    if (gainNode && audioContext) {
        const newVolume = parseFloat(micVolume.value);
        gainNode.gain.setValueAtTime(newVolume, audioContext.currentTime);
        logger.debug(`Microphone gain set to ${newVolume}.`);
    }
}

function adjustRemoteVolume() {
    const lastVolume = remoteVideo.volume;
    const newVolume = parseFloat(remoteVolume.value);
    remoteVideo.volume = newVolume;
    logger.debug(`Remote volume set to ${newVolume}.`);

    if ((lastVolume === 0) !== (newVolume === 0)) {
        sendMuteStatusUpdate(newVolume === 0);
    }
}

async function connectMidi() {
    if (!midiAccess) return;
    try {
        const inputs = Array.from(midiAccess.inputs.values());
        inputs.forEach(input => input.onmidimessage = null);

        if (midiSelect.value && midiSelect.value !== 'none') {
            const selectedInput = inputs.find(input => input.id === midiSelect.value);
            if (selectedInput) {
                selectedInput.onmidimessage = handleLocalMidiMessage;
                logger.info(`MIDI input connected: ${selectedInput.name}.`);
            } else {
                logger.warn('Selected MIDI input device not found in active devices.');
            }
        }
        saveSettings();
    } catch (err) {
        logger.error(`MIDI connection error: ${err.message}`);
    }
}

function queueMidiForNetwork(midiDataUint8) {
    if (!midiChannel || midiChannel.readyState !== 'open') return;
    midiOutBuffer.push(midiDataUint8);

    if (!midiOutQueued) {
        midiOutQueued = true;
        queueMicrotask(flushMidiBuffer);
    }
}

function flushMidiBuffer() {
    midiOutQueued = false;

    if (midiChannel.bufferedAmount > MIDI_BUFFER_THRESHOLD) {
        logger.warn(`MIDI drop: High WebRTC buffer (${midiChannel.bufferedAmount} bytes). Avoid spamming network.`);
        midiOutBuffer =[];
        return;
    }

    let totalSize = 0;
    for (let i = 0; i < midiOutBuffer.length; i++) {
        totalSize += 1 + midiOutBuffer[i].length;
    }

    const payload = new Uint8Array(totalSize);
    let offset = 0;
    for (let i = 0; i < midiOutBuffer.length; i++) {
        payload[offset++] = midiOutBuffer[i].length;
        payload.set(midiOutBuffer[i], offset);
        offset += midiOutBuffer[i].length;
    }

    try {
        midiChannel.send(payload.buffer);
    } catch (e) {
        logger.error(`Failed to send MIDI batch: ${e.message}`);
    }

    midiOutBuffer =[];
}

function sendMidiMessage(midiData) {
    queueMidiForNetwork(midiData);
}

function handleLocalMidiMessage(message) {
    const midiData = new Uint8Array(message.data);
    const pianoInstance = pianos.pianos[0];

    if (pianoInstance && pianoInstance.opts.sendMidi) {
        queueMidiForNetwork(midiData);
    }

    pianos.getMIDIMessage(message, 'local');
}


async function updateVideoEncodingParameters(fullscreen = false) {
    if (!pc || pc.signalingState === 'closed') return;
    try {
        const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (!videoSender) return;

        const parameters = videoSender.getParameters();
        if (!parameters.encodings || parameters.encodings.length === 0) parameters.encodings = [{}];

        const quality = fullscreen ? VIDEO_QUALITY.FULLSCREEN : VIDEO_QUALITY.DEFAULT;
        parameters.encodings[0].maxBitrate = quality.maxBitrate;
        await videoSender.setParameters(parameters);

        logger.info(`Video encoding bitrate updated: ${fullscreen ? 'Fullscreen' : 'Standard'} (${(quality.maxBitrate / 1000000).toFixed(1)} Mbps)`);
    } catch (err) {
        logger.error(`Error updating video parameters: ${err.message}`);
    }
}

async function startConnection() {
    resetConnectionState();

    const serverUrl = serverUrlInput.value.trim();
    const parsed = parseServerUrl(serverUrl);

    if (!parsed) {
        logger.error('Invalid server URL provided.');
        resetConnectionUI();
        return;
    }

    updateUIForConnectionStart();
    setupWebsocketSignaling(parsed.serverIp, parsed.serverPort, parsed.isSecure);
    saveSettings();
}

function resetConnectionState() {
    if (pc) {
        pc.close();
        pc = null;
        logger.info('Previous RTCPeerConnection closed.');
    }
    if (ws) {
        ws.close();
        ws = null;
        logger.info('Previous WebSocket closed.');
    }

    makingOffer = false;
    ignoreOffer = false;
    isSettingRemoteAnswerPending = false;
    pendingIceCandidates =[];
}

function updateUIForConnectionStart() {
    startConnectionButton.disabled = true;
    startConnectionButton.style.backgroundColor = '#ccc';
    startConnectionButton.innerHTML = '<img src="assets/throbber.gif" alt="Waiting" class="throbber">';
    serverUrlInput.disabled = true;
}

function initializePeerConnection() {
    logger.debug('Initializing RTCPeerConnection.');

    try {
        pc = new RTCPeerConnection({
            iceServers:[
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                {
                    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443?transport=udp',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        });
    } catch (err) {
        logger.error(`Critical WebRTC Error: Failed to create RTCPeerConnection: ${err.message}`);
        if (notifier) {
            notifier.show({
                title: 'WebRTC Initialization Failed',
                text: 'Could not initialize P2P connection due to invalid ICE server configuration or browser restrictions.',
                icon: 'error',
                duration: 10000
            });
        }
        disconnect(true);
        return;
    }

    pc.onnegotiationneeded = async () => {
        try {
            makingOffer = true;
            logger.debug('Negotiation needed. Creating offer via setLocalDescription...');
            await pc.setLocalDescription();

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'description', description: pc.localDescription }));
                logger.info('Local offer successfully sent to signaling server.');
            } else {
                logger.error('Critical: WebSocket is not open during negotiation! Offer dropped.');
            }
        } catch (err) {
            logger.error(`Error during negotiation: ${err.message}`);
        } finally {
            makingOffer = false;
        }
    };

    pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'candidate', candidate }));
                logger.debug(`ICE candidate gathered and sent (Type: ${candidate.type || 'unknown'}, Protocol: ${candidate.protocol || 'unknown'}).`);
            } else {
                logger.warn('WebSocket not open. ICE candidate dropped.');
            }
        } else {
            logger.debug('ICE candidate gathering complete.');
        }
    };

    pc.onicecandidateerror = (event) => {
        const isConnected = pc && (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed');
        const errDetails = `${event.errorText || 'Timeout/Unreachable'} (Code: ${event.errorCode || 'N/A'}, URL: ${event.url || 'N/A'})`;

        if (isConnected) {
            logger.debug(`Ignored ICE candidate error (already connected): ${errDetails}`);
        } else {
            logger.warn(`ICE candidate error: ${errDetails}`);
        }
    };

    pc.onsignalingstatechange = () => {
        if (pc) logger.debug(`WebRTC Signaling State changed to: ${pc.signalingState}`);
    };

    pc.onconnectionstatechange = () => {
        if (pc) logger.info(`WebRTC Connection State changed to: ${pc.connectionState}`);
    };

    pc.oniceconnectionstatechange = () => {
        if (pc) {
            logger.info(`ICE Connection State changed: ${pc.iceConnectionState}`);
            handleIceConnectionStateChange();
        }
    };

    pc.ontrack = processRemoteTrack;
    pc.ondatachannel = handleRemoteDataChannel;
}

function handleIceConnectionStateChange() {
    if (!pc) return;
    switch (pc.iceConnectionState) {
        case 'connected':
        case 'completed':
            logger.info('WebRTC Connection fully established.');
            toggleMetronomeButton.disabled = false;
            shareScreenButton.disabled = false;
            startConnectionButton.disabled = false;
            startConnectionButton.style.backgroundColor = '#9D1919';
            startConnectionButton.style.color = '#ffffff';
            startConnectionButton.innerHTML = 'Disconnect';
            serverUrlInput.disabled = true;
            updateVideoEncodingParameters(false);
            break;
        case 'disconnected':
            logger.warn('ICE connection disconnected. Potential network disruption.');
            break;
        case 'failed':
            logger.error('ICE connection failed. NAT traversal issue likely.');
            if (notifier) notifier.show({ title: 'Connection Failed', text: 'P2P Connection could not be established. Check your firewall or try a different network.', icon: 'error', duration: 10000 });
            disconnect();
            break;
        case 'closed':
            logger.info('ICE connection cleanly closed.');
            break;
    }
}

function addLocalTracksToPeer() {
    if (!localStream) {
        logger.warn('No local stream is active right now. WebRTC will connect without video/audio initially.');
        return;
    }
    localStream.getTracks().forEach(track => {
        logger.debug(`Adding local track to PeerConnection: ${track.kind} (ID: ${track.id})`);
        pc.addTrack(track, localStream);
    });
}

function initializeDataChannels() {
    midiChannel = pc.createDataChannel('midiChannel', { ordered: true });
    setupMidiChannel(midiChannel);

    fileChannel = pc.createDataChannel('fileChannel', { ordered: true });
    setupFileChannel(fileChannel);

    chatChannel = pc.createDataChannel('chatChannel', { ordered: true });
    setupChatChannel(chatChannel);

    metronomeChannel = pc.createDataChannel('metronomeChannel', { ordered: true });
    setupMetronomeChannel(metronomeChannel);

    commonDataChannel = pc.createDataChannel('commonDataChannel', { ordered: true });
    setupCommonDataChannel(commonDataChannel);
}

function handleRemoteDataChannel(event) {
    const channel = event.channel;
    logger.debug(`Inbound DataChannel received: ${channel.label}`);

    switch (channel.label) {
        case 'midiChannel':
            midiChannel = channel;
            setupMidiChannel(midiChannel);
            break;
        case 'fileChannel':
            fileChannel = channel;
            setupFileChannel(fileChannel);
            break;
        case 'chatChannel':
            chatChannel = channel;
            setupChatChannel(chatChannel);
            break;
        case 'metronomeChannel':
            metronomeChannel = channel;
            setupMetronomeChannel(metronomeChannel);
            break;
        case 'commonDataChannel':
            commonDataChannel = channel;
            setupCommonDataChannel(commonDataChannel);
            break;
        default:
            logger.warn(`Unknown DataChannel label received: ${channel.label}`);
    }
}

function setupWebsocketSignaling(ip, port, isSecure) {
    const protocol = isSecure ? 'wss' : 'ws';
    const fullUrl = `${protocol}://${ip}:${port}`;
    logger.info(`Attempting to connect to signaling server at: ${fullUrl}`);

    try {
        ws = new WebSocket(fullUrl);
    } catch (e) {
        logger.error(`Failed to create WebSocket: ${e.message}`);
        disconnect();
        return;
    }

    ws.onopen = () => logger.info('Signaling server connected. Waiting for role assignment...');

    ws.onerror = (err) => {
        logger.error('WebSocket encountered an error. Check if the server URL and port are correct.');
    };

    ws.onclose = (event) => {
        logger.info(`Signaling connection closed. Code: ${event.code}, Reason: ${event.reason || 'None'}`);
        if (!pc || (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed')) {
            logger.error('Signaling dropped before WebRTC was fully established. Aborting.');
            disconnect();
        } else {
            logger.warn('Signaling offline, but WebRTC is established. P2P session will continue.');
        }
    };

    ws.onmessage = async (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type !== 'candidate') logger.debug(`Signaling msg received: ${msg.type}`);
            await processSignalingMessage(msg);
        } catch (err) {
            logger.error(`Error processing signaling message: ${err.message}`);
        }
    };
}

async function processSignalingMessage(msg) {
    switch (msg.type) {
        case 'role-assignment':
            polite = msg.polite;
            logger.info(`Role assigned by server. I am ${polite ? 'POLITE' : 'IMPOLITE'}.`);

            if (!pc) {
                logger.info('Peer detected! Initializing P2P WebRTC connection...');
                initializePeerConnection();
                addLocalTracksToPeer();
                initializeDataChannels();
            }
            break;

        case 'description':
            const description = msg.description;
            const offerCollision = (description.type === 'offer') && (makingOffer || (pc && pc.signalingState !== 'stable'));
            ignoreOffer = !polite && offerCollision;

            if (ignoreOffer) {
                logger.warn('Offer collision detected. I am impolite, ignoring peer offer.');
                return;
            }

            if (!pc) {
                logger.warn('Received remote description but PeerConnection is not initialized yet. Discarding.');
                return;
            }

            isSettingRemoteAnswerPending = description.type === 'answer';
            logger.debug(`Setting remote description (${description.type}).`);

            try {
                await pc.setRemoteDescription(description);
            } catch(err) {
                logger.error(`Failed to apply remote description: ${err.message}`);
                if (description.type === 'offer') {
                    await pc.setLocalDescription({ type: 'rollback' });
                    await pc.setRemoteDescription(description);
                } else {
                    return;
                }
            }

            isSettingRemoteAnswerPending = false;

            if (pendingIceCandidates.length > 0) {
                logger.info(`Flushing ${pendingIceCandidates.length} queued ICE candidates...`);
                for (const candidate of pendingIceCandidates) {
                    try {
                        await pc.addIceCandidate(candidate);
                    } catch (e) {
                        if (!ignoreOffer) logger.error(`Error adding flushed candidate: ${e.message}`);
                    }
                }
                pendingIceCandidates = [];
            }

            if (description.type === 'offer') {
                logger.debug('Remote offer applied. Creating local answer...');
                await pc.setLocalDescription();
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'description', description: pc.localDescription }));
                    logger.info('Local answer sent to peer.');
                }
            }
            break;

        case 'candidate':
            try {
                if (!pc || !pc.remoteDescription || isSettingRemoteAnswerPending) {
                    logger.debug('Queuing ICE candidate (remote description not stable yet).');
                    pendingIceCandidates.push(msg.candidate);
                } else {
                    await pc.addIceCandidate(msg.candidate);
                }
            } catch (err) {
                if (!ignoreOffer) logger.error(`Failed to add ICE candidate: ${err.message}`);
            }
            break;

        case 'error':
            logger.error(`Server error: ${msg.message}`);
            if (notifier) {
                notifier.show({
                    title: 'Signaling Error',
                    text: msg.message,
                    icon: 'error',
                    duration: 8000
                });
            }
            disconnect(true);
            break;

        case 'peer-disconnected':
            logger.info('The remote peer has disconnected from the signaling server.');
            if (notifier) notifier.show({ title: 'Peer left', text: 'The peer has disconnected.', icon: 'info' });
            disconnect();
            break;

        case 'new-stream':
            logger.info(`Peer initiated a screen share stream: ${msg.streamName} (${msg.streamId})`);
            pendingStreams.set(msg.streamId, { name: msg.streamName });
            break;

        case 'stop-stream':
            logger.info(`Peer stopped their screen share: ${msg.streamId}`);
            stopScreenShare(msg.streamId, false);
            break;
    }
}

function processRemoteTrack(event) {
    const stream = event.streams[0];
    if (!stream) return logger.warn('Remote track event received without a valid stream object.');

    const streamId = stream.id;
    const streamInfo = pendingStreams.get(streamId);

    if (streamInfo) {
        logger.info(`Attaching remote screen share to Floating Window: ${streamInfo.name}`);
        const remoteWindow = new FloatingWindow({
            container: additionalStreamsContainer,
            stream: stream,
            title: `Peer: ${streamInfo.name}`,
            isClosable: true,
            id: streamId
        });
        remoteWindow.wrapper.addEventListener('close', (e) => stopScreenShare(e.detail.id, false));
        activeScreenShares.set(streamId, { window: remoteWindow, stream: stream });
        pendingStreams.delete(streamId);
    } else {
        if (remoteVideo.srcObject !== stream) {
            logger.info('Remote main stream received. Attaching to main video element.');
            remoteVideo.srcObject = stream;
            remoteVideo.play().catch(err => logger.error(`Error auto-playing remote video: ${err.message}`));
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.onmute = () => peerSelfMutedIndicator.classList.add('active');
            audioTrack.onunmute = () => peerSelfMutedIndicator.classList.remove('active');
            peerSelfMutedIndicator.classList.toggle('active', audioTrack.muted);
        }

        remotePlaceholder.classList.toggle('active', stream.getVideoTracks().length === 0);

        stream.onremovetrack = (e) => {
            logger.debug(`Remote track removed: ${e.track.kind}`);
            if (e.track.kind === 'video' && stream.getVideoTracks().length === 0) remotePlaceholder.classList.add('active');
            if (e.track.kind === 'audio') peerSelfMutedIndicator.classList.remove('active');
        };

        stream.onaddtrack = (e) => {
            logger.debug(`Remote track added: ${e.track.kind}`);
            if (e.track.kind === 'video') remotePlaceholder.classList.remove('active');
        };
    }
}

function disconnect(isIntentional = false) {
    logger.info(`Disconnect sequence initiated. (Intentional: ${isIntentional})`);

    if (!isIntentional && notifier && (pc || ws)) {
        notifier.show({
            position: 'nw', icon: 'error', title: 'Connection Lost',
            text: 'The connection was unexpectedly interrupted.',
            duration: 10000, showProgress: true, sound: true
        });
    }

    for (const streamId of activeScreenShares.keys()) {
        stopScreenShare(streamId, true);
    }

    if (pc) {
        pc.onnegotiationneeded = null;
        pc.onicecandidate = null;
        pc.oniceconnectionstatechange = null;
        pc.close();
        pc = null;
        logger.info('RTCPeerConnection destroyed.');
    }

    if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        if (ws.readyState === WebSocket.OPEN && isIntentional) {
            ws.send(JSON.stringify({ type: 'disconnect' }));
        }
        ws.close();
        ws = null;
        logger.info('WebSocket destroyed.');
    }

    remoteVideo.srcObject = null;
    remotePlaceholder.classList.add('active');
    remoteMuteIndicator.classList.remove('active');
    peerSelfMutedIndicator.classList.remove('active');

    if (camLocalDrag?.floatingWindow) {
        camLocalDrag.floatingWindow.setPeerMutedMeIndicatorActive(false);
    }

    if (pianos.pianos[0]) {
        pianos.pianos[0].resetPeerMidiStatus();
    }

    midiChannel = fileChannel = chatChannel = metronomeChannel = commonDataChannel = null;

    if (fileSharing) fileSharing.disable();
    if (chat) chat.disable();

    resetConnectionUI();
}

function resetConnectionUI() {
    startConnectionButton.disabled = false;
    startConnectionButton.style.backgroundColor = '#4CAF50';
    startConnectionButton.innerHTML = 'Start';
    serverUrlInput.disabled = false;

    toggleMetronomeButton.disabled = true;
    shareScreenButton.disabled = true;
    toggleMetronomeButton.classList.remove('active');
    metronomeContainer.classList.remove('visible', 'master', 'slave');

    isMetronomeVisible = false;
    if (metronome) metronome.pause();
    logger.debug('UI reset to disconnected state.');
}

function setupMidiChannel(channel) {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => logger.info('MIDI DataChannel is OPEN. SCTP Reliable transmission enabled.');
    channel.onclose = () => logger.info('MIDI DataChannel is CLOSED.');
    channel.onerror = (err) => logger.error(`MIDI DataChannel error: ${err.message}`);

    channel.onmessage = (event) => {
        const pianoInstance = pianos.pianos[0];
        if (pianoInstance && pianoInstance.opts.receiveMidi) {
            const buffer = new Uint8Array(event.data);
            let offset = 0;

            while (offset < buffer.length) {
                const len = buffer[offset++];
                if (offset + len > buffer.length) {
                    logger.error('Invalid MIDI batch payload received. Dropping remaining buffer to protect state.');
                    break;
                }

                const midiData = buffer.slice(offset, offset + len);
                offset += len;

                pianos.getMIDIMessage({ data: midiData }, 'remote');

                if (midiAccess && midiOutputSelect.value && midiOutputSelect.value !== 'none') {
                    const output = Array.from(midiAccess.outputs.values()).find(o => o.id === midiOutputSelect.value);
                    if (output) output.send(midiData);
                }
            }
        }
    };
}

function setupChatChannel(channel) {
    const handleOpen = () => {
        logger.info('Chat DataChannel is OPEN.');
        chat.enable();
    };
    channel.onmessage = (event) => chat.handleRemoteMessage(event.data);
    channel.onerror = (err) => logger.error(`Chat DataChannel error: ${err.message}`);
    channel.onclose = () => { logger.info('Chat DataChannel CLOSED.'); chat.disable(); };
    if (channel.readyState === 'open') handleOpen(); else channel.onopen = handleOpen;
}

function setupCommonDataChannel(channel) {
    channel.onopen = () => {
        logger.info('Common DataChannel is OPEN.');
        sendSelfMuteStatus(isSelfMuted);
        sendMidiSettingsStatus();
    };
    channel.onclose = () => logger.info('Common DataChannel CLOSED.');
    channel.onerror = (err) => logger.error(`Common DataChannel error: ${err.message}`);
    channel.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
                case 'self_mute_status':
                    logger.info(`Peer ${msg.muted ? 'muted' : 'unmuted'} their microphone.`);
                    peerSelfMutedIndicator.classList.toggle('active', msg.muted);
                    break;
                case 'midi_settings_status':
                    if (pianos.pianos[0]) pianos.pianos[0].updatePeerMidiStatus({ canReceive: msg.settings.receive, isSending: msg.settings.send });
                    break;
                case 'effect_control':
                    if (effects) effects.handleRemoteMessage(msg.payload);
                    break;
                case 'mute_status':
                    logger.info(`Peer ${msg.muted ? 'muted' : 'unmuted'} you on their side.`);
                    camLocalDrag.floatingWindow.setPeerMutedMeIndicatorActive(msg.muted);
                    break;
            }
        } catch (err) { logger.error(`Error parsing Common DataChannel message: ${err.message}`); }
    };
}

function setupMetronomeChannel(channel) {
    channel.onopen = () => {
        logger.info('Metronome DataChannel is OPEN.');
        if (isMetronomeVisible) sendMetronomeState();
    };
    channel.onclose = () => {
        logger.info('Metronome DataChannel CLOSED.');
        toggleMetronomeButton.disabled = true;
        metronomeContainer.classList.remove('visible', 'master', 'slave');
        toggleMetronomeButton.classList.remove('active');
        isMetronomeVisible = false;
        if (metronome) metronome.pause();
    };
    channel.onerror = (err) => logger.error(`Metronome DataChannel error: ${err.message}`);
    channel.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'metronome_sync') {
                const remoteIsVisible = msg.data.visible;
                if (!isMetronomeVisible && remoteIsVisible) {
                    isMetronomeVisible = true;
                    metronomeContainer.classList.add('visible');
                    toggleMetronomeButton.classList.add('active');
                } else if (isMetronomeVisible && !remoteIsVisible) {
                    isMetronomeVisible = false;
                    metronomeContainer.classList.remove('visible');
                    toggleMetronomeButton.classList.remove('active');
                    metronome.pause();
                }
                metronome.setState(msg.data, msg.isMasterClaim);
            } else if (msg.type === 'metronome_tick') {
                metronome.handleMasterTick(msg.data);
            }
        } catch (err) { logger.error(`Error parsing Metronome message: ${err.message}`); }
    };
}

function setupFileChannel(channel) {
    channel.binaryType = 'arraybuffer';
    const handleOpen = () => {
        logger.info('File DataChannel is OPEN.');
        fileSharing.setChannel(channel);
        fileSharing.enable();
    };
    channel.onmessage = (event) => fileSharing.handleRemoteData(event.data);
    channel.onerror = (err) => { logger.error(`File DataChannel error: ${err.message}`); fileSharing.disable(); };
    channel.onclose = () => { logger.info('File DataChannel CLOSED.'); fileSharing.disable(); fileSharing.setChannel(null); };
    if (channel.readyState === 'open') handleOpen(); else channel.onopen = handleOpen;
}

function sendSelfMuteStatus(isMuted) {
    if (commonDataChannel && commonDataChannel.readyState === 'open') {
        commonDataChannel.send(JSON.stringify({ type: 'self_mute_status', muted: isMuted }));
        logger.debug(`Transmitted self mute status: ${isMuted}`);
    }
}

function sendMuteStatusUpdate(isMuted) {
    if (commonDataChannel && commonDataChannel.readyState === 'open') {
        commonDataChannel.send(JSON.stringify({ type: 'mute_status', muted: isMuted }));
        logger.debug(`Transmitted peer mute status: ${isMuted}`);
    }
}

function sendMidiSettingsStatus() {
    if (commonDataChannel && commonDataChannel.readyState === 'open' && pianos.pianos[0]) {
        const opts = pianos.pianos[0].opts;
        commonDataChannel.send(JSON.stringify({ type: 'midi_settings_status', settings: { send: opts.sendMidi, receive: opts.receiveMidi } }));
    }
}

function sendMetronomeState(isClaimingMaster = false) {
    if (metronomeChannel && metronomeChannel.readyState === 'open') {
        const payload = { type: 'metronome_sync', data: { ...metronome.getState(), visible: isMetronomeVisible }, isMasterClaim: isClaimingMaster };
        metronomeChannel.send(JSON.stringify(payload));
    }
}

function sendMetronomeTick(tickData) {
    if (metronomeChannel && metronomeChannel.readyState === 'open' && metronome.isMaster) {
        metronomeChannel.send(JSON.stringify({ type: 'metronome_tick', data: tickData }));
    }
}

async function startScreenShare() {
    if (!pc) return logger.error('Cannot start screen share: no active connection.');
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const track = stream.getVideoTracks()[0];
        const streamId = stream.id;

        let streamName = track.label;
        if (!streamName ||["internal camera", "bildschirm", "screen"].includes(streamName.toLowerCase())) {
            streamName = "Shared Content";
        }

        ws.send(JSON.stringify({ type: 'new-stream', streamId, streamName }));
        logger.info(`Initiated screen share: ${streamName}`);

        const sender = pc.addTrack(track, stream);

        const localWindow = new FloatingWindow({
            container: additionalStreamsContainer, stream: stream,
            title: `You share: ${streamName}`, isClosable: true, id: streamId
        });

        activeScreenShares.set(streamId, { window: localWindow, sender });

        track.onended = () => stopScreenShare(streamId, true);
        localWindow.wrapper.addEventListener('close', () => track.stop());

    } catch (err) {
        logger.error(`Error starting screen share: ${err.message}`);
    }
}

function stopScreenShare(streamId, isInitiator) {
    const share = activeScreenShares.get(streamId);
    if (!share) return;

    if (isInitiator) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop-stream', streamId }));
        if (pc && share.sender) pc.removeTrack(share.sender);
    }

    share.window.destroy();
    activeScreenShares.delete(streamId);
    logger.info(`Screen share ${streamId} stopped.`);
}

function bindDeviceListeners() {
    navigator.mediaDevices.ondevicechange = async () => {
        logger.info('Media device hardware change detected. Refreshing options.');
        await populateDeviceOptions();
    };

    midiSelect.addEventListener('change', () => { connectMidi(); saveSettings(); });
    midiOutputSelect.addEventListener('change', saveSettings);
    videoSelect.addEventListener('change', switchMedia);
    audioSelect.addEventListener('change', switchMedia);
}

function bindVolumeListeners() {
    micVolume.addEventListener('input', () => {
        adjustMicVolume();
        saveSettings();
        lastMicVolume = micVolume.value;
        const isMutedNow = parseFloat(micVolume.value) === 0;

        if (isMutedNow !== isSelfMuted) {
            isSelfMuted = isMutedNow;
            sendSelfMuteStatus(isMutedNow);
        }

        micVolumeIcon.classList.toggle('muted', isMutedNow);
        camLocalDrag?.floatingWindow?.setMuteIndicatorActive(isMutedNow);
        micVolume.style.setProperty('--p', `${micVolume.value * 100}%`);
    });

    remoteVolume.addEventListener('input', () => {
        adjustRemoteVolume();
        saveSettings();
        lastRemoteVolume = remoteVolume.value;
        const isMuted = parseFloat(remoteVolume.value) === 0;

        remoteVolumeIcon.classList.toggle('muted', isMuted);
        remoteMuteIndicator.classList.toggle('active', isMuted);
        remoteVolume.style.setProperty('--p', `${remoteVolume.value * 100}%`);
    });

    micVolumeIcon.addEventListener('click', () => {
        const isCurrentlyMuted = parseFloat(micVolume.value) === 0;
        micVolume.value = isCurrentlyMuted ? lastMicVolume : 0;
        micVolume.dispatchEvent(new Event('input'));
    });

    remoteVolumeIcon.addEventListener('click', () => {
        const isMuted = parseFloat(remoteVolume.value) > 0;
        remoteVolume.value = isMuted ? 0 : lastRemoteVolume;
        remoteVolume.dispatchEvent(new Event('input'));
    });
}

function bindApplicationControlListeners() {
    startConnectionButton.addEventListener('click', () => {
        startConnectionButton.innerHTML.includes('Disconnect') ? disconnect(true) : startConnection();
    });

    shareScreenButton.addEventListener('click', startScreenShare);

    toggleMetronomeButton.addEventListener('click', () => {
        isMetronomeVisible = !isMetronomeVisible;
        metronomeContainer.classList.toggle('visible', isMetronomeVisible);
        toggleMetronomeButton.classList.toggle('active', isMetronomeVisible);

        if (isMetronomeVisible && !metronome.isMaster) metronome.claimMastership();
        else { metronome.pause(); sendMetronomeState(); }
    });

    metronomeContainer.addEventListener('dblclick', () => {
        logger.info("Attempting to claim metronome mastership...");
        metronome.claimMastership();
    });
}

function bindFullscreenListeners() {
    const toggleFullscreen = (el) => {
        const fScreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
        if (!fScreen) {
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        }
    };

    remoteVideo.addEventListener('dblclick', () => toggleFullscreen(remoteVideo));

    const onFullscreenChange = () => {
        const fScreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
        updateVideoEncodingParameters(!!fScreen);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
}

function setEventListeners() {
    logger.debug('Binding UI event listeners.');
    bindDeviceListeners();
    bindVolumeListeners();
    bindApplicationControlListeners();
    bindFullscreenListeners();
}

async function init() {
    logger.info('Booting MidiCam application...');

    if (!navigator.mediaDevices) {
        logger.error('navigator.mediaDevices is undefined. Check if you are on HTTPS.');
        if (notifier) notifier.show({ title: 'Environment Error', text: 'Media API not available. Ensure you are using HTTPS.', icon: 'error', duration: 10000 });
    }

    new Sidebar();
    notifier = new Notifications({ logger });
    camLocalDrag = new CamLocalDrag();

    effects = new Effects({
        logger,
        onSendMessage: (payload) => {
            if (commonDataChannel && commonDataChannel.readyState === 'open') {
                commonDataChannel.send(JSON.stringify({ type: 'effect_control', payload }));
            }
        }
    });

    try {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioCtxClass();
        logger.info(`Global AudioContext established. Initial state: ${audioContext.state}`);

        const resumeAudio = async () => {
            if (audioContext && audioContext.state === 'suspended') {
                try {
                    await audioContext.resume();
                    logger.debug('AudioContext successfully resumed after user gesture.');
                } catch(e) {
                    logger.warn(`Could not resume AudioContext: ${e.message}`);
                }
            }
            document.removeEventListener('click', resumeAudio);
            document.removeEventListener('keydown', resumeAudio);
        };
        document.addEventListener('click', resumeAudio);
        document.addEventListener('keydown', resumeAudio);
    } catch(e) {
        logger.error(`Failed to create AudioContext: ${e.message}`);
    }

    lastMicVolume = micVolume.value;
    lastRemoteVolume = remoteVolume.value;
    isSelfMuted = parseFloat(micVolume.value) === 0;

    micVolumeIcon.classList.toggle('muted', isSelfMuted);
    remoteVolumeIcon.classList.toggle('muted', parseFloat(remoteVolume.value) === 0);
    remoteMuteIndicator.classList.toggle('active', parseFloat(remoteVolume.value) === 0);
    remotePlaceholder.classList.add('active');

    if (!gainNode || isSelfMuted) camLocalDrag.floatingWindow.setMuteIndicatorActive(true);

    micVolume.style.setProperty('--p', `${micVolume.value * 100}%`);
    remoteVolume.style.setProperty('--p', `${remoteVolume.value * 100}%`);

    adjustMicVolume();
    setEventListeners();

    fileSharing = new FileSharing({
        container: '#filesharing-container', logger, notifier,
        onSendData: (data) => {
            if (fileChannel && fileChannel.readyState === 'open') fileChannel.send(data);
            else logger.error('Cannot send file block: DataChannel offline.');
        }
    });

    chat = new Chat({
        container: document.getElementById('chat-container'), notifier,
        onSendMessage: (message) => {
            if (chatChannel && chatChannel.readyState === 'open') chatChannel.send(message);
            else logger.error('Cannot send chat message: DataChannel offline.');
        }
    });

    pianos.createPiano({
        'selector': '#piano',
        'sendMidi': true, 'receiveMidi': true, 'playMidiNotes': false,
        'keyPressedLocalRGB':[0, 255, 0], 'keyPressedRemoteRGB':[255, 0, 0],
        'pedalSoft': true, 'pedalSostenuto': true, 'pedalSustain': true,
        'undampedStrings':['G6', 'C8'],
        'sendMidiMessage': sendMidiMessage,
        'onSettingsChange': sendMidiSettingsStatus
    }, logger);

    metronome = new Metronome({
        audioContext,
        onStateChange: sendMetronomeState,
        onTick: sendMetronomeTick
    });
    metronome.insertInto(metronomeContainer);
    new MetronomeDrag();

    loadSettings();
    logger.info('MidiCam basic UI sequence complete. Handing over to hardware discovery...');

    setupMedia().catch(e => logger.error(`setupMedia unhandled exception: ${e.message}`));
    setupMidi().catch(e => logger.error(`setupMidi unhandled exception: ${e.message}`));
}

init();
