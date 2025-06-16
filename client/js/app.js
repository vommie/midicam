import { Pianos } from "./piano.js";
import { Metronome } from "./metronome.js";
import { CamLocalDrag } from "./camLocalDrag.js";
import { MetronomeDrag } from "./metronomeDrag.js";
import { FloatingWindow } from "./floatingWindow.js";
import { Chat } from './chat.js';
import { FileSharing } from './filesharing.js';
import { Log } from './logs.js';
import { Sidebar } from './sidebar.js';

const logger = new Log({ toggleButtonSelector: '#toggleLogButton' });

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
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

let pc;
let midiChannel;
let fileChannel;
let chatChannel;
let metronomeChannel;
let localStream;
let audioContext;
let gainNode;
let currentVideoId = '';
let currentAudioId = '';
let midiAccess = null;
let isMetronomeVisible = false;
let lastMicVolume = 1;
let lastRemoteVolume = 1;
let ws;
const MIDI_BUFFER_THRESHOLD = 1024;
let iceReconnectTimer = null;
let wsPingInterval = null;

const pianos = new Pianos();
let metronome;
let chat;
let fileSharing;
const activeScreenShares = new Map();
const pendingStreams = new Map();

const VIDEO_QUALITY = {
    DEFAULT: { maxBitrate: 6000 * 1000 },
    FULLSCREEN: { maxBitrate: 10000 * 1000 }
};

function parseServerUrl(url) {
    try {
        const cleanUrl = url.replace(/^wss?:\/\//i, '').replace(/^https?:\/\//i, '');
        const urlObj = new URL(`http://${cleanUrl}`);
        const hostname = urlObj.hostname;
        const port = urlObj.port || '8080';
        return { serverIp: hostname, serverPort: port };
    } catch (err) {
        logger.error(`Error parsing URL: ${err.message}`);
        return null;
    }
}

function saveSettings() {
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
    logger.info('Settings saved.');
}

function loadSettings() {
    const savedSettings = localStorage.getItem('settings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        serverUrlInput.value = settings.serverUrl || 'http://localhost:8080';
        return settings;
    }
    return { serverUrl: 'http://localhost:8080' };
}

async function populateDeviceOptions() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        logger.debug(`Raw device data: ${JSON.stringify(devices.map(d => ({ kind: d.kind, label: d.label, deviceId: d.deviceId })))}`);

        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        logger.info(`Detected video devices: ${videoDevices.length}, audio devices: ${audioDevices.length}`);

        const createFallbackName = (type, index, device) => {
            if (device.label && device.label.trim() !== '' && device.label !== type) {
                return device.label;
            }
            return `${type} ${index + 1}`;
        };

        videoSelect.innerHTML = videoDevices.length > 0
            ? videoDevices.map((device, index) =>
                `<option value="${device.deviceId}">${createFallbackName('Camera', index, device)}</option>`
            ).join('')
            : '<option value="">No camera available</option>';

        audioSelect.innerHTML = audioDevices.length > 0
            ? audioDevices.map((device, index) =>
                `<option value="${device.deviceId}">${createFallbackName('Microphone', index, device)}</option>`
            ).join('')
            : '<option value="">No microphone available</option>';

        const settings = loadSettings();
        if (settings && settings.videoDeviceId && videoDevices.some(d => d.deviceId === settings.videoDeviceId)) {
            videoSelect.value = settings.videoDeviceId;
        } else {
            videoSelect.value = videoDevices[0]?.deviceId || '';
        }
        if (settings && settings.audioDeviceId && audioDevices.some(d => d.deviceId === settings.audioDeviceId)) {
            audioSelect.value = settings.audioDeviceId;
        } else {
            audioSelect.value = audioDevices[0]?.deviceId || '';
        }
        micVolume.value = settings?.micVolume || '1';
        remoteVolume.value = settings?.remoteVolume || '1';
        remoteVideo.volume = remoteVolume.value;

        currentVideoId = videoSelect.value;
        currentAudioId = audioSelect.value;

        logger.info('Devices loaded.');
    } catch (err) {
        logger.error(`Error loading devices: ${err}`);
    }
}

