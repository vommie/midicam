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

const logger = new Log({ toggleButtonSelector: '#toggleLogButton' });

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

let pc;
let midiChannel;
let fileChannel;
let chatChannel;
let metronomeChannel;
let commonDataChannel;
let localStream;
let audioContext;
let gainNode = null;
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
let isSelfMuted = false;

const pianos = new Pianos();
let metronome;
let chat;
let notifier;
let fileSharing;
let camLocalDrag;
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

        videoSelect.innerHTML = '<option value="">No camera</option>' + videoDevices.map((device, index) =>
            `<option value="${device.deviceId}">${createFallbackName('Camera', index, device)}</option>`
        ).join('');

        audioSelect.innerHTML = '<option value="">No microphone</option>' + audioDevices.map((device, index) =>
            `<option value="${device.deviceId}">${createFallbackName('Microphone', index, device)}</option>`
        ).join('');

        const settings = loadSettings();
        if (settings && settings.videoDeviceId && videoDevices.some(d => d.deviceId === settings.videoDeviceId)) {
            videoSelect.value = settings.videoDeviceId;
        } else {
            videoSelect.value = videoDevices[0]?.deviceId || '';
        }
        if (settings && settings.audioDeviceId && audioDevices.some(d => d.audioDeviceId === settings.audioDeviceId)) {
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
    logger.debug("--- startMedia called ---");
    try {
        if (localStream) {
            logger.debug(`Stopping all tracks from old localStream (ID: ${localStream.id})`);
            localStream.getTracks().forEach(track => {
                logger.debug(`Stopping track ID: ${track.id}, kind: ${track.kind}, state: ${track.readyState}`);
                track.stop();
            });
        }

        const videoId = videoSelect.value;
        const audioId = audioSelect.value;

        const constraints = {
            video: videoId ? { deviceId: { exact: videoId }, width: { ideal: 1920 }, height: { ideal: 1080 } } : false,
            audio: audioId ? { deviceId: { exact: audioId } } : false
        };

        let rawStream;
        if (!constraints.video && !constraints.audio) {
            logger.debug("No video or audio device selected. Creating an empty stream.");
            rawStream = new MediaStream();
        } else {
            logger.debug(`Requesting new media with constraints: ${JSON.stringify(constraints)}`);
            rawStream = await navigator.mediaDevices.getUserMedia(constraints);
            logger.debug(`Got new raw stream from getUserMedia. ID: ${rawStream.id}, Tracks: ${rawStream.getTracks().length}`);
        }

        camLocalDrag.floatingWindow.setPlaceholderActive(!rawStream.getVideoTracks().length > 0);

        const videoTracks = rawStream.getVideoTracks();
        let processedAudioTrack = null;

        if (rawStream.getAudioTracks().length > 0) {
            logger.debug("Audio track detected. Creating a fresh audio processing graph.");
            if (!audioContext) {
                 logger.error("AudioContext is not available. Cannot process microphone.");
                 return false;
            }

            const source = audioContext.createMediaStreamSource(rawStream);
            gainNode = audioContext.createGain();
            const destination = audioContext.createMediaStreamDestination();

            source.connect(gainNode);
            gainNode.connect(destination);
            logger.debug("New audio graph created: Source -> Gain -> Destination.");

            gainNode.gain.value = parseFloat(micVolume.value);
            logger.debug(`Set gain on new gainNode to: ${micVolume.value}`);

            processedAudioTrack = destination.stream.getAudioTracks()[0];
            logger.debug(`Using processed audio track from NEW destination. Track ID: ${processedAudioTrack.id}, State: ${processedAudioTrack.readyState}`);
        } else {
            logger.debug("No audio track in the new raw stream. Clearing gainNode.");
            gainNode = null;

            if (!isSelfMuted) {
                sendSelfMuteStatus(true);
                camLocalDrag.floatingWindow.setMuteIndicatorActive(true);
            }

        }

        const allTracks = [...videoTracks];
        if (processedAudioTrack) {
            allTracks.push(processedAudioTrack);
        }
        localStream = new MediaStream(allTracks);
        logger.debug(`Created final localStream ID: ${localStream.id} with ${localStream.getTracks().length} tracks.`);

        camLocalDrag.floatingWindow.video.srcObject = localStream;

        currentVideoId = videoSelect.value;
        currentAudioId = audioSelect.value;

        logger.info('Media stream (re)started successfully.');
        saveSettings();
        return true;
    } catch (err) {
        if (err.name === 'OverconstrainedError') {
            logger.error('Media Error: OverconstrainedError - Device or resolution not available.');
        } else if (err.name === 'NotAllowedError') {
            logger.error('Media Error: NotAllowedError - Access to camera/microphone denied.');
        } else {
            logger.error(`Media Error: ${err.message || err}`);
            logger.debug(`Full error object: ${JSON.stringify(err)}`);
        }
        return false;
    }
}

