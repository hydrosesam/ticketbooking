const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { handleMusicNightFlow, authorizeAndSendTicket, generateAdminOTP, sendManualMessage } = require('./bot');
const db = require('./database');
require('dotenv').config();

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Ensure uploads directory exists (important for fresh deployments)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Serve the uploads folder statically so dashboard can show slips
app.use('/uploads', express.static(UPLOADS_DIR));

// Configure Multer for QR Code Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `payment_qr_${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'ALTAZA_123';
const PORT = process.env.PORT || 3000;

// ======================================
// Authentication System
// ======================================

async function requireAuth(req, res, next) {
    const authPhone = req.cookies.auth;
    if (authPhone) {
        try {
            const rows = await db.query("SELECT * FROM mn_admins WHERE phone = ? AND is_active = TRUE", [authPhone]);
            if (rows.length > 0) {
                req.admin = rows[0];
                return next();
            }
        } catch (e) { }
    }
    res.redirect(`/login-phone?next=${encodeURIComponent(req.path)}`);
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
        res.cookie('auth', phone, { maxAge: 8 * 60 * 60 * 1000, httpOnly: true });
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

// Admin Management API
app.post('/admin/add', requireAuth, async (req, res) => {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: "Unauthorized" });

    const { phone, name, role } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required" });
    try {
        await db.query("INSERT INTO mn_admins (phone, name, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role)", [phone, name || 'Staff', role || 'admin']);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/admin/delete', requireAuth, async (req, res) => {
    const { phone } = req.body;
    try {
        await db.query("DELETE FROM mn_admins WHERE phone = ?", [phone]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================================
// Inbox API Endpoints
// ======================================

// Get all unique conversations (latest message per phone) with pagination
app.get('/admin/inbox/conversations', requireAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const rows = await db.query(`
            SELECT m1.*, u.temp_members,
                   (SELECT COUNT(*) FROM mn_messages m3
                    WHERE m3.phone = m1.phone AND m3.direction = 'inbound' AND m3.is_read = 0) AS unread_count
            FROM mn_messages m1
            LEFT JOIN mn_messages m2
                ON m1.phone = m2.phone AND m1.timestamp < m2.timestamp
            LEFT JOIN mn_users u
                ON m1.phone = u.phone_number
            WHERE m2.id IS NULL
            ORDER BY m1.timestamp DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
        res.json(rows);
    } catch (err) {
        console.error("Inbox converstations error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Export filtered inbox to CSV (Removing duplicates and registered users)
app.get('/admin/inbox/export-csv', requireAuth, async (req, res) => {
    try {
        const rows = await db.query(`
            SELECT m1.*, u.temp_members,
                   (SELECT COUNT(*) FROM mn_messages m3
                    WHERE m3.phone = m1.phone AND m3.direction = 'inbound' AND m3.is_read = 0) AS unread_count
            FROM mn_messages m1
            LEFT JOIN mn_messages m2
                ON m1.phone = m2.phone AND m1.timestamp < m2.timestamp
            LEFT JOIN mn_users u
                ON m1.phone = u.phone_number
            WHERE m2.id IS NULL
              AND m1.phone NOT IN (SELECT phone FROM mn_bookings)
              AND m1.phone NOT IN (SELECT phone FROM mn_enquiries)
              AND m1.phone NOT IN (SELECT phone FROM mn_abandoned_carts)
            ORDER BY m1.timestamp DESC
        `);

        let csv = '"Phone/Name","Time","Unread","Last Message Preview"\n';
        for (const r of rows) {
            let phoneName = r.phone;
            try {
                if (r.temp_members) {
                    let members = typeof r.temp_members === 'string' ? JSON.parse(r.temp_members) : r.temp_members;
                    if (members && members.length > 0) {
                        phoneName = members[0] + ' (' + r.phone + ')';
                    }
                }
            } catch(e) {}
            
            phoneName = phoneName.replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, " ").trim();
            
            let timeStr = new Date(r.timestamp).toLocaleString();
            let unread = r.unread_count > 0 ? r.unread_count : '0';
            
            let preview = (r.content || '').replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, " ").trim();
            if (r.message_type === 'image') preview = '[Image] ' + preview;
            if (r.message_type === 'document') preview = '[Document] ' + preview;
            
            csv += '"' + phoneName + '","' + timeStr + '","' + unread + '","' + preview + '"\n';
        }

        res.header('Content-Type', 'text/csv');
        res.attachment('Inbox_Filtered_Export.csv');
        res.send(csv);
    } catch (err) {
        console.error("Inbox CSV export error:", err);
        res.status(500).send("Error generating CSV");
    }
});

// Get message history for a specific phone number (with pagination)
app.get('/admin/inbox/messages/:phone', requireAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const rows = await db.query(
            "SELECT * FROM mn_messages WHERE phone = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            [req.params.phone, limit, offset]
        );
        // Return latest messages first in DESC, frontend will reverse them for display
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send a manual message from the inbox
app.post('/admin/inbox/send', requireAuth, async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: "Missing parameters" });

    try {
        const result = await sendManualMessage(phone, message);
        if (result.success) {
            // Emit socket event for the sent message too
            io.emit('new_message', {
                phone: phone,
                direction: 'outbound',
                message_type: 'text',
                content: message,
                is_read: 1,
                timestamp: new Date().toISOString()
            });
            res.json({ success: true });
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mark all messages from a phone as read
app.post('/admin/inbox/mark-read', requireAuth, async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Missing phone' });
    try {
        await db.query("UPDATE mn_messages SET is_read = 1 WHERE phone = ? AND is_read = 0", [phone]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================================
// Settings API Endpoints
// ======================================
app.get('/admin/settings', requireAuth, async (req, res) => {
    try {
        const rows = await db.query("SELECT * FROM mn_settings");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/admin/settings/update', requireAuth, async (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: "Key required" });
    try {
        await db.query("INSERT INTO mn_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [key, value]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================================
// Enquiries API Endpoints
// ======================================
app.get('/admin/enquiries', requireAuth, async (req, res) => {
    try {
        const rows = await db.query("SELECT * FROM mn_enquiries ORDER BY timestamp DESC LIMIT 50");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/admin/abandoned', requireAuth, async (req, res) => {
    try {
        const rows = await db.query("SELECT * FROM mn_abandoned_carts ORDER BY timestamp DESC LIMIT 50");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/admin/abandoned/approve', requireAuth, async (req, res) => {
    const { phone, name, category, quantity, amount } = req.body;
    if (!phone || !category || !quantity) return res.status(400).json({ error: "Missing data" });

    try {
        // 1. Create a dummy user state if they don't exist or just to store data for processPendingBooking
        const user = { phone, name, category, quantity, members: [name] };
        
        // 2. Insert into mn_bookings directly as pending (or skip to approved?)
        // To be safe and follow existing flow, we insert as pending then immediately authorize.
        
        // Use a generated ticket ID (similar to processPendingBooking logic)
        let ticketId = '';
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        for (let i = 0; i < 12; i++) {
            ticketId += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const result = await db.query(
            `INSERT INTO mn_bookings (ticket_id, phone, category, quantity, amount, members, payment_status, payment_slip_url) 
             VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
            [ticketId, phone, category, quantity, amount, JSON.stringify([name]), 'MANUAL_APPROVAL']
        );

        const bookingNo = result.insertId;
        const formattedBookingNo = `MMN-${bookingNo.toString().padStart(4, '0')}`;
        await db.query("UPDATE mn_bookings SET ticket_id = ? WHERE booking_no = ?", [formattedBookingNo, bookingNo]);

        // Deduct inventory
        await db.query(`UPDATE mn_inventory SET booked_seats = booked_seats + ? WHERE category = ?`, [quantity, category]);

        // 3. Authorize and Send
        const authResult = await authorizeAndSendTicket(bookingNo);
        
        if (authResult.success) {
            // Remove from abandoned
            await db.query("DELETE FROM mn_abandoned_carts WHERE phone = ?", [phone]);
            res.json({ success: true, bookingNo: formattedBookingNo });
        } else {
            res.status(500).json({ error: authResult.error });
        }
    } catch (err) {
        console.error("Manual approval error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/admin/settings/upload-qr', requireAuth, upload.single('qr_image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const fileUrl = `/uploads/${req.file.filename}`;
    try {
        await db.query("INSERT INTO mn_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", ['payment_qr_url', fileUrl]);
        res.json({ success: true, url: fileUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Get paginated bookings for dashboard tabs
app.get('/admin/bookings/list', requireAuth, async (req, res) => {
    const { type, limit = 50, offset = 0 } = req.query;
    let where = "1=1";
    if (type === 'pending') where = "payment_status = 'pending'";
    else if (type === 'approved') where = "payment_status = 'approved'";
    else if (type === 'verified') where = "entry_status IS NOT NULL";

    let orderBy = "timestamp DESC";
    if (type === 'verified') orderBy = "entry_status DESC";

    try {
        const rows = await db.query(`
            SELECT * FROM mn_bookings 
            WHERE ${where} 
            ORDER BY ${orderBy} 
            LIMIT ? OFFSET ?
        `, [parseInt(limit), parseInt(offset)]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
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
                // Determine message content for logging
                let content = '';
                let mediaUrl = null;
                const type = webhookEvent.type;

                if (type === 'text') {
                    content = webhookEvent.text.body;
                } else if (type === 'image') {
                    mediaUrl = webhookEvent.image.id;
                    content = webhookEvent.image.caption || 'Image Received';
                } else if (type === 'document') {
                    mediaUrl = webhookEvent.document.id;
                    content = webhookEvent.document.caption || webhookEvent.document.filename || 'Document Received';
                } else if (type === 'interactive') {
                    if (webhookEvent.interactive.type === 'button_reply') content = webhookEvent.interactive.button_reply.title || webhookEvent.interactive.button_reply.id;
                    else if (webhookEvent.interactive.type === 'list_reply') content = webhookEvent.interactive.list_reply.title || webhookEvent.interactive.list_reply.id;
                } else {
                    content = `[${type} received]`;
                }

                // Log inbound message to the database
                let savedMsgId = null;
                try {
                    const result = await db.query(
                        "INSERT INTO mn_messages (phone, direction, message_type, content, media_url, status, is_read) VALUES (?, 'inbound', ?, ?, ?, 'received', 0)",
                        [senderPhone, type, content, mediaUrl]
                    );
                    savedMsgId = result.insertId;
                    // Emit real-time event to all connected dashboard clients
                    io.emit('new_message', {
                        id: savedMsgId,
                        phone: senderPhone,
                        direction: 'inbound',
                        message_type: type,
                        content: content,
                        media_url: mediaUrl,
                        is_read: 0,
                        timestamp: new Date().toISOString()
                    });
                } catch (dbErr) {
                    console.error("\u274c Failed to log inbound message:", dbErr.message);
                }

                // Pass the full webhook event object to the bot flow
                console.log(`📩 Webhook Event from ${senderPhone}: ${type}`);
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
        
        // Optimized summary stats (do the math in the database)
        const stats = await db.query(`
            SELECT 
                SUM(amount) as total_revenue,
                SUM(CASE WHEN payment_status = 'approved' THEN amount ELSE 0 END) as collected,
                SUM(CASE WHEN payment_status != 'approved' THEN amount ELSE 0 END) as receivable
            FROM mn_bookings
        `);
        
        const totalRevenue = parseFloat(stats[0].total_revenue || 0);
        const collected = parseFloat(stats[0].collected || 0);
        const receivable = parseFloat(stats[0].receivable || 0);

        // Limit initial table data to latest 100 per tab for speed
        const limit = 100;
        const bookingRows = await db.query("SELECT * FROM mn_bookings ORDER BY timestamp DESC LIMIT ?", [limit]);
        const pendingRows = await db.query("SELECT * FROM mn_bookings WHERE payment_status = 'pending' ORDER BY timestamp DESC LIMIT ?", [limit]);
        const approvedRows = await db.query("SELECT * FROM mn_bookings WHERE payment_status = 'approved' ORDER BY timestamp DESC LIMIT ?", [limit]);
        const verifiedRows = await db.query("SELECT * FROM mn_bookings WHERE entry_status IS NOT NULL ORDER BY entry_status DESC LIMIT ?", [limit]);
        const adminRows = await db.query("SELECT * FROM mn_admins ORDER BY created_at DESC");

        const formatOmanTime = (date) => {
            if (!date) return '-';
            const d = typeof date === 'string' && !date.includes('Z') && !date.includes('+') ? new Date(date + ' UTC') : new Date(date);
            return d.toLocaleString('en-GB', {
                timeZone: 'Asia/Muscat', day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: true
            });
        };

        const formatSerial = (no) => {
            if (!no) return '-';
            return 'MMN-' + String(no).padStart(4, '0');
        };

        const admin = req.admin;
        const isAdmin = admin.role === 'admin';

        // Check for duplicate Bank Transaction IDs (Only for the visible rows)
        const txIdMap = {};
        bookingRows.forEach(b => {
            if (b.bank_transaction_id) {
                const tid = b.bank_transaction_id.toUpperCase();
                if (!txIdMap[tid]) txIdMap[tid] = [];
                txIdMap[tid].push(formatSerial(b.booking_no));
            }
        });

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0">
    <title>Eventz Cloud - Admin Premium</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <script src="/socket.io/socket.io.js"></script>
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

        *, *::before, *::after {
            box-sizing: border-box;
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
        .sidebar { width: 260px; background: var(--primary); color: white; display: flex; flex-direction: column; position: fixed; height: 100vh; z-index: 100; transition: 0.3s; overflow-y: auto; -webkit-overflow-scrolling: touch; }
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
 
        .pagination { display: flex; justify-content: center; gap: 10px; margin: 20px 0; align-items: center; }
        .page-btn { padding: 8px 16px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; font-weight: 600; transition: 0.3s; }
        .page-btn:hover { background: #f8fafc; border-color: var(--primary); color: var(--primary); }
        .page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .page-info { font-weight: 600; color: #64748b; }

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
        
        .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        table { width: 100%; border-collapse: collapse; min-width: 600px; }
        th { padding: 18px 20px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; background: #fbfcfe; border-bottom: 1px solid #f1f5f9; white-space: nowrap; }
        td { padding: 15px 20px; border-bottom: 1px solid #f8fafc; font-size: 14px; color: #334155; }
        tr:last-child td { border-bottom: none; }
        tr:hover { background: #fdfdff; }

        .badge { padding: 6px 14px; border-radius: 50px; font-weight: 800; font-size: 11px; text-transform: uppercase; white-space: nowrap; display: inline-block; }
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

        /* Inbox Specific */
        .inbox-container { display: flex; height: calc(100vh - 120px); background: white; border-radius: 24px; box-shadow: var(--shadow); overflow: hidden; margin-top: 20px; }
        .inbox-list { width: 320px; border-right: 1px solid #f1f5f9; display: flex; flex-direction: column; }
        .inbox-search { padding: 20px; border-bottom: 1px solid #f1f5f9; }
        .inbox-search input { width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 12px; font-family: 'Outfit'; }
        .conversations { flex: 1; overflow-y: auto; }
        .conversation-item { padding: 16px 20px; border-bottom: 1px solid #f8fafc; cursor: pointer; transition: 0.2s; position: relative; }
        .conversation-item:hover, .conversation-item.active { background: #f8faff; border-left: 4px solid var(--primary); }
        .conversation-phone { font-weight: 800; color: var(--primary); margin-bottom: 5px; }
        .conversation-preview { font-size: 13px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
        .conversation-time { font-size: 11px; color: #94a3b8; float: right; }
        .unread-badge { background: var(--danger); color: white; font-size: 11px; font-weight: 800; border-radius: 50px; padding: 2px 7px; min-width: 20px; text-align: center; display: inline-block; margin-left: 8px; vertical-align: middle; }
        
        .chat-area { flex: 1; display: flex; flex-direction: column; background: #fbfcfe; }
        .chat-header { padding: 20px 30px; background: white; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; }
        .chat-header h3 { margin: 0; color: var(--primary); }
        .chat-messages { flex: 1; padding: 30px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
        .msg-bubble { max-width: 70%; padding: 12px 18px; border-radius: 20px; font-size: 14px; position: relative; }
        .msg-inbound { background: white; color: #334155; align-self: flex-start; border-bottom-left-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .msg-outbound { background: var(--primary); color: white; align-self: flex-end; border-bottom-right-radius: 4px; box-shadow: 0 2px 10px rgba(26, 35, 126, 0.2); }
        .msg-time { font-size: 10px; opacity: 0.7; margin-top: 5px; text-align: right; display: block; }
        .chat-input-area { padding: 20px 30px; background: white; border-top: 1px solid #f1f5f9; display: flex; gap: 15px; }
        .chat-input-area input { flex: 1; padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px; font-family: 'Outfit'; font-size: 14px; margin-bottom: 0; }
        .chat-input-area button { width: auto; padding: 0 30px; background: var(--success); }

        /* Scanner Specific */
        #scanner-ui { max-width: 500px; margin: 0 auto; width: 100%; }
        #reader { border-radius: 20px; overflow: hidden; margin-top: 20px; width: 100%; background: #000; display: flex; justify-content: center; align-items: center; min-height: 300px; }
        #reader video { width: 100% !important; height: auto !important; object-fit: cover; border-radius: 20px; }
        .scanner-card { background: #000; border-radius: 28px; padding: 20px; margin-top: 20px; }
        .result-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 1000; display: none; align-items: center; justify-content: center; padding: 20px; }
        .result-box { background: white; border-radius: 32px; width: 100%; max-width: 450px; overflow: hidden; margin: 0 auto; display: flex; flex-direction: column; max-height: 90vh; }
        #res-content { overflow-y: auto; -webkit-overflow-scrolling: touch; }

        @media (max-width: 900px) {
            .sidebar { transform: translateX(-100%); width: 280px; box-shadow: var(--shadow); }
            .sidebar.open { transform: translateX(0); }
            .main-content { margin-left: 0; padding: 15px; width: 100%; box-sizing: border-box; }
            .mobile-header { display: flex; }
            .stats-grid { gap: 15px; grid-template-columns: 1fr; }
            .card-table { border-radius: 16px; margin-bottom: 20px; }
            .table-header { padding: 15px 20px; flex-direction: column; align-items: flex-start; gap: 10px;}
            .table-header h2 { font-size: 18px; }
            .stat-card { padding: 20px; }
            h1 { font-size: 24px !important; }
            .pagination { flex-wrap: wrap; }
            .page-btn { padding: 6px 12px; font-size: 13px; }
            .result-box { width: 90%; max-width: 350px; border-radius: 20px; }
            #res-header { padding: 20px !important; }
            #res-header h2 { font-size: 20px; }
            #res-content { padding: 20px !important; }
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
                ${isAdmin ? `
                <div class="nav-item active" onclick="showTab('overview', this)">📊 Overview</div>
                <div class="nav-item" onclick="showTab('inbox', this)">💬 Inbox</div>
                <div class="nav-item" onclick="showTab('abandoned', this)">🛒 Abandoned</div>
                <div class="nav-item" onclick="showTab('leads-guest', this)">🌟 Guest Leads</div>
                <div class="nav-item" onclick="showTab('leads-vvip', this)">💎 VVIP Leads</div>
                <div class="nav-item" onclick="showTab('leads-vip', this)">🎟 VIP Leads</div>
                <div class="nav-item" onclick="showTab('pending', this)">🕒 Pending</div>
                <div class="nav-item" onclick="showTab('approved', this)">✅ Approved</div>
                <div class="nav-item" onclick="showTab('balance', this)">💰 Balance</div>
                <div class="nav-item" onclick="showTab('admins', this)">👥 Staff Access</div>
                <div class="nav-item" onclick="showTab('settings', this)">⚙️ Settings</div>
                ` : ''}
                <div class="nav-item ${!isAdmin ? 'active' : ''}" onclick="showTab('scanner', this)">🔍 Ticket Scanner</div>
                <div class="nav-item" onclick="showTab('history', this)">🏁 Verified List</div>
            </div>
            <div class="logout-area">
                <button class="btn-logout" onclick="location.href='/logout'">LOGOUT</button>
            </div>
        </div>

        <!-- Main Content -->
        <div class="main-content">
            
            ${isAdmin ? `
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

                <div class="card-table">
                    <div class="table-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h2>Recent Pending Approvals (Last 10)</h2>
                        <button class="btn-mini btn-view" onclick="downloadTableCSV('table-overview-pending', 'Recent_Pending_Approvals')">Export CSV</button>
                    </div>
                    <div class="table-wrap">
                        <table id="table-overview-pending">
                            <thead>
                                <tr><th>Booking</th><th>Date/Time (Oman)</th><th>Phone</th><th>Category</th><th>Qty</th><th>Verification</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                                ${pendingRows.slice(0, 10).map(b => {
            const txid = b.bank_transaction_id ? b.bank_transaction_id.toUpperCase() : null;
            const isDup = txid && txIdMap[txid] && txIdMap[txid].length > 1;
            const dupConflicting = isDup ? txIdMap[txid].filter(no => no !== b.booking_no) : [];

            return `
                                <tr>
                                    <td><strong>${formatSerial(b.booking_no)}</strong></td>
                                    <td style="font-size:12px; color:#64748b;">${formatOmanTime(b.timestamp)}</td>
                                    <td>
                                        <div style="font-weight:700;">${b.phone}</div>
                                        <div style="font-size:11px; color:#64748b;">${b.category} x ${b.quantity}</div>
                                    </td>
                                    <td>
                                        <div style="font-size:12px;"><strong>TXID:</strong> ${b.bank_transaction_id || '-'}</div>
                                        <div style="font-size:12px;"><strong>Amt:</strong> OMR ${b.bank_amount || '-'}</div>
                                    </td>
                                    <td>
                                        ${isDup ? `<div style="color:var(--danger); font-size:10px; font-weight:800; margin-bottom:5px;">⚠️ DUPLICATE TXN ID</div>` : ''}
                                        ${isDup ? `<div style="font-size:9px; color:#64748b;">Conflicting: ${dupConflicting.join(', ')}</div>` : ''}
                                        <div style="font-size:11px; color:#64748b;">${b.bank_beneficiary || '-'} (${b.bank_mobile || '-'})</div>
                                    </td>
                                    <td>
                                        <div style="display:flex; gap:8px;">
                                            <a href="${b.payment_slip_url}" target="_blank" class="btn-view">Slip</a>
                                            <button onclick="approveBooking('${b.booking_no}')" class="btn-action btn-approve">Approve</button>
                                        </div>
                                    </td>
                                </tr>`;
        }).join('')}
                                ${pendingRows.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding:40px;">All caught up!</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- INBOX SECTION -->
            <div id="inbox" class="section">
                <div style="margin-bottom: 30px; display:flex; justify-content:space-between; align-items:flex-end;">
                    <div>
                        <h1 style="margin:0; font-size:28px; font-weight:800;">Messages</h1>
                        <p style="color:#64748b; margin-bottom:0;">WhatsApp Business API Inbox</p>
                    </div>
                    <button class="btn-action btn-view" style="padding:8px 16px; font-size:12px;" onclick="downloadInboxCSV()">Export CSV</button>
                </div>
                <div class="inbox-container">
                    <div class="inbox-list">
                        <div class="inbox-search">
                            <input type="text" placeholder="Search conversations..." id="inbox-search-input" onkeyup="filterConversations()">
                        </div>
                        <div class="conversations" id="conversations-list">
                            <!-- Populated by JS -->
                            <div style="padding:40px; text-align:center; color:#94a3b8;">Loading...</div>
                        </div>
                    </div>
                    <div class="chat-area" id="chat-area" style="display:none;">
                        <div class="chat-header">
                            <h3 id="chat-header-name">Select a conversation</h3>
                            <button class="btn-mini btn-view" onclick="loadConversations()">Refresh</button>
                        </div>
                        <div class="chat-messages" id="chat-messages">
                            <!-- Populated by JS -->
                        </div>
                        <div class="chat-input-area">
                            <input type="text" id="chat-composer" placeholder="Type a message..." onkeypress="if(event.keyCode===13) sendChatMessage()">
                            <button class="btn-action btn-approve" onclick="sendChatMessage()">SEND</button>
                        </div>
                    </div>
                    <div class="chat-area" id="chat-empty" style="align-items:center; justify-content:center; color:#94a3b8;">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:20px; opacity:0.5;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        Select a conversation to start messaging
                    </div>
                </div>
            </div>

            <!-- LEADS SECTIONS -->
            <div id="leads-guest" class="section">
                <div class="card-table">
                    <div class="table-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h2>Guest Lead Registry</h2>
                        <button class="btn-mini btn-view" onclick="downloadTableCSV('table-leads-guest', 'Guest_Leads')">Export CSV</button>
                    </div>
                    <div class="table-wrap">
                        <table id="table-leads-guest">
                            <thead>
                                <tr><th>Timestamp</th><th>Phone</th><th>Status</th><th>Action</th></tr>
                            </thead>
                            <tbody id="leads-guest-body">
                                <tr><td colspan="4" style="text-align:center; padding:20px;">Loading Guest leads...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div id="leads-vvip" class="section">
                <div class="card-table">
                    <div class="table-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h2>VVIP Lead Registry</h2>
                        <button class="btn-mini btn-view" onclick="downloadTableCSV('table-leads-vvip', 'VVIP_Leads')">Export CSV</button>
                    </div>
                    <div class="table-wrap">
                        <table id="table-leads-vvip">
                            <thead>
                                <tr><th>Timestamp</th><th>Phone</th><th>Status</th><th>Action</th></tr>
                            </thead>
                            <tbody id="leads-vvip-body">
                                <tr><td colspan="4" style="text-align:center; padding:20px;">Loading VVIP leads...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div id="leads-vip" class="section">
                <div class="card-table">
                    <div class="table-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h2>VIP Lead Registry</h2>
                        <button class="btn-mini btn-view" onclick="downloadTableCSV('table-leads-vip', 'VIP_Leads')">Export CSV</button>
                    </div>
                    <div class="table-wrap">
                        <table id="table-leads-vip">
                            <thead>
                                <tr><th>Timestamp</th><th>Phone</th><th>Status</th><th>Action</th></tr>
                            </thead>
                            <tbody id="leads-vip-body">
                                <tr><td colspan="4" style="text-align:center; padding:20px;">Loading VIP leads...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- ABANDONED SECTION -->
            <div id="abandoned" class="section">
                <div class="card-table">
                    <div class="table-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h2>Abandoned Carts (Awaiting Payment)</h2>
                        <button class="btn-mini btn-view" onclick="downloadTableCSV('table-abandoned', 'Abandoned_Carts')">Export CSV</button>
                    </div>
                    <div class="table-wrap">
                        <table id="table-abandoned">
                            <thead>
                                <tr><th>Timestamp</th><th>Name</th><th>Phone</th><th>Category</th><th>Qty</th><th>Amount</th><th>Action</th></tr>
                            </thead>
                            <tbody id="abandoned-body">
                                <tr><td colspan="7" style="text-align:center; padding:20px;">Loading abandoned carts...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- PENDING SECTION -->
            <div id="pending" class="section">
                <div class="card-table">
                    <div class="table-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h2>Not Approved Tickets</h2>
                        <button class="btn-mini btn-view" onclick="downloadTableCSV('table-not-approved', 'Not_Approved_Tickets')">Export CSV</button>
                    </div>
                    <div class="table-wrap">
                        <table id="table-not-approved">
                            <thead>
                                <tr><th>Booking</th><th>Date/Time (Oman)</th><th>Phone</th><th>Category</th><th>Qty</th><th>Verification</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                                ${pendingRows.map(b => {
            const txid = b.bank_transaction_id ? b.bank_transaction_id.toUpperCase() : null;
            const isDup = txid && txIdMap[txid] && txIdMap[txid].length > 1;
            const dupConflicting = isDup ? txIdMap[txid].filter(no => no !== b.booking_no) : [];

            return `
                                <tr id="row-${b.booking_no}">
                                    <td><strong>${formatSerial(b.booking_no)}</strong></td>
                                    <td style="font-size:12px; color:#64748b;">${formatOmanTime(b.timestamp)}</td>
                                    <td>
                                        <div style="font-weight:700;">${b.phone}</div>
                                        <div style="font-size:11px; color:#64748b;">${b.category} x ${b.quantity}</div>
                                    </td>
                                    <td>
                                        <div style="font-size:12px;"><strong>TXID:</strong> ${b.bank_transaction_id || '-'}</div>
                                        <div style="font-size:12px;"><strong>Amt:</strong> OMR ${b.bank_amount || '-'}</div>
                                    </td>
                                    <td>
                                        ${isDup ? `<div style="color:var(--danger); font-size:10px; font-weight:800; margin-bottom:5px;">⚠️ DUPLICATE TXN ID</div>` : ''}
                                        ${isDup ? `<div style="font-size:9px; color:#64748b;">Conflicting: ${dupConflicting.join(', ')}</div>` : ''}
                                        <div style="font-size:11px; color:#64748b;">${b.bank_beneficiary || '-'} (${b.bank_mobile || '-'})</div>
                                    </td>
                                    <td>
                                        <div style="display:flex; gap:8px;">
                                            <a href="${b.payment_slip_url}" target="_blank" class="btn-view">Slip</a>
                                            <button onclick="approveBooking('${b.booking_no}')" class="btn-action btn-approve" id="btn-${b.booking_no}">Approve</button>
                                        </div>
                                    </td>
                                </tr>`;
        }).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="pagination" id="pag-pending"></div>
                </div>
            </div>

            <!-- APPROVED SECTION -->
            <div id="approved" class="section">
               <div class="card-table">
                     <div class="table-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h2>Approved Tickets History</h2>
                        <button class="btn-mini btn-view" onclick="downloadTableCSV('table-approved-history', 'Approved_Tickets')">Export CSV</button>
                    </div>
                    <div class="table-wrap">
                        <table id="table-approved-history">
                            <thead>
                                <tr><th>Booking</th><th>Date/Time</th><th>Customer</th><th>Bank Info</th><th>Total</th><th>Status</th><th>Entry</th></tr>
                            </thead>
                            <tbody>
                                ${approvedRows.map(b => `
                                <tr>
                                    <td><strong>${formatSerial(b.booking_no)}</strong></td>
                                    <td style="font-size:12px; color:#64748b;">${formatOmanTime(b.timestamp)}</td>
                                    <td>
                                        <div style="font-weight:700;">${b.phone}</div>
                                        <div style="font-size:11px; color:#64748b;">${b.category} x ${b.quantity}</div>
                                    </td>
                                    <td>
                                        <div style="font-size:11px;"><strong>TXID:</strong> ${b.bank_transaction_id || '-'}</div>
                                        <div style="font-size:11px;"><strong>Ben:</strong> ${b.bank_beneficiary || '-'}</div>
                                    </td>
                                    <td><strong>OMR ${parseFloat(b.amount).toFixed(2)}</strong></td>
                                    <td><span class="badge paid">APPROVED</span></td>
                                    <td><span class="badge ${b.entry_status ? 'scanned' : 'unused'}">${b.entry_status ? 'IN' : 'OUT'}</span></td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="pagination" id="pag-approved"></div>
                </div>
            </div>

            <!-- BALANCE SECTION -->
            <div id="balance" class="section">
                <div style="margin-bottom: 30px;">
                    <h1 style="margin:0; font-size:28px; font-weight:800;">Financial Overview</h1>
                    <p style="color:#64748b;">Live revenue and receivable tracking</p>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <h3>Total Collected (Approved)</h3>
                        <span class="val" style="color:var(--success);">OMR ${collected.toFixed(2)}</span>
                        <p style="color:#64748b; font-size:12px; margin:0;">Money in bank</p>
                    </div>
                    <div class="stat-card">
                        <h3>Total Receivable (Pending)</h3>
                        <span class="val" style="color:var(--warning);">OMR ${receivable.toFixed(2)}</span>
                        <p style="color:#64748b; font-size:12px; margin:0;">Awaiting verification</p>
                    </div>
                    <div class="stat-card">
                        <h3>Grand Total Revenue</h3>
                        <span class="val" style="color:var(--primary);">OMR ${totalRevenue.toFixed(2)}</span>
                        <p style="color:#64748b; font-size:12px; margin:0;">Cumulative sales</p>
                    </div>
                </div>

                <div class="card-table">
                    <div class="table-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h2>All Transactions Log</h2>
                        <button class="btn-mini btn-view" onclick="downloadTableCSV('table-transactions', 'All_Transactions')">Export CSV</button>
                    </div>
                    <div class="table-wrap">
                        <table id="table-transactions">
                            <thead>
                                <tr><th>Booking</th><th>Date/Time</th><th>Customer Info</th><th>Bank Transaction</th><th>Total Amt</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                ${bookingRows.map(b => `
                                <tr>
                                    <td><strong>${formatSerial(b.booking_no)}</strong></td>
                                    <td style="font-size:12px; color:#64748b;">${formatOmanTime(b.timestamp)}</td>
                                    <td>${b.phone}</td>
                                    <td>${b.category}</td>
                                    <td><strong>OMR ${parseFloat(b.amount).toFixed(2)}</strong></td>
                                    <td><span class="badge ${b.payment_status === 'approved' ? 'paid' : 'pending'}">${b.payment_status}</span></td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="pagination" id="pag-balance"></div>
                </div>
            </div>
            ` : ''}

            <!-- SCANNER SECTION -->
            <div id="scanner" class="section ${!isAdmin ? 'active' : ''}">
                <div id="scanner-ui" style="padding-top:20px;">
                    <div style="text-align:center; margin-bottom:30px;">
                        <h2 style="font-weight:800; font-size:24px;">Ticket Verification</h2>
                        <p style="color:#64748b;">Open camera or enter 12-digit ticket ID</p>
                        
                        <input type="text" id="manual-ticket-input" placeholder="Enter 12-digit ID" maxlength="12" style="padding:15px; font-size:18px; text-align:center; border:2px solid #e2e8f0; border-radius:12px; margin-top:10px; width:100%; max-width:300px; text-transform:uppercase;">
                        <br>
                        
                        <button class="btn-action btn-approve" style="padding:15px 40px; font-size:16px; margin-top:20px;" onclick="startScanner()">OPEN CAMERA</button>
                    </div>
                    
                    <div id="scanner-container" style="display:none; position:relative;">
                        <div id="reader"></div>
                        <div id="scanner-error" style="background:var(--danger); color:white; padding:10px; font-size:12px; display:none; text-align:center; border-radius:0 0 20px 20px;"></div>
                        <button class="btn-logout" style="margin-top:20px;" onclick="stopScanner()">CANCEL SCAN</button>
                    </div>
                </div>
            </div>

            <!-- HISTORY SECTION -->
            <div id="history" class="section">
                <div class="card-table">
                    <div class="table-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h2>Verified Attendee Registry</h2>
                        <button class="btn-mini btn-view" onclick="downloadTableCSV('table-verified-history', 'Verified_Attendees')">Export CSV</button>
                    </div>
                    <div class="table-wrap">
                        <table id="table-verified-history">
                            <thead>
                                <tr><th>Booking</th><th>Booking Time</th><th>Category</th><th>Qty</th><th>Phone</th><th>Entry Time</th></tr>
                            </thead>
                            <tbody>
                                ${verifiedRows.map(v => `
                                <tr>
                                    <td><strong>${formatSerial(v.booking_no)}</strong></td>
                                    <td style="font-size:12px; color:#64748b;">${formatOmanTime(v.timestamp)}</td>
                                    <td>${v.category}</td>
                                    <td>${v.quantity}</td>
                                    <td>${v.phone}</td>
                                    <td><span style="font-weight:700; color:var(--success);">${v.entry_status}</span></td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="pagination" id="pag-history"></div>
                </div>
            </div>

            ${isAdmin ? `
            <!-- ADMINS SECTION -->
            <div id="admins" class="section">
                <div style="margin-bottom: 30px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h1 style="margin:0; font-size:28px; font-weight:800;">Admin Management</h1>
                        <p style="color:#64748b;">Manage staff access and notifications</p>
                    </div>
                    <button class="btn-action btn-approve" onclick="document.getElementById('add-admin-modal').style.display='flex'">+ Add Staff</button>
                </div>

                <div class="card-table">
                    <div class="table-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h2>Authorized Personnel</h2>
                        <button class="btn-mini btn-view" onclick="downloadTableCSV('table-admins-list', 'Authorized_Personnel')">Export CSV</button>
                    </div>
                    <div class="table-wrap">
                        <table id="table-admins-list">
                            <thead>
                                <tr><th>Name</th><th>WhatsApp Number</th><th>Role</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                                ${adminRows.map(a => `
                                <tr>
                                    <td><strong>${a.name}</strong></td>
                                    <td>${a.phone}</td>
                                    <td><span class="badge ${a.role === 'admin' ? 'paid' : 'unused'}">${a.role}</span></td>
                                    <td>
                                        <button onclick="deleteAdmin('${a.phone}')" class="btn-action" style="background:var(--danger); color:white;">Remove</button>
                                    </td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                </div>
            </div>
            </div>

            <!-- SETTINGS SECTION -->
            <div id="settings" class="section">
                <div style="margin-bottom: 30px;">
                    <h1 style="margin:0; font-size:28px; font-weight:800;">System Settings</h1>
                    <p style="color:#64748b;">Configure global bot variables and payment details</p>
                </div>
                
                <div class="card-table">
                    <div class="table-header"><h2>Payment Configuration</h2></div>
                    <div style="padding: 30px;">
                        <div style="margin-bottom:25px;">
                            <label style="display:block; font-weight:700; color:var(--primary); margin-bottom:10px;">Payment QR Image URL</label>
                            <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
                                <input type="text" id="setting-qr-url" class="edit-input" style="flex:1; text-align:left; padding:15px; font-weight:normal;" placeholder="https://...">
                                <span style="color:#64748b; font-weight:700;">OR</span>
                                <input type="file" id="qr-upload-input" accept="image/*" style="display:none;" onchange="handleQRUpload(this)">
                                <button class="btn-action" style="background:#f1f5f9; color:var(--primary); padding:15px 25px;" onclick="document.getElementById('qr-upload-input').click()">📁 Upload Image</button>
                            </div>
                            <p style="font-size:12px; color:#64748b; margin-top:5px;">Public URL OR upload a new image directly.</p>
                        </div>
                        <div style="margin-bottom:25px;">
                            <label style="display:block; font-weight:700; color:var(--primary); margin-bottom:10px;">Payment Mobile Number</label>
                            <input type="text" id="setting-mobile" class="edit-input" style="width:100%; text-align:left; padding:15px; font-weight:normal;" placeholder="+968 ...">
                            <p style="font-size:12px; color:#64748b; margin-top:5px;">Mobile number displayed for mobile transfers.</p>
                        </div>
                        <button class="btn-action btn-approve" style="padding:15px 40px; font-size:16px;" onclick="saveAllSettings()">SAVE SETTINGS</button>
                    </div>
                </div>
            </div>
            ` : ''}
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
            document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
            document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
            var target = document.getElementById(id);
            if (target) target.classList.add('active');
            if (el) el.classList.add('active');
            if (id !== 'scanner') stopScanner();
            if (id === 'inbox') loadConversations(); // Automatically load inbox data
            if (id === 'abandoned') loadAbandonedCarts();
            if (window.innerWidth < 900) toggleMenu();
        }

        // --- Pagination Logic ---
        var ITEMS_PER_PAGE = 25;
        var state = {
            pending: 1,
            approved: 1,
            balance: 1,
            history: 1
        };

        function renderPagination(id) {
            var table = document.querySelector('#' + id + ' table');
            if (!table) return;
            var rows = Array.from(table.tBodies[0].rows);
            var totalPages = Math.ceil(rows.length / ITEMS_PER_PAGE);
            var container = document.getElementById('pag-' + id);
            
            if (!container) return;
            if (rows.length === 0) {
                container.innerHTML = '';
                return;
            }

            var currentPage = state[id];
            
            // Show/Hide rows
            rows.forEach(function(row, idx) {
                row.style.display = (idx >= (currentPage - 1) * ITEMS_PER_PAGE && idx < currentPage * ITEMS_PER_PAGE) ? '' : 'none';
            });

            container.innerHTML = '';
            
            var prevBtn = document.createElement('button');
            prevBtn.className = 'page-btn';
            prevBtn.innerText = 'Prev';
            if (currentPage === 1) prevBtn.disabled = true;
            prevBtn.onclick = function() { setPage(id, currentPage - 1); };
            
            var info = document.createElement('div');
            info.className = 'page-info';
            info.innerText = 'Page ' + currentPage + ' of ' + (totalPages || 1);
            
            var nextBtn = document.createElement('button');
            nextBtn.className = 'page-btn';
            nextBtn.innerText = 'Next';
            if (currentPage === totalPages || totalPages === 0) nextBtn.disabled = true;
            nextBtn.onclick = function() { setPage(id, currentPage + 1); };
            
            container.appendChild(prevBtn);
            container.appendChild(info);
            container.appendChild(nextBtn);
        }

        function setPage(id, page) {
            state[id] = page;
            renderPagination(id);
        }

        function toggleMenu() {
            var sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('open');
        }

        async function approveBooking(bookingNo) {
            if (!confirm('Authorize payment for ' + bookingNo + '?')) return;
            var btn = document.getElementById('btn-' + bookingNo);
            if (btn) { btn.disabled = true; btn.innerText = 'Syncing...'; }
            try {
                var response = await fetch('/admin/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bookingNo: bookingNo })
                });
                var data = await response.json();
                if (data.success) { location.reload(); } else { alert('Error: ' + data.error); if(btn) { btn.disabled = false; btn.innerText = 'Approve'; } }
            } catch (e) { alert('Network Error'); if(btn) { btn.disabled = false; btn.innerText = 'Approve'; } }
        }

        function toggleInvEdit(cat) {
            var el = document.getElementById('edit-' + cat);
            if (el) el.classList.toggle('active');
        }

        async function saveInventory(category) {
            var total = document.getElementById('input-' + category).value;
            try {
                var res = await fetch('/admin/inventory/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category: category, total_seats: total })
                });
                if (res.ok) { location.reload(); } else { alert('Update Failed'); }
            } catch (e) { alert('Network Error'); }
        }

        // --- Scanner Logic ---
        var html5QrCode = null;
        var activeTicketId = null;

        function startScanner() {
            document.getElementById('scanner-container').style.display = 'block';
            document.getElementById('scanner-error').style.display = 'none';
            if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
            
            var config = { fps: 10, qrbox: { width: 250, height: 250 } };
            html5QrCode.start({ facingMode: "environment" }, config, async function(text) {
                var tId = text;
                try { var url = new URL(text); tId = url.searchParams.get("id") || text; } catch(e){}
                stopScanner();
                processTicket(tId);
            }).catch(function(err) {
                document.getElementById('scanner-error').style.display = 'block';
                document.getElementById('scanner-error').innerText = err;
            });
        }

        function stopScanner() {
            if (html5QrCode) html5QrCode.stop().catch(function() {});
            document.getElementById('scanner-container').style.display = 'none';
        }

        document.addEventListener('DOMContentLoaded', function() {
            var manualInput = document.getElementById('manual-ticket-input');
            if (manualInput) {
                manualInput.addEventListener('input', function(e) {
                    this.value = this.value.toUpperCase();
                    if (this.value.length === 12) {
                        processTicket(this.value);
                        this.value = '';
                        this.blur();
                    }
                });
            }
        });

        async function processTicket(tId) {
            activeTicketId = tId;
            var overlay = document.getElementById('res-overlay');
            var h = document.getElementById('res-header');
            if (overlay) overlay.style.display = 'flex';
            if (h) {
                h.innerHTML = '<h2>Checking Database...</h2>';
                h.style.background = '#64748b';
            }

            try {
                var res = await fetch('/verify/scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketId: tId })
                });
                var data = await res.json();
                
                if (!res.ok) {
                    if (h) { h.innerHTML = '<h2>INVALID TICKET</h2>'; h.style.background = 'var(--danger)'; }
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
                document.getElementById('res-bno').innerText = 'MMN-' + String(data.ticket.booking_no).padStart(4, '0');
                document.getElementById('res-cat').innerText = data.ticket.category;
                document.getElementById('res-qty').innerText = data.ticket.quantity;

                if (data.status === 'already_scanned') {
                    if (h) { h.innerHTML = '<h2>ALREADY USED</h2>'; h.style.background = 'var(--warning)'; }
                    document.getElementById('res-actions').style.display = 'none';
                    document.getElementById('btn-err-close').style.display = 'block';
                    document.getElementById('res-error').style.display = 'block';
                    document.getElementById('res-err-txt').innerHTML = 'Already Checked In at:<br><strong>' + data.ticket.entry_status + '</strong>';
                } else {
                    if (h) { h.innerHTML = '<h2>VALID TICKET</h2>'; h.style.background = 'var(--success)'; }
                    document.getElementById('res-actions').style.display = 'block';
                }
            } catch(e) { alert('Verif Error'); closeOverlay(); }
        }

        async function confirmEntrance() {
            var btn = document.getElementById('btn-grant');
            if (btn) { btn.disabled = true; btn.innerText = 'Granting...'; }
            try {
                var res = await fetch('/verify/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketId: activeTicketId })
                });
                if (res.ok) {
                    document.getElementById('res-header').innerHTML = '<h2>ENTRY GRANTED</h2>';
                    document.getElementById('res-actions').innerHTML = '<button class="btn-action btn-approve" style="width:100%; background:#222;" onclick="location.reload()">NEXT CUSTOMER</button>';
                } else { alert('Confirmation Failed'); if(btn) btn.disabled = false; }
            } catch(e) { alert('Network Error'); if(btn) btn.disabled = false; }
        }

        function closeOverlay() {
            document.getElementById('res-overlay').style.display = 'none';
            document.getElementById('res-details').style.display = 'none';
            document.getElementById('res-actions').style.display = 'none';
            document.getElementById('btn-err-close').style.display = 'none';
            startScanner();
        }

        // Auto-tab if coming from QR link
        async function loadSettings() {
            try {
                const res = await fetch('/admin/settings');
                const data = await res.json();
                data.forEach(s => {
                    if (s.setting_key === 'payment_qr_url') document.getElementById('setting-qr-url').value = s.setting_value || '';
                    if (s.setting_key === 'payment_mobile') document.getElementById('setting-mobile').value = s.setting_value || '';
                });
            } catch(e) { console.error("Load settings failed", e); }
        }

        async function saveSetting(key, value) {
            return fetch('/admin/settings/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value })
            });
        }

        async function handleQRUpload(input) {
            if (!input.files || !input.files[0]) return;
            const file = input.files[0];
            const formData = new FormData();
            formData.append('qr_image', file);
            
            try {
                const res = await fetch('/admin/settings/upload-qr', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (data.success) {
                    document.getElementById('setting-qr-url').value = data.url;
                    alert('QR Code uploaded and preview updated. Click "SAVE SETTINGS" to finalize.');
                } else {
                    alert('Upload failed: ' + data.error);
                }
            } catch (e) {
                alert('Upload Error');
            }
        }

        async function saveAllSettings() {
            const qr = document.getElementById('setting-qr-url').value;
            const mobile = document.getElementById('setting-mobile').value;
            
            try {
                await saveSetting('payment_qr_url', qr);
                await saveSetting('payment_mobile', mobile);
                alert('Settings saved successfully!');
                location.reload();
            } catch(e) { alert('Failed to save settings'); }
        }

        window.addEventListener('load', function() {
            ['pending', 'approved', 'balance', 'history'].forEach(function(id) { renderPagination(id); });
            loadSettings();
            
            var params = new URLSearchParams(window.location.search);
            if (params.has('id')) {
                showTab('scanner');
                processTicket(params.get('id'));
            }
        });

        // --- Inbox Logic ---
        var activeChatPhone = null;
        var chatOffset = 0;
        var chatLimit = 20;
        var conversationsOffset = 0;
        var conversationsLimit = 20;

        function renderMessageBubble(msg) {
            var time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            var typeClass = msg.direction === 'inbound' ? 'msg-inbound' : 'msg-outbound';
            
            var content = msg.content || '';
            if (msg.message_type === 'image' && msg.media_url) {
                content = '<a href="' + msg.media_url + '" target="_blank" style="color:inherit; text-decoration:underline;">[View Image]</a><br>' + content;
            } else if (msg.message_type === 'document' && msg.media_url) {
                 content = '<a href="' + msg.media_url + '" target="_blank" style="color:inherit; text-decoration:underline;">[Download Document]</a><br>' + content;
            }

            return '<div class="msg-bubble ' + typeClass + '">' +
                        content +
                        '<span class="msg-time">' + time + '</span>' +
                        '</div>';
        }

        async function loadPreviousMessages() {
            var btn = document.getElementById('btn-load-more');
            if (!btn || !activeChatPhone) return;
            
            btn.disabled = true;
            btn.innerText = 'Loading...';
            
            chatOffset += chatLimit;
            try {
                var res = await fetch('/admin/inbox/messages/' + activeChatPhone + '?limit=' + chatLimit + '&offset=' + chatOffset);
                var messages = await res.json();
                
                var chatBox = document.getElementById('chat-messages');
                var oldHeight = chatBox.scrollHeight;

                if (!Array.isArray(messages) || messages.length === 0) {
                    btn.style.display = 'none';
                    return;
                }

                // Messages arrive DESC (latest first). To prepend in order, we reverse to ASC.
                var newHtml = '';
                messages.reverse().forEach(function(msg) {
                    newHtml += renderMessageBubble(msg);
                });

                var tempDiv = document.createElement('div');
                tempDiv.innerHTML = newHtml;
                // Insert after the button
                while (tempDiv.firstChild) {
                    chatBox.insertBefore(tempDiv.firstChild, btn.nextSibling);
                }

                // Adjust scroll to maintain position
                chatBox.scrollTop = chatBox.scrollHeight - oldHeight;
                
                if (messages.length < chatLimit) btn.style.display = 'none';
                else {
                    btn.disabled = false;
                    btn.innerText = 'Load Previous (20)';
                }
            } catch (e) {
                console.error("Load previous error", e);
                btn.disabled = false;
                btn.innerText = 'Retry Load';
            }
        }

        // Connect to Socket.IO server for real-time updates
        var socket = io();
        socket.on('new_message', function(msg) {
            // Always refresh the conversation sidebar list
            loadConversations();

            // If this message is for the currently open chat, append it immediately
            if (activeChatPhone && msg.phone === activeChatPhone) {
                var chatBox = document.getElementById('chat-messages');
                if (chatBox) {
                    var bubbleHtml = renderMessageBubble(msg);
                    var tempDiv = document.createElement('div');
                    tempDiv.innerHTML = bubbleHtml;
                    chatBox.appendChild(tempDiv.firstChild);
                    chatBox.scrollTop = chatBox.scrollHeight;
                    // Auto mark-read since user is viewing this conversation
                    if (msg.direction === 'inbound') markRead(activeChatPhone);
                }
            }
        });

        async function markRead(phone) {
            try {
                await fetch('/admin/inbox/mark-read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: phone })
                });
            } catch(e) {}
        }

        async function loadConversations(append = false) {
            try {
                if (!append) conversationsOffset = 0;
                var res = await fetch('/admin/inbox/conversations?limit=' + conversationsLimit + '&offset=' + conversationsOffset);
                var data = await res.json();
                var list = document.getElementById('conversations-list');

                if (!list) return;
                
                // Remove old "Load More" button if it exists
                var oldBtn = document.getElementById('btn-load-more-convs');
                if (oldBtn) oldBtn.remove();

                if (!append) {
                    list.innerHTML = '';
                    if (data.length === 0) {
                        list.innerHTML = '<div style="padding:40px; text-align:center; color:#94a3b8;">No messages yet.</div>';
                        return;
                    }
                }

                data.forEach(function(conv) {
                    var el = document.createElement('div');
                    el.className = 'conversation-item';
                    el.setAttribute('data-phone', conv.phone);
                    if (conv.phone === activeChatPhone) el.classList.add('active');
                    
                    var time = new Date(conv.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    var preview = conv.message_type === 'text' ? (conv.content || '') : '[' + conv.message_type + ']';
                    var unread = parseInt(conv.unread_count || 0);
                    var nameDisplay = conv.phone;
                    try {
                        if (conv.temp_members) {
                            var members = typeof conv.temp_members === 'string' ? JSON.parse(conv.temp_members) : conv.temp_members;
                            if (members && members.length > 0) nameDisplay = members[0] + ' (' + conv.phone + ')';
                        }
                    } catch(e) {}

                    var badgeHtml = unread > 0 ? '<span class="unread-badge">' + unread + '</span>' : '';
                    el.innerHTML = '<span class="conversation-time">' + time + '</span>' +
                                   '<div class="conversation-phone">' + nameDisplay + badgeHtml + '</div>' +
                                   '<div class="conversation-preview">' + preview + '</div>';
                                   
                    el.onclick = function() { openChat(conv.phone, nameDisplay); };
                    list.appendChild(el);
                });

                if (data.length >= conversationsLimit) {
                    var moreBtn = document.createElement('div');
                    moreBtn.id = 'btn-load-more-convs';
                    moreBtn.style = 'padding:15px; text-align:center; cursor:pointer; color:var(--primary); font-weight:800; font-size:13px; border-top:1px solid #f1f5f9;';
                    moreBtn.innerText = 'LOAD MORE CONTACTS (20)';
                    moreBtn.onclick = function(e) {
                        e.stopPropagation();
                        conversationsOffset += conversationsLimit;
                        loadConversations(true);
                    };
                    list.appendChild(moreBtn);
                }
            } catch (e) {
                console.error("Failed to load conversations:", e);
            }
        }

        function filterConversations() {
            var input = document.getElementById('inbox-search-input').value.toLowerCase();
            document.querySelectorAll('.conversation-item').forEach(function(el) {
                if (el.innerText.toLowerCase().includes(input)) el.style.display = '';
                else el.style.display = 'none';
            });
        }

        async function loadEnquiries() {
            try {
                const res = await fetch('/admin/enquiries');
                const enquiries = await res.json();
                
                const tiers = ['GUEST', 'VVIP', 'VIP'];
                tiers.forEach(tier => {
                    const body = document.getElementById('leads-' + tier.toLowerCase() + '-body');
                    if (!body) return;
                    
                    const filtered = enquiries.filter(e => e.category === tier);
                    body.innerHTML = filtered.map(function(e) {
                         var date = new Date(e.timestamp).toLocaleString('en-GB');
                         var badgeClass = (e.status && e.status.toLowerCase() === 'new') ? 'pending' : 'scanned';
                         return '<tr>' +
                             '<td>' + date + '</td>' +
                             '<td><strong>' + e.phone + '</strong></td>' +
                             '<td><span class="badge ' + badgeClass + '">' + e.status + '</span></td>' +
                             '<td>' +
                                 '<button class="btn-view" onclick="openChat(\\\'' + e.phone + '\\\', \\\'' + e.phone + '\\\')">Open Chat</button>' +
                             '</td>' +
                         '</tr>';
                    }).join('') || '<tr><td colspan="4" style="text-align:center; padding:20px;">No leads found</td></tr>';
                });
            } catch (e) {
                console.error("Failed to load enquiries", e);
            }
        }

        async function loadAbandonedCarts() {
            try {
                const res = await fetch('/admin/abandoned');
                const carts = await res.json();
                const body = document.getElementById('abandoned-body');
                if (!body) return;
                
                body.innerHTML = carts.map(function(c) {
                    var date = new Date(c.timestamp).toLocaleString('en-GB');
                    // Escape single quotes in names to prevent syntax errors in onclick
                    var escapedName = c.name.replace(/'/g, "\\\\'");
                    var nameDisplay = escapedName + ' (' + c.phone + ')';

                    return '<tr>' +
                        '<td>' + date + '</td>' +
                        '<td><strong>' + c.name + '</strong></td>' +
                        '<td>' + c.phone + '</td>' +
                        '<td>' + c.category + '</td>' +
                        '<td>' + c.quantity + '</td>' +
                        '<td>OMR ' + parseFloat(c.amount).toFixed(2) + '</td>' +
                        '<td>' +
                            '<div style="display:flex; gap:8px;">' +
                                '<button class="btn-view" onclick="openChat(\\\'' + c.phone + '\\\', \\\'' + nameDisplay + '\\\')">Message</button>' +
                                '<button class="btn-action btn-approve" onclick="manualApproveCart(\\\'' + c.phone + '\\\', \\\'' + escapedName + '\\\', \\\'' + c.category + '\\\', ' + c.quantity + ', ' + c.amount + ')">Approve</button>' +
                            '</div>' +
                        '</td>' +
                    '</tr>';
                }).join('') || '<tr><td colspan="7" style="text-align:center; padding:20px;">No abandoned carts yet.</td></tr>';
            } catch (e) {
                console.error("Failed to load abandoned carts", e);
            }
        }

        async function manualApproveCart(phone, name, category, quantity, amount) {
            if (!confirm('Manually approve and send ticket for ' + name + ' (' + phone + ')?')) return;
            try {
                const res = await fetch('/admin/abandoned/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, name, category, quantity, amount })
                });
                const data = await res.json();
                if (data.success) {
                    alert('Ticket generated and sent successfully!');
                    loadAbandonedCarts();
                } else {
                    alert('Error: ' + data.error);
                }
            } catch (e) {
                alert('Network Error');
            }
        }

        // Periodic refresh for leads
        setInterval(loadEnquiries, 30000); // 30s
        setInterval(loadAbandonedCarts, 30000); // Also refresh abandoned
        loadEnquiries();
        loadAbandonedCarts();

        async function openChat(phone, nameDisplay) {
            // Automatically switch to the Inbox tab so the chat is visible
            var inboxNav;
            document.querySelectorAll('.nav-item').forEach(function(n) {
                if (n.innerText.includes('Inbox')) inboxNav = n;
            });
            showTab('inbox', inboxNav);

            activeChatPhone = phone;
            chatOffset = 0;
            document.getElementById('chat-empty').style.display = 'none';
            document.getElementById('chat-area').style.display = 'flex';
            document.getElementById('chat-header-name').innerText = nameDisplay || phone;
            document.getElementById('chat-messages').innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8;">Loading...</div>';
            
            // Highlight selected
            document.querySelectorAll('.conversation-item').forEach(function(el) { el.classList.remove('active'); });
            var activeEl = document.querySelector('.conversation-item[data-phone="'+phone+'"]');
            if (activeEl) activeEl.classList.add('active');

            // Mark all inbound messages as read
            markRead(phone);
            // Refresh sidebar to clear the unread badge
            loadConversations();

            try {
                var res = await fetch('/admin/inbox/messages/' + phone + '?limit=' + chatLimit + '&offset=0');
                var messages = await res.json();
                
                var chatHtml = '';
                if (Array.isArray(messages)) {
                    if (messages.length >= chatLimit) {
                        chatHtml += '<button id="btn-load-more" class="page-btn" style="width:100%; margin-bottom:20px;" onclick="loadPreviousMessages()">Load Previous (20)</button>';
                    }

                    // Messages are DESC from API, reverse to ASC for display
                    messages.reverse().forEach(function(msg) {
                        chatHtml += renderMessageBubble(msg);
                    });
                } else {
                    chatHtml = '<div style="text-align:center; padding:20px; color:var(--danger);">Error: ' + (messages.error || 'Failed to load messages') + '</div>';
                }
                
                var chatBox = document.getElementById('chat-messages');
                chatBox.innerHTML = chatHtml;
                chatBox.scrollTop = chatBox.scrollHeight;
            } catch (e) {
                console.error("Failed to load chat history", e);
            }
        }

        async function sendChatMessage() {
            var input = document.getElementById('chat-composer');
            var text = input.value.trim();
            if (!text || !activeChatPhone) return;
            
            input.disabled = true;
            try {
                var res = await fetch('/admin/inbox/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: activeChatPhone, message: text })
                });
                if (res.ok) {
                    input.value = '';
                    openChat(activeChatPhone, document.getElementById('chat-header-name').innerText);
                    loadConversations();
                } else {
                    alert('Failed to send message');
                }
            } catch (e) {
                alert('Network Error');
            }
            input.disabled = false;
            input.focus();
        }


        async function addAdmin() {
            var phone = document.getElementById('new-admin-phone').value;
            var name = document.getElementById('new-admin-name').value;
            var role = document.getElementById('new-admin-role').value;
            if (!phone) return alert('Phone required');
            try {
                var res = await fetch('/admin/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, name, role })
                });
                if (res.ok) location.reload(); else alert('Failed to add');
            } catch(e) { alert('Error'); }
        }

        async function deleteAdmin(phone) {
            if (!confirm('Remove admin ' + phone + '?')) return;
            try {
                var res = await fetch('/admin/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: phone })
                });
                if (res.ok) location.reload(); else alert('Failed to delete');
            } catch(e) { alert('Error'); }
        }
        function triggerDownload(csvContent, filename) {
            var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            var link = document.createElement("a");
            if (link.download !== undefined) {
                var url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", filename);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        }

        function downloadTableCSV(tableId, title) {
            var table = document.getElementById(tableId);
            if (!table) return;
            var rows = table.querySelectorAll('tr');
            var csv = [];
            for (var i = 0; i < rows.length; i++) {
                var row = [], cols = rows[i].querySelectorAll('td, th');
                for (var j = 0; j < cols.length; j++) {
                    var clone = cols[j].cloneNode(true);
                    var buttons = clone.querySelectorAll('button, a.btn-view, a.btn-action');
                    buttons.forEach(b => b.remove());
                    // Double escape backslashes so they survive the Node template literal evaluation
                    var text = clone.innerText.replace(/"/g, '""').replace(/(\\r\\n|\\n|\\r)/gm, " | ").trim();
                    row.push('"' + text + '"');
                }
                csv.push(row.join(','));
            }
            triggerDownload(csv.join('\\n'), title + '.csv');
        }

        function downloadInboxCSV() {
            window.location.href = '/admin/inbox/export-csv';
        }
    </script>


    <!-- Add Admin Modal -->
        <div id="add-admin-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:none; justify-content:center; align-items:center; z-index:2000;">
            <div style="background:white; padding:40px; border-radius:30px; width:90%; max-width:400px;">
                <h2 style="margin-top:0;">Add New Staff</h2>
                <p style="color:#64748b; font-size:14px;">They will receive OTPs and payment notifications via WhatsApp.</p>
                <input type="text" id="new-admin-name" placeholder="Staff Name" class="edit-input" style="width:100%; margin-bottom:15px; text-align:left; padding:12px;">
                    <input type="text" id="new-admin-phone" placeholder="91XXXXXXXXXX" class="edit-input" style="width:100%; margin-bottom:15px; text-align:left; padding:12px;">
                        <select id="new-admin-role" class="edit-input" style="width:100%; margin-bottom:20px; text-align:left; padding:12px; font-weight:normal;">
                            <option value="admin">Full Admin (All Access)</option>
                            <option value="scanner">Gate Staff (Scanner Only)</option>
                        </select>
                        <div style="display:flex; gap:10px;">
                            <button class="btn-action btn-approve" style="flex:1;" onclick="addAdmin()">ADD STAFF</button>
                            <button class="btn-logout" style="flex:1; background:#eee; color:#222;" onclick="document.getElementById('add-admin-modal').style.display='none'">CANCEL</button>
                        </div>
                    </div>
            </div>
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
// Socket.IO connection handler
// ======================================
io.on('connection', (socket) => {
    console.log('📡 Dashboard connected via Socket.IO:', socket.id);
    socket.on('disconnect', () => {
        console.log('📡 Dashboard disconnected:', socket.id);
    });
});

// ======================================
// Start Server
// ======================================
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Node.js Server listening on port ${PORT} `);
    console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);
});