async function populateMidiOptions() {
    try {
        midiAccess = await navigator.requestMIDIAccess();
        const inputs = Array.from(midiAccess.inputs.values());
        const outputs = Array.from(midiAccess.outputs.values());

        midiSelect.innerHTML = '<option value="">No MIDI input</option>' +
            inputs.map(input =>
                `<option value="${input.id}">${input.name || 'MIDI-In ' + input.id.slice(0, 5)}</option>`
            ).join('');
        midiOutputSelect.innerHTML = '<option value="">No MIDI output</option>' +
            outputs.map(output =>
                `<option value="${output.id}">${output.name || 'MIDI-Out ' + output.id.slice(0, 5)}</option>`
            ).join('');

        const settings = loadSettings();
        if (settings && settings.midiDeviceId && inputs.some(input => input.id === settings.midiDeviceId)) {
            midiSelect.value = settings.midiDeviceId;
        } else {
            midiSelect.value = '';
        }
        if (settings && settings.midiOutputDeviceId && outputs.some(output => output.id === settings.midiOutputDeviceId)) {
            midiOutputSelect.value = settings.midiOutputDeviceId;
        } else {
            midiOutputSelect.value = '';
        }

        midiAccess.onstatechange = (event) => {
            const inputs = Array.from(midiAccess.inputs.values());
            const outputs = Array.from(midiAccess.outputs.values());
            const selectedInputId = midiSelect.value;
            const selectedOutputId = midiOutputSelect.value;

            midiSelect.innerHTML = '<option value="">No MIDI input</option>' +
                inputs.map(input =>
                    `<option value="${input.id}">${input.name || 'MIDI-In ' + input.id.slice(0, 5)}</option>`
                ).join('');
            midiOutputSelect.innerHTML = '<option value="">No MIDI output</option>' +
                outputs.map(output =>
                    `<option value="${output.id}">${output.name || 'MIDI-Out ' + output.id.slice(0, 5)}</option>`
                ).join('');

            if (inputs.some(input => input.id === selectedInputId)) {
                midiSelect.value = selectedInputId;
            } else {
                midiSelect.value = '';
            }
            if (outputs.some(output => output.id === selectedOutputId)) {
                midiOutputSelect.value = selectedOutputId;
            } else {
                midiOutputSelect.value = '';
            }

            logger.info(`MIDI devices updated: ${event.port.state} - ${event.port.name}`);
            connectMidi();
        };

        logger.info('MIDI devices loaded.');
    } catch (err) {
        logger.error(`Error loading MIDI devices: ${err}`);
    }
}

async function startMedia() {
    try {
        const videoId = videoSelect.value;
        const audioId = audioSelect.value;
        const videoConstraints = videoId ? {
            deviceId: { exact: videoId },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        } : true;

        const constraints = {
            video: videoConstraints,
            audio: audioId ? { deviceId: { exact: audioId } } : true
        };

        if (!videoId) delete constraints.video.deviceId;
        if (!audioId) delete constraints.audio.deviceId;

        logger.debug(`Starting media with constraints: ${JSON.stringify(constraints)}`);
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;

        if (localStream.getAudioTracks().length > 0) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(localStream);
            gainNode = audioContext.createGain();
            gainNode.gain.value = parseFloat(micVolume.value);
            source.connect(gainNode);
            const destination = audioContext.createMediaStreamDestination();
            gainNode.connect(destination);
            const videoTracks = localStream.getVideoTracks();
            const audioTrack = destination.stream.getAudioTracks()[0];
            localStream = new MediaStream([...videoTracks, audioTrack]);
            localVideo.srcObject = localStream;
        }

        currentVideoId = videoSelect.value;
        currentAudioId = audioSelect.value;

        logger.info('Media stream started.');
        saveSettings();
        return true;
    } catch (err) {
        if (err.name === 'OverconstrainedError') {
            logger.error('Media Error: OverconstrainedError - Device or resolution not available.');
        } else if (err.name === 'NotAllowedError') {
            logger.error('Media Error: NotAllowedError - Access to camera/microphone denied.');
        } else {
            logger.error(`Media Error: ${err.message || err}`);
        }
        return false;
    }
}

