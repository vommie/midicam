import { Pianos } from "./piano.js";
import { Metronome } from "./metronome.js";
import { CamLocalDrag } from "./camLocalDrag.js";
import { MetronomeDrag } from "./metronomeDrag.js";
import { FloatingWindow } from "./floatingWindow.js"; // NEU: Import der neuen Klasse

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localVideoWrapper = document.getElementById('localVideoWrapper');
const log = document.getElementById('log-msgs');
const chat = document.getElementById('chat-msgs');
const messageInput = document.getElementById('messageInput');
const videoSelect = document.getElementById('videoSelect');
const audioSelect = document.getElementById('audioSelect');
const micVolume = document.getElementById('micVolume');
const remoteVolume = document.getElementById('remoteVolume');
const micVolumeIcon = document.getElementById('micVolumeIcon');
const remoteVolumeIcon = document.getElementById('remoteVolumeIcon');
const midiSelect = document.getElementById('midiSelect');
const midiOutputSelect = document.getElementById('midiOutputSelect');
const fileList = document.getElementById('fileList');
const serverUrlInput = document.getElementById('serverUrl');
const startConnectionButton = document.getElementById('startConnection');
const toggleMetronomeButton = document.getElementById('toggleMetronome');
const metronomeContainer = document.getElementById('metronomeContainer');
const shareScreenButton = document.getElementById('shareScreenButton'); // NEU: Screen Share Button
const additionalStreamsContainer = document.getElementById('additionalStreamsContainer'); // NEU: Container für neue Fenster

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
let isFileSharingReady = false;
let isMetronomeVisible = false;
let lastMicVolume = 1;
let lastRemoteVolume = 1;
let ws;
const CHUNK_SIZE = 65536;
const pianos = new Pianos();
let metronome;
const activeScreenShares = new Map(); // NEU: Map zur Verwaltung der Screen Shares
const pendingStreams = new Map(); // NEU: Map zur Zuordnung von ankommenden Streams

const VIDEO_QUALITY = {
    DEFAULT: { maxBitrate: 6000 * 1000 },
    FULLSCREEN: { maxBitrate: 10000 * 1000 }
};

const fileSentSound = new Audio('assets/file_sent.wav');
const fileReceiveSound = new Audio('assets/file_receive.wav');
const fileErrorSound = new Audio('assets/file_error.wav');

function addLog(msg) {
    const line = document.createElement('div');
    line.textContent += `${msg}`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

function addChatMessage(msg) {
    chat.textContent += `${msg}\n`;
    chat.scrollTop = chat.scrollHeight;
}

function parseServerUrl(url) {
    try {
        const cleanUrl = url.replace(/^wss?:\/\//i, '').replace(/^https?:\/\//i, '');
        const urlObj = new URL(`http://${cleanUrl}`);
        const hostname = urlObj.hostname;
        const port = urlObj.port || '8080';
        return { serverIp: hostname, serverPort: port };
    } catch (err) {
        addLog(`Error parsing URL: ${err.message}`);
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
    addLog('Settings saved.');
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
        addLog(`Raw device data: ${JSON.stringify(devices.map(d => ({ kind: d.kind, label: d.label, deviceId: d.deviceId })))}`);

        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        addLog(`Detected video devices: ${videoDevices.length}, audio devices: ${audioDevices.length}`);

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

        addLog('Devices loaded.');
    } catch (err) {
        addLog(`Error loading devices: ${err}`);
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

            addLog(`MIDI devices updated: ${event.port.state} - ${event.port.name}`);
            connectMidi();
        };

        addLog('MIDI devices loaded.');
    } catch (err) {
        addLog(`Error loading MIDI devices: ${err}`);
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

        addLog(`Starting media with constraints: ${JSON.stringify(constraints)}`);
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

        addLog('Media stream started.');
        saveSettings();
        return true;
    } catch (err) {
        if (err.name === 'OverconstrainedError') {
            addLog('Media Error: OverconstrainedError - Device or resolution not available.');
        } else if (err.name === 'NotAllowedError') {
            addLog('Media Error: NotAllowedError - Access to camera/microphone denied.');
        } else {
            addLog(`Media Error: ${err.message || err}`);
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
        addLog('No media device change detected.');
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
        addLog('Media devices switched.');
        saveSettings();
    } catch (err) {
        addLog(`Error switching media devices: ${err}`);
    }
}

function adjustMicVolume() {
    if (gainNode) {
        gainNode.gain.value = parseFloat(micVolume.value);
        addLog(`Microphone volume set to ${micVolume.value}.`);
    }
}

function adjustRemoteVolume() {
    remoteVideo.volume = parseFloat(remoteVolume.value);
    addLog(`Remote volume set to ${remoteVolume.value}.`);
}

async function connectMidi() {
    if (!midiAccess) {
        addLog('MIDI access not initialized. Retrying...');
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
                    addLog(`Local MIDI message sent: [${midiData}]`);
                    pianos.getMIDIMessage(message, 'local');
                    if (midiChannel && midiChannel.readyState === 'open') {
                        midiChannel.send(midiData.buffer);
                    } else {
                        addLog('MIDI data channel is not open.');
                    }
                };
                addLog(`MIDI input connected: ${selectedInput.name}.`);
            } else {
                addLog('Selected MIDI input device not available.');
            }
        } else {
            addLog('No MIDI input selected. MIDI messages will not be processed.');
        }
        saveSettings();
    } catch (err) {
        addLog(`MIDI connection error: ${err}`);
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
        addLog(`Video encoding updated to: ${fullscreen ? 'Fullscreen' : 'Standard'} (${(quality.maxBitrate / 1000000).toFixed(1)} Mbps)`);
    } catch (err) {
        addLog(`Error updating video encoding parameters: ${err.message}`);
    }
}


