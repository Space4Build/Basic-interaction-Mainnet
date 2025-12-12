// --- qr-generator.js ---
// Funciones auxiliares para generar códigos QR de transacciones
// Este archivo es independiente y no interfiere con la funcionalidad existente

// Función para cargar la librería QRCode dinámicamente
let QRCode = null;

async function loadQRCodeLibrary() {
    if (QRCode) return QRCode;
    
    try {
        console.log("[QR Generator] Cargando librería QRCode...");
        const module = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm');
        QRCode = module.default;
        console.log("[QR Generator] Librería QRCode cargada exitosamente");
        return QRCode;
    } catch (error) {
        console.error("[QR Generator] Error cargando QRCode:", error);
        return null;
    }
}

/**
 * Genera un código QR con los datos de la transacción
 * @param {Object} transactionData - Datos de la transacción
 * @param {string} transactionData.subscanUrl - URL de Subscan
 * @param {number} transactionData.blockNumber - Número de bloque
 * @param {number} transactionData.extrinsicIndex - Índice del extrinsic
 * @param {number} transactionData.amount - Monto de la transacción
 * @param {string} transactionData.currency - Tipo de moneda (DOT, USDT, BRLd)
 * @param {string} transactionData.timestamp - Timestamp de la transacción
 */
export async function generateTransactionQR(transactionData) {
    console.log("[QR Generator] Generando QR para transacción:", transactionData);
    
    try {
        // Cargar la librería QRCode dinámicamente
        const qrLib = await loadQRCodeLibrary();
        if (!qrLib) {
            console.error("[QR Generator] No se pudo cargar la librería QRCode");
            return false;
        }

        // Crear datos estructurados para el QR
        const qrData = {
            type: "transaction_verification",
            subscan_url: transactionData.subscanUrl,
            block_number: transactionData.blockNumber,
            extrinsic_index: transactionData.extrinsicIndex,
            amount: transactionData.amount.toString(),
            currency: transactionData.currency,
            timestamp: transactionData.timestamp || new Date().toISOString(),
            app_name: "Web de pagos Web3"
        };

        // Convertir a JSON string para el QR
        const qrString = JSON.stringify(qrData);
        console.log("[QR Generator] Datos del QR:", qrString);

        // Obtener el canvas
        const canvas = document.getElementById('qr-code');
        if (!canvas) {
            console.error("[QR Generator] Canvas QR no encontrado");
            return false;
        }

        // Generar el QR
        await qrLib.toCanvas(canvas, qrString, {
            width: 256,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            errorCorrectionLevel: 'M'
        });

        console.log("[QR Generator] QR generado exitosamente");
        return true;

    } catch (error) {
        console.error("[QR Generator] Error generando QR:", error);
        return false;
    }
}

/**
 * Muestra el contenedor del QR con los datos de la transacción
 * @param {Object} transactionData - Datos de la transacción
 */
export async function showTransactionQR(transactionData) {
    console.log("[QR Generator] Mostrando QR para transacción:", transactionData);
    
    try {
        // Generar el QR
        const qrGenerated = await generateTransactionQR(transactionData);
        
        if (!qrGenerated) {
            console.warn("[QR Generator] No se pudo generar el QR, ocultando contenedor");
            hideTransactionQR();
            return;
        }

        // Mostrar el contenedor
        const qrContainer = document.getElementById('qr-container');
        if (qrContainer) {
            qrContainer.style.display = 'block';
            
            // Mostrar detalles de la transacción
            displayTransactionDetails(transactionData);
            
            // Configurar botones de acción
            setupQRActionButtons(transactionData);
            
            // Configurar botón de cierre
            setupCloseButton();
            
            console.log("[QR Generator] Contenedor QR mostrado");
        }

    } catch (error) {
        console.error("[QR Generator] Error mostrando QR:", error);
        hideTransactionQR();
    }
}

/**
 * Oculta el contenedor del QR
 */
export function hideTransactionQR() {
    const qrContainer = document.getElementById('qr-container');
    if (qrContainer) {
        qrContainer.style.display = 'none';
        console.log("[QR Generator] Contenedor QR ocultado");
    }
}

/**
 * Configura los botones de acción del QR
 * @param {Object} transactionData - Datos de la transacción
 */