async function switchMedia() {
    logger.debug("--- switchMedia called ---");
    const newVideoId = videoSelect.value;
    const newAudioId = audioSelect.value;

    if (newVideoId === currentVideoId && newAudioId === currentAudioId) {
        logger.debug('No media device change detected. Aborting switch.');
        return;
    }
    logger.info(`Switching media. Video: ${currentVideoId}->${newVideoId}, Audio: ${currentAudioId}->${newAudioId}`);

    try {
        const constraints = {
            video: newVideoId ? { deviceId: { exact: newVideoId }, width: { ideal: 1920 }, height: { ideal: 1080 } } : false,
            audio: newAudioId ? { deviceId: { exact: newAudioId } } : false
        };

        let newRawStream;
        if (!constraints.video && !constraints.audio) {
            newRawStream = new MediaStream();
        } else {
            newRawStream = await navigator.mediaDevices.getUserMedia(constraints);
        }
        logger.debug(`Got new raw stream for switching. ID: ${newRawStream.id}`);

        const oldTracks = localStream ? localStream.getTracks() : [];

        const newVideoTrack = newRawStream.getVideoTracks()[0] || null;
        let newProcessedAudioTrack = null;

        if (newRawStream.getAudioTracks().length > 0) {
            logger.debug("New audio track detected. Creating a fresh audio processing graph.");
            const source = audioContext.createMediaStreamSource(newRawStream);
            gainNode = audioContext.createGain();
            const destination = audioContext.createMediaStreamDestination();
            source.connect(gainNode);
            gainNode.connect(destination);
            gainNode.gain.value = parseFloat(micVolume.value);
            newProcessedAudioTrack = destination.stream.getAudioTracks()[0];
            logger.debug(`Using new processed audio track. ID: ${newProcessedAudioTrack?.id}, State: ${newProcessedAudioTrack?.readyState}`);
        } else {
            logger.debug("No audio track in the new stream. Clearing gainNode.");
            gainNode = null;
            if (!isSelfMuted) {
                sendSelfMuteStatus(true);
                camLocalDrag.floatingWindow.setMuteIndicatorActive(true);
            }
        }

        if (pc) {
            logger.debug("RTCPeerConnection exists. Updating tracks...");
            const videoSender = pc.getSenders().find(s => s.kind === 'video');
            if (videoSender) {
                logger.debug(`Found video sender. Replacing track (Old: ${videoSender.track?.id}, New: ${newVideoTrack?.id})`);
                await videoSender.replaceTrack(newVideoTrack);
            } else if (newVideoTrack) {
                logger.debug("No video sender found. Adding new video track.");
                pc.addTrack(newVideoTrack, localStream);
            }

            const audioSender = pc.getSenders().find(s => s.kind === 'audio');
            if (audioSender) {
                logger.debug(`Found audio sender. Replacing track (Old: ${audioSender.track?.id}, New: ${newProcessedAudioTrack?.id})`);
                await audioSender.replaceTrack(newProcessedAudioTrack);
            } else if (newProcessedAudioTrack) {
                logger.debug("No audio sender found, but we have a new live audio track. Adding it via addTrack().");
                pc.addTrack(newProcessedAudioTrack, localStream);
            }
            logger.info(`Audio track update complete. New track is ${newProcessedAudioTrack ? 'active' : 'inactive'}.`);
        } else {
            logger.debug("No active RTCPeerConnection, no need to replace tracks.");
        }

        logger.debug(`Stopping ${oldTracks.length} old tracks.`);
        oldTracks.forEach(track => {
            logger.debug(`Stopping old track ID: ${track.id}, kind: ${track.kind}, state: ${track.readyState}`);
            track.stop();
        });

        const finalTracks = [newVideoTrack, newProcessedAudioTrack].filter(Boolean);
        localStream = new MediaStream(finalTracks);
        logger.debug(`Created final localStream ID: ${localStream.id} with ${localStream.getTracks().length} tracks.`);

        camLocalDrag.floatingWindow.video.srcObject = localStream;
        camLocalDrag.floatingWindow.setPlaceholderActive(!newVideoTrack);

        currentVideoId = newVideoId;
        currentAudioId = newAudioId;

        logger.info('Media devices switched successfully.');
        saveSettings();

    } catch (err) {
        logger.error(`Error switching media devices: ${err.message}`);
        logger.debug(`Full error object during switchMedia: ${JSON.stringify(err)}`);
        videoSelect.value = currentVideoId;
        audioSelect.value = currentAudioId;
    }
}

