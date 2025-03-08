// Grundsetup
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const log = document.getElementById('log');
const chat = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');
const videoSelect = document.getElementById('videoSelect');
const audioSelect = document.getElementById('audioSelect');
const micVolume = document.getElementById('micVolume');
let pc;
let dataChannel;
let localStream;
let ws;
let audioContext;
let gainNode;

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
        micVolume: micVolume.value
    };
    localStorage.setItem('midiCamDiggaSettings', JSON.stringify(settings));
    addLog('Einstellungen gespeichert, Junge!');
}

// Einstellungen aus localStorage laden
function loadSettings() {
    const savedSettings = localStorage.getItem('midiCamDiggaSettings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        return settings;
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

        // Gespeicherte Werte setzen
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

        addLog('Geräte geladen, Junge!');
    } catch (err) {
        addLog(`Fehler beim Laden der Geräte: ${err}`);
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

        // AudioContext für Lautstärkeregelung
        if (localStream.getAudioTracks().length > 0) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(localStream);
            gainNode = audioContext.createGain();
            gainNode.gain.value = parseFloat(micVolume.value);
            source.connect(gainNode);
            const destination = audioContext.createMediaStreamDestination();
            gainNode.connect(destination);

            // Neuen Stream mit Video und angepasstem Audio erstellen
            const videoTracks = localStream.getVideoTracks();
            const audioTrack = destination.stream.getAudioTracks()[0];
            localStream = new MediaStream([...videoTracks, audioTrack]);
            localVideo.srcObject = localStream;
        }

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
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        if (audioContext) audioContext.close();
    }
    try {
        const videoId = videoSelect.value;
        const audioId = audioSelect.value;
        const constraints = {
            video: videoId ? { deviceId: { exact: videoId } } : false,
            audio: audioId ? { deviceId: { exact: audioId } } : false
        };
        addLog(`Umschalten mit Constraints: ${JSON.stringify(constraints)}`);
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;

        // AudioContext für Lautstärkeregelung
        if (localStream.getAudioTracks().length > 0) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(localStream);
            gainNode = audioContext.createGain();
            gainNode.gain.value = parseFloat(micVolume.value);
            source.connect(gainNode);
            const destination = audioContext.createMediaStreamDestination();
            gainNode.connect(destination);

            // Neuen Stream mit Video und angepasstem Audio erstellen
            const videoTracks = localStream.getVideoTracks();
            const audioTrack = destination.stream.getAudioTracks()[0];
            localStream = new MediaStream([...videoTracks, audioTrack]);
            localVideo.srcObject = localStream;
        }

        // Tracks in bestehender PeerConnection aktualisieren
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

// DataChannel-Setup für MIDI
function setupDataChannel(channel) {
    channel.onopen = () => addLog('MIDI-Kanal offen, Junge!');
    channel.onmessage = (event) => {
        const midiData = JSON.parse(event.data);
        addLog(`MIDI vom anderen empfangen: [${midiData}]`);
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

// MIDI-Zugriff und Senden
async function connectMidi() {
    try {
        const midiAccess = await navigator.requestMIDIAccess();
        midiAccess.inputs.forEach(input => {
            input.onmidimessage = (message) => {
                const midiData = Array.from(message.data);
                addLog(`MIDI lokal gesendet: [${midiData}]`);
                if (dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify(midiData));
                } else {
                    addLog('MIDI-Kanal nicht offen, Junge!');
                }
            };
        });
        addLog('MIDI connected, Junge!');
    } catch (err) {
        addLog(`MIDI-Fehler: ${err}`);
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
    const mediaReady = await startMedia();
    if (!mediaReady) {
        addLog('Media-Setup fehlgeschlagen, Junge! Check mal Kamera/Mikro.');
    }
    adjustMicVolume();
}

init();
