const db = require('./database');

async function clearData() {
    console.log("🧹 Clearing bookings and enquiries...");
    try {
        await db.query("TRUNCATE TABLE mn_bookings");
        console.log("✅ Table mn_bookings cleared.");
        await db.query("TRUNCATE TABLE mn_enquiries");
        console.log("✅ Table mn_enquiries cleared.");
        await db.query("TRUNCATE TABLE mn_abandoned_carts");
        console.log("✅ Table mn_abandoned_carts cleared.");
        await db.query("TRUNCATE TABLE mn_messages");
        console.log("✅ Table mn_messages cleared.");
        
        // Also remove SILVER from inventory if it exists
        await db.query("DELETE FROM mn_inventory WHERE category = 'SILVER'");
        console.log("✅ SILVER category removed from inventory.");
        
        // Reset inventory booked seats to 0
        await db.query("UPDATE mn_inventory SET booked_seats = 0");
        console.log("✅ Inventory booked seats reset to 0.");

        console.log("🌟 Data cleanup complete!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Cleanup failed:", err.message);
        process.exit(1);
    }
}

clearData();
