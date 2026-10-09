# Guía de diseño del POS

Este documento define las reglas visuales compartidas para los archivos y pantallas de `modulos/pos`. Se aplicará progresivamente, archivo por archivo, para mantener una experiencia coherente en todo el POS.

Las secciones generales son el estándar común. La sección **Diseño de la pantalla de Órdenes** documenta una aplicación concreta de ese estándar y sirve como referencia para otras pantallas; no significa que todas deban copiar su estructura.

## Regla principal: diseño sin regresiones

La prioridad es mejorar la presentación sin alterar nada que ya funcione. En las tareas de diseño, los cambios deben ser visuales: no cambiar consultas, datos, cálculos, permisos, rutas, estados, filtros, validaciones ni acciones.

### Trabajo progresivo archivo por archivo

Al aplicar estas reglas a un archivo de POS:

1. Trabajar únicamente en el archivo solicitado y en los estilos estrictamente necesarios para esa pantalla.
2. Revisar el código y observar los estados, acciones, navegación y datos existentes antes de editar.
3. Aplicar el lenguaje visual común sin imponer a esa pantalla una estructura que no corresponde a su función.
4. Conservar todos los elementos y comportamientos existentes; si hay que cambiar funcionalidad, no incluirlo como parte del rediseño.
5. Comprobar errores y ejecutar la validación más pequeña pertinente al cambio.
6. Mantener este documento como referencia; si una regla general cambia, actualizarla aquí para que los siguientes archivos sigan el mismo criterio.

No hacer un rediseño masivo de todo `modulos/pos` en una sola pasada cuando la solicitud sea trabajar archivo por archivo.

## Alcance y aplicación

- **Archivos de `modulos/pos`:** usar el tema, tipografía, contraste, espaciado, bordes, estados de interacción y accesibilidad definidos en esta guía.
- **Cada pantalla:** adaptar la jerarquía y la composición a su tarea. Las reglas compartidas no obligan a que Productos, Cocina, Órdenes, Configuración u otras pantallas tengan la misma estructura.
- **Órdenes:** la sección específica más adelante registra los criterios visuales actuales de esta pantalla.
- **Factura, impresión y PDF:** son superficies documentales con requisitos propios de legibilidad e impresión. No trasladar automáticamente a ellas los fondos oscuros, tamaños ni estilos de tarjetas de la interfaz POS.
- **Dependencias compartidas:** si el archivo solicitado depende de un componente o estilo compartido, evitar cambios colaterales a otras pantallas. Revisar el alcance de cualquier estilo global antes de modificarlo.

## Identidad visual compartida

### Tema base y superficies

Las pantallas POS pertenecen al tema oscuro de Gloto:

| Uso | Referencia |
| --- | --- |
| Fondo general | `--background`, `#0a0a0a` |
| Superficie de panel | `--surface`, `#131313` |
| Superficie elevada | `--surface-bright`, `#222222` |
| Superficie en hover | `--surface-hover`, `#2a2a2a` |
| Texto principal | `--on-surface`, `#ffffff` |
| Borde o división | `--outline`, `#3a3a3ab2`; también se usan bordes blancos de baja opacidad |
| Acento de marca | Violeta, principalmente `#7c3aed` y variantes Tailwind `violet-*` |

Preferir las variables y utilidades de tema existentes en vez de inventar colores por pantalla. Usar los colores semánticamente y con moderación: el violeta indica foco, selección o acción principal; no debe competir con el contenido.

### Uso moderado de bordes

- Evitar el exceso de bordes y los contornos anidados. No poner un borde a cada tarjeta, control, etiqueta y elemento interior cuando el espaciado o el contraste de superficies ya establecen la jerarquía.
- Reservar los bordes para separar superficies que realmente lo necesiten o delimitar controles cuando mejore su comprensión.
- Preferir espacio, cambios sutiles de fondo y tipografía para agrupar o diferenciar elementos.
- Mantener estados de foco accesibles y visibles aunque el control no tenga un borde permanente.

### Colores de estado

- **Éxito / listo / importes:** verde (`emerald`).
- **Pendiente o advertencia:** ámbar (`amber`).
- **Error o eliminación:** rojo (`red`).
- **Información y acciones secundarias:** azul o cian (`sky` / `cyan`).
- **Contenido neutral:** escala `neutral`.
- **Método de entrega:** conservar un color distinguible por método. La pantalla actual usa verde para mesa, ámbar para recoger, fucsia para domicilio y azul para punto.

Los colores semánticos identifican estados o tipos de contenido; no deben confundirse entre sí. Mantener texto legible y no comunicar información solo mediante color. Cuando una pantalla tenga estados propios, conservar sus significados funcionales actuales.

