// server/server.js
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
let clients =[];

// Reduced heartbeat to 10 seconds to quickly clear out ghost connections
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
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Maximum participants reached. Signaling blocked. If a previous connection dropped, please wait 10 seconds and try again.'
        }));
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

    ws.on('message', (message) => {
        let msg;
        try { msg = JSON.parse(message); } catch (e) {
            console.error('Failed to parse incoming message:', e);
            return;
        }

        // Broadcast to the other client
        clients.forEach((client) => {
            if (client.ws !== ws && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify(msg));
            }
        });
    });

    ws.on('close', (code, reason) => {
        console.log(`Client connection closed. Code: ${code}, Reason: ${reason}`);
        clients = clients.filter(c => c.ws !== ws);

        console.log(`Remaining participants: ${clients.length}`);
        clients.forEach((client) => {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({ type: 'peer-disconnected' }));
            }
        });
    });

    ws.on('error', (error) => {
        console.error('WebSocket error on server:', error);
    });
});

wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

console.log('MidiCam Signaling Server running on port 8080.');
