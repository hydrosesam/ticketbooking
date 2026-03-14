const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const { generateTicketPDF, generateQRCode } = require('./pdf_generator');

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || 'EAAdPlcYFproBQLR1YAW2X176hNT7bHwfKIWhZCBlbH5b3BChXhah9gViOQLZBwycsCuSUuqN8gzJZA9vZBBCcRZBXZBdZCk8zHwuIsLnuS3k5HFnqSPeIZCZC0kSBWGTNisu6DLYWZA8LjIuAfnBkU5E9aQiQJVczG3naqaCi1siCPTj8UBENXZBNmEptcw4yupBUtFyQZDZD';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '658261390699917';

async function sendWhatsAppMessage(phone, data) {
    try {
        const payload = {
            messaging_product: "whatsapp",
            to: phone,
            ...data
        };
        const response = await axios.post(
            `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Save outbound message to DB (excluding interactive template headers for brevity)
        try {
            let msgType = data.type;
            let content = '';
            let mediaUrl = null;

            if (msgType === 'text') {
                content = data.text.body;
            } else if (msgType === 'image') {
                mediaUrl = data.image.link || data.image.id;
                content = data.image.caption || '';
            } else if (msgType === 'document') {
                mediaUrl = data.document.link || data.document.id;
                content = data.document.caption || data.document.filename || '';
            } else if (msgType === 'interactive') {
                // For interactive messages, log the body text
                content = data.interactive.body ? data.interactive.body.text : 'Interactive Message';
            }

            await db.query(
                "INSERT INTO mn_messages (phone, direction, message_type, content, media_url, status) VALUES (?, 'outbound', ?, ?, ?, 'sent')",
                [phone, msgType, content, mediaUrl]
            );
        } catch (dbErr) {
            console.error("❌ Failed to log outbound message:", dbErr.message);
        }

        return response.data;
    } catch (error) {
        console.error("❌ WhatsApp API Error:", error.response ? error.response.data : error.message);
        throw error;
    }
}

async function generateAdminOTP(phone) {
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    await db.query("REPLACE INTO mn_otp (phone, code, expires_at) VALUES (?, ?, ?)", [phone, code, expiresAt]);

    await sendWhatsAppMessage(phone, {
        type: "text",
        text: { body: `🔐 *Your Eventz Admin Portal Access Code:*\n\n*${code}*\n\nThis code expires in 5 minutes. Do not share it with anyone.` }
    });
    return true;
}

async function sendText(phone, text) {
    return sendWhatsAppMessage(phone, {
        type: "text",
        text: { body: text }
    });
}

// ---------------------------------------------------------
// UI MESSAGES
// ---------------------------------------------------------

async function sendMNWelcome(phone) {
    let msg = "🌟 Welcome to Muscat Star Night 2026 – Season 4 🌟\n\n" +
        "Join us for the biggest entertainment night of the year!\n\n" +
        "📅 Friday, 10 April 2026\n" +
        "🕓 5:00 PM\n" +
        "🚪 Gate Open - 3:00 PM\n" +
        "📍 Muscat Club, Al Wadi Kabir\n\n" +
        "Get ready for an unforgettable evening of music and energy. 🎧🔥\n\n" +
        "📞 More Info: +968 95950347, 90447172";

    const imageUrl = "https://lh3.googleusercontent.com/d/11Pwc7Ux7W5XT12jFSDvOQxu1FCIIM27m";

    return sendWhatsAppMessage(phone, {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "image",
                image: { link: imageUrl }
            },
            body: { text: msg },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "BTN_MN_BOOK_NOW", title: "Book Now" } }
                ]
            }
        }
    });
}

async function sendMNCategorySelect(phone) {
    const imageUrl = "https://lh3.googleusercontent.com/d/11Pwc7Ux7W5XT12jFSDvOQxu1FCIIM27m";

    // 1. Try sending seating layout image (with failover)
    try {
        await sendWhatsAppMessage(phone, {
            type: "image",
            image: { link: imageUrl, caption: "🎫 View the seating layout above to choose your category." }
        });
    } catch (e) {
        console.error("Layout Image failed to send:", e.message);
    }

    // 2. Send the interactive list (Crucial step)
    return sendWhatsAppMessage(phone, {
        type: "interactive",
        interactive: {
            type: "list",
            header: { type: "text", text: "🎟 Select Your Seat" },
            body: { text: "Choose your category.\n🎫 View layout above." },
            footer: { text: "Music Night Muscat 2026" },
            action: {
                button: "View Categories",
                sections: [
                    {
                        title: "Available Categories",
                        rows: [
                            { id: "CAT_GUEST", title: "GUEST", description: "OMR 50 | Sofa Seating (2nd & 3rd Row)" },
                            { id: "CAT_VVIP", title: "VVIP", description: "OMR 20" },
                            { id: "CAT_VIP", title: "VIP", description: "OMR 10" },
                            { id: "CAT_GOLD", title: "GOLD", description: "OMR 5" }
                        ]
                    }
                ]
            }
        }
    });
}

async function sendMNQuantityRequest(phone, category, availableSeats) {
    const rows = [];
    const maxQty = Math.min(10, availableSeats);

    for (let i = 1; i <= maxQty; i++) {
        rows.push({
            id: "QTY_" + i,
            title: i + " Ticket" + (i > 1 ? "s" : ""),
            description: "Book " + i + " ticket" + (i > 1 ? "s" : "")
        });
    }

    return sendWhatsAppMessage(phone, {
        type: "interactive",
        interactive: {
            type: "list",
            header: { type: "text", text: `Select Quantity` },
            body: { text: `How many tickets?` },
            footer: { text: "Music Night Muscat 2026" },
            action: {
                button: "Choose Quantity",
                sections: [
                    {
                        title: "Available Tickets",
                        rows: rows
                    }
                ]
            }
        }
    });
}

async function sendMNMemberNameRequest(phone) {
    return sendText(phone, "👤 Kindly share your good name with us for the ticket registration (e.g. John Doe):");
}

async function showMNBookingSummary(phone, bookingData) {
    let price = getCategoryPrice(bookingData.category);
    let total = price * bookingData.quantity;

    let txt = `🎫 Please Confirm Your Ticket\n` +
        `*Muscat STAR Night 2026*\n\n` +
        `*Booking Summary*\n` +
        `Music Night Muscat 2026\n\n` +
        `*🎫 Category: ${bookingData.category}*\n` +
        `*🪑 Quantity: ${bookingData.quantity}*\n` +
        `*👤 Name: ${bookingData.members.join(", ")}*\n` +
        `*💰 Total Amount: OMR ${total.toFixed(2)}*\n` +
        `*📅 Date: 10 April 2026 | 🕓 5:00 PM*\n` +
        `*📍 Venue: Muscat Club, Al Wadi Kabir*\n\n` +
        `✅ Kindly confirm to complete your booking`;

    return sendWhatsAppMessage(phone, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: txt },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "MN_PROC_PAYMENT", title: "Confirm & Pay" } },
                    { type: "reply", reply: { id: "CANCEL_MN_BOOKING", title: "Cancel" } }
                ]
            }
        }
    });
}

async function getSetting(key, defaultValue = null) {
    try {
        const rows = await db.query("SELECT setting_value FROM mn_settings WHERE setting_key = ?", [key]);
        return (rows.length > 0 && rows[0].setting_value !== null) ? rows[0].setting_value : defaultValue;
    } catch (e) {
        console.error(`❌ Error fetching setting ${key}:`, e.message);
        return defaultValue;
    }
}

async function sendMNPaymentRequest(phone) {
    const paymentQrUrl = await getSetting('payment_qr_url', "https://lh3.googleusercontent.com/d/1j8FkUkKn69dtiFFLD1iwhQ2GSe688VIm");
    const paymentMobile = await getSetting('payment_mobile', "+968 76944041");

    return sendWhatsAppMessage(phone, {
        type: "image",
        image: {
            link: paymentQrUrl,
            caption: "💳 *Step 1: Transfer Funds*\n\n" +
                `*Mobile Transfer : ${paymentMobile}*\n\n` +
                "📸 *Step 2: Upload Receipt*\n\n" +
                "Please share a photo or PDF of your payment to confirm your ticket"
        }
    });
}

function getCategoryPrice(category) {
    const prices = { "GUEST": 50, "VVIP": 20, "VIP": 10, "GOLD": 5 };
    return prices[category] || 0;
}

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

function safeJsonParse(data) {
    if (!data) return [];
    if (typeof data !== 'string') return data;
    try {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
        return [data]; // Return as single-element array if not valid JSON
    }
}

// ---------------------------------------------------------
// STATE MANAGEMENT & LOGIC
// ---------------------------------------------------------

async function getUserState(phone) {
    const rows = await db.query("SELECT * FROM mn_users WHERE phone_number = ?", [phone]);
    if (rows.length > 0) {
        return {
            state: rows[0].state,
            category: rows[0].temp_category,
            quantity: rows[0].temp_quantity,
            members: safeJsonParse(rows[0].temp_members)
        };
    }
    await db.query("INSERT INTO mn_users (phone_number, state) VALUES (?, 'MN_MAIN')", [phone]);
    return { state: "MN_MAIN", category: null, quantity: null, members: null };
}

async function saveUserState(phone, state) {
    await db.query("UPDATE mn_users SET state = ? WHERE phone_number = ?", [state, phone]);
}

async function saveTempData(phone, field, value) {
    let finalValue = value;
    if (field === 'members' && typeof value !== 'string') {
        finalValue = JSON.stringify(value);
    }
    await db.query(`UPDATE mn_users SET temp_${field} = ? WHERE phone_number = ?`, [finalValue, phone]);
}

async function notifyAdminsOfPayment(bookingNo, customerPhone, category, quantity, amount, slipUrl) {
    try {
        const admins = await db.query("SELECT phone FROM mn_admins WHERE is_active = TRUE");
        if (admins.length === 0) return;

        const message = `🚨 *NEW PAYMENT SLIP*\n\n` +
            `• *Booking:* ${bookingNo}\n` +
            `• *Customer:* ${customerPhone}\n` +
            `• *Tier:* ${category}\n` +
            `• *Qty:* ${quantity}\n` +
            `• *Total:* OMR ${amount}\n\n` +
            `Please review the slip image/PDF sent above and click below to authorize.`;

        const buttons = [
            { type: "reply", reply: { id: `ADM_APP_${bookingNo}`, title: "Verify Payment ✅" } },
            { type: "reply", reply: { id: `ADM_DENY_${bookingNo}`, title: "Deny ❌" } }
        ];

        // 1. Upload the slip to Meta to get a mediaId for the admins
        let mediaId = null;
        try {
            const fileName = slipUrl.split('/').pop();
            const filePath = path.join(__dirname, 'uploads', fileName);
            if (fs.existsSync(filePath)) {
                const form = new (require('form-data'))();
                form.append('file', fs.createReadStream(filePath));
                form.append('messaging_product', 'whatsapp');

                const uploadRes = await axios.post(
                    `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/media`,
                    form,
                    { headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`, ...form.getHeaders() } }
                );
                mediaId = uploadRes.data.id;
            }
        } catch (e) {
            console.error("❌ Failed to upload slip for admin notification:", e.message);
        }

        for (const admin of admins) {
            // 2. Send the image/document first
            if (mediaId) {
                try {
                    const type = slipUrl.endsWith('.pdf') ? 'document' : 'image';
                    await sendWhatsAppMessage(admin.phone, {
                        type: type,
                        [type]: { id: mediaId, caption: `Payment slip for ${bookingNo}` }
                    });
                } catch (e) { }
            }

            // 3. Send the interaction
            await sendWhatsAppMessage(admin.phone, {
                type: "interactive",
                interactive: {
                    type: "button",
                    body: { text: message },
                    action: { buttons }
                }
            });
        }
    } catch (err) {
        console.error("❌ Error notifying admins:", err);
    }
}

