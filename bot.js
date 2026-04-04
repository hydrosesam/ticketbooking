const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const { generateTicketPDF, generateQRCode } = require('./pdf_generator');

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || 'EAFx7YQeTUagBQ4y6EMq2oCVqUQZBy9MlmaMa2eYJsUk6TCMU533Q9S0kwOHxYsNcmZA352X9meGohb6dFKZBCUHuuwP4vYV6KOZBoEBc2jdfiSDjl0Su0sx8qahK6hgOiglBFTe2bZBZCQZAEf4LfVxS60mUEOoF31D4ZAvFuax1KH2WAqx2gTWgNTVgoIw5PpZCBlAZDZD';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '1065236600002252';
const BASE_URL = process.env.PUBLIC_URL || 'https://eventz.cloud';

function ensureAbsoluteUrl(url) {
    if (!url) return url;
    if (url.startsWith('http')) return url;
    // If it's a local path like /uploads/..., use BASE_URL
    const baseUrl = (process.env.PUBLIC_URL || 'https://eventz.cloud').replace(/\/$/, '');
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

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
        if (error.response && error.response.data) {
            console.error("❌ WhatsApp API Error Body:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("❌ WhatsApp API Error:", error.message);
        }
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

async function sendMNLanguageSelect(phone) {
    return sendWhatsAppMessage(phone, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: "Welcome! Please select your preferred language:\n\nസ്വാഗതം! നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക:" },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "LANG_EN", title: "English" } },
                    { type: "reply", reply: { id: "LANG_ML", title: "മലയാളം" } }
                ]
            }
        }
    });
}

async function sendMNWelcome(phone, lang = 'en') {
    const isMl = lang === 'ml';
    let msg = isMl
        ? "🌟 മസ്‌കറ്റ് സ്റ്റാർ നൈറ്റ് 2026 – സീസൺ 4-ലേക്ക് സ്വാഗതം 🌟\n\n" +
        "ഈ വർഷത്തെ ഏറ്റവും വലിയ വിനോദ പരിപാടിയിൽ ഞങ്ങളോടൊപ്പം ചേരൂ!\n\n" +
        "📅 വെള്ളിയാഴ്ച, 10 ഏപ്രിൽ 2026\n" +
        "🕓 വൈകുന്നേരം 5:00-ന്\n" +
        "🚪 ഗേറ്റ് തുറക്കുന്നത് - ഉച്ചയ്ക്ക് 3:00-ന്\n" +
        "📍 മസ്‌കറ്റ് ക്ലബ്, അൽ വാദി കബീർ\n\n" +
        "സംഗീതവും ഊർജ്ജവും നിറഞ്ഞ അവിസ്മരണീയമായ ഒരു സായാഹ്നത്തിനായി തയ്യാറെടുക്കൂ. 🎧🔥\n\n" +
        "📞 കൂടുതൽ വിവരങ്ങൾക്ക്: +968 95950347, 90447172"
        : "🌟 Welcome to Muscat Star Night 2026 – Season 4 🌟\n\n" +
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
                    { type: "reply", reply: { id: "BTN_MN_BOOK_NOW", title: isMl ? "ഇപ്പോൾ ബുക്ക് ചെയ്യുക" : "Book Now" } }
                ]
            }
        }
    });
}

async function sendMNCategorySelect(phone, lang = 'en') {
    const isMl = lang === 'ml';
    const imageUrl = "https://lh3.googleusercontent.com/d/1avxu1WWjRb6BiBQvWZjnrbIZYrT8o10Q";

    // 1. First Send seating layout image (with failover)
    try {
        await sendWhatsAppMessage(phone, {
            type: "image",
            image: { link: imageUrl }
        });
    } catch (e) {
        console.error("Layout Image failed to send:", e.message);
    }

    // 2. Then Send the interactive list
    return sendWhatsAppMessage(phone, {
        type: "interactive",
        interactive: {
            type: "list",
            header: { type: "text", text: isMl ? "🎟 സീറ്റ് തിരഞ്ഞെടുക്കുക" : "🎟 Select Your Seat" },
            body: { text: isMl ? "നിങ്ങൾ ആഗ്രഹിക്കുന്ന കാറ്റഗറി തിരഞ്ഞെടുക്കുക.\n🎫 ലേഔട്ട് മുകളിൽ കാണാം." : "Choose your category.\n🎫 View layout above." },
            footer: { text: "Music Night Muscat 2026" },
            action: {
                button: isMl ? "കാറ്റഗറികൾ കാണുക" : "View Categories",
                sections: [
                    {
                        title: isMl ? "ലഭ്യമായ കാറ്റഗറികൾ" : "Available Categories",
                        rows: [
                            { id: "CAT_GUEST", title: "GUEST", description: isMl ? "OMR 50 | സോഫാ സീറ്റിംഗ് (2, 3 നിരകൾ)" : "OMR 50 | Sofa Seating (2nd & 3rd Row)" },
                            { id: "CAT_VVIP", title: "VVIP", description: "OMR 20" },
                            { id: "CAT_VIP", title: "VIP", description: "OMR 10" },
                            { id: "CAT_GOLD", title: "GOLD", description: "OMR 5" },
                            { id: "BTN_BACK", title: isMl ? "⬅️ പിന്നിലേക്ക്" : "⬅️ BACK", description: isMl ? "മുമ്പത്തെ ഘട്ടത്തിലേക്ക് മടങ്ങുക" : "Return to previous step" }
                        ]
                    }
                ]
            }
        }
    });
}