async function switchMedia() {
    const newVideoId = videoSelect.value;
    const newAudioId = audioSelect.value;
    const videoChanged = newVideoId !== currentVideoId;
    const audioChanged = newAudioId !== currentAudioId;

    if (!videoChanged && !audioChanged) {
        logger.debug('No media device change detected.');
        return;
    }

    try {
        if (videoChanged || audioChanged) {
            if (localStream) localStream.getTracks().forEach(track => track.stop());
            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }
            await startMedia();
        }

        if (pc) {
            const senders = pc.getSenders();
            const videoTrack = localStream.getVideoTracks()[0];
            const audioTrack = localStream.getAudioTracks()[0];
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            const audioSender = senders.find(s => s.track && s.track.kind === 'audio');

            if (videoSender && videoTrack) {
                await videoSender.replaceTrack(videoTrack);
            }
            if (audioSender && audioTrack) {
                await audioSender.replaceTrack(audioTrack);
            }
            updateVideoEncodingParameters(!!document.fullscreenElement);
        }

        currentVideoId = newVideoId;
        currentAudioId = newAudioId;
        logger.info('Media devices switched.');
        saveSettings();
    } catch (err) {
        logger.error(`Error switching media devices: ${err}`);
    }
}

function adjustMicVolume() {
    if (gainNode) {
        gainNode.gain.value = parseFloat(micVolume.value);
        logger.debug(`Microphone volume set to ${micVolume.value}.`);
    }
}

function adjustRemoteVolume() {
    remoteVideo.volume = parseFloat(remoteVolume.value);
    logger.debug(`Remote volume set to ${remoteVolume.value}.`);
}

async function connectMidi() {
    if (!midiAccess) {
        logger.error('MIDI access not initialized. Retrying...');
        return;
    }
    try {
        const selectedMidiId = midiSelect.value;
        const inputs = Array.from(midiAccess.inputs.values());

        inputs.forEach(input => input.onmidimessage = null);

        if (selectedMidiId) {
            const selectedInput = inputs.find(input => input.id === selectedMidiId);
            if (selectedInput) {
                selectedInput.onmidimessage = (message) => {
                    const midiData = new Uint8Array(message.data);
                    pianos.getMIDIMessage(message, 'local');
                    if (midiChannel && midiChannel.readyState === 'open') {
                        if (midiChannel.bufferedAmount < MIDI_BUFFER_THRESHOLD) {
                            midiChannel.send(midiData.buffer);
                            logger.debug(`Local MIDI message sent: [${midiData}]`);
                        } else {
                            logger.debug(`MIDI message dropped due to high buffer: ${midiChannel.bufferedAmount} bytes.`);
                        }
                    } else {
                        logger.debug('MIDI data channel is not open.');
                    }
                };
                logger.info(`MIDI input connected: ${selectedInput.name}.`);
            } else {
                logger.error('Selected MIDI input device not available.');
            }
        } else {
            logger.info('No MIDI input selected. MIDI messages will not be processed.');
        }
        saveSettings();
    } catch (err) {
        logger.error(`MIDI connection error: ${err}`);
    }
}

async function updateVideoEncodingParameters(fullscreen = false) {
    if (!pc || pc.signalingState === 'closed') {
        return;
    }

    try {
        const videoSender = pc.getSenders().find(sender => sender.track && sender.track.kind === 'video');
        if (!videoSender) return;

        const parameters = videoSender.getParameters();
        if (!parameters.encodings || parameters.encodings.length === 0) {
            parameters.encodings = [{}];
        }

        const quality = fullscreen ? VIDEO_QUALITY.FULLSCREEN : VIDEO_QUALITY.DEFAULT;
        parameters.encodings[0].maxBitrate = quality.maxBitrate;
        await videoSender.setParameters(parameters);
        logger.info(`Video encoding updated to: ${fullscreen ? 'Fullscreen' : 'Standard'} (${(quality.maxBitrate / 1000000).toFixed(1)} Mbps)`);
    } catch (err) {
        logger.error(`Error updating video encoding parameters: ${err.message}`);
    }
}


