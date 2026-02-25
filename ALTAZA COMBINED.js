/* =========================
🛡️ AL TAZA WHATSAPP BOT - SIMPLIFIED PROFESSIONAL VERSION
Working Hours: 12 PM - 1 AM
Session Timeout: 1 hour
Payment: Pay on Delivery ONLY
========================= */

const MUSIC_NIGHT_SHEET_ID = '1m7iBiCpjW6UWEJ4j8F3DYf_kpYC5n3XTZh3ZLIwWOD4';
const AL_TAZA_SHEET_ID = '1XPJUwXYC-JoNnERtbx67akAnBK9Bg05IusfZY8r10aY';

// 🔑 WHATSAPP API CREDENTIALS (HARDCODED)
const WHATSAPP_ACCESS_TOKEN = 'EAAdPlcYFproBQLR1YAW2X176hNT7bHwfKIWhZCBlbH5b3BChXhah9gViOQLZBwycsCuSUuqN8gzJZA9vZBBCcRZBXZBdZCk8zHwuIsLnuS3k5HFnqSPeIZCZC0kSBWGTNisu6DLYWZA8LjIuAfnBkU5E9aQiQJVczG3naqaCi1siCPTj8UBENXZBNmEptcw4yupBUtFyQZDZD';
const WHATSAPP_PHONE_NUMBER_ID = '658261390699917';

let _mnSpreadsheet = null;
let _mnInitialized = false;

/* =========================
🛡️ ANTI-LOOP PROTECTION SYSTEM
========================= */
function isActionAlreadyProcessed(actionKey) {
    const cache = CacheService.getScriptCache();
    const existing = cache.get(actionKey);

    if (existing) {
        Logger.log("🔒 Action already processed: " + actionKey);
        return true;
    }

    return false;
}

/* =========================
� ERROR LOGGING SYSTEM
========================= */
function logErrorToSheet(errorMsg, errorStack, phone) {
    try {
        const ss = SpreadsheetApp.openById(AL_TAZA_SHEET_ID);
        let sh = ss.getSheetByName("ERROR_LOG");

        // Create the sheet if it doesn't exist
        if (!sh) {
            sh = ss.insertSheet("ERROR_LOG");
            sh.appendRow(["Timestamp", "Phone", "Error Message", "Stack Trace"]);
            sh.getRange("A1:D1").setFontWeight("bold");
        }

        sh.appendRow([
            new Date(),
            phone || "Unknown",
            String(errorMsg),
            String(errorStack)
        ]);
    } catch (e) {
        Logger.log("❌ Failed to write to ERROR_LOG: " + e.message);
    }
}

/* =========================
📡 WEBHOOK TRAFFIC LOGGER
========================= */
function logWebhookTraffic(type, phone, payload) {
    try {
        const ss = SpreadsheetApp.openById(AL_TAZA_SHEET_ID);
        let sh = ss.getSheetByName("WEBHOOK_LOGS");

        if (!sh) {
            sh = ss.insertSheet("WEBHOOK_LOGS");
            sh.appendRow(["Timestamp", "Type", "Phone", "Payload"]);
            sh.getRange("A1:D1").setFontWeight("bold");
        }

        sh.appendRow([
            new Date(),
            type,
            phone || "Unknown",
            typeof payload === 'string' ? payload : JSON.stringify(payload)
        ]);
    } catch (e) {
        Logger.log("❌ Failed to write to WEBHOOK_LOGS: " + e.message);
    }
}

/* =========================
�👋 WELCOME & MENU
========================= */
function sendPreWelcome(phone) {
    const message = "🌟 *Select your destination:*\n\n" +
        "Please choose which platform you would like to access today:";

    sendWhatsApp(phone, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: message },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "BTN_AL_TAZA", title: "🌯 AL Taza Demo" } },
                    { type: "reply", reply: { id: "BTN_MUSIC_NIGHT", title: "🎤 Music Night 2026" } }
                ]
            }
        }
    });
}

function markActionAsProcessed(actionKey) {
    const cache = CacheService.getScriptCache();
    // Max expiration is 21600 seconds (6 hours) in Google Apps Script! 86400 causes a fatal crash.
    cache.put(actionKey, "processed", 21600);
    Logger.log("✅ Action marked as processed: " + actionKey);
}



let _alTazaSpreadsheet = null;

function getAlTazaSpreadsheet() {
    if (_alTazaSpreadsheet) return _alTazaSpreadsheet;
    try {
        _alTazaSpreadsheet = SpreadsheetApp.openById(AL_TAZA_SHEET_ID);
        return _alTazaSpreadsheet;
    } catch (e) {
        Logger.log("❌ CRITICAL: Could not open AL Taza Sheet. Error: " + e.message);
        return null;
    }
}

/* =========================
📊 SHEET & USER FUNCTIONS
========================= */
function getSheet(sheetName) {
    const ss = getAlTazaSpreadsheet();
    return ss ? ss.getSheetByName(sheetName) : null;
}

function getUser(phone) {
    try {
        const sh = getSheet("USERS");
        if (!sh) {
            Logger.log("❌ USERS sheet not found!");
            return null;
        }

        const rows = sh.getDataRange().getValues();

        for (let i = 1; i < rows.length; i++) {
            if (!rows[i][0]) continue;

            if (String(rows[i][0]) === String(phone)) {
                return {
                    row: i + 1,
                    phone: rows[i][0],
                    state: rows[i][1],
                    outlet: rows[i][2],
                    last_seen: rows[i][3],
                    order_type: rows[i][4],
                    lat: rows[i][6],
                    lon: rows[i][7],
                    delivery_address: rows[i][10],
                    pending_order: rows[i][11]
                };
            }
        }

        return null;

    } catch (err) {
        Logger.log("❌ Error in getUser: " + err.message);
        return null;
    }
}

function createUser(phone) {
    try {
        const sh = getSheet("USERS");
        if (!sh) {
            Logger.log("❌ USERS sheet not found!");
            return false;
        }

        const rows = sh.getDataRange().getValues();
        for (let i = 1; i < rows.length; i++) {
            if (String(rows[i][0]) === String(phone)) {
                Logger.log("⚠️ User already exists: " + phone);
                return true;
            }
        }

        const now = new Date();

        sh.appendRow([
            phone,
            "NEW",
            "",
            now,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            ""
        ]);

        Logger.log("✅ New user created: " + phone);
        return true;

    } catch (err) {
        Logger.log("❌ Error creating user: " + err.message);
        return false;
    }
}

function updateLastSeen(phone) {
    try {
        let user = getUser(phone);

        if (!user) {
            createUser(phone);
            user = getUser(phone);
        }

        if (!user) {
            Logger.log("❌ Could not update last seen for: " + phone);
            return false;
        }

        const sh = getSheet("USERS");
        sh.getRange(user.row, 4).setValue(new Date());
        return true;

    } catch (err) {
        Logger.log("❌ Error updating last seen: " + err.message);
        return false;
    }
}

function saveState(phone, state) {
    try {
        const user = getUser(phone);
        if (user) {
            const sh = getSheet("USERS");
            sh.getRange(user.row, 2).setValue(state);
            Logger.log("✅ State saved: " + state);
        }
    } catch (err) {
        Logger.log("❌ Error saving state: " + err.message);
    }
}

function hoursDiff(date1, date2) {
    if (!date1 || !date2) return 999;
    const diff = Math.abs(date2 - new Date(date1));
    return diff / (1000 * 60 * 60);
}

function getSetting(key) {
    try {
        // First priority: Hardcoded credentials
        if (key === "ACCESS_TOKEN") return WHATSAPP_ACCESS_TOKEN;
        if (key === "PHONE_NUMBER_ID") return WHATSAPP_PHONE_NUMBER_ID;

        const sh = getSheet("SETTINGS");
        if (!sh) { return null; }

        const rows = sh.getDataRange().getValues();
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === key) {
                return rows[i][1];
            }
        }
        return null;
    } catch (err) {
        Logger.log("❌ Error getting setting: " + err.message);
        return null;
    }
}

function checkUserHasLocation(phone) {
    const user = getUser(phone);
    if (!user) return false;
    return user.lat && user.lon && user.outlet;
}

function saveUserLocation(phone, lat, lon) {
    const user = getUser(phone);
    if (user) {
        const sh = getSheet("USERS");
        sh.getRange(user.row, 7).setValue(lat);
        sh.getRange(user.row, 8).setValue(lon);
        Logger.log("✅ Location saved for " + phone);
    }
}

function saveUserOutlet(phone, outletName) {
    const user = getUser(phone);
    if (user) {
        const sh = getSheet("USERS");
        sh.getRange(user.row, 3).setValue(outletName);
        Logger.log("✅ Outlet saved for " + phone + ": " + outletName);
    }
}

function saveUserOrderType(phone, orderType) {
    const user = getUser(phone);
    if (user) {
        const sh = getSheet("USERS");
        sh.getRange(user.row, 5).setValue(orderType);
        Logger.log("✅ Order type saved: " + orderType);
    }
}

function getUserOutlet(phone) {
    const user = getUser(phone);
    return user ? user.outlet : "AL Taza";
}

