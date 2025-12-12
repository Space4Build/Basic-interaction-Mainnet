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
    if (!api) {
        console.warn("hasSufficientBRLd: API no proporcionada.");
        return { hasFunds: false, balance: 0 };
    }
    if (!accountAddress) {
        console.warn("hasSufficientBRLd: Dirección de cuenta no proporcionada.");
        return { hasFunds: false, balance: 0 };
    }
    if (typeof requiredAmount !== 'number' || requiredAmount < 0) {
        console.warn("hasSufficientBRLd: Monto requerido inválido.");
        return { hasFunds: false, balance: 0 };
    }

    try {
        const assetAccountInfo = await api.query.assets.account(BRLd_ASSET_ID, accountAddress);
        if (assetAccountInfo.isSome) {
            const balance = assetAccountInfo.unwrap().balance;
            const formattedBalance = Number(balance) / (10 ** BRLd_DECIMALS);
            return {
                hasFunds: formattedBalance >= requiredAmount,
                balance: formattedBalance
            };
        }
        return { hasFunds: false, balance: 0 }; // La cuenta no tiene registros para este activo
    } catch (error) {
        console.error("Error obteniendo balance BRLd:", error);
        // No alertamos aquí para no interrumpir el flujo, solo logueamos
        return { hasFunds: false, balance: 0 };
    }
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
async function sendBRLdBatchPayment(api, injector, fromAccount, toAccount, amount, feeRecipientAddress, feeOptions = {}, onStatusUpdate, usdtFeeAssetId) {
    // --- 1. Validaciones iniciales ---

    if (!api) throw new Error("API no proporcionada a sendBRLdBatchPayment");
    if (!injector) throw new Error("Injector no proporcionado a sendBRLdBatchPayment");
    if (!fromAccount) throw new Error("Cuenta de origen no proporcionada a sendBRLdBatchPayment");
    if (!toAccount) throw new Error("Cuenta de destino no proporcionada a sendBRLdBatchPayment");
    if (typeof amount !== 'number' || amount <= 0) throw new Error("Monto inválido proporcionado a sendBRLdBatchPayment");
    if (!feeRecipientAddress) throw new Error("Dirección del destinatario de la tarifa no proporcionada a sendBRLdBatchPayment");
    // --- Fin 1. Validaciones iniciales ---

    // --- 2. Calcular los montos (99% destinatario, 1% fee) ---
    const recipientAmount = amount * 0.99;
    const feeAmount = amount * 0.01;

    // Convertir a Plancks/ unidades atómicas (BRLd tiene 10 decimales)
    const recipientAmountPlancks = BigInt(Math.floor(recipientAmount * (10 ** BRLd_DECIMALS)));
    const feeAmountPlancks = BigInt(Math.floor(feeAmount * (10 ** BRLd_DECIMALS)));
    // --- Fin 2. Calcular los montos ---

    // --- 3. Crear las transacciones usando el pallet de assets ---
    const transferToRecipient = api.tx.assets.transfer(BRLd_ASSET_ID, toAccount, recipientAmountPlancks);
    const transferFeeToYou = api.tx.assets.transfer(BRLd_ASSET_ID, feeRecipientAddress, feeAmountPlancks);

    // Agruparlas en un batch
    const batchTx = api.tx.utility.batchAll([transferToRecipient, transferFeeToYou]);
    // --- Fin 3. Crear las transacciones ---

    // --- 4. Notificar estado inicial si se proporciona el callback ---
    if (onStatusUpdate) {
        onStatusUpdate({ state: 'processing', message: '🔄 Procesando transacción...' });
    }
    // --- Fin 4. Notificar estado inicial ---

    // --- 5. Enviar la transacción y devolver la promesa para manejar el resultado ---

    return new Promise((resolve, reject) => {
        // Preparar las opciones para signAndSend
        const signAndSendOptions = { signer: injector, ...feeOptions };
        // Si se proporcionó usdtFeeAssetId, añadirlo a las opciones para pagar tarifas con USDT
        if (usdtFeeAssetId) {
            signAndSendOptions.assetId = usdtFeeAssetId;
        }

        batchTx.signAndSend(fromAccount, signAndSendOptions, async ({ status, events, dispatchError }) => {
            if (dispatchError) {
                // --- Notificar error si se proporciona el callback ---
                if (onStatusUpdate) {
                    onStatusUpdate({ state: 'error', message: '❌ Error en la transacción.' });
                }
                // --- Fin notificación error ---

                const decoded = api.registry.findMetaError(dispatchError.asModule);
                const { documentation, name, section } = decoded;
                const errorMsg = `Error en pago BRLd (${section}.${name}): ${documentation.join(' ')}`;
                console.error(`❌ ${errorMsg}`);
                reject(new Error(errorMsg));
                return;
            }

            if (status.isInBlock) {
                // --- Notificar "Incluida en bloque" si se proporciona el callback ---
                if (onStatusUpdate) {
                    onStatusUpdate({
                        state: 'inBlock',
                        message: '🔄 Incluida en bloque. Esperando confirmación final...'
                    });
                }
                // --- Fin notificación isInBlock ---

                if (!status.isFinalized) {
                    return;
                }
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
                    const mensajeMonto = amount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });


                    let mensajeFinal = `Monto en BRLd: ${mensajeMonto}. Pago finalizado en bloque: ${blockNumber}`;

                    if (extrinsicIndex !== null) {
                        // Limpiar espacios extra en la URL
                        const subscanLink = `https://assethub-polkadot.subscan.io/extrinsic/${blockNumber}-${extrinsicIndex}`;
                        const linkHTML = `<a href="${subscanLink}" target="_blank">Ver en Subscan</a>`;
                        mensajeFinal = `${mensajeFinal}, ${linkHTML}`;
                    }

                    console.log(`✅ Pago BRLd procesado: ${mensajeFinal}`);

                    resolve(mensajeFinal);

                } catch (blockError) {
                    console.error("❌ No se pudo obtener información del bloque para BRLd:", blockError);
                    const mensajeMonto = amount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const mensajeFallback = `Monto en BRLd: ${mensajeMonto}. Pago confirmado, detalles del bloque no disponibles.`;

                    resolve(mensajeFallback);
                }
            }
        }).catch((error) => {
            console.error("❌ Error en firma/envío BRLd (posible cancelación):", error);

            // Si es cancelación de wallet, actualizar estado
            if (error.message && error.message.includes("Cancelled")) {
                if (onStatusUpdate) {
                    onStatusUpdate({ state: 'error', message: '❌ Transacción cancelada.' });
                }
            } else {
                if (onStatusUpdate) {
                    onStatusUpdate({ state: 'error', message: '❌ Error en el envío.' });
                }
            }
            reject(error);
        });
    });
    // --- Fin 5. Enviar la transacción ---
}
// --- Fin sendBRLdBatchPayment ---