## Tipografía y jerarquía

- **Encabezados:** Manrope, de acuerdo con la identidad definida en `index.html` y `src/index.css`. Usar peso semibold o bold; reservar black para títulos o énfasis puntual.
- **Contenido y controles:** Inter, fuente base global de la aplicación.
- **Números de orden, horas y campos técnicos:** se puede usar una fuente monoespaciada cuando facilite comparar o identificar valores.
- Mantener una jerarquía clara: título de pantalla > cliente y total > datos de la orden > etiquetas y metadatos.
- Evitar que etiquetas, metadatos o placeholders sean tan pequeños o tenues que no se puedan leer. Las etiquetas pueden ser compactas, pero deben conservar contraste suficiente.
- Usar mayúsculas y tracking amplio para etiquetas cortas; no convertir bloques de texto, nombres o mensajes completos a mayúsculas sin una razón funcional.
- Dar énfasis tipográfico a importes y números relevantes sin hacer que toda la información tenga el mismo peso visual.

## Composición y jerarquía por pantalla

- Comenzar por la tarea principal de la pantalla: hacer que el contenido y la acción más importante sean lo primero que se entiendan.
- Mantener una jerarquía visual consistente: título de pantalla > contenido principal > información secundaria > etiquetas y metadatos.
- Agrupar controles relacionados en la misma sección; separar secciones distintas con espaciado y superficies sutiles, sin crear huecos innecesarios.
- Usar encabezados claros y consistentes, pero adaptar su composición a la pantalla. No copiar el buscador o los filtros de Órdenes donde no correspondan.
- No agregar descripciones, subtítulos explicativos ni frases de apoyo debajo del título de una pantalla POS, a menos que el usuario los solicite explícitamente.
- Mantener alineación, espaciado, altura de controles y radios de borde consistentes entre pantallas POS.
- No añadir paneles, tarjetas o decoración que compitan con el flujo de trabajo o reduzcan el espacio útil.

### Campos de entrada y filtros

- Los `input`, `select` y controles de fecha relacionados dentro de una misma pantalla deben compartir tratamiento visual: superficie oscura, borde sutil, esquinas `rounded-xl`, altura y padding coherentes, texto claro y foco violeta visible.
- Para filtros compactos, usar como referencia el control de Órdenes: etiqueta pequeña en mayúsculas (`text-[8px]`, `font-black`, `tracking-widest`), control en `text-[10px]` monoespaciado y superficie `bg-neutral-900`.
- Mantener la función nativa de cada control. Los iconos pueden variar según el propósito, pero deben conservar tamaño, alineación y acento violeta consistentes.
- Los buscadores principales pueden tener mayor ancho y padding, pero deben mantener la misma familia tipográfica, superficie, borde sutil y tratamiento de foco que el buscador de Órdenes.
- No reducir contraste ni legibilidad para igualar visualmente controles de tamaños distintos.

## Encabezado de la pantalla de Órdenes

Como referencia concreta, el encabezado de Órdenes conserva esta composición y prioridad:

1. **Primera fila:** título “Órdenes” a la izquierda; a la derecha, hora de última actualización cuando esté disponible y botón de actualizar.
2. **Segunda fila:** búsqueda de órdenes a ancho completo, con icono y acción contextual para limpiar o pegar.
3. **Tercera sección:** filtros dentro de un panel diferenciado, con controles alineados y adaptables al ancho disponible.

Reglas visuales:

- Usar un contenedor centrado y con el mismo ancho máximo que el listado.
- El título debe ser el texto más destacado del encabezado; la hora de actualización es auxiliar.
- Los controles comparten fondo oscuro, esquinas redondeadas y un foco violeta visible; no necesitan un borde permanente si el contraste de superficie los delimita con claridad.
- Mantener espacio suficiente entre título, búsqueda y filtros para entender que son niveles distintos; evitar separaciones exageradas que alejen los filtros de la lista.
- En pantallas estrechas, permitir que los filtros se reorganicen y ocupen varias filas sin desbordarse ni ocultar controles.

## Superficies, tarjetas y agrupación

- Usar tarjetas oscuras diferenciadas del fondo por superficie; el hover aumenta ligeramente el contraste. Añadir bordes solo si hacen falta para separar contenido.
- Una orden expandida puede enfatizarse con una sombra violeta tenue o un cambio de superficie, sin exigir un borde adicional. La selección no debe parecer un error ni un estado de preparación.
- Las órdenes se mantienen agrupadas por año y mes. El encabezado del grupo debe distinguir el período y mostrar la cantidad de órdenes con jerarquía secundaria.
- Los detalles expandidos se organizan por bloques: datos principales, cliente y entrega, productos, observaciones y acciones.
- Mantener espaciados compactos y consistentes: agrupar información relacionada, separar secciones y evitar huecos grandes dentro de una misma tarjeta.
- Redondeados de referencia: `rounded-lg` para elementos internos, `rounded-xl` para controles y encabezados de grupo, `rounded-2xl` para tarjetas o paneles principales.