async function handleMusicNightFlow(phone, event) {
    const user = await getUserState(phone);
    const currentState = user.state;

    // Extract text/payload from the webhook event
    let message = "";
    if (typeof event === 'string') {
        message = event;
    } else if (event && event.type === 'text') {
        message = event.text.body;
    } else if (event && event.type === 'interactive') {
        const interactive = event.interactive;
        if (interactive.type === 'button_reply') message = interactive.button_reply.id;
        else if (interactive.type === 'list_reply') message = interactive.list_reply.id;
    }

    const cleanMsg = message.toLowerCase().trim();
    console.log(`[FLOW] Phone: ${phone} | State: ${currentState} | Msg: "${message}" | Clean: "${cleanMsg}"`);

    // --- 1. GLOBAL RESET TRIGGERS (Priority) ---
    const resetTriggers = ['menu', 'hi', 'hello', 'music night', 'restart', 'start', 'music', 'hey', 'reset'];
    const isResetTrigger = resetTriggers.includes(cleanMsg) || (cleanMsg.length < 10 && resetTriggers.some(t => cleanMsg.includes(t)));

    // DISABLED for MN_PAYMENT_UPLOAD state as per user request
    if (currentState !== "MN_PAYMENT_UPLOAD") {
        if (isResetTrigger || message === "BTN_MUSIC_NIGHT") {
            console.log(`[FLOW] Global Reset Triggered by ${phone}`);
            await db.query(`UPDATE mn_users SET temp_category = NULL, temp_quantity = NULL, temp_members = NULL, temp_slip_url = NULL WHERE phone_number = ?`, [phone]);
            await sendMNWelcome(phone);
            await saveUserState(phone, "MN_WELCOME_WAIT");
            return;
        }
    }

    // --- 2. ADMIN REMOTE APPROVAL HANDLER ---
    if (message.startsWith("ADM_APP_") || message.startsWith("ADM_DENY_")) {
        const isAdmin = (await db.query("SELECT * FROM mn_admins WHERE phone = ? AND is_active = TRUE", [phone])).length > 0;
        if (!isAdmin) return;

        const bookingNo = message.substring(message.indexOf("B-"));
        const booking = await db.query("SELECT payment_status FROM mn_bookings WHERE booking_no = ?", [bookingNo]);
        const currentStatus = booking.length > 0 ? booking[0].payment_status : null;

        if (message.startsWith("ADM_APP_")) {
            if (currentStatus === 'approved') return await sendText(phone, `ℹ️ Already approved.`);
            const res = await authorizeAndSendTicket(bookingNo);
            if (res.success) await sendText(phone, `✅ Approved: ${bookingNo}`);
            else await sendText(phone, `❌ Error: ${res.error}`);
        } else {
            if (currentStatus === 'approved') return await sendText(phone, `⚠️ Cannot deny approved booking.`);
            await db.query("UPDATE mn_bookings SET payment_status = 'denied' WHERE booking_no = ?", [bookingNo]);
            await sendText(phone, `🚫 Denied: ${bookingNo}`);
        }
        return;
    }

    // --- 3. PAYMENT UPLOAD HANDLING (Special Case for Media) ---
    if (currentState === "MN_PAYMENT_UPLOAD") {
        let localPath = null;
        let ocrResult = null;

        // Check for media
        if (event && event.type && (event.type === 'image' || event.type === 'document')) {
            const mediaObj = event[event.type];
            try {
                const mediaRes = await axios.get(`https://graph.facebook.com/v17.0/${mediaObj.id}`, {
                    headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
                });
                const fileRes = await axios.get(mediaRes.data.url, {
                    headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
                    responseType: 'arraybuffer'
                });

                const ext = event.type === 'image' ? 'jpg' : 'pdf';
                const fileName = `slip_${mediaObj.id}.${ext}`;
                localPath = path.join(__dirname, 'uploads', fileName);
                fs.writeFileSync(localPath, fileRes.data);

                localPath = `/uploads/${fileName}`;
            } catch (e) {
                console.error("Media error:", e.message);
            }
        }

        if (localPath) {
            const price = getCategoryPrice(user.category);
            const expectedAmount = price * user.quantity;

            await saveTempData(phone, 'slip_url', localPath);
            await processPendingBooking(phone, user, localPath, ocrResult);
            return;
        } else if (typeof message === 'string' && message.trim().length > 0) {
            // Text sent instead of media - Strictly PDF or Image prompt
            await sendText(phone, "⚠️ Please upload a *photo or PDF* of your payment slip to proceed.");
            return;
        }
    }

    // --- 4. NAVIGATION HANDLERS ---
    if (message === "BTN_MN_BOOK_NOW") {
        await sendMNCategorySelect(phone);
        await saveUserState(phone, "MN_CATEGORY_SELECT");
        return;
    }

    // --- 5. STATE SWITCH ---
    if (typeof message !== 'string' || message.trim() === "") return;

    switch (currentState) {
        case "MN_WELCOME_WAIT":
            await sendText(phone, "⚠️ *Please use the button above* to proceed.");
            await sendMNWelcome(phone);
            break;

        case "MN_CATEGORY_SELECT":
            if (message.startsWith("CAT_")) {
                const category = message.replace("CAT_", "");
                const invRes = await db.query("SELECT * FROM mn_inventory WHERE category = ?", [category]);
                if (invRes.length > 0) {
                    const available = invRes[0].total_seats - invRes[0].booked_seats;
                    if (available <= 0) {
                        await sendText(phone, `🚫 ${category} is sold out!`);
                        return await sendMNCategorySelect(phone);
                    }
                    await saveTempData(phone, 'category', category);
                    await sendMNQuantityRequest(phone, category, available);
                    await saveUserState(phone, "MN_QUANTITY_INPUT");
                } else {
                    await sendText(phone, `⚠️ Sorry, the category *${category}* is currently unavailable. Please choose another.`);
                    await sendMNCategorySelect(phone);
                }
            } else {
                await sendText(phone, "⚠️ *Please select a category* from the list provided.");
                await sendMNCategorySelect(phone);
            }
            break;

        case "MN_QUANTITY_INPUT":
            let qty = parseInt(message.replace("QTY_", ""));
            if (!isNaN(qty) && qty > 0) {
                await saveTempData(phone, 'quantity', qty);
                await sendMNMemberNameRequest(phone);
                await saveUserState(phone, "MN_MEMBER_NAME");
            } else {
                await sendText(phone, "⚠️ *Please choose a quantity* from the list.");
                const inv = await db.query("SELECT * FROM mn_inventory WHERE category = ?", [user.category]);
                await sendMNQuantityRequest(phone, user.category, inv[0].total_seats - inv[0].booked_seats);
            }
            break;

        case "MN_MEMBER_NAME":
            await saveTempData(phone, 'members', [message]);
            await showMNBookingSummary(phone, { category: user.category, quantity: user.quantity, members: [message] });
            await saveUserState(phone, "MN_CONFIRM_AWAIT");
            break;

        case "MN_CONFIRM_AWAIT":
            if (message === "MN_PROC_PAYMENT") {
                await sendMNPaymentRequest(phone);
                await saveUserState(phone, "MN_PAYMENT_UPLOAD");
            } else if (message === "CANCEL_MN_BOOKING") {
                await sendText(phone, "❌ Booking cancelled.");
                await saveUserState(phone, "MN_MAIN");
            } else {
                await sendText(phone, "⚠️ *Please use the buttons below*.");
                await showMNBookingSummary(phone, { category: user.category, quantity: user.quantity, members: user.members });
            }
            break;
    }
}

