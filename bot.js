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
        `Please confirm to receive your ticket.`;

    return sendWhatsAppMessage(phone, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: txt },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "CONFIRM_MN_BOOKING", title: "Confirm & Send PDF" } },
                    { type: "reply", reply: { id: "CANCEL_MN_BOOKING", title: "Cancel" } }
                ]
            }
        }
    });
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

async function handleMusicNightFlow(phone, message) {
    const user = await getUserState(phone);
    const currentState = user.state;

    // Trigger word handling
    if (message.toLowerCase() === 'menu' || message.toLowerCase() === 'hi') {
        await sendText(phone, "Welcome! Type 'Music Night' or tap the button below to start booking.");
        return sendWhatsAppMessage(phone, {
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: "Main Menu" },
                action: { buttons: [{ type: "reply", reply: { id: "BTN_MUSIC_NIGHT", title: "Music Night 2026" } }] }
            }
        });
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
            if (message === "CONFIRM_MN_BOOKING") {
                await processAndSendBooking(phone, user);
            } else if (message === "CANCEL_MN_BOOKING") {
                await sendText(phone, "❌ Booking cancelled.");
                await saveUserState(phone, "MN_MAIN");
            }
            break;
    }
}

async function processAndSendBooking(phone, user) {
    try {
        const timestamp = new Date().getTime();
        const randStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        const ticketId = 'MN26-' + timestamp + '-' + randStr;
        const bookingNo = 'B-' + timestamp.toString().slice(-6);

        const price = getCategoryPrice(user.category);
        const totalAmount = price * user.quantity;

        // Save booking to MySQL database
        await db.query(
            `INSERT INTO mn_bookings (booking_no, ticket_id, phone, category, quantity, amount, members) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [bookingNo, ticketId, phone, user.category, user.quantity, totalAmount, JSON.stringify(user.members)]
        );

        // Deduct from inventory
        await db.query(
            `UPDATE mn_inventory SET booked_seats = booked_seats + ? WHERE category = ?`,
            [user.quantity, user.category]
        );

        const bookingData = {
            bookingNo, ticketId, category: user.category, quantity: user.quantity,
            amount: totalAmount, members: user.members
        };

        // Notify user while PDF generates
        await sendText(phone, "✅ *Booking Confirmed!*\n\nGenerating your PDF ticket, please wait a moment... ⏳");

        // Generate PDF
        const pdfBuffer = await generateTicketPDF(bookingData);

        // Save PDF temporarily on server to upload to Meta
        const fileName = `ticket_${ticketId}.pdf`;
        const filePath = path.join(__dirname, fileName);
        fs.writeFileSync(filePath, pdfBuffer);

        // Upload PDF to WhatsApp Media API
        const form = new (require('form-data'))();
        form.append('file', fs.createReadStream(filePath));
        form.append('messaging_product', 'whatsapp');

        const mediaRes = await axios.post(
            `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/media`,
            form,
            { headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`, ...form.getHeaders() } }
        );

        const mediaId = mediaRes.data.id;

        // Send Document Message
        await sendWhatsAppMessage(phone, {
            type: "document",
            document: {
                id: mediaId,
                caption: `🎉 Your Official Ticket to Muscat Star Night 2026 is here!\n\nBooking No: ${bookingNo}\nKeep this PDF ready at the gates. See you there! 🎶`
            }
        });

        // Clean up file
        fs.unlinkSync(filePath);

        // Reset State
        await saveUserState(phone, "MN_MAIN");

    } catch (err) {
        console.error("Booking failed:", err);
        await sendText(phone, "❌ Sorry, an error occurred while processing your booking. Please try again later.");
        await saveUserState(phone, "MN_MAIN");
    }
}

module.exports = { handleMusicNightFlow };
