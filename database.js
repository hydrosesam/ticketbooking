const mysql = require('mysql2/promise');
require('dotenv').config();

// Create the connection pool
// Railway MYSQL_URL connection string is the primary source
const dbConfig = process.env.MYSQL_URL || process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'interchange.proxy.rlwy.net',
    port: 36032,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'NcxrttDtfqsAvxcQDIdQnvNCuRSqLnYf',
    database: process.env.DB_NAME || 'railway',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
};

const pool = mysql.createPool(dbConfig);

async function initDatabase() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connected to MySQL database successfully.');

        // 1. Create mn_users table for state management
        await connection.query(`
            CREATE TABLE IF NOT EXISTS mn_users (
                phone_number VARCHAR(20) PRIMARY KEY,
                state VARCHAR(50) NOT NULL DEFAULT 'MN_MAIN',
                temp_category VARCHAR(20) DEFAULT NULL,
                temp_quantity INT DEFAULT NULL,
                temp_members JSON DEFAULT NULL,
                temp_slip_url TEXT DEFAULT NULL,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Checked/Created table: mn_users');

        // 2. Create mn_bookings table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS mn_bookings (
                booking_no VARCHAR(20) PRIMARY KEY,
                ticket_id VARCHAR(50) UNIQUE NOT NULL,
                phone VARCHAR(20) NOT NULL,
                category VARCHAR(20) NOT NULL,
                quantity INT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                members JSON NOT NULL,
                status VARCHAR(20) DEFAULT 'Confirmed',
                payment_status VARCHAR(20) DEFAULT 'pending',
                payment_slip_url TEXT DEFAULT NULL,
                entry_status VARCHAR(100) DEFAULT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Checked/Created table: mn_bookings');

        // 3. Create mn_inventory table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS mn_inventory (
                category VARCHAR(20) PRIMARY KEY,
                total_seats INT NOT NULL DEFAULT 0,
                booked_seats INT NOT NULL DEFAULT 0
            )
        `);
        console.log('✅ Checked/Created table: mn_inventory');

        // 4. Create mn_admins table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS mn_admins (
                phone VARCHAR(20) PRIMARY KEY,
                name VARCHAR(50) DEFAULT 'Admin',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Checked/Created table: mn_admins');

        // 5. Create mn_otp table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS mn_otp (
                phone VARCHAR(20) PRIMARY KEY,
                code VARCHAR(6) NOT NULL,
                expires_at TIMESTAMP NOT NULL
            )
        `);
        console.log('✅ Checked/Created table: mn_otp');

        // Seed initial capacities (INSERT IGNORE preserves existing data)
        await connection.query(`
            INSERT IGNORE INTO mn_inventory (category, total_seats, booked_seats) VALUES
            ('VVIP', 50, 0),
            ('VIP', 100, 0),
            ('GOLD', 200, 0),
            ('SILVER', 300, 0)
        `);
        console.log('✅ Synchronized inventory starting counts.');

        // Seed initial admin
        await connection.query(`
            INSERT IGNORE INTO mn_admins (phone, name) VALUES ('918943807383', 'Primary Admin')
        `);
        console.log('✅ Seeded admin: 918943807383');

        // Simple Migrations for existing tables
        try {
            await connection.query("ALTER TABLE mn_users ADD COLUMN temp_slip_url TEXT DEFAULT NULL");
            console.log('✅ Migration: Added temp_slip_url to mn_users');
        } catch (e) { }

        try {
            await connection.query("ALTER TABLE mn_bookings ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending'");
            await connection.query("ALTER TABLE mn_bookings ADD COLUMN payment_slip_url TEXT DEFAULT NULL");
            console.log('✅ Migration: Added payment columns to mn_bookings');
        } catch (e) { }

        connection.release();
    } catch (err) {
        console.error('❌ Failed to initialize database:', err.message);
    }
}

// Ensure tables exist on startup
initDatabase();

module.exports = {
    query: async (sql, params) => {
        const [results,] = await pool.execute(sql, params);
        return results;
    },
    pool
};
