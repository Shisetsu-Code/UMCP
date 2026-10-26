# Validación de UMCP

## Estado

Implementación inicial: [`3d8a35e`](https://github.com/Shisetsu-Code/UMCP/commit/3d8a35ee9b1255e2d726d4731b8deabbaf9e72ca). Primera corrida: [40368852598](https://github.com/Shisetsu-Code/UMCP/actions/runs/40368852598). La [segunda corrida](https://github.com/Shisetsu-Code/UMCP/actions/runs/40371059147) verificó 52 pruebas del núcleo en 5,71 s y cargó las introducciones de Playtech GPAS, Playtech NGM y ELK; se revisaron sus screenshots. Belatra, Playson, Games Global y Push devolvieron bloqueos. RubyPlay inicializó red pero agotó el tiempo sin abrir su popup. La siguiente corrida verifica la corrección del botón declarativo y conserva capturas intermedias.

## Pruebas locales

Se usa Chromium 156.0.8078.4 correspondiente a Playwright 1.64.1. El ejecutor local requiere una ruta de navegador explícita; la CI instala la distribución fijada de Playwright.

**53 pruebas locales; 0 fallidas, 0 omitidas** después de la corrección declarativa de RubyPlay. El chequeo de sintaxis también pasó. La corrida anterior de 52 pruebas completó en 8,41 s; los tiempos dependen de esta máquina y no son una garantía de rendimiento de cada juego.

Se verificó con Chromium real el flujo integrado de observación, screenshot reducido, click por coordenadas de imagen, navegación y rechazo de referencias viejas; HTTP/WS de texto/binario; y MCP initialize/list/tools/call/resources por stdio.

| Grupo | Pruebas | Alcance |
|---|---:|---|
| Imágenes | 2 | Escala/recorte, coordenadas, PNG/JPEG/WebP, overlay y límites. |
| Browser integrado | 3 | Clicks reales, referencia obsoleta, iframe, Shadow DOM, popup, sesión aislada, export y consultas durante long polling. |
| MCP stdio | 1 | Initialize, listado de 13 herramientas, llamadas, imagen, recursos y validación de inputs. |
| Red | 21 | HTTP real, JSON/form/XML, errores, redirecciones, WS texto/binario, rechazo403, límites, flush y saneamiento. |
| Protocolos/CLI | 8 | Ejemplos sintéticos de siete familias, XML anidado, HAR sin frames, CLI y protección de originales. |
| Evidencia pública | 1 | Exclusión de cuerpos opacos, headers, valores de query e identificadores WS. |
| Evidencia de demo | 1 | Rechaza respuestas 403, peticiones pendientes, recursos estáticos, coincidencias solo en query y WS rechazados. |
| UI | 16 | DOM/listeners/oclusiones, interacciones declarativas delegadas, iframes anidados/escalados/reflejados, escenas, estabilidad, texto visible acotado y semántica de instrumentación. |

## Revisión y correcciones

La revisión independiente reprodujo tres defectos y confirmó su corrección:

1. Iframe reflejado: los bounding boxes positivos daban un centro incorrecto. Ahora se rechazan reflejos y transformaciones no soportadas del iframe o sus ancestros, indicando que hace falta visión.
2. WebSocket rechazado: un evento de creación no prueba un upgrade HTTP101. Se conserva status desconocido, evidencia de frames y estado de error; se verificó con un servidor local que rechaza el handshake con403.
3. Artefactos públicos: los cuerpos binarios no inspeccionables no deben subirse bajo una promesa genérica de redacción. La CI usa un directorio privado temporal y publica únicamente HAR reconstruidos desde una lista de metadatos permitidos.

La revisión final aceptó estas correcciones; las pruebas de demos reales son un control adicional y distinto.

El intento local contra Push Gaming encontró `ERR_CERT_AUTHORITY_INVALID` en la red del ejecutor y no llegó a cargar el juego. Esto se conserva como limitación del entorno, sin deshabilitar la validación TLS del MCP. La prueba de proveedores se realiza también desde GitHub Actions.

### Correcciones surgidas de las demos

- Las consultas `stats`, `query`, `detail` y `endpoints` ya no esperan al cierre de peticiones largas. `flush` y exportación conservan la espera explícita y acotada.
- La observación incluye texto renderizado acotado por frame. Su truncado no convierte controles estáticos en inestables.
- GPAS conserva los parámetros públicos del fragmento de su URL, incluido `real=0`.
- El smoke lee las pantallas de bloqueo dentro de iframes y reconoce los controles de edad/cookies/PLAY observados en ELK.
- El éxito del smoke exige un canvas y evidencia de endpoint: HTTP terminado con 2xx y tipo de actividad, o WS con frames. Una solicitud pendiente o un canvas aislado no aprueba el juego.
- CI fija Ubuntu 24.04, instala Chromium sin volver a descargar todos los paquetes del sistema, agrupa las demos en dos jobs y limita cada target a 180 s.
- RubyPlay declara su botón `Play Demo` como un `span` con `data-interactions`, manejado por un listener delegado. El detector ahora reconoce esa declaración acotada, con menor confianza. La regresión prueba un click real que abre un popup y pasa de cero a un canvas visible.
- El smoke conserva screenshots tempranos y observaciones parciales. Permite scroll para alcanzar el launcher RubyPlay y reduce el muestreo final cuando la observación es lenta, sin afirmar estabilidad temporal en ese caso.

## Criterios

- Núcleo: suite reproducible sin fallos ni omisiones y revisión de código.
- Proveedor: screenshot de canvas real, informe de controles y tráfico observado. Una página de catálogo, challenge, error TLS o sólo HTML no constituye un juego verificado.
- Semántica de interfaz: las escenas de prueba validan adaptadores; se reportará por separado lo observado en demos públicas. Ninguna corrida demuestra universalidad del detector.
- Red: los HAR originales no contienen frames WS; los frames se verifican mediante captura viva en el servidor de prueba y, si se obtiene acceso, las demos.
