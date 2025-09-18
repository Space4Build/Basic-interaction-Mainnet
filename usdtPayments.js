// --- usdtPayments.js ---

// --- Constantes para USDT ---
const USDT_ASSET_ID = 1984;
const USDT_DECIMALS = 6;
// --- Fin Constantes ---

// --- Funciones auxiliares exportables (buenas prácticas) ---

/**
 * Obtiene el balance de USDT para una cuenta dada.
 * @param {ApiPromise} api - La instancia de la API de Polkadot.js conectada.
 * @param {string} accountAddress - La dirección de la cuenta.
 * @returns {Promise<number>} El balance de USDT formateado, o 0 si hay error.
 */
export async function getUSDTBalance(api, accountAddress) {
    if (!api) {
        console.warn("getUSDTBalance: API no proporcionada.");
        return 0;
    }
    if (!accountAddress) {
        console.warn("getUSDTBalance: Dirección de cuenta no proporcionada.");
        return 0;
    }
    try {
        const assetAccountInfo = await api.query.assets.account(USDT_ASSET_ID, accountAddress);
        if (assetAccountInfo.isSome) {
            const balance = assetAccountInfo.unwrap().balance;
            return Number(balance) / (10 ** USDT_DECIMALS);
        }
        return 0; // La cuenta no tiene registros para este activo
    } catch (error) {
        console.error("Error obteniendo balance USDT:", error);
        return 0;
    }
}

/**
 * Valida si una cuenta tiene suficiente saldo de USDT.
 * @param {ApiPromise} api - La instancia de la API de Polkadot.js conectada.
 * @param {string} accountAddress - La dirección de la cuenta.
 * @param {number} requiredAmount - El monto requerido en USDT.
 * @returns {Promise<{hasFunds: boolean, balance: number}>} 
 */
export async function hasSufficientUSDT(api, accountAddress, requiredAmount) {
    const balance = await getUSDTBalance(api, accountAddress);
    return {
        hasFunds: balance >= requiredAmount,
        balance: balance
    };
}

// --- Funciones principales de pago ---

/**
 * Función auxiliar para construir y enviar una transacción de pago en USDT.
 * @param {ApiPromise} api - La instancia de la API.
 * @param {string} injector - El injector/signer de la billetera.
 * @param {string} fromAccount - La cuenta que envía.
 * @param {string} toAccount - La cuenta que recibe.
 * @param {number} amount - El monto en unidades enteras de USDT (ej: 10.5).
 * @param {string} feeRecipientAddress - La dirección que recibe la tarifa del 1%.
 * @param {object} feeOptions - Opciones para el pago de tarifas (opcional).
 * @returns {Promise<string>} Un mensaje de resultado.
 */
async function sendUSDTBatchPayment(api, injector, fromAccount, toAccount, amount, feeRecipientAddress, feeOptions = {}, onStatusUpdate) {
    // 1. Validaciones iniciales
    if (!api) throw new Error("API no proporcionada a sendUSDTBatchPayment");
    if (!injector) throw new Error("Injector no proporcionado a sendUSDTBatchPayment");
    if (!fromAccount) throw new Error("Cuenta de origen no proporcionada a sendUSDTBatchPayment");
    if (!toAccount) throw new Error("Cuenta de destino no proporcionada a sendUSDTBatchPayment");
    if (typeof amount !== 'number' || amount <= 0) throw new Error("Monto inválido proporcionado a sendUSDTBatchPayment");
    if (!feeRecipientAddress) throw new Error("Dirección del destinatario de la tarifa no proporcionada a sendUSDTBatchPayment");

    // --- Notificar estado inicial si se proporciona el callback ---
    if (onStatusUpdate) {
        onStatusUpdate({ state: 'processing', message: '🔄 Procesando transacción...' });
    }
    // --- Fin notificación inicial ---

    // 2. Calcular los montos (99% destinatario, 1% fee)
    const recipientAmount = amount * 0.99;
    const feeAmount = amount * 0.01;

    // 3. Convertir a Plancks/ unidades atómicas (USDT tiene 6 decimales)
    const recipientAmountPlancks = BigInt(Math.floor(recipientAmount * (10 ** USDT_DECIMALS)));
    const feeAmountPlancks = BigInt(Math.floor(feeAmount * (10 ** USDT_DECIMALS)));

    // 4. Crear las transacciones usando el pallet de assets
    const transferToRecipient = api.tx.assets.transfer(USDT_ASSET_ID, toAccount, recipientAmountPlancks);
    const transferFeeToYou = api.tx.assets.transfer(USDT_ASSET_ID, feeRecipientAddress, feeAmountPlancks);

    // 5. Agruparlas en un batch
    const batchTx = api.tx.utility.batchAll([transferToRecipient, transferFeeToYou]);

    // 6. Enviar la transacción y devolver la promesa para manejar el resultado
    return new Promise((resolve, reject) => {
        batchTx.signAndSend(fromAccount, { signer: injector, ...feeOptions }, async ({ status, events, dispatchError }) => {
            if (dispatchError) {
                const decoded = api.registry.findMetaError(dispatchError.asModule);
                const { documentation, name, section } = decoded;
                const errorMsg = `Error en pago USDT (${section}.${name}): ${documentation.join(' ')}`;
                console.error(`❌ ${errorMsg}`);

                // --- Notificar error si se proporciona el callback ---
                if (onStatusUpdate) {
                    onStatusUpdate({ state: 'error', message: '❌ Error en la transacción.' });
                }
                // --- Fin notificación error ---

                reject(new Error(errorMsg));
                return;
            }

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
                    const mensajeMonto = amount.toLocaleString("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
                    
                    let mensajeFinal = `Monto en USDT: ${mensajeMonto}. Pago finalizado en bloque: ${blockNumber}`;
                    
                    if (extrinsicIndex !== null) {
                        // Asegurarse de que la URL esté limpia
                        const subscanLink = `https://assethub-polkadot.subscan.io/extrinsic/${blockNumber}-${extrinsicIndex}`; // Corregido
                        const linkHTML = `<a href="${subscanLink}" target="_blank">Ver en Subscan</a>`;
                        mensajeFinal = `${mensajeFinal}, ${linkHTML}`;
                    }

                    console.log(`✅ Pago USDT procesado: ${mensajeFinal}`);
                    resolve(mensajeFinal);

                } catch (blockError) {
                    console.error("❌ No se pudo obtener información del bloque para USDT:", blockError);
                    const mensajeMonto = amount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const mensajeFallback = `Monto en USDT: ${mensajeMonto}. Pago procesado, detalles del bloque no disponibles.`;
                    resolve(mensajeFallback);
                }
            }
        });
    });
}

