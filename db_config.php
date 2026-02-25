<?php
/**
 * 🛠️ DATABASE CONFIGURATION
 * Provide your phpMyAdmin (MySQL) details here.
 */

define('DB_HOST', 'interchange.proxy.rlwy.net:36032');
define('DB_USER', 'root');
define('DB_PASS', 'NcxrttDtfqsAvxcQDIdQnvNCuRSqLnYf');
define('DB_NAME', 'railway');

/**
 * Establish Database Connection
 */
function getDbConnection() {
    try {
        $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
        if ($conn->connect_error) {
            return null;
        }
        $conn->set_charset("utf8mb4");
        return $conn;
    } catch (Exception $e) {
        return null;
    }
}
?>