async function startConnection() {
    if (pc) {
        pc.close();
        pc = null;
        addLog('Previous RTCPeerConnection closed.');
    }
    if (ws) {
        ws.close();
        ws = null;
        addLog('Previous WebSocket connection closed.');
    }

    if (!localStream) {
        const mediaReady = await startMedia();
        if (!mediaReady) {
            addLog('Media setup failed. Aborting connection.');
            resetConnectionUI();
            return;
        }
    }

    const serverUrl = serverUrlInput.value.trim();
    if (!serverUrl) {
        addLog('Server URL is missing. Please enter a valid URL.');
        resetConnectionUI();
        return;
    }

    const parsed = parseServerUrl(serverUrl);
    if (!parsed) {
        addLog('Invalid server URL. Expected format: http://<ip>:<port> or https://<domain>');
        resetConnectionUI();
        return;
    }
    const { serverIp, serverPort } = parsed;

    startConnectionButton.disabled = true;
    startConnectionButton.style.backgroundColor = '#ccc';
    startConnectionButton.innerHTML = 'Connecting <img src="assets/throbber.gif" alt="Waiting" class="throbber">';
    serverUrlInput.disabled = true;

    pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    let pendingIceCandidates = [];

    const trackPromises = localStream.getTracks().map(track => {
        addLog(`Adding track: ${track.kind}`);
        return pc.addTrack(track, localStream);
    });
    await Promise.all(trackPromises);
    addLog('All local tracks added to peer connection.');

    const protocol = serverUrl.startsWith('https') ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${serverIp}:${serverPort}`);

    ws.onopen = async () => {
        addLog('WebSocket connection opened.');
        try {
            addLog(`RTCPeerConnection state before createOffer: ${pc.signalingState}`);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            addLog(`LocalDescription set: ${pc.localDescription.type}`);
            ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription.sdp }));
            addLog('Offer sent.');
        } catch (err) {
            addLog(`Error creating offer: ${err}`);
            resetConnectionUI();
        }
    };
    ws.onerror = (err) => {
        addLog(`WebSocket error: ${err.message || err}`);
        resetConnectionUI();
    };
    ws.onclose = () => {
        addLog('WebSocket connection closed.');
        resetConnectionUI();
    };
    ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        addLog(`Received WebSocket message: ${JSON.stringify(msg)}`);
        if (msg.type === 'error') {
            addLog(`Server error: ${msg.message}`);
            resetConnectionUI();
            return;
        }
        if (msg.type === 'disconnected-by-peer') {
            addLog('Connection closed by peer.');
            disconnect();
            return;
        }
        // NEU: Logik für neue Stream-Typen
        if (msg.type === 'new-stream') {
            addLog(`Peer is sharing a new stream: ${msg.streamName} (${msg.streamId})`);
            pendingStreams.set(msg.streamId, { name: msg.streamName });
            return;
        }
        if (msg.type === 'stop-stream') {
            addLog(`Peer stopped sharing stream: ${msg.streamId}`);
            stopScreenShare(msg.streamId, false); // isInitiator = false
            return;
        }
        if (msg.type === 'offer') {
            try {
                addLog(`RTCPeerConnection state before setRemoteDescription (offer): ${pc.signalingState}`);
                await pc.setRemoteDescription(new RTCSessionDescription(msg));
                addLog('RemoteDescription (offer) set.');
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                addLog(`LocalDescription (answer) set: ${pc.localDescription.type}`);
                ws.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription.sdp }));
                addLog('Answer sent.');
                while (pendingIceCandidates.length > 0) {
                    const candidate = pendingIceCandidates.shift();
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    addLog('Queued ICE candidate added.');
                }
            } catch (err) {
                addLog(`Error processing offer: ${err}`);
            }
        } else if (msg.type === 'answer') {
            try {
                addLog(`RTCPeerConnection state before setRemoteDescription (answer): ${pc.signalingState}`);
                await pc.setRemoteDescription(new RTCSessionDescription(msg));
                addLog('RemoteDescription (answer) set.');
                while (pendingIceCandidates.length > 0) {
                    const candidate = pendingIceCandidates.shift();
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    addLog('Queued ICE candidate added.');
                }
            } catch (err) {
                addLog(`Error processing answer: ${err}`);
            }
        } else if (msg.type === 'candidate') {
            if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
                addLog('ICE candidate received and added.');
            } else {
                pendingIceCandidates.push(msg.candidate);
                addLog('ICE candidate queued, awaiting remoteDescription.');
            }
        }
    };

    pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
            addLog('ICE candidate sent.');
        }
    };
    pc.ontrack = (event) => {
        // GEÄNDERT: Unterscheidung zwischen Haupt-Stream und zusätzlichen Streams
        const stream = event.streams[0];
        const streamInfo = pendingStreams.get(stream.id);

        if (streamInfo) {
            // Dies ist ein bekannter Screen-Share-Stream
            addLog(`Received remote screen share stream: ${streamInfo.name}`);
            const remoteWindow = new FloatingWindow({
                container: additionalStreamsContainer,
                stream: stream,
                title: `Peer: ${streamInfo.name}`,
                isClosable: true,
                id: stream.id
            });
            // Beim Schließen des Remote-Fensters wird es nur lokal zerstört
            remoteWindow.wrapper.addEventListener('close', (e) => {
                 stopScreenShare(e.detail.id, false);
            });
            activeScreenShares.set(stream.id, { window: remoteWindow });
            pendingStreams.delete(stream.id);
        } else {
            // Dies ist der Haupt-Videostream
            addLog('Remote stream received. Attaching to remoteVideo element.');
            remoteVideo.srcObject = stream;
            remoteVideo.play().catch(err => addLog(`Error playing remote video stream: ${err}`));
        }
    };
    pc.oniceconnectionstatechange = () => {
        addLog(`ICE connection state change: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            isFileSharingReady = true;
            enableFileSharing();
            connectMidi();
            toggleMetronomeButton.disabled = false;
            shareScreenButton.disabled = false; // NEU: Screen-Share-Button aktivieren
            startConnectionButton.disabled = false;
            startConnectionButton.style.backgroundColor = '#9D1919';
            startConnectionButton.style.color = '#ffffff';
            startConnectionButton.innerHTML = 'Disconnect';
            serverUrlInput.style.display = 'none';
            document.querySelector('label[for="serverUrl"]').style.display = 'none';
            updateVideoEncodingParameters(false);
        } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
            isFileSharingReady = false;
            disableFileSharing();
            toggleMetronomeButton.disabled = true;
            shareScreenButton.disabled = true; // NEU: Screen-Share-Button deaktivieren
            remoteVideo.srcObject = null;
            addLog('Remote video reset due to ICE state change.');
            resetConnectionUI();
        }
    };

    midiChannel = pc.createDataChannel('midiChannel', { ordered: false, maxRetransmits: 0 });
    setupMidiChannel(midiChannel);
    fileChannel = pc.createDataChannel('fileChannel');
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
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'disconnect-all' }));
        addLog('Disconnect-All message sent.');
    }
    // NEU: Alle Screen-Shares beim Trennen beenden
    for (const streamId of activeScreenShares.keys()) {
        stopScreenShare(streamId, true);
    }
    if (pc) {
        pc.close();
        pc = null;
        addLog('WebRTC connection closed.');
    }
    if (ws) {
        ws.close();
        ws = null;
        addLog('WebSocket connection closed.');
    }
    remoteVideo.srcObject = null;
    remoteVideo.load();
    addLog('remoteVideo element reset and loaded');
    if (audioContext) {
        audioContext.close();
        audioContext = null;
        gainNode = null;
        addLog('AudioContext closed.');
    }
    if (midiAccess) {
        const inputs = Array.from(midiAccess.inputs.values());
        inputs.forEach(input => input.onmidimessage = null);
        addLog('MIDI message handlers cleared.');
    }
    midiChannel = null;
    fileChannel = null;
    chatChannel = null;
    metronomeChannel = null;
    isFileSharingReady = false;
    disableFileSharing();
    resetConnectionUI();
}