async function processPendingBooking(phone, user, slipUrl, ocrData = null) {
    try {
        // Generate a strict 12-character alphanumeric Ticket ID
        let ticketId = '';
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        for (let i = 0; i < 12; i++) {
            ticketId += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // Use a more unique Booking No (B + Random 8 chars)
        const bookingNo = 'B-' + Math.random().toString(36).substring(2, 10).toUpperCase();

        const price = getCategoryPrice(user.category);
        const totalAmount = price * user.quantity;

        // Save booking to MySQL database as PENDING
        console.log(`[DB] Inserting pending booking ${bookingNo} for ${phone}`);
        await db.query(
            `INSERT INTO mn_bookings (booking_no, ticket_id, phone, category, quantity, amount, members, payment_status, payment_slip_url, bank_transaction_id, bank_amount, bank_datetime, bank_beneficiary, bank_mobile) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
            [
                bookingNo, ticketId, phone, user.category, user.quantity, totalAmount, JSON.stringify(user.members),
                slipUrl,
                (ocrData ? ocrData.transactionId : null),
                (ocrData ? ocrData.amount : null),
                (ocrData ? ocrData.datetime : null),
                (ocrData ? ocrData.beneficiary : null),
                (ocrData ? ocrData.mobile : null)
            ]
        );

        // Deduct from inventory (Pre-reserve)
        console.log(`[DB] Updating inventory for ${user.category} (-${user.quantity})`);
        await db.query(
            `UPDATE mn_inventory SET booked_seats = booked_seats + ? WHERE category = ?`,
            [user.quantity, user.category]
        );

        await sendText(phone, "📥 *Payment Received!*\n\nOur staff will verify your payment slip shortly. Once authorized, your official PDF ticket will be sent to you automatically. Thank you!");

        // --- NOTIFY ADMINS ---
        await notifyAdminsOfPayment(bookingNo, phone, user.category, user.quantity, totalAmount, slipUrl);

        // Reset State AND Clear Temp Data
        await db.query(
            "UPDATE mn_users SET state = 'MN_MAIN', temp_category = NULL, temp_quantity = NULL, temp_members = NULL, temp_slip_url = NULL WHERE phone_number = ?",
            [phone]
        );

    } catch (err) {
        console.error("❌ [MN] Pending booking failed:", err);
        await sendText(phone, "❌ Sorry, an error occurred while saving your booking. Our team has been notified.");
        await db.query("UPDATE mn_users SET state = 'MN_MAIN' WHERE phone_number = ?", [phone]);
    }
}

async function authorizeAndSendTicket(bookingNo) {
    try {
        const rows = await db.query("SELECT * FROM mn_bookings WHERE booking_no = ? AND payment_status = 'pending'", [bookingNo]);
        if (rows.length === 0) return { success: false, error: "Booking not found or already approved." };

        const b = rows[0];
        const phone = b.phone;

        // Update status
        await db.query("UPDATE mn_bookings SET payment_status = 'approved' WHERE booking_no = ?", [bookingNo]);

        const bookingData = {
            bookingNo: b.booking_no,
            ticketId: b.ticket_id,
            category: b.category,
            quantity: b.quantity,
            amount: b.amount,
            members: safeJsonParse(b.members)
        };

        // Generate PDF
        console.log(`[AUTH] Generating PDF for ${bookingNo}...`);
        const pdfBuffer = await generateTicketPDF(bookingData);
        if (!pdfBuffer) throw new Error("PDF Buffer is empty");

        const fileName = `ticket_${b.ticket_id}.pdf`;
        const filePath = path.join(__dirname, fileName);
        fs.writeFileSync(filePath, pdfBuffer);

        // Upload to Meta
        console.log(`[AUTH] Uploading PDF to Meta for ${bookingNo}...`);
        const form = new (require('form-data'))();
        form.append('file', fs.createReadStream(filePath), {
            filename: `Ticket No- ${b.booking_no}.pdf`,
            contentType: 'application/pdf'
        });
        form.append('messaging_product', 'whatsapp');

        const mediaRes = await axios.post(
            `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/media`,
            form,
            { headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`, ...form.getHeaders() } }
        );

        const mediaId = mediaRes.data.id;
        if (!mediaId) throw new Error("Failed to get media ID from Meta");

        // Send Document
        console.log(`[AUTH] Sending Document to customer for ${bookingNo}...`);
        await sendWhatsAppMessage(phone, {
            type: "document",
            document: {
                id: mediaId,
                filename: `Ticket No- ${b.booking_no}.pdf`,
                caption: `🎉 YOUR TICKET IS HERE!\n\nBooking No: ${b.booking_no}\nSee you at Muscat Star Night 2026! 🎶`
            }
        });

        fs.unlinkSync(filePath);

        // --- NEW: Generate and Send QR Code Separately ---
        console.log(`[AUTH] Sending separate QR code for ${bookingNo}...`);
        const qrBase64 = await generateQRCode(`https://eventz.cloud/verify?id=${b.ticket_id}`);
        if (qrBase64) {
            const qrBuffer = Buffer.from(qrBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
            const qrPath = path.join(__dirname, `qr_${b.ticket_id}.png`);
            fs.writeFileSync(qrPath, qrBuffer);

            const qrForm = new (require('form-data'))();
            qrForm.append('file', fs.createReadStream(qrPath), { filename: 'Ticket_QR_Code.png', contentType: 'image/png' });
            qrForm.append('messaging_product', 'whatsapp');

            const qrMediaRes = await axios.post(
                `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/media`,
                qrForm,
                { headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`, ...qrForm.getHeaders() } }
            );

            await sendWhatsAppMessage(phone, {
                type: "image",
                image: { id: qrMediaRes.data.id, caption: "📱 Tip: Show this QR code at the entrance for quick scanning!" }
            });
            fs.unlinkSync(qrPath);
        }

        console.log(`✅ [AUTH] Success for ${bookingNo}`);
        return { success: true };

    } catch (err) {
        console.error("❌ Authorization failed:", err);
        return { success: false, error: err.message };
    }
}

async function sendManualMessage(phone, text) {
    try {
        await sendText(phone, text);
        return { success: true };
    } catch (error) {
        console.error("❌ Failed to send manual message:", error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    handleMusicNightFlow,
    authorizeAndSendTicket,
    generateAdminOTP,
    notifyAdminsOfPayment,
    sendManualMessage
};
