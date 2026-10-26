# UMCP local: diseño

## Objetivo y autorización

Construir en Shisetsu-Code/UMCP un servidor MCP local para navegar juegos web, detectar su interfaz, inspeccionar HTTP y WebSocket y exportar capturas/HAR con el detalle elegido por el LLM. El usuario solicitó implementación y ejecución real en GitHub Actions antes de aprobarlo. Las decisiones técnicas siguientes son del implementador y están dentro de ese alcance.

## Alternativas y decisión

1. Solo capturas y coordenadas: cubre canvas pero exige más interpretación visual y no expone estructura.
2. Solo DOM/árbol accesible: rápido, pero no describe botones internos de canvas/WebGL.
3. **Híbrido elegido:** Chromium/Playwright, DOM y escenas accesibles, captura visual opcional, coordenadas con transformaciones explícitas, red independiente del renderizado.

Node >=22, JavaScript ESM, SDK MCP oficial por stdio, Playwright y sharp. Se usa el repositorio vacío en un checkout aislado. No hace falta desplegar Cloudflare todavía; separar servicio de navegador, transporte MCP y modelos de red permite trasladar el controlador más adelante.

## Componentes y contratos

- `src/network.js`: captura HTTP de todo el contexto y WS por página; memoria acotada, payloads y truncamiento explícito, tiempos, endpoint/familia, filtros comunes y HAR 1.2 con extensiones WS. Exportación saneada por defecto; modo crudo solo explícito.
- `src/ui.js`: detección DOM/iframes/shadow DOM, instrumentación de listeners, escenas de motores accesibles y canvas. Toda coordenada usa píxeles CSS del viewport principal. No afirma detectar botones que no puede inspeccionar. Estabilidad a pedido, tres muestras separadas por 2 s por defecto; no existe bucle autónomo de acciones.
- `src/images.js`: PNG/JPEG/WebP, calidad, tamaño, recorte, overlays, metadatos de transformación para convertir imagen a viewport.
- `src/browser.js`: contextos aislados por sesión, lista de páginas/popups, navegación y acciones, IDs de observación, rechazo de referencias caducadas, marcas temporales y correlación con red.
- `src/server.js`, `src/index.js`: herramientas MCP y CLI local; stdout reservado al protocolo; recursos para descargas locales, configuración y cierre limpio.

## Funciones necesarias

Abrir/cerrar sesiones, listar/seleccionar páginas, navegar/atrás/adelante/recargar, observar controles y pantalla, click/doble click/hover/drag/scroll/teclas/texto por coordenadas o control detectado. El LLM decide cuándo observar y actuar. Marcar controles manuales es útil para superficies opacas y debe indicar origen manual y viewport asociado.

Capturar métodos, URLs, headers, cuerpos, status/errores, HTTP, timing y bytes; eventos y frames WS enviados/recibidos (texto/binario), aperturas/cierres. Resumen de endpoints y esquema de payload, sin deducir semántica de compra a partir del nombre solamente. Listados paginados y detalle por ID.

HAR completo, solo actividad, metadatos o WS; filtros por URL, dominio, método, status, recurso y tiempo; cuerpos y saneamiento configurables. Un HAR cargado sin frames WS no demuestra ausencia de WS. Ninguna exportación se llama completa si se descartaron entradas/cuerpos: incluir límites y pérdidas en metadatos.

## Verificación y aceptación

Pruebas reproducibles locales de HTTP JSON/formulario/XML, errores/redirecciones, WS de texto/binario, filtros y saneamiento, iframe/canvas, clicks, observaciones obsoletas y escalado de capturas. Prueba MCP real por stdio (initialize/list/call). GitHub Actions instala Chromium y ejecuta los mismos tests más smoke de demos públicas seleccionadas a partir de los HAR. Guardar evidencia y distinguir fallos del servicio, bloqueo externo y funcionalidades no verificadas.

Los HAR originales permanecen fuera del repositorio. Los informes incorporan solo estadísticas, rutas saneadas y esquemas. No se introducen apuestas con dinero real ni reenvío de sesiones extraídas. No se garantiza inspección semántica de todos los motores cerrados: la ruta visual debe funcionar y reportar esa limitación.
