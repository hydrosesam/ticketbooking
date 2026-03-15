const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const axios = require('axios');

async function getBase64ImageFromUrl(imageUrl) {
    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const buffer = Buffer.from(response.data, 'binary');
        const mimeType = response.headers['content-type'] || 'image/jpeg';
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (e) {
        console.error('Failed to download image from URL:', imageUrl, e.message);
        return '';
    }
}

async function generateTicketPDF(bookingData) {
    // Generate QR Code containing the verification URL
    const verifyUrl = `https://eventz.cloud/verify?id=${bookingData.ticketId}`;
    let qrBase64 = '';
    try {
        qrBase64 = await QRCode.toDataURL(verifyUrl, { width: 150, margin: 1, color: { dark: '#000000', light: '#ffffff' } });
    } catch (err) {
        console.error("QR Error", err);
    }

    // Convert base64 prefix
    qrBase64 = qrBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

    // Background Image
    // Original link provided by user
    const bgUrlRaw = "https://lh3.googleusercontent.com/d/1vvt_Xnc72OYo5sd-HzOaASOHIOOYFbew";
    const bgUrl = await getBase64ImageFromUrl(bgUrlRaw);

    const qrUrl = qrBase64 ? `data:image/png;base64,${qrBase64}` : "";
    const price = parseFloat(bookingData.amount || 0).toFixed(0);

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                @page {
                    size: 210mm 99.5mm;
                    margin: 0;
                }
                body {
                    margin: 0;
                    padding: 0;
                    width: 793px;
                    height: 376px;
                    background: #000;
                    overflow: hidden;
                }
                .ticket-container {
                    position: relative;
                    width: 793px;
                    height: 376px;
                    font-family: 'Arial', sans-serif;
                }
                .bg-image {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 0;
                }
                .overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 10;
                }
                /* QR Code - Enlarged and Centered in Sidebar */
                .qr-box {
                    position: absolute;
                    top: 87px;
                    left: 655px;
                    width: 98px;
                    height: 98px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 15;
                }
                /* Name and Ticket values aligned with background lines */
                .name-value {
                    position: absolute;
                    top: 193px;
                    left: 660px;
                    width: 130px;
                    font-size: 9px;
                    font-weight: bold;
                    color: #000;
                    text-align: left;
                }
                .sino-value {
                    position: absolute;
                    top: 207px;
                    left: 660px;
                    width: 130px;
                    font-size: 9px;
                    font-weight: bold;
                    color: #000;
                    text-align: left;
                }
            </style>
        </head>
        <body>
            <div class="ticket-container">
                <img src="${bgUrl}" class="bg-image" />
                
                <div class="overlay">
                    <!-- QR Code Overlay -->
                    <div class="qr-box">
                        ${qrUrl ? `<img src="${qrUrl}" width="100" height="100" />` : '<div style="font-size:8px;">QR ERROR</div>'}
                    </div>

                    <!-- Info Overlays -->
                    <div class="name-value">
                        ${Array.isArray(bookingData.members) ? bookingData.members[0] : (bookingData.members || 'Guest')}
                    </div>
                    <div class="sino-value">
                        MMN-${String(bookingData.bookingNo).padStart(4, '0')}
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;

    // Launch puppeteer
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Set HTML
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // Generate PDF Buffer
    const pdfBuffer = await page.pdf({
        width: '210mm',
        height: '99.5mm',
        printBackground: true,
        pageRanges: '1'
    });

    await browser.close();

    return pdfBuffer;
}

async function generateQRCode(text) {
    try {
        return await QRCode.toDataURL(text, { width: 400, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
    } catch (err) {
        console.error("QR Error", err);
        return null;
    }
}

module.exports = { generateTicketPDF, generateQRCode };