/* =========================
📤 WHATSAPP API FUNCTIONS
========================= */
function sendWhatsApp(phone, payload) {
    try {
        const token = getSetting("ACCESS_TOKEN") || getMNSetting("ACCESS_TOKEN");
        const phoneNumberId = getSetting("PHONE_NUMBER_ID") || getMNSetting("PHONE_NUMBER_ID");

        if (!token || !phoneNumberId) {
            Logger.log("❌ WhatsApp credentials missing!");
            return false;
        }

        const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

        if (!payload.messaging_product) {
            payload.messaging_product = "whatsapp";
        }
        if (!payload.to) {
            payload.to = phone;
        }

        const options = {
            method: "post",
            contentType: "application/json",
            headers: {
                "Authorization": "Bearer " + token
            },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        logWebhookTraffic("OUTGOING", phone, payload);

        const response = UrlFetchApp.fetch(url, options);
        const result = JSON.parse(response.getContentText());

        if (result.error) {
            Logger.log("❌ WhatsApp API Error: " + JSON.stringify(result.error));
            logErrorToSheet("WhatsApp API Error", JSON.stringify(result.error), phone);
            return false;
        }

        Logger.log("📤 WhatsApp sent successfully: " + JSON.stringify(result));
        return true;

    } catch (err) {
        Logger.log("❌ Error sending WhatsApp: " + err.message);
        return false;
    }
}

function sendText(phone, text) {
    return sendWhatsApp(phone, {
        type: "text",
        text: { body: text }
    });
}

function sendLocationMessage(phone, lat, lon, name, address) {
    try {
        sendWhatsApp(phone, {
            type: "location",
            location: {
                latitude: String(lat),
                longitude: String(lon),
                name: name,
                address: address
            }
        });
        Logger.log("✅ Location message sent");
    } catch (err) {
        Logger.log("⚠️ Could not send location pin: " + err.message);
    }
}

/* =========================
👋 WELCOME & MENU
========================= */
function sendWelcome(phone) {
    const message = "👋 *Welcome to AL Taza!*\n\n" +
        "Fresh food prepared with love! 🌯\n\n" +
        "What would you like to do?";

    sendWhatsApp(phone, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: message },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "BTN_ORDER", title: "🛒 Order Now" } },
                    { type: "reply", reply: { id: "BTN_LOCATION", title: "📍 Find Outlet" } },
                    { type: "reply", reply: { id: "BTN_SUPPORT", title: "📞 Support" } }
                ]
            }
        }
    });
}

function askLocation(phone) {
    try {
        sendWhatsApp(phone, {
            type: "interactive",
            interactive: {
                type: "location_request_message",
                body: {
                    text: "📍 *Please share your location*\n\nWe'll find your nearest AL Taza outlet!"
                },
                action: {
                    name: "send_location"
                }
            }
        });
    } catch (err) {
        sendText(phone, "📍 Please share your location using the 📎 attachment button.");
    }
}

/* =========================
🏪 OUTLET FUNCTIONS
========================= */
function findNearestOutlet(userLat, userLon) {
    const sh = getSheet("OUTLETS");
    const rows = sh.getDataRange().getValues();

    let nearest = null;
    let minDistance = 999999;

    for (let i = 1; i < rows.length; i++) {
        const outlet = {
            name: rows[i][0],
            district: rows[i][1],
            lat: parseFloat(rows[i][2]),
            lon: parseFloat(rows[i][3]),
            phone: rows[i][4],
            radius: parseFloat(rows[i][5] || 10)
        };

        if (!outlet.lat || !outlet.lon || isNaN(outlet.lat) || isNaN(outlet.lon)) {
            continue;
        }

        const distance = calculateDistance(userLat, userLon, outlet.lat, outlet.lon);

        if (distance < minDistance) {
            minDistance = distance;
            nearest = outlet;
            nearest.distance = distance;
        }
    }

    return nearest;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(degrees) {
    return degrees * (Math.PI / 180);
}

function getAdminPhoneForOutlet(outletName) {
    try {
        const sh = getSheet("OUTLETS");
        const rows = sh.getDataRange().getValues();

        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === outletName) {
                return String(rows[i][4]);
            }
        }

        return null;
    } catch (err) {
        Logger.log("❌ Error getting admin phone: " + err.message);
        return null;
    }
}

/* =========================
📦 CATALOGUE FUNCTIONS
========================= */
function sendCatalogue(phone) {
    try {
        const catalogId = getSetting("CATALOG_ID");

        if (!catalogId) {
            sendText(phone, "❌ Catalog not configured. Please contact support.");
            return;
        }

        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phone,
            type: "interactive",
            interactive: {
                type: "catalog_message",
                body: {
                    text: "🛒 *Browse Our Menu*\n\nTap below to see our delicious offerings! 🌯"
                },
                action: {
                    name: "catalog_message",
                    parameters: {
                        thumbnail_product_retailer_id: getFirstProductId()
                    }
                }
            }
        };

        sendWhatsApp(phone, payload);
        Logger.log("✅ Catalog sent successfully");

    } catch (err) {
        Logger.log("❌ Error sending catalog: " + err.message);
        sendText(phone, "❌ Sorry, couldn't load the catalog. Please try again.");
    }
}

function getFirstProductId() {
    try {
        const sh = getSheet("PRODUCTS");
        const rows = sh.getDataRange().getValues();

        if (rows.length > 1) {
            return String(rows[1][0]);
        }

        return null;
    } catch (err) {
        return null;
    }
}

function getProductName(productId) {
    try {
        const sh = getSheet("PRODUCTS");
        const rows = sh.getDataRange().getValues();

        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] == productId) {
                return rows[i][1];
            }
        }

        return productId;
    } catch (err) {
        return productId;
    }
}

/* =========================
🛒 ORDER FUNCTIONS
========================= */
function savePendingOrder(phone, order, total) {
    const user = getUser(phone);
    if (user) {
        const sh = getSheet("USERS");
        const orderData = JSON.stringify({
            order: order,
            total: total,
            timestamp: new Date().getTime()
        });
        sh.getRange(user.row, 12).setValue(orderData);
        Logger.log("✅ Pending order saved");
    }
}

function getPendingOrder(phone) {
    const user = getUser(phone);
    if (user) {
        const sh = getSheet("USERS");
        const orderData = sh.getRange(user.row, 12).getValue();
        if (orderData) {
            return JSON.parse(orderData);
        }
    }
    return null;
}

function clearPendingOrder(phone) {
    const user = getUser(phone);
    if (user) {
        const sh = getSheet("USERS");
        sh.getRange(user.row, 12).setValue("");
        Logger.log("✅ Pending order cleared");
    }
}

function showOrderSummary(phone, order) {
    try {
        Logger.log("📋 Showing order summary for confirmation");

        const items = order.product_items;
        let total = 0;
        let orderSummary = "🛒 *Your Order*\n\n";

        items.forEach((item, index) => {
            const itemTotal = parseFloat(item.item_price) * parseInt(item.quantity);
            total += itemTotal;
            const productName = getProductName(item.product_retailer_id);

            orderSummary += `${index + 1}. *${productName}*\n`;
            orderSummary += `   Qty: ${item.quantity} × ₹${item.item_price} = ₹${itemTotal.toFixed(2)}\n\n`;
        });

        orderSummary += `💰 *Total: ₹${total.toFixed(2)}*\n\n`;
        orderSummary += `🏪 Pickup from: ${getUserOutlet(phone)}\n`;
        orderSummary += `⏰ Ready in: 15-20 minutes\n\n`;
        orderSummary += `💵 *Payment: Pay on Pickup*`;

        savePendingOrder(phone, order, total);

        sendWhatsApp(phone, {
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: orderSummary },
                action: {
                    buttons: [
                        { type: "reply", reply: { id: "CONFIRM_ORDER", title: "✅ Confirm Order" } },
                        { type: "reply", reply: { id: "CANCEL_ORDER", title: "❌ Cancel" } }
                    ]
                }
            }
        });

        saveState(phone, "AWAITING_CONFIRMATION");
        Logger.log("✅ Order summary sent");
    } catch (err) {
        Logger.log("❌ Error in showOrderSummary: " + err.message);
        sendText(phone, "❌ Sorry, there was an error. Please try again.");
        sendWelcome(phone);
        saveState(phone, "MAIN_MENU");
    }
}

function confirmOrder(phone) {
    Logger.log("✅ Customer confirmed order - Pay on Pickup");

    const pendingData = getPendingOrder(phone);

    if (!pendingData) {
        sendText(phone, "❌ No pending order found. Please try again.");
        sendWelcome(phone);
        saveState(phone, "MAIN_MENU");
        return;
    }

    // Directly process as Pay on Pickup (no payment options)
    handleCashPayment(phone);
}

