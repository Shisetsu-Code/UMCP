# Recorrido real de controles mediante UMCP

Fecha: **26 de octubre de 2026**. Código de referencia: [`72cf840`](https://github.com/Shisetsu-Code/UMCP/commit/72cf840f6f838f1470f53220ba6d380c35dc7cee).

**UMCP permitió recorrer controles y ejecutar un giro de demostración en cinco juegos: GPAS, NGM, Games Global, ELK y RubyPlay.** Se verificó visualmente el resultado final en cuatro; en Games Global faltó observar el final de la animación. Belatra y Playson devolvieron verificación de Cloudflare; Push Gaming mostró un bloqueo regional. La cobertura es **parcial y acotada a las acciones documentadas**: no constituye aprobación exhaustiva de los juegos, sus botones ni sus protocolos.

Fuente consolidada: [evidencia saneada del recorrido](evidence/control-walkthrough.json). Este informe amplía la [validación de inicialización anterior](validation.md); sus resultados de juego y los del smoke de CI tienen alcances distintos.

## Método y alcance

El recorrido utilizó un **cliente real del SDK MCP conectado por stdio** al servidor UMCP. Toda interacción con el navegador pasó por `umcp_open`, `umcp_observe`, `umcp_screenshot`, `umcp_act` y las herramientas de red, exportación y cierre. El cliente del recorrido no llamó directamente a Playwright. Chromium se ejecutó en modo headless con viewport **1280 × 720**; mantuvo la validación TLS usando confianza temporal aislada para una CA ya existente en el entorno.

Se combinaron controles DOM observados con coordenadas sobre capturas recientes. Se revisó el estado posterior antes de afirmar que una acción había funcionado. Los giros fueron individuales, en demos públicas; no se inició autoplay ni se compraron bonos. Abrir un selector o una tienda acredita su navegación, no la ejecución de todas sus opciones.

## Controles y resultados observados

| Proveedor / juego | Recorrido acreditado | Resultado y límite |
|---|---|---|
| **[Playtech GPAS — CollectOrbs: Wild West Wilds](evidence/controls/gpas-final.jpeg)** | Introducción; reglas y cierre; apuesta de 5 a 4; tienda y cuatro paneles; mute; un giro. | Saldo visual 10.000 → 9.996; respuesta de giro con ganancia 0 y ronda cerrada. No se compraron funciones. |
| **[Playtech NGM — Frankie Dettori: Sporting Legends](evidence/controls/ngm-final.jpeg)** | Continue; tabla de pagos, siguiente página y cierre; 25 → 24 líneas; abrir y retirar menú autoplay; un giro. | Apuesta 2,40; ganancia visual 8,50; créditos finales 1.006,10. El click en ajustes no produjo un cambio visible. |
| **[Games Global — Gold Blitz Ultimate](evidence/controls/gamesglobal-bet-selector.png)** | Ajustes; reglas en iframe y cierre; selector de apuesta de 2,00 a 0,20; un giro. | Solicitud y respuesta de juego capturadas. Créditos inmediatos 99.999,80; no se verificó visualmente el final de la animación. |
| **[ELK — Cluster Kingdom](evidence/controls/elk-final-state.png)** | Lanzamiento; menú; reglas; ajustes y música off; apuesta de 1,00 a 0,20; tienda X-iter y cierre; un giro normal. | Ganancia 0,64 y saldo demo final 5.000,44, con control de giro restablecido. |
| **[RubyPlay — Frankenstein Triple Volt](evidence/controls/rubyplay-final.jpeg)** | Menú; tabla de pagos y scroll; reglas y cierre; apuesta de 1,00 a 0,50; panel Buy Feature de 25,00 y cierre; un giro normal. | Ganancia 0,15; saldo demo final 9.999,65 y control de giro restablecido. No se compró la función. |
| **Belatra — 20 Super Stars** | Documento 307 → 403; texto de verificación de Cloudflare. | Sólo dos enlaces DOM del pie de Cloudflare; ningún control de juego ejercitado. |
| **Playson — 25 Cookies Hit the Bonus** | Documento 307 → 403; texto de verificación de Cloudflare. | Sólo dos enlaces DOM del pie de Cloudflare; ningún control de juego ejercitado. |
| **Push Gaming — Diamonds 4 The Win** | Launcher 200; cliente redirigido a la página de geobloqueo. | Mensaje de servicio no disponible en la región; ningún control de juego ejercitado. |

En NGM, una [captura WebP recortada de **790 × 420**](evidence/controls/ngm-help-crop.webp), con origen `(250,145)`, permitió avanzar y cerrar la tabla de pagos: los puntos de imagen `(775,210)` y `(750,26)` se transformaron en `(1025,355)` y `(1000,171)` del viewport. El segundo click sobre autoplay no cerró el menú; mover el puntero fuera sí lo hizo. El éxito técnico de `umcp_act` sólo demuestra entrega de la entrada: no acredita que se abriera el ajuste cuyo click no cambió la pantalla.

En GPAS se rechazó una referencia de captura obsoleta, según lo previsto. Sus cuatro paneles de funciones se inspeccionaron visualmente sin pulsar compra. En ELK, la tienda se cerró antes del giro normal; su balance permaneció en 5.000,00 hasta ese giro.

En RubyPlay, la web comercial devolvió 503 en dos intentos. Funcionó el launcher público estático del HAR aportado, verificado en HTML y en modo `fun`. Se cerró con `OK` la advertencia GPU C3 aparecida en este entorno headless con renderizado por software. El resultado visible coincide con `10000,00 − 0,50 + 0,15 = 9999,65`.

## Qué demuestra la red

**GPAS.** El giro se asocia con un `GameCommand` enviado por WebSocket y su respuesta. Se observaron `betCost=400`, `winAmount=0` y `gameRoundClosed=true`; el saldo de protocolo pasó de 1.000.000 a 999.600. La correspondencia con apuesta visual 4 y saldo 9.996 permite inferir una escala de 100 para esta ejecución, sin generalizarla a otros proveedores. Se conservaron **66 frames**; diez llevan la marca del giro, incluyendo heartbeats y notificaciones posteriores. No son diez giros. Los 66 frames retenidos figuraban capturados, aunque la sesión global registraba seis cuerpos truncados.

**NGM.** La aritmética visible coincide: `1000,00 − 2,40 + 8,50 = 1006,10`. Los cuatro frames WS pertenecen a una conexión de inicio cerrada antes del giro. La consulta y exportación desde la marca del giro quedaron vacías; además constan cuerpos truncados, un error de cuerpo y una solicitud pendiente. Esta ejecución no establece un endpoint de apuesta ni demuestra que el juego sea universalmente offline.

**Games Global.** Se capturó un POST `fetch` con HTTP 200, paquete de solicitud tipo 7 y respuesta tipo 8. El payload contiene atributos `Spin / Play / BaseGame`; la respuesta informa `betAmount=0.2` y `payoutAmount=0`. El campo `iswagercomplete=true` procede de telemetría enviada por el cliente, no de la respuesta del comando de juego. Ninguno sustituye la captura final que falta.

**ELK.** Tras el único giro normal se observaron POST XML a `/play/purchase` y `/play/checkwin`, ambos 200. El nombre `purchase` no identifica por sí solo una compra de bono. La captura visual final y el saldo corroboran el resultado; la exportación mínima contiene esas dos entradas. El `checkwin` asíncrono recibió la marca de una espera posterior: las marcas registran atribución temporal, no causalidad semántica.

**RubyPlay.** El POST a `/gameserver/demo` devolvió HTTP 200 y `status:ok`, con `action:spin`, `next_action:spin` y saldo de protocolo 999.965. El campo de apuesta enviado fue `bet:5` mientras la interfaz mostraba 0,50; esta prueba no deduce una conversión general de esa codificación. El resultado binario opaco se conservó sin decodificar. El saldo y la ganancia se comprobaron en pantalla.

## Fallos encontrados y correcciones

El filtro temporal WS descartaba una conexión abierta antes de `since`, aunque contuviera frames posteriores. El registro GPAS 038 devolvió cero entradas; el detalle conservaba los frames. Tras corregirlo, una llamada MCP real a `umcp_filter_har` sobre el HAR exportado seleccionó **cuatro frames en los primeros 1.000 ms del giro**, excluyendo 62. Esta prueba usa la captura existente; no es otro giro ni una nueva consulta sobre tráfico en vivo.

Ese mismo resultado histórico mostraba `preset:full` en el resumen, aunque el HAR decía correctamente `ws`. También se corrigió la conservación del preset del resumen, con prueba de regresión. Un **proceso MCP nuevo con el código final** volvió a filtrar la captura real: el registro 110 devuelve `preset:ws`, `transport:ws`, una conexión y cuatro frames; el registro 111 devuelve `preset:metadata`, `transport:http` y una entrada RubyPlay sin cuerpos. Se comprobó que los resúmenes coinciden con los archivos. La implementación y sus límites están en [network.js](../src/network.js) y el [README](../README.md#red-y-har).

También se descargó mediante `umcp_artifact` el HAR de cuatro frames: **22.033 bytes**, `nextOffset:null`, con igualdad byte a byte frente al artefacto generado. Su SHA-256 fue `9181441e31ae788934652928759e53c71442381759f881a9a9510ecba5641be8`.

## Límites operativos comprobados

- **Detección parcial:** firmas de PixiJS con escenas inaccesibles, canvas sin texto y etiquetas DOM genéricas como `body`, `div` o `path`. RubyPlay sólo ofrecía `body` fuera del botón de la advertencia GPU. Controles detectados no implican semántica suficiente para accionarlos.
- **Marcas manuales:** las cuatro regiones GPAS persistieron al abrir el selector; una posición antes llamada giro pasó a ser confirmación. Deben borrarse y remarcarse al cambiar de menú.
- **Observación no atómica:** en Games Global la imagen ya mostraba reglas mientras la extracción aún reflejaba ajustes. Una observación posterior encontró el iframe. RubyPlay devolvió `needsVision:false` durante las pantallas de carga de los **registros 85 y 90**, y `true` en las reglas cargadas. `false` no garantiza cobertura completa.
- **Texto y estabilidad:** puede aparecer texto de la pantalla cubierta; algunas opciones extraídas están fuera del viewport. ELK y RubyPlay limitaron reglas a 1.000 caracteres. `stable:true` compara estructura y posiciones, no fin de animación; una muestra devuelve `stable:null`.
- **Acciones y captura:** mantener pulsado no está disponible. `activity` puede incluir assets descargados por XHR/fetch: Games Global retuvo aproximadamente 7,14 MB y ELK 5,43 MB, con truncamientos. Un filtro de exportación no recupera cuerpos descartados.
- **Espera acotada:** los pendientes de Cloudflare llevaron las exportaciones a unos 5 s y los cierres a unos 10 s. Son mediciones de estas llamadas, no garantías de latencia.

## Verificación y publicación

El núcleo local pasó **59/59 pruebas en 18,218 s**. El job de núcleo del [run 40380024508](https://github.com/Shisetsu-Code/UMCP/actions/runs/40380024508) pasó **59/59 en 6,406 s**, sin fallos ni pruebas omitidas. El workflow global terminó en **failure**: sus smoke tests encontraron bloqueos externos en Belatra, Playson, Games Global y Push. Games Global sí abrió en el recorrido local documentado; el acceso depende del entorno. El [run anterior 40378936965](https://github.com/Shisetsu-Code/UMCP/actions/runs/40378936965), de `59a6309`, pasó 58/58 pruebas de núcleo en 6,252 s y también conservó bloqueos externos.

Las sesiones de los tres recorridos quedaron cerradas, incluida la última sesión RubyPlay. La evidencia publicable conserva resultados seleccionados y capturas revisadas. Excluye autorización, cookies, tokens, identificadores de sesión, jugador o acción del proveedor y payloads crudos; las superposiciones pueden mostrar IDs locales de controles de UMCP. Los HAR privados no se incorporan al repositorio.
