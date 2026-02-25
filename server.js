const express = require('express');
const { handleMusicNightFlow } = require('./bot');
require('dotenv').config();

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'ALTAZA_123'; // Matches Apps Script
const PORT = process.env.PORT || 3000;

// ======================================
// Webhook Verification (Required by Meta)
// ======================================
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified successfully.');
        res.status(200).send(challenge);
    } else {
        console.warn('❌ Webhook verification failed.', { mode, token });
        res.sendStatus(403);
    }
});

// ======================================
// Incoming Message Handler
// ======================================
app.post('/webhook', async (req, res) => {
    const body = req.body;

    // Acknowledge receipt immediately
    res.status(200).send('EVENT_RECEIVED');

    if (body.object) {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            const webhookEvent = body.entry[0].changes[0].value.messages[0];
            const senderPhone = webhookEvent.from;

            try {
                // Determine message type and extract content
                let incomingText = "";

                if (webhookEvent.type === "text") {
                    incomingText = webhookEvent.text.body;
                } else if (webhookEvent.type === "interactive") {
                    const interactiveObj = webhookEvent.interactive;
                    if (interactiveObj.type === "button_reply") {
                        incomingText = interactiveObj.button_reply.id;
                    } else if (interactiveObj.type === "list_reply") {
                        incomingText = interactiveObj.list_reply.id;
                    }
                }

                if (incomingText) {
                    console.log(`📩 Received message from ${senderPhone}: ${incomingText}`);
                    // Route to pure Music Night Logic
                    await handleMusicNightFlow(senderPhone, incomingText);
                }

            } catch (err) {
                console.error('❌ Error handling webhook event:', err);
            }
        }
    }
});

// ======================================
// Start Server
// ======================================
app.listen(PORT, () => {
    console.log(`🚀 Node.js Server listening on port ${PORT}`);
    console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);
});
