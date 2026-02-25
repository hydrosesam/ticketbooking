<?php
/**
 * 🎫 TICKET VERIFICATION SYSTEM (Premium UI with In-built Scanner)
 * Place this file in your 'fest/' directory on cPanel.
 */

session_start();
date_default_timezone_set('Asia/Muscat');
require_once 'db_config.php';

// --- CONFIGURATION ---
$staffPin = "1234"; 
$csvUrl = "https://docs.google.com/spreadsheets/d/1m7iBiCpjW6UWEJ4j8F3DYf_kpYC5n3XTZh3ZLIwWOD4/pub?gid=612658247&single=true&output=csv"; 
$gasActionUrl = "https://script.google.com/macros/s/AKfycbwL0aOEtHVIrVf1vcn9jgGzbPr1aFqp4wUsOH2N7RCXTApCkJSxB0Qc4jX1Rk-cQQGP/exec";

// --- AUTHENTICATION LOGIC ---
if (isset($_POST['pin'])) {
    if ($_POST['pin'] === $staffPin) {
        $_SESSION['authenticated'] = true;
        $_SESSION['auth_time'] = time();
    } else {
        $authError = "Incorrect Security PIN. Please try again.";
    }
}

if (isset($_SESSION['auth_time']) && (time() - $_SESSION['auth_time'] > 14400)) {
    unset($_SESSION['authenticated']);
}

$ticketId = isset($_GET['id']) ? trim($_GET['id']) : '';

if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    showPinScreen($ticketId, isset($authError) ? $authError : '');
    exit;
}

// --- LOCAL CHECK-IN HANDLER ---
if (isset($_POST['action']) && $_POST['action'] === 'confirm_entry' && !empty($ticketId)) {
    $nowStr = date("d-M H:i");
    $entryMsg = "Checked-In: " . $nowStr;
    
    $conn = getDbConnection();
    if ($conn) {
        $safeId = $conn->real_escape_string($ticketId);
        $safeStatus = $conn->real_escape_string($entryMsg);
        $conn->query("UPDATE mn_bookings SET entry_status = '$safeStatus' WHERE ticket_id = '$safeId'");
        $conn->close();
    }
    
    // Background Sync
    $gsyncUrl = $gasActionUrl . "?action=checkin&id=" . urlencode($ticketId);
    $ch = curl_init(); curl_setopt($ch, CURLOPT_URL, $gsyncUrl); curl_setopt($ch, CURLOPT_RETURNTRANSFER, false); curl_setopt($ch, CURLOPT_TIMEOUT, 1);
    curl_exec($ch); curl_close($ch);
    
    header("Location: " . $_SERVER['PHP_SELF'] . "?id=" . urlencode($ticketId) . "&checkin=success");
    exit;
}

$checkInStatus = isset($_GET['checkin']) ? $_GET['checkin'] : '';

if (empty($ticketId) && !isset($_GET['scanner'])) { 
    showScannerOnly(); 
    exit; 
}

$ticketData = null; $lookupSource = "";
if (!empty($ticketId)) {
    $conn = getDbConnection();
    if ($conn) {
        $safeId = $conn->real_escape_string($ticketId);
        $res = $conn->query("SELECT * FROM mn_bookings WHERE ticket_id = '$safeId' LIMIT 1");
        if ($res && $res->num_rows > 0) {
            $row = $res->fetch_assoc();
            $ticketData = [
                'bookingNo'  => $row['booking_no'], 'phone' => $row['phone'], 'category' => $row['category'],
                'quantity' => $row['quantity'], 'amount' => $row['amount'], 'timestamp' => $row['timestamp'],
                'ticketId' => $row['ticket_id'], 'status' => $row['status'], 'members' => json_decode($row['members'], true) ?: [],
                'entryStatus' => $row['entry_status']
            ];
            $lookupSource = "MYSQL";
        }
        $conn->close();
    }

    if (!$ticketData) {
        $data = fetchCsvData($csvUrl);
        if ($data && $data !== "ERROR_UNAUTHORIZED") {
            $rows = str_getcsv($data, "\n");
            foreach ($rows as $index => $rowContent) {
                if ($index === 0) continue; 
                $row = str_getcsv($rowContent, ",");
                if (isset($row[6]) && trim($row[6]) === $ticketId) {
                    $ticketData = [
                        'bookingNo'  => $row[0], 'phone' => $row[1], 'category' => $row[2], 'quantity' => $row[3],
                        'amount' => $row[4], 'timestamp' => $row[5], 'ticketId' => $row[6], 'status' => $row[7],
                        'members' => json_decode($row[8], true) ?: [], 'entryStatus' => isset($row[10]) ? trim($row[10]) : ''
                    ];
                    $lookupSource = "G_SHEET"; break;
                }
            }
        }
    }
}

