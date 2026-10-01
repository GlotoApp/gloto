# Mapa de Admin

Todos los JSX están directamente en esta carpeta. Las rutas principales se declaran en `gloto/src/App.jsx`; las pantallas se abren desde el menú lateral.

## Archivos principales

## Rutas

## Frases del Marketplace

Ejecuta `supabase/077_marketplace_frases.sql` en el SQL Editor de Supabase. Crea y siembra `public.frases`; `Mercado.jsx` permite administrarlas y Home muestra las activas por orden.

Para subir iconos PNG de categorías, ejecuta `supabase/080_files_category_icons.sql` en el SQL Editor de Supabase. `Mercado.jsx` guarda la ruta en `categories.icon_url` y el PNG (máximo 2 MB) en `system/sistema/categories generales iconos/`; Home lo muestra con una URL firmada. La carpeta aparece al subir el primer archivo.