function handleCashPayment(phone) {
    Logger.log("💵 Processing Pay on Pickup order");

    const pendingData = getPendingOrder(phone);

    if (!pendingData) {
        sendText(phone, "❌ No pending order found.");
        return;
    }

    const orderId = saveOrderToSheet(phone, pendingData.order.product_items, pendingData.total, pendingData.order.catalog_id, "PENDING", "CASH");

    clearPendingOrder(phone);

    let confirmMsg = "✅ *Order Confirmed!*\n\n";
    confirmMsg += "📋 Order ID: #" + orderId + "\n";
    confirmMsg += "💵 Payment: Pay on Pickup\n\n";
    confirmMsg += "Thank you! Your order is being prepared.\n";
    confirmMsg += "We'll notify you when it's ready for pickup! 🌯";

    sendText(phone, confirmMsg);

    notifyAdminNewOrder(phone, orderId, pendingData.order.product_items, pendingData.total);

    Utilities.sleep(1000);

    sendWhatsApp(phone, {
        type: "interactive",
        interactive: {
            type: "button",
            body: {
                text: "🙏 *Thank you for choosing AL Taza!*\n\n" +
                    "Your order #" + orderId + " is being prepared with care.\n\n" +
                    "We look forward to serving you again! 😊"
            },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "BTN_MAIN_MENU", title: "🏠 Main Menu" } }
                ]
            }
        }
    });

    saveState(phone, "ORDER_COMPLETED");

    Logger.log("✅ Order confirmed: " + orderId);
}

function saveOrderToSheet(phone, items, total, catalogId, status, paymentMethod, orderId, razorpayPaymentId) {
    try {
        const sh = getSheet("ORDERS");

        if (!orderId) {
            orderId = "ORD" + new Date().getTime().toString().slice(-8);
        }

        const user = getUser(phone);
        const outlet = user ? user.outlet : "Unknown";
        const orderType = user ? user.order_type : "TAKEAWAY";

        let itemsSummary = "";
        items.forEach(item => {
            const productName = getProductName(item.product_retailer_id);
            itemsSummary += productName + " x" + item.quantity + ", ";
        });
        itemsSummary = itemsSummary.slice(0, -2);

        sh.appendRow([
            orderId,
            phone,
            outlet,
            orderType,
            itemsSummary,
            total,
            status,
            paymentMethod || "CASH",
            new Date(),
            razorpayPaymentId || "",
            catalogId,
            ""
        ]);

        Logger.log("✅ Order saved: " + orderId);
        return orderId;

    } catch (err) {
        Logger.log("❌ Error saving order: " + err.message);
        return null;
    }
}

function cancelOrder(phone) {
    Logger.log("❌ Customer cancelled order");

    clearPendingOrder(phone);

    sendText(phone, "❌ Order cancelled.\n\nNo problem! Come back anytime you're hungry! 🌯");

    Utilities.sleep(1000);
    sendWelcome(phone);
    saveState(phone, "MAIN_MENU");
}

/* =========================
📞 CUSTOMER SUPPORT
========================= */
function handleCustomerSupport(phone) {
    const supportPhone = getSetting("SUPPORT_PHONE") || "919746465535";
    const supportName = getSetting("SUPPORT_NAME") || "AL Taza Support";
    const supportEmail = getSetting("SUPPORT_NAME") || "customersupport@al-taza.com";

    let message = "📞 *Customer Support*\n\n";
    message += "👤 " + supportName + "\n";
    message += "📱 WhatsApp: wa.me/" + supportPhone + "\n\n";
    message += "📱 Email" + supportEmail + "\n\n";
    message += "Our team will assist you shortly! 🙏";

    sendText(phone, message);

    // Notify support executive
    const notifyMsg = "📢 *New Support Request*\n\n" +
        "📱 Customer: " + phone + "\n" +
        "⏰ Time: " + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + "\n\n" +
        "Please reach out to them!";

    sendText(supportPhone, notifyMsg);

    Utilities.sleep(1000);
    sendWelcome(phone);
    saveState(phone, "MAIN_MENU");

    Logger.log("✅ Support request handled");
}

/* =========================
🔔 ADMIN NOTIFICATIONS
========================= */
function notifyAdminNewOrder(customerPhone, orderId, items, total) {
    Logger.log("📢 Notifying admin of new order: " + orderId);

    const user = getUser(customerPhone);
    const outlet = user ? user.outlet : "Not Set";

    const adminPhone = getAdminPhoneForOutlet(outlet);

    if (!adminPhone) {
        Logger.log("⚠️ No admin phone found for outlet: " + outlet);
        return;
    }

    let orderDetails = `🔔 *NEW ORDER RECEIVED!*\n\n`;
    orderDetails += `📋 Order ID: #${orderId}\n`;
    orderDetails += `📱 Customer: ${customerPhone}\n`;
    orderDetails += `🏪 Outlet: ${outlet}\n`;
    orderDetails += `💵 Payment: Pay on Pickup\n`;
    orderDetails += `⏰ Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n`;
    orderDetails += `📦 *Items:*\n`;

    items.forEach((item, index) => {
        const productName = getProductName(item.product_retailer_id);
        const itemTotal = parseFloat(item.item_price) * parseInt(item.quantity);
        orderDetails += `${index + 1}. ${productName}\n`;
        orderDetails += `   Qty: ${item.quantity} × ₹${item.item_price} = ₹${itemTotal.toFixed(2)}\n`;
    });

    orderDetails += `\n💰 *Total: ₹${total.toFixed(2)}*\n\n`;
    orderDetails += `👇 *Mark order status below:*`;

    sendWhatsApp(adminPhone, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: orderDetails },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "READY_" + orderId, title: "✅ Order Ready" } },
                    { type: "reply", reply: { id: "CANCEL_ADMIN_" + orderId, title: "❌ Cancel" } }
                ]
            }
        }
    });

    Logger.log("✅ Admin notified: " + adminPhone);
}

function handleAdminOrderReady(adminPhone, orderId) {
    Logger.log("✅ Admin marked order ready: " + orderId);

    const actionKey = "ADMIN_READY_" + adminPhone + "_" + orderId;

    if (isActionAlreadyProcessed(actionKey)) {
        sendText(adminPhone, "⚠️ Order #" + orderId + " was already marked as READY.");
        return;
    }

    markActionAsProcessed(actionKey);

    try {
        updateOrderStatus(orderId, "READY");

        const customerPhone = getCustomerPhoneFromOrder(orderId);

        if (!customerPhone) {
            sendText(adminPhone, "❌ Could not find customer for order #" + orderId);
            return;
        }

        const orderDetails = getOrderDetails(orderId);

        sendText(adminPhone, "✅ Order #" + orderId + " marked as READY\n\n📱 Notifying customer now...");

        Utilities.sleep(1000);

        notifyCustomerOrderReady(customerPhone, orderId, orderDetails);

        sendText(adminPhone, "✅ Customer has been notified! 🎉");

    } catch (err) {
        Logger.log("❌ Error in handleAdminOrderReady: " + err.message);
        sendText(adminPhone, "❌ Error processing order #" + orderId);
    }
}

function handleAdminCancelOrder(adminPhone, orderId) {
    Logger.log("❌ Admin cancelled order: " + orderId);

    const actionKey = "ADMIN_CANCEL_" + adminPhone + "_" + orderId;

    if (isActionAlreadyProcessed(actionKey)) {
        sendText(adminPhone, "⚠️ Order #" + orderId + " was already cancelled.");
        return;
    }

    markActionAsProcessed(actionKey);

    updateOrderStatus(orderId, "CANCELLED");

    const customerPhone = getCustomerPhoneFromOrder(orderId);

    if (customerPhone) {
        sendText(customerPhone,
            "❌ *Order Cancelled*\n\n" +
            "Sorry, your order #" + orderId + " has been cancelled by the outlet.\n\n" +
            "Please contact support for assistance."
        );
    }

    sendText(adminPhone, "✅ Order #" + orderId + " has been cancelled.");
}

function notifyCustomerOrderReady(customerPhone, orderId, orderDetails) {
    Logger.log("📢 Notifying customer order ready: " + orderId);

    const notificationKey = "NOTIFIED_READY_" + customerPhone + "_" + orderId;

    if (isActionAlreadyProcessed(notificationKey)) {
        Logger.log("⚠️ Customer already notified about order " + orderId);
        return true;
    }

    markActionAsProcessed(notificationKey);

    let message = `🎉 *Your Order is Ready!*\n\n`;
    message += `📋 Order ID: #${orderId}\n`;
    message += `🏪 Pickup from: ${orderDetails.outlet || "AL Taza"}\n\n`;
    message += `📦 Your order:\n${orderDetails.items}\n\n`;
    message += `💰 Total: ₹${orderDetails.total}\n`;
    message += `💵 Payment: Pay on Pickup\n\n`;
    message += `📍 Come pick it up at your convenience!`;

    sendWhatsApp(customerPhone, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: message },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "CONFIRM_PICKUP", title: "✅ Picked Up" } }
                ]
            }
        }
    });

    saveState(customerPhone, "AWAITING_PICKUP");
    Logger.log("✅ Customer notified order ready");

    return true;
}

