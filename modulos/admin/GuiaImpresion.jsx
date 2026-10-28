import { Download, Printer, Server, Wifi } from "lucide-react";

const downloads = [
  { step: "3", title: "Instalador preparado para la tienda", description: "Descárgalo desde Administración → Tiendas → seleccionar tienda → Descargar impresión. El ZIP ya contiene la configuración de esa tienda.", file: null, name: "Ir a Tiendas" },
  { step: "5", title: "Manual completo", description: "Guía detallada para instalar, registrar, probar y operar las impresoras.", file: "/descargas-impresion/INSTRUCCIONES_IMPRESION.md", name: "Descargar manual" },
];

const steps = [
  { icon: Printer, title: "1. Instalar físicamente la impresora", text: "Conecta energía y un cable Ethernet desde el puerto de red de la impresora al router. Enciende la impresora y comprueba que sus luces de energía y red estén encendidas." },
  { icon: Wifi, title: "2. Obtener una IP fija", text: "Imprime la hoja de configuración usando los botones del equipo. Anota su IPv4, por ejemplo 192.168.1.50, y reserva esa IP en el router mediante su dirección MAC. Reinicia la impresora y verifica que conserve la misma IP." },
  { icon: Server, title: "3. Preparar la carpeta del agente", text: "Desde Administración → Tiendas, abre la tienda y pulsa Descargar impresión. Extrae el ZIP completo en C:\\Gloto\\Impresion\\. Dentro debe quedar la carpeta Gloto-Impresion-nombre-tienda y sus dos ejecutables más gloto-config.json." },
  { icon: Printer, title: "4. Instalar el agente en Windows", text: "Abre gloto-print-setup.exe desde esa carpeta, una sola vez. Espera el mensaje de instalación finalizada. El instalador creará .env, iniciará el agente y lo dejará configurado para arrancar con Windows." },
  { icon: Printer, title: "5. Registrar la impresora en el POS", text: "En POS → Configuración → Impresoras pulsa Nueva impresora. Escribe nombre, por ejemplo Cocina, la IP 192.168.1.50 y el puerto 9100. Guarda. Luego, en Productos → Categorías, asigna esa impresora a las categorías que correspondan." },
  { icon: Printer, title: "6. Probar el funcionamiento", text: "Crea una venta pequeña con un producto de una categoría asignada y completa el pedido. Confirma que salga el ticket en la impresora indicada y que el agente siga abierto o iniciado en segundo plano." },
  { icon: Server, title: "7. Operación diaria", text: "Al abrir: enciende router, impresoras y PC. Al cerrar: no apagues la PC antes de terminar. Si la impresión falla, reinicia el agente con gloto-print-agent.exe, verifica el mismo WiFi/router y consulta los trabajos queued, printing, printed o failed en Supabase." },
];

export default function GuiaImpresion() {
  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">Guía técnica</p>
          <h1 className="mt-2 text-3xl font-black">Instalación de impresoras</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">Siga los pasos en orden. Primero prepare la impresora físicamente, luego instale el agente en la PC, registre la impresora en el POS y haga una venta de prueba.</p>
        </div>

        <div className="mb-8 grid gap-3 md:grid-cols-2">
          {steps.map(({ icon: Icon, title, text }, index) => (
            <article key={title} className="rounded-2xl border border-white/10 bg-neutral-900/50 p-5">
              <div className="mb-3 flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/15 text-violet-300"><Icon size={16} /></span><span className="text-[10px] font-black text-neutral-500">PASO {index + 1}</span></div>
              <h2 className="font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-neutral-400">{text}</p>
            </article>
          ))}
        </div>

        <section className="rounded-2xl border border-white/10 bg-neutral-900/30 p-5">
          <h2 className="mb-4 text-lg font-black">Archivos para descargar</h2>
          <div className="space-y-3">
            {downloads.map((item) => (
              <div key={item.title} className="flex flex-wrap items-center gap-4 rounded-xl border border-white/5 bg-neutral-950/60 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 font-mono text-xs font-bold text-violet-300">{item.step}</span>
                <div className="min-w-[220px] flex-1"><h3 className="text-sm font-bold">{item.title}</h3><p className="mt-1 text-xs text-neutral-500">{item.description}</p></div>
                {item.file ? (
                  <a href={item.file} download className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-bold text-violet-300 hover:bg-violet-500/20"><Download size={15} />{item.name}</a>
                ) : (
                  <a href="/gestion/tiendas" className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-bold text-violet-300 hover:bg-violet-500/20">{item.name}</a>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
