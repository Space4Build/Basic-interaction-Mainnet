# Web de Pagos Web3 — Documentación (ES / EN)

## Español

### Descripción
`Web de Pagos Web3` es una copia auditada y de pruebas de la aplicación de pagos (soporte BRLd, USDT, DOT) enfocada en la generación, visualización y compartición de códigos QR para transacciones.

### Objetivo
Proveer un entorno aislado para revisar, probar y mejorar la funcionalidad QR (visualización, descarga compuesta, copiar URL, compartir) sin alterar la aplicación principal.

### Contenido del directorio
- `index.html` — Interfaz de usuario para pruebas del flujo de pagos y visualización del QR.
- `script2.js` — Orquestador: handlers de pago (BRLd/USDT/DOT), construcción de `transactionData` y llamadas a `showTransactionQR`.
- `qr-generator.js` — Módulo encargado de generar el QR, mostrar/ocultar modal, copiar URL, compartir y descargar la imagen compuesta (QR + detalles).
- `BRLdPayments.js`, `usdtPayments.js` — Módulos por activo (mantener sin cambios a menos que sea para pruebas).
- `OPTIMIZACION_Y_MEJORAS.md` — Registro de cambios, optimizaciones aplicadas y pendientes.
- `backup/qr/` — Copia de seguridad del módulo QR original.

### Características principales
- Generación dinámica de QR (biblioteca `qrcode` importada dinámicamente).
- Modal con metadatos de la transacción: monto, moneda, remitente, destinatario, bloque, fecha/hora y enlace a Subscan (si disponible).
- Acciones: descargar imagen compuesta (QR + detalles), copiar URL, compartir (WhatsApp/Telegram y fallback Web Share API cuando esté disponible).
- Descarga compuesta: la imagen descargada incluye el QR y los metadatos de la transacción.

### Requisitos y ejecución
- Aplicación estática: abrir `index.html` en un navegador moderno (Chrome/Edge/Firefox).
- Para pruebas que involucren wallets y Subscan, usar un entorno con acceso a wallet y red correspondiente.
- Recomendación para desarrollo: servir archivos mediante un servidor local (`http`) para evitar restricciones ESM/CORS al abrir archivos locales.



### Notas técnicas y mejores prácticas
- No modificar el parseo de `mensajeFinal`/HTML que contiene el enlace a Subscan si necesitas reproducir resultados exactos; la integración actual preserva ese comportamiento.
- Todas las llamadas a `showTransactionQR(transactionData)` están envueltas en `try/catch` para evitar romper el flujo de pago.
- Mantener la API pública mínima de `qr-generator.js`: `showTransactionQR(transactionData)`, `hideTransactionQR()` y `testQRGeneration()`.

### Testing y verificación
- `testQRGeneration()` disponible para pruebas manuales desde la consola: `window.testQRGeneration()`.
- Pruebas recomendadas:
  - Flujo de pago completo BRLd/USDT/DOT; verificar que el modal QR aparece sólo después de finalizada la transacción.
  - Descargar la imagen compuesta y validar legibilidad en pantallas HiDPI.
  - Compartir vía WhatsApp/Telegram y probar fallback Web Share API.

### Problemas conocidos y pendientes
- Latencia en la importación dinámica de `qrcode` puede retrasar la primera generación; se recomienda precarga para producción.
- Imágenes descargadas pueden aparecer borrosas en pantallas retina si no se maneja `devicePixelRatio`. Hay una tarea priorizada para corregirlo (ver `OPTIMIZACION_Y_MEJORAS.md`).

### Contribución
- Para contribuir: crear una rama descriptiva (`feature/qr-...`), documentar cambios en `OPTIMIZACION_Y_MEJORAS.md` y detallar pasos de verificación en el PR.

### Licencia
- Mantener la licencia del repositorio principal. Documentar dependencias adicionales si se agregan.

---

## English

### Description
`Web3 payments web` is an audited/testing copy of the payments application (supports BRLd, USDT, DOT) focused on QR code generation, display and sharing for transactions.

### Purpose
Provide an isolated environment to review, test and improve QR functionality (display, composite download, copy URL, share) without affecting the main application.

### Directory contents
- `index.html` — UI for testing payment flows and QR display.
- `script2.js` — Orchestrator: payment handlers (BRLd/USDT/DOT), builds `transactionData` and triggers `showTransactionQR`.
- `qr-generator.js` — Module that generates the QR, shows/hides modal, copies URL, shares and downloads the composite image (QR + details).
- `BRLdPayments.js`, `usdtPayments.js` — Asset-specific payment modules (avoid changing unless for testing).
- `OPTIMIZACION_Y_MEJORAS.md` — Change log and pending improvements.
- `backup/qr/` — Backup of the original QR module.

### Key features
- Dynamic QR generation (the `qrcode` library is dynamically imported).
- Modal with transaction metadata: amount, currency, sender, recipient, block, timestamp and Subscan link (if available).
- Actions: download composite image (QR + details), copy URL, share (WhatsApp/Telegram and fallback to Web Share API when available).
- Composite download: downloaded image includes both the QR and transaction metadata.

### Requirements & running
- Static files — open `index.html` in a modern browser (Chrome/Edge/Firefox).
- For wallet/Subscan tests use an environment with wallet access and the correct network.
- For development, serve files via a local server (`http`) to avoid ESM/CORS restrictions when opening files locally.


### Technical notes & best practices
- Do not change the parsing of `mensajeFinal`/HTML containing the Subscan link if exact reproducibility is required — current integration preserves that behavior.
- All calls to `showTransactionQR(transactionData)` are wrapped in `try/catch` to avoid breaking the payment flow.
- If you modify `qr-generator.js`, keep the public API small: `showTransactionQR(transactionData)`, `hideTransactionQR()` and `testQRGeneration()`.

### Testing & verification
- `testQRGeneration()` is available for quick manual testing from the console: `window.testQRGeneration()`.
- Recommended tests:
  - Full payment flow for BRLd/USDT/DOT; verify QR modal appears only after transaction finalization.
  - Download the composite image and verify readability on HiDPI displays.
  - Share via WhatsApp/Telegram and test Web Share API fallback.

### Known issues & pending items
- Dynamic import latency of `qrcode` can delay the first QR render; optional preload is recommended for production.
- Downloaded images may appear blurry on retina displays unless `devicePixelRatio` is handled. There is a prioritized task to address this (see `OPTIMIZACION_Y_MEJORAS.md`).

### Contribution
- To contribute, create a descriptive branch (`feature/qr-...`), document changes in `OPTIMIZACION_Y_MEJORAS.md`, and include verification steps in your PR.

### License
- Keep the main repo license. Document any added dependencies in `package.json` or this README.

Last updated: 2025-12-11
