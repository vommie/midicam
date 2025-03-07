// server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
    console.log('Neuer Digga connected!');
    ws.on('message', (message) => {
        // Buffer in String umwandeln
        const messageString = message.toString('utf8');
        console.log('Empfangene Nachricht:', messageString, typeof messageString);
        wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(messageString);
                console.log("sending message");
            }
        });
    });
});
