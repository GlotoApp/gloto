import { CalendarDays, LockKeyhole } from "lucide-react";

const PoliticaPrivacidad = () => (
  <article className="space-y-6 text-sm leading-6 text-neutral-300">
    <header>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">Información legal</p>
      <h1 className="mt-2 text-xl font-black text-white">Política de privacidad</h1>
      <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
        <CalendarDays size={14} /> Última actualización: 28 de octubre de 2026
      </div>
    </header>

    <div className="rounded-2xl border border-sky-400/15 bg-sky-500/[0.06] p-4">
      <div className="flex gap-3">
        <LockKeyhole size={18} className="mt-0.5 shrink-0 text-sky-300" />
        <p>Esta política explica qué datos usa Gloto para mostrar negocios cercanos, gestionar pedidos y permitir que negocios, clientes y repartidores utilicen sus funciones.</p>
      </div>
    </div>

    <section className="space-y-2">
      <h2 className="font-black text-white">1. Datos que puedes proporcionar</h2>
      <p>Al explorar o realizar un pedido podemos solicitar o recibir datos como nombre, teléfono, dirección, punto de referencia, coordenadas de entrega, método de entrega, productos seleccionados, notas del pedido y datos necesarios para el seguimiento.</p>
      <p>Las personas que administran negocios también pueden proporcionar datos de acceso, información comercial, contacto, ubicación, horarios, productos, precios, inventario y configuración operativa.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">2. Datos técnicos</h2>
      <p>Gloto puede procesar identificadores del navegador o del dispositivo, preferencias de ubicación, registros técnicos, estado de la conexión y datos necesarios para identificar una sesión o recuperar información del carrito.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">3. Ubicación</h2>
      <p>Solo solicitamos ubicación cuando tú das permiso o cuando la eliges durante el pedido. Se utiliza para identificar una ciudad cercana, ordenar los negocios por distancia, calcular cobertura o mostrar una dirección sobre el mapa.</p>
      <p>La ciudad y las coordenadas pueden guardarse en este dispositivo para mejorar futuras búsquedas. Puedes cambiar o borrar esta información desde los controles del navegador o eliminando los datos guardados del sitio.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">4. Para qué usamos los datos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Mostrar y localizar negocios disponibles.</li>
        <li>Preparar, crear, confirmar y seguir pedidos.</li>
        <li>Calcular distancias, tiempos estimados y costos de domicilio configurados por el negocio.</li>
        <li>Permitir la comunicación entre cliente y tienda.</li>
        <li>Gestionar cuentas, roles, horarios, inventario y operación de las tiendas.</li>
        <li>Prevenir fraude, abusos y accesos no autorizados.</li>
        <li>Mejorar la estabilidad, seguridad y funcionamiento de la plataforma.</li>
      </ul>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">5. Compartición de información</h2>
      <p>Los datos necesarios para gestionar un pedido se ponen a disposición del negocio correspondiente. Por ejemplo, la tienda puede recibir tu nombre, teléfono, dirección o punto de entrega y el contenido del pedido.</p>
      <p>También podemos usar proveedores tecnológicos necesarios para operar el servicio, almacenar información, enviar comunicaciones o ofrecer infraestructura. Los proveedores reciben únicamente los datos necesarios para prestar su función.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">6. Datos guardados en el dispositivo</h2>
      <p>Gloto utiliza almacenamiento local del navegador para conservar preferencias de ubicación y el contenido del carrito mientras navegas por la plataforma. Puedes eliminar estos datos desde la configuración de tu navegador. Al hacerlo, la preferencia o el carrito podrá perderse.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">7. Conservación y seguridad</h2>
      <p>Los datos se conservan durante el tiempo necesario para prestar el servicio, cumplir obligaciones aplicables, resolver reclamos y mantener registros operativos. Aplicamos controles de acceso y medidas técnicas razonables, aunque ningún sistema puede garantizar seguridad absoluta.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">8. Tus opciones</h2>
      <p>Puedes decidir si compartir tu ubicación, revisar los datos que entregas al crear un pedido, modificar una selección antes de confirmarla y solicitar corrección o eliminación de datos personales cuando sea aplicable.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">9. Menores</h2>
      <p>Gloto está orientado al público que pueda usar sus funciones y realizar compras con la autorización que corresponda. No se solicita deliberadamente información personal de menores sin la supervisión de un adulto responsable.</p>
    </section>

    <section className="space-y-2">
      <h2 className="font-black text-white">10. Contacto y cambios</h2>
      <p>Para preguntas o solicitudes relacionadas con datos personales puedes solicitar apoyo por los canales disponibles en la plataforma. Esta política podrá actualizarse cuando cambien las funciones o tratamientos de información de Gloto.</p>
    </section>
  </article>
);

export default PoliticaPrivacidad;
