# UMCP — análisis offline de 18 HAR

Fecha de análisis: 2026-10-26. Los originales se leyeron sin modificación. No se hicieron peticiones de red, navegación ni operaciones Git. Este informe contiene esquemas, nombres públicos y metadatos; no incluye valores de sesión, cookies, credenciales ni payloads crudos.

## Hallazgos que afectan la arquitectura

- **Captura WS nativa obligatoria:** hay 4 handshakes WebSocket en los archivos de SHA único (3 Playtech, 1 Games Global), pero **0 frames exportados**. El formato HAR de origen no incluye `_webSocketMessages` ni `_webSocketFrames`.
- **Sniffing del cuerpo:** Playson envía XML con MIME `application/x-www-form-urlencoded` y recibe XML con MIME `text/html`. Games Global usa JSON cuyo `packet.payload` contiene XML. ELK usa XML directo; RubyPlay y Push usan JSON; Belatra usa un campo `d` Base64 opaco.
- **UI y versiones:** hay Phaser en Belatra, Pixi en cuatro familias y versiones explícitas Pixi 7.2.4 (Games Global) y 8.14.3 (ELK Propaganda 2). Se necesitan propiedades modernas como `eventMode` además de `interactive`.
- **Evitar falsos positivos de motor:** Push contiene `createjs.LoadQueue`, una señal de preloader; eso no prueba un renderer CreateJS. Playtech tiene clientes GPAS y NGM distintos; NGM sí incluye EaselJS/Stage/StageGL.
- **Estado de acción separado de transporte:** Push presenta 202 con HTML y status 0 en peticiones finales. Un 2xx no demuestra final de ronda, compra efectiva ni esquema JSON válido.

## Inventario y duplicados

**18 archivos; 17 SHA-256 únicos; 1,189,561,765 bytes**. Hay 9,073 entradas en los 18 archivos y 8,791 al contar cada SHA una sola vez. Estos últimos incluyen 8,009 entradas HTTP(S), 4 handshakes WS y 778 data URI. Los segmentos acumulativos también se solapan; los totales por SHA no equivalen a sesiones independientes.

| Familia | Archivos / SHA únicos | Entradas en SHA únicos | HTTP(S) | WS | Frames WS |
|---|---:|---:|---:|---:|---:|
| Belatra | 4 / 3 | 1178 | 1162 | 0 | 0 |
| Playtech | 2 / 2 | 556 | 552 | 3 | 0 |
| Playson | 3 / 3 | 3077 | 2642 | 0 | 0 |
| RubyPlay | 2 / 2 | 875 | 846 | 0 | 0 |
| ELK | 3 / 3 | 1714 | 1594 | 0 | 0 |
| Games Global | 1 / 1 | 699 | 562 | 1 | 0 |
| Push Gaming | 3 / 3 | 692 | 651 | 0 | 0 |

### SHA-256 por archivo

| Archivo | Bytes | Entradas | HTTP(S) | WS | SHA-256 |
|---|---:|---:|---:|---:|---|
| belatragames.com_Archive [26-10-26 13-21-42](1).har | 21901517 | 282 | 277 | 0 | `4d10be92dda09e6f610185d880fe07e824d66e73fa9c539b0211427dbcf5fe39` |
| belatragames.com_Archive [26-10-26 13-21-42].har | 21901517 | 282 | 277 | 0 | `4d10be92dda09e6f610185d880fe07e824d66e73fa9c539b0211427dbcf5fe39` |
| belatragames.com_Archive [26-10-26 13-22-32].har | 63963487 | 634 | 629 | 0 | `ecf1bfc970fa4e38937c33abf87cfef60de6414e7f7c310dcc0c2bf1cc121a76` |
| belatragames.com_Archive [26-10-26 13-25-44].har | 49228820 | 262 | 256 | 0 | `81de2293369be9dc8f5b346fd007e7928115a72e0c42de39cdf7dc58dc0adb81` |
| cachedownload.playtechone.com_Archive [26-10-26 13-20-34].har | 77297449 | 384 | 382 | 2 | `98a472d37c72acf66f0d3b5f982d8eaaa7d20dbfffc41bc8071c1b9dcfe705c4` |
| gpas-games.playtechone.com_Archive [26-10-26 13-19-21].har | 29546795 | 172 | 170 | 1 | `8263402375b33b7a2e002dab4774d84c967baf2dd1620c216e5ec668a6c27bb7` |
| playson.com_Archive [26-10-26 13-49-24].har | 34050842 | 699 | 554 | 0 | `1ca94758a511ea3040683b5a39e4711829a72fc897436733b73402348ca74f6a` |
| playson.com_Archive [26-10-26 13-52-09].har | 95773330 | 1653 | 1508 | 0 | `08362326457649c96748a33e9a17d730eb09fd70d9b20157ca2b90cfba81ee42` |
| playson.com_Archive [26-10-26 13-52-44].har | 34217193 | 725 | 580 | 0 | `562e0ab1a6d197af6136842d75959cc95cb809d11085cd2699559875cb0f6f30` |
| rubyplay.com_Archive [26-10-26 13-28-15].har | 97486361 | 665 | 651 | 0 | `b17ad190fef79b37b85c64a54e327d74419587e64e04ab13b4c1c2fa91bce152` |
| rubyplay.com_Archive [26-10-26 13-29-59].har | 49188268 | 210 | 195 | 0 | `7d044a260e31940445dcebcaf2f19e5aaa95cb1d430b5aadc88e338dcc1f6480` |
| www.elk-studios.com_Archive [26-10-26 12-49-44].har | 85383970 | 190 | 109 | 0 | `57aea9d52520e0e68788840a54cea5fc22540662605d610e259ab3ef08625597` |
| www.elk-studios.com_Archive [26-10-26 12-53-35].har | 199009627 | 1083 | 1062 | 0 | `ce0a8faf27ede49d68b6d77f89554673ab06928f749ef035f1339454116f5067` |
| www.elk-studios.com_Archive [26-10-26 13-57-58].har | 76951556 | 441 | 423 | 0 | `60cd797d4a638226450afa55b9ba7069f4ad97c2c56f9d838ba48511a890d4c3` |
| www.gamesglobal.com_Archive [26-10-26 13-45-59].har | 32929687 | 699 | 562 | 1 | `23969b53f4a28a82942c46bddaaf63b0a7c680de4e62013097a73d9da0d4748f` |
| www.pushgaming.com_Archive [26-10-26 13-54-31].har | 61221336 | 183 | 175 | 0 | `87ee32fc63fbf7a2693fb6b4107cf7241acf90bb6f1f127444a79535fe71cfb8` |
| www.pushgaming.com_Archive [26-10-26 13-56-03].har | 70811146 | 289 | 277 | 0 | `16969d7a9c49e4fee202c1325a8c6559c1376b1ef5702b690cb74ab22eb71c04` |
| www.pushgaming.com_Archive [26-10-26 13-56-08].har | 88698864 | 220 | 199 | 0 | `1a1b0f010c564e7ac1c551d243b470648828784447485c58ba25c343655e78c2` |