/**
 * Realiza un pago rápido en USDT.
 * @param {ApiPromise} api - La instancia de la API de Polkadot.js conectada.
 * @param {Function} getInjector - Función para obtener el injector de la billetera.
 * @param {string} selectedAccount - La dirección de la cuenta seleccionada.
 * @param {number} amountInUSDT - El monto a pagar en USDT.
 * @param {string} recipientAddress - La dirección del destinatario.
 * @param {string} feeRecipientAddress - La dirección del destinatario de la tarifa (1%).
 */
export async function payAmountUSDT(api, getInjector, selectedAccount, amountInUSDT, recipientAddress, feeRecipientAddress, onStateUpdate) {
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
        if (amountInUSDT <= 0) {
            throw new Error("El monto debe ser mayor a 0.");
        }
        if (!recipientAddress) {
            throw new Error("Dirección de destinatario no proporcionada.");
        }
        if (!feeRecipientAddress) {
            throw new Error("Dirección del destinatario de la tarifa no proporcionada.");
        }

        // 2. Confirmación del usuario
        const confirmMsg = `¿Estás seguro de pagar ${amountInUSDT.toLocaleString("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} USDT?`;
        if (!confirm(confirmMsg)) return;

        // 3. Obtener injector (puede ser async)
        const injector = await getInjector();

        // 4. Ejecutar el pago (lógica compleja)
        const mensajeFinal = await sendUSDTBatchPayment(
        api,                // 1
        injector,           // 2
        selectedAccount,    // 3
        recipientAddress,   // 4 <- Debe ser una dirección válida
        amountInUSDT,       // 5 <- Debe ser un número
        feeRecipientAddress,//
        {},
        onStateUpdate
        );
        
        // 5. Mostrar resultado (delegamos esto al caller para mejor separación de concerns)
        return mensajeFinal;

    } catch (error) {
        console.error("🚨 Error en pago rápido USDT (módulo refactorizado):", error);
        throw error; // Re-lanzamos para que el caller maneje la UI
    }
}

/**
 * Realiza un pago personalizado en USDT.
 * @param {ApiPromise} api - La instancia de la API de Polkadot.js conectada.
 * @param {Function} getInjector - Función para obtener el injector de la billetera.
 * @param {string} selectedAccount - La dirección de la cuenta seleccionada.
 * @param {string} recipientAddress - La dirección del destinatario.
 * @param {string} feeRecipientAddress - La dirección del destinatario de la tarifa (1%).
 * @param {string} inputElementId - El ID del elemento input donde el usuario ingresa el monto.
 */
export async function payCustomAmountUSDT(api, getInjector, selectedAccount, recipientAddress, feeRecipientAddress, inputElementId = 'custom-amount-usdt', onStatusUpdate) {
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
         console.log(`[payCustomAmountUSDT] Raw amount from input '${inputElementId}': '${rawAmount}' (type: ${typeof rawAmount})`);
        if (!rawAmount || isNaN(rawAmount)) {
            throw new Error("Ingresa un monto válido en USDT.");
        }

        const amountInUSDT = parseFloat(rawAmount);
        console.log(`[payCustomAmountUSDT] Parsed amountInUSDT: ${amountInUSDT} (type: ${typeof amountInUSDT})`);
        if (amountInUSDT <= 0) {
            throw new Error("El monto en USDT debe ser mayor a 0.");
        }

        // 3. Validación de saldo de USDT (usando función auxiliar)
        const { hasFunds, balance } = await hasSufficientUSDT(api, selectedAccount, amountInUSDT);
        if (!hasFunds) {
            throw new Error(`Saldo insuficiente. Tu saldo es ${balance.toFixed(2)} USDT.`);
        }

        // 4. Confirmación del usuario
        const confirmMsg = `¿Estás seguro de pagar ${amountInUSDT.toLocaleString("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} USDT?`;
        if (!confirm(confirmMsg)) return;

        // 5. Obtener injector
        const injector = await getInjector();

        // 6. Ejecutar el pago
        const mensajeFinal = await sendUSDTBatchPayment(
        api, 
        injector, 
        selectedAccount, 
        recipientAddress, // <- 4to argumento
        amountInUSDT,     // <- 5to argumento
        feeRecipientAddress, // <- 6to argumento
        {},
        onStatusUpdate 
    );
        
        // 7. Devolver resultado
        return mensajeFinal;

    } catch (error) {
        console.error("🚨 Error en pago personalizado USDT (módulo refactorizado):", error);
        throw error; // Re-lanzamos para que el caller maneje la UI
    }
}

// --- Fin usdtPayments.js ---