function adjustMicVolume() {
    if (gainNode && audioContext) {
        const newVolume = parseFloat(micVolume.value);
        gainNode.gain.setValueAtTime(newVolume, audioContext.currentTime);
        logger.debug(`Microphone volume set to ${newVolume}.`);
    } else {
        logger.debug("adjustMicVolume called, but gainNode is not available.");
    }
}

function adjustRemoteVolume() {
    const lastVolume = remoteVideo.volume;
    const newVolume = parseFloat(remoteVolume.value);
    remoteVideo.volume = newVolume;
    logger.debug(`Remote volume set to ${remoteVolume.value}.`);

    const wasMuted = lastVolume === 0;
    const isMuted = newVolume === 0;

    if (wasMuted !== isMuted) {
        sendMuteStatusUpdate(isMuted);
    }
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

                    const pianoInstance = pianos.pianos[0];
                    if (pianoInstance && pianoInstance.opts.sendMidi) {
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
        if (!videoSender || !videoSender.track) return;

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

    localStream.getTracks().forEach(track => {
        logger.debug(`Adding track to PeerConnection: ${track.kind}, ID: ${track.id}`);
        pc.addTrack(track, localStream);
    });
    logger.info('All local tracks added to peer connection.');

    const protocol = serverUrl.startsWith('https') ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${serverIp}:${serverPort}`);

    ws.onopen = () => {
        logger.info('WebSocket connection opened. Waiting for peer...');
        if (wsPingInterval) clearInterval(wsPingInterval);
        wsPingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
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

        switch(msg.type) {
            case 'peer-ready':
                logger.info("Peer is ready. I am the caller, starting negotiation.");
                await negotiate();
                break;

            case 'wait-for-offer':
                logger.info("I am the callee. Waiting for an offer from the peer.");
                break;

            case 'offer':
                if (pc.signalingState !== 'stable') {
                    logger.warn(`Glare detected during offer handling, but this shouldn't happen in a controlled setup. State: ${pc.signalingState}`);
                    return;
                }
                try {
                    logger.debug(`Received offer, setting remote description.`);
                    await pc.setRemoteDescription(new RTCSessionDescription(msg));

                    logger.debug(`Creating answer.`);
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    ws.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription.sdp }));
                    logger.info('Answer sent.');
                } catch (err) {
                    logger.error(`Error processing offer: ${err}`);
                }
                break;

            case 'answer':
                if (pc.signalingState !== 'have-local-offer') {
                    logger.debug(`Ignoring redundant answer, not in 'have-local-offer' state. Current state: ${pc.signalingState}`);
                    return;
                }
                try {
                    logger.debug(`Received answer, setting remote description.`);
                    await pc.setRemoteDescription(new RTCSessionDescription(msg));
                } catch (err) {
                    logger.error(`Error processing answer: ${err}`);
                }
                break;

            case 'candidate':
                try {
                    if (pc.remoteDescription) {
                        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
                        logger.debug('ICE candidate received and added.');
                    } else {
                        pendingIceCandidates.push(msg.candidate);
                        logger.debug('ICE candidate queued, awaiting remoteDescription.');
                    }
                } catch(err) {
                    if (!`${err}`.includes("The ICE candidate could not be added")) {
                       logger.error(`Error adding ICE candidate: ${err}`);
                    }
                }
                break;

            case 'error':
                logger.error(`Server error: ${msg.message}`);
                disconnect();
                break;
            case 'disconnected-by-peer':
            case 'peer-disconnected':
                logger.info('Connection closed by peer.');
                disconnect();
                break;
            case 'new-stream':
                logger.info(`Peer is sharing a new stream: ${msg.streamName} (${msg.streamId})`);
                pendingStreams.set(msg.streamId, { name: msg.streamName });
                break;
            case 'stop-stream':
                logger.info(`Peer stopped sharing stream: ${msg.streamId}`);
                stopScreenShare(msg.streamId, false);
                break;
        }
    };

    const negotiate = async () => {
        try {
            logger.info('Creating offer...');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription.sdp }));
                logger.info('Offer sent.');
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
        } else {
            if (remoteVideo.srcObject !== stream) {
                 logger.info('Remote main stream received. Attaching to remoteVideo element.');
                 remoteVideo.srcObject = stream;
                 remoteVideo.play().catch(err => logger.error(`Error playing remote video stream: ${err}`));
            }

            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.onmute = () => {
                    logger.info("Remote audio track was muted by the peer.");
                    peerSelfMutedIndicator.classList.add('active');
                };
                audioTrack.onunmute = () => {
                    logger.info("Remote audio track was unmuted by the peer.");
                    peerSelfMutedIndicator.classList.remove('active');
                };
                peerSelfMutedIndicator.classList.toggle('active', audioTrack.muted);
            }

            if (stream.getVideoTracks().length > 0) {
                remotePlaceholder.classList.remove('active');
            } else {
                remotePlaceholder.classList.add('active');
            }

            stream.onremovetrack = (e) => {
                logger.info(`A remote track has been removed: ${e.track.kind}`);
                if (e.track.kind === 'video' && stream.getVideoTracks().length === 0) {
                    remotePlaceholder.classList.add('active');
                }
                 if (e.track.kind === 'audio') {
                    peerSelfMutedIndicator.classList.remove('active');
                }
            };
             stream.onaddtrack = (e) => {
                logger.info(`A remote track has been added: ${e.track.kind}`);
                if (e.track.kind === 'video' && stream.getVideoTracks().length > 0) {
                    remotePlaceholder.classList.remove('active');
                }
            };
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
                pc.onnegotiationneeded = negotiate;

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
    commonDataChannel = pc.createDataChannel('commonDataChannel', { ordered: true });
    setupCommonDataChannel(commonDataChannel)

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
        } else if (event.channel.label === 'commonDataChannel') {
            commonDataChannel = event.channel;
            setupCommonDataChannel(commonDataChannel);
        }
    };

    saveSettings();
}

