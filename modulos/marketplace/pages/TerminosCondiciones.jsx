import { CalendarDays, Info } from "lucide-react";

const TerminosCondiciones = () => (
  <article className="space-y-6 text-sm leading-6 text-neutral-300">
    <header>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">Información legal</p>
      <h1 className="mt-2 text-xl font-black text-white">Términos y condiciones de uso</h1>
      <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
        <CalendarDays size={14} /> Última actualización: 28 de octubre de 2026
      </div>
    </header>

    <div className="rounded-2xl border border-violet-400/15 bg-violet-500/[0.06] p-4 text-neutral-300">
      <div className="flex gap-3">
        <Info size={18} className="mt-0.5 shrink-0 text-violet-300" />
        <p>Gloto es un marketplace que conecta a clientes con negocios locales para consultar productos, realizar pedidos y hacer seguimiento a su entrega.</p>
      </div>
    </div>

    <section className="space-y-2">
      <h2 className="font-black text-white">1. Uso de la plataforma</h2>
      <p>Al utilizar Gloto, puedes explorar negocios cercanos, consultar sus productos y precios, seleccionar un método de entrega o recogida y enviar pedidos. Debes proporcionar datos reales, mantener la confidencialidad de tus accesos y hacer un uso lícito de la plataforma.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">2. Negocios registrados</h2>
      <p>Cada negocio es responsable de la información publicada, incluyendo nombre, dirección, contacto, productos, precios, inventario, disponibilidad, tiempos, promociones y políticas propias. Las fotos y descripciones deben corresponder al establecimiento y sus ofrecimientos.</p>
      <p>Gloto puede mostrar el negocio según su categoría principal, categorías secundarias, ubicación y disponibilidad.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">3. Pedidos</h2>
      <p>Un pedido se crea con los productos seleccionados, los datos indicados por el cliente y el método de atención elegido. La tienda puede confirmar o rechazar el pedido según disponibilidad, cobertura y condiciones operativas.</p>
      <p>El cliente debe revisar productos, cantidades, dirección o punto de recogida, total, costos de domicilio y datos de contacto antes de confirmarlo.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">4. Entrega, recogida y atención</h2>
      <p>Según las opciones configuradas por cada negocio, el pedido puede entregarse a domicilio, recogerse en el establecimiento, recogerse en un punto acordado o gestionarse para atención en mesa.</p>
      <p>Los tiempos estimados y costos de domicilio son informados por el negocio. Retrasos, cambios de dirección, instrucciones incompletas o ausencia del cliente pueden afectar la entrega.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">5. Pagos</h2>
      <p>Los métodos disponibles, fechas y reglas de pago dependen de cada negocio. El estado mostrado en Gloto es informativo y puede actualizarse conforme avance el pedido. El usuario deberá conservar comprobantes válidos cuando corresponda.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">6. Seguimiento y comunicaciones</h2>
      <p>Gloto puede mostrar estados y permitir contactar al negocio mediante los canales configurados. Las conversaciones por WhatsApp u otros medios externos no quedan administradas por esta plataforma salvo que se registre expresamente una gestión dentro del sistema.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">7. Información, contenido y conductas prohibidas</h2>
      <p>Está prohibido falsear pedidos o identidades, publicar contenido ilegal, engañoso, discriminatorio, difamatorio o que viole derechos de terceros, interferir con el funcionamiento de Gloto o intentar acceder sin autorización a cuentas y datos.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">8. Disponibilidad y responsabilidad</h2>
      <p>Gloto procura mantener el servicio disponible, pero puede presentar interrupciones por mantenimiento, fallas técnicas, conectividad o condiciones ajenas. La plataforma actúa como intermediario tecnológico y no fabrica ni controla directamente los productos vendidos por los negocios.</p>
      <p>Cualquier reclamo sobre calidad, pedido, pago, entrega o atención debe dirigirse primero al negocio, pudiendo solicitar apoyo adicional a Gloto cuando corresponda.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">9. Suspensión y cambios</h2>
      <p>Gloto puede limitar o cancelar cuentas y publicaciones que incumplan estas condiciones, representen riesgo o afecten a otros usuarios. Estos términos pueden actualizarse para reflejar cambios del servicio; el uso posterior implica aceptar la versión vigente.</p>
    </section>
  </article>
);

export default TerminosCondiciones;