function handleCustomerPickupConfirmation(customerPhone) {
    Logger.log("✅ Customer confirmed pickup: " + customerPhone);

    const orderId = getLatestOrderIdForCustomer(customerPhone);

    if (!orderId) {
        sendText(customerPhone, "❌ No active order found.");
        sendWelcome(customerPhone);
        saveState(customerPhone, "MAIN_MENU");
        return;
    }

    updateOrderStatus(orderId, "COMPLETED");

    sendText(customerPhone,
        "✅ *Thank you!*\n\n" +
        "Order #" + orderId + " marked as picked up.\n\n" +
        "We hope you enjoyed your meal! 🌯\n" +
        "See you again soon! 😊"
    );

    const user = getUser(customerPhone);
    const outlet = user ? user.outlet : "Unknown";
    const adminPhone = getAdminPhoneForOutlet(outlet);

    if (adminPhone) {
        sendText(adminPhone,
            "✅ *Order Completed*\n\n" +
            "📋 Order ID: #" + orderId + "\n" +
            "📱 Customer: " + customerPhone + "\n" +
            "✅ Status: PICKED UP"
        );
    }

    Utilities.sleep(2000);
    sendWelcome(customerPhone);
    saveState(customerPhone, "MAIN_MENU");
}

/* =========================
📊 ORDER STATUS FUNCTIONS
========================= */
function updateOrderStatus(orderId, status) {
    try {
        const sh = getSheet("ORDERS");
        const rows = sh.getDataRange().getValues();

        for (let i = 1; i < rows.length; i++) {
            if (String(rows[i][0]) === String(orderId)) {
                sh.getRange(i + 1, 7).setValue(status);
                Logger.log("✅ Order status updated: " + orderId + " -> " + status);
                return true;
            }
        }

        Logger.log("❌ Order not found: " + orderId);
        return false;

    } catch (err) {
        Logger.log("❌ Error updating order status: " + err.message);
        return false;
    }
}

function getCustomerPhoneFromOrder(orderId) {
    try {
        const sh = getSheet("ORDERS");
        const rows = sh.getDataRange().getValues();

        for (let i = 1; i < rows.length; i++) {
            if (String(rows[i][0]) === String(orderId)) {
                return String(rows[i][1]);
            }
        }

        return null;
    } catch (err) {
        Logger.log("❌ Error getting customer phone: " + err.message);
        return null;
    }
}

function getOrderDetails(orderId) {
    try {
        const sh = getSheet("ORDERS");
        const rows = sh.getDataRange().getValues();

        for (let i = 1; i < rows.length; i++) {
            if (String(rows[i][0]) === String(orderId)) {
                return {
                    outlet: rows[i][2],
                    order_type: rows[i][3],
                    items: rows[i][4],
                    total: rows[i][5],
                    status: rows[i][6],
                    payment_method: rows[i][7]
                };
            }
        }

        return null;
    } catch (err) {
        Logger.log("❌ Error getting order details: " + err.message);
        return null;
    }
}

function getLatestOrderIdForCustomer(phone) {
    try {
        const sh = getSheet("ORDERS");
        const rows = sh.getDataRange().getValues();

        let latestOrder = null;
        let latestTime = null;

        for (let i = 1; i < rows.length; i++) {
            if (String(rows[i][1]) === String(phone) && rows[i][6] === "READY") {
                const orderTime = new Date(rows[i][8]);
                if (!latestTime || orderTime > latestTime) {
                    latestTime = orderTime;
                    latestOrder = rows[i][0];
                }
            }
        }

        return latestOrder;
    } catch (err) {
        Logger.log("❌ Error getting latest order: " + err.message);
        return null;
    }
}

/* =========================
📍 LOCATION HANDLER
========================= */
function handleLocation(phone, location) {
    const lat = location.latitude;
    const lon = location.longitude;

    Logger.log("📍 Processing location: " + lat + ", " + lon);

    saveUserLocation(phone, lat, lon);
    const nearest = findNearestOutlet(lat, lon);

    if (nearest) {
        const distance = nearest.distance.toFixed(2);
        const address = nearest.name + ", " + nearest.district + ", Kerala";

        let message = "📍 *Nearest AL Taza Outlet*\n\n";
        message += "🏪 " + nearest.name + "\n";
        message += "📍 " + nearest.district + ", Kerala\n";
        message += "📏 Distance: " + distance + " km\n";
        message += "📞 Phone: " + nearest.phone + "\n\n";
        message += "🏃 *Takeaway Only*";

        sendText(phone, message);
        sendLocationMessage(phone, nearest.lat, nearest.lon, nearest.name, address);
        saveUserOutlet(phone, nearest.name);
        saveUserOrderType(phone, "TAKEAWAY");

        Utilities.sleep(1500);

        // Automatically send catalogue
        sendCatalogue(phone);
        saveState(phone, "CATALOG");

    } else {
        sendText(phone, "❌ Sorry, no outlets found nearby. Please contact support.");
        sendWelcome(phone);
        saveState(phone, "MAIN_MENU");
    }
}

