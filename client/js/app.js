// Grundsetup
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const log = document.getElementById('log');
const chat = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');
const videoSelect = document.getElementById('videoSelect'); // Neuer Video-Dropdown
const audioSelect = document.getElementById('audioSelect'); // Neuer Audio-Dropdown
let pc;
let dataChannel;
let localStream;
let ws;

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

        addLog('Geräte geladen, Junge!');
    } catch (err) {
        addLog(`Fehler beim Laden der Geräte: ${err}`);
    }
}

// Webcam und Audio starten
async function startMedia() {
    try {
        const videoId = videoSelect.value || true; // Standard: erste Kamera
        const audioId = audioSelect.value || true; // Standard: erstes Mikrofon
        localStream = await navigator.mediaDevices.getUserMedia({
            video: videoId === 'true' ? true : { deviceId: { exact: videoId } },
            audio: audioId === 'true' ? true : { deviceId: { exact: audioId } }
        });
        localVideo.srcObject = localStream;
        addLog('Media gestartet, Junge!');
        return true;
    } catch (err) {
        addLog(`Fehler bei Media: ${err}`);
        return false;
    }
}

// Media-Stream umschalten
async function switchMedia() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop()); // Alte Tracks stoppen
    }
    try {
        const videoId = videoSelect.value;
        const audioId = audioSelect.value;
        localStream = await navigator.mediaDevices.getUserMedia({
            video: videoId ? { deviceId: { exact: videoId } } : false,
            audio: audioId ? { deviceId: { exact: audioId } } : false
        });
        localVideo.srcObject = localStream;

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
    } catch (err) {
        addLog(`Fehler beim Umschalten: ${err}`);
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
    await populateDeviceOptions(); // Geräte laden vor Media-Start
    const mediaReady = await startMedia();
    if (!mediaReady) {
        addLog('Media-Setup fehlgeschlagen, Junge! Check mal Kamera/Mikro.');
    }
}

init();