## Contenido de una tarjeta de orden

- Priorizar cliente, número de orden y total.
- Mostrar método de entrega como badge con texto y color semántico consistente.
- En escritorio, conservar una lectura por columnas: cliente/orden, entrega, hora, total y estado.
- En móvil, priorizar cliente y total en la primera fila, y método de entrega y expansión en la segunda. No depender de información que solo aparezca en escritorio.
- Al expandir, mostrar detalles sin reemplazar ni alterar los datos: factura, hora, pago, entrega, cliente, teléfono, productos, notas, propina y totales cuando correspondan.
- Formatear los importes de forma consistente como moneda COP, y respetar las etiquetas y valores existentes (por ejemplo, distinguir total sin propina de total con propina).
- Mantener texto largo controlado: truncar o permitir salto de línea según el dato, sin provocar desbordamiento horizontal.

## Botones y acciones

- Acciones dentro de una orden deben tener icono y etiqueta visible; mantener objetivos táctiles adecuados, especialmente en móvil.
- Diferenciar acciones por intención: eliminar en rojo, imprimir/acción principal en violeta, editar o mapa en azul, compartir en cian/verde y acciones neutrales en gris.
- El hover puede reforzar el color de la acción, pero debe seguir siendo legible en reposo.
- No mover, quitar, renombrar ni cambiar el efecto de acciones como editar, imprimir, factura, PDF, compartir, seguimiento, mapa o eliminar en una tarea exclusivamente visual.
- Mantener confirmaciones y estados de carga/error de las acciones destructivas; su presentación puede alinearse al tema sin debilitar la confirmación.

## Estados de pantalla

La lista debe conservar una presentación clara para cada estado funcional ya existente:

- **Cargando:** indicador de carga dentro del área de contenido.
- **Error:** panel de advertencia con explicación y acción para reintentar.
- **Sin resultados:** mensaje que distinga entre lista vacía y búsqueda/filtros sin coincidencias.
- **Lista con resultados:** grupos por fecha y tarjetas desplegables.
- **Cargando más / fin de lista:** conservar su indicador y el control de paginación correspondiente.

Estos estados son parte del comportamiento y no deben suprimirse para lograr una apariencia uniforme.

## Adaptabilidad y accesibilidad

- Diseñar primero para que la tarjeta sea legible en móvil y conservar la distribución informativa en escritorio.
- Evitar scroll horizontal, controles recortados y textos esenciales ocultos.
- Mantener contraste perceptible entre texto, superficie y borde.
- Los botones interactivos deben tener estados hover, focus y disabled discernibles; no depender exclusivamente del hover.
- Conservar etiquetas accesibles, roles, títulos y nombres de botones que ya existan.
- Respetar las preferencias de movimiento cuando se ajusten animaciones; las transiciones deben ser breves y no impedir interacción.

## Factura y formatos de salida

La factura es un documento distinto de la interfaz de administración:

- Priorizar impresión nítida, contraste alto, texto legible y separación compacta.
- Mantener una jerarquía propia para negocio, cliente, productos, totales y pago.
- No usar fondos oscuros de la aplicación como requisito para el papel.
- No modificar cálculos, etiquetas de totales, propinas, domicilio, datos fiscales ni el flujo de imprimir/descargar/compartir al aplicar esta guía de pantalla.
- Revisar por separado el resultado de impresión y PDF cuando se cambien estilos de factura.

## Lista de verificación para cambios futuros

- [ ] El cambio es visual y no modifica reglas de negocio, persistencia, permisos, navegación ni acciones.
- [ ] Se conservaron todos los datos, estados y controles disponibles antes del cambio.
- [ ] El encabezado mantiene título, actualización, búsqueda y filtros en ese orden de prioridad.
- [ ] La paleta oscura y los colores semánticos se usan de forma consistente.
- [ ] La tipografía y el contraste mantienen legibilidad en móvil y escritorio.
- [ ] Cliente, número, método de entrega y total siguen siendo fáciles de localizar.
- [ ] Carga, error, vacío, expansión y paginación siguen funcionando y tienen representación visual.
- [ ] La factura impresa se trató como una superficie separada de la pantalla.
- [ ] Se revisaron los errores del editor y las pruebas pertinentes al archivo modificado.