/* =========================
🛡️ MAIN WEBHOOK HANDLER
========================= */
function doPost(e) {
    try {
        Logger.log("=== INCOMING WEBHOOK ===");

        if (!e || !e.postData || !e.postData.contents) {
            Logger.log("❌ No postData received");
            return ok();
        }

        const data = JSON.parse(e.postData.contents);
        const value = data.entry?.[0]?.changes?.[0]?.value;

        // 🔒 IGNORE STATUS WEBHOOKS
        if (value && value.statuses && value.statuses.length > 0) {
            Logger.log("📊 STATUS WEBHOOK - IGNORING");
            return ok();
        }

        // Check if it's a message webhook
        if (!value || !value.messages || value.messages.length === 0) {
            Logger.log("ℹ️ Skipping non-message event");
            return ok();
        }

        const msg = value.messages[0];
        const phone = msg.from;
        const msgId = msg.id;

        // Log incoming traffic
        logWebhookTraffic("INCOMING", phone, msg);

        // 🛡️ ANTI-LOOP: Check if already processed
        if (isActionAlreadyProcessed(msgId)) {
            logWebhookTraffic("CHECKPOINT 1", phone, "Action already processed, exiting.");
            return ok();
        }
        markActionAsProcessed(msgId);
        logWebhookTraffic("CHECKPOINT 2", phone, "Anti-loop passed.");

        Logger.log("📱 Phone: " + phone + " | ID: " + msgId);
        Logger.log("💬 Message type: " + msg.type);

        const now = new Date();

        const user = getUser(phone);
        logWebhookTraffic("CHECKPOINT 5", phone, "getUser returned: " + (user ? "Existing User" : "null"));
        Logger.log("👤 User state: " + (user ? user.state : "NEW USER"));

        // 🔄 SESSION CHECK: 1 hour timeout
        const isSessionExpired = !user || !user.state || hoursDiff(user.last_seen, now) > 1;
        logWebhookTraffic("CHECKPOINT 6", phone, "Session Expired: " + isSessionExpired + " | State: " + (user ? user.state : "null"));

        /* =========================
        1️⃣ NEW SESSION / EXPIRED
        ========================= */
        if (isSessionExpired) {
            Logger.log("🆕 New or expired session");
            updateLastSeen(phone);

            // If user sent a location, process it directly
            if (msg.type === "location") {
                Logger.log("📍 Location received in new session - processing directly");
                handleLocation(phone, msg.location);
                return ok();
            }

            // Send Pre-Welcome Choice for new or expired sessions
            sendPreWelcome(phone);
            saveState(phone, "MAIN_MENU");
            return ok();
        }

        updateLastSeen(phone);

        /* =========================
        2️⃣ LOCATION MESSAGE
        ========================= */
        if (msg.type === "location") {
            Logger.log("📍 Location message received");
            handleLocation(phone, msg.location);
            return ok();
        }

        /* =========================
        3️⃣ BUTTON CLICK
        ========================= */
        if (msg.type === "interactive") {
            Logger.log("🔘 Interactive button pressed");

            const reply = msg.interactive.button_reply || msg.interactive.list_reply;
            const id = reply?.id || reply?.title;
            debugLog("🔘 Button Pressed ID: " + id, phone);

            // BTN_MUSIC_NIGHT
            if (id === "BTN_MUSIC_NIGHT") {
                try {
                    debugLog("🎤 Routing to MN Flow", phone);
                    handleMusicNightFlow(phone, id, user);
                    return ok();
                } catch (mnErr) {
                    Logger.log("❌ CRITICAL ERROR in MN Flow: " + mnErr.message);
                    sendText(phone, "⚠️ Sorry, the Music Night system is currently unavailable. Please try again later.");
                    return ok();
                }
            }

            // BTN_ORDER
            if (id === "BTN_ORDER") {
                const hasLocation = checkUserHasLocation(phone);
                if (!hasLocation) {
                    askLocation(phone);
                    saveState(phone, "WAITING_LOCATION");
                } else {
                    const savedOutlet = user ? user.outlet : "";
                    let outletMessage = "🏪 *Your Saved Outlet*\n\n";
                    outletMessage += "📍 " + savedOutlet + "\n\n";
                    outletMessage += "Would you like to order from this outlet?";
                    sendWhatsApp(phone, {
                        type: "interactive",
                        interactive: {
                            type: "button",
                            body: { text: outletMessage },
                            action: {
                                buttons: [
                                    { type: "reply", reply: { id: "SELECT_OUTLET", title: "✅ Select This Outlet" } },
                                    { type: "reply", reply: { id: "CHANGE_OUTLET", title: "🔄 Change Outlet" } }
                                ]
                            }
                        }
                    });
                    saveState(phone, "CONFIRMING_OUTLET");
                }
                return ok();
            }

            // SELECT_OUTLET
            if (id === "SELECT_OUTLET") {
                const savedOutlet = user ? user.outlet : "AL Taza";
                sendText(phone, "✅ *" + savedOutlet + " selected!*\n\n🛒 Browse our menu below:");
                saveUserOrderType(phone, "TAKEAWAY");
                Utilities.sleep(500);
                sendCatalogue(phone);
                saveState(phone, "CATALOG");
                return ok();
            }

            // CHANGE_OUTLET / BTN_LOCATION
            if (id === "CHANGE_OUTLET" || id === "BTN_LOCATION") {
                askLocation(phone);
                saveState(phone, "WAITING_LOCATION");
                return ok();
            }

            // BTN_SUPPORT
            if (id === "BTN_SUPPORT") {
                handleCustomerSupport(phone);
                return ok();
            }

            // BTN_MAIN_MENU
            if (id === "BTN_MAIN_MENU") {
                sendPreWelcome(phone);
                saveState(phone, "MAIN_MENU");
                return ok();
            }

            // BTN_AL_TAZA
            if (id === "BTN_AL_TAZA") {
                sendWelcome(phone);
                saveState(phone, "AL_TAZA_MENU");
                return ok();
            }

            // CONFIRM_ORDER
            if (id === "CONFIRM_ORDER") {
                confirmOrder(phone);
                return ok();
            }

            // CANCEL_ORDER
            if (id === "CANCEL_ORDER") {
                cancelOrder(phone);
                return ok();
            }

            // CONFIRM_PICKUP
            if (id === "CONFIRM_PICKUP") {
                handleCustomerPickupConfirmation(phone);
                return ok();
            }

            // ADMIN: READY_{ORDER_ID}
            if (id && id.startsWith("READY_")) {
                const orderId = id.replace("READY_", "");
                handleAdminOrderReady(phone, orderId);
                return ok();
            }

            // ADMIN: CANCEL_ADMIN_{ORDER_ID}
            if (id && id.startsWith("CANCEL_ADMIN_")) {
                const orderId = id.replace("CANCEL_ADMIN_", "");
                handleAdminCancelOrder(phone, orderId);
                return ok();
            }

            // Fallback for Music Night Flow states or any other button pressed during MN flow
            if (user && user.state && user.state.startsWith("MN_")) {
                Logger.log("🎤 Routing to Music Night Flow (State fallback)");
                handleMusicNightFlow(phone, id, user);
                return ok();
            }

            Logger.log("⚠️ Unhandled button ID: " + id);
            return ok();
        }

        /* =========================
        4️⃣ ORDER FROM CATALOG
        ========================= */
        if (msg.type === "order") {
            Logger.log("🛒 Order received from catalog");
            const order = msg.order;
            showOrderSummary(phone, order);
            return ok();
        }

        /* =========================
        5️⃣ TEXT MESSAGE - Dynamic state-based guidance
        ========================= */
        logWebhookTraffic("CHECKPOINT 6.3", phone, "Checking if msg.type is text. Current type: " + msg.type);
        if (msg.type === "text") {
            logWebhookTraffic("CHECKPOINT 6.4", phone, "Inside text message handler. Body: " + msg.text.body);
            Logger.log("💬 Text message received: " + msg.text.body);
            const textLower = msg.text.body.toLowerCase().trim();
            const currentState = user ? user.state : "MAIN_MENU";

            // 🖐️ GREETING CHECK (Priority)
            const greetings = ["hi", "hello", "hey", "hii", "hiii", "welcome", "menu", "start", "hai", "helo", "hello"];
            const isGreeting = greetings.some(g => textLower === g || textLower.startsWith(g + " ") || textLower.startsWith(g + "!"));

            if (isGreeting) {
                logWebhookTraffic("CHECKPOINT 7", phone, "Greeting detected, sending pre-welcome.");
                Logger.log("👋 Greeting detected - showing pre-welcome menu");
                sendPreWelcome(phone);
                saveState(phone, "MAIN_MENU");
                return ok();
            }

            // Route to Music Night Flow if in MN states
            if (currentState && currentState.startsWith("MN_")) {
                logWebhookTraffic("CHECKPOINT 7.1", phone, "Routing to handleMusicNightFlow from state: " + currentState);
                handleMusicNightFlow(phone, msg.text.body, user);
                return ok();
            }

            logWebhookTraffic("CHECKPOINT 8", phone, "Entering dynamic messages switch with state: " + currentState);

            // Dynamic messages based on current state
            let errorMessage = "";

            switch (currentState) {
                case "WAITING_LOCATION":
                    errorMessage = "❌ *Please share your location!*\n\n" +
                        "📍 Click the location button below to share your live location.\n\n" +
                        "💡 We need your location to find the nearest outlet.";
                    sendText(phone, errorMessage);
                    askLocation(phone);
                    break;

                case "CONFIRMING_OUTLET":
                    errorMessage = "❌ *Please select an option!*\n\n" +
                        "👆 Click one of the buttons above:\n" +
                        "✅ Use This Outlet - to continue with your saved outlet\n" +
                        "🔄 Change Outlet - to select a different outlet";
                    sendText(phone, errorMessage);
                    break;

                case "CATALOG":
                    errorMessage = "❌ *Please select items from the menu!*\n\n" +
                        "🛒 Tap on the catalogue message above to browse our menu.\n" +
                        "➕ Add items to your cart and checkout when ready.";
                    sendText(phone, errorMessage);
                    sendCatalogue(phone);
                    break;

                case "AWAITING_CONFIRMATION":
                    errorMessage = "❌ *Please confirm or cancel your order!*\n\n" +
                        "👆 Click one of the buttons above:\n" +
                        "✅ Confirm Order - to place your order\n" +
                        "❌ Cancel - to cancel and start over";
                    sendText(phone, errorMessage);
                    break;

                case "AWAITING_PICKUP":
                    errorMessage = "❌ *Please confirm when you've picked up your order!*\n\n" +
                        "👆 Click the ✅ Picked Up button above when you collect your order.";
                    sendText(phone, errorMessage);
                    break;

                case "ORDER_COMPLETED":
                    errorMessage = "✅ Your last order was completed!\n\n" +
                        "Ready to order again? 🌯";
                    sendText(phone, errorMessage);
                    sendWelcome(phone);
                    saveState(phone, "MAIN_MENU");
                    break;

                default:
                    // MAIN_MENU or unknown state
                    errorMessage = "❌ *Please use the buttons to navigate!*\n\n" +
                        "👇 Select an option below:";
                    sendText(phone, errorMessage);
                    sendWelcome(phone);
                    saveState(phone, "MAIN_MENU");
            }

            return ok();
        }

        return ok();

    } catch (err) {
        Logger.log("❌❌❌ ERROR: " + err.message);
        Logger.log("Stack: " + err.stack);

        // Extract phone number if possible for logging
        let phone = "N/A";
        try {
            const val = JSON.parse(e.postData.contents).entry[0].changes[0].value;
            if (val.messages && val.messages.length > 0) {
                phone = val.messages[0].from;
            }
        } catch (e) { }

        logErrorToSheet(err.message, err.stack, phone);

        return ok();
    }
}

function ok() {
    return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
        .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
    // Webhook verification
    const mode = e.parameter["hub.mode"];
    const token = e.parameter["hub.verify_token"];
    const challenge = e.parameter["hub.challenge"];

    const verifyToken = getSetting("VERIFY_TOKEN") || getMNSetting("VERIFY_TOKEN") || "ALTAZA_123";

    if (mode === "subscribe" && token === verifyToken) {
        Logger.log("✅ Webhook verified");
        return ContentService.createTextOutput(challenge);
    }

    return ContentService.createTextOutput("OK");
}

/* =========================
📤 WHATSAPP MEDIA & DOCS
========================= */

/**
 * Uploads a Blob to WhatsApp Media API
 */
