const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { handleMusicNightFlow, authorizeAndSendTicket, generateAdminOTP } = require('./bot');
const db = require('./database');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve the uploads folder statically so dashboard can show slips
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'ALTAZA_123';
const PORT = process.env.PORT || 3000;

// ======================================
// Authentication System
// ======================================

function requireAuth(req, res, next) {
    if (req.cookies.auth === 'true') {
        next();
    } else {
        res.redirect(`/login-phone?next=${encodeURIComponent(req.path)}`);
    }
}

app.get('/login-phone', (req, res) => {
    const error = req.query.error ? '<p style="color:#e74c3c; font-size:14px; font-weight:600;">Unauthorized phone number.</p>' : '';
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Admin Login - Step 1</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Outfit', sans-serif; background: linear-gradient(135deg, #1a237e 0%, #311b92 100%); display:flex; justify-content:center; align-items:center; min-height:100vh; margin:0; }
                .box { background:white; padding:40px; border-radius:30px; width:90%; max-width:400px; text-align:center; box-shadow:0 20px 50px rgba(0,0,0,0.3); }
                input { width:100%; padding:15px; border:2px solid #eee; border-radius:15px; font-size:18px; text-align:center; margin-bottom:20px; box-sizing:border-box; }
                button { width:100%; padding:15px; background:#1a237e; color:white; border:none; border-radius:15px; font-weight:700; cursor:pointer; }
            </style>
        </head>
        <body>
            <div class="box">
                <h2 style="color:#1a237e;">Admin Portal</h2>
                <p style="color:#666;">Enter your registered WhatsApp number to receive an access code.</p>
                ${error}
                <form action="/login-phone" method="POST">
                    <input type="text" name="phone" placeholder="968XXXXXXXX" required autofocus>
                    <button type="submit">SEND OTP CODE</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/login-phone', async (req, res) => {
    const { phone } = req.body;
    const admin = await db.query("SELECT * FROM mn_admins WHERE phone = ? AND is_active = TRUE", [phone]);
    if (admin.length > 0) {
        await generateAdminOTP(phone);
        res.redirect(`/login-otp?phone=${phone}`);
    } else {
        res.redirect('/login-phone?error=true');
    }
});

app.get('/login-otp', (req, res) => {
    const phone = req.query.phone;
    const error = req.query.error ? '<p style="color:#e74c3c; font-size:14px; font-weight:600;">Invalid or expired code.</p>' : '';
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Admin Login - Step 2</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Outfit', sans-serif; background: linear-gradient(135deg, #1a237e 0%, #311b92 100%); display:flex; justify-content:center; align-items:center; min-height:100vh; margin:0; }
                .box { background:white; padding:40px; border-radius:30px; width:90%; max-width:400px; text-align:center; box-shadow:0 20px 50px rgba(0,0,0,0.3); }
                input { width:100%; padding:15px; border:2px solid #eee; border-radius:15px; font-size:24px; text-align:center; letter-spacing:8px; margin-bottom:20px; box-sizing:border-box; }
                button { width:100%; padding:15px; background:#00c853; color:white; border:none; border-radius:15px; font-weight:700; cursor:pointer; }
            </style>
        </head>
        <body>
            <div class="box">
                <h2 style="color:#1a237e;">Verify Identity</h2>
                <p style="color:#666;">Enter the 6-digit code sent to<br><strong>${phone}</strong> via WhatsApp.</p>
                ${error}
                <form action="/login-otp" method="POST">
                    <input type="hidden" name="phone" value="${phone}">
                    <input type="text" name="code" placeholder="000000" maxlength="6" required autofocus>
                    <button type="submit">VERIFY & ENTER</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/login-otp', async (req, res) => {
    const { phone, code } = req.body;
    const rows = await db.query("SELECT * FROM mn_otp WHERE phone = ? AND code = ? AND expires_at > NOW()", [phone, code]);

    if (rows.length > 0) {
        await db.query("DELETE FROM mn_otp WHERE phone = ?", [phone]);
        res.cookie('auth', 'true', { maxAge: 8 * 60 * 60 * 1000, httpOnly: true });
        res.redirect('/dashboard');
    } else {
        res.redirect(`/login-otp?phone=${phone}&error=true`);
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth');
    res.redirect('/login-phone');
});

// Admin API: Update Inventory
app.post('/admin/inventory/update', requireAuth, async (req, res) => {
    const { category, total_seats } = req.body;
    if (!category || total_seats === undefined) return res.status(400).json({ error: "Missing data" });

    try {
        await db.query("UPDATE mn_inventory SET total_seats = ? WHERE category = ?", [total_seats, category]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Approval Endpoint
app.post('/admin/approve', requireAuth, async (req, res) => {
    const { bookingNo } = req.body;
    if (!bookingNo) return res.status(400).json({ error: "Missing Booking No" });

    const result = await authorizeAndSendTicket(bookingNo);
    if (result.success) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: result.error });
    }
});

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

    res.status(200).send('EVENT_RECEIVED');

    if (body.object) {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            const webhookEvent = body.entry[0].changes[0].value.messages[0];
            const senderPhone = webhookEvent.from;

            try {
                // Pass the full webhook event object to the bot flow
                //bot.js will determine how to handle text vs media
                console.log(`📩 Webhook Event from ${senderPhone}: ${webhookEvent.type}`);
                await handleMusicNightFlow(senderPhone, webhookEvent);
            } catch (err) {
                console.error('❌ Error handling webhook event:', err);
            }
        }
    }
});

// ======================================
// Web Dashboard (Real-Time Availability)
// ======================================
app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const inventoryRows = await db.query("SELECT * FROM mn_inventory");
        const bookingRows = await db.query("SELECT * FROM mn_bookings ORDER BY timestamp DESC");
        const pendingRows = await db.query("SELECT * FROM mn_bookings WHERE payment_status = 'pending' ORDER BY timestamp DESC");
        const approvedRows = await db.query("SELECT * FROM mn_bookings WHERE payment_status = 'approved' ORDER BY timestamp DESC");
        const verifiedRows = await db.query("SELECT * FROM mn_bookings WHERE entry_status IS NOT NULL ORDER BY entry_status DESC");

        let totalRevenue = 0;
        bookingRows.forEach(b => totalRevenue += parseFloat(b.amount || 0));

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0">
    <title>Eventz Cloud - Admin Premium</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
    <style>
        :root {
            --primary: #1a237e;
            --accent: #311b92;
            --success: #00c853;
            --warning: #ffab00;
            --danger: #ff1744;
            --bg: #f8faff;
            --glass: rgba(255, 255, 255, 0.95);
            --shadow: 0 10px 30px rgba(26, 35, 126, 0.08);
        }

        body {
            font-family: 'Outfit', sans-serif;
            background: var(--bg);
            margin: 0;
            padding: 0;
            color: #1e293b;
            min-height: 100vh;
        }

        /* Sidebar & Layout */
        .layout { display: flex; min-height: 100vh; }
        .sidebar { width: 260px; background: var(--primary); color: white; display: flex; flex-direction: column; position: fixed; height: 100vh; z-index: 100; transition: 0.3s; }
        .main-content { flex: 1; margin-left: 260px; padding: 40px; transition: 0.3s; }

        .logo-area { padding: 30px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .logo-area h2 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 1px; }

        .nav { padding: 20px 0; flex: 1; }
        .nav-item { 
            padding: 15px 30px; 
            display: flex; 
            align-items: center; 
            gap: 15px; 
            color: rgba(255,255,255,0.7); 
            text-decoration: none; 
            cursor: pointer;
            transition: 0.3s;
            font-weight: 600;
        }
        .nav-item:hover, .nav-item.active { background: rgba(255,255,255,0.1); color: white; }
        .nav-item.active { border-right: 4px solid var(--success); }
 
        .inventory-edit { display: none; margin-top: 10px; gap: 10px; }
        .inventory-edit.active { display: flex; }
        .edit-input { width: 60px; padding: 5px; border: 1px solid #ddd; border-radius: 8px; font-weight: bold; text-align: center; }
        .btn-mini { padding: 5px 10px; font-size: 11px; border-radius: 6px; }

        .logout-area { padding: 30px; border-top: 1px solid rgba(255,255,255,0.1); }
        .btn-logout { width: 100%; padding: 12px; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: white; cursor: pointer; font-weight: 700; transition: 0.3s; }
        .btn-logout:hover { background: var(--danger); }

        /* Mobile Nav */
        .mobile-header { display: none; background: white; padding: 15px 20px; align-items: center; justify-content: space-between; box-shadow: var(--shadow); position: sticky; top: 0; z-index: 200; }
        .mobile-menu-btn { font-size: 24px; background: none; border: none; cursor: pointer; color: var(--primary); }

        /* Dashboard Cards */
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 25px; margin-bottom: 40px; }
        .stat-card { background: var(--glass); padding: 25px; border-radius: 24px; box-shadow: var(--shadow); border: 1px solid rgba(255,255,255,0.5); }
        .stat-card h3 { margin: 0; color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
        .stat-card .val { display: block; font-size: 32px; font-weight: 800; color: var(--primary); margin: 10px 0; }
        
        .prog-container { height: 8px; background: #e2e8f0; border-radius: 10px; overflow: hidden; margin-top: 15px; }
        .prog-bar { height: 100%; background: var(--primary); transition: 1s cubic-bezier(0.4, 0, 0.2, 1); }
        .prog-bar.warn { background: var(--warning); }
        .prog-bar.crit { background: var(--danger); }

        /* Tables */
        .card-table { background: white; border-radius: 24px; box-shadow: var(--shadow); overflow: hidden; margin-bottom: 40px; }
        .table-header { padding: 25px 30px; background: #fbfcfe; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
        .table-header h2 { margin: 0; font-size: 20px; font-weight: 800; color: var(--primary); }
        
        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; min-width: 800px; }
        th { padding: 18px 30px; text-align: left; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; background: #fbfcfe; border-bottom: 1px solid #f1f5f9; }
        td { padding: 20px 30px; border-bottom: 1px solid #f8fafc; font-size: 15px; color: #334155; }
        tr:last-child td { border-bottom: none; }
        tr:hover { background: #fdfdff; }

        .badge { padding: 6px 14px; border-radius: 50px; font-weight: 800; font-size: 11px; text-transform: uppercase; }
        .badge.pending { background: #fff8e1; color: #ffab00; }
        .badge.paid { background: #e8f5e9; color: #2e7d32; }
        .badge.scanned { background: #fee2e2; color: #ef4444; }
        .badge.unused { background: #f1f5f9; color: #64748b; }

        /* Buttons */
        .btn-action { padding: 8px 16px; border-radius: 10px; border: none; font-weight: 700; cursor: pointer; transition: 0.3s; font-size: 13px; }
        .btn-approve { background: var(--success); color: white; }
        .btn-view { background: #e0e7ff; color: var(--primary); text-decoration: none; padding: 8px 14px; display: inline-block; font-size: 13px; border-radius: 10px; font-weight: 700; }

        /* Sections */
        .section { display: none; animation: fadeIn 0.4s ease; }
        .section.active { display: block; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        /* Scanner Specific */
        #scanner-ui { max-width: 500px; margin: 0 auto; }
        #reader { border-radius: 20px; overflow: hidden; margin-top: 20px; }
        .scanner-card { background: #000; border-radius: 28px; padding: 20px; margin-top: 20px; }
        .result-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; display: none; align-items: center; justify-content: center; padding: 20px; }
        .result-box { background: white; border-radius: 32px; width: 100%; max-width: 450px; overflow: hidden; }

        @media (max-width: 900px) {
            .sidebar { transform: translateX(-100%); width: 100%; }
            .sidebar.open { transform: translateX(0); }
            .main-content { margin-left: 0; padding: 20px; }
            .mobile-header { display: flex; }
            .stats-grid { gap: 15px; }
        }
    </style>
</head>
<body>

    <div class="mobile-header">
        <h2 style="margin:0; font-weight:800; color:var(--primary);">Eventz Portal</h2>
        <button class="mobile-menu-btn" onclick="toggleMenu()">☰</button>
    </div>

    <div class="layout">
        <!-- Sidebar -->
        <div class="sidebar" id="sidebar">
            <div class="logo-area">
                <h2>EVENTZ CLOUD</h2>
            </div>
            <div class="nav">
                <div class="nav-item active" onclick="showTab('overview', this)">📊 Overview</div>
                <div class="nav-item" onclick="showTab('pending', this)">🕒 Pending</div>
                <div class="nav-item" onclick="showTab('approved', this)">✅ Approved</div>
                <div class="nav-item" onclick="showTab('scanner', this)">📷 Scan Ticket</div>
                <div class="nav-item" onclick="showTab('history', this)">🏁 Verified List</div>
            </div>
            <div class="logout-area">
                <button class="btn-logout" onclick="location.href='/logout'">LOGOUT</button>
            </div>
        </div>

        <!-- Main Content -->
        <div class="main-content">
            
            <!-- OVERVIEW SECTION -->
            <div id="overview" class="section active">
                <div style="margin-bottom: 30px;">
                    <h1 style="margin:0; font-size:28px; font-weight:800;">Command Center</h1>
                    <p style="color:#64748b;">Live performance tracking for Music Night 2026</p>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <h3>Total Gross Revenue</h3>
                        <span class="val">OMR ${totalRevenue.toFixed(2)}</span>
                        <p style="color:var(--success); font-size:12px; margin:0; font-weight:700;">↑ Live Sync</p>
                    </div>
                    ${inventoryRows.map(row => {
            const booked = row.booked_seats;
            const total = row.total_seats;
            const perc = (booked / total) * 100;
            let cls = ''; if (perc > 70) cls = 'warn'; if (perc > 90) cls = 'crit';
            return `
                        <div class="stat-card">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                <h3>${row.category} Inventory</h3>
                                <button class="btn-mini btn-view" onclick="toggleInvEdit('${row.category}')">Edit</button>
                            </div>
                            <span class="val" id="val-${row.category}">${booked} / ${total}</span>
                            <div class="prog-container"><div class="prog-bar ${cls}" style="width: ${perc}%"></div></div>
                            <div class="inventory-edit" id="edit-${row.category}">
                                <input type="number" class="edit-input" id="input-${row.category}" value="${total}">
                                <button class="btn-mini btn-approve" onclick="saveInventory('${row.category}')">Save</button>
                            </div>
                        </div>
                        `;
        }).join('')}
                </div>

            <!-- PENDING SECTION -->
            <div id="pending" class="section">
                <div class="card-table">
                    <div class="table-header"><h2>Not Approved Tickets</h2></div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr><th>Booking</th><th>Phone</th><th>Category</th><th>Qty</th><th>Verification</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                                ${pendingRows.map(b => `
                                <tr id="row-${b.booking_no}">
                                    <td><strong>${b.booking_no}</strong></td>
                                    <td><a href="https://wa.me/${b.phone}" target="_blank" style="color:var(--primary); font-weight:600;">${b.phone}</a></td>
                                    <td><span class="badge unused">${b.category}</span></td>
                                    <td>${b.quantity}</td>
                                    <td><span class="badge pending">AWAITING</span></td>
                                    <td>
                                        <div style="display:flex; gap:8px;">
                                            <a href="${b.payment_slip_url}" target="_blank" class="btn-view">Slip</a>
                                            <button onclick="approveBooking('${b.booking_no}')" class="btn-action btn-approve" id="btn-${b.booking_no}">Approve</button>
                                        </div>
                                    </td>
                                </tr>`).join('')}
                                ${pendingRows.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:40px; color:#94a3b8;">No unapproved tickets.</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
 
            <!-- APPROVED SECTION -->
            <div id="approved" class="section">
               <div class="card-table">
                    <div class="table-header"><h2>Approved Tickets History</h2></div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr><th>Booking</th><th>Phone</th><th>Cat</th><th>Qty</th><th>Status</th><th>Entry</th></tr>
                            </thead>
                            <tbody>
                                ${approvedRows.map(b => `
                                <tr>
                                    <td><strong>${b.booking_no}</strong></td>
                                    <td>${b.phone}</td>
                                    <td>${b.category}</td>
                                    <td>${b.quantity}</td>
                                    <td><span class="badge paid">APPROVED</span></td>
                                    <td><span class="badge ${b.entry_status ? 'scanned' : 'unused'}">${b.entry_status ? 'IN' : 'OUT'}</span></td>
                                </tr>`).join('')}
                                ${approvedRows.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:40px;">No tickets approved yet.</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- SCANNER SECTION -->
            <div id="scanner" class="section">
                <div id="scanner-ui">
                    <div style="text-align:center; margin-bottom:30px;">
                        <h2 style="font-weight:800; font-size:24px;">Ticket Verification</h2>
                        <p style="color:#64748b;">Open camera to scan QR codes for gate entry</p>
                        <button class="btn-action btn-approve" style="padding:15px 40px; font-size:16px; margin-top:20px;" onclick="startScanner()">OPEN CAMERA</button>
                    </div>
                    
                    <div id="scanner-container" style="display:none;">
                        <div id="reader"></div>
                        <div id="scanner-error" style="background:var(--danger); color:white; padding:10px; font-size:12px; display:none; text-align:center; border-radius:0 0 20px 20px;"></div>
                        <button class="btn-logout" style="margin-top:20px;" onclick="stopScanner()">CANCEL SCAN</button>
                    </div>
                </div>
            </div>

            <!-- HISTORY SECTION -->
            <div id="history" class="section">
                <div class="card-table">
                    <div class="table-header"><h2>Verified Attendee Registry</h2></div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr><th>Booking</th><th>Category</th><th>Qty</th><th>Phone</th><th>Entry Time</th></tr>
                            </thead>
                            <tbody>
                                ${verifiedRows.map(v => `
                                <tr>
                                    <td><strong>${v.booking_no}</strong></td>
                                    <td>${v.category}</td>
                                    <td>${v.quantity}</td>
                                    <td>${v.phone}</td>
                                    <td><span style="font-weight:700; color:var(--success);">${v.entry_status}</span></td>
                                </tr>`).join('')}
                                ${verifiedRows.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding:40px;">Gate entry has not started yet.</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <!-- Scanner Result Overlay -->
    <div class="result-overlay" id="res-overlay">
        <div class="result-box">
             <div id="res-header" style="padding:30px; text-align:center; color:white;">
                <h2 style="margin:0;">Checking...</h2>
             </div>
             <div style="padding:30px;" id="res-content">
                <div id="res-details" style="display:none;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:15px;"><span>Booking No</span><strong id="res-bno">-</strong></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:15px;"><span>Category</span><strong id="res-cat">-</strong></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:15px;"><span>Quantity</span><strong id="res-qty">-</strong></div>
                    <div id="res-members" style="margin-top:20px; padding:15px; background:#f8fafc; border-radius:15px;"></div>
                </div>
                <div id="res-error" style="display:none; text-align:center; padding:20px 0;">
                    <p id="res-err-txt"></p>
                </div>
                <div id="res-actions" style="margin-top:30px; text-align:center; display:none;">
                    <button class="btn-action btn-approve" style="width:100%; padding:18px;" id="btn-grant" onclick="confirmEntrance()">GRANT ENTRY</button>
                    <button class="btn-logout" style="margin-top:15px; width:100%;" onclick="closeOverlay()">CLOSE</button>
                </div>
                <button class="btn-logout" id="btn-err-close" style="margin-top:15px; width:100%; display:none;" onclick="closeOverlay()">CLOSE</button>
             </div>
        </div>
    </div>

    <script>
        function showTab(id, el) {
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            if(el) el.classList.add('active');
            if(id !== 'scanner') stopScanner();
            if(window.innerWidth < 900) toggleMenu();
        }

        function toggleMenu() {
            document.getElementById('sidebar').classList.toggle('open');
        }

        async function approveBooking(bookingNo) {
            if(!confirm('Authorize payment for ' + bookingNo + '?')) return;
            const btn = document.getElementById('btn-' + bookingNo);
            btn.disabled = true; btn.innerText = 'Syncing...';
            try {
                const response = await fetch('/admin/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bookingNo })
                });
                const data = await response.json();
                if (data.success) { location.reload(); } else { alert('Error: ' + data.error); btn.disabled = false; btn.innerText = 'Approve'; }
            } catch (e) { alert('Network Error'); btn.disabled = false; }
        }
 
        function toggleInvEdit(cat) {
            document.getElementById('edit-' + cat).classList.toggle('active');
        }
 
        async function saveInventory(category) {
            const total = document.getElementById('input-' + category).value;
            try {
                const res = await fetch('/admin/inventory/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category, total_seats: total })
                });
                if (res.ok) { location.reload(); } else { alert('Update Failed'); }
            } catch (e) { alert('Network Error'); }
        }

        // --- Scanner Logic ---
        let html5QrCode = null;
        let activeTicketId = null;

        function startScanner() {
            document.getElementById('scanner-container').style.display = 'block';
            document.getElementById('scanner-error').style.display = 'none';
            if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
            
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            html5QrCode.start({ facingMode: "environment" }, config, async (text) => {
                let tId = text;
                try { const url = new URL(text); tId = url.searchParams.get("id") || text; } catch(e){}
                stopScanner();
                processTicket(tId);
            }).catch(err => {
                document.getElementById('scanner-error').style.display = 'block';
                document.getElementById('scanner-error').innerText = err;
            });
        }

        function stopScanner() {
            if (html5QrCode) html5QrCode.stop().catch(() => {});
            document.getElementById('scanner-container').style.display = 'none';
        }

        async function processTicket(tId) {
            activeTicketId = tId;
            const overlay = document.getElementById('res-overlay');
            const h = document.getElementById('res-header');
            overlay.style.display = 'flex';
            h.innerHTML = '<h2>Checking Database...</h2>';
            h.style.background = '#64748b';

            try {
                const res = await fetch('/verify/scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketId: tId })
                });
                const data = await res.json();
                
                if (!res.ok) {
                    h.innerHTML = '<h2>INVALID TICKET</h2>'; h.style.background = 'var(--danger)';
                    document.getElementById('res-details').style.display = 'none';
                    document.getElementById('res-error').style.display = 'block';
                    document.getElementById('res-err-txt').innerText = data.error || 'Ticket not found';
                    document.getElementById('btn-err-close').style.display = 'block';
                    document.getElementById('res-actions').style.display = 'none';
                    return;
                }

                document.getElementById('res-details').style.display = 'block';
                document.getElementById('res-error').style.display = 'none';
                document.getElementById('btn-err-close').style.display = 'none';
                document.getElementById('res-bno').innerText = data.ticket.booking_no;
                document.getElementById('res-cat').innerText = data.ticket.category;
                document.getElementById('res-qty').innerText = data.ticket.quantity;

                if (data.status === 'already_scanned') {
                    h.innerHTML = '<h2>ALREADY USED</h2>'; h.style.background = 'var(--warning)';
                    document.getElementById('res-actions').style.display = 'none';
                    document.getElementById('btn-err-close').style.display = 'block';
                    document.getElementById('res-error').style.display = 'block';
                    document.getElementById('res-err-txt').innerHTML = 'Already Checked In at:<br><strong>' + data.ticket.entry_status + '</strong>';
                } else {
                    h.innerHTML = '<h2>VALID TICKET</h2>'; h.style.background = 'var(--success)';
                    document.getElementById('res-actions').style.display = 'block';
                }
            } catch(e) { alert('Verif Error'); closeOverlay(); }
        }

        async function confirmEntrance() {
            const btn = document.getElementById('btn-grant');
            btn.disabled = true; btn.innerText = 'Granting...';
            try {
                const res = await fetch('/verify/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketId: activeTicketId })
                });
                if (res.ok) {
                    document.getElementById('res-header').innerHTML = '<h2>ENTRY GRANTED</h2>';
                    document.getElementById('res-actions').innerHTML = '<button class="btn-action btn-approve" style="width:100%; background:#222;" onclick="location.reload()">NEXT CUSTOMER</button>';
                } else { alert('Confirmation Failed'); btn.disabled = false; }
            } catch(e) { alert('Network Error'); btn.disabled = false; }
        }

        function closeOverlay() {
            document.getElementById('res-overlay').style.display = 'none';
            document.getElementById('res-details').style.display = 'none';
            document.getElementById('res-actions').style.display = 'none';
            document.getElementById('btn-err-close').style.display = 'none';
            startScanner();
        }

        // Auto-tab if coming from QR link
        window.addEventListener('load', () => {
            const params = new URLSearchParams(window.location.search);
            if(params.has('id')) {
                showTab('scanner');
                processTicket(params.get('id'));
            }
        });
    </script>
</body>
</html>
        `;
        res.send(html);
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.status(500).send('Internal Server Error loading dashboard.');
    }
});

// Redirect old /verify to the new unified dashboard scanner tab
app.get('/verify', requireAuth, (req, res) => {
    const id = req.query.id;
    if (id) return res.redirect(`/dashboard?tab=scanner&id=${id}`);
    res.redirect('/dashboard?tab=scanner');
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
