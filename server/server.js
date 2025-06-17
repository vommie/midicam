const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
let clients = [];

function disconnectAllClients(initiatorWs) {
    console.log('Disconnecting all clients based on request.');
    clients.forEach(client => {
        if (client.ws !== initiatorWs && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({ type: 'disconnected-by-peer' }));
        }
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.terminate();
        }
    });
    clients = [];
    console.log('All clients disconnected, list cleared.');
}

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws) => {
    console.log('New client connected.');

    if (clients.length >= 2) {
        console.log('Too many participants, connection rejected.');
        ws.send(JSON.stringify({ type: 'error', message: 'Maximum number of participants reached' }));
        ws.close();
        return;
    }

    ws.isAlive = true;
    ws.on('pong', heartbeat);

    const clientInfo = { ws: ws };
    clients.push(clientInfo);
    console.log(`Current participants: ${clients.length}`);

    if (clients.length === 2) {
        console.log('Two clients connected. Signaling peer-ready to the first client.');
        clients[0].ws.send(JSON.stringify({ type: 'peer-ready' }));
        clients[1].ws.send(JSON.stringify({ type: 'wait-for-offer' })); // Optional, aber gut für's Debugging
    }

    ws.on('message', (message) => {
        let msg;
        try {
            msg = JSON.parse(message);
        } catch (e) {
            console.error('Failed to parse incoming message:', message.toString());
            return;
        }

        if (msg.type === 'ping') {
            return;
        }

        if (msg.sdp) {
             console.log(`Message received: {type: "${msg.type}"}`);
        } else {
             console.log(`Message received: ${JSON.stringify(msg)}`);
        }

        if (msg.type === 'disconnect' || msg.type === 'disconnect-all') {
            disconnectAllClients(ws);
        } else {
            clients.forEach((client) => {
                if (client.ws !== ws && client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(JSON.stringify(msg));
                }
            });
        }
    });

    ws.on('close', () => {
        console.log('Client connection closed.');
        const index = clients.findIndex(c => c.ws === ws);
        if (index > -1) {
            clients.splice(index, 1);
        }
        console.log(`Remaining participants: ${clients.length}`);

        clients.forEach((client) => {
            if (client.ws.readyState === WebSocket.OPEN) {
                console.log('Informing remaining client about peer disconnection.');
                client.ws.send(JSON.stringify({ type: 'peer-disconnected' }));
            }
        });
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
    });
});

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
        console.log("Terminating dead connection.");
        return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping(function noop() {});
  });
}, 30000);

wss.on('close', function close() {
  clearInterval(interval);
});

console.log('WebSocket server is running on ws://localhost:8080.');
