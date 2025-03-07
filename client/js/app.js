// Grundsetup
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const log = document.getElementById('log');
let pc; // PeerConnection
let dataChannel; // Für MIDI-Daten
let localStream;
let ws; // WebSocket

// Logging-Funktion
function addLog(msg) {
    log.textContent += `${msg}\n`;
}

// WebSocket-Verbindung aufbauen
function initWebSocket() {
    ws = new WebSocket('ws://localhost:8080');
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => addLog('WebSocket connected, Junge!');
    ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
            try {
                handleSignaling(JSON.parse(event.data));
                console.log('GEIIEIEIEL')
            } catch (e) {
                addLog(`JSON Parse Fehler: ${e}`);
            }
        } else {
            addLog(`Unerwartete Daten empfangen: ${event.data}`);
        }
    };
    ws.onerror = (err) => addLog(`WebSocket Fehler: ${err}`);
    ws.onclose = () => addLog('WebSocket zu, Junge!');
}

// Webcam und Audio starten
async function startMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        addLog('Media gestartet, Junge!');
        return true; // Erfolg
    } catch (err) {
        addLog(`Fehler bei Media: ${err}`);
        return false; // Fehler
    }
}

// WebRTC-Verbindung aufbauen
async function startCall() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addLog('WebSocket nicht bereit, Junge!');
        return;
    }

    // Prüfen, ob localStream bereit ist
    if (!localStream) {
        addLog('Media noch nicht bereit, Junge! Warte mal!');
        return;
    }

    // PeerConnection initialisieren
    pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // Lokalen Stream hinzufügen
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // DataChannel für MIDI (nur für Offer-Seite)
    dataChannel = pc.createDataChannel('midiChannel');
    setupDataChannel(dataChannel);

    // DataChannel vom Remote-Peer empfangen (für Answer-Seite)
    pc.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
    };

    // ICE-Kandidaten handlen
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
        }
    };

    // Remote-Stream empfangen
    pc.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
        addLog('Remote-Stream da, Junge!');
    };

    // Offer erstellen
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
            console.log(answer);
            console.log(answer.sdp);
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
                const midiData = Array.from(message.data); // [status, note, velocity]
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

// Initialisierung
async function init() {
    initWebSocket();
    const mediaReady = await startMedia();
    if (!mediaReady) {
        addLog('Media-Setup fehlgeschlagen, Junge! Check mal Kamera/Mikro.');
    }
}

// Los geht’s
init();
