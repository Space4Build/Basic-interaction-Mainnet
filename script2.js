//importaciones
import {
    payAmountUSDT,
    payCustomAmountUSDT
} from './usdtPayments.js';

import {
    payAmountBRLd,
    payCustomAmountBRLd
} from './BRLdPayments.js';

import { showTransactionQR } from './qr-generator.js';

// Variables globales
let api = null;
let selectedAccount = null;

// Variables específicas para SubWallet
let subWalletProvider = null;
let selectedSubWalletAccount = null;

const FEE_RECIPIENT_ADDRESS = "13wh3NcEFqcJ8scMxwDBRGZumRCRsuCPsEvb8XqMm5Di9aD1";
const USDT_RECIPIENT_ADDRESS = "13uHe9HLv3MAahwFhyepq4yNKysonAzePFLUhgvZNPZp4N5b";
const BRLd_RECIPIENT_ADDRESS = "13uHe9HLv3MAahwFhyepq4yNKysonAzePFLUhgvZNPZp4N5b";
// Asset constants
const USDT_ASSET_ID = 1984;
const USDT_DECIMALS = 6;
const BRLd_ASSET_ID = 50000282;
const BRLd_DECIMALS = 10;

// Función para detectar si SubWallet está disponible
function isSubWalletAvailable() {
    return window.injectedWeb3 && window.injectedWeb3['subwallet-js'];
}

// Conectar con Polkadot.js
async function connectWallet() {
    if (!window.injectedWeb3 || !window.injectedWeb3["polkadot-js"]) {
        alert("❌ No se encontró la extensión Polkadot.js. Asegúrate de instalarla y recargar la página.");
        return;
    }
    try {
        // extensión detectada - procediendo a conectar
        const polkadotJs = window.injectedWeb3["polkadot-js"];
        const provider = await polkadotJs.enable("MiDApp");
        // billetera habilitada - obteniendo cuentas
        const accounts = await provider.accounts.get();
        if (accounts.length === 0) {
            alert("⚠️ No se encontraron cuentas en la billetera. Asegúrate de estar conectado.");
            return;
        }
        await connectToNode();
        const accountsDropdown = document.getElementById("accounts");
        accountsDropdown.innerHTML = ""; // Limpiar opciones
        accounts.forEach((acc) => {
            let option = document.createElement("option");
            option.value = acc.address;
            const formattedAddress = formatAddressForCurrentChain(acc.address, true); // true para truncar
            option.text = `${acc.name || "Cuenta"} - ${formattedAddress}`;
            option.dataset.source = "polkadot-js";
            accountsDropdown.appendChild(option);
        });
        selectedAccount = accounts[0].address;
        selectedSubWalletAccount = null;
        // billetera conectada con éxito
        document.getElementById("connect-btn").style.display = "none";
        document.getElementById("connect-subwallet-btn").style.display = "none";
        document.getElementById("disconnect-btn").style.display = "inline-block";

        await updateAllBalances();
        await subscribeBlockNumber();
        await getNodeInfo();
    } catch (error) {
        console.error("❌ Error conectando la billetera:", error);
    }
}

// Conectar con SubWallet
async function connectSubWallet() {
    if (!isSubWalletAvailable()) {
        alert("❌ No se encontró SubWallet. Asegúrate de tener la extensión o app instalada.");
        return;
    }
    try {
        subWalletProvider = await window.injectedWeb3['subwallet-js'].enable("MiDApp");
        const accounts = await subWalletProvider.accounts.get();
        if (accounts.length === 0) {
            alert("⚠️ No se encontraron cuentas en SubWallet.");
            return;
        }

        await connectToNode();
        const accountsDropdown = document.getElementById("accounts");
        accountsDropdown.innerHTML = ""; // Limpiar opciones
        accounts.forEach((acc) => {
            let option = document.createElement("option");
            option.value = acc.address;
            const formattedAddress = formatAddressForCurrentChain(acc.address, true); // true para truncar
            option.text = `${acc.name || "Cuenta"} - ${formattedAddress}`;
            option.dataset.source = "subwallet-js";
            accountsDropdown.appendChild(option);
        });
        selectedSubWalletAccount = accounts[0].address;
        selectedAccount = selectedSubWalletAccount;
        // cuentas cargadas en SubWallet
        document.getElementById("connect-btn").style.display = "none";
        document.getElementById("connect-subwallet-btn").style.display = "none";
        document.getElementById("disconnect-btn").style.display = "inline-block";

        await updateAllBalances();
        await subscribeBlockNumber();
        await getNodeInfo();
    } catch (error) {
        console.error("❌ Error al conectar con SubWallet:", error);
        alert("Error al conectar con SubWallet. Verifica tu conexión.");
    }
}

// --- Función para formatear direcciones al formato de Paseo ---
function formatAddressForCurrentChain(address, truncate = false) {
    if (!address) return 'N/A';
    // Verificar que la API esté conectada y tenga chainSS58
    if (!api || !api.registry || api.registry.chainSS58 === undefined) {
        // Si no está disponible, devolver la dirección original
        return truncate ? `${address.substring(0, 6)}...${address.slice(-4)}` : address;
    }

    // formato de dirección: utilizar api.registry.chainSS58 si está disponible

    try {
        // 1. Decodifica la dirección a su representación binaria
        const decoded = window.decodeAddress(address);
        // 2. Obtiene el prefijo SS58 de la cadena conectada (Paseo)
        const ss58Format = api.registry.chainSS58;
        // dirección formateada usando ss58Format
        // 3. Codifica la dirección al formato específico de Paseo
        const formatted = window.encodeAddress(decoded, ss58Format);
        return truncate ? `${formatted.substring(0, 6)}...${formatted.slice(-4)}` : formatted;
    } catch (e) {
        console.error(`Error al formatear la dirección ${address}:`, e);
        // Si hay un error, devolver la dirección original
        return truncate ? `${address.substring(0, 6)}...${address.slice(-4)}` : address;
    }
}

