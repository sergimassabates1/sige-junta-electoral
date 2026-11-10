import QRCode from 'qrcode';
await QRCode.toFile('../qr.png', 'https://sergimassabates1.github.io/sige-junta-electoral/', { width: 1600, margin: 4, errorCorrectionLevel: 'H' });
