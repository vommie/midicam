const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
let clients = [];

function disconnectAllClients() {
    console.log('Disconnecting all clients based on request.');
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
            console.error('Failed to parse incoming message:', message.toString());
            return;
        }

        if (msg.sdp) {
             console.log(`Message received: {type: "${msg.type}"}`);
        } else {
             console.log(`Message received: ${JSON.stringify(msg)}`);
        }


        if (msg.type === 'disconnect-all') {
            disconnectAllClients();
        } else {
            clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(msg));
                }
            });
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        const index = clients.indexOf(ws);
        if (index > -1) {
            clients.splice(index, 1);
        }
        console.log(`Remaining participants: ${clients.length}`);

        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                console.log('Informing remaining client about peer disconnection.');
                client.send(JSON.stringify({ type: 'peer-disconnected' }));
            }
        });
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
    });
});

console.log('WebSocket server is running on ws://localhost:8080.');
