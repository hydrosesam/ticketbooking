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
// Ticket Scanner System (HTML5-QRCode)
// ======================================

// The frontend HTML UI
app.get('/verify', (req, res) => {
    const pin = req.query.pin;
    const ticketId = req.query.id || '';

    // PIN Protection Screen
    if (pin !== '1234') {
        return res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Staff Access</title>
                <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Outfit', sans-serif; background: #1a237e; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; color: white; }
                    .card { background: white; border-radius: 24px; padding: 40px 30px; width: 90%; max-width: 350px; text-align: center; color: #333; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
                    h2 { color: #1a237e; font-weight: 800; margin-bottom: 5px; }
                    input { width: 100%; padding: 15px; border: 2px solid #eee; border-radius: 12px; font-size: 24px; text-align: center; letter-spacing: 12px; margin: 20px 0; box-sizing: border-box; }
                    button { width: 100%; padding: 15px; background: #1a237e; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>🔐 Staff Login</h2>
                    <p style="color:#666; font-size:14px;">Enter PIN to unlock scanner</p>
                    <form method="GET" action="/verify">
                        <input type="password" name="pin" placeholder="••••" maxlength="6" autofocus required>
                        <button type="submit">Unlock Scanner</button>
                    </form>
                </div>
            </body>
            </html>
        `);
    }

    // Main Scanner UI
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
            <title>QR Scanner</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
            <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
            <style>
                :root { --primary: #1a237e; --success: #2e7d32; --warning: #ff6d00; --bg: #f4f7fa; }
                body { font-family: 'Outfit', sans-serif; background: var(--bg); margin: 0; padding: 10px; display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; }
                .card { background: white; border-radius: 28px; box-shadow: 0 15px 50px rgba(0,0,0,0.1); width: 100%; max-width: 450px; overflow: hidden; margin-top: 10px; position:relative; display: none; }
                .header { background: linear-gradient(135deg, #1a237e 0%, #311b92 100%); color: white; padding: 30px 20px; text-align: center; }
                .status-badge { padding: 12px 25px; border-radius: 50px; font-weight: 800; font-size: 14px; text-transform: uppercase; margin-top: 15px; display: inline-flex; align-items: center; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
                .valid { background: #4caf50; color: white; }
                .already-used { background: var(--warning); color: white; }
                .content { padding: 25px; }
                .action-btn { width: 100%; padding: 20px; background: var(--primary); color: white; border: none; border-radius: 20px; font-size: 18px; font-weight: 800; margin-top: 25px; cursor: pointer; display: block; text-align: center; }
                #scanner-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000; z-index: 10000; display: flex; flex-direction: column; }
                #reader { width: 100%; flex: 1; }
                .q-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; }
                .q-box { background: #f8faff; padding: 18px; border-radius: 20px; text-align: center; border: 1px solid #e3e9ff; }
                .q-val { font-size: 32px; font-weight: 800; color: var(--primary); display: block; }
                .q-label { font-size: 11px; color: #78909c; text-transform: uppercase; }
                .item { display: flex; justify-content: space-between; padding: 15px 5px; border-bottom: 1px solid #eee; }
                .item span:first-child { color: #90a4ae; font-size: 14px; }
                .item span:last-child { font-weight: 700; color: #333; }
                .members { background: #f0f4ff; padding: 15px; border-radius: 18px; margin-top: 15px; }
                .chip { display: inline-block; background: white; color: var(--primary); padding: 6px 14px; border-radius: 12px; font-size: 13px; margin: 4px; font-weight: 600; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
                .already-scanned-box { background: #fff3e0; border: 2px solid var(--warning); padding: 20px; border-radius: 20px; color: #e65100; margin-top: 15px; text-align: center; }
                #confetti-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(46, 125, 50, 0.95); z-index: 9999; display: none; flex-direction: column; justify-content: center; align-items: center; color: white; text-align: center; }
                .success-circle { width: 100px; height: 100px; border-radius: 50%; background: white; color: #2e7d32; display: flex; justify-content: center; align-items: center; font-size: 50px; margin-bottom: 20px; animation: pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
                @keyframes pop { 0% { transform: scale(0); } 100% { transform: scale(1); } }
            </style>
        </head>
        <body>
            <div id="confetti-overlay">
                <div class="success-circle">✓</div>
                <h1 style="margin:0">TICKET CONFIRMED</h1>
                <p>Entry Granted Successfully</p>
                <button class="action-btn" style="width:200px; background:#607d8b; margin-top:30px;" onclick="startScanner()">SCAN NEXT</button>
            </div>

            <!-- Scanner Camera -->
            <div id="scanner-overlay">
                <div id="reader"></div>
                <div style="padding: 20px; background: #000; text-align: center;">
                    <p style="color:#aaa; font-size:12px;">Target QR Code within the frame</p>
                </div>
            </div>

            <!-- Result Card -->
            <div class="card" id="result-card">
                <div class="header" id="card-header">
                    <h2 style="margin:0; font-size:24px;">Music Night 2026</h2>
                    <div id="status-badge" class="status-badge valid">🛡️ VALID TICKET</div>
                </div>
                <div class="content">
                    <div class="q-grid">
                        <div class="q-box"><span class="q-val" id="res-qty">-</span><span class="q-label">Total Seats</span></div>
                        <div class="q-box"><span class="q-val" id="res-cat" style="font-size:20px;">-</span><span class="q-label">Category</span></div>
                    </div>
                    <div class="item"><span>Booking ID</span><span id="res-booking">-</span></div>
                    <div class="item"><span>Phone</span><span id="res-phone">-</span></div>

                    <div class="members">
                        <p style="margin:0 0 10px; font-size:12px; font-weight:800; color:var(--primary); text-transform:uppercase;">Registered Patrons</p>
                        <div id="res-members"></div>
                    </div>

                    <div id="already-box" class="already-scanned-box" style="display:none;">
                        <p style="margin:0; font-weight:800; font-size:18px;">ACCESS DENIED</p>
                        <p style="margin:5px 0; font-size:14px;">This ticket was verified at:<br><strong id="res-time"></strong></p>
                    </div>

                    <div id="confirm-box" style="margin-top:20px; text-align:center;">
                         <!-- Only show if ticket is valid -->
                    </div>

                    <button class="action-btn" style="background:#607d8b;" onclick="startScanner()">SCAN NEXT TICKET</button>
                </div>
            </div>

            <script>
                let html5QrCode = null;

                function startScanner() {
                    document.getElementById('confetti-overlay').style.display = 'none';
                    document.getElementById('result-card').style.display = 'none';
                    document.getElementById('scanner-overlay').style.display = 'flex';
                    
                    if (!html5QrCode) {
                        html5QrCode = new Html5Qrcode("reader");
                    }
                    
                    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
                    html5QrCode.start({ facingMode: "environment" }, config, async (decodedText) => {
                        try {
                            const url = new URL(decodedText);
                            const tId = url.searchParams.get("id");
                            if (tId) {
                                html5QrCode.stop().then(() => {
                                    document.getElementById('scanner-overlay').style.display = 'none';
                                    processTicket(tId);
                                });
                            }
                        } catch(e) {}
                    });
                }

                async function processTicket(tId) {
                    try {
                        const response = await fetch('/verify/scan', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ticketId: tId })
                        });
                        const data = await response.json();
                        
                        document.getElementById('result-card').style.display = 'block';
                        
                        if (!response.ok) {
                            alert(data.error || "Ticket not found");
                            startScanner();
                            return;
                        }

                        // Populate Data
                        document.getElementById('res-qty').innerText = data.ticket.quantity;
                        document.getElementById('res-cat').innerText = data.ticket.category;
                        document.getElementById('res-booking').innerText = data.ticket.booking_no;
                        document.getElementById('res-phone').innerText = data.ticket.phone;
                        
                        // Render Members
                        let membersHtml = '';
                        let membersArr = [];
                        try { membersArr = JSON.parse(data.ticket.members); } catch(e){}
                        membersArr.forEach(m => {
                            membersHtml += \`<span class="chip">\${m}</span>\`;
                        });
                        document.getElementById('res-members').innerHTML = membersHtml;

                        if (data.status === 'already_scanned') {
                            document.getElementById('card-header').style.background = 'linear-gradient(135deg, #e65100 0%, #ff9800 100%)';
                            document.getElementById('status-badge').className = 'status-badge already-used';
                            document.getElementById('status-badge').innerHTML = '🛑 ALREADY SCANNED';
                            document.getElementById('already-box').style.display = 'block';
                            document.getElementById('confirm-box').style.display = 'none';
                            document.getElementById('res-time').innerText = data.ticket.entry_status;
                        } else {
                            document.getElementById('card-header').style.background = 'linear-gradient(135deg, #1a237e 0%, #311b92 100%)';
                            document.getElementById('status-badge').className = 'status-badge valid';
                            document.getElementById('status-badge').innerHTML = '🛡️ VALID TICKET';
                            document.getElementById('already-box').style.display = 'none';
                            document.getElementById('confirm-box').style.display = 'block';
                            document.getElementById('confirm-box').innerHTML = \`
                                <button class="action-btn" onclick="confirmEntrance('\${tId}')">CONFIRM ENTRANCE</button>
                            \`;
                        }
                    } catch(err) {
                        alert("Network Error");
                        startScanner();
                    }
                }

                async function confirmEntrance(tId) {
                    try {
                        const response = await fetch('/verify/confirm', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ticketId: tId })
                        });
                        if (response.ok) {
                            document.getElementById('confetti-overlay').style.display = 'flex';
                        } else {
                            alert("Failed to confirm entrance");
                        }
                    } catch(e) {
                         alert("Network Error");
                    }
                }

                // Auto-start scanner
                window.onload = startScanner;
            </script>
        </body>
        </html>
    `);
});

// The backend API that checks the DB
app.post('/verify/scan', async (req, res) => {
    const { ticketId } = req.body;
    if (!ticketId) return res.status(400).json({ error: 'Missing ticket ID' });

    try {
        const rows = await db.query("SELECT * FROM mn_bookings WHERE ticket_id = ?", [ticketId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Ticket not found in database' });

        const ticket = rows[0];
        if (ticket.entry_status) {
            return res.status(200).json({ status: 'already_scanned', ticket });
        } else {
            return res.status(200).json({ status: 'valid', ticket });
        }
    } catch (err) {
        console.error('Verify Scan Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/verify/confirm', async (req, res) => {
    const { ticketId } = req.body;
    if (!ticketId) return res.status(400).json({ error: 'Missing ticket ID' });

    try {
        const nowStr = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Muscat' });
        const entryMsg = "Checked-In: " + nowStr;

        await db.query("UPDATE mn_bookings SET entry_status = ? WHERE ticket_id = ?", [entryMsg, ticketId]);
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('Verify Confirm Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ======================================
// Start Server
// ======================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Node.js Server listening on port ${PORT}`);
    console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);
});
