const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let clients = [];

wss.on('connection', (ws) => {
    console.log('Neuer Client verbunden, Junge!');
    clients.push(ws);

    ws.on('message', (message) => {
        const msg = JSON.parse(message);
        console.log('Nachricht empfangen:', msg);

        // Nachricht an den anderen Client weiterleiten
        clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(msg));
            }
        });
    });

    ws.on('close', () => {
        console.log('Client getrennt, Junge!');
        clients = clients.filter(client => client !== ws);
    });

    ws.on('error', (err) => {
        console.error('WebSocket Fehler:', err);
    });
});

console.log('WebSocket-Server läuft auf ws://localhost:8080, Junge!');
