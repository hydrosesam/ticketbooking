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
    let msg = "Muscat Star Night 2026 Season 4 🔥🎧\n\n" +
        "\"Muscattttt… Are you readyyyyy?!!\" 🌟\n\n" +
        "This is your official call to the biggest entertainment night of the year…\n\n" +
        "Welcome to Muscat Star Night 2026 – Season 4!\n\n" +
        "On April 10, Friday…\n\n" +
        "At Muscat Club, Al Wadi Kabir…\n\n" +
        "We are bringing you non-stop music, live performances, and a massive food festival under one roof! 🎶✨";

    const imageUrl = "https://lh3.googleusercontent.com/d/1Aosg-daRT0Dp8_lhxy7mNNS_WnlWoBL9";

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
    const imageUrl = "https://lh3.googleusercontent.com/d/1VyFxQIWWQNB2pFHnm_iwAbjBQlY_38q2";

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
            header: { type: "text", text: "Ticket Selection" },
            body: { text: "Please select your seating category below:" },
            footer: { text: "Music Night Muscat 2026" },
            action: {
                button: "View Categories",
                sections: [
                    {
                        title: "Available Categories",
                        rows: [
                            { id: "CAT_VVIP", title: "VVIP", description: "OMR 60" },
                            { id: "CAT_VIP", title: "VIP", description: "OMR 40" },
                            { id: "CAT_GOLD", title: "GOLD", description: "OMR 20" },
                            { id: "CAT_SILVER", title: "SILVER", description: "OMR 10" }
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
            header: { type: "text", text: `Select Quantity (Max ${maxQty})` },
            body: { text: `🎫 There are ${availableSeats} tickets remaining in ${category}. How many would you like to book?` },
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

    let txt = `*Booking Summary* 🎫\n\n` +
        `• *Category:* ${bookingData.category}\n` +
        `• *Quantity:* ${bookingData.quantity} Ticket(s)\n` +
        `• *Name:* ${bookingData.members.join(", ")}\n\n` +
        `*Total Amount:* OMR ${total.toFixed(2)}\n\n` +
        `Please confirm your selection and proceed to payment.`;

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

async function sendMNPaymentRequest(phone) {
    const paymentQrUrl = "https://lh3.googleusercontent.com/d/1PgQY8UgeUxsbv7KKs0J-G5bMQhMx5n9U";

    // Consolidate into one message to ensure correct order and grouping
    return sendWhatsAppMessage(phone, {
        type: "image",
        image: {
            link: paymentQrUrl,
            caption: "💳 *Step 1: Scan to Pay*\n\nPlease scan the QR code above to complete your payment.\n\n" +
                "📸 *Step 2: Upload Receipt*\n\nAfter payment, *please send a photo or PDF of your payment slip here* so we can issue your ticket."
        }
    });
}

function getCategoryPrice(category) {
    const prices = { "VVIP": 60, "VIP": 40, "GOLD": 20, "SILVER": 10 };
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
            `Please review the slip image/PDF above and click below to authorize.`;

        const buttons = [
            { type: "reply", reply: { id: `ADM_APP_${bookingNo}`, title: "Approve ✅" } },
            { type: "reply", reply: { id: `ADM_DENY_${bookingNo}`, title: "Deny ❌" } }
        ];

        for (const admin of admins) {
            // First send the image/document
            try {
                if (slipUrl.endsWith('.pdf')) {
                    // Note: In a real environment, slipUrl needs to be a public URL for Meta to download it
                    // For now we send the interactive message and hopefully they can see the slip in the dash if link fails
                }
            } catch (e) { }

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
        message = event; // Fallback for any direct calls
    } else if (event.type === 'text') {
        message = event.text.body;
    } else if (event.type === 'interactive') {
        const interactive = event.interactive;
        if (interactive.type === 'button_reply') message = interactive.button_reply.id;
        else if (interactive.type === 'list_reply') message = interactive.list_reply.id;
    }

    // --- ADMIN REMOTE APPROVAL HANDLER ---
    if (message.startsWith("ADM_APP_") || message.startsWith("ADM_DENY_")) {
        const isAdmin = (await db.query("SELECT * FROM mn_admins WHERE phone = ? AND is_active = TRUE", [phone])).length > 0;
        if (!isAdmin) return;

        const bookingNo = message.substring(9);
        if (message.startsWith("ADM_APP_")) {
            const res = await authorizeAndSendTicket(bookingNo);
            if (res.success) {
                await sendText(phone, `✅ *Approved:* Booking ${bookingNo} processed and ticket sent.`);
            } else {
                await sendText(phone, `❌ *Error:* ${res.error}`);
            }
        } else {
            await db.query("UPDATE mn_bookings SET payment_status = 'denied' WHERE booking_no = ?", [bookingNo]);
            await sendText(phone, `🚫 *Denied:* Booking ${bookingNo} marked as invalid.`);
        }
        return;
    }

    const cleanMsg = message.toLowerCase().trim();
    console.log(`[FLOW] Phone: ${phone} | State: ${currentState} | Msg: "${message}"`);

    // Trigger word handling
    if (cleanMsg === 'menu' || cleanMsg === 'hi' || cleanMsg === 'music night') {
        console.log(`[FLOW] Triggering Welcome for ${phone}`);
        // Force reset session data for a clean start
        await db.query(`UPDATE mn_users SET 
            temp_category = NULL, 
            temp_quantity = NULL, 
            temp_members = NULL, 
            temp_slip_url = NULL 
            WHERE phone_number = ?`, [phone]);

        await sendMNWelcome(phone);
        await saveUserState(phone, "MN_WELCOME_WAIT");
        return;
    }

    if (message === "BTN_MUSIC_NIGHT") {
        await sendMNWelcome(phone);
        await saveUserState(phone, "MN_WELCOME_WAIT");
        return;
    }

    if (message === "BTN_MN_BOOK_NOW") {
        await sendMNCategorySelect(phone);
        await saveUserState(phone, "MN_CATEGORY_SELECT");
        return;
    }

    // --- Media Handling (Images/Documents for Payment Slips) ---
    if (currentState === "MN_PAYMENT_UPLOAD") {
        let localPath = null;
        if (typeof event === 'object' && (event.image || event.document)) {
            const mediaObj = event.image || event.document;
            try {
                // 1. Get Media URL from Meta API
                const mediaRes = await axios.get(`https://graph.facebook.com/v17.0/${mediaObj.id}`, {
                    headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
                });
                const mediaUrl = mediaRes.data.url;

                // 2. Download the actual file
                const fileRes = await axios.get(mediaUrl, {
                    headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
                    responseType: 'arraybuffer'
                });

                const ext = event.image ? 'jpg' : 'pdf';
                const fileName = `slip_${mediaObj.id}.${ext}`;
                localPath = path.join(__dirname, 'uploads', fileName);
                fs.writeFileSync(localPath, fileRes.data);

                // We'll store the relative path for the dashboard
                localPath = `/uploads/${fileName}`;
            } catch (e) {
                console.error("Error downloading media:", e);
            }
        }

        if (localPath) {
            await saveTempData(phone, 'slip_url', localPath);
            await processPendingBooking(phone, user, localPath);
            return;
        } else if (typeof message === 'string') {
            await sendText(phone, "⚠️ Please upload a photo or PDF of your payment slip to proceed.");
            return;
        }
    }

    if (typeof message !== 'string') return; // Skip if not a button/text reply and not in payment state

    switch (currentState) {
        case "MN_WELCOME_WAIT":
        case "MN_CATEGORY_SELECT":
            if (message.startsWith("CAT_")) {
                const category = message.replace("CAT_", "");

                // --- INVENTORY CHECK ---
                const invRes = await db.query("SELECT * FROM mn_inventory WHERE category = ?", [category]);
                if (invRes.length > 0) {
                    const available = invRes[0].total_seats - invRes[0].booked_seats;
                    if (available <= 0) {
                        await sendText(phone, `🚫 Sorry, the ${category} category is completely sold out! Please select another category.`);
                        await sendMNCategorySelect(phone);
                        return; // Stop here, keep them in MN_CATEGORY_SELECT state
                    }

                    await saveTempData(phone, 'category', category);
                    await sendMNQuantityRequest(phone, category, available);
                    await saveUserState(phone, "MN_QUANTITY_INPUT");
                } else {
                    await sendText(phone, "⚠️ Sorry, we could not retrieve availability for that category. Please try again.");
                }
            }
            break;

        case "MN_QUANTITY_INPUT":
            let qtyStr = message;
            if (message.startsWith("QTY_")) qtyStr = message.replace("QTY_", "");

            const qty = parseInt(qtyStr);
            if (!isNaN(qty) && qty > 0) {
                await saveTempData(phone, 'quantity', qty);
                await sendMNMemberNameRequest(phone);
                await saveUserState(phone, "MN_MEMBER_NAME");
            } else {
                await sendText(phone, "⚠️ Please enter a valid number of tickets from the list.");
            }
            break;

        case "MN_MEMBER_NAME":
            const membersList = [message];
            await saveTempData(phone, 'members', membersList);
            const summaryData = {
                category: user.category,
                quantity: user.quantity,
                members: membersList
            };
            await showMNBookingSummary(phone, summaryData);
            await saveUserState(phone, "MN_CONFIRM_AWAIT");
            break;

        case "MN_CONFIRM_AWAIT":
            if (message === "MN_PROC_PAYMENT") {
                await sendMNPaymentRequest(phone);
                await saveUserState(phone, "MN_PAYMENT_UPLOAD");
            } else if (message === "CANCEL_MN_BOOKING") {
                await sendText(phone, "❌ Booking cancelled.");
                await saveUserState(phone, "MN_MAIN");
            }
            break;
    }
}

async function processPendingBooking(phone, user, slipUrl) {
    try {
        const timestamp = new Date().getTime();
        const randStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        const ticketId = 'MN26-' + timestamp + '-' + randStr;

        // Use a more unique Booking No (B + Random 8 chars)
        const bookingNo = 'B-' + Math.random().toString(36).substring(2, 10).toUpperCase();

        const price = getCategoryPrice(user.category);
        const totalAmount = price * user.quantity;

        // Save booking to MySQL database as PENDING
        console.log(`[DB] Inserting pending booking ${bookingNo} for ${phone}`);
        await db.query(
            `INSERT INTO mn_bookings (booking_no, ticket_id, phone, category, quantity, amount, members, payment_status, payment_slip_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
            [bookingNo, ticketId, phone, user.category, user.quantity, totalAmount, JSON.stringify(user.members), slipUrl]
        );

        // Deduct from inventory (Pre-reserve)
        console.log(`[DB] Updating inventory for ${user.category} (-${user.quantity})`);
        await db.query(
            `UPDATE mn_inventory SET booked_seats = booked_seats + ? WHERE category = ?`,
            [user.quantity, user.category]
        );

        await sendText(phone, "📥 *Payment Received!*\n\nOur staff will verify your payment slip shortly. Once authorized, your official PDF ticket will be sent to you automatically. Thank you!");

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

module.exports = {
    handleMusicNightFlow,
    authorizeAndSendTicket,
    generateAdminOTP,
    notifyAdminsOfPayment
};
