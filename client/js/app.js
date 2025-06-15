import { Pianos } from "./piano.js";
import { Metronome } from "./metronome.js";
import { CamLocalDrag } from "./camLocalDrag.js";

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const log = document.getElementById('log-msgs');
const chat = document.getElementById('chat-msgs');
const messageInput = document.getElementById('messageInput');
const videoSelect = document.getElementById('videoSelect');
const audioSelect = document.getElementById('audioSelect');
const micVolume = document.getElementById('micVolume');
const midiSelect = document.getElementById('midiSelect');
const midiOutputSelect = document.getElementById('midiOutputSelect');
const fileList = document.getElementById('fileList');
const serverUrlInput = document.getElementById('serverUrl');
const startConnectionButton = document.getElementById('startConnection');
const toggleMetronomeButton = document.getElementById('toggleMetronome');
const metronomeContainer = document.getElementById('metronomeContainer');

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
let ws;
const CHUNK_SIZE = 65536;
const pianos = new Pianos();
let metronome;

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
        addLog(`Fehler beim Parsen der URL: ${err.message}`);
        return null;
    }
}

function saveSettings() {
    const settings = {
        videoDeviceId: videoSelect.value,
        audioDeviceId: audioSelect.value,
        micVolume: micVolume.value,
        midiDeviceId: midiSelect.value,
        midiOutputDeviceId: midiOutputSelect.value,
        serverUrl: serverUrlInput.value // Speichere die volle URL
    };
    localStorage.setItem('midiCamDiggaSettings', JSON.stringify(settings));
    addLog('Einstellungen gespeichert.');
}

function loadSettings() {
    const savedSettings = localStorage.getItem('midiCamDiggaSettings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        serverUrlInput.value = settings.serverUrl || 'http://localhost:8080'; // Standard-URL
        return settings;
    }
    return { serverUrl: 'http://localhost:8080' };
}

// ... (populateDeviceOptions, populateMidiOptions, startMedia, switchMedia, adjustMicVolume, connectMidi bleiben gleich) ...
async function populateDeviceOptions() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        addLog(`Rohdaten der Geräte: ${JSON.stringify(devices.map(d => ({ kind: d.kind, label: d.label, deviceId: d.deviceId })))}`);

        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        addLog(`Erkannte Video-Geräte: ${videoDevices.length}, Audio-Geräte: ${audioDevices.length}`);

        const createFallbackName = (type, index, device) => {
            if (device.label && device.label.trim() !== '' && device.label !== type) {
                return device.label;
            }
            return `${type} ${index + 1}`;
        };

        videoSelect.innerHTML = videoDevices.length > 0
            ? videoDevices.map((device, index) =>
                `<option value="${device.deviceId}">${createFallbackName('Kamera', index, device)}</option>`
              ).join('')
            : '<option value="">Keine Kamera verfügbar</option>';

        audioSelect.innerHTML = audioDevices.length > 0
            ? audioDevices.map((device, index) =>
                `<option value="${device.deviceId}">${createFallbackName('Mikrofon', index, device)}</option>`
              ).join('')
            : '<option value="">Kein Mikrofon verfügbar</option>';

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

        currentVideoId = videoSelect.value;
        currentAudioId = audioSelect.value;

        addLog('Geräte geladen.');
    } catch (err) {
        addLog(`Fehler beim Laden der Geräte: ${err}`);
    }
}

async function populateMidiOptions() {
    try {
        midiAccess = await navigator.requestMIDIAccess();
        const inputs = Array.from(midiAccess.inputs.values());
        const outputs = Array.from(midiAccess.outputs.values());

        midiSelect.innerHTML = '<option value="">Kein MIDI-Eingang</option>' +
            inputs.map(input =>
                `<option value="${input.id}">${input.name || 'MIDI-In ' + input.id.slice(0, 5)}</option>`
            ).join('');
        midiOutputSelect.innerHTML = '<option value="">Kein MIDI-Ausgang</option>' +
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

            midiSelect.innerHTML = '<option value="">Kein MIDI-Eingang</option>' +
                inputs.map(input =>
                    `<option value="${input.id}">${input.name || 'MIDI-In ' + input.id.slice(0, 5)}</option>`
                ).join('');
            midiOutputSelect.innerHTML = '<option value="">Kein MIDI-Ausgang</option>' +
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

            addLog(`MIDI-Geräte aktualisiert: ${event.port.state} - ${event.port.name}`);
            connectMidi();
        };

        addLog('MIDI-Geräte geladen.');
    } catch (err) {
        addLog(`Fehler beim Laden der MIDI-Geräte: ${err}`);
    }
}

