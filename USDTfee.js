// USDTfee.js
//pendiente de ajustar a codigo util


/**
 * Estima la tarifa de una transacción en USDT.
 * @param {ApiPromise} api - La instancia de la API de Polkadot.js conectada.
 * @param {string} selectedAccount - La dirección de la cuenta que pagará la tarifa.
 * @param {any} tx - La transacción (extrinsic) para la cual se quiere estimar la tarifa.
 * @param {Object} usdtFeeAssetId - La MultiLocation del USDT para pagar tarifas.
 * @returns {Promise<number|null>} La tarifa estimada en unidades legibles de USDT, o null si hay error.
 */
export async function estimateFeeInUSDT(api, selectedAccount, tx, usdtFeeAssetId) {
    if (!api) {
        console.warn("[estimateFeeInUSDT] API no proporcionada.");
        return null;
    }
    if (!selectedAccount) {
        console.warn("[estimateFeeInUSDT] Cuenta no proporcionada.");
        return null;
    }
    if (!tx) {
        console.warn("[estimateFeeInUSDT] Transacción no proporcionada.");
        return null;
    }
    if (!usdtFeeAssetId) {
        console.warn("[estimateFeeInUSDT] MultiLocation de USDT no proporcionada.");
        return null;
    }

    try {
    // Iniciando estimación de tarifa en USDT...
        
    // --- 1. Obtener el weight de la transacción (usando paymentInfo con assetId) ---
        const paymentInfo = await tx.paymentInfo(selectedAccount, { assetId: usdtFeeAssetId });
        const weight = paymentInfo.weight;
    // Weight obtenido

        // --- 2. Llamar al Runtime API XcmPaymentApi para convertir weight -> tarifa en USDT ---
    // Llamando a XcmPaymentApi.queryWeightToAssetFee (si está disponible)
        // Verificar que el API esté disponible
        if (api.call && api.call.xcmPaymentApi && api.call.xcmPaymentApi.queryWeightToAssetFee) {
            // La llamada al runtime api
            const feeInUSDTPlancksResult = await api.call.xcmPaymentApi.queryWeightToAssetFee(weight, usdtFeeAssetId);
            // Resultado RAW de la estimación (feeInUSDTPlancksResult)
            
            // --- 3. Extraer el valor numérico de la propiedad 'ok' ---
            let feeInUSDTPlancks;
            if (feeInUSDTPlancksResult.isOk) {
                feeInUSDTPlancks = feeInUSDTPlancksResult.asOk;
            } else if (feeInUSDTPlancksResult.ok !== undefined) {
                feeInUSDTPlancks = feeInUSDTPlancksResult.ok;
            } else {
                feeInUSDTPlancks = feeInUSDTPlancksResult;
            }
            // Tarifa en plancks extraída
            
            // --- 4. Convertir a unidades legibles de USDT (USDT tiene 6 decimales) ---
            const feeEstimateInUSDT = Number(feeInUSDTPlancks) / (10 ** 6);
            // Tarifa estimada en USDT: ${feeEstimateInUSDT.toFixed(6)}
            
            // --- 5. Devolver la tarifa estimada ---
            return feeEstimateInUSDT;
            // --- FIN 5. Devolver la tarifa estimada ---
        } else {
            console.warn("[estimateFeeInUSDT] XcmPaymentApi.queryWeightToAssetFee no disponible en esta API. Usando fallback.");
            // Opcional: usar un valor fijo muy pequeño o dejar feeEstimateInUSDT como null
            if (api.call) {
                console.warn("[estimateFeeInUSDT] Módulos disponibles en api.call:", Object.keys(api.call));
            }
            return null; // Asegurar que sea null si la API no está disponible
        }
    } catch (feeEstimateError) {
    console.error("[estimateFeeInUSDT] Error al estimar la tarifa en USDT:", feeEstimateError);
        // No detenemos el proceso, solo no mostramos la estimación precisa
        return null; // Asegurar que sea null en caso de error
    }
}