function resetConnectionUI() {
    startConnectionButton.disabled = false;
    startConnectionButton.style.backgroundColor = '#4CAF50';
    startConnectionButton.innerHTML = 'Start';
    serverUrlInput.disabled = false;
    serverUrlInput.style.display = 'block';
    document.querySelector('label[for="serverUrl"]').style.display = 'block';

    toggleMetronomeButton.disabled = true;
    shareScreenButton.disabled = true; // NEU: Deaktivieren
    toggleMetronomeButton.classList.remove('active');
    metronomeContainer.classList.remove('visible', 'master', 'slave');
    isMetronomeVisible = false;
    if (metronome) {
        metronome.pause();
    }
}

function setupMidiChannel(channel) {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => addLog('MIDI data channel opened.');
    channel.onmessage = (event) => {
        const midiData = new Uint8Array(event.data);
        addLog(`Remote MIDI message received: [${midiData}]`);
        pianos.getMIDIMessage({ data: midiData }, 'remote');
        if (midiAccess && midiOutputSelect.value) {
            const selectedOutputId = midiOutputSelect.value;
            const outputs = Array.from(midiAccess.outputs.values());
            const selectedOutput = outputs.find(output => output.id === selectedOutputId);
            if (selectedOutput) {
                selectedOutput.send(midiData);
                addLog(`Forwarded MIDI message to output: ${selectedOutput.name}.`);
            }
        }
    };
    channel.onerror = (err) => addLog(`MIDI data channel error: ${err.message || err}`);
    channel.onclose = () => addLog('MIDI data channel closed.');
}

