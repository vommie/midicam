const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
let clients = [];

function disconnectAllClients() {
    console.log('Disconnecting all clients.');
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'disconnected-by-peer' }));
            client.close();
        }
    });
    clients = [];
    console.log('All clients disconnected, list cleared.');
}

wss.on('connection', (ws) => {
    console.log('New client connected.');

    if (clients.length >= 2) {
        console.log('Too many participants, connection rejected.');
        ws.send(JSON.stringify({ type: 'error', message: 'Maximum number of participants reached' }));
        ws.close();
        return;
    }

    clients.push(ws);
    console.log(`Current participants: ${clients.length}`);

    ws.on('message', (message) => {
        let msg;
        try {
            msg = JSON.parse(message);
        } catch (e) {
            console.error('Failed to parse incoming message:', message);
            return;
        }

        console.log('Message received:', msg);

        if (msg.type === 'disconnect-all') {
            disconnectAllClients();
        } else {
            clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    console.log(`Forwarding message to peer: ${JSON.stringify(msg)}`);
                    client.send(JSON.stringify(msg));
                }
            });
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        disconnectAllClients();
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        disconnectAllClients();
    });
});

console.log('WebSocket server is running on ws://localhost:8080.');