async function startMedia() {
    try {
        const videoId = videoSelect.value;
        const audioId = audioSelect.value;
        const constraints = {
            video: videoId ? { deviceId: { exact: videoId } } : true,
            audio: audioId ? { deviceId: { exact: audioId } } : true
        };

        if (!videoId) delete constraints.video.deviceId;
        if (!audioId) delete constraints.audio.deviceId;

        addLog(`Starte Media mit Constraints: ${JSON.stringify(constraints)}`);
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

        addLog('Media gestartet.');
        saveSettings();
        return true;
    } catch (err) {
        if (err.name === 'OverconstrainedError') {
            addLog('Fehler bei Media: Gerät nicht verfügbar (möglicherweise von einer anderen Instanz belegt).');
        } else if (err.name === 'NotAllowedError') {
            addLog('Fehler bei Media: Zugriff auf Kamera/Mikrofon verweigert.');
        } else {
            addLog(`Fehler bei Media: ${err.message || err}`);
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
        addLog('Keine Änderung.');
        return;
    }

    try {
        if (videoChanged && audioChanged) {
            if (localStream) localStream.getTracks().forEach(track => track.stop());
            if (audioContext) audioContext.close();
            const constraints = {
                video: newVideoId ? { deviceId: { exact: newVideoId } } : false,
                audio: newAudioId ? { deviceId: { exact: newAudioId } } : false
            };
            addLog(`Beides umschalten mit: ${JSON.stringify(constraints)}`);
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
        } else if (audioChanged) {
            const audioConstraints = { audio: newAudioId ? { deviceId: { exact: newAudioId } } : false };
            addLog(`Nur Audio umschalten mit: ${JSON.stringify(audioConstraints)}`);
            const audioStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
            const newAudioTrack = audioStream.getAudioTracks()[0];

            if (localStream && localStream.getAudioTracks().length > 0) {
                const oldAudioTrack = localStream.getAudioTracks()[0];
                localStream.removeTrack(oldAudioTrack);
                oldAudioTrack.stop();
            }
            localStream.addTrack(newAudioTrack);

            if (audioContext) audioContext.close();
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(new MediaStream([newAudioTrack]));
            gainNode = audioContext.createGain();
            gainNode.gain.value = parseFloat(micVolume.value);
            source.connect(gainNode);
            const destination = audioContext.createMediaStreamDestination();
            gainNode.connect(destination);
            const adjustedAudioTrack = destination.stream.getAudioTracks()[0];
            localStream.removeTrack(newAudioTrack);
            localStream.addTrack(adjustedAudioTrack);
        } else if (videoChanged) {
            if (localStream && localStream.getVideoTracks().length > 0) {
                localStream.getVideoTracks().forEach(track => track.stop());
            }
            const videoConstraints = { video: newVideoId ? { deviceId: { exact: newVideoId } } : false };
            addLog(`Nur Video umschalten mit: ${JSON.stringify(videoConstraints)}`);
            const videoStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
            const videoTrack = videoStream.getVideoTracks()[0];
            if (localStream && localStream.getVideoTracks().length > 0) {
                localStream.removeTrack(localStream.getVideoTracks()[0]);
            }
            localStream.addTrack(videoTrack);
            localVideo.srcObject = localStream;
        }

        if (pc) {
            const senders = pc.getSenders();
            const videoTrack = localStream.getVideoTracks()[0];
            const audioTrack = localStream.getAudioTracks()[0];
            senders.forEach(sender => {
                if (sender.track.kind === 'video' && videoTrack) {
                    sender.replaceTrack(videoTrack);
                } else if (sender.track.kind === 'audio' && audioTrack) {
                    sender.replaceTrack(audioTrack);
                }
            });
        }

        currentVideoId = newVideoId;
        currentAudioId = newAudioId;
        addLog('Media umgeschaltet.');
        saveSettings();
    } catch (err) {
        addLog(`Fehler beim Umschalten: ${err}`);
    }
}

function adjustMicVolume() {
    if (gainNode) {
        gainNode.gain.value = parseFloat(micVolume.value);
        addLog(`Mikrofon-Lautstärke auf ${micVolume.value} gesetzt.`);
        saveSettings();
    }
}

async function connectMidi() {
    if (!midiAccess) {
        addLog('MIDI-Zugriff nicht initialisiert. Warte mal.');
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
                    addLog(`MIDI lokal gesendet: [${midiData}]`);
                    pianos.getMIDIMessage(message, 'local');
                    if (midiChannel && midiChannel.readyState === 'open') {
                        midiChannel.send(midiData.buffer);
                    } else {
                        addLog('MIDI-Kanal nicht offen.');
                    }
                };
                addLog(`MIDI-Eingang connected zu: ${selectedInput.name}.`);
            } else {
                addLog('Ausgewähltes MIDI-Eingangsgerät nicht verfügbar.');
            }
        } else {
            addLog('Kein MIDI-Eingang ausgewählt, keine Signale werden verarbeitet.');
        }
        saveSettings();
    } catch (err) {
        addLog(`MIDI-Fehler: ${err}`);
    }
}