function setupChatChannel(channel) {
    channel.onopen = () => addLog('Chat data channel opened.');
    channel.onmessage = (event) => {
        const message = event.data;
        addChatMessage(`Peer: ${message}`);
    };
    channel.onerror = (err) => addLog(`Chat data channel error: ${err.message || err}`);
    channel.onclose = () => addLog('Chat data channel closed.');
}

function setupMetronomeChannel(channel) {
    channel.onopen = () => {
        addLog('Metronome data channel opened.');
        if(isMetronomeVisible) {
             sendMetronomeState();
        }
    };
    channel.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'metronome_sync') {
            addLog(`Metronome sync received: ${JSON.stringify(msg.data)}`);
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
    channel.onerror = (err) => addLog(`Metronome data channel error: ${err.message || err}`);
    channel.onclose = () => {
         addLog('Metronome data channel closed.');
        toggleMetronomeButton.disabled = true;
        metronomeContainer.classList.remove('visible', 'master', 'slave');
        toggleMetronomeButton.classList.remove('active');
        isMetronomeVisible = false;
        if(metronome) metronome.pause();
    };
}

let activeReceives = new Map();

function setupFileChannel(channel) {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
        addLog('File data channel opened.');
        isFileSharingReady = true;
        enableFileSharing();
    };
    channel.onmessage = (event) => {
        const data = new Uint8Array(event.data);
        const header = new TextDecoder().decode(data.slice(0, 1));
        if (header === 'I') {
            const info = JSON.parse(new TextDecoder().decode(data.slice(1)));
            const fileId = `${info.fileName}-${Date.now()}`;
            const fileInfo = {
                fileName: info.fileName,
                fileType: info.fileType,
                totalBytes: info.totalBytes,
                chunks: [],
                fileItem: addFileToList(info.fileName, info.fileType, null, false, true),
                startTime: Date.now(),
                receivedBytes: 0
            };
            activeReceives.set(fileId, fileInfo);
            addLog(`Receiving file info: ${info.fileName}, ${info.totalBytes} bytes`);
        } else if (header === 'C') {
            for (const [fileId, fileInfo] of activeReceives) {
                const chunk = data.slice(1);
                fileInfo.chunks.push(chunk);
                fileInfo.receivedBytes += chunk.byteLength;
                const elapsed = (Date.now() - fileInfo.startTime) / 1000;
                const speed = fileInfo.receivedBytes / elapsed / 1024 / 1024;
                const percentage = (fileInfo.receivedBytes / fileInfo.totalBytes) * 100;
                updateFileProgress(fileInfo.fileItem, percentage, speed);
                if (fileInfo.receivedBytes === fileInfo.totalBytes) {
                    const fileData = new Blob(fileInfo.chunks);
                    finalizeFileTransfer(fileInfo.fileItem, fileInfo.fileName, fileInfo.fileType, fileData, false);
                    addLog(`File reception complete: ${info.fileName}`);
                    fileReceiveSound.play().catch(err => addLog(`Audio playback error: ${err}`));
                    activeReceives.delete(fileId);
                }
                break;
            }
        }
    };
    channel.onerror = (err) => {
        addLog(`File data channel error: ${err.message || err}`);
        isFileSharingReady = false;
        disableFileSharing();
    };
    channel.onclose = () => {
        addLog('File data channel closed.');
        isFileSharingReady = false;
        disableFileSharing();
    };
}