async function startConnection() {
    if (pc) {
        pc.close();
        pc = null;
        logger.info('Previous RTCPeerConnection closed.');
    }
    if (ws) {
        ws.close();
        ws = null;
        logger.info('Previous WebSocket connection closed.');
    }

    if (!localStream) {
        const mediaReady = await startMedia();
        if (!mediaReady) {
            logger.error('Media setup failed. Aborting connection.');
            resetConnectionUI();
            return;
        }
    }

    const serverUrl = serverUrlInput.value.trim();
    if (!serverUrl) {
        logger.error('Server URL is missing. Please enter a valid URL.');
        resetConnectionUI();
        return;
    }

    const parsed = parseServerUrl(serverUrl);
    if (!parsed) {
        logger.error('Invalid server URL. Expected format: http://<ip>:<port> or https://<domain>');
        resetConnectionUI();
        return;
    }
    const { serverIp, serverPort } = parsed;

    startConnectionButton.disabled = true;
    startConnectionButton.style.backgroundColor = '#ccc';
    startConnectionButton.innerHTML = '<img src="assets/throbber.gif" alt="Waiting" class="throbber">';
    serverUrlInput.disabled = true;

    pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    let pendingIceCandidates = [];

    const trackPromises = localStream.getTracks().map(track => {
        logger.debug(`Adding track: ${track.kind}`);
        return pc.addTrack(track, localStream);
    });
    await Promise.all(trackPromises);
    logger.info('All local tracks added to peer connection.');

    const protocol = serverUrl.startsWith('https') ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${serverIp}:${serverPort}`);

    ws.onopen = async () => {
        logger.info('WebSocket connection opened.');
        if (wsPingInterval) clearInterval(wsPingInterval);
        wsPingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);

        try {
            logger.debug(`RTCPeerConnection state before createOffer: ${pc.signalingState}`);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            logger.debug(`LocalDescription set: ${pc.localDescription.type}`);
            ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription.sdp }));
            logger.info('Offer sent.');
        } catch (err) {
            logger.error(`Error creating offer: ${err}`);
            resetConnectionUI();
        }
    };
    ws.onerror = (err) => {
        logger.error(`WebSocket error: ${err.message || 'Unknown error'}`);
    };
    ws.onclose = (event) => {
        logger.info(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason || 'No reason given'}. Was clean: ${event.wasClean}.`);
        if (pc && pc.connectionState !== 'closed') {
           disconnect();
        }
    };
    ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ping' || msg.type === 'pong') return;

        if (msg.sdp) {
             logger.debug(`Received WebSocket message: {type: "${msg.type}"}`);
        } else {
             logger.debug(`Received WebSocket message: ${JSON.stringify(msg)}`);
        }

        if (msg.type === 'error') {
            logger.error(`Server error: ${msg.message}`);
            disconnect();
            return;
        }
        if (msg.type === 'disconnected-by-peer' || msg.type === 'peer-disconnected') {
            logger.info('Connection closed by peer.');
            disconnect();
            return;
        }
        if (msg.type === 'new-stream') {
            logger.info(`Peer is sharing a new stream: ${msg.streamName} (${msg.streamId})`);
            pendingStreams.set(msg.streamId, { name: msg.streamName });
            return;
        }
        if (msg.type === 'stop-stream') {
            logger.info(`Peer stopped sharing stream: ${msg.streamId}`);
            stopScreenShare(msg.streamId, false);
            return;
        }
        if (msg.type === 'offer') {
            try {
                logger.debug(`RTCPeerConnection state before setRemoteDescription (offer): ${pc.signalingState}`);
                await pc.setRemoteDescription(new RTCSessionDescription(msg));
                logger.debug('RemoteDescription (offer) set.');
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                logger.debug(`LocalDescription (answer) set: ${pc.localDescription.type}`);
                ws.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription.sdp }));
                logger.info('Answer sent.');
                while (pendingIceCandidates.length > 0) {
                    const candidate = pendingIceCandidates.shift();
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    logger.debug('Queued ICE candidate added.');
                }
            } catch (err) {
                logger.error(`Error processing offer: ${err}`);
            }
        } else if (msg.type === 'answer') {
            try {
                logger.debug(`RTCPeerConnection state before setRemoteDescription (answer): ${pc.signalingState}`);
                await pc.setRemoteDescription(new RTCSessionDescription(msg));
                logger.debug('RemoteDescription (answer) set.');
                while (pendingIceCandidates.length > 0) {
                    const candidate = pendingIceCandidates.shift();
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    logger.debug('Queued ICE candidate added.');
                }
            } catch (err)
{
                logger.error(`Error processing answer: ${err}`);
            }
        } else if (msg.type === 'candidate') {
            if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
                logger.debug('ICE candidate received and added.');
            } else {
                pendingIceCandidates.push(msg.candidate);
                logger.debug('ICE candidate queued, awaiting remoteDescription.');
            }
        }
    };

    pc.onnegotiationneeded = async () => {
        try {
            if (pc.signalingState !== 'stable') {
                logger.debug('Skipping negotiation, signaling state is not stable.');
                return;
            }
            logger.info('Negotiation needed, creating offer...');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription.sdp }));
                logger.info('Re-negotiation offer sent.');
            }
        } catch (err) {
            logger.error(`Error during negotiation: ${err}`);
        }
    };


    pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
            logger.debug('ICE candidate sent.');
        }
    };
    pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) {
            logger.debug('Ontrack event received without a stream.');
            return;
        }

        const streamId = stream.id;
        const streamInfo = pendingStreams.get(streamId);

        if (streamInfo) {
            logger.info(`Received remote screen share stream: ${streamInfo.name}`);
            const remoteWindow = new FloatingWindow({
                container: additionalStreamsContainer,
                stream: stream,
                title: `Peer: ${streamInfo.name}`,
                isClosable: true,
                id: streamId
            });
            remoteWindow.wrapper.addEventListener('close', (e) => {
                 stopScreenShare(e.detail.id, false);
            });
            activeScreenShares.set(streamId, { window: remoteWindow, stream: stream });
            pendingStreams.delete(streamId);
        } else if (remoteVideo.srcObject?.id !== streamId) {
            logger.info('Remote main stream received. Attaching to remoteVideo element.');
            remoteVideo.srcObject = stream;
            remoteVideo.play().catch(err => logger.error(`Error playing remote video stream: ${err}`));
        }
    };

    pc.oniceconnectionstatechange = () => {
        logger.info(`ICE connection state change: ${pc.iceConnectionState}`);
        if (iceReconnectTimer) {
            clearTimeout(iceReconnectTimer);
            iceReconnectTimer = null;
        }

        switch (pc.iceConnectionState) {
            case 'connected':
            case 'completed':
                connectMidi();
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
                logger.info('Connection lost. Attempting to reconnect for 5 seconds...');
                iceReconnectTimer = setTimeout(() => {
                    if (pc && (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed')) {
                        logger.error('Reconnect failed. Closing connection.');
                        disconnect();
                    }
                }, 5000);
                break;
            case 'failed':
            case 'closed':
                logger.error('Connection failed or closed. Resetting.');
                disconnect();
                break;
        }
    };

    midiChannel = pc.createDataChannel('midiChannel', { ordered: false, maxRetransmits: 0 });
    setupMidiChannel(midiChannel);
    fileChannel = pc.createDataChannel('fileChannel', { ordered: true });
    setupFileChannel(fileChannel);
    chatChannel = pc.createDataChannel('chatChannel', { ordered: true });
    setupChatChannel(chatChannel);
    metronomeChannel = pc.createDataChannel('metronomeChannel', { ordered: true });
    setupMetronomeChannel(metronomeChannel);

    pc.ondatachannel = (event) => {
        if (event.channel.label === 'midiChannel') {
            midiChannel = event.channel;
            setupMidiChannel(midiChannel);
        } else if (event.channel.label === 'fileChannel') {
            fileChannel = event.channel;
            setupFileChannel(fileChannel);
        } else if (event.channel.label === 'chatChannel') {
            chatChannel = event.channel;
            setupChatChannel(chatChannel);
        } else if (event.channel.label === 'metronomeChannel') {
            metronomeChannel = event.channel;
            setupMetronomeChannel(metronomeChannel);
        }
    };

    saveSettings();
}