// --- NUEVA FUNCIÓN: Estimar tarifa para un batch de transferencias de BRLd ---
/**
 * Estima la tarifa de un batch de transferencias de BRLd en USDT.
 * @param {ApiPromise} api - La instancia de la API de Polkadot.js conectada.
 * @param {string} selectedAccount - La dirección de la cuenta que pagará la tarifa.
 * @param {string} toAccount - La dirección del destinatario principal.
 * @param {number} amountInBRLd - El monto total en BRLd.
 * @param {string} feeRecipientAddress - La dirección del destinatario de la tarifa (1%).
 * @param {Object} usdtFeeAssetId - La MultiLocation del USDT para pagar tarifas.
 * @param {number} BRLd_ASSET_ID - El ID del activo BRLd.
 * @param {number} BRLd_DECIMALS - Los decimales del activo BRLd.
 * @returns {Promise<number|null>} La tarifa estimada en unidades legibles de USDT, o null si hay error.
 */
export async function estimateBatchFeeInUSDT(
    api, 
    selectedAccount, 
    toAccount, 
    amountInBRLd, 
    feeRecipientAddress, 
    usdtFeeAssetId,
    BRLd_ASSET_ID,
    BRLd_DECIMALS
) {
    if (!api) {
        console.warn("[estimateBatchFeeInUSDT] API no proporcionada.");
        return null;
    }
    if (!selectedAccount) {
        console.warn("[estimateBatchFeeInUSDT] Cuenta no proporcionada.");
        return null;
    }
    if (!toAccount) {
        console.warn("[estimateBatchFeeInUSDT] Cuenta de destino no proporcionada.");
        return null;
    }
    if (typeof amountInBRLd !== 'number' || amountInBRLd <= 0) {
        console.warn("[estimateBatchFeeInUSDT] Monto inválido proporcionado.");
        return null;
    }
    if (!feeRecipientAddress) {
        console.warn("[estimateBatchFeeInUSDT] Dirección del destinatario de la tarifa no proporcionada.");
        return null;
    }
    if (!usdtFeeAssetId) {
        console.warn("[estimateBatchFeeInUSDT] MultiLocation de USDT no proporcionada.");
        return null;
    }
    if (typeof BRLd_ASSET_ID !== 'number' || BRLd_ASSET_ID <= 0) {
        console.warn("[estimateBatchFeeInUSDT] ID de activo BRLd inválido proporcionado.");
        return null;
    }
    if (typeof BRLd_DECIMALS !== 'number' || BRLd_DECIMALS < 0) {
        console.warn("[estimateBatchFeeInUSDT] Decimales de BRLd inválidos proporcionados.");
        return null;
    }

    try {
    // Iniciando estimación de tarifa en USDT para batch de BRLd...
        
        // --- 1. Calcular los montos (99% destinatario, 1% fee) ---
        const recipientAmount = amountInBRLd * 0.99;
        const feeAmount = amountInBRLd * 0.01;

        // --- 2. Convertir a Plancks/ unidades atómicas (BRLd tiene 10 decimales) ---
        const recipientAmountPlancks = BigInt(Math.floor(recipientAmount * (10 ** BRLd_DECIMALS)));
        const feeAmountPlancks = BigInt(Math.floor(feeAmount * (10 ** BRLd_DECIMALS)));

        // --- 3. Crear las transacciones usando el pallet de assets ---
        const transferToRecipient = api.tx.assets.transfer(BRLd_ASSET_ID, toAccount, recipientAmountPlancks);
        const transferFeeToYou = api.tx.assets.transfer(BRLd_ASSET_ID, feeRecipientAddress, feeAmountPlancks);

        // --- 4. Agruparlas en un batch ---
        const batchTx = api.tx.utility.batchAll([transferToRecipient, transferFeeToYou]);
        
        // --- 5. Estimar la tarifa usando la función existente ---
    const feeEstimateInUSDT = await estimateFeeInUSDT(api, selectedAccount, batchTx, usdtFeeAssetId);
        
        // --- 6. Devolver la tarifa estimada ---
        return feeEstimateInUSDT;
        // --- FIN 6. Devolver la tarifa estimada ---

    } catch (error) {
        console.error("[estimateBatchFeeInUSDT] Error al estimar la tarifa en USDT para batch de BRLd:", error);
        // No detenemos el proceso, solo no mostramos la estimación precisa
        return null; // Asegurar que sea null en caso de error
    }
}
// --- FIN NUEVA FUNCIÓN: Estimar tarifa para un batch de transferencias de BRLd ---