function enableFileSharing() {
    fileList.style.backgroundColor = '#0F0F0F';
    fileList.style.opacity = '1';
    fileList.querySelector('p').textContent = 'Drop file here';
    addLog('File sharing enabled.');
}

function disableFileSharing() {
    fileList.style.backgroundColor = 'transparent';
    fileList.style.opacity = '0.5';
    fileList.querySelector('p').textContent = 'File sharing unavailable without connection';
    addLog('File sharing disabled.');
}

function handleDragOver(event) {
    event.preventDefault();
    if (isFileSharingReady) {
        fileList.classList.add('dragover');
    }
}

function handleDragLeave(event) {
    event.preventDefault();
    fileList.classList.remove('dragover');
}

async function handleDrop(event) {
    event.preventDefault();
    fileList.classList.remove('dragover');
    if (!isFileSharingReady) {
        addLog('Cannot send file: no active connection.');
        return;
    }
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        const fileItem = addFileToList(file.name, file.type, null, true, true);
        const progressBar = fileItem.querySelector('.progress-bar');
        const startTime = Date.now();
        let sentBytes = 0;

        const fileInfo = {
            fileName: file.name,
            fileType: file.type,
            totalBytes: file.size
        };
        const infoData = new TextEncoder().encode('I' + JSON.stringify(fileInfo));
        fileChannel.send(infoData);
        addLog(`Sending file info: ${file.name}, ${file.size} bytes`);

        const arrayBuffer = await file.arrayBuffer();
        for (let i = 0; i < file.size; i += CHUNK_SIZE) {
            const chunk = arrayBuffer.slice(i, Math.min(i + CHUNK_SIZE, file.size));
            const chunkData = new Uint8Array(chunk.byteLength + 1);
            chunkData[0] = 'C'.charCodeAt(0);
            chunkData.set(new Uint8Array(chunk), 1);
            fileChannel.send(chunkData);
            sentBytes += chunk.byteLength;
            const percentage = (sentBytes / file.size) * 100;
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = sentBytes / elapsed / 1024 / 1024;
            progressBar.style.width = `${Math.min(percentage, 100)}%`;
            updateFileProgress(fileItem, percentage, speed);
        }

        finalizeFileTransfer(fileItem, file.name, file.type, arrayBuffer, true);
        addLog(`File sent: ${file.name}`);
        fileSentSound.play().catch(err => addLog(`Audio playback error: ${err}`));
    }
}