Duplicado byte a byte: `belatragames.com_Archive [26-10-26 13-21-42].har` y la copia con `(1)` tienen SHA `4d10be92dda09e6f610185d880fe07e824d66e73fa9c539b0211427dbcf5fe39`. La copia con `(1)` se usa como representante en el JSON.

### Solapamientos de capturas

Se calculó una huella local por entrada a partir de timestamp, método, URL, cuerpos y status; sólo se publica el conteo. No se publican las huellas ni valores originales.

| Archivo A | Archivo B | Entradas compartidas |
|---|---|---:|
| belatragames.com_Archive [26-10-26 13-21-42](1).har | belatragames.com_Archive [26-10-26 13-22-32].har | 277 |
| cachedownload.playtechone.com_Archive [26-10-26 13-20-34].har | gpas-games.playtechone.com_Archive [26-10-26 13-19-21].har | 170 |
| playson.com_Archive [26-10-26 13-49-24].har | playson.com_Archive [26-10-26 13-52-44].har | 695 |
| www.elk-studios.com_Archive [26-10-26 12-49-44].har | www.elk-studios.com_Archive [26-10-26 12-53-35].har | 107 |

## Familias: protocolos, motores y pruebas

### Belatra

**Motor:** Phaser 3 family (strong static evidence; exact version not established).

- Phaser.Game, Phaser.Scene, Phaser.GameObjects, Phaser.Input and Phaser.Renderer occur in game/core bundles.
- SpineWebGLPlugin_v3.8.js is present. Phaser.Input/hitArea provide candidate UI anchors; actual runtime objects were not inspected.

**Protocolo observado:** POST /game: form fields d and sid; JSON response {d:string}. d is Base64-decodable non-UTF-8; no JSON/XML decoder established.

**Cobertura:** Envelope traffic only; exact spin/bet/buy/continuation discriminators inside d are not established.

**Smoke propuesto:** 20 Super Stars for lighter Phaser load; Coins Blast as second title. Fresh public launcher, detect canvas/Phaser surface, observe a single demo action if separately authorized, assert POST /game and response d without decoding assumptions.

- Do not label Base64 as encryption or compression without evidence.
- SID is in form payload, not only cookies or URL. Redaction must traverse body fields.

| Juego / ID | URL pública o launcher | Evidencia / alcance |
|---|---|---|
| 20 Super Stars / `super_stars` | https://demo.bltrm.com/belatra/demo?game=super_stars&language=es | HTML title and observed 302 launcher; gameplay envelope present |
| Fortune Mummy / `fortune_mummy` | https://demo.bltrm.com/belatra/demo?game=fortune_mummy&language=es | HTML title and observed 302 launcher; gameplay envelope present |
| Coins Blast / `coins_blast` | https://demo.bltrm.com/belatra/demo?game=coins_blast&language=es | HTML title and observed 302 launcher; gameplay envelope present |

#### Endpoints y esquemas de esta familia

Los endpoints se muestran sin valores de query. `{connectionId}` y `{actionId}` son plantillas. En JSON se conserva el catálogo completo de campos y los índices de entrada para comprobarlo contra el original.

| Método | Endpoint | Conteo en SHA únicos | Estado(s) | Formato real solicitud → respuesta |
|---|---|---:|---|---|
| POST | `https://demo.bltrm.com/user/datalist` | 4 | 200 | json → json |
| POST | `https://demo.bltrm.com/game` | 64 | 0, 200 | form-urlencoded → json |

- `POST /user/datalist`: solicitud `$.datatype`, `$.sid`.
- `POST /game`: solicitud `$.d`, `$.sid`.

### Playtech

**Motor:** Two clients: GPAS/GLU with renderer not established; legacy NGM includes full CreateJS/EaselJS.

- NGM platform script contains createjs.Stage, StageGL, DisplayObject, Container, Bitmap, Sprite, hitArea and getBounds.
- GPAS/GLU assets contain game-specific JMM/JMP resources, env_web.js and pako/compression.js; no strong Pixi/Phaser/Laya signature found.
- Presence in the platform bundle does not prove every game renders through that library.

**Protocolo observado:** GET /socket.io/1/ handshake then WSS /socket.io/1/websocket/{connectionId}; GPAS staging and Playtech Horizon origins.

**Cobertura:** HTTP/WS upgrade only. No WS message frames in any source HAR; game action schemas are unavailable.

**Smoke propuesto:** Separate GPAS CollectOrbs and legacy NGM Frankie Dettori cases. Assert connection events and live sent/received frames using native browser instrumentation; never treat imported HAR zero frames as a no-WS result.

- CollectOrbs title is verified in public static title table; it must not be inferred from gpas_trgems_pop.
- No spin/feature payload coverage can be claimed from these HARs.

| Juego / ID | URL pública o launcher | Evidencia / alcance |
|---|---|---|
| CollectOrbs: Wild West Wilds™ / `gpas_trgems_pop` | https://gpas-games.playtechone.com/gpasclient.html?game=gpas_trgems_pop | HAR page/referrer; title from gameclient_titles_list_live.php at cachedownload HAR entry 278; WS handshake present |
| Frankie Dettori: Sporting Legends™ / `fdtsl` | https://cachedownload.playtechone.com/ngmdesktop/casinoclient.html?game=fdtsl&real=0&preferedmode=offline | Observed launcher and title table at cachedownload HAR entry 278; WS handshake present |