function uploadWhatsAppMedia(blob) {
    try {
        const token = getSetting("ACCESS_TOKEN") || getMNSetting("ACCESS_TOKEN");
        const phoneNumberId = getSetting("PHONE_NUMBER_ID") || getMNSetting("PHONE_NUMBER_ID");

        if (!token || !phoneNumberId) {
            debugLog("❌ Media Upload: Credentials missing");
            return null;
        }

        const mimeType = blob.getContentType();
        const mediaType = mimeType.includes("image") ? "image" : "document";

        const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/media`;
        const options = {
            method: "post",
            headers: {
                "Authorization": "Bearer " + token
            },
            payload: {
                file: blob,
                type: mimeType,
                messaging_product: "whatsapp"
            },
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(url, options);
        const result = JSON.parse(response.getContentText());

        if (result.id) {
            debugLog("✅ Media Uploaded Successfully. ID: " + result.id);
            return result.id;
        } else {
            debugLog("❌ Media Upload Failed: " + JSON.stringify(result));
            return null;
        }
    } catch (err) {
        debugLog("❌ Error in uploadWhatsAppMedia: " + err.message);
        return null;
    }
}

/**
 * Sends a PDF document to WhatsApp
 */
function sendWhatsAppDocument(phone, mediaId, filename) {
    return sendWhatsApp(phone, {
        type: "document",
        document: {
            id: mediaId,
            filename: filename || "ticket.pdf"
        }
    });
}

function sendWhatsAppImage(phone, mediaId, caption) {
    return sendWhatsApp(phone, {
        type: "image",
        image: {
            id: mediaId,
            caption: caption || ""
        }
    });
}

/**
 * 🎤 MUSIC NIGHT MUSCAT 2026 - TICKET BOOKING SYSTEM
 * Separate module for handling ticket bookings, PDF generation, and QR codes.
 */

function debugLog(msg, phone = "") {
    Logger.log("🔍 [DEBUG] " + (phone ? "[" + phone + "] " : "") + msg);
    try {
        // Direct open to avoid getMNSpreadsheet -> debugLog loop
        const ss = SpreadsheetApp.openById(MUSIC_NIGHT_SHEET_ID);
        const logSheet = ss.getSheetByName("ERROR_LOG");
        if (logSheet) {
            logSheet.appendRow([new Date(), phone || "SYSTEM", "DEBUG", msg, ""]);
        }
    } catch (e) {
        // Silently fail to avoid loops
    }
}

function getMNSpreadsheet() {
    if (_mnSpreadsheet) return _mnSpreadsheet;
    try {
        // Use Logger.log directly here to avoid debugLog recursion
        Logger.log("📂 Opening MN Sheet: " + MUSIC_NIGHT_SHEET_ID);
        _mnSpreadsheet = SpreadsheetApp.openById(MUSIC_NIGHT_SHEET_ID);
        return _mnSpreadsheet;
    } catch (err) {
        Logger.log("❌ CRITICAL: Could not open Music Night Spreadsheet: " + err.message);
        return null;
    }
}

/* =========================
📊 DATABASE INITIALIZATION
========================= */
function initMusicNightSheets() {
    if (_mnInitialized) return true;
    try {
        const ss = getMNSpreadsheet();
        if (!ss) return false;

        _mnInitialized = true;
        // 1. Setup Categories Sheet

        // 1. Setup Categories Sheet
        let catSheet = ss.getSheetByName("TICKET_CATEGORIES");
        if (!catSheet) {
            catSheet = ss.insertSheet("TICKET_CATEGORIES");
            catSheet.appendRow(["Category", "Price (OMR)", "Total Seats", "Booked Seats"]);
            catSheet.appendRow(["VVIP", 60, 1000, 0]);
            catSheet.appendRow(["VIP", 40, 1000, 0]);
            catSheet.appendRow(["GOLD", 20, 1000, 0]);
            catSheet.appendRow(["SILVER", 10, 1000, 0]);
            catSheet.getRange("A1:E1").setFontWeight("bold").setBackground("#f3f3f3");
        }

        // 2. Setup Bookings Sheet
        let bookSheet = ss.getSheetByName("BOOKINGS");
        if (!bookSheet) {
            bookSheet = ss.insertSheet("BOOKINGS");
            bookSheet.appendRow([
                "Booking No", "Phone", "Category", "Quantity", "Amount",
                "Timestamp", "Ticket ID", "Status", "Members", "Signature ID", "Entry Status"
            ]);
            bookSheet.getRange("A1:J1").setFontWeight("bold").setBackground("#f3f3f3");
        }

        // 3. Setup Settings Sheet
        let settingsSheet = ss.getSheetByName("MN_SETTINGS");
        if (!settingsSheet) {
            settingsSheet = ss.insertSheet("MN_SETTINGS");
            settingsSheet.appendRow(["Key", "Value", "Description"]);
            settingsSheet.appendRow(["LAST_BOOKING_NO", 1000, "Starting number for increments"]);
            settingsSheet.appendRow(["EVENT_NAME", "Music Night Muscat 2026", "Header for tickets"]);
            settingsSheet.appendRow(["E_SIGNATURE_ID", "", "Drive File ID of signature image"]);
            settingsSheet.appendRow(["TICKETS_FOLDER_ID", "", "Drive Folder ID where PDFs are saved"]);
            settingsSheet.getRange("A1:C1").setFontWeight("bold").setBackground("#f3f3f3");
        }

        // 4. Setup Error Log Sheet
        let logSheet = ss.getSheetByName("ERROR_LOG");
        if (!logSheet) {
            logSheet = ss.insertSheet("ERROR_LOG");
            logSheet.appendRow(["Timestamp", "Phone", "State", "Message", "Error Details"]);
            logSheet.getRange("A1:E1").setFontWeight("bold").setBackground("#f3f3f3");
        }

        Logger.log("✅ Music Night Sheets initialized successfully");
        return true;
    } catch (err) {
        Logger.log("❌ Error initializing sheets: " + err.message);
        return false;
    }
}

/* =========================
⚙️ CONFIG & DATA LOADERS
========================= */
function getMNCategories() {
    try {
        // Hardcoded fallbacks as per user request
        const hardcodedCategories = {
            "VVIP": { price: 60, available: 100, booked: 0, row: null },
            "VIP": { price: 40, available: 100, booked: 0, row: null },
            "GOLD": { price: 20, available: 100, booked: 0, row: null },
            "SILVER": { price: 10, available: 100, booked: 0, row: null }
        };

        const ss = getMNSpreadsheet();
        if (!ss) return hardcodedCategories;

        let sh = ss.getSheetByName("TICKET_CATEGORIES");
        if (!sh) return hardcodedCategories;

        const rows = sh.getDataRange().getValues();
        const categories = {};
        for (let i = 1; i < rows.length; i++) {
            const [name, price, total, booked] = rows[i];
            if (name && String(name).trim() !== "") {
                const cleanName = String(name).trim();
                const nPrice = parseFloat(price) || 0;
                const nTotal = parseFloat(total) || 0;
                const nBooked = parseFloat(booked) || 0;
                categories[cleanName] = {
                    price: nPrice,
                    available: nTotal - nBooked,
                    total: nTotal,
                    booked: nBooked,
                    row: i + 1
                };
            }
        }

        // Merge hardcoded if missing from sheet
        Object.keys(hardcodedCategories).forEach(cat => {
            if (!categories[cat]) categories[cat] = hardcodedCategories[cat];
        });

        return categories;
    } catch (err) {
        Logger.log("❌ Error getting categories: " + err.message);
        return {
            "VVIP": { price: 60, available: 100, booked: 0, row: null },
            "VIP": { price: 40, available: 100, booked: 0, row: null },
            "GOLD": { price: 20, available: 100, booked: 0, row: null },
            "SILVER": { price: 10, available: 100, booked: 0, row: null }
        };
    }
}

/**
 * Gets or creates the Google Drive folder for saving tickets
 */
function getOrCreateTicketsFolder() {
    try {
        let folderId = getMNSetting("TICKETS_FOLDER_ID");
        if (folderId) {
            try {
                return DriveApp.getFolderById(folderId);
            } catch (e) {
                debugLog("⚠️ Saved Folder ID invalid, creating new one...");
            }
        }

        // Create new folder
        const folderName = "Music Night 2026 Tickets";
        const folder = DriveApp.createFolder(folderName);
        folderId = folder.getId();

        // Save to settings
        const ss = getMNSpreadsheet();
        const sh = ss.getSheetByName("MN_SETTINGS");
        const rows = sh.getDataRange().getValues();
        let found = false;
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === "TICKETS_FOLDER_ID") {
                sh.getRange(i + 1, 2).setValue(folderId);
                found = true;
                break;
            }
        }
        if (!found) {
            sh.appendRow(["TICKETS_FOLDER_ID", folderId, "Drive Folder ID where PDFs are saved"]);
        }

        debugLog("📂 Ticket Folder Created: " + folderId);
        return folder;
    } catch (err) {
        debugLog("❌ Error in getOrCreateTicketsFolder: " + err.message);
        return null;
    }
}

function getMNSetting(key) {
    try {
        const ss = getMNSpreadsheet();
        if (!ss) return null;
        const sh = ss.getSheetByName("MN_SETTINGS");
        if (!sh) return null;
        const rows = sh.getDataRange().getValues();
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === key) return rows[i][1];
        }
        return null;
    } catch (err) {
        return null;
    }
}

/* =========================
🎟️ BOOKING CORE LOGIC
========================= */
function processMNBooking(phone, category, quantity, memberNames) {
    const lock = LockService.getScriptLock();
    try {
        // Wait for up to 30 seconds for other processes to finish
        lock.waitLock(30000);

        const cats = getMNCategories();
        const cat = cats[category];

        if (!cat) throw new Error("Invalid category selected.");
        if (cat.available < quantity) throw new Error("Not enough seats available.");

        // Generate Booking Number
        const ss = getMNSpreadsheet();
        if (!ss) throw new Error("Database unavailable.");
        const setSh = ss.getSheetByName("MN_SETTINGS");
        const rows = setSh.getDataRange().getValues();
        let bookingNo = 1000;
        let setRow = -1;

        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === "LAST_BOOKING_NO") {
                bookingNo = parseInt(rows[i][1]) + 1;
                setRow = i + 1;
                break;
            }
        }

        // Update Category Booked Count
        const catSh = ss.getSheetByName("TICKET_CATEGORIES");
        if (catSh && cat.row) {
            catSh.getRange(cat.row, 4).setValue((cat.booked || 0) + quantity);
        }

        // Update Last Booking No
        if (setRow !== -1) {
            setSh.getRange(setRow, 2).setValue(bookingNo);
        }

        const bookSh = ss.getSheetByName("BOOKINGS");
        const ticketId = "MN26-" + bookingNo + "-" + Math.random().toString(36).substring(7).toUpperCase();
        const amount = cat.price * quantity;
        const timestamp = new Date();

        const bookingData = {
            bookingNo: bookingNo,
            phone: phone,
            category: category,
            quantity: quantity,
            amount: amount,
            timestamp: timestamp,
            ticketId: ticketId,
            status: "CONFIRMED",
            members: memberNames,
            entryStatus: ""
        };

        bookSh.appendRow([
            bookingData.bookingNo,
            bookingData.phone,
            bookingData.category,
            bookingData.quantity,
            bookingData.amount,
            bookingData.timestamp,
            bookingData.ticketId,
            bookingData.status,
            JSON.stringify(bookingData.members),
            getMNSetting("E_SIGNATURE_ID"),
            "" // Entry Status
        ]);

        // Trigger Sync to MySQL
        try {
            syncToMySQL(bookingData);
        } catch (e) {
            debugLog("⚠️ MySQL Sync Failed: " + e.message, phone);
        }

        Logger.log("✅ Booking successful: " + bookingNo);

        return bookingData;

    } catch (err) {
        Logger.log("❌ Booking failed: " + err.message);
        throw err;
    } finally {
        lock.releaseLock();
    }
}

/* =========================
📄 PDF TICKET GENERATION
========================= */
function generateMNTicketPDF(bookingData, qrBase64, sigBase64, bgBase64) {
    try {
        const eventName = getMNSetting("EVENT_NAME") || "Music Night Muscat 2026";

        // Use Base64 Data URIs for images to ensure they print correctly in the PDF
        const qrUrl = qrBase64 ? `data:image/png;base64,${qrBase64}` : "";
        const sigUrl = sigBase64 ? `data:image/png;base64,${sigBase64}` : "";
        const bgUrl = bgBase64 ? `data:image/jpeg;base64,${bgBase64}` : "https://lh3.googleusercontent.com/d/1_vTp_J-DLjJ3am6LAVetAO-BFR16htKQ";

        // Template HTML for Ticket matching the precise Google Doc layout
        let htmlContent = `
            <style>
                @page {
                    size: 210mm 99.5mm; /* Forces custom ticket dimensions instead of A4 */
                    margin: 0;
                }
                body {
                    margin: 0;
                    padding: 0;
                    width: 793px;
                    height: 376px;
                }
            </style>
            <div style="font-family: Arial, sans-serif; position: relative; width: 793px; height: 376px; margin: auto; overflow: hidden; background-color: #000;">
                
                <!-- Background heroic image -->
                <img src="${bgUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;" />

                <!-- Text overlays (absolutely positioned to match the Google Doc template) -->
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10; font-family: Arial, sans-serif; color: #ffffff;">
                    
                    <!-- Top section QR (Centering over the red area) -->
                    <div style="position: absolute; top: 25px; left: 620px; width: 150px; text-align: center;">
                        ${qrUrl ? `<img src="${qrUrl}" width="80" height="80" style="border: 2px solid white; border-radius: 5px; background: white;" />` : '<div style="width:80px; height:80px; border:2px solid white; line-height:80px; text-align:center; color:white; margin: 0 auto; font-size: 10px;">QR Error</div>'}
                        
                        <!-- Category Badge under QR -->
                        <div style="margin: 8px auto 0 auto; width: 70px; background-color: #ffffff; color: #cc0000; border-radius: 12px; font-weight: bold; font-size: 11px; padding: 4px; text-align: center; border: 1px solid white;">
                            ${bookingData.category}
                        </div>
                    </div>

                    <!-- Middle Booking Section -->
                    <div style="position: absolute; top: 160px; left: 610px; width: 190px; font-size: 9px; line-height: 1.6; font-weight: normal; color: #ffffff;">
                        <p style="margin: 0; margin-bottom: 5px; color: #ffffff;"><strong>Booking No:</strong> ${bookingData.bookingNo}</p>
                        <p style="margin: 0; color: #ffffff;"><strong>Ticket ID:</strong>  <span style="font-family: monospace; font-size: 10px; color: #ffffff;">${bookingData.ticketId}</span></p>
                    </div>

                    <!-- Bottom Details Section -->
                    <div style="position: absolute; top: 220px; left: 610px; width: 190px; font-size: 9px; line-height: 1.6; font-weight: normal; color: #ffffff;">
                        <p style="margin: 0; margin-bottom: 5px; color: #ffffff;"><strong>Quantity:</strong> ${bookingData.quantity} Ticket(s)</p>
                        <p style="margin: 0; margin-bottom: 5px; color: #ffffff;"><strong>Total Amount:</strong> OMR ${bookingData.amount.toFixed(2)}</p>
                        <p style="margin: 0; color: #ffffff;"><strong>Member Details:</strong> ${bookingData.members.join(", ")}</p>
                    </div>

                    <!-- Terms & Conditions Footer -->
                    <div style="position: absolute; top: 290px; left: 610px; width: 190px; font-size: 6px; line-height: 1.4; color: #ffffff;">
                        <p style="margin: 0 0 3px 0; font-weight: bold; color: #ffffff;">Terms & Conditions:</p>
                        <ul style="margin: 0; padding-left: 15px; color: #ffffff;">
                            <li style="color: #ffffff;">Tickets are non-refundable.</li>
                            <li style="color: #ffffff;">Valid ID required at venue.</li>
                            <li style="color: #ffffff;">Management reserves the right of admission.</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        // Note: Actual PDF generation in Google Apps Script involves:
        // const blob = Utilities.newBlob(htmlContent, "text/html", "ticket.html");
        // const pdf = blob.getAs("application/pdf");

        Logger.log("✅ PDF HTML generated for Ticket #" + bookingData.bookingNo);
        return htmlContent;

    } catch (err) {
        Logger.log("❌ Error generating PDF content: " + err.message);
        return null;
    }
}

