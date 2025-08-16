// --- BRLdPayments.js ---

// --- Constantes para BRLd ---
const BRLd_ASSET_ID = 50000282;
const BRLd_DECIMALS = 10;
// --- Fin Constantes ---

// --- Funciones auxiliares exportables (buenas prácticas) ---

/**
 * Obtiene el balance de BRLd para una cuenta dada.
 * @param {ApiPromise} api - La instancia de la API de Polkadot.js conectada.
 * @param {string} accountAddress - La dirección de la cuenta.
 * @returns {Promise<number>} El balance de BRLd formateado, o 0 si hay error.
 */
export async function getBRLdBalance(api, accountAddress) {
    if (!api) {
        console.warn("getBRLdBalance: API no proporcionada.");
        return 0;
    }
    if (!accountAddress) {
        console.warn("getBRLdBalance: Dirección de cuenta no proporcionada.");
        return 0;
    }
    try {
        const assetAccountInfo = await api.query.assets.account(BRLd_ASSET_ID, accountAddress);
        if (assetAccountInfo.isSome) {
            const balance = assetAccountInfo.unwrap().balance;
            return Number(balance) / (10 ** BRLd_DECIMALS);
        }
        return 0; // La cuenta no tiene registros para este activo
    } catch (error) {
        console.error("Error obteniendo balance BRLd:", error);
        return 0;
    }
}

/**
 * Valida si una cuenta tiene suficiente saldo de BRLd.
 * @param {ApiPromise} api - La instancia de la API de Polkadot.js conectada.
 * @param {string} accountAddress - La dirección de la cuenta.
 * @param {number} requiredAmount - El monto requerido en BRLd.
 * @returns {Promise<{hasFunds: boolean, balance: number}>} 
 */
export async function hasSufficientBRLd(api, accountAddress, requiredAmount) {
    const balance = await getBRLdBalance(api, accountAddress);
    return {
        hasFunds: balance >= requiredAmount,
        balance: balance
    };
}

// --- Funciones principales de pago ---

/**
 * Función auxiliar para construir y enviar una transacción de pago en BRLd.
 * @param {ApiPromise} api - La instancia de la API.
 * @param {string} injector - El injector/signer de la billetera.
 * @param {string} fromAccount - La cuenta que envía.
 * @param {string} toAccount - La cuenta que recibe.
 * @param {number} amount - El monto en unidades enteras de BRLd (ej: 10.5).
 * @param {string} feeRecipientAddress - La dirección que recibe la tarifa del 1%.
 * @param {object} feeOptions - Opciones para el pago de tarifas (opcional).
 * @returns {Promise<string>} Un mensaje de resultado.
 */
