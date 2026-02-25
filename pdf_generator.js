const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const axios = require('axios');

async function getBase64ImageFromUrl(imageUrl) {
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        const mimeType = response.headers['content-type'];
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
    const bgUrlRaw = "https://lh3.googleusercontent.com/d/1_vTp_J-DLjJ3am6LAVetAO-BFR16htKQ";
    const bgUrl = await getBase64ImageFromUrl(bgUrlRaw);

    const qrUrl = qrBase64 ? `data:image/png;base64,${qrBase64}` : "";

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
                }
            </style>
        </head>
        <body>
            <div style="font-family: Arial, sans-serif; position: relative; width: 793px; height: 376px; margin: auto; overflow: hidden; background-color: #000;">
                
                <!-- Background heroic image -->
                <img src="${bgUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;" />

                <!-- Text overlays -->
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10; font-family: Arial, sans-serif; color: #ffffff;">
                    
                    <!-- Top section QR -->
                    <div style="position: absolute; top: 25px; left: 620px; width: 150px; text-align: center;">
                        ${qrUrl ? `<img src="${qrUrl}" width="80" height="80" style="border: 2px solid white; border-radius: 5px; background: white;" />` : '<div style="width:80px; height:80px; border:2px solid white; line-height:80px; text-align:center; color:white; margin: 0 auto; font-size: 10px;">QR Error</div>'}
                        
                        <!-- Category Badge under QR -->
                        <div style="margin: 8px auto 0 auto; width: 70px; background-color: #ffffff; color: #cc0000; border-radius: 12px; font-weight: bold; font-size: 11px; padding: 4px; text-align: center; border: 1px solid white;">
                            ${bookingData.category}
                        </div>
                    </div>

                    <!-- Middle Booking Section -->
                    <div style="position: absolute; top: 160px; left: 610px; width: 190px; font-size: 9px; line-height: 1.6; font-weight: normal; color: #ffffff;">
                        <p style="margin: 0; margin-bottom: 5px; color: #ffffff;"><strong>Booking No:</strong> ${bookingData.bookingNo}</p>
                        <p style="margin: 0; color: #ffffff;"><strong>Ticket ID:</strong>  <span style="font-family: monospace; font-size: 10px; color: #ffffff;">${bookingData.ticketId}</span></p>
                    </div>

                    <!-- Bottom Details Section -->
                    <div style="position: absolute; top: 220px; left: 610px; width: 190px; font-size: 9px; line-height: 1.6; font-weight: normal; color: #ffffff;">
                        <p style="margin: 0; margin-bottom: 5px; color: #ffffff;"><strong>Quantity:</strong> ${bookingData.quantity} Ticket(s)</p>
                        <p style="margin: 0; margin-bottom: 5px; color: #ffffff;"><strong>Total Amount:</strong> OMR ${parseFloat(bookingData.amount).toFixed(2)}</p>
                        <p style="margin: 0; color: #ffffff;"><strong>Member Details:</strong> ${Array.isArray(bookingData.members) ? bookingData.members.join(", ") : bookingData.members}</p>
                    </div>

                    <!-- Terms & Conditions Footer -->
                    <div style="position: absolute; top: 290px; left: 610px; width: 190px; font-size: 6px; line-height: 1.4; color: #ffffff;">
                        <p style="margin: 0 0 3px 0; font-weight: bold; color: #ffffff;">Terms & Conditions:</p>
                        <ul style="margin: 0; padding-left: 15px; color: #ffffff;">
                            <li style="color: #ffffff;">Tickets are non-refundable.</li>
                            <li style="color: #ffffff;">Valid ID required at venue.</li>
                            <li style="color: #ffffff;">Management reserves the right of admission.</li>
                        </ul>
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

module.exports = { generateTicketPDF };