function disconnect(isIntentional = false) {
    logger.debug(`--- disconnect called (isIntentional: ${isIntentional}) ---`);

    if (!isIntentional && notifier) {
        notifier.show({
            position: 'nw',
            icon: 'error',
            title: 'Connection Lost',
            text: 'The connection was unexpectedly interrupted. Please try to reconnect.',
            duration: 15000,
            showProgress: true,
            sound: true
        });
    }

    if (wsPingInterval) {
        clearInterval(wsPingInterval);
        wsPingInterval = null;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        if (isIntentional) {
            ws.send(JSON.stringify({ type: 'disconnect' }));
            logger.info('Disconnect message sent.');
        }
    }
    for (const streamId of activeScreenShares.keys()) {
        stopScreenShare(streamId, true);
    }
    if (pc) {
        pc.onnegotiationneeded = null;
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
    remotePlaceholder.classList.add('active');
    remoteMuteIndicator.classList.remove('active');
    peerSelfMutedIndicator.classList.remove('active');
    camLocalDrag.floatingWindow.setPeerMutedMeIndicatorActive(false);

    if (pianos.pianos[0]) {
        pianos.pianos[0].resetPeerMidiStatus();
    }

    logger.debug('remoteVideo element reset and loaded');
    gainNode = null;

    if (midiAccess) {
        const inputs = Array.from(midiAccess.inputs.values());
        inputs.forEach(input => input.onmidimessage = null);
        logger.debug('MIDI message handlers cleared.');
    }
    midiChannel = null;
    fileChannel = null;
    chatChannel = null;
    metronomeChannel = null;
    commonDataChannel = null;
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
        const pianoInstance = pianos.pianos[0];
        if (pianoInstance && pianoInstance.opts.receiveMidi) {
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

function setupCommonDataChannel(channel) {
    channel.onopen = () => {
        logger.info('Common data channel opened.');
        if(gainNode) sendSelfMuteStatus(isSelfMuted);
        else sendSelfMuteStatus(true);
        sendMidiSettingsStatus();
    };
    channel.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
            case 'self_mute_status':
                logger.info(`Peer has ${msg.muted ? 'muted' : 'unmuted'} their microphone.`);
                peerSelfMutedIndicator.classList.toggle('active', msg.muted);
                break;
            case 'midi_settings_status':
                const peerSettings = msg.settings;
                logger.info(`Peer MIDI settings received: Send=${peerSettings.send}, Receive=${peerSettings.receive}`);
                if (pianos.pianos[0]) {
                    pianos.pianos[0].updatePeerMidiStatus({
                        canReceive: peerSettings.receive,
                        isSending: peerSettings.send,
                    });
                }
                break;
        }
    };
    channel.onerror = (err) => logger.error(`Common data channel error: ${err.message || err}`);
    channel.onclose = () => {
        logger.info('Common data channel closed.');
    };
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
        switch (msg.type) {
            case 'metronome_sync':
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
                break;

            case 'metronome_tick':
                metronome.handleMasterTick(msg.data);
                break;

            case 'mute_status':
                logger.info(`Received mute status from peer: they ${msg.muted ? 'muted' : 'unmuted'} you.`);
                camLocalDrag.floatingWindow.setPeerMutedMeIndicatorActive(msg.muted);
                break;
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

        ws.send(JSON.stringify({ type: 'new-stream', streamId, streamName }));
        logger.info(`Started sharing: ${streamName}`);

        const sender = pc.addTrack(track, stream);
        if (!sender) {
            throw new Error('Failed to add screen share track to peer connection.');
        }


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

    micVolume.addEventListener('input', () => {
        adjustMicVolume();
        saveSettings();
        lastMicVolume = micVolume.value;
        const isMutedNow = parseFloat(micVolume.value) === 0;

        if (isMutedNow !== isSelfMuted) {
            isSelfMuted = isMutedNow;
            if(gainNode) sendSelfMuteStatus(isSelfMuted);
            else sendSelfMuteStatus(true);
        }

        micVolumeIcon.classList.toggle('muted', isMutedNow);
        if(gainNode) camLocalDrag.floatingWindow.setMuteIndicatorActive(isMutedNow);
        else camLocalDrag.floatingWindow.setMuteIndicatorActive(true);
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
        if (!isCurrentlyMuted) {
            lastMicVolume = micVolume.value;
            micVolume.value = 0;
            sendSelfMuteStatus(true);
            isSelfMuted = true;
        } else {
            micVolume.value = lastMicVolume;
            if(gainNode) sendSelfMuteStatus(false);
            else sendSelfMuteStatus(true);
            isSelfMuted = false;
        }
        micVolumeIcon.classList.toggle('muted', !isCurrentlyMuted);
        if(gainNode) camLocalDrag.floatingWindow.setMuteIndicatorActive(!isCurrentlyMuted);
        else camLocalDrag.floatingWindow.setMuteIndicatorActive(true);

        adjustMicVolume();
        micVolume.style.setProperty('--p', `${micVolume.value * 100}%`);
    });

    remoteVolumeIcon.addEventListener('click', () => {
        const isMuted = parseFloat(remoteVolume.value) > 0;
        if (isMuted) {
            lastRemoteVolume = remoteVolume.value;
            remoteVolume.value = 0;
        } else {
            remoteVolume.value = lastRemoteVolume;
        }
        remoteVolumeIcon.classList.toggle('muted', isMuted);
        remoteMuteIndicator.classList.toggle('active', isMuted);
        adjustRemoteVolume();
        remoteVolume.style.setProperty('--p', `${remoteVolume.value * 100}%`);
    });


    startConnectionButton.addEventListener('click', () => {
        if (startConnectionButton.innerHTML.includes('Disconnect')) {
            disconnect(true);
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

function sendSelfMuteStatus(isMuted) {
    if (commonDataChannel && commonDataChannel.readyState === 'open') {
        const payload = {
            type: 'self_mute_status',
            muted: isMuted
        };
        commonDataChannel.send(JSON.stringify(payload));
        logger.info(`Sent self-mute status to peer: ${isMuted ? 'muted' : 'unmuted'}.`);
    }
}

function sendMuteStatusUpdate(isMuted) {
    if (commonDataChannel && commonDataChannel.readyState === 'open') {
        const payload = {
            type: 'mute_status',
            muted: isMuted
        };
        commonDataChannel.send(JSON.stringify(payload));
        logger.debug(`Sent mute status update to peer: You ${isMuted ? 'muted' : 'unmuted'} them.`);
    }
}

function sendMidiSettingsStatus() {
    if (commonDataChannel && commonDataChannel.readyState === 'open' && pianos.pianos[0]) {
        const pianoOpts = pianos.pianos[0].opts;
        const payload = {
            type: 'midi_settings_status',
            settings: {
                send: pianoOpts.sendMidi,
                receive: pianoOpts.receiveMidi
            }
        };
        commonDataChannel.send(JSON.stringify(payload));
        logger.info(`Sent local MIDI settings status: Send=${payload.settings.send}, Receive=${payload.settings.receive}`);
    }
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
    notifier = new Notifications({ logger });
    camLocalDrag = new CamLocalDrag();

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        logger.info(`Global AudioContext created successfully. State: ${audioContext.state}`);

    } catch(e) {
        logger.error("Could not create AudioContext. Metronome and audio processing will not work.");
    }


    await populateDeviceOptions();
    await populateMidiOptions();

    const mediaReady = await startMedia();
    if (!mediaReady) {
        logger.error('Initial media setup failed. Please check camera/microphone permissions and availability.');
    }

    lastMicVolume = micVolume.value;
    lastRemoteVolume = remoteVolume.value;
    const isMicMuted = parseFloat(micVolume.value) === 0;
    isSelfMuted = isMicMuted;
    const isRemoteMuted = parseFloat(remoteVolume.value) === 0;
    micVolumeIcon.classList.toggle('muted', isMicMuted);
    remoteVolumeIcon.classList.toggle('muted', isRemoteMuted);
    if(!gainNode || isMicMuted) camLocalDrag.floatingWindow.setMuteIndicatorActive(true);
    remoteMuteIndicator.classList.toggle('active', isRemoteMuted);

    remotePlaceholder.classList.add('active');

    micVolume.style.setProperty('--p', `${micVolume.value * 100}%`);
    remoteVolume.style.setProperty('--p', `${remoteVolume.value * 100}%`);

    adjustMicVolume();
    setEventListeners();

    fileSharing = new FileSharing({
        container: '#filesharing-container',
        logger: logger,
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
        notifier: notifier,
        onSendMessage: (message) => {
            if (chatChannel && chatChannel.readyState === 'open') {
                chatChannel.send(message);
            } else {
                logger.error('Chat message could not be sent: Data channel is not open.');
            }
        }
    });

    pianos.createPiano(
        {
            'selector': '#piano',
            'sendMidi': true,
            'receiveMidi': true,
            'playMidiNotes': false,
            'keyPressedLocalRGB': [0, 255, 0],
            'keyPressedRemoteRGB': [255, 0, 0],
            'pedalSoft': true,
            'pedalSostenuto': true,
            'pedalSustain': true,
            'undampedStrings': ['G6', 'C8'],
            'sendMidiMessage': sendMidiMessage,
            'onSettingsChange': () => sendMidiSettingsStatus()
        },
        logger
    );

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

    new MetronomeDrag();
    loadSettings();
}

init();