// Desconectar ambas wallets
async function disconnectWallet() {
    // desconectando billetera

    // --- AJUSTE 1: Intentar revocar permisos de SubWallet ---
    try {
        if (subWalletProvider && typeof subWalletProvider.disable === 'function') {
            await subWalletProvider.disable();
        }
    } catch (error) {
        console.warn("No se pudo revocar permisos de SubWallet:", error);
    }
    // --- FIN AJUSTE 1 ---

    // --- AJUSTE 2: Limpiar también el estado de pago (con verificación) ---
    const payStatusElement = document.getElementById("pay-status");
    if (payStatusElement) {
        payStatusElement.innerText = "";
        payStatusElement.style.display = "none";
    }
    // --- FIN AJUSTE 2 ---

    // --- Código existente (limpieza de UI) con verificaciones ---
    const accountsElement = document.getElementById("accounts");
    if (accountsElement) accountsElement.innerHTML = "";

    // --- CORRECCIÓN CLAVE: Limpiar los nuevos elementos de balance ---
    const balanceDotElement = document.getElementById("balance-dot");
    if (balanceDotElement) balanceDotElement.innerText = "DOT: -";

    const balanceUsdtElement = document.getElementById("balance-usdt");
    if (balanceUsdtElement) balanceUsdtElement.innerText = "USDT: -";

    const balanceBRLdElement = document.getElementById("balance-BRLd");
    if (balanceBRLdElement) balanceBRLdElement.innerText = "BRLd: -";
    // --- FIN CORRECCIÓN ---

    selectedAccount = null;
    selectedSubWalletAccount = null;
    subWalletProvider = null; // AJUSTE 3: Limpiar el provider
    api = null;

    // Continuar con la verificación de los demás elementos...
    const blockNumberElement = document.getElementById("block-number");
    if (blockNumberElement) blockNumberElement.innerText = "Bloque actual: N/A";

    const payResultElement = document.getElementById("pay-result");
    if (payResultElement) payResultElement.innerText = "";

    const nodeInfoElement = document.getElementById("node-info");
    if (nodeInfoElement) nodeInfoElement.innerText = "N/A";

    // billetera desconectada

    // Actualizar visibilidad de botones (con verificación)
    const connectBtn = document.getElementById("connect-btn");
    if (connectBtn) connectBtn.style.display = "inline-block";

    const connectSubwalletBtn = document.getElementById("connect-subwallet-btn");
    if (connectSubwalletBtn) connectSubwalletBtn.style.display = "inline-block";

    const disconnectBtn = document.getElementById("disconnect-btn");
    if (disconnectBtn) disconnectBtn.style.display = "none";
    // --- Fin código existente ---
}

// Conectar al nodo Asset Hub
async function connectToNode() {
    try {
        // conectando al nodo de Asset Hub
        if (!window.ApiPromise || !window.WsProvider) {
            console.error("❌ La API de Polkadot.js no se ha cargado correctamente.");
            return;
        }
        const NODE_URL = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
        const { ApiPromise, WsProvider } = window;
        const provider = new WsProvider(NODE_URL);
        api = await ApiPromise.create({ provider });
        await api.isReady;
        // conectado al nodo de Asset Hub
    } catch (error) {
        console.error("❌ Error conectando al nodo de Asset Hub:", error);
    }
}

// Función específica para actualizar ambos balances
async function updateAllBalances() {
    // Actualizar DOT
    await updateBalance("DOT");
    // Actualizar USDT
    await updateBalance("USDT");
    // Actualizar BRLd
    await updateBalance("BRLd");
}

// Función updateBalance modificada para usar los nuevos elementos
async function updateBalance(assetType = "DOT") {
    if (!api || !selectedAccount) return;

    // Determinar qué elemento actualizar y qué sufijo usar para los logs
    let elementId, assetSuffix;
    if (assetType === "DOT") {
        elementId = "balance-dot";
        assetSuffix = "DOT";
    } else if (assetType === "USDT") {
        elementId = "balance-usdt";
        assetSuffix = "USDT";
    } else if (assetType === "BRLd") {
        elementId = "balance-BRLd";
        assetSuffix = "BRLd";
    } else {
        console.warn(`[updateBalance] Tipo de activo no soportado: ${assetType}`);
        return; // Salir si el tipo no es soportado
    }

    const balanceElement = document.getElementById(elementId);
    if (!balanceElement) {
        console.error(`[updateBalance] Elemento HTML con ID '${elementId}' no encontrado.`);
        return;
    }

    try {
        if (assetType === "DOT") {
            // consultando balance de DOT...
            const accountInfo = await api.query.system.account(selectedAccount);
            const balance = accountInfo.data.free;
            const formattedBalance = Number(balance) / (10 ** 10); // DOT tiene 10 decimales

            balanceElement.innerText = `${assetSuffix}: ${formattedBalance.toLocaleString("es-ES", {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
            })}`;


        } else if (assetType === "USDT") {
            // consultando balance de USDT...
            const USDT_ASSET_ID = 1984;
            const USDT_DECIMALS = 6;

            const assetAccountInfo = await api.query.assets.account(USDT_ASSET_ID, selectedAccount);

            let formattedBalance = 0;
            if (assetAccountInfo.isSome) {
                const accountData = assetAccountInfo.unwrap();
                const balance = accountData.balance;
                formattedBalance = Number(balance) / (10 ** USDT_DECIMALS);
            } else {
                // la cuenta no tiene activos USDT
            }

            balanceElement.innerText = `${assetSuffix}: ${formattedBalance.toLocaleString("es-ES", {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
            })}`;
        }
        else if (assetType === "BRLd") {
            // consultando balance de BRLd...
            const BRLd_ASSET_ID = 50000282;   // ID del token BRLd
            const BRLd_DECIMALS = 10;         // BRLd tiene 10 decimales
            const assetAccountInfo = await api.query.assets.account(BRLd_ASSET_ID, selectedAccount);

            let formattedBalance = 0;
            if (assetAccountInfo.isSome) {
                const accountData = assetAccountInfo.unwrap();
                const balance = accountData.balance;
                formattedBalance = Number(balance) / (10 ** BRLd_DECIMALS);
            } else {
                // la cuenta no tiene activos BRLd
            }

            balanceElement.innerText = `${assetSuffix}: ${formattedBalance.toLocaleString("es-ES", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            })}`;
        }

    } catch (error) {
        console.error(`❌ Error obteniendo el balance de ${assetSuffix}:`, error);
        balanceElement.innerText = `${assetSuffix}: Error`;
    }
}

// Actualizar cuenta seleccionada
function updateSelectedAccount() {
    const accountsDropdown = document.getElementById("accounts");
    const selectedValue = accountsDropdown.value;

    // Obtener el option seleccionado para acceder a su dataset
    const selectedOption = accountsDropdown.options[accountsDropdown.selectedIndex];
    const source = selectedOption.dataset?.source || "polkadot-js"; // Valor por defecto

    // Actualizar las variables globales
    selectedAccount = selectedValue;

    // Actualizar selectedSubWalletAccount basado en la fuente
    if (source === "subwallet-js") {
        selectedSubWalletAccount = selectedValue; // Es una cuenta de SubWallet
    } else {
        selectedSubWalletAccount = null; // Es una cuenta de Polkadot.js
    }

    // cuenta seleccionada actualizada

    // Actualizar el balance de la nueva cuenta seleccionada
    updateAllBalances();
}

