require('dotenv').config();
const escpos = require('escpos');
const Network = require('escpos-network');
escpos.Network = Network;

const ip = process.argv[2];
const port = Number(process.argv[3] || 9100);
if (!ip) {
  console.error('Uso: npm run test-print -- 192.168.1.50 9100');
  process.exit(1);
}

const device = new escpos.Network(ip, port, 5000);
const printer = new escpos.Printer(device);
device.open((error) => {
  if (error) { console.error('No se pudo conectar:', error.message); process.exit(1); }
  printer.align('ct').style('b').size(1, 1).text('PRUEBA GLOTO').size(0, 0).style('normal')
    .text('Impresora conectada correctamente')
    .feed(2).cut().close(() => { console.log(`Prueba enviada a ${ip}:${port}`); });
});
