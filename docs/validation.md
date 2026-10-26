# Validación de UMCP

Código evaluado: [`4044ac0`](https://github.com/Shisetsu-Code/UMCP/commit/4044ac0f3e241371ce18388431bf37a362ecb79c). Fecha: 2026-10-26.

**Núcleo: 54/54 pruebas aprobadas, 0 fallos y 0 omitidas.** El [cuarto run de Actions, 40374185931](https://github.com/Shisetsu-Code/UMCP/actions/runs/40374185931), termina globalmente en `failure` por cuatro bloqueos externos; su job de núcleo está aprobado. Cuatro demos aportan canvas y tráfico de inicialización. Su pantalla jugable y sus acciones todavía no están validadas.

## 1. Núcleo reproducible

| Entorno | Aprobadas | Duración | Fallos | Omitidas |
|---|---:|---:|---:|---:|
| Local | 54/54 | 9.526 s | 0 | 0 |
| GitHub Actions | 54/54 | 7.158 s | 0 | 0 |

Los [tests de esta versión](https://github.com/Shisetsu-Code/UMCP/tree/4044ac0f3e241371ce18388431bf37a362ecb79c/test) combinan fixtures controlados y Chromium real. Estos tiempos no representan la latencia de un proveedor.

| Grupo | Pruebas | Alcance |
|---|---:|---|
| Imágenes | 2 | Escala, recorte, coordenadas, formatos y overlay. |
| Browser integrado | 3 | Clicks, referencias obsoletas, iframes, sesiones y long polling. |
| MCP stdio | 1 | Inicialización, herramientas, llamadas, imágenes, recursos y entradas. |
| Red | 21 | HTTP, JSON/form/XML, errores, redirecciones, WS, límites, flush y saneamiento. |
| Protocolos/CLI | 8 | Siete familias sintéticas, XML anidado, HAR, duplicados y protección de originales. |
| Evidencia pública | 1 | Exclusión de cuerpos, headers, queries e identificadores sensibles. |
| Evidencia de demo | 1 | Exclusión de falsos positivos: 403, pendientes, estáticos y WS rechazados. |
| UI | 17 | Visibilidad, oclusión, eventos delegados, iframes, escenas, estabilidad e instrumentación. |
| **Total** | **54** | **0 fallos; 0 omitidas.** |

## 2. Demos: resultado final y revisión visual

Fuente durable: [resultados, pasos y métricas en JSON](evidence/validation-results.json). Los nombres enlazados abren las capturas revisadas. HTTP cuenta entradas de red, incluidos recursos; WS cuenta **frames**, no conexiones ni apuestas. El tiempo corresponde al smoke completo.

| Target | Pantalla o bloqueo confirmado | HTTP | Frames WS | Tiempo |
|---|---|---:|---:|---:|
| [Playtech GPAS](evidence/playtech-gpas.jpeg) | **INTRO**, flecha Play; canvas + inicialización | 165 | 13 | 25.134 s |
| [Playtech NGM](evidence/playtech-ngm.jpeg) | **INTRO**, Continue; canvas + inicialización | 145 | 4 | 14.927 s |
| [RubyPlay](evidence/rubyplay.jpeg) | **INTRO**, PRESS ANYWHERE TO CONTINUE; popup abierto, canvas + inicialización | 1681 | 0 | 46.811 s |
| [ELK](evidence/elk.jpeg) | **Canvas + inicialización; carga al 15%** | 89 | 0 | 16.633 s |
| Belatra | Bloqueo de Cloudflare | 18 | 0 | 27.971 s |
| Playson | Bloqueo de Cloudflare | 18 | 0 | 27.966 s |
| Games Global | Acceso bloqueado | 5 | 0 | 8.408 s |
| Push Gaming | Geobloqueo | 28 | 0 | 8.965 s |

Los cuatro primeros reciben el estado automático `game-observed`: significa superficie visible y evidencia de red, y necesita esta revisión visual para precisar el alcance. **No equivale a gameplay validado ni a todos los botones reconocidos.** ELK mostró una introducción en ejecuciones anteriores; su última captura sólo acredita carga al 15%.

RubyPlay completó `YES, I'M 18 YEARS OR OLDER`, `Reject All`, scroll de **480 px** y `Play Demo`, obteniendo **un canvas visible**. Antes, su iframe inicializaba red dentro de un popup oculto: un HTTP 200 aislado no demostraba visibilidad.

## 3. Imágenes y estabilidad medidas

Comparación de la captura PNG de **1280×720** con la JPEG de **768×432**, según el JSON:

| Demo | PNG, bytes | JPEG, bytes | Reducción |
|---|---:|---:|---:|
| GPAS | 1725013 | 32055 | 98.1% |
| NGM | 1623994 | 20643 | 98.7% |
| RubyPlay | 1850843 | 31041 | 98.3% |
| ELK | 305748 | 7717 | 97.5% |

Son medidas de estas imágenes; combinan reducción de resolución y compresión JPEG. No constituyen una garantía universal de tamaño o calidad.

GPAS y RubyPlay tienen `stable:null`: la captura final usa una muestra y **no afirma estabilidad temporal**. NGM tiene `stable:false`. ELK tiene `stable:true` para la muestra observada, pero eso no demuestra carga completa. Los cuatro reportan `needsVision:true` y cero controles detectados desde una escena de motor; los controles DOM observados no cubren automáticamente los controles internos del canvas.

## 4. Correcciones e historial

Correcciones incluidas y cubiertas por regresiones:

- Consultas de red sin esperar a que cierre long polling; `flush` y exportación mantienen espera acotada.
- WS rechazados sin inventar HTTP 101; evidencia de demo basada en actividad terminada y frames.
- Transformaciones no soportadas de iframes identificadas; **iframes ocultos descartados tempranamente antes de inspeccionar su contenido**.
- Lectura acotada de texto e interacciones declarativas `data-interactions`, incluidos clicks delegados sobre `span`.
- Fragmento público de GPAS preservado, incluido `real=0`; scroll y checkpoints para abrir el launcher RubyPlay.
- Artefactos públicos construidos con metadatos permitidos, excluyendo cuerpos opacos y credenciales.

El [run 1](https://github.com/Shisetsu-Code/UMCP/actions/runs/40368852598) inició la validación. El [run 2](https://github.com/Shisetsu-Code/UMCP/actions/runs/40371059147) pasó 52 pruebas del núcleo y encontró el timeout de RubyPlay a los 180 s. El [run 3](https://github.com/Shisetsu-Code/UMCP/actions/runs/40372765765) pasó 53 pruebas; estas iteraciones llevaron a las correcciones de launcher y observación que verifica el run final.

## 5. Límites y pruebas pendientes

Encontrar canvas o firmas de motor no demuestra interpretación semántica universal. Los HAR originales carecen de frames WS; la captura viva constituye evidencia distinta. La captura está acotada y sus conteos no garantizan cuerpos completos.

Para ampliar la cobertura se requiere:

1. Repetir los cuatro proveedores bloqueados desde un entorno local con acceso permitido, TLS válido y sesiones frescas.
2. Llegar a la pantalla jugable de cada demo, incluida la carga completa de ELK; revisar controles, límites, oclusiones y centros de click.
3. Cuando se prueben acciones autorizadas de demo, correlacionarlas con HTTP/WS y comprobar su estado final. Giros, compras, opciones y continuaciones necesitan cobertura explícita por separado.
4. Registrar por pantalla qué reconoce el detector, qué necesita visión y qué sigue sin comprobarse.

La validación del núcleo queda cerrada; la cobertura real de proveedores conserva estos límites.