// Suscripción a bloques
async function subscribeBlockNumber() {
    if (!api) return;
    const unsubscribe = await api.rpc.chain.subscribeNewHeads((lastHeader) => {
        document.getElementById("block-number").innerText =
            `Bloque actual: #${lastHeader.number}`;
    });
}

// Información del nodo
async function getNodeInfo() {
    if (!api) {
        document.getElementById('node-info').innerText = 'API no conectada';
        return;
    }
    try {
        const chain = await api.rpc.system.chain();
        const nodeName = await api.rpc.system.name();
        const nodeVersion = await api.rpc.system.version();
        document.getElementById('node-info').innerText = `Cadena: ${chain}, Nodo: ${nodeName}, Versión: ${nodeVersion}`;
    } catch (error) {
        document.getElementById('node-info').innerText = 'Error obteniendo información del nodo';
        console.error('Error obteniendo información del nodo:', error);
    }
}

// --- Función auxiliar para obtener el injector ---
async function getInjector() {
    if (selectedSubWalletAccount) {
        return await window.injectedWeb3['subwallet-js'].enable('MiDApp').then(provider => provider.signer);
    } else {
        return await window.injectedWeb3['polkadot-js'].enable('MiDApp').then(provider => provider.signer);
    }
}

// --- Helper: construir MultiLocation de USDT para estimaciones de fee ---
function buildUsdtFeeAssetMultiLocation() {
    return {
        parents: 0,
        interior: {
            X2: [
                { PalletInstance: 50 },
                { GeneralIndex: 1984 }
            ]
        }
    };
}

// --- Helper: mostrar/ocultar la estimación de tarifa en la UI ---
function showFeeEstimateText(text) {
    const feeEstimateElement = document.getElementById('fee-estimate');
    if (!feeEstimateElement) return;
    if (!text) {
        feeEstimateElement.style.display = 'none';
        feeEstimateElement.innerText = '';
        return;
    }
    feeEstimateElement.innerText = text;
    feeEstimateElement.style.display = 'block';
    feeEstimateElement.style.color = '#FF9800';
}

/**
 * Calcula y muestra el fee de una transacción basándose en balances antes y después.
 * @param {object} params - Parámetros de la función.
 * @param {number} params.initialDot - Balance inicial de DOT.
 * @param {number} params.finalDot - Balance final de DOT.
 * @param {number} params.initialAsset - Balance inicial del asset (USDT o BRLd).
 * @param {number} params.finalAsset - Balance final del asset.
 * @param {number} params.transactionAmount - Monto de la transacción.
 * @param {string} params.assetName - Nombre del asset ('USDT' o 'BRLd').
 * @param {number} params.assetDecimals - Decimales del asset (6 para USDT, 10 para BRLd).
 */
async function calcularYMostrarFee(params) {
    const {
        initialDot,
        finalDot,
        initialAsset,
        finalAsset,
        transactionAmount,
        assetName,
        assetDecimals = 6
    } = params;

    // Calcular fees
    const dotSpent = initialDot - finalDot;
    const dotFeeApprox = Math.max(0, dotSpent - (transactionAmount || 0));

    // Para assets (USDT/BRLd): calcular el fee de la red
    const balanceDiff = initialAsset - finalAsset;

    // Si la diferencia de balance es mayor que el transactionAmount,
    // significa que el balance incluye tanto el monto enviado como el fee
    // En ese caso, el fee es: balanceDiff - transactionAmount
    // Si no, el balance solo refleja el fee
    let assetFee;
    if (transactionAmount && balanceDiff > transactionAmount) {
        // El balance incluye monto + fee
        assetFee = balanceDiff - transactionAmount;
    } else {
        // El balance solo refleja el fee
        assetFee = balanceDiff;
    }

    // Debug: mostrar valores calculados
    console.log('[calcularYMostrarFee] Debug:', {
        initialAsset,
        finalAsset,
        transactionAmount,
        balanceDiff,
        assetFee,
        dotSpent,
        dotFeeApprox,
        assetName
    });

    // Usar umbral de tolerancia para errores de precisión de punto flotante
    const TOLERANCE = 0.000001;

    // Mostrar fee según el tipo
    if (assetFee > TOLERANCE) {
        // El fee se pagó en el asset (USDT o BRLd)
        const decimalsToShow = assetDecimals === 6 ? 6 : 4;
        showFeeEstimateText(`Tarifa de la red: ${assetFee.toFixed(decimalsToShow)} ${assetName}`);
    } else if (dotFeeApprox > TOLERANCE) {
        // El fee se pagó en DOT
        showFeeEstimateText(`Tarifa aproximada: ${dotFeeApprox.toFixed(6)} DOT`);
    } else {
        // No se detectó fee significativo
        showFeeEstimateText(`Tarifa de la red: ~0 ${assetName}`);
    }
}

// --- Helpers para leer balances específicos ---
async function getDotBalance(account) {
    if (!api || !account) return 0;
    try {
        const { data: { free } } = await api.query.system.account(account);
        return Number(free) / (10 ** 10);
    } catch (e) {
        console.warn('[getDotBalance] error leyendo DOT balance', e);
        return 0;
    }
}

async function getAssetBalance(assetId, account, decimals = 6) {
    if (!api || !account) return 0;
    try {
        const info = await api.query.assets.account(assetId, account);
        if (info.isSome) {
            const balance = info.unwrap().balance;
            return Number(balance) / (10 ** decimals);
        }
        return 0;
    } catch (e) {
        console.warn('[getAssetBalance] error leyendo asset balance', e);
        return 0;
    }
}

// --- Funciones de validación centralizadas ---

/**
 * Valida que la API esté conectada.
 * @throws {Error} Si la API no está conectada.
 */
function validateApiConnected() {
    if (!api) {
        throw new Error("La API no está conectada.");
    }
}

/**
 * Valida que haya una cuenta seleccionada.
 * @throws {Error} Si no hay cuenta seleccionada.
 */
function validateAccountSelected() {
    if (!selectedAccount) {
        throw new Error("Por favor, conecta y selecciona una cuenta primero.");
    }
}

/**
 * Valida que el monto sea válido (mayor a 0).
 * @param {number} amount - El monto a validar.
 * @param {string} assetName - Nombre del asset para el mensaje de error.
 * @throws {Error} Si el monto no es válido.
 */
