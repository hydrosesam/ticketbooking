const mysql = require('mysql2/promise');
require('dotenv').config();

// Create the connection pool
// Railway MYSQL_URL connection string is the primary source
const dbConfig = process.env.MYSQL_URL || {
    host: process.env.DB_HOST || 'interchange.proxy.rlwy.net',
    port: process.env.DB_PORT || 36032,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'NcxrttDtfqsAvxcQDIdQnvNCuRSqLnYf',
    database: process.env.DB_NAME || 'railway',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    connectTimeout: 20000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
};

const pool = mysql.createPool(dbConfig);

async function initDatabase() {
    try {
        const connection = await pool.getConnection();
        const hostInfo = typeof dbConfig === 'string' ? dbConfig.split('@')[1] : `${dbConfig.host}:${dbConfig.port}`;
        console.log(`📡 Attempting to connect to: ${hostInfo}`);
        console.log('✅ Connected to MySQL database successfully.');

        // 1. Create mn_users table for state management
        await connection.query(`
            CREATE TABLE IF NOT EXISTS mn_users (
                phone_number VARCHAR(20) PRIMARY KEY,
                state VARCHAR(50) NOT NULL DEFAULT 'MN_LANG_SELECT',
                language VARCHAR(10) DEFAULT 'en',
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
                booking_no INT AUTO_INCREMENT PRIMARY KEY,
                ticket_id VARCHAR(50) UNIQUE NOT NULL,
                phone VARCHAR(20) NOT NULL,
                category VARCHAR(20) NOT NULL,
                quantity INT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                members JSON NOT NULL,
                status VARCHAR(20) DEFAULT 'Confirmed',
                payment_status VARCHAR(20) DEFAULT 'pending',
                payment_slip_url TEXT DEFAULT NULL,
                bank_transaction_id VARCHAR(50) UNIQUE DEFAULT NULL,
                bank_amount DECIMAL(10,2) DEFAULT NULL,
                bank_datetime VARCHAR(50) DEFAULT NULL,
                bank_beneficiary VARCHAR(100) DEFAULT NULL,
                bank_mobile VARCHAR(20) DEFAULT NULL,
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
                role VARCHAR(20) DEFAULT 'admin',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Checked/Created table: mn_admins');

        // Simple Migrations for existing tables
        try {
            await connection.query("ALTER TABLE mn_admins ADD COLUMN role VARCHAR(20) DEFAULT 'admin'");
            console.log('✅ Migration: Added role to mn_admins');
        } catch (e) { }

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
            ('GUEST', 20, 0),
            ('VVIP', 50, 0),
            ('VIP', 100, 0),
            ('GOLD', 200, 0)
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

        const addColumn = async (table, column, type) => {
            try {
                await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
                console.log(`✅ Migration: Added ${column} to ${table}`);
            } catch (e) {
                // Silently skip if column already exists (expected on restart)
                const isDupCol = e.code === 'ER_DUP_COLUMN_NAME' || (e.message && e.message.includes('Duplicate column'));
                if (!isDupCol) {
                    console.error(`❌ Migration error (${column}):`, e.message);
                }
            }
        };

        await addColumn('mn_bookings', 'bank_transaction_id', 'VARCHAR(50) UNIQUE DEFAULT NULL');
        await addColumn('mn_bookings', 'bank_amount', 'DECIMAL(10,2) DEFAULT NULL');
        await addColumn('mn_bookings', 'bank_datetime', 'VARCHAR(50) DEFAULT NULL');
        await addColumn('mn_bookings', 'bank_beneficiary', 'VARCHAR(100) DEFAULT NULL');
        await addColumn('mn_bookings', 'bank_mobile', 'VARCHAR(20) DEFAULT NULL');
        await addColumn('mn_users', 'language', 'VARCHAR(10) DEFAULT "en"');

        // Performance Indexes
        const addIndex = async (table, indexName, columns) => {
            try {
                await connection.query(`CREATE INDEX ${indexName} ON ${table} (${columns})`);
                console.log(`✅ Migration: Added index ${indexName} to ${table}`);
            } catch (e) {
                // Silently skip if index already exists
                const isDup = e.code === 'ER_DUP_KEYNAME' || (e.message && e.message.includes('Duplicate key'));
                if (!isDup) {
                    console.error(`❌ Index error (${indexName}):`, e.message);
                }
            }
        };

        await addIndex('mn_messages', 'idx_msg_phone_time', 'phone, timestamp DESC');
        await addIndex('mn_messages', 'idx_msg_unread', 'phone, direction, is_read');
        await addIndex('mn_bookings', 'idx_booking_payment', 'payment_status, timestamp DESC');
        await addIndex('mn_bookings', 'idx_booking_entry', 'entry_status, timestamp DESC');

        // 6. Create mn_messages table for chat inbox
        await connection.query(`
            CREATE TABLE IF NOT EXISTS mn_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(20) NOT NULL,
                direction ENUM('inbound', 'outbound') NOT NULL,
                message_type VARCHAR(20) DEFAULT 'text',
                content TEXT,
                media_url TEXT DEFAULT NULL,
                status VARCHAR(20) DEFAULT 'sent',
                is_read TINYINT(1) DEFAULT 0,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Checked/Created table: mn_messages');
        // 7. Create mn_settings table for dynamic configuration
        await connection.query(`
            CREATE TABLE IF NOT EXISTS mn_settings (
                setting_key VARCHAR(100) PRIMARY KEY,
                setting_value TEXT DEFAULT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Checked/Created table: mn_settings');

        // Seed initial settings
        await connection.query(`
            INSERT IGNORE INTO mn_settings (setting_key, setting_value) VALUES
            ('payment_qr_url', 'https://lh3.googleusercontent.com/d/1j8FkUkKn69dtiFFLD1iwhQ2GSe688VIm'),
            ('payment_mobile', '+968 76944041')
        `);
        console.log('✅ Synchronized initial settings.');

        // 8. Create mn_enquiries table for premium tier leads
        await connection.query(`
            CREATE TABLE IF NOT EXISTS mn_enquiries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(20) NOT NULL,
                name VARCHAR(100) DEFAULT NULL,
                category VARCHAR(20) NOT NULL,
                status VARCHAR(20) DEFAULT 'New',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Checked/Created table: mn_enquiries');

        // 9. Create mn_abandoned_carts table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS mn_abandoned_carts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(20) NOT NULL UNIQUE,
                name VARCHAR(100) DEFAULT NULL,
                category VARCHAR(20) NOT NULL,
                quantity INT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Checked/Created table: mn_abandoned_carts');

        connection.release();
    } catch (err) {
        console.error('❌ Failed to initialize database:', err.message);
    }
}

// Ensure tables exist on startup
initDatabase();

module.exports = {
    query: async (sql, params) => {
        const [results,] = await pool.query(sql, params);
        return results;
    },
    pool
};