#### Endpoints y esquemas de esta familia

Los endpoints se muestran sin valores de query. `{connectionId}` y `{actionId}` son plantillas. En JSON se conserva el catálogo completo de campos y los índices de entrada para comprobarlo contra el original.

| Método | Endpoint | Conteo en SHA únicos | Estado(s) | Formato real solicitud → respuesta |
|---|---|---:|---|---|
| GET | `https://gpas-stg.playtechone.com/socket.io/1/` | 2 | 200 | empty → opaque-text |
| GET | `wss://gpas-stg.playtechone.com/socket.io/1/websocket/{connectionId}` | 2 | 101 | empty → empty |
| GET | `https://oapi.playtechhorizon.com/socket.io/1/` | 2 | 0, 200 | empty → empty, opaque-text |
| GET | `wss://oapi.playtechhorizon.com/socket.io/1/websocket/{connectionId}` | 1 | 101 | empty → empty |


### Playson

**Motor:** PixiJS with Spine; legacy interaction symbols.

- Game bundles contain PIXI, PixiJS, PIXI.spine, InteractionManager, interactive, interactiveChildren, getBounds, worldTransform.
- No exact Pixi version established in this pass.

**Protocolo observado:** POST /connect, /reconnect, /sync, /bet, /bonus, /logout. Bodies are XML <client>/<server> even though request MIME is form-urlencoded and response MIME text/html.

**Cobertura:** Bet requests, buy attributes and bonus continuation requests are observed for both game IDs. Full option coverage and terminal completion are not established.

**Smoke propuesto:** 25 Cookies plus Thunder Coins XXL. Sniff XML despite MIME, retain attribute schema, distinguish /bet from /bonus and keep session attributes redacted.

- Launcher uses key/partner/wl parameters; start from public game page to obtain a fresh session.
- Do not interpret all /bet requests as ordinary spins; captured /buy attributes carry feature selection.

| Juego / ID | URL pública o launcher | Evidencia / alcance |
|---|---|---|
| 25 Cookies: Hit the Bonus / `25_cookies` | https://playson.com/game/25-cookies-hit-the-bonus | HTML title, live demo launch and bet/bonus protocol present |
| Thunder Coins XXL: Multicoin / `thunder_coins_xxl_multicoin` | https://playson.com/game/thunder-coins-xxl-multicoin | HTML title, live demo launch and bet/bonus protocol present |

#### Endpoints y esquemas de esta familia

Los endpoints se muestran sin valores de query. `{connectionId}` y `{actionId}` son plantillas. En JSON se conserva el catálogo completo de campos y los índices de entrada para comprobarlo contra el original.

| Método | Endpoint | Conteo en SHA únicos | Estado(s) | Formato real solicitud → respuesta |
|---|---|---:|---|---|
| POST | `https://demo.0y81pm-c-o6pywcq.com/connect` | 4 | 200 | xml → xml |
| POST | `https://demo.0y81pm-c-o6pywcq.com/reconnect` | 4 | 200 | xml → xml |
| POST | `https://demo.0y81pm-c-o6pywcq.com/sync` | 19 | 200 | xml → xml |
| POST | `https://demo.0y81pm-c-o6pywcq.com/bet` | 9 | 200 | xml → xml |
| POST | `https://demo.0y81pm-c-o6pywcq.com/bonus` | 60 | 200 | xml → xml |
| POST | `https://demo.0y81pm-c-o6pywcq.com/logout` | 1 | 200 | xml → xml |

- `POST /connect`: solicitud `/client`, `/client/@_uip`, `/client/@command`, `/client/@dwnl`, `/client/@engine_type`, `/client/@engine_version`, `/client/@furl`, `/client/@gameid`, `/client/@iif`, `/client/@ourl`, `/client/@platform`, `/client/@playerguid`, `/client/@rnd`, `/client/@snd`, `/client/@spn`, `/client/@wl`, `/client/debug`, `/client/debug/@build_date`, `/client/debug/@build_version`.
  Discriminadores observados: `/client/@command` = `connect`.
- `POST /reconnect`: solicitud `/client`, `/client/@_uip`, `/client/@command`, `/client/@dwnl`, `/client/@rnd`, `/client/@session`, `/client/@snd`, `/client/@spn`.
  Discriminadores observados: `/client/@command` = `reconnect`.
- `POST /sync`: solicitud `/client`, `/client/@_uip`, `/client/@command`, `/client/@dwnl`, `/client/@prid`, `/client/@prnd`, `/client/@rnd`, `/client/@session`, `/client/@snd`, `/client/@spn`.
  Discriminadores observados: `/client/@command` = `sync`.
- `POST /bet`: solicitud `/client`, `/client/@_auto`, `/client/@_btn`, `/client/@_cpt`, `/client/@_ct`, `/client/@_lct`, `/client/@_rst`, `/client/@_rt`, `/client/@_spt`, `/client/@_st`, `/client/@_uip`, `/client/@command`, `/client/@dwnl`, `/client/@furl`, `/client/@iif`, `/client/@ourl`, `/client/@prid`, `/client/@prnd`, `/client/@rnd`, `/client/@session`, `/client/@snd`, `/client/@spn`, `/client/bet`, `/client/bet/@cash`, `/client/buy`, `/client/buy/@freegame`.
  Discriminadores observados: `/client/@command` = `bet`; `/client/buy/@freegame` = `true`; `/client/buy/@type` = `0`, `2`.
- `POST /bonus`: solicitud `/client`, `/client/@_auto`, `/client/@_btn`, `/client/@_rst`, `/client/@_rt`, `/client/@_spt`, `/client/@_st`, `/client/@_uip`, `/client/@command`, `/client/@dwnl`, `/client/@prid`, `/client/@prnd`, `/client/@rnd`, `/client/@session`, `/client/@snd`, `/client/@spn`, `/client/action`, `/client/action/@round`.
  Discriminadores observados: `/client/@command` = `bonus`.