function validateAmount(amount, assetName = "monto") {
    if (!amount || isNaN(amount) || amount <= 0) {
        throw new Error(`⚠️ El ${assetName} debe ser mayor a 0.`);
    }
}

/**
 * Valida que haya saldo suficiente de DOT.
 * @param {number} amount - El monto requerido.
 * @param {number} minRemaining - Margen mínimo a mantener (default: 0.02 DOT).
 * @throws {Error} Si el saldo es insuficiente.
 */
async function validateDotBalance(amount, minRemaining = 0.02) {
    const balance = await getDotBalance(selectedAccount);
    if (amount + minRemaining > balance) {
        throw new Error(`⚠️ Saldo insuficiente. Tu saldo es ${balance.toFixed(4)} DOT. El monto no puede superar tu saldo menos ${minRemaining} DOT.`);
    }
}

/**
 * Valida que haya saldo suficiente de un asset.
 * @param {number} assetId - ID del asset.
 * @param {number} amount - El monto requerido.
 * @param {number} decimals - Decimales del asset.
 * @param {string} assetName - Nombre del asset para el mensaje de error.
 * @throws {Error} Si el saldo es insuficiente.
 */
async function validateAssetBalance(assetId, amount, decimals, assetName) {
    const balance = await getAssetBalance(assetId, selectedAccount, decimals);
    if (amount > balance) {
        throw new Error(`⚠️ Saldo insuficiente. Tu saldo es ${balance.toFixed(decimals === 6 ? 2 : 0)} ${assetName}.`);
    }
}

// --- Fin funciones de validación ---

// --- Función auxiliar para enviar el pago (lógica común) ---
async function sendBatchPayment(amount, recipientAddress, feeAsset = null) {
    // --- Mostrar estado inicial: "Procesando..." ---
    const statusElement = document.getElementById("pay-status");
    if (statusElement) {
        statusElement.innerText = "🔄 Procesando transacción...";
        statusElement.style.color = "blue"; // Azul para "procesando"
        statusElement.style.display = "block"; // Hacerlo visible
    }
    // -----------------------------------------------

    if (!api) {
        // Ocultar estado si hay error inicial (opcional)
        if (statusElement) statusElement.style.display = "none";
        throw new Error("La API no está conectada.");
    }
    if (!selectedAccount) {
        // Ocultar estado si hay error inicial (opcional)
        if (statusElement) statusElement.style.display = "none";
        throw new Error("No hay cuenta seleccionada.");
    }

    // 1. Calcular montos
    const recipientAmount = amount * 0.99;
    const feeAmount = amount * 0.01;
    const recipientAmountPlancks = BigInt(Math.floor(recipientAmount * 10 ** 10));
    const feeAmountPlancks = BigInt(Math.floor(feeAmount * 10 ** 10));

    // 2. Obtener injector
    const injector = await getInjector();

    // 3. Crear transacciones
    const transferToRecipient = api.tx.balances.transferAllowDeath(recipientAddress, recipientAmountPlancks);
    const transferFeeToYou = api.tx.balances.transferAllowDeath(FEE_RECIPIENT_ADDRESS, feeAmountPlancks);
    const batchTx = api.tx.utility.batchAll([transferToRecipient, transferFeeToYou]);

    // 4. Enviar y devolver la promesa para manejar el resultado
    return new Promise((resolve, reject) => {
        // If a fee asset (MultiLocation) is provided, include it in the options
        const signOptions = { signer: injector };
        if (feeAsset) signOptions.assetId = feeAsset;

        batchTx.signAndSend(selectedAccount, signOptions, async ({ status, events, dispatchError }) => {
            // --- Manejar errores ---
            if (dispatchError) {
                // Actualizar estado a "Error"
                if (statusElement) {
                    statusElement.innerText = "❌ Error en la transacción.";
                    statusElement.style.color = "red";
                }

                const decoded = api.registry.findMetaError(dispatchError.asModule);
                const { documentation, name, section } = decoded;
                const errorMsg = `Error en pago (${section}.${name}): ${documentation.join(' ')}`;
                console.error(`❌ ${errorMsg}`);
                reject(new Error(errorMsg));
                return;
            }
            // ----------------------

            // --- Transacción incluida en un bloque ---
            if (status.isInBlock) {
                // Actualizar estado a "Incluida en bloque"
                if (statusElement) {
                    statusElement.innerText = `🔄 Incluida en bloque. Esperando confirmación final...`;
                    statusElement.style.color = "orange"; // Naranja para "en progreso"
                }
                // Si solo quieres manejar isFinalized, puedes dejar este bloque 
                // pero es bueno informar al usuario que ya está en un bloque.
                // No resolvemos aún si no está finalizado, esperamos la finalización completa
                if (!status.isFinalized) {
                    // Salir temprano si solo es isInBlock y no isFinalized
                    return;
                }
                // Si llegamos aquí, status.isFinalized también es true, así que continuamos.
            }
            // ------------------------------------------

            if (status.isFinalized) { // Este if ya existía, solo agregamos el contenido
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

                    let mensajeFinal = `Monto en DOT: ${mensajeMonto}. Pago finalizado en bloque: ${blockNumber}`;

                    if (extrinsicIndex !== null) {
                        const subscanLink = `https://assethub-polkadot.subscan.io/extrinsic/${blockNumber}-${extrinsicIndex}`;
                        const linkHTML = `<a href="${subscanLink}" target="_blank">Ver en Subscan</a>`;
                        mensajeFinal = `${mensajeFinal}, ${linkHTML}`;
                    }

                    console.log(`✅ Pago DOT procesado: ${mensajeFinal}`);
                    resolve(mensajeFinal);

                } catch (blockError) {
                    console.error("❌ No se pudo obtener información del bloque:", blockError);
                    const mensajeMonto = amount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const mensajeFallback = `Monto en DOT: ${mensajeMonto}. Pago confirmado, detalles del bloque no disponibles.`;
                    await updateAllBalances();

                    // --- Actualizar estado a "Confirmada (con info limitada)" ---
                    if (statusElement) {
                        statusElement.innerText = "✅ Transacción confirmada (info limitada).";
                        statusElement.style.color = "green";
                    }
                    // ----------------------------------------------------------------

                    resolve(mensajeFallback);
                }
            }
        }).catch((error) => {
            console.error("❌ Error en firma/envío (posible cancelación):", error);

            // Si es cancelación de wallet, actualizar estado
            if (error.message && error.message.includes("Cancelled")) {
                if (statusElement) {
                    statusElement.innerText = "❌ Transacción cancelada.";
                    statusElement.style.color = "orange";
                }
            } else {
                if (statusElement) {
                    statusElement.innerText = "❌ Error en el envío.";
                    statusElement.style.color = "red";
                }
            }
            reject(error);
        });
    });
}

