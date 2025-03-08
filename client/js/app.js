// Grundsetup
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const log = document.getElementById('log');
const chat = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');
const videoSelect = document.getElementById('videoSelect');
const audioSelect = document.getElementById('audioSelect');
const micVolume = document.getElementById('micVolume');
const midiSelect = document.getElementById('midiSelect');
const midiOutputSelect = document.getElementById('midiOutputSelect'); // Neuer MIDI-Ausgang-Dropdown
let pc;
let dataChannel;
let localStream;
let ws;
let audioContext;
let gainNode;
let currentVideoId = '';
let currentAudioId = '';
let midiAccess = null;

// Logging-Funktion
function addLog(msg) {
    log.textContent += `${msg}\n`;
}

// Chat-Nachricht anzeigen
function addChatMessage(msg) {
    chat.textContent += `${msg}\n`;
    chat.scrollTop = chat.scrollHeight;
}

// WebSocket-Verbindung aufbauen
function initWebSocket() {
    ws = new WebSocket('ws://localhost:8080');
    ws.onopen = () => addLog('WebSocket connected, Junge!');
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'chat') {
            addChatMessage(`Anderer Digga: ${data.message}`);
        } else {
            handleSignaling(data);
        }
    };
    ws.onerror = (err) => addLog(`WebSocket Fehler: ${err}`);
    ws.onclose = () => addLog('WebSocket zu, Junge!');
}

// Einstellungen im localStorage speichern
function saveSettings() {
    const settings = {
        videoDeviceId: videoSelect.value,
        audioDeviceId: audioSelect.value,
        micVolume: micVolume.value,
        midiDeviceId: midiSelect.value,
        midiOutputDeviceId: midiOutputSelect.value
    };
    localStorage.setItem('midiCamDiggaSettings', JSON.stringify(settings));
    addLog('Einstellungen gespeichert, Junge!');
}

// Einstellungen aus localStorage laden
function loadSettings() {
    const savedSettings = localStorage.getItem('midiCamDiggaSettings');
    if (savedSettings) {
        return JSON.parse(savedSettings);
    }
    return null;
}

// Geräte auflisten und Dropdowns befüllen
async function populateDeviceOptions() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const audioDevices = devices.filter(device => device.kind === 'audioinput');

        videoSelect.innerHTML = videoDevices.map(device =>
            `<option value="${device.deviceId}">${device.label || 'Kamera ' + device.deviceId.slice(0, 5)}</option>`
        ).join('');
        audioSelect.innerHTML = audioDevices.map(device =>
            `<option value="${device.deviceId}">${device.label || 'Mikrofon ' + device.deviceId.slice(0, 5)}</option>`
        ).join('');

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

        addLog('Geräte geladen, Junge!');
    } catch (err) {
        addLog(`Fehler beim Laden der Geräte: ${err}`);
    }
}

// MIDI-Geräte auflisten und Dropdowns befüllen
async function populateMidiOptions() {
    try {
        midiAccess = await navigator.requestMIDIAccess();
        const inputs = Array.from(midiAccess.inputs.values());
        const outputs = Array.from(midiAccess.outputs.values());

        // MIDI-Eingänge
        midiSelect.innerHTML = inputs.map(input =>
            `<option value="${input.id}">${input.name || 'MIDI-In ' + input.id.slice(0, 5)}</option>`
        ).join('') || '<option value="">Keine MIDI-Eingänge</option>';

        // MIDI-Ausgänge
        midiOutputSelect.innerHTML = outputs.map(output =>
            `<option value="${output.id}">${output.name || 'MIDI-Out ' + output.id.slice(0, 5)}</option>`
        ).join('') || '<option value="">Keine MIDI-Ausgänge</option>';

        const settings = loadSettings();
        if (settings && settings.midiDeviceId && inputs.some(input => input.id === settings.midiDeviceId)) {
            midiSelect.value = settings.midiDeviceId;
        } else {
            midiSelect.value = inputs[0]?.id || '';
        }
        if (settings && settings.midiOutputDeviceId && outputs.some(output => output.id === settings.midiOutputDeviceId)) {
            midiOutputSelect.value = settings.midiOutputDeviceId;
        } else {
            midiOutputSelect.value = outputs[0]?.id || '';
        }

        // Listener für Geräteänderungen
        midiAccess.onstatechange = (event) => {
            const inputs = Array.from(midiAccess.inputs.values());
            const outputs = Array.from(midiAccess.outputs.values());
            const selectedInputId = midiSelect.value;
            const selectedOutputId = midiOutputSelect.value;

            midiSelect.innerHTML = inputs.map(input =>
                `<option value="${input.id}">${input.name || 'MIDI-In ' + input.id.slice(0, 5)}</option>`
            ).join('') || '<option value="">Keine MIDI-Eingänge</option>';
            midiOutputSelect.innerHTML = outputs.map(output =>
                `<option value="${output.id}">${output.name || 'MIDI-Out ' + output.id.slice(0, 5)}</option>`
            ).join('') || '<option value="">Keine MIDI-Ausgänge</option>';

            if (inputs.some(input => input.id === selectedInputId)) {
                midiSelect.value = selectedInputId;
            } else {
                midiSelect.value = inputs[0]?.id || '';
            }
            if (outputs.some(output => output.id === selectedOutputId)) {
                midiOutputSelect.value = selectedOutputId;
            } else {
                midiOutputSelect.value = outputs[0]?.id || '';
            }

            addLog(`MIDI-Geräte aktualisiert: ${event.port.state} - ${event.port.name}`);
            connectMidi(); // Eingänge neu verbinden
        };

        addLog('MIDI-Geräte geladen, Junge!');
    } catch (err) {
        addLog(`Fehler beim Laden der MIDI-Geräte: ${err}`);
    }
}