function disconnect() {
    if (wsPingInterval) {
        clearInterval(wsPingInterval);
        wsPingInterval = null;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'disconnect' }));
        logger.info('Disconnect message sent.');
    }
    for (const streamId of activeScreenShares.keys()) {
        stopScreenShare(streamId, true);
    }
    if (pc) {
        pc.close();
        pc = null;
        logger.info('WebRTC connection closed.');
    }
    if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
        logger.info('WebSocket connection closed.');
    }
    remoteVideo.srcObject = null;
    remoteVideo.load();
    logger.debug('remoteVideo element reset and loaded');
    if (audioContext) {
        audioContext.close();
        audioContext = null;
        gainNode = null;
        logger.debug('AudioContext closed.');
    }
    if (midiAccess) {
        const inputs = Array.from(midiAccess.inputs.values());
        inputs.forEach(input => input.onmidimessage = null);
        logger.debug('MIDI message handlers cleared.');
    }
    midiChannel = null;
    fileChannel = null;
    chatChannel = null;
    metronomeChannel = null;
    fileSharing.disable();
    chat.disable();
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
    if (metronome) {
        metronome.pause();
    }
}

function setupMidiChannel(channel) {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => logger.info('MIDI data channel opened.');
    channel.onmessage = (event) => {
        const midiData = new Uint8Array(event.data);
        logger.debug(`Remote MIDI message received: [${midiData}]`);
        pianos.getMIDIMessage({ data: midiData }, 'remote');
        if (midiAccess && midiOutputSelect.value) {
            const selectedOutputId = midiOutputSelect.value;
            const outputs = Array.from(midiAccess.outputs.values());
            const selectedOutput = outputs.find(output => output.id === selectedOutputId);
            if (selectedOutput) {
                selectedOutput.send(midiData);
                logger.debug(`Forwarded MIDI message to output: ${selectedOutput.name}.`);
            }
        }
    };
    channel.onerror = (err) => logger.error(`MIDI data channel error: ${err.message || err}`);
    channel.onclose = () => logger.info('MIDI data channel closed.');
}