// --- Función para pago rápido (Simplificada) ---
async function payAmount(amount) {
    try {
        // Validaciones usando funciones centralizadas
        validateApiConnected();
        validateAccountSelected();
        validateAmount(amount, "monto");

        // Leer balances antes
        let initialDot = await getDotBalance(selectedAccount);
        let initialUsdt = await getAssetBalance(USDT_ASSET_ID, selectedAccount, USDT_DECIMALS);
        const confirmMsg = `¿Estás seguro de pagar ${amount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DOT?`;
        if (!confirm(confirmMsg)) return;
        const recipient = "13uHe9HLv3MAahwFhyepq4yNKysonAzePFLUhgvZNPZp4N5b";
        // Forzar el pago del fee en USDT
        const usdtFeeAssetId = buildUsdtFeeAssetMultiLocation();
        const mensajeFinal = await sendBatchPayment(amount, recipient, usdtFeeAssetId);
        document.getElementById("pay-result").innerHTML = mensajeFinal;
        // Mostrar QR de la transacción (para pagos rápidos DOT)
        try {
            const txData = extractTransactionDataFromMessage(mensajeFinal, amount, 'DOT', selectedAccount, recipient);
            if (txData) {
                await showTransactionQR(txData);
            }
        } catch (qrError) {
            console.error('Error mostrando QR (DOT quick):', qrError);
        }
        // Leer balances después
        const finalDot = await getDotBalance(selectedAccount);
        const finalUsdt = await getAssetBalance(USDT_ASSET_ID, selectedAccount, USDT_DECIMALS);

        // Calcular y mostrar fee usando función centralizada
        await calcularYMostrarFee({
            initialDot: initialDot,
            finalDot: finalDot,
            initialAsset: initialUsdt,
            finalAsset: finalUsdt,
            transactionAmount: 0, // Para pagos DOT, no hay monto de transacción en USDT
            assetName: 'USDT',
            assetDecimals: USDT_DECIMALS
        });

    } catch (error) {
        console.error("🚨 Error en pago rápido:", error);

        // Detectar si es cancelación de wallet
        if (error.message && error.message.includes("Cancelled")) {
            document.getElementById("pay-result").innerText = "Pago cancelado por el usuario.";
            return;
        }

        document.getElementById("pay-result").innerText = `Error: ${error.message}`;
    }
}

// --- Función para pago personalizado (Simplificada) ---
async function payCustomAmount() {
    try {
        // Validaciones usando funciones centralizadas
        validateApiConnected();
        validateAccountSelected();

        const input = document.getElementById('custom-amount');
        const rawAmount = input.value.trim();

        if (!rawAmount || isNaN(rawAmount)) {
            alert("⚠️ Ingresa un monto válido.");
            return;
        }

        const amount = parseFloat(rawAmount);
        validateAmount(amount, "monto");

        // Validación de saldo usando función centralizada
        await validateDotBalance(amount, 0.02);

        // Leer balances antes de la operación
        const initialDot = await getDotBalance(selectedAccount);
        const initialUsdt = await getAssetBalance(USDT_ASSET_ID, selectedAccount, USDT_DECIMALS);
        const confirmMsg = `¿Estás seguro de pagar ${amount.toLocaleString("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} DOT?`;
        if (!confirm(confirmMsg)) return;
        const recipient = "13uHe9HLv3MAahwFhyepq4yNKysonAzePFLUhgvZNPZp4N5b";
        // Forzar el pago del fee en USDT
        const usdtFeeAssetId = buildUsdtFeeAssetMultiLocation();
        const mensajeFinal = await sendBatchPayment(amount, recipient, usdtFeeAssetId);
        document.getElementById("pay-result").innerHTML = mensajeFinal;
        // Leer balances después
        const finalDot = await getDotBalance(selectedAccount);
        const finalUsdt = await getAssetBalance(USDT_ASSET_ID, selectedAccount, USDT_DECIMALS);

        // Calcular y mostrar fee usando función centralizada
        await calcularYMostrarFee({
            initialDot: initialDot,
            finalDot: finalDot,
            initialAsset: initialUsdt,
            finalAsset: finalUsdt,
            transactionAmount: 0, // Para pagos DOT, no hay monto de transacción en USDT
            assetName: 'USDT',
            assetDecimals: USDT_DECIMALS
        });

        // Mostrar QR de la transacción (para pagos personalizados DOT)
        try {
            const txData = extractTransactionDataFromMessage(mensajeFinal, amount, 'DOT', selectedAccount, recipient);
            if (txData) {
                await showTransactionQR(txData);
            }
        } catch (qrError) {
            console.error('Error mostrando QR (DOT custom):', qrError);
        }

    } catch (error) {
        console.error("🚨 Error en pago personalizado:", error);

        // Detectar si es cancelación de wallet
        if (error.message && error.message.includes("Cancelled")) {
            document.getElementById("pay-result").innerText = "Pago cancelado por el usuario.";
            return;
        }

        document.getElementById("pay-result").innerText = `Error: ${error.message}`;
    }
}

/**
 * Extrae datos útiles para el QR a partir del mensaje final de la transacción.
 * Devuelve un objeto con las propiedades que requiere el generador de QR.
 */