function addFileToList(fileName, fileType, fileData, isSent, showProgress = false) {
    const fileItem = document.createElement('div');
    fileItem.classList.add('file-item', isSent ? 'sent' : 'received');

    const direction = document.createElement('span');
    direction.classList.add('direction');
    direction.textContent = isSent ? '⬆' : '⬇';
    fileItem.appendChild(direction);

    const icon = document.createElement('img');
    icon.classList.add('icon');
    icon.src = 'assets/' + getFileIcon(fileType);
    fileItem.appendChild(icon);

    const fileLink = document.createElement('a');
    fileLink.href = '#';
    fileLink.textContent = fileName;
    fileLink.style.color = isSent ? 'white' : 'white';
    fileLink.style.textDecoration = 'underline';
    fileLink.onclick = (e) => {
        e.preventDefault();
        if (fileData) handleFileOpen(fileName, fileType, fileData);
    };
    fileItem.appendChild(fileLink);

    if (showProgress) {
        const progressContainer = document.createElement('div');
        progressContainer.classList.add('progress-container');
        const progressBar = document.createElement('div');
        progressBar.classList.add('progress-bar');
        progressContainer.appendChild(progressBar);
        const progressText = document.createElement('span');
        progressText.classList.add('progress-text');
        progressText.textContent = '0% (0 MB/s)';
        fileItem.appendChild(progressContainer);
        fileItem.appendChild(progressText);
    }

    fileList.appendChild(fileItem);
    return fileItem;
}

function updateFileProgress(fileItem, percentage, speed) {
    const progressBar = fileItem.querySelector('.progress-bar');
    const progressText = fileItem.querySelector('.progress-text');
    progressBar.parentElement.style.display = 'block';
    progressBar.style.width = `${Math.min(percentage, 100)}%`;
    progressText.textContent = `${Math.round(percentage)}% (${speed.toFixed(2)} MB/s)`;
    addLog(`File transfer progress: ${Math.round(percentage)}%`);
}

function finalizeFileTransfer(fileItem, fileName, fileType, fileData, isSent) {
    const progressContainer = fileItem.querySelector('.progress-container');
    const progressText = fileItem.querySelector('.progress-text');
    if (progressContainer) progressContainer.style.display = 'none';
    if (progressText) progressText.remove();
    const fileLink = fileItem.querySelector('a');
    fileLink.onclick = (e) => {
        e.preventDefault();
        if (fileData) {
            const url = URL.createObjectURL(new Blob([fileData], { type: fileType }));
            handleFileOpen(fileName, fileType, url);
        }
    };
}

function handleFileOpen(fileName, fileType, url) {
    if (fileType.startsWith('image/') || fileType === 'application/pdf' || fileType.startsWith('text/')) {
        window.open(url, '_blank');
        addLog(`File opened in new tab: ${fileName}`);
    } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        addLog(`File download initiated: ${fileName}`);
    }
}

function getFileIcon(fileType) {
    if (fileType.startsWith('image/')) return 'file_image.svg';
    if (fileType === 'application/pdf') return 'file_pdf.svg';
    if (fileType.startsWith('text/')) return 'file_text.svg';
    if (fileType.startsWith('audio/')) return 'file_audio.svg';
    if (fileType.startsWith('video/')) return 'file_video.svg';
    if (fileType === 'application/zip' || fileType === 'application/x-rar-compressed') return 'file_archive.svg';
    return 'file_generic.svg';
}

