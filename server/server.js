const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
    console.log('Neuer Digga connected!');
    ws.on('message', (message) => {
        // Buffer in String umwandeln
        const messageString = message.toString('utf8');
        console.log('Empfangene Nachricht:', messageString, typeof messageString);

        try {
            const data = JSON.parse(messageString);
            // Weiterleitung an alle anderen Clients
            wss.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data)); // Sende als String zurück
                    console.log("sending message:", data.type);
                }
            });
        } catch (e) {
            console.log('Fehler beim Parsen der Nachricht:', e);
        }
    });
});
