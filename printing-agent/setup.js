const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const exeDirectory = process.pkg ? path.dirname(process.execPath) : __dirname;
const configPath = path.join(exeDirectory, 'gloto-config.json');

function keepWindowOpen(message, exitCode = 1) {
  console.error(`\n${message}`);
  console.error('Esta ventana se cerrará automáticamente en 20 segundos.');
  setTimeout(() => process.exit(exitCode), 20000);
}

function writeStartupShortcut(agentExe, installDir) {
  const startup = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  fs.mkdirSync(startup, { recursive: true });
  const vbs = path.join(startup, 'Gloto Agente Impresion.vbs');
  fs.writeFileSync(vbs, [
    'Set shell = CreateObject("WScript.Shell")',
    `shell.CurrentDirectory = "${installDir.replace(/"/g, '""')}"`,
    `shell.Run Chr(34) & "${agentExe.replace(/"/g, '""')}" & Chr(34), 0, False`,
  ].join('\n'), 'utf8');
}

(() => {
  console.log('=== Configurando agente de impresion Gloto ===\n');
  const installDir = exeDirectory;
  const agentExe = path.join(installDir, 'gloto-print-agent.exe');
  fs.mkdirSync(installDir, { recursive: true });

  let config = null;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    keepWindowOpen('No se encontró la configuración preparada de esta tienda. Pide al administrador de Gloto un instalador listo para esta tienda.');
    return;
  }

  const url = String(config.supabaseUrl || '').replace(/\/$/, '');
  const anonKey = String(config.anonKey || '').trim();
  const businessId = String(config.businessId || '').trim();
  const storeToken = String(config.storeToken || '').trim();
  const configuredDeviceUuid = String(config.deviceUuid || '').trim();
  if (!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(url) || !anonKey || !businessId || !storeToken) {
    keepWindowOpen('La configuración preparada está incompleta. Solicita una copia nueva al administrador.');
    return;
  }

  const deviceUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(configuredDeviceUuid)
    ? configuredDeviceUuid
    : randomUUID();

  fs.writeFileSync(path.join(installDir, '.env'),
    `SUPABASE_URL=${url}\nSUPABASE_ANON_KEY=${anonKey}\nBUSINESS_ID=${businessId}\nPRINT_STORE_TOKEN=${storeToken}\nPRINTER_DEVICE_UUID=${deviceUuid}\nPRINTER_TIMEOUT_MS=5000\n`,
    { encoding: 'utf8', mode: 0o600 });

  writeStartupShortcut(agentExe, installDir);
  console.log('Configuración completada.');
  console.log('El agente se iniciará automáticamente en Windows.');

  if (!fs.existsSync(agentExe)) {
    keepWindowOpen(`No se encontró ${agentExe}. Mantén los archivos juntos en la misma carpeta.`);
    return;
  }
  spawn(agentExe, [], { cwd: installDir, detached: true, windowsHide: true, stdio: 'ignore' }).unref();
  console.log('Instalación finalizada. Esta ventana se cerrará automáticamente en 20 segundos.');
  setTimeout(() => process.exit(0), 20000);
})();