async function sendMNQuantityRequest(phone, category, availableSeats, lang = 'en') {
    const isMl = lang === 'ml';
    const rows = [];
    const maxQty = Math.min(9, availableSeats);

    for (let i = 1; i <= maxQty; i++) {
        rows.push({
            id: "QTY_" + i,
            title: i + (isMl ? " ടിക്കറ്റ്" : " Ticket") + (i > 1 && !isMl ? "s" : ""),
            description: (isMl ? i + " ടിക്കറ്റ് ബുക്ക് ചെയ്യുക" : "Book " + i + " ticket" + (i > 1 ? "s" : ""))
        });
    }

    return sendWhatsAppMessage(phone, {
        type: "interactive",
        interactive: {
            type: "list",
            header: { type: "text", text: isMl ? "എണ്ണം തിരഞ്ഞെടുക്കുക" : "Select Quantity" },
            body: { text: isMl ? "എത്ര ടിക്കറ്റുകൾ വേണം?" : "How many tickets?" },
            footer: { text: "Music Night Muscat 2026" },
            action: {
                button: isMl ? "എണ്ണം തിരഞ്ഞെടുക്കുക" : "Choose Quantity",
                sections: [
                    {
                        title: isMl ? "ലഭ്യമായ ടിക്കറ്റുകൾ" : "Available Tickets",
                        rows: rows
                    },
                    {
                        title: isMl ? "ക്രമീകരണം" : "Navigation",
                        rows: [
                            { id: "BTN_BACK", title: isMl ? "⬅️ പിന്നിലേക്ക്" : "⬅️ BACK", description: isMl ? "കാറ്റഗറി തിരഞ്ഞെടുക്കുന്നതിലേക്ക് മടങ്ങുക" : "Return to category selection" }
                        ]
                    }
                ]
            }
        }
    });
}

async function sendMNMemberNameRequest(phone, lang = 'en') {
    const isMl = lang === 'ml';
    return sendWhatsAppMessage(phone, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: isMl ? "ദയവായി നിങ്ങളുടെ പേര് നൽകുക. 😊" : "Kindly Share your name. 😊" },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "BTN_BACK", title: isMl ? "⬅️ പിന്നിലേക്ക്" : "⬅️ BACK" } }
                ]
            }
        }
    });
}