function sendChatMessage() {
    const message = messageInput.value.trim();
    if (message && chatChannel && chatChannel.readyState === 'open') {
        chatChannel.send(message);
        addChatMessage(`You: ${message}`);
        messageInput.value = '';
    } else {
        addLog('Chat message not sent: channel not open or message is empty.');
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
        addLog(`Metronome state sent (Master Claim: ${isClaimingMaster}): ${JSON.stringify(payload.data)}`);
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

// NEUE FUNKTION: Screen Share starten
async function startScreenShare() {
    if (!pc) {
        addLog('Cannot start screen share: no active connection.');
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const track = stream.getVideoTracks()[0];
        const streamId = stream.id;
        const streamName = track.label || 'Screen Share';

        const sender = pc.addTrack(track, stream);
        if (!sender) {
            throw new Error('Failed to add screen share track to peer connection.');
        }

        ws.send(JSON.stringify({ type: 'new-stream', streamId, streamName }));
        addLog(`Started sharing: ${streamName}`);

        const localWindow = new FloatingWindow({
            container: additionalStreamsContainer,
            stream: stream,
            title: `You share: ${streamName}`,
            isClosable: true,
            id: streamId
        });

        activeScreenShares.set(streamId, { window: localWindow, sender });

        // Listener, wenn Nutzer das Sharing über den Browser-Button beendet
        track.onended = () => {
            addLog(`Sharing for ${streamName} ended by user.`);
            stopScreenShare(streamId, true);
        };

        // Listener, wenn Nutzer das Sharing über den "X"-Button im Fenster beendet
        localWindow.wrapper.addEventListener('close', () => {
            track.stop(); // Löst das onended-Event aus, das dann aufräumt
        });

    } catch (err) {
        addLog(`Error starting screen share: ${err.message}`);
    }
}

// NEUE FUNKTION: Screen Share beenden
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
    addLog(`Stopped sharing stream ${streamId}`);
}


function setEventListeners() {
    const chatForm = document.querySelector('#chat-form');
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendChatMessage();
    });

    document.querySelector('#midiSelect').addEventListener('change', () => connectMidi());
    document.querySelector('#midiOutputSelect').addEventListener('change', () => saveSettings());

    document.querySelector('#videoSelect').addEventListener('change', () => switchMedia());
    document.querySelector('#audioSelect').addEventListener('change', () => switchMedia());

    micVolume.addEventListener('input', () => {
        adjustMicVolume();
        saveSettings();
        lastMicVolume = micVolume.value;
        micVolumeIcon.classList.toggle('muted', parseFloat(micVolume.value) === 0);
    });
    remoteVolume.addEventListener('input', () => {
        adjustRemoteVolume();
        saveSettings();
        lastRemoteVolume = remoteVolume.value;
        remoteVolumeIcon.classList.toggle('muted', parseFloat(remoteVolume.value) === 0);
    });

    micVolumeIcon.addEventListener('click', () => {
        if (parseFloat(micVolume.value) > 0) {
            lastMicVolume = micVolume.value;
            micVolume.value = 0;
            micVolumeIcon.classList.add('muted');
        } else {
            micVolume.value = lastMicVolume;
            micVolumeIcon.classList.remove('muted');
        }
        adjustMicVolume();
    });

    remoteVolumeIcon.addEventListener('click', () => {
        if (parseFloat(remoteVolume.value) > 0) {
            lastRemoteVolume = remoteVolume.value;
            remoteVolume.value = 0;
            remoteVolumeIcon.classList.add('muted');
        } else {
            remoteVolume.value = lastRemoteVolume;
            remoteVolumeIcon.classList.remove('muted');
        }
        adjustRemoteVolume();
    });


    startConnectionButton.addEventListener('click', () => {
        if (startConnectionButton.innerHTML.includes('Disconnect')) {
            disconnect();
        } else {
            startConnection();
        }
    });

    // NEU: Event listener für Screen Share Button
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
        addLog("Attempting to claim metronome mastership...");
        metronome.claimMastership();
    });


    fileList.addEventListener('dragover', handleDragOver);
    fileList.addEventListener('dragleave', handleDragLeave);
    fileList.addEventListener('drop', handleDrop);

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

    // WICHTIG: Die dblclick-Listener werden nun von der FloatingWindow-Klasse gehandhabt.
    // localVideoWrapper.addEventListener('dblclick', () => toggleFullscreen(localVideo));
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
        midiChannel.send(midiData.buffer);
        addLog(`MIDI message from piano sent: [${midiData}]`);
    } else {
        addLog('Cannot send MIDI message: data channel is not open.');
    }
}

async function init() {
    await populateDeviceOptions();
    await populateMidiOptions();
    const mediaReady = await startMedia();
    if (!mediaReady) {
        addLog('Media setup failed. Please check camera/microphone permissions and availability.');
    }

    lastMicVolume = micVolume.value;
    lastRemoteVolume = remoteVolume.value;
    micVolumeIcon.classList.toggle('muted', parseFloat(micVolume.value) === 0);
    remoteVolumeIcon.classList.toggle('muted', parseFloat(remoteVolume.value) === 0);

    adjustMicVolume();
    disableFileSharing();

    setEventListeners();

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
        'sendMidiMessage': sendMidiMessage
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

    new CamLocalDrag(); // GEÄNDERT: Nutzt intern die neue FloatingWindow Klasse
    new MetronomeDrag();
    loadSettings();
}

init();