async function sendBRLdBatchPayment(api, injector, fromAccount, toAccount, amount, feeRecipientAddress, feeOptions = {}, onStatusUpdate) {
    // 1. Validaciones iniciales
    if (!api) throw new Error("API no proporcionada a sendBRLdBatchPayment");
    if (!injector) throw new Error("Injector no proporcionado a sendBRLdBatchPayment");
    if (!fromAccount) throw new Error("Cuenta de origen no proporcionada a sendBRLdBatchPayment");
    if (!toAccount) throw new Error("Cuenta de destino no proporcionada a sendBRLdBatchPayment");
    if (typeof amount !== 'number' || amount <= 0) throw new Error("Monto inválido proporcionado a sendBRLdBatchPayment");
    if (!feeRecipientAddress) throw new Error("Dirección del destinatario de la tarifa no proporcionada a sendBRLdBatchPayment");

    // --- Notificar estado inicial si se proporciona el callback ---
    if (onStatusUpdate) {
        onStatusUpdate({ state: 'processing', message: '🔄 Procesando transacción...' });
    }
    // --- Fin notificación inicial ---

    // 2. Calcular los montos (99% destinatario, 1% fee)
    const recipientAmount = amount * 0.99;
    const feeAmount = amount * 0.01;

    // 3. Convertir a Plancks/ unidades atómicas (BRLd tiene 10 decimales)
    const recipientAmountPlancks = BigInt(Math.floor(recipientAmount * (10 ** BRLd_DECIMALS)));
    const feeAmountPlancks = BigInt(Math.floor(feeAmount * (10 ** BRLd_DECIMALS)));

    // 4. Crear las transacciones usando el pallet de assets
    const transferToRecipient = api.tx.assets.transfer(BRLd_ASSET_ID, toAccount, recipientAmountPlancks);
    const transferFeeToYou = api.tx.assets.transfer(BRLd_ASSET_ID, feeRecipientAddress, feeAmountPlancks);

    // 5. Agruparlas en un batch
    const batchTx = api.tx.utility.batchAll([transferToRecipient, transferFeeToYou]);

    // 6. Enviar la transacción y devolver la promesa para manejar el resultado
    return new Promise((resolve, reject) => {
        batchTx.signAndSend(fromAccount, { signer: injector, ...feeOptions }, async ({ status, events, dispatchError }) => {
            if (dispatchError) {
                const decoded = api.registry.findMetaError(dispatchError.asModule);
                const { documentation, name, section } = decoded;
                const errorMsg = `Error en pago BRLd (${section}.${name}): ${documentation.join(' ')}`;
                console.error(`❌ ${errorMsg}`);
                
                // --- Notificar error si se proporciona el callback ---
                if (onStatusUpdate) {
                    onStatusUpdate({ state: 'error', message: '❌ Error en la transacción.' });
                }
                // --- Fin notificación error ---
                
                reject(new Error(errorMsg));
                return;
            }

            // --- Manejo de estado isInBlock ---
            // Cambiamos la condición para manejar isInBlock por separado
            if (status.isInBlock) {
                // --- Notificar "Incluida en bloque" si se proporciona el callback ---
                if (onStatusUpdate) {
                    onStatusUpdate({ 
                        state: 'inBlock', 
                        message: '🔄 Incluida en bloque. Esperando confirmación final...' 
                    });
                }
                // --- Fin notificación isInBlock ---
                // No resolvemos aún, esperamos la finalización completa
                // Salir temprano para no continuar con el bloque isFinalized en esta iteración
                return; 
            }
            // --- Fin manejo de estado isInBlock ---

            // --- Manejo de estado isFinalized ---
            if (status.isFinalized) {
                const blockIdentifier = status.asFinalized;
                
                try {
                    const header = await api.rpc.chain.getHeader(blockIdentifier);
                    const blockNumber = header.number.toNumber();

                    // Buscar índice del extrinsic
                    let extrinsicIndex = null;
                    for (const { phase, event } of events) {
                        const { section, method } = event.toHuman ? event.toHuman() : event;
                        if (section === 'system' && method === 'ExtrinsicSuccess' && phase.isApplyExtrinsic) {
                            extrinsicIndex = phase.asApplyExtrinsic.toNumber();
                            break;
                        }
                    }

                    // Formatear mensaje
                    const mensajeMonto = amount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    // Ya no usamos status.isFinalized aquí porque este bloque solo se ejecuta si es true
                    let mensajeFinal = `Monto en BRLd: ${mensajeMonto}. Pago finalizado en bloque: ${blockNumber}`;
                    
                    if (extrinsicIndex !== null) {
                        // Limpiar espacios extra en la URL
                        const subscanLink = `https://assethub-polkadot.subscan.io/extrinsic/${blockNumber}-${extrinsicIndex}`;
                        const linkHTML = `<a href="${subscanLink}" target="_blank">Ver en Subscan</a>`;
                        mensajeFinal = `${mensajeFinal}, ${linkHTML}`;
                    }

                    console.log(`✅ Pago BRLd procesado: ${mensajeFinal}`);
                    
                    // La promesa se resuelve, lo cual indica éxito final. 
                    // El handler en script2.js puede usar esto para mostrar el estado final.
                    resolve(mensajeFinal);

                } catch (blockError) {
                    console.error("❌ No se pudo obtener información del bloque para BRLd:", blockError);
                    const mensajeMonto = amount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const mensajeFallback = `Monto en BRLd: ${mensajeMonto}. Pago confirmado, detalles del bloque no disponibles.`;
                    
                    resolve(mensajeFallback);
                }
            }
            // --- Fin manejo de estado isFinalized ---
        });
    });
}

/**
 * Realiza un pago rápido en BRLd.
 * @param {ApiPromise} api - La instancia de la API de Polkadot.js conectada.
 * @param {Function} getInjector - Función para obtener el injector de la billetera.
 * @param {string} selectedAccount - La dirección de la cuenta seleccionada.
 * @param {number} amountInBRLd - El monto a pagar en BRLd.
 * @param {string} recipientAddress - La dirección del destinatario.
 * @param {string} feeRecipientAddress - La dirección del destinatario de la tarifa (1%).
 */