- `POST /logout`: solicitud `/client`, `/client/@_uip`, `/client/@command`, `/client/@dwnl`, `/client/@rnd`, `/client/@session`, `/client/@snd`, `/client/@spn`.
  Discriminadores observados: `/client/@command` = `logout`.

### RubyPlay

**Motor:** PixiJS (module bundle evidence).

- Game bundles contain PIXI/PixiJS/@pixi, DisplayObject, TextureSystem, getBounds, interactive, interactiveChildren, worldTransform.
- Exact Pixi version not established.

**Protocolo observado:** POST https://srv.prrpeu3.com/gameserver/demo, application/json: init/spin with v_protocol,v_math,key,device_type,funModeData; spin includes bet,an,bets.

**Cobertura:** Mad Hit Diamonds Extreme and Frankenstein each have init and one spin. Buy-feature configuration appears in init, but no purchase action is captured.

**Smoke propuesto:** Frankenstein Triple Volt then Mad Hit Diamonds Extreme. Assert JSON action init/spin and response data.next_action, data.player, opaque data.binary and funModeData fields.

- Mad Hit Mr Coin SE loaded but no gameserver request captured for game 240.
- Eredivisie launch failed 404; engagement/init has 404 responses and should not be mistaken for core game failure.

| Juego / ID | URL pública o launcher | Evidencia / alcance |
|---|---|---|
| Mad Hit Diamonds Extreme / `rp_222` | https://rubyplay.com/games/mad-hit-diamonds-extreme/ | HAR page title/links, launcher title, init and spin for funModeData.gameId=222 |
| Frankenstein Triple Volt / `rp_233` | https://rubyplay.com/games/frankenstein-triple-volt/ | Observed public HTML, launcher, init and spin for funModeData.gameId=233 |
| Mad Hit Mr Coin SE / `rp_240` | https://rubyplay.com/games/mad-hit-mr-coin-se/ | Public link and launcher/bundle load; no gameserver request for gameId=240 captured |
| Eredivisie Goal Collect | https://rubyplay.com/games/eredivisie-goal-collect/ | Observed HTML; launch returned 404 without gamename. Exclude as first positive smoke target. |

#### Endpoints y esquemas de esta familia

Los endpoints se muestran sin valores de query. `{connectionId}` y `{actionId}` son plantillas. En JSON se conserva el catálogo completo de campos y los índices de entrada para comprobarlo contra el original.

| Método | Endpoint | Conteo en SHA únicos | Estado(s) | Formato real solicitud → respuesta |
|---|---|---:|---|---|
| POST | `https://srv.prrpeu3.com/gameserver/demo` | 5 | 200 | json → json |
| OPTIONS | `https://srv.prrpeu3.com/gameserver/demo` | 5 | 204 | empty → empty |
| POST | `https://srv.prrpeu3.com/engagement/init` | 3 | 0, 404 | json → empty, json |
| OPTIONS | `https://srv.prrpeu3.com/engagement/init` | 3 | 0, 204 | empty → empty |

- `POST /gameserver/demo`: solicitud `$.action`, `$.an`, `$.bet`, `$.bets`, `$.bets[]`, `$.device_type`, `$.funModeData`, `$.funModeData.brandId`, `$.funModeData.currencyId`, `$.funModeData.currentBalanceSubUnit`, `$.funModeData.gameId`, `$.funModeData.initialBalance`, `$.key`, `$.v_math`, `$.v_protocol`.
  Discriminadores observados: `$.action` = `init`, `spin`.

### ELK

**Motor:** PixiJS + Spine, with version diversity; Propaganda 2 explicitly PixiJS 8.14.3.

- Cluster Kingdom includes older PIXI.spine signatures; newer Pirots 5/Propaganda 2 bundles include modern Pixi symbols.
- Propaganda 2 includes eventMode, EventBoundary and EventSystem. A legacy-only interactive scan is insufficient.

**Protocolo observado:** POST /capi/{gameId}/play/init, /purchase, /checkwin using XML <request> attributes and <response> elements.

**Cobertura:** Cluster Kingdom and Propaganda 2 have init/purchase/checkwin. Pirots 5 has two init and one purchase. The endpoint name purchase also covers a base wager; it alone is not proof of bonus buying.

**Smoke propuesto:** Cluster Kingdom for older Pixi and Propaganda 2 for Pixi v8. Assert XML parsing, bmode/amount/betlevel fields and checkwin transition where observed; use public catalogue launch to get fresh session.

- Stage launch URLs contain token/extsession/gamesession and should not be hardcoded from capture.
- pubdata is an opaque nested string in observed XML; no decoded game-outcome schema established.

| Juego / ID | URL pública o launcher | Evidencia / alcance |
|---|---|---|
| Cluster Kingdom / `10222` | https://www.elk-studios.com/games/cluster-kingdom/ | Observed HTML, launcher, init/purchase/checkwin |
| Pirots 5 / `10266` | https://www.elk-studios.com/games/pirots-5/ | Link in captured catalogue and observed launcher; init/purchase, no checkwin captured for this game |
| Propaganda 2 / `10276` | https://www.elk-studios.com/games/propaganda-2/ | Link in captured catalogue and observed launcher; init/purchase/checkwin |

#### Endpoints y esquemas de esta familia

Los endpoints se muestran sin valores de query. `{connectionId}` y `{actionId}` son plantillas. En JSON se conserva el catálogo completo de campos y los índices de entrada para comprobarlo contra el original.