async function startConnection() {
    if (pc) {
        pc.close();
        pc = null;
        addLog('Alte WebRTC-Verbindung geschlossen');
    }
    if (ws) {
        ws.close();
        ws = null;
        addLog('Alter WebSocket geschlossen');
    }

    if (!localStream) {
        const mediaReady = await startMedia();
        if (!mediaReady) {
            addLog('Media-Setup fehlgeschlagen. Verbindung abgebrochen.');
            resetConnectionUI();
            return;
        }
    }

    const serverUrl = serverUrlInput.value.trim();
    if (!serverUrl) {
        addLog('Server-URL fehlt. Gib mal was ein!');
        resetConnectionUI();
        return;
    }

    const parsed = parseServerUrl(serverUrl);
    if (!parsed) {
        addLog('Ungültige Server-URL. Format: http://<ip>:<port> oder https://<domain>');
        resetConnectionUI();
        return;
    }
    const { serverIp, serverPort } = parsed;

    startConnectionButton.disabled = true;
    startConnectionButton.style.backgroundColor = '#ccc';
    startConnectionButton.innerHTML = 'Warte <img src="assets/throbber.gif" alt="Warten" class="throbber">';
    serverUrlInput.disabled = true;

    pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    let pendingIceCandidates = [];

    const trackPromises = localStream.getTracks().map(track => {
        addLog(`Track hinzufügt: ${track.kind}`);
        return pc.addTrack(track, localStream);
    });
    await Promise.all(trackPromises);
    addLog('Alle Tracks hinzugefügt.');

    const protocol = serverUrl.startsWith('https') ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${serverIp}:${serverPort}`);

    ws.onopen = async () => {
        addLog('WebSocket offen.');
        try {
            addLog(`RTCPeerConnection Zustand vor Offer: ${pc.signalingState}`);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            addLog(`LocalDescription gesetzt: ${pc.localDescription.type}`);
            ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription.sdp }));
            addLog('Offer gesendet.');
        } catch (err) {
            addLog(`Fehler bei Offer-Erstellung: ${err}`);
            resetConnectionUI();
        }
    };
    ws.onerror = (err) => {
        addLog(`WebSocket Fehler: ${err.message || err}`);
        resetConnectionUI();
    };
    ws.onclose = () => {
        addLog('WebSocket zu.');
        resetConnectionUI();
    };
    ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        addLog(`Nachricht empfangen: ${JSON.stringify(msg)}`);
        if (msg.type === 'error') {
            addLog(`Server-Fehler: ${msg.message}`);
            resetConnectionUI();
            return;
        }
        if (msg.type === 'disconnected-by-peer') {
            addLog('Verbindung von Peer getrennt.');
            disconnect();
            return;
        }
        if (msg.type === 'offer') {
            try {
                addLog(`RTCPeerConnection Zustand vor setRemoteDescription (offer): ${pc.signalingState}`);
                await pc.setRemoteDescription(new RTCSessionDescription(msg));
                addLog('RemoteDescription (offer) gesetzt.');
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                addLog(`LocalDescription (answer) gesetzt: ${pc.localDescription.type}`);
                ws.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription.sdp }));
                addLog('Answer gesendet.');
                while (pendingIceCandidates.length > 0) {
                    const candidate = pendingIceCandidates.shift();
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    addLog('Gepufferter ICE-Kandidat hinzugefügt.');
                }
            } catch (err) {
                addLog(`Fehler bei Offer-Verarbeitung: ${err}`);
            }
        } else if (msg.type === 'answer') {
            try {
                addLog(`RTCPeerConnection Zustand vor setRemoteDescription (answer): ${pc.signalingState}`);
                await pc.setRemoteDescription(new RTCSessionDescription(msg));
                addLog('RemoteDescription (answer) gesetzt.');
                while (pendingIceCandidates.length > 0) {
                    const candidate = pendingIceCandidates.shift();
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    addLog('Gepufferter ICE-Kandidat hinzugefügt.');
                }
            } catch (err) {
                addLog(`Fehler bei Answer-Verarbeitung: ${err}`);
            }
        } else if (msg.type === 'candidate') {
            if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
                addLog('ICE-Kandidat empfangen und hinzugefügt.');
            } else {
                pendingIceCandidates.push(msg.candidate);
                addLog('ICE-Kandidat gepuffert, warte auf remoteDescription.');
            }
        }
    };

    pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
            addLog('ICE-Kandidat gesendet.');
        }
    };
    pc.ontrack = (event) => {
        addLog('Remote-Stream empfangen, setze auf remoteVideo');
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.play().catch(err => addLog(`Fehler beim Abspielen von remoteVideo: ${err}`));
    };
    pc.oniceconnectionstatechange = () => {
        addLog(`ICE-Verbindungsstatus: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            isFileSharingReady = true;
            enableFileSharing();
            connectMidi();
            toggleMetronomeButton.disabled = false;
            startConnectionButton.disabled = false;
            startConnectionButton.style.backgroundColor = '#9D1919';
            startConnectionButton.style.color = '#ffffff';
            startConnectionButton.innerHTML = 'Verbindung trennen';
            serverUrlInput.style.display = 'none';
            document.querySelector('label[for="serverUrl"]').style.display = 'none';
        } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
            isFileSharingReady = false;
            disableFileSharing();
            toggleMetronomeButton.disabled = true;
            remoteVideo.srcObject = null;
            addLog('Remote-Video zurückgesetzt wegen ICE-Statusänderung');
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
        addLog('Disconnect-All gesendet.');
    }
    if (pc) {
        pc.close();
        pc = null;
        addLog('WebRTC-Verbindung getrennt.');
    }
    if (ws) {
        ws.close();
        ws = null;
        addLog('WebSocket-Verbindung getrennt.');
    }
    remoteVideo.srcObject = null;
    remoteVideo.load();
    addLog('remoteVideo zurückgesetzt und geladen');
    if (audioContext) {
        audioContext.close();
        audioContext = null;
        gainNode = null;
        addLog('AudioContext geschlossen.');
    }
    if (midiAccess) {
        const inputs = Array.from(midiAccess.inputs.values());
        inputs.forEach(input => input.onmidimessage = null);
        addLog('MIDI-Handler zurückgesetzt.');
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
    toggleMetronomeButton.classList.remove('active');
    metronomeContainer.classList.remove('visible');
    isMetronomeVisible = false;
    if (metronome) {
        metronome.pause();
    }
}