// Webcam und Audio starten
async function startMedia() {
    try {
        const videoId = videoSelect.value || true;
        const audioId = audioSelect.value || true;
        const constraints = {
            video: videoId && videoId !== 'true' ? { deviceId: { exact: videoId } } : true,
            audio: audioId && audioId !== 'true' ? { deviceId: { exact: audioId } } : true
        };
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

        addLog('Media gestartet, Junge!');
        saveSettings();
        return true;
    } catch (err) {
        addLog(`Fehler bei Media: ${err}`);
        return false;
    }
}

// Media-Stream umschalten
async function switchMedia() {
    const newVideoId = videoSelect.value;
    const newAudioId = audioSelect.value;
    const videoChanged = newVideoId !== currentVideoId;
    const audioChanged = newAudioId !== currentAudioId;

    if (!videoChanged && !audioChanged) {
        addLog('Keine Änderung, Junge!');
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
        addLog('Media umgeschaltet, Junge!');
        saveSettings();
    } catch (err) {
        addLog(`Fehler beim Umschalten: ${err}`);
    }
}

// Mikrofon-Lautstärke anpassen
function adjustMicVolume() {
    if (gainNode) {
        gainNode.gain.value = parseFloat(micVolume.value);
        addLog(`Mikrofon-Lautstärke auf ${micVolume.value} gesetzt, Junge!`);
        saveSettings();
    }
}

// MIDI-Zugriff und Senden
async function connectMidi() {
    if (!midiAccess) {
        addLog('MIDI-Zugriff nicht initialisiert, Junge! Warte mal.');
        return;
    }
    try {
        const selectedMidiId = midiSelect.value;
        const inputs = Array.from(midiAccess.inputs.values());

        // Alte Listener entfernen
        inputs.forEach(input => input.onmidimessage = null);

        // Listener nur für ausgewähltes Gerät setzen
        const selectedInput = inputs.find(input => input.id === selectedMidiId);
        if (selectedInput) {
            selectedInput.onmidimessage = (message) => {
                const midiData = Array.from(message.data);
                addLog(`MIDI lokal gesendet: [${midiData}]`);
                if (dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify(midiData));
                } else {
                    addLog('MIDI-Kanal nicht offen, Junge!');
                }
            };
            addLog(`MIDI-Eingang connected zu: ${selectedInput.name}, Junge!`);
        } else {
            addLog('Kein MIDI-Eingang ausgewählt oder verfügbar, Junge!');
        }
        saveSettings();
    } catch (err) {
        addLog(`MIDI-Fehler: ${err}`);
    }
}

// WebRTC-Verbindung aufbauen
async function startCall() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addLog('WebSocket nicht bereit, Junge!');
        return;
    }
    if (!localStream) {
        addLog('Media noch nicht bereit, Junge! Warte mal!');
        return;
    }
    pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    dataChannel = pc.createDataChannel('midiChannel');
    setupDataChannel(dataChannel);
    pc.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
    };
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
        }
    };
    pc.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
        addLog('Remote-Stream da, Junge!');
    };
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
        addLog('Offer gesendet, Junge!');
    } catch (err) {
        addLog(`Fehler bei Offer: ${err}`);
    }
}

// DataChannel-Setup für MIDI (Empfang und Ausgabe)
function setupDataChannel(channel) {
    channel.onopen = () => addLog('MIDI-Kanal offen, Junge!');
    channel.onmessage = (event) => {
        const midiData = JSON.parse(event.data);
        addLog(`MIDI vom anderen empfangen: [${midiData}]`);

        // MIDI-Daten an ausgewähltes Ausgabegerät senden
        if (midiAccess) {
            const selectedOutputId = midiOutputSelect.value;
            const outputs = Array.from(midiAccess.outputs.values());
            const selectedOutput = outputs.find(output => output.id === selectedOutputId);
            if (selectedOutput) {
                selectedOutput.send(midiData); // MIDI-Daten an Ausgabegerät senden
                addLog(`MIDI an ${selectedOutput.name} gesendet, Junge!`);
            } else {
                addLog('Kein MIDI-Ausgang ausgewählt oder verfügbar, Junge!');
            }
        }
    };
    channel.onerror = (err) => addLog(`DataChannel Fehler: ${err}`);
    channel.onclose = () => addLog('MIDI-Kanal zu, Junge!');
}

// Signaling-Nachrichten handlen
async function handleSignaling(message) {
    if (!pc) {
        addLog('Kein PeerConnection, Junge! Starte erst den Call.');
        return;
    }
    try {
        if (message.type === 'offer') {
            await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp });
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
            addLog('Answer gesendet, Junge!');
        } else if (message.type === 'answer') {
            await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp });
            addLog('Answer empfangen, Junge!');
        } else if (message.type === 'candidate') {
            await pc.addIceCandidate(message.candidate);
            addLog('ICE-Kandidat hinzugefügt!');
        }
    } catch (err) {
        addLog(`Signaling-Fehler: ${err}`);
    }
}

// Chat-Nachricht senden
function sendChatMessage() {
    const message = messageInput.value.trim();
    if (message && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'chat', message: message }));
        addChatMessage(`Du: ${message}`);
        messageInput.value = '';
    } else {
        addLog('Chat-Nachricht nicht gesendet: WebSocket nicht offen oder leer!');
    }
}

// Initialisierung
async function init() {
    initWebSocket();
    await populateDeviceOptions();
    await populateMidiOptions(); // MIDI-Ein-/Ausgänge initial laden
    const mediaReady = await startMedia();
    if (!mediaReady) {
        addLog('Media-Setup fehlgeschlagen, Junge! Check mal Kamera/Mikro.');
    }
    adjustMicVolume();
    await connectMidi(); // MIDI-Eingang initial verbinden
}

init();
