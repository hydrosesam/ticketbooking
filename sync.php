<?php
/**
 * 🔄 MYSQL SYNC ENDPOINT
 * This script receives booking data from Google Sheets and saves it to MySQL.
 */

require_once 'db_config.php';
date_default_timezone_set('Asia/Muscat');

// Security Token (Optional: Change this to match your music_night.js token)
$syncToken = "MN2026_SECURE_SYNC";

// Get raw POST data
$rawData = file_get_contents("php://input");
$data = json_decode($rawData, true);

if (!$data || !isset($data['token']) || $data['token'] !== $syncToken) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized or invalid data']);
    exit;
}

$conn = getDbConnection();
if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'MySQL Connection Failed']);
    exit;
}

// Prepare Data
$bookingNo  = $conn->real_escape_string($data['bookingNo']);
$phone      = $conn->real_escape_string($data['phone']);
$category   = $conn->real_escape_string($data['category']);
$quantity   = (int)$data['quantity'];
$amount     = (float)$data['amount'];
$timestamp  = $conn->real_escape_string($data['timestamp']);
$ticketId   = $conn->real_escape_string($data['ticketId']);
$status     = $conn->real_escape_string($data['status']);
$members    = $conn->real_escape_string(json_encode($data['members']));
$entryStatus = $conn->real_escape_string($data['entryStatus'] ?? '');

// Insert or Update (on Duplicate Ticket ID)
$sql = "INSERT INTO mn_bookings 
        (booking_no, phone, category, quantity, amount, timestamp, ticket_id, status, members, entry_status)
        VALUES 
        ('$bookingNo', '$phone', '$category', $quantity, $amount, '$timestamp', '$ticketId', '$status', '$members', '$entryStatus')
        ON DUPLICATE KEY UPDATE 
        status = VALUES(status),
        entry_status = VALUES(entry_status)";

if ($conn->query($sql)) {
    echo json_encode(['success' => true, 'message' => 'Synced to MySQL successfully']);
} else {
    echo json_encode(['success' => false, 'message' => 'MySQL Error: ' . $conn->error]);
}

$conn->close();
?>