/**
 * Realiza un pago rápido en BRLd.
 * @param {ApiPromise} api - La instancia de la API de Polkadot.js conectada.
 * @param {Function} getInjector - Función para obtener el injector de la billetera.
 * @param {string} selectedAccount - La dirección de la cuenta seleccionada.
 * @param {number} amountInBRLd - El monto a pagar en BRLd.
 * @param {string} recipientAddress - La dirección del destinatario.
 * @param {string} feeRecipientAddress - La dirección del destinatario de la tarifa (1%).
 */
export async function payAmountBRLd(api, getInjector, selectedAccount, amountInBRLd, recipientAddress, feeRecipientAddress, onStatusUpdate, usdtFeeAssetId) {
    // Inicio del flujo de pago BRLd
    //let feeEstimateInUSDT = null; // Variable para almacenar la estimación

    try {
        // --- 1. Validaciones iniciales ---
        // Validaciones iniciales
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
        // Validaciones completadas
        // --- Fin 1. Validaciones iniciales ---

        // --- 2. Calcular los montos (99% destinatario, 1% fee) ---

        const recipientAmount = amountInBRLd * 0.99;
        const feeAmount = amountInBRLd * 0.01;

        // Convertir a Plancks/ unidades atómicas (BRLd tiene 10 decimales)
        const recipientAmountPlancks = BigInt(Math.floor(recipientAmount * (10 ** BRLd_DECIMALS)));
        const feeAmountPlancks = BigInt(Math.floor(feeAmount * (10 ** BRLd_DECIMALS)));
        // Montos convertidos a plancks
        // --- Fin 2. Calcular los montos ---

        // --- 3. Crear las transacciones usando el pallet de assets ---
        const transferToRecipient = api.tx.assets.transfer(BRLd_ASSET_ID, recipientAddress, recipientAmountPlancks);
        const transferFeeToYou = api.tx.assets.transfer(BRLd_ASSET_ID, feeRecipientAddress, feeAmountPlancks);
        // Transacciones creadas

        // Agruparlas en un batch
        const batchTx = api.tx.utility.batchAll([transferToRecipient, transferFeeToYou]);
        // Batch creado
        // --- Fin 3. Crear las transacciones ---

        // --- 4. ESTIMAR la tarifa en USDT usando XcmPaymentApi (SOLO si se proporciona usdtFeeAssetId) ---
        /*       if (usdtFeeAssetId) {
                    try {
                        // Iniciar estimación de tarifa en USDT (código comentado)
                        // a. Obtener el weight de la transacción (usando paymentInfo con assetId)
                        const paymentInfo = await batchTx.paymentInfo(selectedAccount);
                        const weight = paymentInfo.weight;
        
                        // b. Llamar al Runtime API XcmPaymentApi para convertir weight -> tarifa en USDT
                        // Verificar que el API esté disponible
                        if (api.call && api.call.xcmPaymentApi && typeof api.call.xcmPaymentApi.queryWeightToAssetFee === 'function') {
                            const feeInUSDTPlancksResult = await api.call.xcmPaymentApi.queryWeightToAssetFee(weight, usdtFeeAssetId);
                            // c. Extraer el valor numérico de la propiedad 'ok'
                            let feeInUSDTPlancks;
                            if (feeInUSDTPlancksResult.isOk) {
                                feeInUSDTPlancks = feeInUSDTPlancksResult.asOk;
                            } else if (feeInUSDTPlancksResult.ok !== undefined) {
                                feeInUSDTPlancks = feeInUSDTPlancksResult.ok;
                            } else {
                                feeInUSDTPlancks = feeInUSDTPlancksResult;
                            }
                            // d. Convertir a unidades legibles de USDT (USDT tiene 6 decimales)
                            feeEstimateInUSDT = Number(feeInUSDTPlancks) / (10 ** 6);
        
                            const { hasFunds: hasUSDTFunds, balance: usdtBalance } = await hasSufficientUSDT(api, selectedAccount, feeEstimateInUSDT);
                            if (!hasUSDTFunds) {
                                throw new Error(`Saldo insuficiente de USDT para pagar tarifas. Necesitas al menos ${feeEstimateInUSDT.toFixed(6)} USDT, pero tu saldo es ${usdtBalance.toFixed(6)} USDT.`);
                            }
                        } else {
                            console.warn("[payAmountBRLd] XcmPaymentApi.queryWeightToAssetFee no disponible en esta API. Usando fallback.");
                            if (api.call) {
                                console.warn("[payAmountBRLd] Módulos disponibles en api.call:", Object.keys(api.call));
                            }
                            feeEstimateInUSDT = null;
                        }
                    } catch (feeEstimateError) {
                        console.error("[payAmountBRLd] Error al estimar la tarifa en USDT:", feeEstimateError);
                        feeEstimateInUSDT = null;
                    }
                }*/
        // --- Fin 4. ESTIMAR la tarifa en USDT ---

        // --- 5. Confirmación del usuario ---
        let confirmMsg = `¿Estás seguro de pagar ${amountInBRLd.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BRLd?`;
        /*        if (feeEstimateInUSDT !== null) {
                     confirmMsg += `\n\nTarifa estimada: ${feeEstimateInUSDT.toFixed(6)} USDT.`;
                } else if (usdtFeeAssetId) {
                    // Si se intentó estimar pero falló
                    confirmMsg += `\n\n(Tarifa en USDT: No disponible para estimación, se cobrará de todas formas)`;
                }
        */
        if (!confirm(confirmMsg)) {
            // Si el usuario cancela, retornar null (no es un error)
            return null;
        }
        // --- Fin 5. Confirmación del usuario ---

        // --- 6. Obtener injector (puede ser async) ---
        const injector = await getInjector();

        // --- Fin 6. Obtener injector ---

        // --- 7. Ejecutar el pago (lógica compleja) - PASANDO el assetId ---
        // Enviando batch de pago BRLd

        const mensajeFinal = await sendBRLdBatchPayment(
            api,                // 1
            injector,           // 2
            selectedAccount,    // 3
            recipientAddress,   // 4 <- Debe ser una dirección válida
            amountInBRLd,       // 5 <- Debe ser un número
            feeRecipientAddress,// 6 <- Debe ser una dirección válida
            {},                 // 7 - feeOptions (objeto vacío)
            onStatusUpdate,     // 8 - Callback de estado
            usdtFeeAssetId      // 9 - PASAR el assetId para pagar tarifas con USDT 
        );
        // sendBRLdBatchPayment completado

        // --- 8. Devolver tanto el mensaje como la estimación de tarifa ---
        return { mensajeFinal/*, feeEstimateInUSDT*/ };
        // --- Fin 8. Devolver tanto el mensaje como la estimación de tarifa ---

    } catch (error) {
        console.error("🚨 Error en pago rápido BRLd (módulo refactorizado):", error);

        // Si es cancelación de wallet, actualizar estado antes de lanzar
        if (error.message && error.message.includes("Cancelled")) {
            if (onStatusUpdate) {
                onStatusUpdate({ state: 'error', message: '❌ Transacción cancelada.' });
            }
        }

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
export async function payCustomAmountBRLd(api, getInjector, selectedAccount, recipientAddress, feeRecipientAddress, inputElementId = 'custom-amount-BRLd', onStatusUpdate, usdtFeeAssetId = null) {
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
        if (!rawAmount || isNaN(rawAmount)) {
            throw new Error("Ingresa un monto válido en BRLd.");
        }

        const amountInBRLd = parseFloat(rawAmount);
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
            onStatusUpdate,
            usdtFeeAssetId
        );

        // 7. Devolver resultado
        return mensajeFinal;

    } catch (error) {
        console.error("🚨 Error en pago personalizado BRLd (módulo refactorizado):", error);

        // Si es cancelación de wallet, actualizar estado antes de lanzar
        if (error.message && error.message.includes("Cancelled")) {
            if (onStatusUpdate) {
                onStatusUpdate({ state: 'error', message: '❌ Transacción cancelada.' });
            }
        }

        throw error; // Re-lanzamos para que el caller maneje la UI
    }
}

// --- Fin BRLdPayments.js ---