function setupQRActionButtons(transactionData) {
    // Botón de descarga
    const downloadBtn = document.getElementById('download-qr-btn');
    if (downloadBtn) {
        downloadBtn.style.display = 'inline-block';
        downloadBtn.onclick = () => downloadQRAsImage(transactionData);
    }

    // Botón de copiar URL
    const copyBtn = document.getElementById('copy-url-btn');
    if (copyBtn) {
        copyBtn.style.display = 'inline-block';
        copyBtn.onclick = () => copyURLToClipboard(transactionData.subscanUrl);
    }

    // Botón de compartir QR
    const shareBtn = document.getElementById('share-qr-btn');
    if (shareBtn) {
        shareBtn.style.display = 'inline-block';
        shareBtn.onclick = () => shareQR(transactionData);
    }
}

/**
 * Configura el botón de cierre del QR
 */
function setupCloseButton() {
    const closeBtn = document.getElementById('close-qr-btn');
    if (closeBtn) {
        // Remover cualquier listener anterior para evitar duplicados
        closeBtn.replaceWith(closeBtn.cloneNode(true));
        const newCloseBtn = document.getElementById('close-qr-btn');
        
        newCloseBtn.onclick = () => {
            console.log("[QR Generator] Cerrando QR por solicitud del usuario");
            hideTransactionQR();
        };
        
        // Agregar efecto hover
        newCloseBtn.addEventListener('mouseenter', () => {
            newCloseBtn.style.background = '#c82333';
            newCloseBtn.style.transform = 'scale(1.1)';
        });
        
        newCloseBtn.addEventListener('mouseleave', () => {
            newCloseBtn.style.background = '#dc3545';
            newCloseBtn.style.transform = 'scale(1)';
        });
        
        console.log("[QR Generator] Botón de cierre configurado");
    }
}

/**
 * Muestra los detalles de la transacción en el QR
 * @param {Object} transactionData - Datos de la transacción
 */