function setupChatChannel(channel) {
    const handleOpen = () => {
        logger.info('Chat data channel opened.');
        chat.enable();
    };

    channel.onmessage = (event) => {
        chat.handleRemoteMessage(event.data);
    };
    channel.onerror = (err) => logger.error(`Chat data channel error: ${err.message || err}`);
    channel.onclose = () => {
        logger.info('Chat data channel closed.');
        chat.disable();
    };

    if (channel.readyState === 'open') {
        handleOpen();
    } else {
        channel.onopen = handleOpen;
    }
}

function setupMetronomeChannel(channel) {
    channel.onopen = () => {
        logger.info('Metronome data channel opened.');
        if(isMetronomeVisible) {
             sendMetronomeState();
        }
    };
    channel.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'metronome_sync') {
            logger.debug(`Metronome sync received: ${JSON.stringify(msg.data)}`);
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
    };
    channel.onerror = (err) => logger.error(`Metronome data channel error: ${err.message || err}`);
    channel.onclose = () => {
         logger.info('Metronome data channel closed.');
        toggleMetronomeButton.disabled = true;
        metronomeContainer.classList.remove('visible', 'master', 'slave');
        toggleMetronomeButton.classList.remove('active');
        isMetronomeVisible = false;
        if(metronome) metronome.pause();
    };
}

function setupFileChannel(channel) {
    channel.binaryType = 'arraybuffer';

    const handleOpen = () => {
        logger.info('File data channel opened.');
        fileSharing.setChannel(channel);
        fileSharing.enable();
    };

    channel.onmessage = (event) => {
        fileSharing.handleRemoteData(event.data);
    };
    channel.onerror = (err) => {
        logger.error(`File data channel error: ${err.message || err}`);
        fileSharing.disable();
    };
    channel.onclose = () => {
        logger.info('File data channel closed.');
        fileSharing.disable();
        fileSharing.setChannel(null);
    };

    if (channel.readyState === 'open') {
        handleOpen();
    } else {
        channel.onopen = handleOpen;
    }
}

function sendChatMessage() {
    const message = messageInput.value.trim();
    if (message && chatChannel && chatChannel.readyState === 'open') {
        chatChannel.send(message);
        addChatMessage(`You: ${message}`);
        messageInput.value = '';
    } else {
        logger.debug('Chat message not sent: channel not open or message is empty.');
    }
}

function sendMetronomeState(isClaimingMaster = false) {
    if (metronomeChannel && metronomeChannel.readyState === 'open') {
        const state = metronome.getState();
        const payload = {
            type: 'metronome_sync',
            data: {
                ...state,
                visible: isMetronomeVisible
            },
            isMasterClaim: isClaimingMaster
        };
        metronomeChannel.send(JSON.stringify(payload));
        logger.debug(`Metronome state sent (Master Claim: ${isClaimingMaster}): ${JSON.stringify(payload.data)}`);
    }
}

function sendMetronomeTick(tickData) {
    if (metronomeChannel && metronomeChannel.readyState === 'open' && metronome.isMaster) {
        const payload = {
            type: 'metronome_tick',
            data: tickData
        };
        metronomeChannel.send(JSON.stringify(payload));
    }
}