/* =========================
📱 WHATSAPP FLOW (MUSIC NIGHT)
========================= */
function handleMusicNightFlow(phone, message, user) {
    try {
        // Ensure sheets are initialized
        initMusicNightSheets();

        const currentState = (user && user.state) ? user.state : "MN_MAIN";
        debugLog("🎤 Music Night Flow - State: " + currentState + " - Message: " + message, phone);
        logWebhookTraffic("MN_FLOW", phone, "Entering handleMusicNightFlow. State: " + currentState + " | Msg: " + message);

        if (message === "BTN_MUSIC_NIGHT") {
            sendMNWelcome(phone);
            saveState(phone, "MN_WELCOME_WAIT");
            return;
        }

        if (message === "BTN_MN_BOOK_NOW") {
            sendMNCategorySelect(phone);
            saveState(phone, "MN_CATEGORY_SELECT");
            return;
        }

        switch (currentState) {
            case "MN_WELCOME_WAIT":
            case "MN_CATEGORY_SELECT":
                if (message.startsWith("CAT_")) {
                    const category = message.replace("CAT_", "");
                    debugLog("🎟️ Category selected: " + category, phone);
                    saveUserTempData(phone, { category: category });
                    sendMNQuantityRequest(phone, category);
                    saveState(phone, "MN_QUANTITY_INPUT");
                }
                break;

            case "MN_QUANTITY_INPUT":
                let qtyStr = message;
                if (message.startsWith("QTY_")) {
                    qtyStr = message.replace("QTY_", "");
                }
                const qty = parseInt(qtyStr);
                if (!isNaN(qty) && qty > 0) {
                    const tempData = getUserTempData(phone);
                    tempData.quantity = qty;
                    tempData.members = [];
                    saveUserTempData(phone, tempData);
                    sendMNMemberNameRequest(phone);
                    saveState(phone, "MN_MEMBER_NAME");
                } else {
                    sendText(phone, "⚠️ Please enter a valid number of tickets from the list.");
                }
                break;

            case "MN_MEMBER_NAME":
                const tData = getUserTempData(phone);
                tData.members = [message]; // Only one name wanted now
                saveUserTempData(phone, tData);
                showMNBookingSummary(phone, tData);
                saveState(phone, "MN_CONFIRM_AWAIT");
                break;
                break;

            case "MN_CONFIRM_AWAIT":
                if (message === "CONFIRM_MN_BOOKING") {
                    const data = getUserTempData(phone);
                    try {
                        const booking = processMNBooking(phone, data.category, data.quantity, data.members);
                        sendMNSuccess(phone, booking);
                        saveState(phone, "MAIN_MENU");
                    } catch (e) {
                        sendText(phone, "❌ Sorry, booking failed: " + e.message);
                        sendMNWelcome(phone);
                        saveState(phone, "MN_CATEGORY_SELECT");
                    }
                } else if (message === "CANCEL_MN_BOOKING") {
                    sendText(phone, "❌ Booking cancelled.");
                    sendWelcome(phone);
                    saveState(phone, "MAIN_MENU");
                }
                break;
        }
    } catch (err) {
        Logger.log("❌ CRITICAL error in handleMusicNightFlow: " + err.message);
        logMNError(phone, (user && user.state) ? user.state : "UNKNOWN", "Flow Crash", err.message + "\nStack: " + err.stack);
        sendText(phone, "⚠️ Sorry, we encountered an error. Please type 'menu' to restart.");
    }
}