| Método | Endpoint | Conteo en SHA únicos | Estado(s) | Formato real solicitud → respuesta |
|---|---|---:|---|---|
| POST | `https://gc5-stage.contentmedia.eu/capi/10222/play/init` | 2 | 200 | xml → xml |
| OPTIONS | `https://gc5-stage.contentmedia.eu/capi/10222/play/init` | 2 | 200 | empty → empty |
| POST | `https://gc5-stage.contentmedia.eu/capi/10222/play/purchase` | 4 | 200 | xml → xml |
| OPTIONS | `https://gc5-stage.contentmedia.eu/capi/10222/play/purchase` | 4 | 200 | empty → empty |
| POST | `https://gc5-stage.contentmedia.eu/capi/10222/play/checkwin` | 2 | 200 | xml → xml |
| OPTIONS | `https://gc5-stage.contentmedia.eu/capi/10222/play/checkwin` | 2 | 200 | empty → empty |
| POST | `https://gc5-stage.contentmedia.eu/capi/10266/play/init` | 2 | 200 | xml → xml |
| OPTIONS | `https://gc5-stage.contentmedia.eu/capi/10266/play/init` | 2 | 200 | empty → empty |
| POST | `https://gc5-stage.contentmedia.eu/capi/10266/play/purchase` | 1 | 200 | xml → xml |
| OPTIONS | `https://gc5-stage.contentmedia.eu/capi/10266/play/purchase` | 1 | 200 | empty → empty |
| POST | `https://gc5-stage.contentmedia.eu/capi/10276/play/init` | 1 | 200 | xml → xml |
| OPTIONS | `https://gc5-stage.contentmedia.eu/capi/10276/play/init` | 1 | 200 | empty → empty |
| POST | `https://gc5-stage.contentmedia.eu/capi/10276/play/purchase` | 1 | 200 | xml → xml |
| OPTIONS | `https://gc5-stage.contentmedia.eu/capi/10276/play/purchase` | 1 | 200 | empty → empty |
| POST | `https://gc5-stage.contentmedia.eu/capi/10276/play/checkwin` | 1 | 200 | xml → xml |
| OPTIONS | `https://gc5-stage.contentmedia.eu/capi/10276/play/checkwin` | 1 | 200 | empty → empty |

- `POST /capi/10222/play/init`: solicitud `/request`, `/request/@cur`, `/request/@desktopmode`, `/request/@extjur`, `/request/@extsession`, `/request/@lang`, `/request/@opid`, `/request/@screenres`.
- `POST /capi/10222/play/purchase`: solicitud `/request`, `/request/@amount`, `/request/@betdetails`, `/request/@betlevel`, `/request/@bmode`, `/request/@cur`, `/request/@gamesession`, `/request/@gamespeed`, `/request/@monetaryunit`, `/request/@orientation`, `/request/@pmode`, `/request/@sound`.
  Discriminadores observados: `/request/@bmode` = `DEF`; `/request/@pmode` = `click-s0`.
- `POST /capi/10222/play/checkwin`: solicitud `/request`, `/request/@gamesession`, `/request/@roundid`.
- `POST /capi/10266/play/init`: solicitud `/request`, `/request/@cur`, `/request/@desktopmode`, `/request/@extjur`, `/request/@extsession`, `/request/@lang`, `/request/@opid`, `/request/@screenres`.
- `POST /capi/10266/play/purchase`: solicitud `/request`, `/request/@amount`, `/request/@betdetails`, `/request/@betlevel`, `/request/@bmode`, `/request/@cur`, `/request/@gamesession`, `/request/@gamespeed`, `/request/@monetaryunit`, `/request/@orientation`, `/request/@pmode`, `/request/@sound`, `/request/@variant`.
  Discriminadores observados: `/request/@bmode` = `DEF`; `/request/@pmode` = `click-s0`.
- `POST /capi/10276/play/init`: solicitud `/request`, `/request/@cur`, `/request/@desktopmode`, `/request/@extjur`, `/request/@extsession`, `/request/@lang`, `/request/@opid`, `/request/@screenres`.
- `POST /capi/10276/play/purchase`: solicitud `/request`, `/request/@amount`, `/request/@betdetails`, `/request/@betlevel`, `/request/@bmode`, `/request/@cur`, `/request/@gamesession`, `/request/@gamespeed`, `/request/@monetaryunit`, `/request/@orientation`, `/request/@pmode`, `/request/@sound`.
  Discriminadores observados: `/request/@bmode` = `DEF`; `/request/@pmode` = `click-s0`.
- `POST /capi/10276/play/checkwin`: solicitud `/request`, `/request/@gamesession`, `/request/@roundid`.

### Games Global

**Motor:** PixiJS 7.2.4 (explicit bundle version).

- Game bundle contains PixiJS 7.2.4, eventMode, EventBoundary, EventSystem, DisplayObject and worldTransform.

**Protocolo observado:** POST /casino/play/public/v1/games/module/101789/client/50300/play JSON envelope. packet.payload contains XML <Pkt>, packetType request 7/response 8, observed isBase64Encoded=false. SignalR WSS also present.

**Cobertura:** 37 play requests include refresh, spin and free-spin continuation/selection traffic. Do not equate SignalR push messages with the observed HTTP wagering channel.

**Smoke propuesto:** Gold Blitz Ultimate. Validate JSON+XML nested decoding and separate HTTP play correlation from ancillary SignalR WS. Public /api/launch/GoldBlitzUltimate can initiate fresh demo launch.

- Launch chain contains credentials/tokens in query fields; never persist redirect URLs as fixtures.
- FreeSpinOption1 and FreeSpinOption3 are observed; total visible option count is unknown and full choice coverage is not established.

| Juego / ID | URL pública o launcher | Evidencia / alcance |
|---|---|---|
| Gold Blitz Ultimate / `goldBlitzUltimateDesktop` | https://www.gamesglobal.com/api/launch/GoldBlitzUltimate | Observed public launch API, game HTML title and play packets |

#### Endpoints y esquemas de esta familia

Los endpoints se muestran sin valores de query. `{connectionId}` y `{actionId}` son plantillas. En JSON se conserva el catálogo completo de campos y los índices de entrada para comprobarlo contra el original.

