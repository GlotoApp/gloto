const path = require('path');
require('dotenv').config({ path: path.join(process.pkg ? path.dirname(process.execPath) : __dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const escpos = require('escpos');
const Network = require('escpos-network');
escpos.Network = Network;

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BUSINESS_ID = process.env.BUSINESS_ID || null;
const STORE_TOKEN = process.env.PRINT_STORE_TOKEN;
const DEVICE_UUID = process.env.PRINTER_DEVICE_UUID;
const PRINTER_TIMEOUT_MS = Number(process.env.PRINTER_TIMEOUT_MS || 5000);

if (!SUPABASE_URL || !ANON_KEY || !BUSINESS_ID || !STORE_TOKEN || !DEVICE_UUID) {
  console.error('Falta la configuración local del agente. Ejecuta nuevamente gloto-print-setup.exe.');
  process.exit(1);
}

const storeHeaders = { 'x-gloto-store-token': STORE_TOKEN };
const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: storeHeaders },
  realtime: { params: { eventsPerSecond: 10 }, headers: storeHeaders },
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const money = (value) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(value || 0));

async function printReceipt(ip, port, order, items) {
  const device = new escpos.Network(ip, port, PRINTER_TIMEOUT_MS);
  const printer = new escpos.Printer(device);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`La impresora ${ip}:${port} no respondió`)), PRINTER_TIMEOUT_MS);
    device.open(async (error) => {
      if (error) { clearTimeout(timer); reject(error); return; }
      try {
        printer
          .font('a').align('ct').style('b').size(1, 1)
          .text('PEDIDO').size(0, 0).style('normal')
          .text(`#${order.order_number || order.id}`)
          .text('--------------------------------')
          .align('lt')
          .text(`Cliente: ${order.customer_name || 'Consumidor final'}`)
          .text(`Fecha: ${new Date(order.created_at || Date.now()).toLocaleString('es-CO')}`);

        if (order.mesa) printer.text(`Mesa: ${order.mesa}`);
        if (order.delivery_address) printer.text(`Direccion: ${order.delivery_address}`);
        printer.text('--------------------------------');

        for (const item of items) {
          printer.style('b').text(`${Number(item.quantity)} x ${item.product_name || 'Producto'}`).style('normal');
          if (item.options?.length) printer.text(`  Opciones: ${(item.options || []).map(o => o.name || o.nombre || o).join(', ')}`);
          if (item.notes) printer.text(`  Nota: ${item.notes}`);
          printer.text(`${money(Number(item.unit_price || 0) * Number(item.quantity || 0))}`);
        }

        printer.text('--------------------------------')
          .align('rt')
          .style('b').text(`TOTAL: ${money(order.total)}`).style('normal')
          .align('lt').text(`Pago: ${order.payment_method || 'Por definir'}`)
          .feed(2).cut().close(() => { clearTimeout(timer); resolve(); });
      } catch (caught) {
        clearTimeout(timer); reject(caught);
      }
    });
  });
}