export async function payAmountBRLd(api, getInjector, selectedAccount, amountInBRLd, recipientAddress, feeRecipientAddress, onStateUpdate) {
    try {
        // 1. Validaciones iniciales
        if (!api) {
            throw new Error("La API no está conectada.");
        }
        if (!selectedAccount) {
            throw new Error("No hay cuenta seleccionada.");
        }
        if (!getInjector || typeof getInjector !== 'function') {
            throw new Error("Función getInjector no válida.");
        }
        if (amountInBRLd <= 0) {
            throw new Error("El monto debe ser mayor a 0.");
        }
        if (!recipientAddress) {
            throw new Error("Dirección de destinatario no proporcionada.");
        }
        if (!feeRecipientAddress) {
            throw new Error("Dirección del destinatario de la tarifa no proporcionada.");
        }

        // 2. Confirmación del usuario
        const confirmMsg = `¿Estás seguro de pagar ${amountInBRLd.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BRLd?`;
        if (!confirm(confirmMsg)) return;

        // 3. Obtener injector (puede ser async)
        const injector = await getInjector();

        // 4. Ejecutar el pago (lógica compleja)
        const mensajeFinal = await sendBRLdBatchPayment(
        api,                // 1
        injector,           // 2
        selectedAccount,    // 3
        recipientAddress,   // 4 <- Debe ser una dirección válida
        amountInBRLd,       // 5 <- Debe ser un número
        feeRecipientAddress,//
        {},
        onStateUpdate
        );
        
        // 5. Mostrar resultado (delegamos esto al caller para mejor separación de concerns)
        return mensajeFinal;

    } catch (error) {
        console.error("🚨 Error en pago rápido BRLd (módulo refactorizado):", error);
        throw error; // Re-lanzamos para que el caller maneje la UI
    }
}

/**
 * Realiza un pago personalizado en BRLd.
 * @param {ApiPromise} api - La instancia de la API de Polkadot.js conectada.
 * @param {Function} getInjector - Función para obtener el injector de la billetera.
 * @param {string} selectedAccount - La dirección de la cuenta seleccionada.
 * @param {string} recipientAddress - La dirección del destinatario.
 * @param {string} feeRecipientAddress - La dirección del destinatario de la tarifa (1%).
 * @param {string} inputElementId - El ID del elemento input donde el usuario ingresa el monto.
 */
export async function payCustomAmountBRLd(api, getInjector, selectedAccount, recipientAddress, feeRecipientAddress, inputElementId = 'custom-amount-BRLd', onStatusUpdate) {
    try {
        // 1. Validaciones iniciales
        if (!api) {
            throw new Error("La API no está conectada.");
        }
        if (!selectedAccount) {
            throw new Error("No hay cuenta seleccionada.");
        }
        if (!getInjector || typeof getInjector !== 'function') {
            throw new Error("Función getInjector no válida.");
        }
        if (!recipientAddress) {
            throw new Error("Dirección de destinatario no proporcionada.");
        }
        if (!feeRecipientAddress) {
            throw new Error("Dirección del destinatario de la tarifa no proporcionada.");
        }

        // 2. Obtener y validar monto del input
        const input = document.getElementById(inputElementId);
        if (!input) {
            throw new Error(`Elemento input con ID '${inputElementId}' no encontrado.`);
        }
        
        const rawAmount = input.value.trim();
         console.log(`[payCustomAmountBRLd] Raw amount from input '${inputElementId}': '${rawAmount}' (type: ${typeof rawAmount})`);
        if (!rawAmount || isNaN(rawAmount)) {
            throw new Error("Ingresa un monto válido en BRLd.");
        }

        const amountInBRLd = parseFloat(rawAmount);
        console.log(`[payCustomAmountBRLd] Parsed amountInBRLd: ${amountInBRLd} (type: ${typeof amountInBRLd})`);
        if (amountInBRLd <= 0) {
            throw new Error("El monto en BRLd debe ser mayor a 0.");
        }

        // 3. Validación de saldo de BRLd (usando función auxiliar)
        const { hasFunds, balance } = await hasSufficientBRLd(api, selectedAccount, amountInBRLd);
        if (!hasFunds) {
            throw new Error(`Saldo insuficiente. Tu saldo es ${balance.toFixed(2)} BRLd.`);
        }

        // 4. Confirmación del usuario
        const confirmMsg = `¿Estás seguro de pagar ${amountInBRLd.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BRLd?`;
        if (!confirm(confirmMsg)) return;

        // 5. Obtener injector
        const injector = await getInjector();

        // 6. Ejecutar el pago
        const mensajeFinal = await sendBRLdBatchPayment(
        api, 
        injector, 
        selectedAccount, 
        recipientAddress, // <- 4to argumento
        amountInBRLd,     // <- 5to argumento
        feeRecipientAddress, // <- 6to argumento
        {},
        onStatusUpdate
    );
        
        // 7. Devolver resultado
        return mensajeFinal;

    } catch (error) {
        console.error("🚨 Error en pago personalizado BRLd (módulo refactorizado):", error);
        throw error; // Re-lanzamos para que el caller maneje la UI
    }
}

// --- Fin BRLdPayments.js ---