| Método | Endpoint | Conteo en SHA únicos | Estado(s) | Formato real solicitud → respuesta |
|---|---|---:|---|---|
| POST | `https://api32.gameassists.co.uk/casino/user/public/v1/accounts/login/demo` | 1 | 200 | json → json |
| OPTIONS | `https://api32.gameassists.co.uk/casino/user/public/v1/accounts/login/demo` | 1 | 200 | empty → empty |
| POST | `https://api32.gameassists.co.uk/Shared/Communications/Public/v1/accounts/authenticate` | 1 | 200 | json → json |
| POST | `https://api32.gameassists.co.uk/casino/play/public/v1/games/module/101789/client/50300/play` | 37 | 200 | json → json |
| OPTIONS | `https://api32.gameassists.co.uk/casino/play/public/v1/games/module/101789/client/50300/play` | 37 | 200 | empty → empty |
| GET | `https://api32.gameassists.co.uk/shared/push/v1/signalr/hub/signalr/negotiate` | 1 | 200 | empty → json |
| GET | `wss://api32.gameassists.co.uk/shared/push/v1/signalr/hub/signalr/connect` | 1 | 101 | empty → empty |
| GET | `https://api32.gameassists.co.uk/shared/push/v1/signalr/hub/signalr/start` | 1 | 200 | empty → json |
| GET | `https://api32.gameassists.co.uk/shared/push/v1/signalr/hub/signalr/ping` | 1 | 200 | empty → json |

- `POST /casino/user/public/v1/accounts/login/demo`: solicitud `$.context`, `$.context.clientId`, `$.context.intent`, `$.context.moduleId`, `$.deviceAttributes`, `$.deviceAttributes[]`, `$.deviceAttributes[].shortCode`, `$.deviceAttributes[].value`, `$.environment`, `$.environment.clientTypeId`, `$.environment.languageCode`, `$.numLaunchTokens`, `$.sessionProductId`.
- `POST /Shared/Communications/Public/v1/accounts/authenticate`: solicitud `$.launchToken`, `$.numberOfLaunchTokens`, `$.productId`.
- `POST /casino/play/public/v1/games/module/101789/client/50300/play`: solicitud `$.context`, `$.packet`, `$.packet.filter`, `$.packet.isBase64Encoded`, `$.packet.packetType`, `$.packet.payload`, `$.packet.payload::xml/Pkt`, `$.packet.payload::xml/Pkt/@version`, `$.packet.payload::xml/Pkt/Id`, `$.packet.payload::xml/Pkt/Id/@cid`, `$.packet.payload::xml/Pkt/Id/@mid`, `$.packet.payload::xml/Pkt/Id/@sid`, `$.packet.payload::xml/Pkt/Id/@verb`, `$.packet.payload::xml/Pkt/Request`, `$.packet.payload::xml/Pkt/Request/@abindex`, `$.packet.payload::xml/Pkt/Request/@action`, `$.packet.payload::xml/Pkt/Request/@denom`, `$.packet.payload::xml/Pkt/Request/@level`, `$.packet.payload::xml/Pkt/Request/@name`, `$.packet.payload::xml/Pkt/Request/@sideBet`, `$.packet.payload::xml/Pkt/Request/@verbex`, `$.packet.payload::xml/Pkt/Request/@wager`, `$.packet.useFilter`.
  Discriminadores observados: `$.packet.isBase64Encoded` = `false`; `$.packet.packetType` = `7`; `$.packet.payload::xml/Pkt/Id/@verb` = `AdvSlot`; `$.packet.payload::xml/Pkt/Request/@action` = `FreeSpin`, `FreeSpinOption1`, `FreeSpinOption3`, `PlayBonus1x3`, `PlayBonus1x4`, `PlayGuarantee`; `$.packet.payload::xml/Pkt/Request/@verbex` = `FreeSpin`, `Refresh`, `Spin`.

### Push Gaming

**Motor:** Renderer unconfirmed; createjs.LoadQueue is a preloader signal only.

- Bundles contain createjs.LoadQueue but no matching createjs.Stage or EaselJS signal. Do not classify renderer as CreateJS from this alone.
- Scene graph compatible symbols: InteractionManager, DisplayObject, RenderTexture, getBounds, getLocalBounds, hitArea, worldAlpha; runtime probe needed.

**Protocolo observado:** JSON REST: POST /api/sessions, /api/actions-v2, /api/actions-v2/buy-feature; PUT /api/actions-v2/{actionId}, /api/client-states; auth/config endpoints under /rgs/b2c/player/.

**Cobertura:** Diamonds and Regal spin responses 201; Regal buy-feature 201. Iron buy-feature and final Regal acknowledgement return 202 HTML. One Iron acknowledgement has status 0.

**Smoke propuesto:** Diamonds 4 The Win for a completed transport exchange, Regal Knights for buy-feature schema. Keep Iron Phoenix as a regression case for non-JSON/202 handling. Track actionComplete/endOfPlay rather than HTTP status alone.

- Success criteria must inspect content type, body shape and round flags; 202 HTML is not a verified successful feature.
- Dynamic numeric action IDs belong in redacted path templates, not fixed replay URLs.

| Juego / ID | URL pública o launcher | Evidencia / alcance |
|---|---|---|
| Diamonds 4 The Win / `diamonds4thewin-96` | https://www.pushgaming.com/games/play/diamonds-4-win.html | Observed public HTML, client title, actions-v2 spin and PUT acknowledgement |
| Regal Knights / `regalknights-96` | https://www.pushgaming.com/games/play/regal-knights.html | Observed public HTML, client title, spin and successful buy-feature 201; final PUT 202 HTML |
| Iron Phoenix / `ironphoenix-96` | https://www.pushgaming.com/games/play/iron-phoenix.html | Observed public HTML, client title and spin; buy-feature received 202 HTML, no successful purchase established |

#### Endpoints y esquemas de esta familia

Los endpoints se muestran sin valores de query. `{connectionId}` y `{actionId}` son plantillas. En JSON se conserva el catálogo completo de campos y los índices de entrada para comprobarlo contra el original.