async function startScreenShare() {
    if (!pc) {
        logger.error('Cannot start screen share: no active connection.');
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const track = stream.getVideoTracks()[0];
        const streamId = stream.id;

        logger.debug(`[Debug] Screen share track label from browser: "${track.label}"`);

        let streamName = track.label;
        const genericLabels = ["internal camera", "bildschirm", "screen"];

        if (!streamName || streamName.trim() === "" || genericLabels.includes(streamName.toLowerCase())) {
            streamName = "Shared Content";
            logger.debug(`Using fallback title for stream: "${streamName}"`);
        }

        const sender = pc.addTrack(track, stream);
        if (!sender) {
            throw new Error('Failed to add screen share track to peer connection.');
        }

        ws.send(JSON.stringify({ type: 'new-stream', streamId, streamName }));
        logger.info(`Started sharing: ${streamName}`);

        const localWindow = new FloatingWindow({
            container: additionalStreamsContainer,
            stream: stream,
            title: `You share: ${streamName}`,
            isClosable: true,
            id: streamId
        });

        activeScreenShares.set(streamId, { window: localWindow, sender });

        track.onended = () => {
            logger.info(`Sharing for ${streamName} ended by user.`);
            stopScreenShare(streamId, true);
        };

        localWindow.wrapper.addEventListener('close', () => {
            track.stop();
        });

    } catch (err) {
        logger.error(`Error starting screen share: ${err.message}`);
    }
}

function stopScreenShare(streamId, isInitiator) {
    const share = activeScreenShares.get(streamId);
    if (!share) return;

    if (isInitiator) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'stop-stream', streamId }));
        }
        if (pc && share.sender) {
            pc.removeTrack(share.sender);
        }
    }

    share.window.destroy();
    activeScreenShares.delete(streamId);
    logger.info(`Stopped sharing stream ${streamId}`);
}