function setupMidiChannel(channel) {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => addLog('MIDI-Kanal offen.');
    channel.onmessage = (event) => {
        const midiData = new Uint8Array(event.data);
        addLog(`MIDI vom anderen empfangen: [${midiData}]`);
        pianos.getMIDIMessage({ data: midiData }, 'remote');
        if (midiAccess && midiOutputSelect.value) {
            const selectedOutputId = midiOutputSelect.value;
            const outputs = Array.from(midiAccess.outputs.values());
            const selectedOutput = outputs.find(output => output.id === selectedOutputId);
            if (selectedOutput) {
                selectedOutput.send(midiData);
                addLog(`MIDI an ${selectedOutput.name} gesendet.`);
            }
        }
    };
    channel.onerror = (err) => addLog(`MIDI-Kanal Fehler: ${err.message || err}`);
    channel.onclose = () => addLog('MIDI-Kanal zu.');
}

function setupChatChannel(channel) {
    channel.onopen = () => addLog('Chat-Kanal offen.');
    channel.onmessage = (event) => {
        const message = event.data;
        addChatMessage(`Anderer Digga: ${message}`);
    };
    channel.onerror = (err) => addLog(`Chat-Kanal Fehler: ${err.message || err}`);
    channel.onclose = () => addLog('Chat-Kanal zu.');
}

function setupMetronomeChannel(channel) {
    channel.onopen = () => addLog('Metronom-Kanal offen.');
    channel.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'metronome_sync') {
            addLog(`Metronom-Sync empfangen: ${JSON.stringify(msg.data)}`);
            isMetronomeVisible = msg.data.visible;
            metronomeContainer.classList.toggle('visible', isMetronomeVisible);
            toggleMetronomeButton.classList.toggle('active', isMetronomeVisible);
            metronome.setState(msg.data, true); // true, um Endlosschleife zu verhindern
        }
    };
    channel.onerror = (err) => addLog(`Metronom-Kanal Fehler: ${err.message || err}`);
    channel.onclose = () => {
         addLog('Metronom-Kanal zu.');
        toggleMetronomeButton.disabled = true;
        metronomeContainer.classList.remove('visible');
        toggleMetronomeButton.classList.remove('active');
        isMetronomeVisible = false;
        if(metronome) metronome.pause();
    };
}