| Método | Endpoint | Conteo en SHA únicos | Estado(s) | Formato real solicitud → respuesta |
|---|---|---:|---|---|
| POST | `https://player.eu.demo.pushgaming.com/rgs/b2c/player/authenticate/v1` | 3 | 200 | json → json |
| POST | `https://player.eu.demo.pushgaming.com/rgs/b2c/player/config/v1` | 3 | 200 | empty → json |
| POST | `https://player.eu.demo.pushgaming.com/hive/b2c/game/diamonds4thewin-96/api/sessions` | 1 | 201 | json → json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/diamonds4thewin-96/api/client-states` | 1 | 404 | empty → json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/diamonds4thewin-96/api/plays/latest` | 1 | 404 | empty → json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/diamonds4thewin-96/api/settings` | 1 | 200 | empty → json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/diamonds4thewin-96/api/player-leaderboard` | 1 | 404 | empty → json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/diamonds4thewin-96/api/plays/last` | 1 | 200 | empty → json |
| POST | `https://player.eu.demo.pushgaming.com/hive/b2c/game/diamonds4thewin-96/api/actions-v2` | 2 | 201 | json → json |
| PUT | `https://player.eu.demo.pushgaming.com/hive/b2c/game/diamonds4thewin-96/api/client-states` | 3 | 200 | json → empty |
| PUT | `https://player.eu.demo.pushgaming.com/hive/b2c/game/diamonds4thewin-96/api/actions-v2/{actionId}` | 1 | 200 | json → json |
| PUT | `https://player.eu.demo.pushgaming.com/hive/b2c/game/diamonds4thewin-96/api/player-leaderboard` | 1 | 200 | json → empty |
| POST | `https://player.eu.demo.pushgaming.com/hive/b2c/game/regalknights-96/api/sessions` | 2 | 201 | json → json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/regalknights-96/api/client-states` | 2 | 0, 404 | empty → empty, json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/regalknights-96/api/plays/latest` | 2 | 0, 404 | empty → empty, json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/regalknights-96/api/settings` | 2 | 0, 200 | empty → empty, json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/regalknights-96/api/player-leaderboard` | 2 | 0, 404 | empty → empty, json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/regalknights-96/api/plays/last` | 2 | 0, 200 | empty → empty, json |
| POST | `https://player.eu.demo.pushgaming.com/hive/b2c/game/regalknights-96/api/actions-v2` | 1 | 201 | json → json |
| PUT | `https://player.eu.demo.pushgaming.com/hive/b2c/game/regalknights-96/api/client-states` | 3 | 200 | json → empty |
| PUT | `https://player.eu.demo.pushgaming.com/hive/b2c/game/regalknights-96/api/actions-v2/{actionId}` | 2 | 200, 202 | json → empty, json |
| PUT | `https://player.eu.demo.pushgaming.com/hive/b2c/game/regalknights-96/api/player-leaderboard` | 1 | 200 | json → empty |
| POST | `https://player.eu.demo.pushgaming.com/hive/b2c/game/regalknights-96/api/actions-v2/buy-feature` | 1 | 201 | json → json |
| POST | `https://player.eu.demo.pushgaming.com/hive/b2c/game/ironphoenix-96/api/actions-v2` | 1 | 201 | json → json |
| PUT | `https://player.eu.demo.pushgaming.com/hive/b2c/game/ironphoenix-96/api/client-states` | 1 | 200 | json → empty |
| PUT | `https://player.eu.demo.pushgaming.com/hive/b2c/game/ironphoenix-96/api/actions-v2/{actionId}` | 1 | 0 | json → empty |
| POST | `https://player.eu.demo.pushgaming.com/hive/b2c/game/ironphoenix-96/api/sessions` | 1 | 201 | json → json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/ironphoenix-96/api/client-states` | 1 | 404 | empty → json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/ironphoenix-96/api/plays/latest` | 1 | 404 | empty → json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/ironphoenix-96/api/settings` | 1 | 200 | empty → json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/ironphoenix-96/api/player-leaderboard` | 1 | 404 | empty → json |
| GET | `https://player.eu.demo.pushgaming.com/hive/b2c/game/ironphoenix-96/api/plays/last` | 1 | 200 | empty → json |
| POST | `https://player.eu.demo.pushgaming.com/hive/b2c/game/ironphoenix-96/api/actions-v2/buy-feature` | 1 | 202 | json → empty |

- `POST /rgs/b2c/player/authenticate/v1`: solicitud `$.authToken`, `$.gameCode`, `$.guest`, `$.guestCurrencyCode`, `$.igpCode`, `$.integrationCode`, `$.jurisdiction`, `$.lang`, `$.lobbyUrl`, `$.mode`, `$.referrer`.
- `POST /hive/b2c/game/diamonds4thewin-96/api/sessions`: solicitud `$.authToken`, `$.currency`, `$.gameCode`, `$.igpCode`, `$.jurisdiction`, `$.lang`, `$.mode`, `$.sessionToken`, `$.type`.
  Discriminadores observados: `$.type` = `sessionTokenLogin`.
- `GET /hive/b2c/game/diamonds4thewin-96/api/client-states`: solicitud sin campos de cuerpo observados.
- `GET /hive/b2c/game/diamonds4thewin-96/api/plays/latest`: solicitud sin campos de cuerpo observados.
- `GET /hive/b2c/game/diamonds4thewin-96/api/settings`: solicitud sin campos de cuerpo observados.
- `GET /hive/b2c/game/diamonds4thewin-96/api/plays/last`: solicitud sin campos de cuerpo observados.
- `POST /hive/b2c/game/diamonds4thewin-96/api/actions-v2`: solicitud `$.action`, `$.bet`.
  Discriminadores observados: `$.action` = `spin`.
- `PUT /hive/b2c/game/diamonds4thewin-96/api/client-states`: solicitud `$.clientState`, `$.clientState.actionId`, `$.clientState.roundOver`, `$.clientState.spinIndex`, `$.clientState.type`.
  Discriminadores observados: `$.clientState.type` = `diamonds4thewin-96`.
- `PUT /hive/b2c/game/diamonds4thewin-96/api/actions-v2/{actionId}`: solicitud sin campos de cuerpo observados.
- `POST /hive/b2c/game/regalknights-96/api/sessions`: solicitud `$.authToken`, `$.currency`, `$.gameCode`, `$.igpCode`, `$.jurisdiction`, `$.lang`, `$.mode`, `$.sessionToken`, `$.type`.
  Discriminadores observados: `$.type` = `sessionTokenLogin`.
- `GET /hive/b2c/game/regalknights-96/api/client-states`: solicitud sin campos de cuerpo observados.
- `GET /hive/b2c/game/regalknights-96/api/plays/latest`: solicitud sin campos de cuerpo observados.
- `GET /hive/b2c/game/regalknights-96/api/settings`: solicitud sin campos de cuerpo observados.
- `GET /hive/b2c/game/regalknights-96/api/plays/last`: solicitud sin campos de cuerpo observados.
- `POST /hive/b2c/game/regalknights-96/api/actions-v2`: solicitud `$.action`, `$.bet`.
  Discriminadores observados: `$.action` = `spin`.
