const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const { generateTicketPDF } = require('./pdf_generator');

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || 'EAAVHjKkZBE3IBO3O7bQyC9yZAZAz2eXZB74ZBvGqY5bE2wJZA1H27i1LpZCkPZA8W37eYjZBq6V4rONZCPk1d9LqL5ZCDx2X5dYjZBNvN60wZCY5jZBUQ8v2eX2ZCHjG2j2hJZB4r1ZCH7eNjMZB77e7e6ZBqZCV4r1ZCG4j2'; // Placeholder
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '550181748169976'; // Placeholder

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

    const imageUrl = "https://lh3.googleusercontent.com/d/12Ajc6kYTPKreLhRBs2ZtfRfNCHiK2oNR";

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

    // Two messages requirement
    await sendWhatsAppMessage(phone, {
        type: "image",
        image: { link: imageUrl, caption: "🎫 View the seating layout above to choose your category." }
    });

    return sendWhatsAppMessage(phone, {
        type: "interactive",
        interactive: {
            type: "list",
            header: { type: "text", text: "Ticket Selection" },
            body: { text: "Please select your seating category:" },
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
    const msg = "💳 *Payment Instructions*\n\n" +
        "Please transfer the total amount to the following account:\n\n" +
        "*Bank Name:* Muscat Bank\n" +
        "*Account Name:* Eventz Cloud LLC\n" +
        "*Account Number:* 1234-5678-9012\n\n" +
        "📸 Once done, *please send a photo or PDF of your payment slip/receipt here.*";

    return sendText(phone, msg);
}

function getCategoryPrice(category) {
    const prices = { "VVIP": 60, "VIP": 40, "GOLD": 20, "SILVER": 10 };
    return prices[category] || 0;
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
            members: rows[0].temp_members
        };
    }
    await db.query("INSERT INTO mn_users (phone_number, state) VALUES (?, 'MN_MAIN')", [phone]);
    return { state: "MN_MAIN", category: null, quantity: null, members: null };
}

async function saveUserState(phone, state) {
    await db.query("UPDATE mn_users SET state = ? WHERE phone_number = ?", [state, phone]);
}

async function saveTempData(phone, field, value) {
    if (field === 'members') {
        value = JSON.stringify(value);
    }
    await db.query(`UPDATE mn_users SET temp_${field} = ? WHERE phone_number = ?`, [value, phone]);
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

    const cleanMsg = message.toLowerCase().trim();

    // Trigger word handling
    if (cleanMsg === 'menu' || cleanMsg === 'hi' || cleanMsg === 'music night') {
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

                const ext = message.image ? 'jpg' : 'pdf';
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
        const bookingNo = 'B-' + timestamp.toString().slice(-6);

        const price = getCategoryPrice(user.category);
        const totalAmount = price * user.quantity;

        // Save booking to MySQL database as PENDING
        await db.query(
            `INSERT INTO mn_bookings (booking_no, ticket_id, phone, category, quantity, amount, members, payment_status, payment_slip_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
            [bookingNo, ticketId, phone, user.category, user.quantity, totalAmount, JSON.stringify(user.members), slipUrl]
        );

        // Deduct from inventory (Pre-reserve)
        await db.query(
            `UPDATE mn_inventory SET booked_seats = booked_seats + ? WHERE category = ?`,
            [user.quantity, user.category]
        );

        await sendText(phone, "📥 *Payment Received!*\n\nOur staff will verify your payment slip shortly. Once authorized, your official PDF ticket will be sent to you automatically. Thank you!");

        // Reset State
        await saveUserState(phone, "MN_MAIN");

    } catch (err) {
        console.error("Pending booking failed:", err);
        await sendText(phone, "❌ Sorry, an error occurred while saving your booking. Please contact support.");
        await saveUserState(phone, "MN_MAIN");
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
            members: JSON.parse(b.members)
        };

        // Notify user
        await sendText(phone, "✅ *Payment Verified!*\n\nYour Muscat Star Night 2026 ticket is being generated...");

        // Generate PDF
        const pdfBuffer = await generateTicketPDF(bookingData);
        const fileName = `ticket_${b.ticket_id}.pdf`;
        const filePath = path.join(__dirname, fileName);
        fs.writeFileSync(filePath, pdfBuffer);

        // Upload to Meta
        const form = new (require('form-data'))();
        form.append('file', fs.createReadStream(filePath));
        form.append('messaging_product', 'whatsapp');

        const mediaRes = await axios.post(
            `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/media`,
            form,
            { headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`, ...form.getHeaders() } }
        );

        const mediaId = mediaRes.data.id;

        // Send Document
        await sendWhatsAppMessage(phone, {
            type: "document",
            document: {
                id: mediaId,
                caption: `🎉 YOUR TICKET IS HERE!\n\nBooking No: ${b.booking_no}\nSee you at Muscat Star Night 2026! 🎶`
            }
        });

        fs.unlinkSync(filePath);
        return { success: true };

    } catch (err) {
        console.error("Authorization failed:", err);
        return { success: false, error: err.message };
    }
}

module.exports = { handleMusicNightFlow, authorizeAndSendTicket };
