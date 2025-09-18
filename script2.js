    //importaciones
    import { 
        payAmountUSDT, 
        payCustomAmountUSDT
    } from './usdtPayments.js';

    import { 
        payAmountBRLd, 
        payCustomAmountBRLd
    } from './BRLdPayments.js';
    
    // Variables globales
    let api = null;
    let selectedAccount = null;

    // Variables específicas para SubWallet
    let subWalletProvider = null;
    let selectedSubWalletAccount = null;

    const FEE_RECIPIENT_ADDRESS = "13wh3NcEFqcJ8scMxwDBRGZumRCRsuCPsEvb8XqMm5Di9aD1"; 
    const USDT_RECIPIENT_ADDRESS = "16AfGQ28hzi9QCSoqKkfA5xF9hvMV4rR7ZRj8P36v1ahUNdp";
    const BRLd_RECIPIENT_ADDRESS = "13uHe9HLv3MAahwFhyepq4yNKysonAzePFLUhgvZNPZp4N5b";

    // Función para detectar si SubWallet está disponible
    function isSubWalletAvailable() {
        return window.injectedWeb3 && window.injectedWeb3['subwallet-js'];
    }

    // Conectar con Polkadot.js
    async function connectWallet() {
        console.log("📢 Intentando conectar billetera...");
        if (!window.injectedWeb3 || !window.injectedWeb3["polkadot-js"]) {
            alert("❌ No se encontró la extensión Polkadot.js. Asegúrate de instalarla y recargar la página.");
            return;
        }
        try {
            console.log("✅ Extensión detectada. Intentando conectar...");
            const polkadotJs = window.injectedWeb3["polkadot-js"];
            const provider = await polkadotJs.enable("MiDApp");
            console.log("✅ Billetera habilitada. Obteniendo cuentas...");
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
            console.log("✅ Billetera conectada con éxito:", accounts);
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
            console.log("🔄 Inicializando SubWallet...");
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
            console.log("✅ Cuentas cargadas en SubWallet:", accounts);
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

        // Agregar log para depurar
        console.log(`formatAddressForCurrentChain: chainSS58 = ${api.registry.chainSS58}`);
        
        try {
            // 1. Decodifica la dirección a su representación binaria
            const decoded = window.decodeAddress(address);
            console.log(`[formatAddressForCurrentChain] Dirección decodificada (bytes)`);
            // 2. Obtiene el prefijo SS58 de la cadena conectada (Paseo)
            const ss58Format = api.registry.chainSS58;
            console.log(`[formatAddressForCurrentChain] Usando ss58Format: ${ss58Format}`);
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
        console.log("🔌 Desconectando billetera...");
        
        // --- AJUSTE 1: Intentar revocar permisos de SubWallet ---
        try {
            if (subWalletProvider && typeof subWalletProvider.disable === 'function') {
                console.log("Revocando permisos de SubWallet...");
                await subWalletProvider.disable();
                console.log("Permisos de SubWallet revocados.");
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
        
        console.log("✅ Billetera desconectada.");
        
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
            console.log("🔌 Conectando al nodo de Asset Hub...");
            if (!window.ApiPromise || !window.WsProvider) {
                console.error("❌ La API de Polkadot.js no se ha cargado correctamente.");
                return;
            }
            const NODE_URL = "wss://polkadot-asset-hub-rpc.polkadot.io";
            const { ApiPromise, WsProvider } = window;
            const provider = new WsProvider(NODE_URL);
            api = await ApiPromise.create({ provider });
            await api.isReady;
            console.log("✅ Conectado al nodo de Asset Hub.");
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
                console.log(`[updateBalance] Consultando balance de ${assetSuffix}...`);
                const accountInfo = await api.query.system.account(selectedAccount);
                const balance = accountInfo.data.free;
                const formattedBalance = Number(balance) / (10 ** 10); // DOT tiene 10 decimales

                balanceElement.innerText = `${assetSuffix}: ${formattedBalance.toLocaleString("es-ES", {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4,
                })}`;
                console.log(`[updateBalance] Balance ${assetSuffix}: ${formattedBalance}`);

            } else if (assetType === "USDT") {
                console.log(`[updateBalance] Consultando balance de ${assetSuffix}...`);
                const USDT_ASSET_ID = 1984;
                const USDT_DECIMALS = 6;

                const assetAccountInfo = await api.query.assets.account(USDT_ASSET_ID, selectedAccount);
                console.log(`[updateBalance] Respuesta raw de assets.account para ${assetSuffix}:`, assetAccountInfo);
                
                let formattedBalance = 0;
                if (assetAccountInfo.isSome) {
                    const accountData = assetAccountInfo.unwrap();
                    console.log(`[updateBalance] Datos de cuenta ${assetSuffix}:`, accountData);
                    const balance = accountData.balance;
                    formattedBalance = Number(balance) / (10 ** USDT_DECIMALS);
                    console.log(`[updateBalance] Balance ${assetSuffix} (formateado): ${formattedBalance}`);
                } else {
                    console.log(`[updateBalance] La cuenta no tiene activos ${assetSuffix} (ID: ${USDT_ASSET_ID})`);
                }
                
                balanceElement.innerText = `${assetSuffix}: ${formattedBalance.toLocaleString("es-ES", {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4,
                })}`;
            }
             else if (assetType === "BRLd") { 
            console.log(`[updateBalance] Consultando balance de ${assetSuffix}...`);
            const BRLd_ASSET_ID = 50000282;   // ID del token BRLd
            const BRLd_DECIMALS = 10;         // BRLd tiene 10 decimales
            const assetAccountInfo = await api.query.assets.account(BRLd_ASSET_ID, selectedAccount);
            console.log(`[updateBalance] Respuesta raw de assets.account para ${assetSuffix}:`, assetAccountInfo);
            
            let formattedBalance = 0;
            if (assetAccountInfo.isSome) {
                const accountData = assetAccountInfo.unwrap();
                console.log(`[updateBalance] Datos de cuenta ${assetSuffix}:`, accountData);
                const balance = accountData.balance;
                formattedBalance = Number(balance) / (10 ** BRLd_DECIMALS);
                console.log(`[updateBalance] Balance ${assetSuffix} (formateado): ${formattedBalance}`);
            } else {
                console.log(`[updateBalance] La cuenta no tiene activos ${assetSuffix} (ID: ${BRLd_ASSET_ID})`);
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
        
        console.log(`Cuenta actualizada: ${selectedAccount}`);
        console.log(`Fuente: ${source}`);
        console.log(`selectedSubWalletAccount: ${selectedSubWalletAccount}`);
        
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

    // --- Función auxiliar para enviar el pago (lógica común) ---
    async function sendBatchPayment(amount, recipientAddress) {
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
            batchTx.signAndSend(selectedAccount, { signer: injector, assetId: usdtFeeAssetId }, async ({ status, events, dispatchError }) => {
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
                        // const mensajeEstado = status.isFinalized ? "finalizado en" : "incluido en"; // Ya no se usa
                        // Cambiamos a siempre mostrar "finalizado en" ya que este bloque solo se ejecuta si isFinalized es true
                        let mensajeFinal = `Monto en DOT: ${mensajeMonto}. Pago finalizado en bloque: ${blockNumber}`;
                        
                        if (extrinsicIndex !== null) {
                            // Limpiar espacios extra en la URL
                            const subscanLink = `https://assethub-polkadot.subscan.io/extrinsic/${blockNumber}-${extrinsicIndex}`; // Corregido
                            const linkHTML = `<a href="${subscanLink}" target="_blank">Ver en Subscan</a>`;
                            mensajeFinal = `${mensajeFinal}, ${linkHTML}`;
                        }

                        console.log(`✅ Pago procesado: ${mensajeFinal}`);
                        
                        // --- ACTUALIZACIÓN AUTOMÁTICA DEL SALDO ---
                        await updateAllBalances();
                        // ------------------------------------------

                        // --- Actualizar estado a "Confirmada" ---
                        if (statusElement) {
                            statusElement.innerText = "✅ Transacción confirmada.";
                            statusElement.style.color = "green"; // Verde para "confirmada"
                            // Opcional: Ocultarlo después de un tiempo
                            // setTimeout(() => { statusElement.style.display = "none"; }, 10000);
                        }
                        // ----------------------------------------
                        
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
            });
        });
    }

    // --- Función para pago rápido (Simplificada) ---
    async function payAmount(amount) {
        try {
            // Validaciones básicas
            if (!api) {
                alert("La API no está conectada.");
                return;
            }
            if (!selectedAccount) {
                alert("Por favor, conecta y selecciona una cuenta primero.");
                return;
            }
            if (amount <= 0) {
                alert("⚠️ El monto debe ser mayor a 0.");
                return;
            }

            // --- CAMBIO: Actualizar mensaje de confirmación para DOT ---
            const confirmMsg = `¿Estás seguro de pagar ${amount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DOT?`;
            if (!confirm(confirmMsg)) return;

            const recipient = "13uHe9HLv3MAahwFhyepq4yNKysonAzePFLUhgvZNPZp4N5b"; // Dirección fija
            const mensajeFinal = await sendBatchPayment(amount, recipient);
            document.getElementById("pay-result").innerHTML = mensajeFinal;

        } catch (error) {
            console.error("🚨 Error en pago rápido:", error);
            document.getElementById("pay-result").innerText = `Error: ${error.message}`;
        }
    }

    // --- Función para pago personalizado (Simplificada) ---
    async function payCustomAmount() {
        try {
            // Validaciones básicas
            if (!api) {
                alert("La API no está conectada.");
                return;
            }
            if (!selectedAccount) {
                alert("Por favor, conecta y selecciona una cuenta primero.");
                return;
            }

            const input = document.getElementById('custom-amount');
            const rawAmount = input.value.trim();

            if (!rawAmount || isNaN(rawAmount)) {
                alert("⚠️ Ingresa un monto válido.");
                return;
            }

            const amount = parseFloat(rawAmount);

            if (amount <= 0) {
                alert("⚠️ El monto debe ser mayor a 0.");
                return;
            }

            // Validación de saldo (opcional pero recomendada)
            const { data: { free: balanceRaw } } = await api.query.system.account(selectedAccount);
            const balanceNumber = Number(balanceRaw.toString());
            const balanceInPAS = balanceNumber / 10 ** 10;
            const minRemaining = 0.02; // 0.002 DOT de margen
            if (amount + minRemaining > balanceInPAS) {
                alert(`⚠️ El monto no puede superar tu saldo menos ${minRemaining} DOT`);
                return;
            }

            const confirmMsg = `¿Estás seguro de pagar ${amount.toLocaleString("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} DOT?`;
            if (!confirm(confirmMsg)) return;

            const recipient = "13uHe9HLv3MAahwFhyepq4yNKysonAzePFLUhgvZNPZp4N5b"; // Dirección fija
            const mensajeFinal = await sendBatchPayment(amount, recipient);
            document.getElementById("pay-result").innerHTML = mensajeFinal;

        } catch (error) {
            console.error("🚨 Error en pago personalizado:", error);
            document.getElementById("pay-result").innerText = `Error: ${error.message}`;
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
            // Llamar a la función del módulo, pasando todas las dependencias
            const mensajeFinal = await payAmountUSDT(
                api,           // API global
                getInjector,   // Función auxiliar global
                selectedAccount, // Variable global
                amount,        // Monto del pago
                recipient,      // Dirección del destinatario
                FEE_RECIPIENT_ADDRESS, // Dirección del destinatario de la tarifa 
                onStatusUpdate // Callback para actualizar el estado
            );
            
            if (payResultElement) {
                payResultElement.innerHTML = mensajeFinal;
            }
            
            if (payStatusElement) {
                payStatusElement.innerText = "✅ Transacción confirmada.";
                payStatusElement.style.color = "green";
            }
            
            // Actualizar balances después del pago
            await updateAllBalances();

        } catch (error) {
            console.error("Error en handleUSDTQuickPay:", error);
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
        console.log("[handleUSDTCustomPay] Parámetros recibidos:", { recipient, inputElementId });
        console.log("[handleUSDTCustomPay] Tipo de recipient:", typeof recipient);
        console.log("[handleUSDTCustomPay] Valor de USDT_RECIPIENT_ADDRESS:", USDT_RECIPIENT_ADDRESS);
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
            // Llamar a la función del módulo, pasando todas las dependencias
            const mensajeFinal = await payCustomAmountUSDT(
                api,                     // 1
                getInjector,             // 2
                selectedAccount,         // 3
                recipient,              // 4 - Dirección del destinatario principal
                FEE_RECIPIENT_ADDRESS,   // 5 - Dirección del destinatario de la tarifa (faltaba)
                inputElementId,           // 6 - ID del input (ahora va en la posición correcta)
                onStatusUpdate
            );
            
            if (payResultElement) {
                payResultElement.innerHTML = mensajeFinal;
            }

            if (payStatusElement) {
                payStatusElement.innerText = "✅ Transacción confirmada.";
                payStatusElement.style.color = "green";
            }
                        
            // Actualizar balances después del pago
            await updateAllBalances();

        } catch (error) {
            console.error("Error en handleUSDTCustomPay:", error);
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
        debugger
        console.log("[DEBUG] [handleBRLdQuickPay] Iniciando...");
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
        console.log("[DEBUG] [handleBRLdQuickPay] usdtFeeAssetId definido:", usdtFeeAssetId);

        let initialUSDTBalance = 0; // <-- DEFINIR la variable
        if (api) {
            try {
                const USDT_ASSET_ID = 1984; // Verifica que sea correcto
                const USDT_DECIMALS = 6;
                const assetAccountInfo = await api.query.assets.account(USDT_ASSET_ID, selectedAccount);
                if (assetAccountInfo.isSome) {
                    const balance = assetAccountInfo.unwrap().balance;
                    initialUSDTBalance = Number(balance) / (10 ** USDT_DECIMALS);
                }
                console.log(`[handleBRLdQuickPay] Saldo inicial de USDT: ${initialUSDTBalance.toFixed(6)} USDT`);
            } catch (balanceError) {
                console.warn("[handleBRLdQuickPay] No se pudo obtener saldo inicial de USDT:", balanceError);
                initialUSDTBalance = 0; // Asegurar que sea 0 en caso de error
            }
        }

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
            console.log(`[DEBUG] [handleBRLdQuickPay] Llamando a payAmountBRLd con amount=${amount}, recipient=${recipient}`);
            // --- Llamar a la función del módulo, pasando todas las dependencias Y el assetId ---
            const resultado = await payAmountBRLd(
                api,                    // 1. API global
                getInjector,            // 2. Función auxiliar global
                selectedAccount,        // 3. Variable global
                amount,                 // 4. Monto del pago
                recipient,              // 5. Dirección del destinatario
                FEE_RECIPIENT_ADDRESS,   // 6. Dirección del destinatario de la tarifa 
                onStatusUpdate,         // 7. Callback para actualizar el estado
                usdtFeeAssetId          // 8. AssetId para pagar tarifas con USDT
            );
            // --- Fin llamada al módulo ---
            console.log("[DEBUG] [handleBRLdQuickPay] payAmountBRLd retornó:", resultado);
            
            const { mensajeFinal/*, feeEstimateInUSDT*/ } = resultado;
            
            // --- Mostrar la tarifa estimada (si se proporcionó) ---
            // --- 4. OBTENER SALDO FINAL DE USDT y CALCULAR TARIFA ---
            let finalUSDTBalance = 0;
            let feeInUSDT = 0;
            if (api) {
                try {
                    const USDT_ASSET_ID = 1984; // Verifica que sea correcto
                    const USDT_DECIMALS = 6;
                    const assetAccountInfo = await api.query.assets.account(USDT_ASSET_ID, selectedAccount);
                    if (assetAccountInfo.isSome) {
                        const balance = assetAccountInfo.unwrap().balance;
                        finalUSDTBalance = Number(balance) / (10 ** USDT_DECIMALS);
                    }
                    console.log(`[handleBRLdQuickPay] Saldo final de USDT: ${finalUSDTBalance.toFixed(6)} USDT`);
                    
                    // --- CALCULAR TARIFA REAL ---
                    feeInUSDT = initialUSDTBalance - finalUSDTBalance;
                    console.log(`[handleBRLdQuickPay] Tarifa real en USDT: ${feeInUSDT.toFixed(6)} USDT`);
                    // --- FIN CALCULAR TARIFA REAL ---
                    
                } catch (balanceError) {
                    console.warn("[handleBRLdQuickPay] No se pudo obtener saldo final de USDT:", balanceError);
                    finalUSDTBalance = 0;
                    feeInUSDT = 0;
                }
            }
           
            // --- Fin mostrar tarifa estimada ---
            
            if (payResultElement) {
                payResultElement.innerHTML = mensajeFinal;
            }
            
            if (payStatusElement) {
                payStatusElement.innerText = "✅ Transacción confirmada.";
                payStatusElement.style.color = "green";
            }

            // --- MOSTRAR TARIFA CALCULADA MANUALMENTE ---
            if (feeEstimateElement && feeInUSDT > 0) {
                feeEstimateElement.innerText = `Tarifa de la red: ${feeInUSDT.toFixed(4)} USDT`;
                feeEstimateElement.style.display = "block";
                feeEstimateElement.style.color = "#FF9800"; // Naranja
            } else if (feeEstimateElement) {
                feeEstimateElement.style.display = "none";
            }
            
            // Actualizar balances después del pago
            console.log("[DEBUG] [handleBRLdQuickPay] Actualizando balances...");
            await updateAllBalances();
            console.log("[DEBUG] [handleBRLdQuickPay] Balances actualizados.");

        } catch (error) {
            console.error("[DEBUG] [handleBRLdQuickPay] Error:", error);
            // Manejo de errores existente...
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
        console.log("[DEBUG] [handleBRLdQuickPay] Finalizado.");
    }

    /**
     * Handler para pagos personalizados BRLd.
     * Coordina la llamada al módulo y la actualización de la UI.
     */
    async function handleBRLdCustomPay(recipient, inputElementId) {
        console.log("[handleBRLdCustomPay] Parámetros recibidos:", { recipient, inputElementId });
        console.log("[handleBRLdCustomPay] Tipo de recipient:", typeof recipient);
        console.log("[handleBRLdCustomPay] Valor de BRLd_RECIPIENT_ADDRESS:", USDT_RECIPIENT_ADDRESS);
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
            // Llamar a la función del módulo, pasando todas las dependencias
            const mensajeFinal = await payCustomAmountBRLd(
                api,                     // 1
                getInjector,             // 2
                selectedAccount,         // 3
                recipient,              // 4 - Dirección del destinatario principal
                FEE_RECIPIENT_ADDRESS,   // 5 - Dirección del destinatario de la tarifa (faltaba)
                inputElementId,           // 6 - ID del input (ahora va en la posición correcta)
                onStatusUpdate
            );
            
            if (payResultElement) {
                payResultElement.innerHTML = mensajeFinal;
            }

            if (payStatusElement) {
                payStatusElement.innerText = "✅ Transacción confirmada.";
                payStatusElement.style.color = "green";
            }
                        
            // Actualizar balances después del pago
            await updateAllBalances();

        } catch (error) {
            console.error("Error en handleBRLdCustomPay:", error);
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
    console.log("Inicializando secciones colapsables..."); // Para depurar

    // 1. Buscar todos los elementos que tienen la clase 'payment-section-header'
    const sectionHeaders = document.querySelectorAll('.payment-section-header');
    console.log("Headers encontrados:", sectionHeaders.length); // Para depurar

    // 2. Recorrer cada uno de esos encabezados encontrados
    sectionHeaders.forEach(function (header) {
        console.log("Agregando listener a header:", header); // Para depurar
        // 3. Agregar un "escuchador de eventos" para el clic del mouse
        header.addEventListener('click', function () {
            console.log("Header clickeado!"); // Para depurar
            // 4. Cuando se hace clic en el encabezado:
            const section = this.parentElement;
            console.log("Sección a toggle:", section); // Para depurar

            // 5. Alternar la clase 'expanded'
            section.classList.toggle('expanded');
            console.log("Clase 'expanded' toggled. Clases actuales:", section.classList); // Para depurar
        });
    });
    // --- Fin Funcionalidad para Secciones de Pago Colapsables ---
});