let activeReceives = new Map();

function setupFileChannel(channel) {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
        addLog('File-Kanal offen.');
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
            addLog(`Datei-Info empfangen: ${info.fileName}, ${info.totalBytes} Bytes`);
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
                    addLog(`Datei komplett empfangen: ${info.fileName}`);
                    fileReceiveSound.play().catch(err => addLog(`Sound Fehler: ${err}`));
                    activeReceives.delete(fileId);
                }
                break;
            }
        }
    };
    channel.onerror = (err) => {
        addLog(`File-Kanal Fehler: ${err.message || err}`);
        isFileSharingReady = false;
        disableFileSharing();
    };
    channel.onclose = () => {
        addLog('File-Kanal zu.');
        isFileSharingReady = false;
        disableFileSharing();
    };
}

function enableFileSharing() {
    fileList.style.backgroundColor = '#0F0F0F';
    fileList.style.opacity = '1';
    fileList.querySelector('p').textContent = 'Drop file here';
    addLog('Filesharing aktiviert.');
}

function disableFileSharing() {
    fileList.style.backgroundColor = 'transparent';
    fileList.style.opacity = '0.5';
    fileList.querySelector('p').textContent = 'Filesharing unavailable without connection';
    addLog('Filesharing deaktiviert.');
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
        addLog('Keine Verbindung, Datei kann nicht gesendet werden.');
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
        addLog(`Datei-Info gesendet: ${file.name}, ${file.size} Bytes`);

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
        addLog(`Datei gesendet: ${file.name}`);
        fileSentSound.play().catch(err => addLog(`Sound Fehler: ${err}`));
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
    addLog(`Update Fortschritt: ${Math.round(percentage)}%`);
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
        addLog(`Datei geöffnet: ${fileName}`);
    } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        addLog(`Datei heruntergeladen: ${fileName}`);
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
        addChatMessage(`Du: ${message}`);
        messageInput.value = '';
    } else {
        addLog('Chat-Nachricht nicht gesendet: Kanal nicht offen oder leer!');
    }
}

function sendMetronomeState() {
    if (metronomeChannel && metronomeChannel.readyState === 'open') {
        const state = metronome.getState();
        const payload = {
            type: 'metronome_sync',
            data: {
                ...state,
                visible: isMetronomeVisible
            }
        };
        metronomeChannel.send(JSON.stringify(payload));
        addLog(`Metronom-Status gesendet: ${JSON.stringify(payload.data)}`);
    }
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
    document.querySelector('#micVolume').addEventListener('input', () => adjustMicVolume());

    startConnectionButton.addEventListener('click', () => {
        if (startConnectionButton.innerHTML.includes('Verbindung trennen')) {
            disconnect();
        } else {
            startConnection();
        }
    });

    toggleMetronomeButton.addEventListener('click', () => {
        isMetronomeVisible = !isMetronomeVisible;
        metronomeContainer.classList.toggle('visible', isMetronomeVisible);
        toggleMetronomeButton.classList.toggle('active', isMetronomeVisible);

        if (!isMetronomeVisible) {
            metronome.pause();
        }
        sendMetronomeState();
    });

    fileList.addEventListener('dragover', handleDragOver);
    fileList.addEventListener('dragleave', handleDragLeave);
    fileList.addEventListener('drop', handleDrop);
}

function sendMidiMessage(midiData) {
    if (midiChannel && midiChannel.readyState === 'open') {
        midiChannel.send(midiData.buffer); // ArrayBuffer senden
        addLog(`MIDI von Piano gesendet: [${midiData}]`);
    } else {
        addLog('MIDI-Kanal nicht offen, kann nicht senden.');
    }
}

async function init() {
    await populateDeviceOptions();
    await populateMidiOptions();
    const mediaReady = await startMedia();
    if (!mediaReady) {
        addLog('Media-Setup fehlgeschlagen. Check mal Kamera/Mikro.');
    }
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
        onStateChange: (state) => {
            sendMetronomeState();
        }
    });
    metronome.insertInto(metronomeContainer);

    new CamLocalDrag();

    loadSettings();
}

init();
