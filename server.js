const express = require('express');
const { handleMusicNightFlow } = require('./bot');
const db = require('./database');
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
// Web Dashboard (Real-Time Availability)
// ======================================
app.get('/dashboard', async (req, res) => {
    // Simple PIN protection
    if (req.query.pin !== '1234') {
        return res.status(401).send('Unauthorized. Please provide the correct ?pin URL parameter.');
    }

    try {
        const inventoryRows = await db.query("SELECT * FROM mn_inventory");
        const bookingRows = await db.query("SELECT * FROM mn_bookings ORDER BY timestamp DESC LIMIT 50");

        let totalRevenue = 0;
        let inventoryHtml = '';

        inventoryRows.forEach(row => {
            const available = row.total_seats - row.booked_seats;
            const percentage = row.total_seats > 0 ? (row.booked_seats / row.total_seats) * 100 : 0;
            inventoryHtml += `
                <div class="card">
                    <h3>${row.category}</h3>
                    <p>Available: <strong>${available}</strong> / ${row.total_seats}</p>
                    <div class="progress-bar-container">
                        <div class="progress-bar ${percentage > 90 ? 'danger' : ''}" style="width: ${percentage}%"></div>
                    </div>
                </div>
            `;
        });

        let bookingsHtml = bookingRows.map(b => {
            totalRevenue += parseFloat(b.amount);
            return `
                <tr>
                    <td>${b.booking_no}</td>
                    <td>${b.phone}</td>
                    <td>${b.category}</td>
                    <td>${b.quantity}</td>
                    <td>OMR ${b.amount}</td>
                </tr>
            `;
        }).join('');

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Eventz Cloud - Live Ticket Dashboard</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 20px; color: #333; }
                    h1, h2 { color: #2c3e50; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ddd; padding-bottom: 10px; margin-bottom: 20px; }
                    .revenue-badge { background-color: #27ae60; color: white; padding: 10px 20px; border-radius: 8px; font-size: 1.2em; font-weight: bold; }
                    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
                    .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    .card h3 { margin-top: 0; color: #e74c3c; }
                    .progress-bar-container { width: 100%; background-color: #ecf0f1; border-radius: 4px; overflow: hidden; margin-top: 10px; }
                    .progress-bar { height: 10px; background-color: #3498db; }
                    .progress-bar.danger { background-color: #e74c3c; }
                    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background-color: #2c3e50; color: white; }
                    tr:hover { background-color: #f1f1f1; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🎫 Music Night 2026 Live Dashboard</h1>
                    <div class="revenue-badge">Total Revenue: OMR ${totalRevenue.toFixed(2)}</div>
                </div>
                
                <h2>Live Seat Availability</h2>
                <div class="grid">
                    ${inventoryHtml}
                </div>

                <h2>Recent Bookings (Last 50)</h2>
                <table>
                    <thead>
                        <tr><th>Booking No</th><th>Phone</th><th>Category</th><th>Qty</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                        ${bookingsHtml}
                    </tbody>
                </table>
            </body>
            </html>
        `;
        res.send(html);
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.status(500).send('Internal Server Error loading dashboard.');
    }
});

// ======================================
// Start Server
// ======================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Node.js Server listening on port ${PORT}`);
    console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);
});