async function enqueueOrder(orderId) {
  const { data: order, error: orderError } = await supabase
    .from('orders').select('*').eq('id', orderId).maybeSingle();
  if (orderError || !order) throw orderError || new Error(`Pedido ${orderId} no encontrado`);
  if (BUSINESS_ID && order.business_id !== BUSINESS_ID) return;

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('id,product_id,category_id,quantity,unit_price,product_name,options,notes')
    .eq('order_id', orderId);
  if (itemsError) throw itemsError;

  const categoryIds = [...new Set((items || []).map(i => i.category_id).filter(Boolean))];
  let categories = [];
  if (categoryIds.length) {
    const { data, error } = await supabase
      .from('categories_shop')
      .select('id,printer_id,printer:network_printers(id,name,ip_address,port,is_active)')
      .in('id', categoryIds);
    if (error) throw error;
    categories = data || [];
  }

  const byPrinter = new Map();
  for (const item of items || []) {
    const category = categories.find(c => String(c.id) === String(item.category_id));
    const printer = category?.printer;
    if (!printer?.is_active || !printer.ip_address) continue;
    const key = `${printer.ip_address}:${printer.port || 9100}`;
    if (!byPrinter.has(key)) byPrinter.set(key, { printer_ip: printer.ip_address, printer_port: printer.port || 9100, category_ids: [], items: [] });
    const group = byPrinter.get(key);
    group.category_ids.push(String(item.category_id));
    group.items.push(item);
  }

  for (const group of byPrinter.values()) {
    const { error } = await supabase.from('print_jobs').upsert({
      business_id: order.business_id,
      order_id: order.id,
      printer_ip: group.printer_ip,
      printer_port: group.printer_port,
      category_ids: [...new Set(group.category_ids)],
      payload: { order, items: group.items },
      status: 'queued', attempts: 0, last_error: null,
    }, { onConflict: 'order_id,printer_ip,printer_port', ignoreDuplicates: true });
    if (error) throw error;
  }
  console.log(`Pedido ${order.order_number || order.id}: ${byPrinter.size} trabajo(s) creado(s)`);
}

async function processNextJob() {
  const { data: jobs, error } = await supabase
    .from('print_jobs').select('*')
    .in('status', ['queued', 'failed']).lt('attempts', 4)
    .or('attempts.eq.0,status.neq.failed')
    .order('created_at', { ascending: true }).limit(1);
  if (error) throw error;
  if (!jobs?.length) return false;

  const job = jobs[0];
  if (job.status === 'failed') job.status = 'queued';
  const { error: claimError } = await supabase.from('print_jobs').update({
    status: 'printing', attempts: job.attempts + 1, updated_at: new Date().toISOString(),
  }).eq('id', job.id).in('status', [job.status, 'queued']);
  if (claimError) throw claimError;

  try {
    await printReceipt(job.printer_ip, job.printer_port, job.payload.order, job.payload.items);
    await supabase.from('print_jobs').update({ status: 'printed', printed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', job.id);
    console.log(`Impresión enviada: pedido ${job.payload.order.order_number || job.order_id}, IP ${job.printer_ip}`);
  } catch (caught) {
    await supabase.from('print_jobs').update({ status: 'failed', last_error: caught.message, updated_at: new Date().toISOString() }).eq('id', job.id);
    console.error(`Fallo en ${job.printer_ip}:`, caught.message);
  }
  return true;
}

async function recoverStuckJobs() {
  await supabase.from('print_jobs').update({ status: 'queued', updated_at: new Date().toISOString() })
    .eq('status', 'printing').lt('updated_at', new Date(Date.now() - 2 * 60 * 1000).toISOString());
}

async function syncRecentOrders() {
  const { data: orders, error } = await supabase.from('orders').select('id')
    .eq('business_id', BUSINESS_ID)
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false }).limit(25);
  if (error) throw error;
  for (const order of orders || []) await enqueueOrder(order.id);
}

async function main() {
  console.log('Agente de impresión Gloto iniciado');
  await supabase.from('printing_agents').upsert({
    business_id: BUSINESS_ID,
    device_uuid: DEVICE_UUID,
    name: 'PC impresión Gloto',
    status: 'online',
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'business_id,device_uuid' });
  supabase.channel('gloto-print-orders')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async ({ new: order }) => {
      try { await enqueueOrder(order.id); } catch (error) { console.error('Error creando trabajo:', error.message); }
    })
    .subscribe((status) => console.log('Realtime:', status));

  setInterval(async () => {
    try { await recoverStuckJobs(); await syncRecentOrders(); while (await processNextJob()) await sleep(100); }
    catch (error) { console.error('Ciclo de impresión:', error.message); }
  }, 2000);

  process.on('SIGINT', async () => { console.log('Deteniendo agente...'); process.exit(0); });
}

main().catch(error => { console.error(error); process.exit(1); });
