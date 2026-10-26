# UMCP — navegador y analizador de red para MCP

Servidor MCP **local**, por **stdio**, para que un LLM controle Chromium, detecte controles y analice HTTP/WebSocket. No requiere una API de IA: el modelo que conecta al MCP interpreta las imágenes y decide las acciones.

**Validación del 26/10/2026:** el núcleo pasó **59/59 pruebas** en [GitHub Actions](https://github.com/Shisetsu-Code/UMCP/actions/runs/40380024508). Un recorrido mediante el propio MCP permitió navegar controles y realizar un giro demo en **cinco juegos**; tres proveedores siguieron bloqueados. Se comprobaron visualmente cuatro resultados finales; el final de la animación de Games Global quedó pendiente. La detección de canvas requiere visión y la cobertura es parcial. El workflow global conserva fallos por bloqueos externos de sus smoke tests. [Recorrido, correcciones y límites](docs/control-walkthrough.md).

## Instalación

Requisitos: **Node.js 22 o superior** (CI usa 24), npm y Chromium de Playwright. Python 3 sólo se necesita para el analizador offline de HAR y sus pruebas.

```bash
git clone https://github.com/Shisetsu-Code/UMCP.git
cd UMCP
npm ci
npx playwright install chromium
```

En Linux, si faltan bibliotecas del sistema: `npx playwright install --with-deps chromium`. La CI usa Ubuntu 24.04 con esas bibliotecas disponibles e instala sólo Chromium. Si se usa un Chromium instalado, `UMCP_EXECUTABLE_PATH` permite indicar su ejecutable; la compatibilidad se prueba con la versión fijada de Playwright.

Configure un cliente MCP que soporte servidores locales por stdio:

```json
{
  "mcpServers": {
    "umcp": {
      "command": "node",
      "args": ["C:/UMCP/src/index.js", "--artifacts", "C:/UMCP/artifacts"]
    }
  }
}
```

Cambie las rutas según su instalación. En Linux/macOS use rutas absolutas, por ejemplo `/home/usuario/UMCP/src/index.js`. El navegador es visible por defecto; agregue `--headless` para ejecución sin ventana. Ejemplo completo: [`examples/mcp.json`](examples/mcp.json).

El proceso no abre un puerto ni se publica en Internet. ChatGPT web no puede iniciar directamente un proceso stdio en su PC; necesita un cliente/puente local que admita MCP. Esta entrega no incluye despliegue Cloudflare.

## Herramientas

| Herramienta | Función |
|---|---|
| `umcp_open` | Abre una sesión aislada y comienza la captura antes de navegar. |
| `umcp_sessions` | Sesiones, páginas y contadores. |
| `umcp_pages` | Lista popups y selecciona página activa. |
| `umcp_navigate` | URL, atrás, adelante o recargar conservando historial de red. |
| `umcp_observe` | Controles DOM, Shadow DOM, iframes, escenas accesibles, canvas y estabilidad. |
| `umcp_screenshot` | JPEG, PNG o WebP; resolución, calidad, recorte y etiquetas de coordenadas. |
| `umcp_act` | Click, doble click, mover, arrastrar, scroll, teclas, texto o espera. |
| `umcp_mark_controls` | Regiones manuales para botones que el LLM reconoce visualmente. |
| `umcp_network` | Listado paginado, detalle, endpoints, esquemas, estadísticas y marcas. |
| `umcp_export_har` | HAR de la sesión con filtros y frames WS. |
| `umcp_filter_har` | Filtra un HAR local existente sin modificar el original. |
| `umcp_artifact` | Descarga un archivo generado en fragmentos base64. |
| `umcp_close` | Cierra la sesión y libera navegador/memoria. Exportar antes de cerrar. |

## Flujo recomendado para el LLM

1. `umcp_open` con URL y viewport; reutilizar la sesión para otras páginas.
2. `umcp_observe`. Devuelve controles con ID, etiqueta, origen, rectángulo, centro y coordenadas normalizadas.
3. Si `needsVision` es verdadero, pedir `umcp_screenshot`. La imagen puede superponer controles y coordenadas.
4. `umcp_act` con `controlId` y `observationId` actuales, o con coordenadas explícitas.
5. Volver a observar después de actuar. Consultar red y exportar la evidencia necesaria.

No existe un bucle que elija compras, giros o botones por su cuenta. La comprobación de estabilidad ocurre únicamente al llamar `umcp_observe`: por defecto son **3 muestras, separadas por 2 segundos**. Con `samples:1` la lectura es rápida y `stable:null`: no se afirma estabilidad temporal. La estabilidad compara controles/posición/documento, no demuestra que una animación del canvas haya terminado.

### Coordenadas y capturas

Todos los controles usan **píxeles CSS del viewport principal**, incluyendo los desplazamientos de iframes y sus bordes. Una imagen reducida o recortada incluye una transformación explícita.

```json
{"sessionId":"…","preset":"low","overlay":true}
```

```json
{"sessionId":"…","format":"webp","quality":40,"maxWidth":960,"clip":{"x":100,"y":80,"width":800,"height":500}}
```

| Preset | Formato | Calidad | Ancho máximo |
|---|---|---:|---:|
| `low` | JPEG | 35 | 768 |
| `balanced` (default) | JPEG | 60 | 1280 |
| `high` | PNG | sin pérdida | 2560 |

Los valores individuales sobrescriben el preset. PNG no usa calidad JPEG. No se amplían imágenes pequeñas. `includeImage:false` devuelve solamente metadatos y enlace al archivo.

Para hacer click en el píxel `(300,180)` de una imagen:

```json
{"sessionId":"…","kind":"click","coordinateSpace":"image","screenshotId":"…","x":300,"y":180}
```

`coordinateSpace:"normalized"` usa `[0,1]` sobre el viewport completo. `viewport` usa píxeles CSS. Las referencias caducan a los 120 segundos y se invalidan tras acciones/navegaciones. Un click por control también verifica que su etiqueta y posición sigan coincidiendo. Esto no elimina toda carrera entre una observación y una interfaz que cambia: siempre hay que interpretar el resultado antes de repetir un click incierto.

## Detección de interfaz: alcance real

- DOM visible y accionable; atributos ARIA, controles nativos, links, listeners de puntero e interacciones declarativas `data-interactions` de click/pointer. Las declarativas tienen menor confianza y no ejecutan código durante la inspección. Texto visible de carga/error acotado a 1.000 caracteres por frame y 8.000 en total, separado de los controles.
- Shadow DOM abierto, iframes anidados, bordes, escala y oclusión del centro del control.
- Adaptadores acotados para raíces de **PixiJS, Phaser, CreateJS y Laya** accesibles desde el documento. Pixi/Phaser/CreateJS se ejercitan con escenas de prueba; Laya todavía no tiene verificación con un runtime real.
- Canvas: área visible y texto 2D observado durante el dibujo. El texto no se convierte automáticamente en un botón.
- Si el juego oculta su escena dentro de módulos/minificación, la alternativa es imagen + coordenadas. `needsVision:true` permanece para canvas: encontrar algunos objetos no demuestra cobertura completa.

No se promete extraer semántica universal desde WebGL. Máscaras complejas, hit areas particulares, cámaras, transformaciones no soportadas y Shadow DOM cerrado pueden requerir visión. Iframes rotados/skewed se informan sin publicar coordenadas inseguras.

Las regiones de `umcp_mark_controls` son afirmaciones visuales del LLM. Permanecen mientras coincidan URL y viewport, aunque el canvas cambie de menú; una observación nueva no revalida su contenido. Use `clear:true` y vuelva a marcarlas después de cambiar pantalla, menú o desplazamiento. Las acciones disponibles no incluyen mantener presionado el ratón: un control de autoplay que sólo se abra con pulsación prolongada queda fuera de esta versión.

## Red y HAR

HTTP: URL, método, headers, cuerpo de solicitud/respuesta cuando disponible, status, errores, tiempos y tamaños. Se captura tráfico de todas las páginas del contexto. WebSocket: aperturas, cierres, errores y frames enviados/recibidos, texto y binario base64. Las marcas (`umcp_network` con `operation:"mark"`) y cada acción permiten correlacionar tráfico por timestamp/ID.

`operation:"query"` es compacto y paginado; `detail` con `requestId` permite leer el cuerpo. Las consultas muestran el estado actual sin esperar long polling; `operation:"flush"` espera las solicitudes/cuerpos pendientes hasta cinco segundos y devuelve contadores de pendientes. La exportación también hace ese flush acotado. `endpoints` agrupa método + ruta y describe la forma observada del payload. No decide que una compra terminó porque recibió HTTP 200/202. El cuerpo se inspecciona aunque su MIME sea incorrecto; los archivos adjuntos mostraron XML anunciado como HTML/formulario.

### Qué guardar

| `preset` | Contenido exportado |
|---|---|
| `full` | Todos los recursos **que se hayan capturado**. |
| `activity` | Actividad XHR/fetch/API/WS; excluye recursos estáticos identificados. |
| `metadata` | Entradas sin cuerpos ni datos de frames. |
| `ws` | Conexiones WS y frames disponibles. |

```json
{"sessionId":"…","preset":"activity","domains":["demo.example.com"],"methods":["POST","PUT"],"includeBodies":true,"redact":true}
```

También puede filtrar `urlIncludes`, `resourceTypes`, `statusMin/statusMax`, `since/until` (milisegundos Unix) y `transport` (`http`, `ws`, `all`). `offset/limit` limita la selección exportada si se especifica. `umcp_filter_har` acepta los mismos filtros y `inputPath` (archivo local, máximo 512 MiB).

El intervalo es inclusivo. HTTP se selecciona por el inicio de la solicitud. En WS se conserva una conexión si su apertura o algún frame cae dentro del intervalo, y se recortan sus frames a ese intervalo. Así se puede consultar tráfico posterior a una acción aunque el socket se haya abierto antes. Los metadatos, bytes/duración acumulados y `_action` de apertura siguen describiendo la conexión; cada frame conserva su propia `_action`.

`filter.timeRange` en consultas/resúmenes y `log._filter.timeRange` en HAR explican la selección y cuentan frames incluidos, fuera del intervalo y sin hora válida. Esos contadores se calculan antes de paginar. `frameFilter` en cada fila de consulta y `_webSocketFrameFilter` en el HAR/detalle dan el desglose de esa conexión. Los frames deben usar `time` numérico en segundos Unix: no se adivinan unidades ni fechas ausentes. Sin intervalo se conservan también frames sin fecha; un HAR previamente recortado no permite recuperarlos después.

**La selección de exportación y la captura son distintas.** `umcp_open` usa `captureBodies:"activity"` por defecto; seleccione `"all"` desde el comienzo para retener también cuerpos de recursos estáticos. No es posible reconstruir después cuerpos descartados. Los límites por defecto son 10.000 entradas, 256 KiB por cuerpo/frame, 10.000 frames y 64 MiB totales de payload retenido. Los metadatos señalan cuerpos omitidos, truncados, pendientes y entradas descartadas. `full` no significa captura sin límites.

HTTP `httpVersion` se informa como desconocido cuando Playwright no lo expone: no se inventa HTTP/1.1 para conexiones h2/h3. El status y los headers del handshake WS tampoco están disponibles por esa API: se informa status `0`/desconocido, y los frames prueban la conexión sin inventar un status 101. Los errores de handshake quedan como fallos. Un cuerpo sin Content-Length puede ser materializado temporalmente por Playwright antes del truncamiento; el presupuesto limita retención, no toda la memoria del navegador.

### Credenciales y binarios

Los exports eliminan por defecto cookies, autorización y campos sensibles reconocidos en query, formularios, JSON y XML. `redact:false` conserva los datos crudos explícitamente. Los payloads binarios opacos pueden contener información que no se puede reconocer: se conservan y `_redaction.complete:false` advierte esa limitación. La redacción no sustituye una revisión antes de compartir HAR crudos.

Los archivos se guardan con nombres generados en `artifacts/` o en el directorio elegido. Se devuelven como recurso MCP y ruta local. Recursos de hasta 1 MiB se pueden leer directamente; los mayores se descargan con `umcp_artifact` usando `nextOffset`.

### Formato WebSocket

HAR 1.2 no estandariza frames WS. UMCP guarda una entrada por conexión con `_resourceType:"websocket"` y `_webSocketMessages`, cuyos objetos contienen `type` (`send`/`receive`), `time` (segundos Unix), `opcode`, `data` y `encoding:"base64"` para binarios. `_capture`, `_bodyState`, `_truncated` y `_redaction` documentan alcance/pérdidas. Un HAR de navegador sin frames nunca se presenta como evidencia de que no hubo WS.

## Pruebas y evidencia

```bash
npm run check
npm test
node scripts/live-smoke.js belatra
node scripts/live-smoke.js all
python3 scripts/analyze-hars.py --input ./mis-har --output ./resumen.json
```

La suite ejercita un servidor HTTP/WS real, Chromium, iframes, escenas, imágenes, errores, redacción y un cliente MCP conectado por stdio. [`ci.yml`](.github/workflows/ci.yml) ejecuta esa suite y ocho smoke tests de demos públicas en Actions. Cada smoke guarda captura, observación, tiempos y resultado. Los HAR publicados por CI contienen sólo una lista permitida de metadatos: sin cuerpos, datos de frames, headers ni valores de query. Los exports locales sí pueden conservar los payloads elegidos por el usuario.

El smoke exige un canvas y tráfico válido del endpoint esperado para devolver éxito. `canvas-observed` por sí solo queda incompleto; `external-block`, `launch-error`, `navigation-failed`, `no-game-surface` y `error` conservan el motivo del fallo. Un resultado `game-observed` demuestra observación e inicialización aparente, y requiere revisar su captura; el smoke no cubre todos los giros/compras del juego.

- [Hallazgos de los 18 HAR](docs/har-findings.md)
- [Diseño y límites](docs/superpowers/specs/2026-10-26-umcp-design.md)
- [Resultados de validación](docs/validation.md)
- [Recorrido real de controles mediante el propio MCP](docs/control-walkthrough.md)

## Evolución a Cloudflare

El transporte MCP, el servicio de navegador y los modelos de observación/red están separados. Un futuro transporte HTTP deberá incorporar autenticación, aislamiento, almacenamiento y un ejecutor de navegador compatible. Los contextos Playwright de este proceso local no migran automáticamente a Workers.