function setEventListeners() {
    navigator.mediaDevices.ondevicechange = () => {
        logger.info('A media device change was detected. Refreshing device lists.');
        populateDeviceOptions();
    };

    document.querySelector('#midiSelect').addEventListener('change', () => connectMidi());
    document.querySelector('#midiOutputSelect').addEventListener('change', () => saveSettings());

    document.querySelector('#videoSelect').addEventListener('change', () => switchMedia());
    document.querySelector('#audioSelect').addEventListener('change', () => switchMedia());

    [micVolume, remoteVolume].forEach(slider => {
        let originalTooltip = '';

        const updateTooltip = (el) => {
            const percentage = Math.round(parseFloat(el.value) * 100);
            el.dataset.tooltip = `${percentage}%`;
            const min = parseFloat(el.min) || 0;
            const max = parseFloat(el.max) || 1;
            const val = parseFloat(el.value);
            const sliderWidth = el.offsetWidth;
            const thumbWidth = 18;
            const percent = (val - min) / (max - min);
            const thumbPosition = percent * (sliderWidth - thumbWidth) + (thumbWidth / 2);
            el.style.setProperty('--tooltip-left', `${thumbPosition}px`);
        };

        slider.addEventListener('mousedown', (e) => {
            const targetSlider = e.target;
            originalTooltip = targetSlider.dataset.tooltip || '';
            targetSlider.classList.add('is-active-tooltip');
            updateTooltip(targetSlider);
        });

        slider.addEventListener('input', (e) => {
            const targetSlider = e.target;
            updateTooltip(targetSlider);

            if (targetSlider.id === 'micVolume') {
                adjustMicVolume();
                lastMicVolume = targetSlider.value;
                micVolumeIcon.classList.toggle('muted', parseFloat(targetSlider.value) === 0);
            } else {
                adjustRemoteVolume();
                lastRemoteVolume = targetSlider.value;
                remoteVolumeIcon.classList.toggle('muted', parseFloat(targetSlider.value) === 0);
            }
            targetSlider.style.setProperty('--p', `${targetSlider.value * 100}%`);
        });

        const endDrag = (e) => {
            if (slider.classList.contains('is-active-tooltip')) {
                slider.classList.remove('is-active-tooltip');
                slider.dataset.tooltip = originalTooltip;
                 slider.style.removeProperty('--tooltip-left');
                saveSettings();
            }
        };

        window.addEventListener('mouseup', endDrag);
        window.addEventListener('touchend', endDrag);
    });

    // Mute Buttons Logic
    micVolumeIcon.addEventListener('click', () => {
        if (parseFloat(micVolume.value) > 0) {
            lastMicVolume = micVolume.value;
            micVolume.value = 0;
        } else {
            micVolume.value = lastMicVolume;
        }
        adjustMicVolume();
        micVolume.dispatchEvent(new Event('input', { bubbles:true }));
    });

    remoteVolumeIcon.addEventListener('click', () => {
        if (parseFloat(remoteVolume.value) > 0) {
            lastRemoteVolume = remoteVolume.value;
            remoteVolume.value = 0;
        } else {
            remoteVolume.value = lastRemoteVolume;
        }
        adjustRemoteVolume();
        remoteVolume.dispatchEvent(new Event('input', { bubbles:true }));
    });

    startConnectionButton.addEventListener('click', () => {
        if (startConnectionButton.innerHTML.includes('Disconnect')) {
            disconnect();
        } else {
            startConnection();
        }
    });

    shareScreenButton.addEventListener('click', startScreenShare);

    toggleMetronomeButton.addEventListener('click', () => {
        isMetronomeVisible = !isMetronomeVisible;
        metronomeContainer.classList.toggle('visible', isMetronomeVisible);
        toggleMetronomeButton.classList.toggle('active', isMetronomeVisible);
        if (isMetronomeVisible && !metronome.isMaster) {
            metronome.claimMastership();
        } else {
            metronome.pause();

            sendMetronomeState();
        }
    });

    metronomeContainer.addEventListener('dblclick', () => {
        logger.info("Attempting to claim metronome mastership...");
        metronome.claimMastership();
    });

    function toggleFullscreen(element) {
        const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
        if (!fullscreenElement) {
            if (element.requestFullscreen) {
                element.requestFullscreen();
            } else if (element.webkitRequestFullscreen) { /* Safari */
                element.webkitRequestFullscreen();
            } else if (element.mozRequestFullScreen) { /* Firefox */
                element.mozRequestFullScreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { /* Safari */
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) { /* Firefox */
                document.mozCancelFullScreen();
            }
        }
    }

    remoteVideo.addEventListener('dblclick', () => toggleFullscreen(remoteVideo));

    function onFullscreenChange() {
        const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
        updateVideoEncodingParameters(!!fullscreenElement);
    }

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
}

function sendMidiMessage(midiData) {
    if (midiChannel && midiChannel.readyState === 'open') {
        if (midiChannel.bufferedAmount < MIDI_BUFFER_THRESHOLD) {
            midiChannel.send(midiData.buffer);
            logger.debug(`MIDI message from piano sent: [${midiData}]`);
        } else {
            logger.debug(`MIDI message from piano dropped due to high buffer: ${midiChannel.bufferedAmount} bytes.`);
        }
    } else {
        logger.debug('Cannot send MIDI message: data channel is not open.');
    }
}

async function init() {
    new Sidebar();

    await populateDeviceOptions();
    await populateMidiOptions();

    const mediaReady = await startMedia();
    if (!mediaReady) {
        logger.error('Media setup failed. Please check camera/microphone permissions and availability.');
    }

    lastMicVolume = micVolume.value;
    lastRemoteVolume = remoteVolume.value;
    micVolumeIcon.classList.toggle('muted', parseFloat(micVolume.value) === 0);
    remoteVolumeIcon.classList.toggle('muted', parseFloat(remoteVolume.value) === 0);

    micVolume.style.setProperty('--p', `${micVolume.value * 100}%`);
    remoteVolume.style.setProperty('--p', `${remoteVolume.value * 100}%`);

    adjustMicVolume();
    setEventListeners();

    fileSharing = new FileSharing({
        container: '#filesharing-container',
        logger: logger, // Logger-Instanz übergeben
        onSendData: (data) => {
            if (fileChannel && fileChannel.readyState === 'open') {
                fileChannel.send(data);
            } else {
                logger.error('File data could not be sent: Data channel is not open.');
            }
        }
    });

    chat = new Chat({
        container: document.getElementById('chat-container'),
        onSendMessage: (message) => {
            if (chatChannel && chatChannel.readyState === 'open') {
                chatChannel.send(message);
            } else {
                logger.error('Chat message could not be sent: Data channel is not open.');
            }
        }
    });

    pianos.createPiano({
        'selector': '#piano',
        'enableMidi': true,
        'playMidiNotes': false,
        'keyPressedLocalRGB': [0, 255, 0],
        'keyPressedRemoteRGB': [255, 0, 0],
        'pedalSoft': true,
        'pedalSostenuto': true,
        'pedalSustain': true,
        'undampedStrings': ['G6', 'C8'],
        'sendMidiMessage': sendMidiMessage,
        'logger': logger // Logger-Instanz übergeben
    });

    metronome = new Metronome({
        audioContext: audioContext,
        onStateChange: (state, isClaimingMaster) => {
            sendMetronomeState(isClaimingMaster);
        },
        onTick: (tickData) => {
            sendMetronomeTick(tickData);
        }
    });
    metronome.insertInto(metronomeContainer);

    new CamLocalDrag();
    new MetronomeDrag();
    loadSettings();
}

init();
