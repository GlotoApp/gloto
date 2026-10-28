const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { randomUUID } = require('crypto');

function readEnv(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

const projectEnv = readEnv(path.resolve(__dirname, '..', '.env'));
const localEnv = readEnv(path.join(__dirname, '.env'));
const url = process.env.SUPABASE_URL || localEnv.SUPABASE_URL || projectEnv.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || localEnv.SUPABASE_ANON_KEY || projectEnv.VITE_SUPABASE_ANON_KEY;
const businessId = process.env.BUSINESS_ID || localEnv.BUSINESS_ID || '';
const storeToken = process.env.PRINT_STORE_TOKEN || localEnv.PRINT_STORE_TOKEN || '';

if (!url || !/^https:\/\/[^\s]+$/.test(url)) {
  console.error('Falta una URL pública de Supabase válida en .env.');
  process.exit(1);
}
if (!anonKey) {
  console.error('Falta la clave pública VITE_SUPABASE_ANON_KEY. No se necesita ninguna clave administrativa.');
  process.exit(1);
}
if (!businessId || !storeToken) {
  console.error('Faltan BUSINESS_ID y PRINT_STORE_TOKEN. Obtén ambos desde la configuración de impresión de la tienda.');
  process.exit(1);
}

const output = path.join(__dirname, 'gloto-config.json');
fs.writeFileSync(output, JSON.stringify({
  supabaseUrl: url.replace(/\/$/, ''),
  anonKey,
  businessId,
  storeToken,
  deviceUuid: randomUUID(),
}, null, 2), { encoding: 'utf8', mode: 0o600 });

const dist = path.join(__dirname, 'dist');
fs.mkdirSync(dist, { recursive: true });
const zip = path.resolve(__dirname, '..', 'public', 'descargas-impresion', 'Gloto-Agente-Impresion.zip');
try { fs.unlinkSync(zip); } catch {}

const files = [path.join(dist, 'gloto-print-agent.exe'), path.join(dist, 'gloto-print-setup.exe'), output];
for (const file of files) if (!fs.existsSync(file)) throw new Error(`Falta el ejecutable o configuración: ${file}`);

execFileSync('powershell.exe', ['-NoProfile', '-Command',
  `$ErrorActionPreference='Stop'; $folder=Join-Path (Split-Path '${zip}') 'Gloto-Impresion'; Remove-Item $folder -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory $folder | Out-Null; Copy-Item '${files[0]}','${files[1]}','${files[2]}' -Destination $folder; Compress-Archive -LiteralPath $folder -DestinationPath '${zip}' -Force; Remove-Item $folder -Recurse -Force`
], { stdio: 'inherit' });

console.log('Paquete seguro creado en public/descargas-impresion/Gloto-Agente-Impresion.zip');
console.log('Elimina gloto-config.json y el .env privado del agente después de distribuir el ZIP.');
