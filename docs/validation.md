# Validación de UMCP

## Estado

Implementación inicial en verificación. Este archivo se actualizará con el commit y los enlaces de GitHub Actions que correspondan a los resultados observados.

## Pruebas locales

Se usa Chromium 156.0.8078.4 correspondiente a Playwright 1.64.1. El ejecutor local requiere una ruta de navegador explícita; la CI instala la distribución fijada de Playwright.

Ya se verificó con Chromium real el flujo integrado de observación, screenshot reducido, click por coordenadas de imagen, navegación y rechazo de referencias viejas; HTTP/WS de texto/binario; y MCP initialize/list/tools/call/resources por stdio. La suite final debe pasar entera antes de registrar aprobación del núcleo.

El intento local contra Push Gaming encontró `ERR_CERT_AUTHORITY_INVALID` en la red del ejecutor y no llegó a cargar el juego. Esto se conserva como limitación del entorno, sin deshabilitar la validación TLS del MCP. La prueba de los proveedores se ejecutará también desde GitHub Actions.

## Criterios

- Núcleo: suite reproducible sin fallos ni omisiones y revisión de código.
- Proveedor: screenshot de canvas real, informe de controles y tráfico observado. Una página de catálogo, challenge, error TLS o sólo HTML no constituye un juego verificado.
- Semántica de interfaz: las escenas de prueba validan adaptadores; se reportará por separado lo observado en demos públicas. Ninguna corrida demuestra universalidad del detector.
- Red: los HAR originales no contienen frames WS; los frames se verifican mediante captura viva en el servidor de prueba y, si se obtiene acceso, las demos.
