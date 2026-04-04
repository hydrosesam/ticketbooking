const bot = require('./bot');
const db = require('./database');

async function testTrigger() {
    const testPhone = '9999999999';
    
    console.log("--- Test 1: Any keyword in MN_MAIN ---");
    // Ensure user is in MN_MAIN
    await db.query("DELETE FROM mn_users WHERE phone_number = ?", [testPhone]);
    
    // Manual mock of the flow
    // We expect handleMusicNightFlow to call sendMNWelcome
    // Since we can't easily intercept the call without a more complex mock, 
    // we'll at least check if it changes the state from MN_MAIN to MN_WELCOME_WAIT
    
    try {
        await bot.handleMusicNightFlow(testPhone, "RandomKeyword");
        const user = await db.query("SELECT state FROM mn_users WHERE phone_number = ?", [testPhone]);
        console.log("State after random keyword in MN_MAIN:", user[0].state);
        if (user[0].state === 'MN_WELCOME_WAIT') {
            console.log("✅ Success: Any keyword triggered the welcome flow.");
        } else {
            console.log("❌ Failure: Bot did not trigger on random keyword.");
        }
    } catch (e) {
        console.error("Error during Test 1:", e);
    }

    console.log("\n--- Test 2: Standard reset trigger in other state ---");
    await db.query("UPDATE mn_users SET state = 'MN_CATEGORY_SELECT' WHERE phone_number = ?", [testPhone]);
    try {
        await bot.handleMusicNightFlow(testPhone, "hi");
        const user = await db.query("SELECT state FROM mn_users WHERE phone_number = ?", [testPhone]);
        console.log("State after 'hi' in MN_CATEGORY_SELECT:", user[0].state);
        if (user[0].state === 'MN_WELCOME_WAIT') {
            console.log("✅ Success: Reset trigger worked.");
        } else {
            console.log("❌ Failure: Reset trigger failed.");
        }
    } catch (e) {
        console.error("Error during Test 2:", e);
    }

    process.exit(0);
}

testTrigger();