function displayTransactionDetails(transactionData) {
    try {
        console.log("[QR Generator] Mostrando detalles de transacción:", transactionData);
        
        // Formatear el monto con separadores de miles
        const formattedAmount = transactionData.amount.toLocaleString("es-ES", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        
        // Formatear la fecha
        const date = new Date(transactionData.timestamp);
        const formattedDate = date.toLocaleString("es-ES", {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        // Formatear direcciones (truncar para mejor visualización)
        const formatAddress = (address) => {
            if (!address) return 'N/A';
            return `${address.substring(0, 8)}...${address.slice(-8)}`;
        };
        
        // Actualizar elementos HTML
        const amountElement = document.getElementById('qr-amount');
        if (amountElement) {
            amountElement.textContent = `${formattedAmount} ${transactionData.currency}`;
        }
        
        const currencyElement = document.getElementById('qr-currency');
        if (currencyElement) {
            currencyElement.textContent = transactionData.currency;
        }
        
        const senderElement = document.getElementById('qr-sender');
        if (senderElement) {
            senderElement.textContent = formatAddress(transactionData.senderAddress);
            senderElement.title = transactionData.senderAddress; // Tooltip con dirección completa
        }
        
        const recipientElement = document.getElementById('qr-recipient');
        if (recipientElement) {
            recipientElement.textContent = formatAddress(transactionData.recipientAddress);
            recipientElement.title = transactionData.recipientAddress; // Tooltip con dirección completa
        }
        
        const timestampElement = document.getElementById('qr-timestamp');
        if (timestampElement) {
            timestampElement.textContent = formattedDate;
        }
        
        const blockElement = document.getElementById('qr-block');
        if (blockElement) {
            blockElement.textContent = transactionData.blockNumber ? `#${transactionData.blockNumber}` : 'N/A';
        }
        
        console.log("[QR Generator] Detalles de transacción mostrados exitosamente");
        
    } catch (error) {
        console.error("[QR Generator] Error mostrando detalles de transacción:", error);
    }
}

/**
 * Descarga el QR como imagen
 */
async function downloadQRAsImage(transactionData) {
    try {
        const qrCanvas = document.getElementById('qr-code');
        if (!qrCanvas) {
            console.error("[QR Generator] Canvas no encontrado para descarga");
            return;
        }

        // Parámetros de layout
        const qrSize = qrCanvas.width || 256;
        const padding = 20;
        const detailsWidth = 420;
        const width = padding + qrSize + padding + detailsWidth + padding;
        const height = Math.max(qrSize + padding * 2, 360);

        // Canvas offscreen para componer imagen
        const out = document.createElement('canvas');
        out.width = width;
        out.height = height;
        const ctx = out.getContext('2d');

        // Fondo y tarjeta
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#f8f9fa';
        const cardX = padding / 2;
        const cardY = padding / 2;
        const cardW = width - padding;
        const cardH = height - padding;
        // borde sutil
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cardX, cardY, cardW, cardH);
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 2;
        ctx.strokeRect(cardX, cardY, cardW, cardH);

        // Dibujar QR
        const qrX = padding + 10;
        const qrY = padding + 10;
        ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

        // Texto de detalles a la derecha del QR
        const textX = qrX + qrSize + 20;
        let textY = qrY + 24;
        ctx.fillStyle = '#222';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('Transacción Verificada', textX, textY);

        ctx.font = '14px Arial';
        textY += 30;

        const drawLabelValue = (label, value) => {
            ctx.fillStyle = '#666';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(label, textX, textY);
            ctx.fillStyle = '#111';
            ctx.font = '14px monospace';
            ctx.fillText(value, textX, textY + 18);
            textY += 40;
        };

        drawLabelValue('Monto:', `${Number(transactionData.amount).toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${transactionData.currency}`);
        drawLabelValue('Pagador:', transactionData.senderAddress || 'N/A');
        drawLabelValue('Destinatario:', transactionData.recipientAddress || 'N/A');
        drawLabelValue('Bloque:', transactionData.blockNumber ? `#${transactionData.blockNumber}` : 'N/A');
        drawLabelValue('Fecha:', transactionData.timestamp ? new Date(transactionData.timestamp).toLocaleString('es-ES') : 'N/A');

        // Subscan URL en la parte inferior
        const urlText = transactionData.subscanUrl || '';
        if (urlText) {
            ctx.fillStyle = '#007bff';
            ctx.font = '12px Arial';
            // ajustar ancho de línea simple
            const maxWidth = detailsWidth - 20;
            const words = urlText.split(' ');
            let line = '';
            for (let i = 0; i < words.length; i++) {
                const testLine = line + words[i] + ' ';
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && i > 0) {
                    ctx.fillText(line, textX, textY + 8);
                    line = words[i] + ' ';
                    textY += 18;
                } else {
                    line = testLine;
                }
            }
            if (line) ctx.fillText(line.trim(), textX, textY + 8);
        }

        // Descargar como PNG
        const link = document.createElement('a');
        link.download = `transaction-qr-${Date.now()}.png`;
        link.href = out.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('[QR Generator] Imagen compuesta descargada');

    } catch (error) {
        console.error('[QR Generator] Error descargando imagen compuesta:', error);
    }
}

/**
 * Crea un Blob PNG con la imagen compuesta (QR + detalles) sin descargarla.
 * @param {Object} transactionData
 * @returns {Promise<Blob>} Blob PNG
 */
async function createCompositeImageBlob(transactionData) {
    return new Promise((resolve, reject) => {
        try {
            const qrCanvas = document.getElementById('qr-code');
            if (!qrCanvas) {
                return reject(new Error('Canvas QR no encontrado'));
            }

            const qrSize = qrCanvas.width || 256;
            const padding = 20;
            const detailsWidth = 420;
            const width = padding + qrSize + padding + detailsWidth + padding;
            const height = Math.max(qrSize + padding * 2, 360);

            const out = document.createElement('canvas');
            out.width = width;
            out.height = height;
            const ctx = out.getContext('2d');

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#f8f9fa';
            const cardX = padding / 2;
            const cardY = padding / 2;
            const cardW = width - padding;
            const cardH = height - padding;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(cardX, cardY, cardW, cardH);
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 2;
            ctx.strokeRect(cardX, cardY, cardW, cardH);

            const qrX = padding + 10;
            const qrY = padding + 10;
            ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

            const textX = qrX + qrSize + 20;
            let textY = qrY + 24;
            ctx.fillStyle = '#222';
            ctx.font = 'bold 20px Arial';
            ctx.fillText('Transacción Verificada', textX, textY);

            ctx.font = '14px Arial';
            textY += 30;

            const drawLabelValue = (label, value) => {
                ctx.fillStyle = '#666';
                ctx.font = 'bold 12px Arial';
                ctx.fillText(label, textX, textY);
                ctx.fillStyle = '#111';
                ctx.font = '14px monospace';
                ctx.fillText(value, textX, textY + 18);
                textY += 40;
            };

            drawLabelValue('Monto:', `${Number(transactionData.amount).toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${transactionData.currency}`);
            drawLabelValue('Pagador:', transactionData.senderAddress || 'N/A');
            drawLabelValue('Destinatario:', transactionData.recipientAddress || 'N/A');
            drawLabelValue('Bloque:', transactionData.blockNumber ? `#${transactionData.blockNumber}` : 'N/A');
            drawLabelValue('Fecha:', transactionData.timestamp ? new Date(transactionData.timestamp).toLocaleString('es-ES') : 'N/A');

            const urlText = transactionData.subscanUrl || '';
            if (urlText) {
                ctx.fillStyle = '#007bff';
                ctx.font = '12px Arial';
                const maxWidth = detailsWidth - 20;
                const words = urlText.split(' ');
                let line = '';
                for (let i = 0; i < words.length; i++) {
                    const testLine = line + words[i] + ' ';
                    const metrics = ctx.measureText(testLine);
                    if (metrics.width > maxWidth && i > 0) {
                        ctx.fillText(line, textX, textY + 8);
                        line = words[i] + ' ';
                        textY += 18;
                    } else {
                        line = testLine;
                    }
                }
                if (line) ctx.fillText(line.trim(), textX, textY + 8);
            }

            out.toBlob((blob) => {
                if (!blob) return reject(new Error('No se generó blob')); 
                resolve(blob);
            }, 'image/png');

        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Copia la URL al portapapeles
 * @param {string} url - URL a copiar
 */
async function copyURLToClipboard(url) {
    try {
        await navigator.clipboard.writeText(url);
        console.log("[QR Generator] URL copiada al portapapeles:", url);
        
        // Mostrar feedback visual
        const copyBtn = document.getElementById('copy-url-btn');
        if (copyBtn) {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✅ Copiado!';
            copyBtn.style.background = '#28a745';
            
            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.background = '#28a745';
            }, 2000);
        }
    } catch (error) {
        console.error("[QR Generator] Error copiando URL:", error);
        
        // Fallback para navegadores que no soportan clipboard API
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        console.log("[QR Generator] URL copiada usando fallback");
    }
}

/**
 * Comparte el QR por WhatsApp y Telegram
 * @param {Object} transactionData - Datos de la transacción
 */
async function shareQR(transactionData) {
    try {
        console.log("[QR Generator] Iniciando proceso de compartir QR...");
        
        // Crear el texto del mensaje
        const message = createShareMessage(transactionData);
        
        // Mostrar opciones de compartir
        showShareOptions(message, transactionData);
        
    } catch (error) {
        console.error("[QR Generator] Error compartiendo QR:", error);
        alert("Error al compartir el QR. Intenta descargar la imagen manualmente.");
    }
}

/**
 * Crea el mensaje de texto para compartir
 * @param {Object} transactionData - Datos de la transacción
 * @returns {string} Mensaje formateado
 */
function createShareMessage(transactionData) {
    const formattedAmount = transactionData.amount.toLocaleString("es-ES", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    const date = new Date(transactionData.timestamp);
    const formattedDate = date.toLocaleString("es-ES", {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const message = `💳 *Transacción Confirmada*\n\n💰 *Monto:* ${formattedAmount} ${transactionData.currency}\n👤 *Pagador:* ${transactionData.senderAddress?.substring(0, 8)}...${transactionData.senderAddress?.slice(-8)}\n🎯 *Destinatario:* ${transactionData.recipientAddress?.substring(0, 8)}...${transactionData.recipientAddress?.slice(-8)}\n🔢 *Bloque:* #${transactionData.blockNumber}\n⏰ *Fecha:* ${formattedDate}\n\n📱 Escanea el código QR adjunto para verificar la transacción en Subscan:\n${transactionData.subscanUrl}\n\n#Web3 #Polkadot #TransacciónVerificada`;

    return message;
}

/**
 * Muestra las opciones de compartir
 * @param {string} message - Mensaje a compartir
 * @param {Object} transactionData - Datos de la transacción
 */
function showShareOptions(message, transactionData) {
    // Crear modal de opciones de compartir
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 12px;
        max-width: 400px;
        width: 90%;
        text-align: center;
    `;
    
    modalContent.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #333;">📤 Compartir QR de Transacción</h3>
        <p style="margin: 0 0 20px 0; color: #666; font-size: 14px;">
            Elige cómo quieres compartir el QR:
        </p>
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button id="share-native" style="padding: 10px 15px; background: #17a2b8; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; display: none;">
                🔗 Compartir nativo
            </button>
            <button id="share-whatsapp" style="padding: 10px 15px; background: #25D366; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">
                📱 WhatsApp
            </button>
            <button id="share-telegram" style="padding: 10px 15px; background: #0088cc; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">
                ✈️ Telegram
            </button>
            <button id="share-cancel" style="padding: 10px 15px; background: #6c757d; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">
                ❌ Cancelar
            </button>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Configurar eventos
    const nativeBtn = document.getElementById('share-native');
    const whatsappBtn = document.getElementById('share-whatsapp');
    const telegramBtn = document.getElementById('share-telegram');

    // Mostrar botón nativo si el navegador soporta navigator.share (mejor oportunidad de adjuntar imagen+texto)
    if (navigator.share) {
        nativeBtn.style.display = 'inline-block';
    }

    nativeBtn.onclick = async () => {
        try {
            // Intentar compartir la imagen compuesta + texto
            const blob = await createCompositeImageBlob(transactionData);
            const file = new File([blob], `transaction-qr-${Date.now()}.png`, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], text: message, title: 'Transacción verificada' });
            } else if (navigator.share) {
                // Intentar compartir al menos el texto+url
                await navigator.share({ text: message, title: 'Transacción verificada', url: transactionData.subscanUrl || undefined });
            }
        } catch (err) {
            console.warn('[QR Generator] Compartir nativo falló, se usará fallback:', err);
            alert('No fue posible compartir de forma nativa en este dispositivo. Se abrirán las opciones web.');
        } finally {
            document.body.removeChild(modal);
        }
    };

    whatsappBtn.onclick = () => {
        shareToWhatsApp(message, transactionData);
        document.body.removeChild(modal);
    };
    
    telegramBtn.onclick = () => {
        shareToTelegram(message, transactionData);
        document.body.removeChild(modal);
    };
    
    document.getElementById('share-cancel').onclick = () => {
        document.body.removeChild(modal);
    };
    
    // Cerrar al hacer clic fuera del modal
    modal.onclick = (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    };
}

/**
 * Comparte por WhatsApp
 * @param {string} message - Mensaje a compartir
 * @param {Object} transactionData - Datos de la transacción
 */
async function shareToWhatsApp(message, transactionData) {
    try {
        console.log("[QR Generator] Compartiendo por WhatsApp...");
        // Intentar enviar imagen y texto usando Web Share API con archivos (si está soportado)
        try {
            const blob = await createCompositeImageBlob(transactionData);
            const file = new File([blob], `transaction-qr-${Date.now()}.png`, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
                await navigator.share({ files: [file], text: message, title: 'Transacción verificada' });
                return;
            }

            // Si no se puede compartir archivos, intentar copiar la imagen al portapapeles y luego abrir el deep link/web
            try {
                if (navigator.clipboard && window.ClipboardItem) {
                    await navigator.clipboard.write([new ClipboardItem({ ['image/png']: blob })]);
                    // Abrir deep link para WhatsApp (app) o web como fallback
                    const whatsappAppUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
                    const whatsappWebUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
                    // Intentar app
                    window.location.href = whatsappAppUrl;
                    setTimeout(() => {
                        window.open(whatsappWebUrl, '_blank');
                        alert('Imagen copiada al portapapeles. Pega la imagen en el chat de WhatsApp (mantén presionado y pega).');
                    }, 900);
                    return;
                }
            } catch (clipErr) {
                console.warn('[QR Generator] No fue posible copiar imagen al portapapeles:', clipErr);
            }

            // Último recurso: abrir enlace web y guiar al usuario a adjuntar la imagen manualmente
            const whatsappWebUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
            window.open(whatsappWebUrl, '_blank');
            alert('No fue posible adjuntar la imagen automáticamente. Descarga el QR y adjúntalo manualmente.');

        } catch (err) {
            console.warn('[QR Generator] Falló intento de compartir imagen, cayendo a comportamiento previo:', err);
            // Comportamiento previo: abrir WhatsApp Web
            const encodedMessage = encodeURIComponent(message);
            const whatsappUrl = `https://web.whatsapp.com/send?text=${encodedMessage}`;
            window.open(whatsappUrl, '_blank');
            setTimeout(() => {
                alert(`📱 WhatsApp Web abierto!\n\n1. Adjunta la imagen del QR (descarga primero si es necesario)\n2. Envía el mensaje\n\n💡 Tip: Puedes descargar el QR con el botón "Descargar QR"`);
            }, 1000);
        }
    } catch (error) {
        console.error("[QR Generator] Error compartiendo por WhatsApp:", error);
        alert("Error al abrir WhatsApp. Intenta copiar el mensaje manualmente.");
    }
}

/**
 * Comparte por Telegram
 * @param {string} message - Mensaje a compartir
 * @param {Object} transactionData - Datos de la transacción
 */
async function shareToTelegram(message, transactionData) {
    try {
        console.log("[QR Generator] Compartiendo por Telegram...");
        // Intentar enviar imagen y texto usando Web Share API con archivos (si está soportado)
        try {
            const blob = await createCompositeImageBlob(transactionData);
            const file = new File([blob], `transaction-qr-${Date.now()}.png`, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
                await navigator.share({ files: [file], text: message, title: 'Transacción verificada' });
                return;
            }

            // Intentar copiar imagen al portapapeles y luego abrir app/web
            try {
                if (navigator.clipboard && window.ClipboardItem) {
                    await navigator.clipboard.write([new ClipboardItem({ ['image/png']: blob })]);
                    const telegramAppUrl = `tg://msg?text=${encodeURIComponent(message)}`;
                    const telegramWebUrl = `https://t.me/share/url?url=${encodeURIComponent(transactionData.subscanUrl || '')}&text=${encodeURIComponent(message)}`;
                    window.location.href = telegramAppUrl;
                    setTimeout(() => {
                        window.open(telegramWebUrl, '_blank');
                        alert('Imagen copiada al portapapeles. Pega la imagen en el chat de Telegram (mantén presionado y pega).');
                    }, 900);
                    return;
                }
            } catch (clipErr) {
                console.warn('[QR Generator] No fue posible copiar imagen al portapapeles:', clipErr);
            }

            // Fallback: abrir Telegram Web
            const encodedMessage = encodeURIComponent(message);
            const telegramWebUrl = `https://t.me/share/url?url=${encodeURIComponent(transactionData.subscanUrl || '')}&text=${encodedMessage}`;
            window.open(telegramWebUrl, '_blank');
            alert('No fue posible adjuntar la imagen automáticamente. Descarga el QR y adjúntalo manualmente.');

        } catch (err) {
            console.warn('[QR Generator] Falló intento de compartir imagen en Telegram, usando web:', err);
            const encodedMessage = encodeURIComponent(message);
            const telegramUrl = `https://t.me/share/url=${encodeURIComponent(transactionData.subscanUrl)}&text=${encodedMessage}`;
            window.open(telegramUrl, '_blank');
            setTimeout(() => {
                alert(`✈️ Telegram Web abierto!\n\n1. Descarga el QR con el botón "Descargar QR"\n2. Adjunta la imagen del QR al mensaje\n3. Agrega manualmente: ${transactionData.subscanUrl}\n4. Envía el mensaje\n\n💡 El mensaje ya está pre-escrito sin duplicar la URL`);
            }, 1000);
        }
        
    } catch (error) {
        console.error("[QR Generator] Error compartiendo por Telegram:", error);
        alert("Error al abrir Telegram. Intenta copiar el mensaje manualmente.");
    }
}

/**
 * Función de prueba para verificar que el QR funciona
 * Esta función se puede llamar desde la consola del navegador para testing
 */
export function testQRGeneration() {
    console.log("[QR Generator] Iniciando prueba de generación QR...");
    
    const testData = {
        subscanUrl: "https://assethub-polkadot.subscan.io/extrinsic/123456-0",
        blockNumber: 123456,
        extrinsicIndex: 0,
        amount: 10.50,
        currency: "BRLd",
        senderAddress: "13uHe9HLv3MAahwFhyepq4yNKysonAzePFLUhgvZNPZp4N5b",
        recipientAddress: "13uHe9HLv3MAahwFhyepq4yNKysonAzePFLUhgvZNPZp4N5b",
        timestamp: new Date().toISOString()
    };
    
    return showTransactionQR(testData);
}

// Hacer la función de prueba disponible globalmente para testing
if (typeof window !== 'undefined') {
    window.testQRGeneration = testQRGeneration;
}

// --- Fin qr-generator.js ---
