// server/server.js
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
let clients =[];

const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log('Terminating dead connection based on heartbeat.');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 10000);

wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    const clientIp = req.socket.remoteAddress;
    console.log(`New client trying to connect from ${clientIp}.`);

    if (clients.length >= 2) {
        console.log(`Rejected new connection from ${clientIp}: Session full (max 2).`);
        ws.send(JSON.stringify({ type: 'error', message: 'Maximum participants reached.' }));
        ws.close();
        return;
    }

    const clientInfo = { ws: ws, id: Math.random().toString(36).substr(2, 9), ip: clientIp };
    clients.push(clientInfo);
    console.log(`Connection established. Total participants: ${clients.length}`);

    if (clients.length === 2) {
        console.log('Two clients active. Starting Perfect Negotiation handshake.');
        clients[0].ws.send(JSON.stringify({ type: 'role-assignment', polite: false }));
        clients[1].ws.send(JSON.stringify({ type: 'role-assignment', polite: true }));
    }

    ws.on('message', (message, isBinary) => {
        // Broadcast to the other client
        clients.forEach((client) => {
            if (client.ws !== ws && client.ws.readyState === WebSocket.OPEN) {
                // Determine if it's binary (MIDI test over WS) or JSON (Signaling)
                client.ws.send(message, { binary: isBinary });
            }
        });
    });

    ws.on('close', (code, reason) => {
        console.log(`Client connection closed. Code: ${code}`);
        clients = clients.filter(c => c.ws !== ws);
        clients.forEach((client) => {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({ type: 'peer-disconnected' }));
            }
        });
    });

    ws.on('error', (error) => console.error('WebSocket error on server:', error));
});

wss.on('close', () => clearInterval(heartbeatInterval));
console.log('MidiCam Signaling Server running on port 8080.');
