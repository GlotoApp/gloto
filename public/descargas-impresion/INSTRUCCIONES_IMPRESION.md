# Sistema de impresión por categorías — guía para principiantes

Esta guía configura impresoras térmicas de red para que cada categoría imprima sus productos en una estación distinta.

## 1. Antes de empezar

Necesitarás:

- Una PC o portatil Windows que permanezca encendida durante el negocio.
- Impresoras térmicas Ethernet compatibles con comandos ESC/POS.
- Todas las impresoras, la PC y el router en la misma red local, por ejemplo `192.168.1.x`.
- No es necesario instalar Node.js en la tienda; viene incluido dentro del instalador de Gloto.

Nunca publiques ni compartas tu `service_role key` en la aplicación React, GitHub o archivos públicos.

## 2. Configuración técnica incluida

Las tablas, permisos y migraciones de Supabase ya fueron instalados por el equipo técnico. Esta guía no requiere ejecutar SQL ni abrir el SQL Editor durante una instalación normal. Si una nueva versión necesita una actualización de base de datos, el técnico realizará ese paso antes de entregar la guía al negocio.

## 3. Evitar que la impresora cambie de IP

Este paso no instala nada en la impresora ni en la PC: hace que el router recuerde siempre la dirección IP que recibió la impresora.

1. En la PC abre un navegador y escribe la dirección del router. Suele ser `192.168.1.1` o `192.168.0.1`.
2. Inicia sesión con los datos indicados en la etiqueta del router. Si no los conoce el responsable del negocio, consúltelos.
3. Busca una opción llamada **Reservas DHCP**, **Asignación de IP fija**, **Direcciones reservadas** o similar.
4. Busca el nombre o la dirección MAC de la impresora en la lista de equipos conectados. La dirección MAC aparece impresa en la hoja de configuración y se parece a `AA:BB:CC:DD:EE:FF`.
5. Crea una reserva y relaciona esa dirección MAC con la IP anotada en el paso anterior, por ejemplo `192.168.1.50`.
6. Guarda y reinicia la impresora. Comprueba de nuevo que conserva la misma IP.

Si el router no tiene reservas DHCP, configura manualmente la misma IP desde el panel web o el menú de la impresora. Usa una IP disponible fuera del rango automático del router y evita usarla para otro equipo. El puerto de impresión suele ser `9100`; úsalo únicamente si el manual de la impresora lo confirma.

## 4. Comprobar la impresora desde la PC

Abre PowerShell y prueba la dirección IP registrada:

```powershell
ping 192.168.1.50
Test-NetConnection 192.168.1.50 -Port 9100
```

`TcpTestSucceeded : True` indica que hay conectividad.

Si el modelo tiene configuración DHCP, se recomienda reservar esa IP en el router para que nunca cambie.

## 5. Registrar la impresora en Gloto

Esta parte es la única configuración de impresora que se realiza dentro de la aplicación. La dirección IP se registra una sola vez.

1. En Gloto abre **Configuración → Impresoras**.
2. Haz clic en **Nueva impresora**.
3. Escribe un nombre claro, por ejemplo `Cocina`, `Barra` o `Cafetería`.
4. Escribe exactamente la IP anotada de la impresora.
5. Deja el puerto en `9100` salvo que el manual del equipo indique otro.
6. Guarda la impresora.
7. Abre **Productos → Categorías**, edita cada categoría y selecciona la impresora correspondiente en la lista.
8. Una categoría puede no tener impresora; esas comandas no se imprimirán automáticamente.

Cada producto debe pertenecer a la categoría correspondiente. POS guardará esa relación automáticamente al crear el pedido.

## 6. Instalar el agente local

El instalador se descarga desde el perfil de cada tienda; no uses un archivo ZIP genérico.

1. Entra en **Administración → Tiendas**.
2. Abre la tienda que necesita imprimir.
3. Pulsa **Descargar impresión**.
4. Extrae el ZIP. Deja la carpeta `Gloto-Impresion-...` completa en una ubicación permanente, por ejemplo `C:\Gloto\Impresion`. No extraigas sus archivos sueltos fuera de la carpeta.
5. Haz doble clic una sola vez en `gloto-print-setup.exe`.
6. Espera el mensaje **Instalación finalizada. Ya puedes cerrar esta ventana.**
7. No escribas URL, claves, tokens ni contraseñas.

El ZIP ya incluye los ejecutables, la URL pública, la clave pública anon, el identificador de la tienda y el token de esa tienda. Mantén juntos el instalador, el agente, `gloto-config.json` y el archivo `.env`. No instales Node.js manualmente ni borres la carpeta.
## 7. Prueba completa

1. Mantén el agente ejecutándose.
2. Desde POS crea un pedido pequeño que contenga productos de una categoría configurada.
3. Confirma el pedido.
4. Observa la consola del agente.
5. Comprueba que la impresora corte y imprima una comanda.

La cola queda en `print_jobs`. También puedes abrirla desde Supabase para ver pedidos `queued`, `printing`, `printed` o `failed`. Los trabajos fallidos se reintentan hasta cuatro veces y muestran el último error en `last_error`.

## 8. Operación diaria

### Al abrir el negocio

1. Enciende router, impresoras y PC.
2. Verifica que las impresoras estén en línea.
3. Si el agente no inició automáticamente después de ejecutar el instalador, haz doble clic una vez en `gloto-print-agent.exe`.
4. Envía un pedido real de prueba desde POS.

### Durante el servicio

- No cierres la ventana del agente.
- Si aparece un corte eléctrico, reinicia la PC, abre el agente y verifica las IP.
- Si se cambia la IP, la configuración debe cambiarse en la categoría correspondiente.

### Al cerrar

1. Cierra la ventana del agente con `Ctrl+C` (si inició desde terminal).
2. Apaga la PC según el procedimiento habitual.
3. No borres pedidos ni trabajos de impresión como parte rutinaria.

## 9. Solución de problemas

### `ping` funciona pero no imprime

- Confirma puerto `9100` con `Test-NetConnection`.
- Consulta el puerto RAW/JOB en el manual; algunos equipos usan `9100`, `9101`, `4000` o `515`.
- Desactiva temporalmente firewall de terceros y verifica el perfil de Windows (`Red privada`).

### Realtime no detecta pedidos

El agente también revisa la cola periódicamente. Primero confirma el esquema, variables `.env`, acceso a internet y que Realtime esté habilitado para `orders`. No debes usar la clave pública `anon` en el agente.

### No hay trabajo en `print_jobs`

Revisa:

1. El pedido fue creado con productos que tienen `category_id`.
2. La categoría tiene IP configurada.
3. Aplicaste la migración SQL.
4. El campo IP coincide exactamente con la impresora.
5. El negocio coincide con `BUSINESS_ID`, si lo configuraste.

### La impresora imprime caracteres raros

Define en el modelo la página de códigos adecuada para español. Algunas impresoras necesitan `PC850`, `PC858` o UTF-8 según el fabricante. El agente utiliza texto plano y caracteres básicos para maximizar compatibilidad.

## 10. Ejecutar automáticamente al iniciar Windows

1. Pulsa `Windows + R`, escribe `shell:startup` y acepta.
2. Crea un acceso directo a `printing-agent/start-agent.bat` dentro de esa carpeta.
3. Reinicia Windows una vez para comprobar que se abre el agente.
4. Minimiza la ventana; no la cierres.

Para mayor seguridad y reinicio automático, instala el agente como servicio de Windows solo cuando el sistema haya sido probado manualmente, por ejemplo usando NSSM.