async function showMNBookingSummary(phone, bookingData, lang = 'en') {
    const isMl = lang === 'ml';
    let price = getCategoryPrice(bookingData.category);
    let total = price * bookingData.quantity;

    let txt = isMl
        ? `🎫 ദയവായി നിങ്ങളുടെ ടിക്കറ്റ് സ്ഥിരീകരിക്കുക\n` +
        `*മസ്‌കറ്റ് സ്റ്റാർ നൈറ്റ് 2026*\n\n` +
        `*Booking Summary*\n` +
        `മസ്‌കറ്റ് സ്റ്റാർ നൈറ്റ് 2026\n\n` +
        `*🎫 കാറ്റഗറി: ${bookingData.category}*\n` +
        `*🪑 എണ്ണം: ${bookingData.quantity}*\n` +
        `*👤 പേര്: ${bookingData.members.join(", ")}*\n` +
        `*💰 ആകെ തുക: OMR ${total.toFixed(2)}*\n` +
        `*📅 തീയതി: 10 ഏപ്രിൽ 2026 | 🕓 5:00 PM*\n` +
        `*📍 സ്ഥലം: മസ്‌കറ്റ് ക്ലബ്, അൽ വാദി കബീർ*\n\n` +
        `✅ നിങ്ങളുടെ ബുക്കിംഗ് പൂർത്തിയാക്കാൻ ദയവായി സ്ഥിരീകരിക്കുക`
        : `🎫 Please Confirm Your Ticket\n` +
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
                    { type: "reply", reply: { id: "MN_PROC_PAYMENT", title: isMl ? "സ്ഥിരീകരിച്ച് പണമടയ്ക്കുക" : "Confirm & Pay" } },
                    { type: "reply", reply: { id: "BTN_BACK", title: isMl ? "⬅️ പിന്നിലേക്ക്" : "⬅️ BACK" } },
                    { type: "reply", reply: { id: "CANCEL_MN_BOOKING", title: isMl ? "റദ്ദാക്കുക" : "Cancel" } }
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

async function sendMNPaymentRequest(phone, lang = 'en') {
    const isMl = lang === 'ml';
    const paymentQrUrl = await getSetting('payment_qr_url', "https://lh3.googleusercontent.com/d/1j8FkUkKn69dtiFFLD1iwhQ2GSe688VIm");
    const paymentMobile = await getSetting('payment_mobile', "+968 76944041");

    const caption = isMl
        ? "💳 *ആദ്യം ക്യാഷ് ട്രാൻസ്ഫർ ചെയ്യുക*\n\n" +
        `*മൊബൈൽ ട്രാൻസ്ഫർ : ${paymentMobile}*\n\n` +
        "📸 *ക്യാഷ് അടച്ചതിനു ശേഷം Payment Reciept അപ്‌ലോഡ് ചെയ്യുക*\n\n" +
        "നിങ്ങളുടെ ടിക്കറ്റ് സ്ഥിരീകരിക്കുന്നതിനായി പണമടച്ചതിന്റെ ഫോട്ടോയോ PDF-ഓ അയക്കുക"
        : "💳 *Step 1: Transfer Funds*\n\n" +
        `*Mobile Transfer : ${paymentMobile}*\n\n` +
        "📸 *Step 2: Upload Payment Receipt*\n\n" +
        "Please share a photo or PDF of your payment to confirm your ticket";

    try {
        // Send QR Image first
        await sendWhatsAppMessage(phone, {
            type: "image",
            image: {
                link: ensureAbsoluteUrl(paymentQrUrl),
                caption: caption
            }
        });

        // Then send back button
        return sendWhatsAppMessage(phone, {
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: isMl ? "എന്തെങ്കിലും മാറ്റണോ? പിന്നിലേക്ക് ക്ലിക്ക് ചെയ്യുക." : "Need to change something? Click Back." },
                action: {
                    buttons: [
                        { type: "reply", reply: { id: "BTN_BACK", title: isMl ? "⬅️ പിന്നിലേക്ക്" : "⬅️ BACK" } }
                    ]
                }
            }
        });
    } catch (e) {
        console.error("❌ Failed to send QR image, falling back to text:", e.message);
        return sendWhatsAppMessage(phone, {
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: caption },
                action: {
                    buttons: [
                        { type: "reply", reply: { id: "BTN_BACK", title: isMl ? "⬅️ പിന്നിലേക്ക്" : "⬅️ BACK" } }
                    ]
                }
            }
        });
    }
}

async function sendMNRestrictedCategoryInfo(phone, text, lang = 'en') {
    const isMl = lang === 'ml';
    return sendWhatsAppMessage(phone, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: text },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "RESTART", title: isMl ? "🏠 പ്രധാന മെനു" : "🏠 Main Menu" } }
                ]
            }
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
            language: rows[0].language || 'en',
            category: rows[0].temp_category,
            quantity: rows[0].temp_quantity,
            members: safeJsonParse(rows[0].temp_members)
        };
    }
    await db.query("INSERT INTO mn_users (phone_number, state, language) VALUES (?, 'MN_LANG_SELECT', 'en')", [phone]);
    return { state: "MN_LANG_SELECT", language: "en", category: null, quantity: null, members: null };
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
            `• *Booking:* MMN-${bookingNo.toString().padStart(4, '0')}\n` +
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