if ($ticketData) showSuccess($ticketData, $gasActionUrl, $checkInStatus, $lookupSource);
else if (!empty($ticketId)) showError("Ticket Not Found! Please check if the QR code is genuine.");
else if (isset($_GET['scanner'])) showScannerOnly();

// --- UTILITIES ---

function fetchCsvData($url) {
    $ch = curl_init(); curl_setopt($ch, CURLOPT_URL, $url); curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10); curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0');
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); $data = curl_exec($ch); curl_close($ch);
    return $data;
}

function showPinScreen($ticketId, $error = '') {
    ?>
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
        <title>Staff Access</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Outfit', sans-serif; background: #1a237e; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; color: white; }
          .card { background: white; border-radius: 24px; padding: 40px 30px; width: 90%; max-width: 350px; text-align: center; color: #333; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
          h2 { color: #1a237e; font-weight: 800; margin-bottom: 5px; }
          input { width: 100%; padding: 15px; border: 2px solid #eee; border-radius: 12px; font-size: 24px; text-align: center; letter-spacing: 12px; margin: 20px 0; box-sizing: border-box; }
          button { width: 100%; padding: 15px; background: #1a237e; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; }
          .error { color: #d32f2f; font-size: 13px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🔐 Staff Login</h2>
          <p style="color:#666; font-size:14px;">Enter PIN to verify tickets</p>
          <?php if ($error): ?><div class="error"><?php echo htmlspecialchars($error); ?></div><?php endif; ?>
          <form method="POST" action="?id=<?php echo htmlspecialchars($ticketId); ?>">
            <input type="password" name="pin" placeholder="••••" maxlength="6" autofocus required>
            <button type="submit">Unlock Scanner</button>
          </form>
        </div>
      </body>
    </html>
    <?php
}

function commonHeader($title) {
    ?>
    <head>
        <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
        <title><?php echo $title; ?></title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
        <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
        <style>
          :root { --primary: #1a237e; --success: #2e7d32; --warning: #ff6d00; --bg: #f4f7fa; }
          body { font-family: 'Outfit', sans-serif; background: var(--bg); margin: 0; padding: 10px; display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; }
          .card { background: white; border-radius: 28px; box-shadow: 0 15px 50px rgba(0,0,0,0.1); width: 100%; max-width: 450px; overflow: hidden; margin-top: 10px; position:relative; }
          .header { background: linear-gradient(135deg, #1a237e 0%, #311b92 100%); color: white; padding: 30px 20px; text-align: center; }
          
          #confetti-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(46, 125, 50, 0.9); z-index: 9999; display: none; flex-direction: column; justify-content: center; align-items: center; color: white; text-align: center; transition: 0.5s; }
          .success-circle { width: 100px; height: 100px; border-radius: 50%; background: white; color: #2e7d32; display: flex; justify-content: center; align-items: center; font-size: 50px; margin-bottom: 20px; animation: pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
          @keyframes pop { 0% { transform: scale(0); } 100% { transform: scale(1); } }
          
          .status-badge { padding: 12px 25px; border-radius: 50px; font-weight: 800; font-size: 14px; text-transform: uppercase; margin-top: 15px; display: inline-flex; align-items: center; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
          .valid { background: #4caf50; color: white; }
          .already-used { background: var(--warning); color: white; animation: shake 0.5s ease-in-out infinite alternate; }
          @keyframes shake { from { transform: translateX(-2px); } to { transform: translateX(2px); } }

          .content { padding: 25px; }
          .action-btn { width: 100%; padding: 20px; background: var(--primary); color: white; border: none; border-radius: 20px; font-size: 18px; font-weight: 800; margin-top: 25px; cursor: pointer; display: block; text-align: center; text-decoration: none; transition: 0.3s; box-sizing: border-box; }
          .action-btn:active { transform: scale(0.95); opacity: 0.9; }
          .scan-next-btn { background: #607d8b; margin-top: 15px; }

          #scanner-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000; z-index: 10000; display: none; flex-direction: column; }
          #reader { width: 100%; flex: 1; }
          .scanner-controls { padding: 20px; background: #000; text-align: center; }
          .close-scanner { background: #ff5252; padding: 15px 30px; border-radius: 50px; color: white; border: none; font-weight: 800; font-size: 16px; margin-top: 10px; cursor: pointer; }
          
          .q-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; }
          .q-box { background: #f8faff; padding: 18px; border-radius: 20px; text-align: center; border: 1px solid #e3e9ff; }
          .q-val { font-size: 32px; font-weight: 800; color: var(--primary); display: block; }
          .q-label { font-size: 11px; color: #78909c; text-transform: uppercase; letter-spacing: 1px; }

          .item { display: flex; justify-content: space-between; padding: 15px 5px; border-bottom: 1px solid #eee; }
          .item span:first-child { color: #90a4ae; font-size: 14px; }
          .item span:last-child { font-weight: 700; color: #333; }

          .members { background: #f0f4ff; padding: 15px; border-radius: 18px; margin-top: 15px; }
          .chip { display: inline-block; background: white; color: var(--primary); padding: 6px 14px; border-radius: 12px; font-size: 13px; margin: 4px; font-weight: 600; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }

          .already-scanned-box { background: #fff3e0; border: 2px solid var(--warning); padding: 20px; border-radius: 20px; color: #e65100; margin-top: 15px; text-align: center; }
          .footer { text-align: center; padding: 20px; color: #b0bec5; font-size: 11px; letter-spacing: 1px; }
        </style>
    </head>
    <?php
}

function showScannerOnly() {
    ?>
    <!DOCTYPE html>
    <html lang="en">
    <?php commonHeader("QR Scanner"); ?>
    <body>
        <div id="scanner-overlay" style="display: flex;">
            <div id="reader"></div>
            <div class="scanner-controls">
                <p style="color:#aaa; font-size:12px; margin-bottom:15px;">Target QR Code within the frame</p>
                <button class="close-scanner" onclick="window.location.href='?id='">Cancel</button>
            </div>
        </div>
        <script>
            let html5QrCode = new Html5Qrcode("reader");
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            
            html5QrCode.start({ facingMode: "environment" }, config, (decodedText) => {
                // Handle scanned link
                try {
                    const url = new URL(decodedText);
                    const id = url.searchParams.get("id");
                    if (id) {
                        html5QrCode.stop().then(() => {
                            window.location.href = "?id=" + id;
                        });
                    } else {
                        alert("Invalid QR Code: No ID found");
                    }
                } catch(e) {
                    alert("Invalid QR Code content");
                }
            });
        </script>
    </body>
    </html>
    <?php
}

function showSuccess($data, $gasUrl, $checkInStatus, $source) {
    $isAlreadyVerified = !empty($data['entryStatus']);
    ?>
    <!DOCTYPE html>
    <html lang="en">
    <?php commonHeader("Verification Success"); ?>
    <body>
        <div id="confetti-overlay">
          <div class="success-circle">✓</div>
          <h1 style="margin:0">TICKET CONFIRMED</h1>
          <p>Entry Granted Successfully</p>
          <button class="action-btn scan-next-btn" style="width:200px;" onclick="startScanner()">SCAN NEXT</button>
        </div>

        <div id="scanner-overlay">
            <div id="reader"></div>
            <div class="scanner-controls">
                <button class="close-scanner" onclick="stopScanner()">Close Scanner</button>
            </div>
        </div>

        <div class="card">
          <div class="header">
            <h2 style="margin:0; font-size:24px;">Music Night 2026</h2>
            <?php if ($isAlreadyVerified): ?>
              <div class="status-badge already-used">🛑 ALREADY SCANNED</div>
            <?php else: ?>
              <div class="status-badge valid">🛡️ VALID TICKET</div>
            <?php endif; ?>
          </div>

          <div class="content">
            <div class="q-grid">
              <div class="q-box"><span class="q-val"><?php echo htmlspecialchars($data['quantity']); ?></span><span class="q-label">Total Seats</span></div>
              <div class="q-box"><span class="q-val"><?php echo htmlspecialchars($data['bookingNo']); ?></span><span class="q-label">Booking ID</span></div>
            </div>

            <div class="item"><span>Category</span><span><?php echo htmlspecialchars($data['category']); ?></span></div>
            <div class="item"><span>Payment</span><span style="color:var(--success)">PAID</span></div>

            <div class="members">
              <p style="margin:0 0 10px; font-size:12px; font-weight:800; color:var(--primary); text-transform:uppercase;">Registered Patrons</p>
              <?php foreach ($data['members'] as $m): ?>
                <span class="chip"><?php echo htmlspecialchars($m); ?></span>
              <?php endforeach; ?>
            </div>

            <?php if ($isAlreadyVerified): ?>
              <div class="already-scanned-box">
                <p style="margin:0; font-weight:800; font-size:18px;">ACCESS DENIED</p>
                <p style="margin:5px 0; font-size:14px;">This ticket was verified at:<br>
                <strong><?php echo htmlspecialchars($data['entryStatus']); ?></strong></p>
              </div>
            <?php else: ?>
              <form method="POST" action="?id=<?php echo htmlspecialchars($data['ticketId']); ?>" onsubmit="showAnimation()">
                <input type="hidden" name="action" value="confirm_entry">
                <button type="submit" class="action-btn">CONFIRM ENTRANCE</button>
              </form>
            <?php endif; ?>
            
            <button class="action-btn scan-next-btn" onclick="startScanner()">SCAN NEXT TICKET</button>
          </div>
          <div class="footer">Gate Certified via <?php echo $source; ?></div>
        </div>

        <script>
          let html5QrCode = null;

          function showAnimation() {
            document.getElementById('confetti-overlay').style.display = 'flex';
          }

          function startScanner() {
            document.getElementById('scanner-overlay').style.display = 'flex';
            html5QrCode = new Html5Qrcode("reader");
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            html5QrCode.start({ facingMode: "environment" }, config, (decodedText) => {
                try {
                    const url = new URL(decodedText);
                    const id = url.searchParams.get("id");
                    if (id) {
                        window.location.href = "?id=" + id;
                    }
                } catch(e) {}
            });
          }

          function stopScanner() {
            if (html5QrCode) {
                html5QrCode.stop().then(() => {
                    document.getElementById('scanner-overlay').style.display = 'none';
                });
            } else {
                document.getElementById('scanner-overlay').style.display = 'none';
            }
          }

          <?php if ($checkInStatus === 'success'): ?>
            const overlay = document.getElementById('confetti-overlay');
            overlay.style.display = 'flex';
            // Animation stays until "Scan Next" is clicked
          <?php endif; ?>
        </script>
      </body>
    </html>
    <?php
}

function showError($message) {
    ?>
    <!DOCTYPE html>
    <html lang="en">
    <?php commonHeader("Ticket Error"); ?>
    <body>
        <div id="scanner-overlay">
            <div id="reader"></div>
            <div class="scanner-controls">
                <button class="close-scanner" onclick="stopScanner()">Close Scanner</button>
            </div>
        </div>
        <div class="card" style="margin-top:50px;">
            <div class="header" style="background:#d32f2f;">
                <h2>❌ Error</h2>
            </div>
            <div class="content">
                <p style="text-align:center; color:#555;"><?php echo htmlspecialchars($message); ?></p>
                <button class="action-btn" style="background:#d32f2f" onclick="startScanner()">RE-SCAN TICKET</button>
            </div>
        </div>
        <script>
            let html5QrCode = null;
            function startScanner() {
                document.getElementById('scanner-overlay').style.display = 'flex';
                html5QrCode = new Html5Qrcode("reader");
                const config = { fps: 10, qrbox: { width: 250, height: 250 } };
                html5QrCode.start({ facingMode: "environment" }, config, (decodedText) => {
                    try {
                        const url = new URL(decodedText);
                        const id = url.searchParams.get("id");
                        if (id) window.location.href = "?id=" + id;
                    } catch(e) {}
                });
            }
            function stopScanner() {
                if (html5QrCode) html5QrCode.stop().then(() => document.getElementById('scanner-overlay').style.display = 'none');
                else document.getElementById('scanner-overlay').style.display = 'none';
            }
        </script>
    </body>
    </html>
    <?php
}
?>
