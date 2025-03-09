const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
let clients = []; // Maximale Größe: 2

function disconnectAllClients() {
    console.log('Trenne alle Clients, Junge!');
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'disconnected-by-peer' }));
            client.close();
        }
    });
    clients = [];
    console.log('Alle Clients getrennt, Liste geleert');
}

wss.on('connection', (ws) => {
    console.log('Neuer Client verbunden, Junge!');

    if (clients.length >= 2) {
        console.log('Zu viele Teilnehmer, Verbindung abgelehnt!');
        ws.send(JSON.stringify({ type: 'error', message: 'Maximale Teilnehmerzahl erreicht' }));
        ws.close();
        return;
    }

    clients.push(ws);
    console.log(`Aktuelle Teilnehmer: ${clients.length}`);

    ws.on('message', (message) => {
        const msg = JSON.parse(message);
        console.log('Nachricht empfangen:', msg);

        if (msg.type === 'disconnect-all') {
            disconnectAllClients(); // Explizite Trennung aller Clients
        } else {
            // Normale Weiterleitung an den anderen Client
            clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(msg));
                }
            });
        }
    });

    ws.on('close', () => {
        console.log('Client getrennt, Junge!');
        // Wenn ein Client sich trennt, alle trennen
        disconnectAllClients();
    });

    ws.on('error', (err) => {
        console.error('WebSocket Fehler:', err);
        // Bei Fehler auch alle trennen
        disconnectAllClients();
    });
});

console.log('WebSocket-Server läuft auf ws://localhost:8080, Junge!');