async function notifyAdminsOfTierInterest(customerPhone, category) {
    try {
        // Save to enquiries table
        await db.query("INSERT INTO mn_enquiries (phone, category) VALUES (?, ?)", [customerPhone, category]);

        const admins = await db.query("SELECT phone FROM mn_admins WHERE is_active = TRUE");
        if (admins.length === 0) return;

        const message = `🎫 *TIER INTEREST ALERT*\n\n` +
            `• *Customer:* ${customerPhone}\n` +
            `• *Interest In:* ${category}\n\n` +
            `The user has been told that the ticketing team will contact them. Please follow up manually.`;

        for (const admin of admins) {
            await sendText(admin.phone, message);
        }
    } catch (err) {
        console.error("❌ Error notifying admins of interest:", err);
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
    // Allow ANY text keyword to reset/start the flow, except where we expect text input.
    let isResetTrigger = false;
    if (event && event.type === 'text') {
        if (currentState !== 'MN_MEMBER_NAME' && currentState !== 'MN_PAYMENT_UPLOAD') {
            if (currentState === 'MN_QUANTITY_INPUT' && !isNaN(parseInt(cleanMsg))) {
                isResetTrigger = false;
            } else {
                isResetTrigger = true;
            }
        }
    }

    // DISABLED for MN_PAYMENT_UPLOAD state as per user request
    if (currentState !== "MN_PAYMENT_UPLOAD") {
        if (isResetTrigger || message === "BTN_MUSIC_NIGHT" || currentState === "MN_LANG_SELECT" || currentState === "MN_MAIN") {
            console.log(`[FLOW] Global Reset Triggered by ${phone}`);
            await db.query(`UPDATE mn_users SET state = 'MN_LANG_SELECT', temp_category = NULL, temp_quantity = NULL, temp_members = NULL, temp_slip_url = NULL WHERE phone_number = ?`, [phone]);
            await sendMNLanguageSelect(phone);
            return;
        }
    }

    // --- 2. ADMIN REMOTE APPROVAL HANDLER ---
    if (message.startsWith("ADM_APP_") || message.startsWith("ADM_DENY_")) {
        const isAdmin = (await db.query("SELECT * FROM mn_admins WHERE phone = ? AND is_active = TRUE", [phone])).length > 0;
        if (!isAdmin) return;

        // Parse booking ID (everything after ADM_APP_ or ADM_DENY_)
        const bookingNo = message.replace("ADM_APP_", "").replace("ADM_DENY_", "");
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

    // --- 3. NAVIGATION HANDLERS ---
    if (message === "BTN_MN_BOOK_NOW") {
        await sendMNCategorySelect(phone, user.language);
        await saveUserState(phone, "MN_CATEGORY_SELECT");
        return;
    }

    if (message === "BTN_BACK") {
        console.log(`[FLOW] Back navigation from ${currentState}`);
        const lang = user.language;
        if (currentState === "MN_CATEGORY_SELECT") {
            await sendMNWelcome(phone, lang);
            await saveUserState(phone, "MN_WELCOME_WAIT");
        } else if (currentState === "MN_QUANTITY_INPUT") {
            await sendMNCategorySelect(phone, lang);
            await saveUserState(phone, "MN_CATEGORY_SELECT");
        } else if (currentState === "MN_MEMBER_NAME") {
            const inv = await db.query("SELECT * FROM mn_inventory WHERE category = ?", [user.category]);
            const available = inv.length > 0 ? (inv[0].total_seats - inv[0].booked_seats) : 10;
            await sendMNQuantityRequest(phone, user.category, available, lang);
            await saveUserState(phone, "MN_QUANTITY_INPUT");
        } else if (currentState === "MN_CONFIRM_AWAIT") {
            await sendMNMemberNameRequest(phone, lang);
            await saveUserState(phone, "MN_MEMBER_NAME");
        } else if (currentState === "MN_PAYMENT_UPLOAD") {
            // Remove from abandoned carts if they go back from payment step
            try {
                await db.query("DELETE FROM mn_abandoned_carts WHERE phone = ?", [phone]);
            } catch (err) { console.error("❌ Failed to remove abandoned cart on back:", err.message); }

            await showMNBookingSummary(phone, { category: user.category, quantity: user.quantity, members: user.members }, lang);
            await saveUserState(phone, "MN_CONFIRM_AWAIT");
        }
        return;
    }

    // --- 4. PAYMENT UPLOAD HANDLING (Special Case for Media) ---
    if (currentState === "MN_PAYMENT_UPLOAD") {
        let localPath = null;
        let ocrResult = null;

        // Reject other media types
        if (event && event.type && (event.type === 'audio' || event.type === 'video' || event.type === 'voice' || event.type === 'sticker')) {
            const errorMsg = user.language === 'ml'
                ? "⚠️ *അസാധുവായ ഫയൽ*\n\nദയവായി നിങ്ങളുടെ പേയ്‌മെന്റ് സ്ലിപ്പിന്റെ *ഫോട്ടോ* അല്ലെങ്കിൽ *PDF* മാത്രം അപ്‌ലോഡ് ചെയ്യുക. ഓഡിയോ, വീഡിയോ, സ്റ്റിക്കറുകൾ എന്നിവ സ്വീകരിക്കില്ല."
                : "⚠️ *Invalid File Type*\n\nPlease upload only a *Photo* or *PDF* of your payment slip. Audio, video, and stickers are not accepted.";
            await sendText(phone, errorMsg);
            return;
        }

        // Check for media
        if (event && event.type && (event.type === 'image' || event.type === 'document')) {
            // ... (keep media processing as is)
            const mediaType = event.type;
            const mediaObj = event[mediaType];
            console.log(`[MEDIA] Attempting download of ${mediaType} ID: ${mediaObj.id}`);

            try {
                const mediaRes = await axios.get(`https://graph.facebook.com/v17.0/${mediaObj.id}`, {
                    headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
                });

                const mimeType = mediaRes.data.mime_type;
                const fileUrl = mediaRes.data.url;
                const fileRes = await axios.get(fileUrl, {
                    headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
                    responseType: 'arraybuffer'
                });

                const extensionMap = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
                let ext = extensionMap[mimeType] || (mediaType === 'image' ? 'jpg' : 'pdf');

                const fileName = `slip_${mediaObj.id}.${ext}`;
                const absolutePath = path.join(__dirname, 'uploads', fileName);
                fs.writeFileSync(absolutePath, fileRes.data);
                localPath = `/uploads/${fileName}`;
            } catch (e) {
                console.error(`[MEDIA] ERROR processing ${mediaObj.id}:`, e.message);
            }
        }

        if (localPath) {
            await saveTempData(phone, 'slip_url', localPath);
            await processPendingBooking(phone, user, localPath, ocrResult);
            return;
        } else if (typeof message === 'string' && message.trim().length > 0) {
            const promptMsg = user.language === 'ml'
                ? "⚠️ തുടരുന്നതിന് ദയവായി നിങ്ങളുടെ പേയ്‌മെന്റ് സ്ലിപ്പിന്റെ *ഫോട്ടോ അല്ലെങ്കിൽ PDF* അപ്‌ലോഡ് ചെയ്യുക."
                : "⚠️ Please upload a *photo or PDF* of your payment slip to proceed.";
            await sendText(phone, promptMsg);
            return;
        }
    }

    // --- 5. STATE SWITCH ---
    if (typeof message !== 'string' || message.trim() === "") return;

    const lang = user.language;
    const isMl = lang === 'ml';

    switch (currentState) {
        case "MN_LANG_SELECT":
            if (message === "LANG_EN" || message === "LANG_ML") {
                const selectedLang = message === "LANG_ML" ? "ml" : "en";
                await db.query("UPDATE mn_users SET language = ?, state = 'MN_WELCOME_WAIT' WHERE phone_number = ?", [selectedLang, phone]);
                await sendMNWelcome(phone, selectedLang);
            } else {
                await sendMNLanguageSelect(phone);
            }
            break;

        case "MN_WELCOME_WAIT":
            await sendText(phone, isMl ? "⚠️ പ്രോസസ്സ് ചെയ്യാൻ മുകളിലുള്ള ബട്ടൺ ഉപയോഗിക്കുക." : "⚠️ *Please use the button above* to proceed.");
            await sendMNWelcome(phone, lang);
            break;

        case "MN_CATEGORY_SELECT":
            if (message.startsWith("CAT_")) {
                const category = message.replace("CAT_", "");

                // --- CATEGORY RESTRICTION ---
                if (category === "GUEST") {
                    let guestTxt = isMl
                        ? `മസ്‌കറ്റ് സ്റ്റാർ നൈറ്റ് 2026\n\n` +
                        `🎫 കാറ്റഗറി: *ഗസ്റ്റ് (Guest)*\n` +
                        `💺 ഗസ്റ്റ് ടിക്കറ്റ്: *50 OMR*\n` +
                        `🛋 സീറ്റിംഗ്: *സോഫാ സീറ്റിംഗ്*\n` +
                        `📍 നിരകൾ: *2, 3 നിരകൾ*\n` +
                        `📅 10 ഏപ്രിൽ 2026 | 🕓 *5:00 PM*\n` +
                        `🚪 ഗേറ്റ് തുറക്കുന്നത്: *3:00 PM*\n` +
                        `📍 മസ്‌കറ്റ് ക്ലബ്, അൽ വാദി കബീർ\n\n\n` +
                        `🎫 *നന്ദി! ഞങ്ങളുടെ ടിക്കറ്റിംഗ് ടീം നിങ്ങളെ ഉടൻ ബന്ധപ്പെടും.*`
                        : `Muscat Star Night 2026\n\n` +
                        `🎫 Category: *Guest*\n` +
                        `💺 Guest Ticket: *50 OMR*\n` +
                        `🛋 Seating: *Sofa Seating*\n` +
                        `📍 Rows: *2nd & 3rd Row*\n` +
                        `📅 10 April 2026 | 🕓 *5:00 PM*\n` +
                        `🚪 Gate Open : *3:00 PM*\n` +
                        `📍 Muscat Club, Al Wadi Kabir\n\n\n` +
                        `🎫 *Thank you! Our ticketing team will contact you .*`;
                    await sendMNRestrictedCategoryInfo(phone, guestTxt, lang);
                    await notifyAdminsOfTierInterest(phone, "GUEST");
                    return;
                }

                if (category === "VVIP") {
                    let vvipTxt = isMl
                        ? `*മസ്‌കറ്റ് സ്റ്റാർ നൈറ്റ് 2026*\n\n` +
                        `🎫 കാറ്റഗറി: *VVIP*\n` +
                        `💺 VVIP ടിക്കറ്റ്: *20 OMR*\n` +
                        `📅 10 ഏപ്രിൽ 2026 | 🕓 *4:00 PM*\n` +
                        `🚪 ഗേറ്റ് തുറക്കുന്നത്: *3:00 PM*\n` +
                        `📍 മസ്‌കറ്റ് ക്ലബ്, അൽ വാദി കബീർ\n\n\n` +
                        `🎫 *നന്ദി! ഞങ്ങളുടെ ടിക്കറ്റിംഗ് ടീം നിങ്ങളെ ഉടൻ ബന്ധപ്പെടും.*`
                        : `*Muscat Star Night 2026*\n\n` +
                        `🎫 Category: *VVIP*\n` +
                        `💺 VVIP Ticket: *20 OMR*\n` +
                        `📅 10 April 2026 | 🕓 *4:00 PM*\n` +
                        `🚪 Gate Open : *3:00 PM*\n` +
                        `📍 Muscat Club, Al Wadi Kabir\n\n\n` +
                        `🎫 *Thank you! Our ticketing team will contact you shortly.*`;
                    await sendMNRestrictedCategoryInfo(phone, vvipTxt, lang);
                    await notifyAdminsOfTierInterest(phone, "VVIP");
                    return;
                }

                if (category === "VIP") {
                    let vipTxt = isMl
                        ? `*മസ്‌കറ്റ് സ്റ്റാർ നൈറ്റ് 2026*\n\n` +
                        `🎫 കാറ്റഗറി: *VIP*\n` +
                        `💺 VIP ടിക്കറ്റ്: *10 OMR*\n` +
                        `📅 10 ഏപ്രിൽ 2026 | 🕓 *4:00 PM*\n` +
                        `🚪 ഗേറ്റ് തുറക്കുന്നത്: *3:00 PM*\n` +
                        `📍 മസ്‌കറ്റ് ക്ലബ്, അൽ വാദി കബീർ\n\n\n` +
                        `🎫 *നന്ദി! ഞങ്ങളുടെ ടിക്കറ്റിംഗ് ടീം നിങ്ങളെ ഉടൻ ബന്ധപ്പെടും.*`
                        : `*Muscat Star Night 2026*\n\n` +
                        `🎫 Category: *VIP*\n` +
                        `💺 VIP Ticket: *10 OMR*\n` +
                        `📅 10 April 2026 | 🕓 *4:00 PM*\n` +
                        `🚪 Gate Open : *3:00 PM*\n` +
                        `📍 Muscat Club, Al Wadi Kabir\n\n\n` +
                        `🎫 *Thank you! Our ticketing team will contact you shortly.*`;
                    await sendMNRestrictedCategoryInfo(phone, vipTxt, lang);
                    await notifyAdminsOfTierInterest(phone, "VIP");
                    return;
                }
                // ----------------------------

                const invRes = await db.query("SELECT * FROM mn_inventory WHERE category = ?", [category]);
                if (invRes.length > 0) {
                    const available = invRes[0].total_seats - invRes[0].booked_seats;
                    if (available <= 0) {
                        const soldOutMsg = isMl ? `🚫 ${category} വിറ്റുതീർന്നു!` : `🚫 ${category} is sold out!`;
                        await sendText(phone, soldOutMsg);
                        return await sendMNCategorySelect(phone, lang);
                    }
                    await saveTempData(phone, 'category', category);
                    await sendMNQuantityRequest(phone, category, available, lang);
                    await saveUserState(phone, "MN_QUANTITY_INPUT");
                } else {
                    const unavailMsg = isMl
                        ? `⚠️ ഖേദിക്കുന്നു, *${category}* ഇപ്പോൾ ലഭ്യമല്ല. ദയവായി മറ്റൊന്ന് തിരഞ്ഞെടുക്കുക.`
                        : `⚠️ Sorry, the category *${category}* is currently unavailable. Please choose another.`;
                    await sendText(phone, unavailMsg);
                    await sendMNCategorySelect(phone, lang);
                }
            } else {
                const selectCatMsg = isMl ? "⚠️ *ദയവായി ഒരു കാറ്റഗറി തിരഞ്ഞെടുക്കുക*." : "⚠️ *Please select a category* from the list provided.";
                await sendText(phone, selectCatMsg);
                await sendMNCategorySelect(phone, lang);
            }
            break;

        case "MN_QUANTITY_INPUT":
            let qty = parseInt(message.replace("QTY_", ""));
            if (!isNaN(qty) && qty > 0) {
                await saveTempData(phone, 'quantity', qty);
                await sendMNMemberNameRequest(phone, lang);
                await saveUserState(phone, "MN_MEMBER_NAME");
            } else {
                const chooseQtyMsg = isMl ? "⚠️ *ദയവായി ഒരു എണ്ണം തിരഞ്ഞെടുക്കുക*." : "⚠️ *Please choose a quantity* from the list.";
                await sendText(phone, chooseQtyMsg);
                const inv = await db.query("SELECT * FROM mn_inventory WHERE category = ?", [user.category]);
                await sendMNQuantityRequest(phone, user.category, inv[0].total_seats - inv[0].booked_seats, lang);
            }
            break;

        case "MN_MEMBER_NAME":
            await saveTempData(phone, 'members', [message]);
            await showMNBookingSummary(phone, { category: user.category, quantity: user.quantity, members: [message] }, lang);
            await saveUserState(phone, "MN_CONFIRM_AWAIT");
            break;

        case "MN_CONFIRM_AWAIT":
            if (message === "MN_PROC_PAYMENT") {
                // Log to abandoned carts...
                try {
                    const price = getCategoryPrice(user.category);
                    const total = price * user.quantity;
                    const name = (user.members && user.members.length > 0) ? user.members[0] : "Customer";
                    await db.query("REPLACE INTO mn_abandoned_carts (phone, name, category, quantity, amount) VALUES (?, ?, ?, ?, ?)", [phone, name, user.category, user.quantity, total]);
                } catch (err) { console.error("❌ Failed to log abandoned cart:", err.message); }

                await sendMNPaymentRequest(phone, lang);
                await saveUserState(phone, "MN_PAYMENT_UPLOAD");
            } else if (message === "CANCEL_MN_BOOKING") {
                const cancelMsg = isMl ? "❌ ബുക്കിംഗ് റദ്ദാക്കി." : "❌ Booking cancelled.";
                await sendText(phone, cancelMsg);
                await saveUserState(phone, "MN_MAIN");
            } else {
                const useBtnMsg = isMl ? "⚠️ *ദയവായി താഴെയുള്ള ബട്ടണുകൾ ഉപയോഗിക്കുക*." : "⚠️ *Please use the buttons below*.";
                await sendText(phone, useBtnMsg);
                await showMNBookingSummary(phone, { category: user.category, quantity: user.quantity, members: user.members }, lang);
            }
            break;
    }
}

async function processPendingBooking(phone, user, slipUrl, ocrData = null) {
    try {
        // Generate a strict 12-character alphanumeric Ticket ID for internal tracking/verification
        let ticketId = '';
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        for (let i = 0; i < 12; i++) {
            ticketId += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const price = getCategoryPrice(user.category);
        const totalAmount = price * user.quantity;

        // Save booking to MySQL database as PENDING
        console.log(`[DB] Inserting pending booking for ${phone}`);
        const result = await db.query(
            `INSERT INTO mn_bookings (ticket_id, phone, category, quantity, amount, members, payment_status, payment_slip_url, bank_transaction_id, bank_amount, bank_datetime, bank_beneficiary, bank_mobile) 
             VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
            [
                ticketId, phone, user.category, user.quantity, totalAmount, JSON.stringify(user.members),
                slipUrl,
                (ocrData ? ocrData.transactionId : null),
                (ocrData ? ocrData.amount : null),
                (ocrData ? ocrData.datetime : null),
                (ocrData ? ocrData.beneficiary : null),
                (ocrData ? ocrData.mobile : null)
            ]
        );

        const bookingNo = result.insertId;
        const formattedBookingNo = `MMN-${bookingNo.toString().padStart(4, '0')}`;

        // Update ticket_id in DB to match formatted booking number as requested by user
        await db.query("UPDATE mn_bookings SET ticket_id = ? WHERE booking_no = ?", [formattedBookingNo, bookingNo]);

        // Deduct from inventory (Pre-reserve)
        console.log(`[DB] Updating inventory for ${user.category} (-${user.quantity})`);
        await db.query(
            `UPDATE mn_inventory SET booked_seats = booked_seats + ? WHERE category = ?`,
            [user.quantity, user.category]
        );

        await sendText(phone, `📥 *Payment Received!*\n\nOur staff will verify your payment slip shortly. Once authorized, your official PDF ticket (*${formattedBookingNo}*) will be sent to you automatically. Thank you!`);

        // --- NOTIFY ADMINS ---
        await notifyAdminsOfPayment(bookingNo, phone, user.category, user.quantity, totalAmount, slipUrl);

        // Reset State AND Clear Temp Data
        await db.query(
            "UPDATE mn_users SET state = 'MN_MAIN', temp_category = NULL, temp_quantity = NULL, temp_members = NULL, temp_slip_url = NULL WHERE phone_number = ?",
            [phone]
        );

        // Remove from abandoned carts now that they've COMPLETED the upload
        try {
            await db.query("DELETE FROM mn_abandoned_carts WHERE phone = ?", [phone]);
        } catch (err) { console.error("❌ Failed to remove converted cart:", err.message); }

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

        const formattedBookingNo = `MMN-${b.booking_no.toString().padStart(4, '0')}`;
        const bookingData = {
            bookingNo: b.booking_no, // Integer
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
            filename: `Ticket No- ${formattedBookingNo}.pdf`,
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
                filename: `Ticket No- ${formattedBookingNo}.pdf`,
                caption: `🎉 YOUR TICKET IS HERE!\n\nBooking No: ${formattedBookingNo}\nSee you at Muscat Star Night 2026! 🎶`
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

        // --- NEW: Send Summary Text Message ---
        try {
            const userRows = await db.query("SELECT language FROM mn_users WHERE phone_number = ?", [phone]);
            const lang = (userRows.length > 0) ? userRows[0].language : 'en';
            const isMl = lang === 'ml';
            const name = bookingData.members.join(", ");

            let summaryMsg = isMl
                ? `🎟 *നിങ്ങളുടെ ടിക്കറ്റ് വിവരങ്ങൾ*\n\n` +
                `• *ടിക്കറ്റ് നമ്പർ:* ${formattedBookingNo}\n` +
                `• *പേര്:* ${name}\n` +
                `• *എണ്ണം:* ${b.quantity}\n` +
                `• *ആകെ തുക:* OMR ${b.amount}\n\n` +
                `പ്രവേശനത്തിനായി മുകളിൽ നൽകിയിരിക്കുന്ന PDF-ഉം QR കോഡും സുരക്ഷിതമായി സൂക്ഷിക്കുക. 🎉`
                : `🎟 *Your Ticket Details*\n\n` +
                `• *Ticket No:* ${formattedBookingNo}\n` +
                `• *Name:* ${name}\n` +
                `• *Quantity:* ${b.quantity}\n` +
                `• *Total Amount:* OMR ${b.amount}\n\n` +
                `Please keep the PDF and QR code above safe for entry. 🎉`;

            await sendText(phone, summaryMsg);
        } catch (msgErr) {
            console.error("❌ Failed to send summary text:", msgErr.message);
        }

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
