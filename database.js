const mysql = require('mysql2/promise');
require('dotenv').config();

// Create the connection pool
// Railway / Cloud providers typically use a single database URL string
const dbConfig = process.env.MYSQL_URL || process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'kumarjobs_fest_user',
    password: process.env.DB_PASSWORD || 'RI93xV6O+2LFL+{)',
    database: process.env.DB_NAME || 'kumarjobs_fest_db',
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
                entry_status VARCHAR(100) DEFAULT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Checked/Created table: mn_bookings');

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
