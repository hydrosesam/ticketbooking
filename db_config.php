<?php
/**
 * 🛠️ DATABASE CONFIGURATION
 * Provide your phpMyAdmin (MySQL) details here.
 */

define('DB_HOST', 'localhost');
define('DB_USER', 'kumarjobs_fest_user'); // Replace with your MySQL username
define('DB_PASS', 'RI93xV6O+2LFL+{)');       // Replace with your MySQL password
define('DB_NAME', 'kumarjobs_fest_db');     // Replace with your Database name

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