function extractTransactionDataFromMessage(mensajeFinal, amount, currency, senderAddress, recipientAddress) {
    try {
        if (!mensajeFinal) return null;

        // Extraer URL de Subscan desde href o texto
        let subscanUrl = null;
        const hrefMatch = mensajeFinal.match(/href=["']([^"']+)["']/i);
        if (hrefMatch && hrefMatch[1]) {
            subscanUrl = hrefMatch[1];
        } else {
            const urlMatch = mensajeFinal.match(/https?:\/\/[\w\.\-\/\?\=\&\%\#]+/i);
            if (urlMatch) subscanUrl = urlMatch[0];
        }

        // Extraer número de bloque
        let blockNumber = null;
        const blockMatch = mensajeFinal.match(/Pago finalizado en bloque:\s*(\d+)/i) || mensajeFinal.match(/bloque:\s*#?(\d+)/i);
        if (blockMatch && blockMatch[1]) blockNumber = parseInt(blockMatch[1], 10);

        // Extraer extrinsicIndex si está en la URL (/extrinsic/{block}-{index})
        let extrinsicIndex = null;
        if (subscanUrl) {
            const parts = subscanUrl.split('/');
            const last = parts[parts.length - 1];
            const idxMatch = last && last.match(/(\d+)-(\d+)/);
            if (idxMatch) {
                extrinsicIndex = parseInt(idxMatch[2], 10);
                if (!blockNumber) blockNumber = parseInt(idxMatch[1], 10);
            }
        }

        return {
            subscanUrl: subscanUrl,
            blockNumber: blockNumber,
            extrinsicIndex: extrinsicIndex,
            amount: amount,
            currency: currency,
            timestamp: new Date().toISOString(),
            senderAddress: senderAddress,
            recipientAddress: recipientAddress
        };
    } catch (e) {
        console.error('extractTransactionDataFromMessage error:', e);
        return null;
    }
}

/**
* Handler para pagos rápidos USDT.
* Coordina la llamada al módulo y la actualización de la UI.
*/
async function handleUSDTQuickPay(amount, recipient) {
    const payResultElement = document.getElementById("pay-result");
    const payStatusElement = document.getElementById("pay-status");

    const onStatusUpdate = ({ state, message }) => {
        if (payStatusElement) {
            payStatusElement.innerText = message;
            switch (state) {
                case 'processing': payStatusElement.style.color = "blue"; break;
                case 'inBlock': payStatusElement.style.color = "orange"; break;
                case 'finalized': payStatusElement.style.color = "green"; break;
                case 'error': payStatusElement.style.color = "red"; break;
                default: payStatusElement.style.color = "black";
            }
            payStatusElement.style.display = "block";
        }
    };

    try {
        // Leer balances antes
        const initialUsdt = await getAssetBalance(USDT_ASSET_ID, selectedAccount, USDT_DECIMALS);
        const initialDot = await getDotBalance(selectedAccount);
        const mensajeFinal = await payAmountUSDT(
            api, getInjector, selectedAccount, amount, recipient, FEE_RECIPIENT_ADDRESS, onStatusUpdate
        );

        // Si el usuario canceló, mensajeFinal será undefined
        if (!mensajeFinal) {
            // Limpiar estado de UI
            if (payStatusElement) {
                payStatusElement.style.display = "none";
            }
            return;
        }

        if (payResultElement) payResultElement.innerHTML = mensajeFinal;
        if (payStatusElement) {
            payStatusElement.innerText = "✅ Transacción confirmada.";
            payStatusElement.style.color = "green";
        }
        // Leer balances después
        const finalUsdt = await getAssetBalance(USDT_ASSET_ID, selectedAccount, USDT_DECIMALS);
        const finalDot = await getDotBalance(selectedAccount);

        // Mostrar QR de la transacción (para pagos rápidos USDT)
        try {
            const txData = extractTransactionDataFromMessage(mensajeFinal, amount, 'USDT', selectedAccount, recipient);
            if (txData) {
                await showTransactionQR(txData);
            }
        } catch (qrError) {
            console.error('Error mostrando QR (USDT quick):', qrError);
        }

        // Calcular y mostrar fee usando función centralizada
        await calcularYMostrarFee({
            initialDot: initialDot,
            finalDot: finalDot,
            initialAsset: initialUsdt,
            finalAsset: finalUsdt,
            transactionAmount: amount,
            assetName: 'USDT',
            assetDecimals: USDT_DECIMALS
        });
        await updateAllBalances();

    } catch (error) {
        console.error("Error en handleUSDTQuickPay:", error);

        // Detectar si es cancelación de wallet
        if (error.message && error.message.includes("Cancelled")) {
            // Usuario canceló en la wallet, limpiar estado
            if (payStatusElement) {
                payStatusElement.innerText = "❌ Transacción cancelada.";
                payStatusElement.style.color = "orange";
            }
            if (payResultElement) {
                payResultElement.innerText = "Pago cancelado por el usuario.";
            }
            return;
        }

        // Otros errores
        if (payResultElement) {
            payResultElement.innerText = `Error (USDT): ${error.message}`;
        }
        if (payStatusElement) {
            payStatusElement.innerText = "❌ Error en pago USDT.";
            payStatusElement.style.color = "red";
            payStatusElement.style.display = "block";
        }
    }
}

/**
 * Handler para pagos personalizados USDT.
 * Coordina la llamada al módulo y la actualización de la UI.
 */
async function handleUSDTCustomPay(recipient, inputElementId) {
    const payResultElement = document.getElementById("pay-result");
    const payStatusElement = document.getElementById("pay-status");

    try {
        // --- DEFINIR el callback de actualización de estado ---
        const onStatusUpdate = ({ state, message }) => {
            if (payStatusElement) {
                payStatusElement.innerText = message;
                // Aplicar colores según el estado
                switch (state) {
                    case 'processing':
                        payStatusElement.style.color = "blue";
                        break;
                    case 'inBlock':
                        payStatusElement.style.color = "orange";
                        break;
                    case 'finalized':
                    case 'finalized_pending':
                    case 'finalized_limited':
                        payStatusElement.style.color = "green";
                        break;
                    case 'error':
                        payStatusElement.style.color = "red";
                        break;
                    default:
                        payStatusElement.style.color = "black"; // Color por defecto
                }
                payStatusElement.style.display = "block"; // Asegurar que sea visible
            }
        };

        // Leer balances antes
        const inputEl = document.getElementById(inputElementId);
        const amount = parseFloat(inputEl.value.trim());
        const initialUsdt = await getAssetBalance(USDT_ASSET_ID, selectedAccount, USDT_DECIMALS);
        const initialDot = await getDotBalance(selectedAccount);
        const mensajeFinal = await payCustomAmountUSDT(
            api, getInjector, selectedAccount, recipient, FEE_RECIPIENT_ADDRESS, inputElementId, onStatusUpdate
        );

        // Si el usuario canceló, mensajeFinal será undefined
        if (!mensajeFinal) {
            // Limpiar estado de UI
            if (payStatusElement) {
                payStatusElement.style.display = "none";
            }
            return;
        }

        if (payResultElement) payResultElement.innerHTML = mensajeFinal;
        if (payStatusElement) {
            payStatusElement.innerText = "✅ Transacción confirmada.";
            payStatusElement.style.color = "green";
        }
        // Leer balances después
        const finalUsdt = await getAssetBalance(USDT_ASSET_ID, selectedAccount, USDT_DECIMALS);
        const finalDot = await getDotBalance(selectedAccount);

        // Calcular y mostrar fee usando función centralizada
        await calcularYMostrarFee({
            initialDot: initialDot,
            finalDot: finalDot,
            initialAsset: initialUsdt,
            finalAsset: finalUsdt,
            transactionAmount: amount,
            assetName: 'USDT',
            assetDecimals: USDT_DECIMALS
        });
        await updateAllBalances();

        // Mostrar QR de la transacción (para pagos personalizados USDT)
        try {
            const txData = extractTransactionDataFromMessage(mensajeFinal, amount, 'USDT', selectedAccount, recipient);
            if (txData) {
                await showTransactionQR(txData);
            }
        } catch (qrError) {
            console.error('Error mostrando QR (USDT custom):', qrError);
        }

    } catch (error) {
        console.error("Error en handleUSDTCustomPay:", error);

        // Detectar si es cancelación de wallet
        if (error.message && error.message.includes("Cancelled")) {
            // Usuario canceló en la wallet, limpiar estado
            if (payStatusElement) {
                payStatusElement.innerText = "❌ Transacción cancelada.";
                payStatusElement.style.color = "orange";
            }
            if (payResultElement) {
                payResultElement.innerText = "Pago cancelado por el usuario.";
            }
            return;
        }

        // Otros errores
        if (payResultElement) {
            payResultElement.innerText = `Error (USDT): ${error.message}`;
        }
        if (payStatusElement) {
            payStatusElement.innerText = "❌ Error en pago USDT personalizado.";
            payStatusElement.style.color = "red";
        }
    }
}

/**
* Handler para pagos rápidos BRLd.
* Coordina la llamada al módulo y la actualización de la UI.
*/
async function handleBRLdQuickPay(amount, recipient) {
    const payResultElement = document.getElementById("pay-result");
    const payStatusElement = document.getElementById("pay-status");
    // Elemento para mostrar la tarifa estimada (asegúrate de que exista en tu HTML)
    const feeEstimateElement = document.getElementById("fee-estimate");

    // --- DEFINIR la MultiLocation de USDT para pagar tarifas ---
    const usdtFeeAssetId = {
        parents: 0,
        interior: {
            X2: [
                { PalletInstance: 50 }, // Pallet de activos
                { GeneralIndex: 1984 }   // ID de tu USDT
            ]
        }
    };
    // --- FIN DEFINIR la MultiLocation de USDT ---

    // Leer balances ANTES de la transacción
    let initialUSDTBalance = await getAssetBalance(USDT_ASSET_ID, selectedAccount, USDT_DECIMALS);
    let initialDot = await getDotBalance(selectedAccount);

    const onStatusUpdate = ({ state, message }) => {
        if (payStatusElement) {
            payStatusElement.innerText = message;
            switch (state) {
                case 'processing': payStatusElement.style.color = "blue"; break;
                case 'inBlock': payStatusElement.style.color = "orange"; break;
                case 'finalized': payStatusElement.style.color = "green"; break;
                case 'error': payStatusElement.style.color = "red"; break;
                default: payStatusElement.style.color = "black";
            }
            payStatusElement.style.display = "block";
        }
    };

    try {
        // Llamando a payAmountBRLd
        const resultado = await payAmountBRLd(
            api, getInjector, selectedAccount, amount, recipient, FEE_RECIPIENT_ADDRESS, onStatusUpdate, usdtFeeAssetId
        );

        // Si el usuario canceló, resultado será null
        if (!resultado) {
            // Limpiar estado de UI
            if (payStatusElement) {
                payStatusElement.style.display = "none";
            }
            return;
        }

        const { mensajeFinal } = resultado;

        // Leer balances DESPUÉS de la transacción
        let finalUSDTBalance = await getAssetBalance(USDT_ASSET_ID, selectedAccount, USDT_DECIMALS);
        let finalDot = await getDotBalance(selectedAccount);

        // Mostrar QR de la transacción (solo para pago rápido BRLd)
        try {
            const txData = extractTransactionDataFromMessage(mensajeFinal, amount, 'BRLd', selectedAccount, recipient);
            if (txData) {
                await showTransactionQR(txData);
            }
        } catch (qrError) {
            console.error('Error mostrando QR (BRLd):', qrError);
        }

        if (payResultElement) payResultElement.innerHTML = mensajeFinal;
        if (payStatusElement) {
            payStatusElement.innerText = "✅ Transacción confirmada.";
            payStatusElement.style.color = "green";
        }

        // Calcular y mostrar fee usando función centralizada
        await calcularYMostrarFee({
            initialDot: initialDot,
            finalDot: finalDot,
            initialAsset: initialUSDTBalance,
            finalAsset: finalUSDTBalance,
            transactionAmount: 0, // BRLd no afecta USDT, solo se usa para fee
            assetName: 'USDT',
            assetDecimals: USDT_DECIMALS
        });

        // Actualizar balances en la UI
        await updateAllBalances();

    } catch (error) {
        console.error("Error en handleBRLdQuickPay:", error);

        // Detectar si es cancelación de wallet
        if (error.message && error.message.includes("Cancelled")) {
            // Usuario canceló en la wallet, limpiar estado
            if (payStatusElement) {
                payStatusElement.innerText = "❌ Transacción cancelada.";
                payStatusElement.style.color = "orange";
            }
            if (payResultElement) {
                payResultElement.innerText = "Pago cancelado por el usuario.";
            }
            return;
        }

        // Otros errores
        if (payResultElement) {
            payResultElement.innerText = `Error (BRLd): ${error.message}`;
        }
        if (payStatusElement) {
            payStatusElement.innerText = "❌ Error en pago rápido BRLd.";
            payStatusElement.style.color = "red";
            payStatusElement.style.display = "block";
        }
        // --- OCULTAR la tarifa estimada en caso de error ---
        if (feeEstimateElement) {
            feeEstimateElement.style.display = "none";
        }
    }
    // handleBRLdQuickPay finalizado
}

/**
 * Handler para pagos personalizados BRLd.
 * Coordina la llamada al módulo y la actualización de la UI.
 */
async function handleBRLdCustomPay(recipient, inputElementId) {
    const payResultElement = document.getElementById("pay-result");
    const payStatusElement = document.getElementById("pay-status");

    try {
        // --- DEFINIR el callback de actualización de estado ---
        const onStatusUpdate = ({ state, message }) => {
            if (payStatusElement) {
                payStatusElement.innerText = message;
                // Aplicar colores según el estado
                switch (state) {
                    case 'processing':
                        payStatusElement.style.color = "blue";
                        break;
                    case 'inBlock':
                        payStatusElement.style.color = "orange";
                        break;
                    case 'finalized':
                    case 'finalized_pending':
                    case 'finalized_limited':
                        payStatusElement.style.color = "green";
                        // Opcional: Ocultar después de un tiempo
                        // setTimeout(() => { payStatusElement.style.display = "none"; }, 10000);
                        break;
                    case 'error':
                        payStatusElement.style.color = "red";
                        break;
                    default:
                        payStatusElement.style.color = "black"; // Color por defecto
                }
                payStatusElement.style.display = "block"; // Asegurar que sea visible
            }
        };
        // Construir la MultiLocation de USDT para pago de tarifas
        const usdtFeeAssetId = buildUsdtFeeAssetMultiLocation();
        const inputEl = document.getElementById(inputElementId);
        const amount = parseFloat(inputEl.value.trim());

        // Leer balances ANTES de la transacción
        let initialUSDTBalance = await getAssetBalance(USDT_ASSET_ID, selectedAccount, USDT_DECIMALS);
        let initialDot = await getDotBalance(selectedAccount);

        const mensajeFinal = await payCustomAmountBRLd(
            api, getInjector, selectedAccount, recipient, FEE_RECIPIENT_ADDRESS, inputElementId, onStatusUpdate, usdtFeeAssetId
        );

        // Si el usuario canceló, mensajeFinal será undefined
        if (!mensajeFinal) {
            // Limpiar estado de UI
            if (payStatusElement) {
                payStatusElement.style.display = "none";
            }
            return;
        }

        // Leer balances DESPUÉS de la transacción
        let finalUSDTBalance = await getAssetBalance(USDT_ASSET_ID, selectedAccount, USDT_DECIMALS);
        let finalDot = await getDotBalance(selectedAccount);

        // Mostrar QR de la transacción (para pagos personalizados BRLd)
        try {
            const txData = extractTransactionDataFromMessage(mensajeFinal, amount, 'BRLd', selectedAccount, recipient);
            if (txData) {
                await showTransactionQR(txData);
            }
        } catch (qrError) {
            console.error('Error mostrando QR (BRLd custom):', qrError);
        }

        if (payResultElement) payResultElement.innerHTML = mensajeFinal;
        if (payStatusElement) {
            payStatusElement.innerText = "✅ Transacción confirmada.";
            payStatusElement.style.color = "green";
        }

        // Calcular y mostrar fee usando función centralizada
        await calcularYMostrarFee({
            initialDot: initialDot,
            finalDot: finalDot,
            initialAsset: initialUSDTBalance,
            finalAsset: finalUSDTBalance,
            transactionAmount: 0, // BRLd no afecta USDT, solo se usa para fee
            assetName: 'USDT',
            assetDecimals: USDT_DECIMALS
        });

        // Actualizar balances en la UI
        await updateAllBalances();

    } catch (error) {
        console.error("Error en handleBRLdCustomPay:", error);

        // Detectar si es cancelación de wallet
        if (error.message && error.message.includes("Cancelled")) {
            // Usuario canceló en la wallet, limpiar estado
            if (payStatusElement) {
                payStatusElement.innerText = "❌ Transacción cancelada.";
                payStatusElement.style.color = "orange";
            }
            if (payResultElement) {
                payResultElement.innerText = "Pago cancelado por el usuario.";
            }
            return;
        }

        // Otros errores
        if (payResultElement) {
            payResultElement.innerText = `Error (BRLd): ${error.message}`;
        }
        if (payStatusElement) {
            payStatusElement.innerText = "❌ Error en pago BRLd personalizado.";
            payStatusElement.style.color = "red";
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // --- Asignar Event Listeners ---
    document.getElementById('connect-btn')?.addEventListener('click', connectWallet);
    document.getElementById('connect-subwallet-btn')?.addEventListener('click', connectSubWallet);
    document.getElementById('disconnect-btn')?.addEventListener('click', disconnectWallet);
    document.getElementById('accounts')?.addEventListener('change', updateSelectedAccount);
    //DOT listeners
    document.getElementById('pay-2-btn')?.addEventListener('click', () => payAmount(2));
    document.getElementById('pay-1-btn')?.addEventListener('click', () => payAmount(1));
    document.getElementById('pay-0.5-btn')?.addEventListener('click', () => payAmount(0.5));
    document.getElementById('pay-custom-btn')?.addEventListener('click', payCustomAmount);

    //USDT listeners

    document.getElementById('pay-20-usdt-btn')?.addEventListener('click', () =>
        handleUSDTQuickPay(20, USDT_RECIPIENT_ADDRESS)
    );
    document.getElementById('pay-10-usdt-btn')?.addEventListener('click', () =>
        handleUSDTQuickPay(10, USDT_RECIPIENT_ADDRESS)
    );
    document.getElementById('pay-5-usdt-btn')?.addEventListener('click', () =>
        handleUSDTQuickPay(1, USDT_RECIPIENT_ADDRESS)
    );
    document.getElementById('pay-custom-usdt-btn')?.addEventListener('click', () =>
        handleUSDTCustomPay(USDT_RECIPIENT_ADDRESS, 'custom-amount-usdt')
    );

    //BRLd listeners
    document.getElementById('pay-20-BRLd-btn')?.addEventListener('click', () => handleBRLdQuickPay(20, BRLd_RECIPIENT_ADDRESS)
    );
    document.getElementById('pay-10-BRLd-btn')?.addEventListener('click', () => handleBRLdQuickPay(10, BRLd_RECIPIENT_ADDRESS)
    );
    document.getElementById('pay-5-BRLd-btn')?.addEventListener('click', () => handleBRLdQuickPay(5, BRLd_RECIPIENT_ADDRESS)
    );
    document.getElementById('pay-custom-BRLd-btn')?.addEventListener('click', () =>
        handleBRLdCustomPay(BRLd_RECIPIENT_ADDRESS, 'custom-amount-BRLd')
    );

    // --- Funcionalidad para Secciones de Pago Colapsables ---
    // Ya estamos dentro de DOMContentLoaded, no necesitamos otro listener
    // 1. Buscar todos los elementos que tienen la clase 'payment-section-header'
    const sectionHeaders = document.querySelectorAll('.payment-section-header');

    // 2. Recorrer cada uno de esos encabezados encontrados
    sectionHeaders.forEach(function (header) {
        // 3. Agregar un "escuchador de eventos" para el clic del mouse
        header.addEventListener('click', function () {
            // 4. Cuando se hace clic en el encabezado:
            const section = this.parentElement;
            // 5. Alternar la clase 'expanded'
            section.classList.toggle('expanded');
        });
    });
    // --- Fin Funcionalidad para Secciones de Pago Colapsables ---
});