/**
 * Logs errors to the ERROR_LOG sheet
 */
function logMNError(phone, state, message, details) {
    try {
        const ss = SpreadsheetApp.openById(MUSIC_NIGHT_SHEET_ID);
        const sh = ss.getSheetByName("ERROR_LOG");
        sh.appendRow([new Date(), phone, state, message, details]);
    } catch (e) {
        Logger.log("❌ Failed to log error to sheet: " + e.message);
    }
}

/* =========================
📢 WHATSAPP UI HELPERS (MN)
========================= */
function sendMNWelcome(phone) {
    let msg = "Muscat Star Night 2026 Season 4 🔥🎧\n\n" +
        "\"Muscattttt… Are you readyyyyy?!!\" 🌟\n\n" +
        "This is your official call to the biggest entertainment night of the year…\n\n" +
        "Welcome to Muscat Star Night 2026 – Season 4!\n\n" +
        "On April 10, Friday…\n\n" +
        "At Muscat Club, Al Wadi Kabir…\n\n" +
        "We are bringing you non-stop music, live performances, and a massive food festival under one roof! 🎶✨";

    const imageUrl = "https://lh3.googleusercontent.com/d/12Ajc6kYTPKreLhRBs2ZtfRfNCHiK2oNR";

    sendWhatsApp(phone, {
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

function sendMNCategorySelect(phone) {
    const imageUrl = "https://lh3.googleusercontent.com/d/1VyFxQIWWQNB2pFHnm_iwAbjBQlY_38q2";

    // ⚠️ CRITICAL: WhatsApp API strictly forbids combining an Image Header with a List interactive message.
    // Interactive Buttons with an Image Header can only have exactly 3 buttons (we have 4 categories).
    // Therefore, it MUST be sent as two separate messages to be delivered reliably.

    // 1. Send the image first
    sendWhatsApp(phone, {
        type: "image",
        image: { link: imageUrl, caption: "🎫 View the seating layout above to choose your category." }
    });

    // 2. Send the categories as a List 
    sendWhatsApp(phone, {
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

function sendMNQuantityRequest(phone, category) {
    const rows = [];
    for (let i = 1; i <= 10; i++) {
        rows.push({
            id: "QTY_" + i,
            title: i + " Ticket" + (i > 1 ? "s" : ""),
            description: "Book " + i + " ticket" + (i > 1 ? "s" : "")
        });
    }

    sendWhatsApp(phone, {
        type: "interactive",
        interactive: {
            type: "list",
            header: { type: "text", text: "Select Quantity" },
            body: { text: "🎫 How many tickets would you like to book for " + category + "?" },
            footer: { text: "Music Night Muscat 2026" },
            action: {
                button: "Choose Quantity",
                sections: [
                    {
                        title: "Number of Tickets",
                        rows: rows
                    }
                ]
            }
        }
    });
}

function sendMNMemberNameRequest(phone) {
    sendText(phone, `Kindly share your good name with us`);
}

function showMNBookingSummary(phone, data) {
    const cats = getMNCategories();
    const price = cats[data.category] ? cats[data.category].price : 0;
    const total = price * data.quantity;

    let summary = "📋 *Booking Summary*\n\n" +
        "🎤 Event: Music Night Muscat 2026\n" +
        "🎫 Category: " + data.category + " \n" +
        "🔢 Quantity: " + data.quantity + " \n" +
        "💰 Total: OMR " + total.toFixed(2) + " \n\n" +
        "👤 NAME\n1. " + data.members[0];

    sendWhatsApp(phone, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: summary },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "CONFIRM_MN_BOOKING", title: "✅ Confirm Booking" } },
                    { type: "reply", reply: { id: "CANCEL_MN_BOOKING", title: "❌ Cancel" } }
                ]
            }
        }
    });
}

function sendMNSuccess(phone, booking) {
    let msg = "✅ *Booking Successful!*\n\n";
    msg += `Booking No: #${booking.bookingNo} \n`;
    msg += `Ticket ID: ${booking.ticketId} \n\n`;
    msg += "📄 Your PDF ticket is being generated and will be sent to you shortly.\n\nThank you for booking with us! �";

    sendText(phone, msg);

    // Trigger PDF generation and delivery
    generateAndSendMNTicket(phone, booking);
}

function generateAndSendMNTicket(phone, booking) {
    try {
        debugLog("📄 Starting PDF Ticket Process for #" + booking.bookingNo, phone);

        // 1. Fetch QR Code as Blob for Sending Separately
        const webUrl = "https://digital-card.business/fest/verify.php";
        const qrData = webUrl + "?id=" + booking.ticketId;
        const qrApiUrl = "https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=" + encodeURIComponent(qrData);

        const qrResp = UrlFetchApp.fetch(qrApiUrl);
        const qrBlob = qrResp.getBlob().setName(`QR_${booking.bookingNo}.png`);
        const qrBase64 = Utilities.base64Encode(qrBlob.getBytes());

        // 2. Send QR Code Image first
        const qrMediaId = uploadWhatsAppMedia(qrBlob);
        if (qrMediaId) {
            sendWhatsAppImage(phone, qrMediaId, `Scan this QR code at the entrance: Booking #${booking.bookingNo} `);
            debugLog("✅ QR Code Image sent separately", phone);
        }

        // 3. Fetch Signature and Background as Base64 for PDF
        let sigBase64 = "";
        try {
            const sigId = getMNSetting("E_SIGNATURE_ID");
            if (sigId) {
                const sigBlob = DriveApp.getFileById(sigId).getBlob();
                sigBase64 = Utilities.base64Encode(sigBlob.getBytes());
            }
        } catch (e) {
            debugLog("⚠️ Signature Fetch Failed: " + e.message, phone);
        }

        let bgBase64 = "";
        try {
            const bgImgUrl = "https://lh3.googleusercontent.com/d/1_vTp_J-DLjJ3am6LAVetAO-BFR16htKQ";
            const bgResp = UrlFetchApp.fetch(bgImgUrl);
            bgBase64 = Utilities.base64Encode(bgResp.getBlob().getBytes());
        } catch (e) {
            debugLog("⚠️ Background Image Fetch Failed: " + e.message, phone);
        }

        // 4. Generate PDF Ticket
        const html = generateMNTicketPDF(booking, qrBase64, sigBase64, bgBase64);
        if (!html) throw new Error("Could not generate ticket HTML");

        const pdfBlob = Utilities.newBlob(html, "text/html", "ticket.html").getAs("application/pdf").setName(`Ticket_${booking.bookingNo}.pdf`);

        // 5. Save PDF to Drive
        try {
            const folder = getOrCreateTicketsFolder();
            if (folder) folder.createFile(pdfBlob);
        } catch (e) { }

        // 6. Send PDF as Document
        const pdfMediaId = uploadWhatsAppMedia(pdfBlob);
        if (pdfMediaId) {
            sendWhatsAppDocument(phone, pdfMediaId, `Ticket_${booking.bookingNo}.pdf`);
            debugLog("✅ PDF Ticket sent successfully", phone);
        }

    } catch (err) {
        debugLog("❌ PDF Generation/Delivery Failed: " + err.message, phone);
        logMNError(phone, "PDF_DELIVERY", "Failed to send ticket PDF", err.message);
        sendText(phone, "⚠️ Sorry, we had an issue delivering your PDF ticket automatically. Please contact support with your Booking ID: #" + booking.bookingNo);
    }
}

function saveUserTempData(phone, data) {
    const cache = CacheService.getScriptCache();
    cache.put("TEMP_MN_" + phone, JSON.stringify(data), 3600);
}

function getUserTempData(phone) {
    const cache = CacheService.getScriptCache();
    const data = cache.get("TEMP_MN_" + phone);
    return data ? JSON.parse(data) : {};
}

/**
 * Synchronizes booking data to the cPanel MySQL database
 */
function syncToMySQL(booking) {
    try {
        const syncUrl = "https://digital-card.business/fest/sync.php";
        const payload = {
            token: "MN2026_SECURE_SYNC",
            bookingNo: booking.bookingNo,
            phone: booking.phone,
            category: booking.category,
            quantity: booking.quantity,
            amount: booking.amount,
            timestamp: booking.timestamp,
            ticketId: booking.ticketId,
            status: booking.status,
            members: booking.members,
            entryStatus: booking.entryStatus
        };

        const options = {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(syncUrl, options);
        debugLog("🔄 MySQL Sync Response: " + response.getContentText(), booking.phone);
        return true;
    } catch (e) {
        debugLog("❌ syncToMySQL Error: " + e.message, booking.phone);
        return false;
    }
}