- `PUT /hive/b2c/game/regalknights-96/api/client-states`: solicitud `$.clientState`, `$.clientState.actionId`, `$.clientState.roundOver`, `$.clientState.spinIndex`, `$.clientState.type`.
  Discriminadores observados: `$.clientState.type` = `regalknights-96`.
- `PUT /hive/b2c/game/regalknights-96/api/actions-v2/{actionId}`: solicitud sin campos de cuerpo observados.
- `POST /hive/b2c/game/regalknights-96/api/actions-v2/buy-feature`: solicitud `$.bet`, `$.featureId`.
  Discriminadores observados: `$.featureId` = `push-bet`.
- `POST /hive/b2c/game/ironphoenix-96/api/actions-v2`: solicitud `$.action`, `$.bet`.
  Discriminadores observados: `$.action` = `spin`.
- `PUT /hive/b2c/game/ironphoenix-96/api/client-states`: solicitud `$.clientState`, `$.clientState.actionId`, `$.clientState.roundOver`, `$.clientState.spinIndex`, `$.clientState.type`.
  Discriminadores observados: `$.clientState.type` = `ironphoenix-96`.
- `PUT /hive/b2c/game/ironphoenix-96/api/actions-v2/{actionId}`: solicitud sin campos de cuerpo observados.
- `POST /hive/b2c/game/ironphoenix-96/api/sessions`: solicitud `$.authToken`, `$.currency`, `$.gameCode`, `$.igpCode`, `$.jurisdiction`, `$.lang`, `$.mode`, `$.sessionToken`, `$.type`.
  Discriminadores observados: `$.type` = `sessionTokenLogin`.
- `GET /hive/b2c/game/ironphoenix-96/api/client-states`: solicitud sin campos de cuerpo observados.
- `GET /hive/b2c/game/ironphoenix-96/api/plays/latest`: solicitud sin campos de cuerpo observados.
- `GET /hive/b2c/game/ironphoenix-96/api/settings`: solicitud sin campos de cuerpo observados.
- `GET /hive/b2c/game/ironphoenix-96/api/plays/last`: solicitud sin campos de cuerpo observados.
- `POST /hive/b2c/game/ironphoenix-96/api/actions-v2/buy-feature`: solicitud `$.bet`, `$.featureId`.
  Discriminadores observados: `$.featureId` = `push-bet`.

## Recomendaciones concretas para GitHub Actions

- Use synthetic sanitized HTTP/XML/JSON/WebSocket fixtures as required offline CI checks; do not commit the 1.19 GB source HAR corpus.
- Exercise seven provider cases and both Playtech clients; add separate old/new Pixi cases (ELK Cluster Kingdom and Propaganda 2).
- Run live provider smoke tests as manually triggered or scheduled jobs initially, with timeouts and one session per provider, and report external-blocked separately from product-failed.
- Start from the public page or session-free launcher each time, never captured redirect/session URLs. Record evidence without credentials or raw cookies.
- For engine probes, report confidence and evidence separately for loaded library, accessible global, scene root and discovered interactive objects.
- Capture HTTP bodies and WS text/binary frames natively, preserving direction/opcode/connection ID and request/response correlation; standard HAR is insufficient for Playtech.
- Content sniffing must cover JSON, XML, JSON containing XML, form-urlencoded and opaque Base64 envelopes regardless of MIME.
- Redaction must cover query strings, path IDs, nested JSON, XML attributes/elements and form fields before logs/artifacts leave the process.
- Read-only page/canvas/network readiness is a safe baseline live smoke. Any demo action coverage should be an explicit selectable test stage; never infer terminal round completion from 2xx alone.

## Límites de evidencia

- URLs were observed in captured traffic or public links; current reachability and GitHub-hosted runner access are untested.
- No source HAR contains exported WS frames; zero frames does not establish absence of WS activity.
- No screenshots or live runtime inspection were available; UI coordinates/control semantics are not verified.
- Unique-file totals include overlaps between cumulative captures; see capture_overlaps.
- Coverage is PARTIAL for every family: no complete action/choice/purchase matrix can be proven from these captures.

Las referencias de evidencia son el nombre exacto del HAR y el índice **base cero** de `log.entries`, conservados por endpoint y señal de motor en `har-findings.json`. Las URLs públicas se observaron en el HAR o en enlaces del HTML capturado; su disponibilidad actual y accesibilidad desde runners de GitHub no se han probado.

## CLI reproducible para nuevos HAR

El analizador usa Python 3.9 o posterior y únicamente la biblioteca estándar. Lee los `.har` de un directorio de forma secuencial, incluyendo subdirectorios; no altera los originales.

```bash
python3 scripts/analyze-hars.py --input /ruta/a/hars --output /ruta/a/resumen.json
```

La salida incluye SHA-256, duplicados exactos, conteos de HTTP/WS, endpoints sin query, rutas de conexión/acción parametrizadas y unión de esquemas sin valores de cuerpos. El CLI rechaza un destino `.har` o un destino que corresponda a uno de los originales. Los valores de headers/cookies y los cuerpos no se exportan.

El escaneo de esquema limita cada cuerpo a 1.000.000 de caracteres, profundidad JSON 7, profundidad XML 12 y 8 elementos por array. Los límites se incluyen en la salida; los cuerpos que los exceden quedan marcados `schema-scan-limit`. Los cuerpos opacos no se decodifican por inferencia. Una ausencia de frames en HAR se mantiene como límite de evidencia.

`test/fixtures/protocols.har` contiene 15 entradas sintéticas de las siete familias, con dominios `.example`; no contiene payloads copiados de los proveedores. `test/protocols.test.js` verifica preservación de actividad Firefox, redacción de formatos y paths, metadatos sin cuerpos, conteos WS, XML con MIME incorrecto, XML dentro de JSON, estados 202 con HTML y el CLI con archivos duplicados y protección de originales.
