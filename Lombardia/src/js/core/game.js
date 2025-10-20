// Calcola la distanza tra due coordinate geografiche in km
window.distanzaKm = function(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raggio della Terra in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Funzione per ottenere la velocità attuale
function getSimSpeed() {
    return window.simSpeed || 1;
}

// Definizione variabili globali per i timer simulati (devono essere PRIMA di ogni uso)
window._simIntervals = [];
window._simTimeouts = [];
// Disabilita debug e info logs
// console.log = function() {};

// Variabili globali per ora simulata e stato running
window.simTime = window.simTime || 0; // secondi simulati
if (typeof defaultSimStart === "undefined") {
    var defaultSimStart = 8*3600; // 08:00:00
}
window.simRunning = (typeof window.simRunning === 'undefined') ? true : window.simRunning;

function formatSimTime(sec) {
    const h = Math.floor(sec/3600).toString().padStart(2,'0');
    const m = Math.floor((sec%3600)/60).toString().padStart(2,'0');
    return h+":"+m;
}

function updateSimClock() {
    const el = document.getElementById('sim-clock');
    if(el) {
        let t = window.simDay + ' ';
        let sec = window.simTime||0;
        // --- FIX: mostra sempre orario 00:00:00 dopo le 23:59:59 ---
        if (sec >= 24*3600) sec = 0;
        const h = Math.floor(sec/3600).toString().padStart(2,'0');
        const m = Math.floor((sec%3600)/60).toString().padStart(2,'0');
        const s = (sec%60).toString().padStart(2,'0');
        t += h+":"+m+":"+s;
        el.textContent = t;
    }
    const btn = document.getElementById('sim-startstop');
    if(btn) btn.textContent = window.simRunning ? '⏸️' : '▶️';
}

function simTick() {
    if(window.simRunning) {
        const giorniSettimanaIT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        let sec = window.simTime || 0;
        let dayIdx = typeof window.simDay !== 'undefined' ? giorniSettimanaIT.indexOf(window.simDay) : new Date().getDay();
        if(dayIdx === -1) dayIdx = new Date().getDay();
        
        // Incrementa il tempo simulato
        const nextSec = sec + getSimSpeed();
        
        // Gestisci il rollover giorno e orario
        if (nextSec >= 24*3600) {
            sec = 0; // Reset a mezzanotte
            dayIdx = (dayIdx + 1) % 7;
            window.simDay = giorniSettimanaIT[dayIdx];
            
            // Force availability update at midnight rollover
            window._forceAvailabilityUpdate = true;
        } else {
            sec = nextSec;
        }
          window.simTime = sec;
        updateSimClock();
        
        // Check vehicle availability on each time change
        if (typeof aggiornaDisponibilitaMezzi === 'function') {
            aggiornaDisponibilitaMezzi();
        }
    }
}

// Funzione per gestire intervalli simulati
function simInterval(fn, sec) {
    function wrapper() { if (window.simRunning) fn(); }
    const id = setInterval(wrapper, sec * 1000 / getSimSpeed());
    window._simIntervals.push(id);
    return id;
}

// Funzione per gestire timeout simulati
function simTimeout(fn, sec) {
    function wrapper() {
        if (window.simRunning) {
            fn();
        } else {
            // if paused, defer execution by 1 simulated second
            simTimeout(fn, 1);
        }
    }
    const id = setTimeout(wrapper, sec * 1000 / getSimSpeed());
    window._simTimeouts.push(id);
    return id;
}

// Listener per il cambio velocità
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        const sel = document.getElementById('sim-speed');
        if (sel) {
            sel.addEventListener('change', function() {
                window.simSpeed = Number(sel.value) || 1;
            });
            // Imposta la velocità iniziale
            window.simSpeed = Number(sel.value) || 1;
        }
        // Inizializza ora simulata
        if(typeof window.simTimeInit === 'undefined') {
            window.simTime = defaultSimStart;
            window.simTimeInit = true;
        }
        updateSimClock();
        setInterval(simTick, 1000);
        // Gestione start/stop
        const btn = document.getElementById('sim-startstop');
        if(btn) {
            btn.onclick = function() {
                window.simRunning = !window.simRunning;
                updateSimClock();
                btn.textContent = window.simRunning ? '⏸️' : '▶️';
            };
        }
    });
}

// --- FUNZIONI PER GESTIONE STATO MEZZI ---

// Funzione per interrompere il movimento attuale di un mezzo
function interrompiMovimento(mezzo) {
    console.log('[INFO] Interrompendo movimento del mezzo:', mezzo.nome_radio);
    
    // Interrompi percorso in corso se esiste una funzione di cancellazione
    if (typeof mezzo._cancelMove === 'function') {
        mezzo._cancelMove();
        console.log('[INFO] Movimento interrotto per il mezzo:', mezzo.nome_radio);
    }
    
    // Reset dei flag di movimento
    mezzo._inMovimentoMissione = false;
    mezzo._inMovimentoOspedale = false;
    mezzo._inRientroInSede = false;
    mezzo._trasportoAvviato = false;
    mezzo._statoEnterTime = null;
    mezzo._statoEnterTimeStato = null;
    
    // Rimuovi i timer esistenti usando simTimeout per timer simulati
    if (mezzo._timerStato2) {
        clearTimeout(mezzo._timerStato2);
        mezzo._timerStato2 = null;
    }
    
    if (mezzo._timerReportPronto) {
        clearTimeout(mezzo._timerReportPronto);
        mezzo._timerReportPronto = null;
    }
    
    if (mezzo._timerStato4) {
        clearTimeout(mezzo._timerStato4);
        mezzo._timerStato4 = null;
    }
}

// Funzione centralizzata per avanzamento stato mezzo
function setStatoMezzo(mezzo, nuovoStato) {
    const statoAttuale = mezzo.stato;
    if (
        nuovoStato === 7 || nuovoStato === 1 ||
        (nuovoStato > statoAttuale && nuovoStato <= 7)
    ) {
        mezzo.stato = nuovoStato;

        // Gestisci i messaggi specifici per i cambi di stato
        if (nuovoStato === 7) {
            // Passaggio allo stato 7 (rientro in sede)
            if (statoAttuale === 2) {
                mezzo.comunicazioni = ['Missione interrotta'];
            } else if (statoAttuale === 6 || statoAttuale === 3) {
                mezzo.comunicazioni = ['Diretto in sede'];
            } else {
                mezzo.comunicazioni = ['Diretto in sede'];
            }
        } else if (nuovoStato === 1) {
            // Passaggio allo stato 1 (disponibile) - cancella tutti i messaggi
            mezzo.comunicazioni = [];
        } else {
            // Per altri stati, gestione normale delle comunicazioni
            if (Array.isArray(mezzo.comunicazioni)) {
                const reportPronto = mezzo.comunicazioni.find(msg => msg.includes('Report pronto'));
                mezzo.comunicazioni = [];
                if (reportPronto && mezzo.stato === 3) {
                    mezzo.comunicazioni.push(reportPronto);
                }
            }
        }
        
        // At state 4, clear the report pronto and reset related flags
        if (nuovoStato === 4) {
            mezzo._reportProntoInviato = false;
            mezzo._menuOspedaliShown = false;
            mezzo.comunicazioni = []; // Clear all messages including Report pronto
        }

        mezzo._lastEvent = Date.now();
        aggiornaMissioniPerMezzo(mezzo);

        // Only remove mezzo from mission on states 1 and 7
        if (nuovoStato === 7 || nuovoStato === 1) {
            mezzo.chiamata = null;
            if (window.game && window.game.calls) {
                const calls = Array.from(window.game.calls.values());
                calls.forEach(call => {
                    if (call.mezziAssegnati && call.mezziAssegnati.includes(mezzo.nome_radio)) {
                        call.mezziAssegnati = call.mezziAssegnati.filter(n => n !== mezzo.nome_radio);
                        if (call.mezziAssegnati.length === 0 && window.game.ui && typeof window.game.ui.closeMissioneInCorso === 'function') {
                            window.game.ui.closeMissioneInCorso(call);
                        } else if(window.game.ui && typeof window.game.ui.updateMissioneInCorso === 'function') {
                            window.game.ui.updateMissioneInCorso(call);
                        }
                    }
                });
            }
        }

        if(window.game && window.game.ui && window.game.ui.updateStatoMezzi) window.game.ui.updateStatoMezzi(mezzo);
        if(window.game && window.game.updateMezzoMarkers) window.game.updateMezzoMarkers();
        if(window.game && window.game.updatePostazioneMarkers) window.game.updatePostazioneMarkers();
        gestisciAvanzamentoAutomaticoStati(mezzo);
        return true;
    }
    return false;
}

// Funzione per aggiungere una comunicazione a un mezzo e gestire lampeggio e ordinamento
function aggiungiComunicazioneMezzo(mezzo, messaggio) {
    if (!mezzo.comunicazioni) mezzo.comunicazioni = [];
    mezzo.comunicazioni.push(messaggio);
    mezzo._lastMsgTime = Date.now();
    mezzo._msgLampeggia = true;
    if (window.game && window.game.ui && window.game.ui.updateStatoMezzi) {
        window.game.ui.updateStatoMezzi();
    }
}

// Patch: quando il mezzo cambia stato, rimuovi il lampeggio e il messaggio
const _oldSetStatoMezzo = setStatoMezzo;
setStatoMezzo = function(mezzo, nuovoStato, isManualAssignment = false) {
    const prevStato = mezzo.stato;
    // Chiama la funzione originale solo con i primi 2 parametri
    const res = _oldSetStatoMezzo(mezzo, nuovoStato);
    
    // Play confirm sound ONLY when vehicle goes to state 2 via manual assignment
    if (res && nuovoStato === 2 && prevStato !== 2 && isManualAssignment) {
        console.log('[DEBUG] Riproduco suono confirm per assegnazione manuale di:', mezzo.nome_radio);
        window.soundManager?.play('confirm');
    }
    
    // Play radio sound when vehicle goes from state 1 to state 2 (departure)
    if (res && nuovoStato === 2 && prevStato === 1) {
        console.log('[DEBUG] Riproduco suono radio per partenza di:', mezzo.nome_radio);
        window.soundManager?.play('radio');
    }
    
    // Increment virtual patient count when a mezzo drops off (state 6)
    if (res && nuovoStato === 6 && mezzo.ospedale && window.game.hospitalPatientCount) {
        const key = mezzo.ospedale.nome;
        if (window.game.hospitalPatientCount[key] != null) {
            window.game.hospitalPatientCount[key]++;
        }
    }
    // Patch: remove blinking msg on state change
    if (res && mezzo._msgLampeggia && nuovoStato !== prevStato) {
        mezzo._msgLampeggia = false;
        if (mezzo.comunicazioni && mezzo.comunicazioni.length > 0) {
            mezzo.comunicazioni.pop();
        }
        if (window.game && window.game.ui && window.game.ui.updateStatoMezzi) {
            window.game.ui.updateStatoMezzi();
        }
    }
    return res;
};

function randomMinuti(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- GESTIONE AVANZAMENTO STATI AUTOMATICI MEZZO ---
function gestisciAvanzamentoAutomaticoStati(mezzo) {
    // Stato 1 -> 2: dopo 2-3 minuti simulati
    // DISABILITATO: ora la partenza è gestita dal timer specifico per tipo di mezzo nell'assegnazione missione
    // if (mezzo.stato === 1 && mezzo.chiamata && !mezzo._timerStato2) {
    //     mezzo._timerStato2 = simTimeout(() => {
    //         setStatoMezzo(mezzo, 2);
    //         mezzo._timerStato2 = null;
    //     }, randomMinuti(2, 3) * 60);    
    // }
    // Stato 3: dopo 10-20 minuti simulati manda "report pronto"    
    if (mezzo.stato === 3 && !mezzo._timerReportPronto && !mezzo._reportProntoInviato) {
        // Timer di report impostato a 10-20 minuti simulati
        mezzo._timerReportPronto = simTimeout(() => {
            mezzo.comunicazioni = (mezzo.comunicazioni || []).concat([`Report pronto`]);
            window.soundManager.play('report');
            // console.log('[DEBUG] Mezzo', mezzo.nome_radio, 'ha inviato REPORT PRONTO');
            mezzo._reportProntoInviato = true;
        }, randomMinuti(10, 20) * 60);
    }
    // Stato 4: timer parte solo DOPO conferma utente (vedi nota sotto)
}

// Per il passaggio a stato 4: chiamare questa funzione DOPO la conferma utente
function avanzaMezzoAStato4DopoConferma(mezzo) {
    if (mezzo.stato === 3 && mezzo._reportProntoInviato && !mezzo._timerStato4) {
        // Avanzamento a stato 4 dopo 1-2 minuti simulati
        mezzo._timerStato4 = simTimeout(() => {
            setStatoMezzo(mezzo, 4);
            mezzo._timerStato4 = null;
        }, randomMinuti(1, 2) * 60);
    }
}

function gestisciStato3(mezzo, call) {
    // Use report text from chiamate template if available
    let reportText = 'Report pronto';
    if (call && call.selectedChiamata) {
        const mezzoType = mezzo.tipo_mezzo || '';
        // Map vehicle type to report type
        let reportKey = null;
        if (mezzoType.startsWith('MSB')) {
            reportKey = 'MSB';
        } else if (mezzoType.startsWith('MSA1')) {
            reportKey = 'MSA1';
        } else if (mezzoType.startsWith('MSA2')) {
            reportKey = 'MSA2';
        } else if (mezzoType === 'ELI') {
            // ELI uses MSA2 report
            reportKey = 'MSA2';
        }

        // Prima cerca nel caso selezionato
        if (call.selectedCase && call.selectedChiamata[call.selectedCase]) {
            const reportOptions = call.selectedChiamata[call.selectedCase];
            if (reportKey && reportOptions && reportOptions[reportKey]) {
                reportText = reportOptions[reportKey];
            }
            // Se non lo trova, cerca nel caso_stabile come fallback
            else if (reportKey && call.selectedChiamata['caso_stabile'] && call.selectedChiamata['caso_stabile'][reportKey]) {
                reportText = call.selectedChiamata['caso_stabile'][reportKey];
            }
        }
        // Se selectedCase non è impostato, prova direttamente con caso_stabile
        else if (reportKey && call.selectedChiamata['caso_stabile'] && call.selectedChiamata['caso_stabile'][reportKey]) {
            reportText = call.selectedChiamata['caso_stabile'][reportKey];
        }
    }

    // Automatically send report after 20-30 minutes con gerarchia semplificata
    if (mezzo.stato === 3 && !mezzo._timerReportPronto && !mezzo._reportProntoInviato) {
        // Reset flags to allow hospital transport menu to show after report
        mezzo._menuOspedaliShown = false;
        mezzo._trasportoConfermato = false;
        mezzo._trasportoAvviato = false;
        mezzo.comunicazioni = [];
        
        // Trova la chiamata a cui è assegnato questo mezzo
        const calls = Array.from(window.game.calls.values());
        const myCall = calls.find(c => (c.mezziAssegnati||[]).includes(mezzo.nome_radio));
        
        if (myCall && myCall.mezziAssegnati.length > 1) {
            // Più mezzi nella missione: applica gerarchia
            const allMezziInMissione = window.game.mezzi.filter(m => 
                (myCall.mezziAssegnati||[]).includes(m.nome_radio)
            );
            
            // Funzione per determinare la priorità nella gerarchia COMPLETA
            function getPriorita(tipoMezzo) {
                if (!tipoMezzo) return 0;
                
                // Priorità 1: MSB, BLS
                if (tipoMezzo.startsWith('MSB') || tipoMezzo.startsWith('BLS')) return 1;
                
                // Priorità 2: MSA1, MSA1_1, MSI, ILS
                if (tipoMezzo.startsWith('MSA1') || tipoMezzo === 'MSA1_1' || 
                    tipoMezzo.startsWith('MSI') || tipoMezzo.startsWith('ILS')) return 2;
                
                // Priorità 3: MSA2, MSA2_A, MSA, ALS, VLV, ELI (massima priorità)
                if (tipoMezzo.startsWith('MSA2') || tipoMezzo === 'MSA2_A' || 
                    tipoMezzo === 'MSA' || tipoMezzo.startsWith('ALS') || 
                    tipoMezzo.startsWith('VLV') || tipoMezzo === 'ELI') return 3;
                
                // Altri tipi MSAI o simili (priorità intermedia)
                if (tipoMezzo.startsWith('MSAI')) return 2.5;
                
                return 0;
            }
            
            // Trova il mezzo con priorità più alta nella missione
            const mezzoConPrioritaMassima = allMezziInMissione.reduce((max, current) => {
                const currentPriorita = getPriorita(current.tipo_mezzo);
                const maxPriorita = getPriorita(max.tipo_mezzo);
                return currentPriorita > maxPriorita ? current : max;
            });
            
            const miaProrita = getPriorita(mezzo.tipo_mezzo);
            const prioritaMassima = getPriorita(mezzoConPrioritaMassima.tipo_mezzo);
            
            // Controlla se sono il mezzo con priorità più alta
            const sonoIlPiuAlto = miaProrita === prioritaMassima;
            
            if (sonoIlPiuAlto) {
                // Sono il mezzo con priorità più alta: aspetto che tutti arrivino in stato 3
                const tuttiInStato3 = allMezziInMissione.every(m => m.stato === 3);
                
                if (tuttiInStato3) {
                    // Tutti arrivati: invio report sincronizzato per tutti
                    console.log(`[DEBUG] ${mezzo.nome_radio} (priorità ${miaProrita}): tutti i mezzi arrivati, invio report sincronizzato`);
                    
                    // Invia report per tutti i mezzi in stato 3
                    allMezziInMissione.forEach((m, index) => {
                        if (m.stato === 3 && !m._reportProntoInviato && !m._timerReportPronto) {
                            m._timerReportPronto = simTimeout(() => {
                                // Determina il testo del report per questo mezzo specifico
                                let mezzoReportText = 'Report pronto';
                                if (myCall && myCall.selectedChiamata) {
                                    const mezzoType = m.tipo_mezzo || '';
                                    let reportKey = null;
                                    
                                    // Mappa completa dei tipi di mezzo ai report
                                    if (mezzoType.startsWith('MSB') || mezzoType.startsWith('BLS')) {
                                        reportKey = 'MSB';
                                    } else if (mezzoType.startsWith('MSA1') || mezzoType === 'MSA1_1' || 
                                              mezzoType.startsWith('MSI') || mezzoType.startsWith('ILS')) {
                                        reportKey = 'MSA1';
                                    } else if (mezzoType.startsWith('MSA2') || mezzoType === 'MSA2_A' || 
                                              mezzoType === 'MSA' || mezzoType.startsWith('ALS') || 
                                              mezzoType.startsWith('VLV') || mezzoType === 'ELI') {
                                        reportKey = 'MSA2';
                                    } else if (mezzoType.startsWith('MSAI')) {
                                        reportKey = 'MSA1'; // MSAI usa report MSA1
                                    }
                                    
                                    if (reportKey) {
                                        if (myCall.selectedCase && myCall.selectedChiamata[myCall.selectedCase] && myCall.selectedChiamata[myCall.selectedCase][reportKey]) {
                                            mezzoReportText = myCall.selectedChiamata[myCall.selectedCase][reportKey];
                                        } else if (myCall.selectedChiamata['caso_stabile'] && myCall.selectedChiamata['caso_stabile'][reportKey]) {
                                            mezzoReportText = myCall.selectedChiamata['caso_stabile'][reportKey];
                                        }
                                    }
                                }
                                
                                m.comunicazioni = (m.comunicazioni || []).concat([mezzoReportText]);
                                console.log('[DEBUG] Mezzo', m.nome_radio, 'ha inviato report sincronizzato:', mezzoReportText);
                                m._reportProntoInviato = true;
                                if(window.game && window.game.ui && window.game.ui.updateStatoMezzi) {
                                    window.game.ui.updateStatoMezzi(m);
                                }
                                aggiornaMissioniPerMezzo(m);
                                m._timerReportPronto = null;
                            }, randomMinuti(20, 30) * 60 + (index * 100)); // Piccolo delay tra i mezzi per evitare sovrapposizioni
                        }
                    });
                } else {
                    // Non tutti arrivati: aspetto
                    const mezziMancanti = allMezziInMissione.filter(m => m.stato !== 3);
                    console.log(`[DEBUG] ${mezzo.nome_radio} (priorità ${miaProrita}): aspetto altri mezzi:`, mezziMancanti.map(m => m.nome_radio));
                }
            } else {
                // Non sono il mezzo con priorità più alta: aspetto che il mezzo prioritario attivi la sincronizzazione
                console.log(`[DEBUG] ${mezzo.nome_radio} (priorità ${miaProrita}): aspetto mezzo con priorità maggiore (${prioritaMassima}): ${mezzoConPrioritaMassima.nome_radio}`);
            }
        } else {
            // Mezzo solo o fallback: invia normalmente
            console.log(`[DEBUG] ${mezzo.nome_radio}: mezzo solo, invio report normale`);
            mezzo._timerReportPronto = simTimeout(() => {
                mezzo.comunicazioni = (mezzo.comunicazioni || []).concat([reportText]);
                console.log('[DEBUG] Mezzo', mezzo.nome_radio, 'ha inviato report:', reportText);
                mezzo._reportProntoInviato = true;
                if(window.game && window.game.ui && window.game.ui.updateStatoMezzi) {
                    window.game.ui.updateStatoMezzi(mezzo);
                }
                aggiornaMissioniPerMezzo(mezzo);
                mezzo._timerReportPronto = null;
            }, randomMinuti(20, 30) * 60);
        }
    }
}

function aggiornaMissioniPerMezzo(mezzo) {
    if (!window.game || !window.game.calls) return;
    const calls = Array.from(window.game.calls.values());
    const call = calls.find(c => (c.mezziAssegnati||[]).includes(mezzo.nome_radio));
    if (call && window.game.ui && typeof window.game.ui.updateMissioneInCorso === 'function') {
        window.game.ui.updateMissioneInCorso(call);
    }
}

// --- AGGIORNA DISPONIBILITÀ MEZZI IN BASE ALLA CONVENZIONE/ORARIO ---
function aggiornaDisponibilitaMezzi() {
    const now = (typeof window.simTime === 'number')
        ? (() => { 
            const d = new Date(); 
            d.setHours(Math.floor(window.simTime/3600), Math.floor((window.simTime%3600)/60), 0, 0); 
            return d; 
        })()
        : new Date();

    if (!window.game || !window.game.mezzi) return;

    const ora = now.getHours();
    const minuti = now.getMinutes();
    
    // Use simulated day if set, otherwise use real day
    const giorniIT = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
    const giorno = (window.simDay && giorniIT.includes(window.simDay))
        ? giorniIT.indexOf(window.simDay)
        : now.getDay();

    if (!window._lastAvailabilityCheck) {
        window._lastAvailabilityCheck = { ora: -1, minuti: -1, giorno: -1 };
    }

    const shouldUpdate = window._lastAvailabilityCheck.ora !== ora || 
                         window._lastAvailabilityCheck.minuti !== minuti ||
                         window._lastAvailabilityCheck.giorno !== giorno ||
                         window._forceAvailabilityUpdate === true;
                         
    if (shouldUpdate) {
        // Special debug for midnight
        if (ora === 0 && minuti === 0) {
            console.log(`[DEBUG] Midnight update detected - simTime: ${window.simTime}, typeof: ${typeof window.simTime}`);
        }
        
        console.log(`[INFO] Aggiornamento disponibilità mezzi - Ora: ${ora}:${minuti.toString().padStart(2, '0')}, Giorno: ${['DOM','LUN','MAR','MER','GIO','VEN','SAB'][giorno]}`);
        
        // Reset force update flag if it was set
        if (window._forceAvailabilityUpdate === true) {
            console.log('[INFO] Forced availability update triggered');
            window._forceAvailabilityUpdate = false;
        }

        window.game.mezzi.forEach(m => {
            // Process all vehicles that are not currently on a mission
            if (!m.chiamata) {
                // Do NOT override vehicles that are in progress or returning (2..7)
                // Only enforce availability for vehicles that are idle in sede (1) or explicitly non disponibile (8)
                if (m.stato !== 1 && m.stato !== 8) {
                    // console.debug(`[DEBUG] Availability: skip ${m.nome_radio} in stato ${m.stato}`);
                    return;
                }
                // Format simulated time as HH:MM
                const orarioSimulato = ora.toString().padStart(2, '0') + ':' + minuti.toString().padStart(2, '0');
                
                // Get the isMezzoOperativo function
                const isMezzoOperativoFn = window.isMezzoOperativo || (window.jsUtils && window.jsUtils.isMezzoOperativo);
                if (typeof isMezzoOperativoFn !== "function") {
                    console.error("Funzione isMezzoOperativo non trovata su window. Assicurati che orariMezzi.js sia caricato PRIMA di game.js");
                    return;
                }
                
                // Determine availability based on the vehicle's service hours
                const disponibile = isMezzoOperativoFn(m, orarioSimulato, now, window.simDay);

                // Debug problematic times (midnight)
                if (ora === 0 && minuti === 0) {
                    console.log(`[DEBUG] Midnight vehicle check: ${m.nome_radio}, hours: ${m["Orario di lavoro"]}, disponibile: ${disponibile}`);
                }
                
                // Special debugging for vehicle at problematic time 16:11
                if (ora === 16 && minuti === 11) {
                    console.log(`[DEBUG] 16:11 vehicle check: ${m.nome_radio}, hours: ${m["Orario di lavoro"]}, disponibile: ${disponibile}`);
                }                // Update vehicle state based on availability
                // Calcola il nuovo stato in base a disponibilità
                const nuovoStato = disponibile ? 1 : 8;
                if (m.stato !== nuovoStato) {
                    // Genera identificativo per log
                    const vehicleId = m.nome_radio || (m.tipo_mezzo ? m.tipo_mezzo + ' @ ' + (m.postazione || 'Unknown') : 'ID#' + Math.floor(Math.random()*1000));
                    console.log(`[INFO] Mezzo ${vehicleId} passa a ${nuovoStato === 1 ? 'disponibile (stato 1)' : 'non disponibile (stato 8)'}`);
                    m.stato = nuovoStato;
                }
            }
        });

        // Update markers and UI
        if (window.game.updatePostazioneMarkers) {
            window.game.updatePostazioneMarkers();
        }
        if (window.game.ui && typeof window.game.ui.updateStatoMezzi === 'function') {
            window.game.ui.updateStatoMezzi();
        }

        // Store current time values to avoid unnecessary updates
        window._lastAvailabilityCheck.ora = ora;
        window._lastAvailabilityCheck.minuti = minuti;
        window._lastAvailabilityCheck.giorno = giorno;    }
}

// Aggiunta una funzione per calcolare il ritardo di partenza in base al tipo di mezzo
function getRitardoPartenza(tipoMezzo) {
    if (!tipoMezzo) return randomMinuti(1, 4) * 60; // Default fallback
    
    // Normalizza il tipo di mezzo
    const tipo = tipoMezzo.toUpperCase().trim();
    
    // ELI: 5-8 minuti
    if (tipo.includes('ELI')) {
        return randomMinuti(5, 8) * 60;
    }
    
    // Mezzi terrestri (MSB, MSA1, MSA1_A, MSA2, MSA2_A): 30 secondi - 3 minuti
    if (tipo.startsWith('MSB') || tipo.startsWith('MSA1') || tipo.startsWith('MSA2')) {
        // Converti 30 secondi in frazione di minuto (0.5) e 3 minuti
        const secondiMin = 30; // 30 secondi
        const minutiMax = 3;   // 3 minuti
        
        // Genera un numero casuale tra 30 secondi e 3 minuti
        const secondiTotali = Math.random() * (minutiMax * 60 - secondiMin) + secondiMin;
        return Math.round(secondiTotali);
    }
    
    // Default per altri tipi di mezzi
    return randomMinuti(1, 4) * 60;
}

class EmergencyDispatchGame {
    constructor() {
        // Inizializza le proprietà base
        this.mezzi = [];
        this.calls = new Map();
        this.hospitals = [];
        this.indirizziReali = window.indirizziReali || [];
        this.chiamateTemplate = null;
        this.categorieIndirizzi = window.categorizzaIndirizzi ? window.categorizzaIndirizzi() : {
            abitazione: [],
            strada: [],
            azienda: [],
            scuola: [], 
            luogo_pubblico: [],
            rsa: []
        };

        // Counters for mission numbers per SOREU central
        this.missionCounter = { SRA: 0, SRL: 0, SRM: 0, SRP: 0 };
        
        // Verifica che GameUI sia definito prima di creare l'istanza
        if (typeof GameUI === 'undefined') {
            console.error('GameUI non è definito. Assicurati che UI.js sia caricato prima di game.js');
            // Crea un oggetto temporaneo per evitare errori
            this.ui = {
                updateMissioneInCorso: () => {},
                updateStatoMezzi: () => {},
                showNewCall: () => {},
                moveCallToEventiInCorso: () => {},
                closeMissioneInCorso: () => {}
            };
        } else {
            this.ui = new GameUI(this);
        }

        // --- Dynamic call scheduling based on time-of-day ---
        const getRate = () => {
            const sec = window.simTime || 0;
            const hour = Math.floor(sec/3600) % 24;
            const lambdaPeak = 1/60;       // peak: 1 call per 60s
            const lambdaNightPeak = 1/90;  // night peak: 1 call per 90s
            const lambdaDay = 1/120;       // daytime: 1 call per 120s
            const lambdaNight = 1/300;     // night: 1 call per 300s
            if ((hour >=8 && hour <10) || (hour >=18 && hour <20)) return lambdaPeak;
            if (hour >=2 && hour <4) return lambdaNightPeak;
            if (hour >=7 && hour <19) return lambdaDay;
            return lambdaNight;
        };
        // Variabile per controllare la generazione automatica delle chiamate
        window.autoCallsEnabled = true;

        const scheduleDynamicCall = () => {
            if (!window.simRunning) { simTimeout(scheduleDynamicCall, 1); return; }
            const rate = getRate();
            const dt = Math.max(1, Math.round(-Math.log(Math.random())/rate));
            simTimeout(() => {
                if (window.autoCallsEnabled) {
                    this.generateNewCall();
                }
                scheduleDynamicCall();
            }, dt);
        };
        scheduleDynamicCall();

        // Reinserimento cicli per movimentazione veicoli e aggiornamenti di stato
        simInterval(() => {
            aggiornaDisponibilitaMezzi();
            const now = window.simTime
                ? (() => { const d = new Date(); d.setHours(Math.floor(window.simTime/3600), Math.floor((window.simTime%3600)/60), 0, 0); return d; })()
                : new Date();

            (this.mezzi || []).forEach(async m => {
                if (m.stato === 2 && m.chiamata && !m._inMovimentoMissione) {
                    console.log('[DEBUG] Mezzo in stato 2:', m.nome_radio, 'chiamata:', m.chiamata);
                    m._inMovimentoMissione = true;
                    const call = Array.from(this.calls.values()).find(c => (c.mezziAssegnati||[]).includes(m.nome_radio));
                    if (!call) return;
                    const dist = distanzaKm(m.lat, m.lon, call.lat, call.lon);
                    let vel = await getVelocitaMezzo(m.tipo_mezzo);
                    let riduzione = 0;
                    if (call.codice === 'Rosso') riduzione = 0.15;
                    else if (call.codice === 'Giallo') riduzione = 0.10;
                    if (m.tipo_mezzo !== 'ELI') {
                        const traffico = 1 + (Math.random() * 0.2 - 0.1);
                        vel = vel * traffico;
                    }
                    vel = vel * (1 + riduzione);
                    const tempoArrivo = Math.round((dist / vel) * 60);
                    const arrivoMinuti = Math.min(Math.max(tempoArrivo, 2), 30);
                    this.moveMezzoGradualmente(m, m.lat, m.lon, call.lat, call.lon, arrivoMinuti, 3, () => {
                        this.ui.updateStatoMezzi(m);
                        this.updateMezzoMarkers();
                        m._inMovimentoMissione = false;
                        gestisciStato3.call(this, m, call);
                    });
                }
                if (m.stato === 4 && m.ospedale && !m._inMovimentoOspedale) {
                    m._inMovimentoOspedale = true;
                    const dist = distanzaKm(m.lat, m.lon, m.ospedale.lat, m.ospedale.lon);
                    let vel = await getVelocitaMezzo(m.tipo_mezzo);
                    let riduzione = 0;
                    if (m.codice_trasporto === 'Rosso') riduzione = 0.15;
                    else if (m.codice_trasporto === 'Giallo') riduzione = 0.10;
                    if (m.tipo_mezzo !== 'ELI') {
                        const traffico = 1 + (Math.random() * 0.2 - 0.1);
                        vel = vel * traffico;
                    }
                    vel = vel * (1 + riduzione);
                    const tempoArrivo = Math.round((dist / vel) * 60);
                    const arrivoOspedaleMinuti = Math.min(Math.max(tempoArrivo, 2), 30);
                    this.moveMezzoGradualmente(m, m.lat, m.lon, m.ospedale.lat, m.ospedale.lon, arrivoOspedaleMinuti, 5, () => {
                        this.ui.updateStatoMezzi(m);
                        this.updateMezzoMarkers();
                        m._inMovimentoOspedale = false;
                        simTimeout(() => {
                            setStatoMezzo(m, 6);
                            aggiornaMissioniPerMezzo(m);
                            m.comunicazioni = [];
                            if(window.game.ui) window.game.ui.updateStatoMezzi(m);
                            if(window.game.updateMezzoMarkers) window.game.updateMezzoMarkers();
                        }, randomMinuti(1, 2) * 60);
                    });
                }
            });
        }, 2);

        simInterval(() => {
            if (!window.game || !window.game.mezzi) return;
            const now = window.simTime || 0;
            window.game.mezzi.forEach(m => {
                if ([5,6,7].includes(m.stato)) {
                    if (!m._statoEnterTime || m._statoEnterTimeStato !== m.stato) {
                        m._statoEnterTime = now;
                        m._statoEnterTimeStato = m.stato;
                    }
                } else {
                    m._statoEnterTime = null;
                    m._statoEnterTimeStato = null;
                }
                if (m.stato === 5 && m._statoEnterTime && now - m._statoEnterTime > 25*60) {
                    setStatoMezzo(m, 6);
                    aggiornaMissioniPerMezzo(m);
                    m.comunicazioni = [];
                    if(window.game.ui) window.game.ui.updateStatoMezzi(m);
                    if(window.game.updateMezzoMarkers) window.game.updateMezzoMarkers();
                }
                if (m.stato === 6 && m._statoEnterTime && now - m._statoEnterTime > 15*60) {
                    setStatoMezzo(m, 7);
                    if (window.game && window.game.gestisciStato7) window.game.gestisciStato7(m);
                }
            });
        }, 5);
    }

    async loadStatiMezzi() {
        if (this.statiMezzi) return;
        const res = await fetch('src/data/stati_mezzi.json');
        const json = await res.json();
        this.statiMezzi = {};
        (json.Sheet1 || []).forEach(s => {
            this.statiMezzi[s.Stato] = s;
        });
    }

    async loadChiamate() {
        try {
            // Prova prima con il path minuscolo (compatibile GitHub Pages)
            const response = await fetch('src/data/chiamate.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} loading chiamate.json`);
            }
            // Carica come testo per rimuovere eventuali commenti
            let text = await response.text();
            // Rimuovi righe commentate (// ...)
            text = text.replace(/^\s*\/\/.*$/gm, '');
            this.chiamateTemplate = JSON.parse(text);
        } catch (e) {
            console.error("Error loading chiamate:", e);
            this.chiamateTemplate = null;
        }
    }    async initialize() {
         try {
             await this.loadChiamate();
             await this.loadStatiMezzi();
             await this.loadMezzi();
             

             // Force availability update on initialization
             window._forceAvailabilityUpdate = true;
             if (typeof aggiornaDisponibilitaMezzi === 'function') {
                 console.log("[INFO] Initial vehicle availability check");
                 aggiornaDisponibilitaMezzi();
             }
             

             this.initializeMap();
             await this.loadHospitals();
            // Initialize virtual patient counters per hospital
            this.hospitalPatientCount = {};
            for (const h of this.hospitals) {
                const capacity = Number(h.raw["N° pazienti Max"] || 0);
                // Random occupancy percent between 0 and 80
                const pct = Math.floor(Math.random() * 81);
                // Compute actual count based on capacity
                const count = capacity > 0 ? Math.round(capacity * pct / 100) : 0;
                this.hospitalPatientCount[h.nome] = count;
            }
             // Populate UI with initial vehicle and hospital lists on startup
             if (this.ui && typeof this.ui.updateStatoMezzi === 'function') {
                 this.ui.updateStatoMezzi();
             }
            // Start automatic call generation
            if (window.simTimeInit) {
                // Schedule the first call within at most 15 seconds
                const firstInterval = Math.floor(Math.random() * 16); // seconds (0–15)
                simTimeout(() => {
                    if (window.autoCallsEnabled) {
                        this.generateNewCall();
                        this.scheduleNextCall();
                    }
                }, firstInterval);
            }
         } catch (e) {
             console.error("Error during initialization:", e);
         }
    }

    // Sistema realistico di generazione chiamate basato su pattern reali del 118
    scheduleNextCall() {
        // Profilo orario realistico (0.0 - 1.0 moltiplicatore)
        const hourlyProfile = {
            0: 0.3, 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.25, 5: 0.3,
            6: 0.4, 7: 0.6, 8: 0.8, 9: 0.9, 10: 1.0, 11: 0.95,
            12: 0.9, 13: 0.8, 14: 0.85, 15: 0.9, 16: 0.95, 17: 1.0,
            18: 0.9, 19: 0.8, 20: 0.7, 21: 0.6, 22: 0.5, 23: 0.4
        };

        // Modificatori giornalieri
        const dayModifiers = {
            0: 0.7,  // Domenica
            1: 1.0,  // Lunedì
            2: 1.0,  // Martedì
            3: 1.0,  // Mercoledì
            4: 1.1,  // Giovedì
            5: 1.2,  // Venerdì
            6: 0.9   // Sabato
        };

        const sec = window.simTime || 0;
        const currentHour = Math.floor(sec / 3600) % 24;
        const currentDay = new Date().getDay();

        // Parametri base: 6-15 chiamate/ora, media 10
        const baseLoad = 10;
        const minLoad = 6;
        const maxLoad = 15;

        // Calcola chiamate target per quest'ora
        const hourlyMultiplier = hourlyProfile[currentHour] || 0.5;
        let callsThisHour = Math.round(baseLoad * hourlyMultiplier);
        
        // Applica modificatori giornalieri
        callsThisHour = Math.round(callsThisHour * dayModifiers[currentDay]);
        
        // Applica moltiplicatore utente per frequenza chiamate
        const userMultiplier = window.callFrequencyMultiplier || 1.0;
        callsThisHour = Math.round(callsThisHour * userMultiplier);
        
        // Assicura che rimanga nei limiti (con range esteso per moltiplicatori alti)
        const adjustedMin = Math.round(minLoad * userMultiplier);
        const adjustedMax = Math.round(maxLoad * userMultiplier * 1.5); // Permette fino a 22 chiamate/ora
        callsThisHour = Math.max(adjustedMin, Math.min(adjustedMax, callsThisHour));

        // Controlla eventi speciali (5% probabilità ogni ora)
        if (Math.random() < 0.05) {
            callsThisHour = Math.round(callsThisHour * (1.5 + Math.random())); // 1.5x - 2.5x
        }

        // Calcola intervallo fino alla prossima chiamata
        const baseInterval = (60 * 60) / callsThisHour; // secondi tra chiamate
        const variation = 0.3; // ±30% variazione
        const randomFactor = 1 + (Math.random() - 0.5) * 2 * variation;
        const interval = Math.round(baseInterval * randomFactor);

        simTimeout(() => {
            if (window.autoCallsEnabled) {
                this.generateNewCall();
                this.scheduleNextCall();
            } else {
                this.scheduleNextCall();
            }
        }, interval);
    }

    initializeMap() {
        if (this.map) {
            this.map.remove();
        }
        // Determine initial map center and zoom based on selected central
        let initCenter = [45.685783, 9.636633]; // default Bergamo (SRA)
        const initZoom = 13;
        switch (window.selectedCentral) {
            case 'SRM': // Ospedale Niguarda, Milano
                initCenter = [45.5270, 9.1903]; break;
            case 'SRP': // Pavia
                initCenter = [45.1847, 9.1582]; break;
            case 'SRL': // Como
                initCenter = [45.8081, 9.0852]; break;
        }
        this.map = L.map('game-map').setView(initCenter, initZoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
        this.updatePostazioneMarkers();
    this.updateMezzoMarkers();
    }
    async loadMezzi() {
         // Carica mezzi da tutte le centrali in parallelo e assegna campo central
    const centralFiles = { SRA: 'src/data/mezzi_sra.json', SRL: 'src/data/mezzi_srl.json', SRM: 'src/data/mezzi_srm.json', SRP: 'src/data/mezzi_srp.json' };
    const allRaw = [];
    await Promise.all(Object.entries(centralFiles).map(async ([code, path]) => {
        try {
            const res = await fetch(path);
            if (!res.ok) return console.error(`File ${path} mancante (HTTP ${res.status})`);
            let data = await res.json();
            if (!Array.isArray(data)) data = Object.values(data).find(v => Array.isArray(v)) || [];
            data.forEach(item => { allRaw.push({ ...item, central: code }); });
        } catch (e) { console.error(`Errore fetch ${path}`, e); }
    }));
    // Mappa raw in oggetti veicolo
    this.mezzi = allRaw.map(m => {
        let lat = m.lat ?? null, lon = m.lon ?? null;
        if ((!lat || !lon) && m['Coordinate Postazione']) {
            const coords = m['Coordinate Postazione'].split(',').map(s => Number(s.trim())); lat = coords[0]; lon = coords[1];
        }
        return {
            nome_radio: (m.nome_radio || m['Nome radio'] || '').trim(),
            postazione: (m.postazione || m['Nome Postazione'] || '').trim(),
            tipo_mezzo: m.tipo_mezzo || m.Mezzo || '',
            convenzione: m.convenzione || m['Convenzione'] || '',
            Giorni: m.Giorni || m.giorni || 'LUN-DOM',
            'Orario di lavoro': m['Orario di lavoro'] || '',
            lat, lon,
            stato: 1,
            _marker: null,
            _callMarker: null,
            _ospedaleMarker: null,
            central: m.central
        };
    });
    // Una postazione può ospitare più mezzi (anche con stesso nome_radio)
    this.postazioniMap = {};
    this.mezzi.forEach(m => {
        if (!m.postazione || m.postazione.trim() === "" || !m.lat || !m.lon) return;
        const key = m.postazione.trim() + '_' + m.lat + '_' + m.lon;
        const flagKey = 'is' + m.central;
        if (!this.postazioniMap[key]) {
            this.postazioniMap[key] = {
                nome: m.postazione.trim(),
                lat: m.lat,
                lon: m.lon,
                mezzi: [],
                isCreli: false
            };
        }
        // mark postazione belonging to this central
        this.postazioniMap[key][flagKey] = true;
        this.postazioniMap[key].mezzi.push(m);
    });

            // Load Creli dispatch center vehicles
            try {
                const resCreli = await fetch('src/data/Creli.json');
                let creli = await resCreli.json();
                if (!Array.isArray(creli)) {
                    const arr = Object.values(creli).find(v => Array.isArray(v));
                    creli = arr || [];
                }
                creli.forEach(item => {
                    const nomePost = (item['Nome Postazione'] || '').trim();
                    if (!nomePost) return;
                    const coords = item['Coordinate Postazione']?.split(',').map(s => Number(s.trim())) || [];
                    const lat = coords[0], lon = coords[1];
                    if (lat == null || lon == null) return;
                    const mezzo = {
                        nome_radio: (item['Nome radio'] || '').trim(),
                        postazione: nomePost,
                        tipo_mezzo: item['Mezzo'] || '',
                        convenzione: item['Convenzione'] || '',
                        Giorni: item['Giorni'] || item['giorni'] || "LUN-DOM",
                        'Orario di lavoro': item['Orario di lavoro'] || '',
                        lat, lon, stato: 1, _marker: null, _callMarker: null, _ospedaleMarker: null
                    };
                    this.mezzi.push(mezzo);
                    const key = nomePost + '_' + lat + '_' + lon;
                    if (!this.postazioniMap[key]) {
                        this.postazioniMap[key] = { nome: nomePost, lat, lon, mezzi: [], isCreli: true };
                    }
                    this.postazioniMap[key].mezzi.push(mezzo);
                });
            } catch(e) { console.error('Error loading Creli.json:', e); }

    }

    async loadHospitals() {
        try {           // SRA central: mostra ospedali SRA, Laghi, Metro e Pianura in ordine
           if (window.selectedCentral === 'SRA') {
               let hospitalsAll = [];
               // 1) ospedali.json (SRA senza prefisso)
               const resBase = await fetch('src/data/ospedali.json');
               const baseList = await resBase.json();
               (Array.isArray(baseList)? baseList : Object.values(baseList).find(v=>Array.isArray(v))||[])
               .forEach(h => {
                   const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat = coords[0], lon = coords[1];
                   if(lat!=null&&lon!=null) hospitalsAll.push({ nome: h.OSPEDALE?.trim()||'', lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // 2) PS SOREU Laghi (prefisso SRL)
               const resLaghi = await fetch('src/data/PS SOREU laghi.json');
               const laghiList = await resLaghi.json();
               (Array.isArray(laghiList)? laghiList : []).forEach(h=>{
                   const coords=(h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat=coords[0], lon=coords[1];
                   if(lat!=null&&lon!=null) hospitalsAll.push({ nome: `(SRL) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // 3) PS SOREU Metro (prefisso SRM)
               const resMetro = await fetch('src/data/PS SOREU Metro.json');
               const metroList = await resMetro.json();
               (Array.isArray(metroList)? metroList : []).forEach(h=>{
                   const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat=coords[0], lon=coords[1];
                   if(lat!=null&&lon!=null) hospitalsAll.push({ nome: `(SRM) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // 4) PS SOREU Pianura (prefisso SRP)
               const resPianura = await fetch('src/data/PS SOREU pianura.json');
               const pianuraList = await resPianura.json();
               (Array.isArray(pianuraList)? pianuraList : []).forEach(h=>{
                   const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat=coords[0], lon=coords[1];
                   if(lat!=null&&lon!=null) hospitalsAll.push({ nome: `(SRP) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // render markers
               this.hospitals = hospitalsAll;
               hospitalsAll.forEach(hosp=>{
                   const marker = L.marker([hosp.lat, hosp.lon], { icon: this.getHospitalIcon() })
                       .addTo(this.map)
                       .bindPopup(`<b>${hosp.nome}</b><br>${hosp.indirizzo||''}`);
                   hosp._marker = marker;
               });
               return;
           }
           // SRL central: mostra ospedali Laghi, SRA, Metro e Pianura in ordine
           if (window.selectedCentral === 'SRL') {
               let hospitalsAll = [];
               // 1) PS SOREU Laghi (appare prima)
               const resLaghi = await fetch('src/data/PS SOREU laghi.json');
               const laghiList = await resLaghi.json();
               (Array.isArray(laghiList)? laghiList : []).forEach(h=>{
                   const coords=(h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat=coords[0], lon=coords[1];
                   if(lat!=null&&lon!=null) hospitalsAll.push({ nome: h.OSPEDALE?.trim()||'', lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // 2) ospedali.json (prefisso SRA)
               const resBase = await fetch('src/data/ospedali.json');
               const baseList = await resBase.json();
               (Array.isArray(baseList)? baseList : Object.values(baseList).find(v=>Array.isArray(v))||[])
               .forEach(h => {
                   const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat = coords[0], lon = coords[1];
                   if(lat!=null&&lon!=null) hospitalsAll.push({ nome: `(SRA) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // 3) PS SOREU Metro (prefisso SRM)
               const resMetro = await fetch('src/data/PS SOREU Metro.json');
               const metroList = await resMetro.json();
               (Array.isArray(metroList)? metroList : []).forEach(h=>{
                   const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat=coords[0], lon=coords[1];
                   if(lat!=null&&lon!=null) hospitalsAll.push({ nome: `(SRM) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // 4) PS SOREU Pianura (prefisso SRP)
               const resPianura = await fetch('src/data/PS SOREU pianura.json');
               const pianuraList = await resPianura.json();
               (Array.isArray(pianuraList)? pianuraList : []).forEach(h=>{
                   const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat=coords[0], lon=coords[1];
                   if(lat!=null&&lon!=null) hospitalsAll.push({ nome: `(SRP) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // render markers
               this.hospitals = hospitalsAll;
               hospitalsAll.forEach(hosp=>{
                   const marker = L.marker([hosp.lat, hosp.lon], { icon: this.getHospitalIcon() })
                       .addTo(this.map)
                       .bindPopup(`<b>${hosp.nome}</b><br>${hosp.indirizzo||''}`);
                   hosp._marker = marker;
               });
               return;
           }
           // SRM central: mostra ospedali Metro, Laghi (SRL), Pianura (SRP), SRA in ordine
           if (window.selectedCentral === 'SRM') {
               let hospitalsAll = [];
               // 1) PS SOREU Metro
               const resMetro = await fetch('src/data/PS SOREU Metro.json');
               const metroList = await resMetro.json();
               (Array.isArray(metroList)? metroList : [])
               .forEach(h=>{
                   const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat = coords[0], lon = coords[1];
                   if(lat!=null&&lon!=null) hospitalsAll.push({ nome: h.OSPEDALE?.trim()||'', lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // 2) PS SOREU Laghi (prefisso SRL)
               const resLaghi = await fetch('src/data/PS SOREU laghi.json');
               const laghiList = await resLaghi.json();
               (Array.isArray(laghiList)? laghiList : []).forEach(h=>{
                   const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat=coords[0], lon=coords[1];
                   if(lat!=null&&lon!=null) hospitalsAll.push({ nome: `(SRL) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // 3) PS SOREU Pianura (prefisso SRP)
               const resPianura = await fetch('src/data/PS SOREU pianura.json');
               const pianuraList = await resPianura.json();
               (Array.isArray(pianuraList)? pianuraList : []).forEach(h=>{
                   const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat=coords[0], lon=coords[1];
                   if(lat!=null&&lon!=null) hospitalsAll.push({ nome: `(SRP) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // 4) ospedali.json (prefisso SRA)
               const resBase = await fetch('src/data/ospedali.json');
               const baseList = await resBase.json();
               (Array.isArray(baseList)? baseList : Object.values(baseList).find(v=>Array.isArray(v))||[])
               .forEach(h=>{
                   const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat = coords[0], lon = coords[1];
                   if(lat!=null&&lon!=null) hospitalsAll.push({ nome: `(SRA) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // render
               this.hospitals = hospitalsAll;
               hospitalsAll.forEach(hosp=>{
                   const marker = L.marker([hosp.lat,hosp.lon],{icon:this.getHospitalIcon()})
                       .addTo(this.map)
                       .bindPopup(`<b>${hosp.nome}</b><br>${hosp.indirizzo||''}`);
                   hosp._marker=marker;
               });
               return;
           }
           // SRP central: mostra ospedali PS Pianura, Laghi (SRL), Metro (SRM) e SRA
           if (window.selectedCentral === 'SRP') {
               let hospitalsAll = [];
               // 1) PS SOREU Pianura (appare prima)
               const resPianura = await fetch('src/data/PS SOREU pianura.json');
               const pianuraList = await resPianura.json();
               (Array.isArray(pianuraList) ? pianuraList : []).forEach(h => {
                   const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat = coords[0], lon = coords[1];
                   if (lat!=null && lon!=null) hospitalsAll.push({ nome: h.OSPEDALE?.trim()||'', lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // 2) PS SOREU Laghi (prefisso SRL)
               const resLaghi = await fetch('src/data/PS SOREU laghi.json');
               const laghiList = await resLaghi.json();
               (Array.isArray(laghiList) ? laghiList : []).forEach(h => {
                   const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat = coords[0], lon = coords[1];
                   if (lat!=null && lon!=null) hospitalsAll.push({ nome: `(SRL) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // 3) PS SOREU Metro (prefisso SRM)
               const resMetro = await fetch('src/data/PS SOREU Metro.json');
               const metroList = await resMetro.json();
               (Array.isArray(metroList) ? metroList : []).forEach(h => {
                   const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                   const lat = coords[0], lon = coords[1];
                   if (lat!=null && lon!=null) hospitalsAll.push({ nome: `(SRM) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
               });
               // 4) ospedali.json (prefisso SRA)
               const resBase = await fetch('src/data/ospedali.json');
               const baseList = await resBase.json();
               (Array.isArray(baseList) ? baseList : Object.values(baseList).find(v=>Array.isArray(v))||[])
                   .forEach(h => {
                       const coords = (h.COORDINATE||'').split(',').map(s=>Number(s.trim()));
                       const lat = coords[0], lon = coords[1];
                       if (lat!=null && lon!=null) hospitalsAll.push({ nome: `(SRA) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
                   });
               // render markers
               this.hospitals = hospitalsAll;
               hospitalsAll.forEach(hosp => {
                   const marker = L.marker([hosp.lat, hosp.lon], { icon: this.getHospitalIcon() })
                       .addTo(this.map)
                       .bindPopup(`<b>${hosp.nome}</b><br>${hosp.indirizzo||''}`);
                   hosp._marker = marker;
               });
               return;
           }
           // Carica ospedali da ospedali.json (fallback per centrali non riconosciute)
           const response = await fetch('src/data/ospedali.json');
            let hospitals = await response.json();

            hospitals = hospitals.map(hosp => {
                let lat = null, lon = null;
                if (hosp.COORDINATE) {
                    const coords = hosp.COORDINATE.split(',').map(s => Number(s.trim()));
                    lat = coords[0];
                    lon = coords[1];
                }
                return {
                    nome: hosp.OSPEDALE?.trim() || "",
                    lat,
                    lon,
                    indirizzo: hosp.INDIRIZZO || "",
                    raw: hosp   // keep original fields for UI recommendations
                };
            }).filter(h => h.lat !== null && h.lon !== null && !isNaN(h.lat) && !isNaN(h.lon));

            // Add PS SOREU Laghi hospitals (prefix SRL)
            try {
                const resSRL = await fetch('src/data/PS SOREU laghi.json');
                let srlList = await resSRL.json();
                (Array.isArray(srlList) ? srlList : []).forEach(h => {
                    const coords = (h.COORDINATE||'').split(',').map(s => Number(s.trim()));
                    const lat = coords[0], lon = coords[1];
                    if (lat != null && lon != null) hospitals.push({ nome: `(SRL) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: '', raw: h });
                });
            } catch(e) { console.error('Error loading PS SOREU laghi:', e); }

            // Add PS SOREU Metro hospitals (prefix SRM)
            try {
                const resSRM = await fetch('src/data/PS SOREU Metro.json');
                let srmList = await resSRM.json();
                (Array.isArray(srmList) ? srlList : []).forEach(h => {
                    const coords = (h.COORDINATE||'').split(',').map(s => Number(s.trim()));
                    const lat = coords[0], lon = coords[1];
                    if (lat != null && lon != null) hospitals.push({ nome: `(SRM) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: '', raw: h });
                });
            } catch(e) { console.error('Error loading PS SOREU Metro:', e); }

            // Add PS SOREU Pianura hospitals (prefix SRP)
            try {
                const resSRP = await fetch('src/data/PS SOREU pianura.json');
                let srpList = await resSRP.json();
                (Array.isArray(srpList) ? srpList : []).forEach(h => {
                    const coords = (h.COORDINATE||'').split(',').map(s => Number(s.trim()));
                    const lat = coords[0], lon = coords[1];
                    if (lat != null && lon != null) hospitals.push({ nome: `(SRP) ${h.OSPEDALE?.trim()||''}`, lat, lon, indirizzo: '', raw: h });
                });
            } catch(e) { console.error('Error loading PS SOREU pianura:', e); }

            this.hospitals = hospitals;
            hospitals.forEach(hosp => {
                const marker = L.marker([hosp.lat, hosp.lon], { icon: this.getHospitalIcon() }).addTo(this.map)
                    .bindPopup(`<b>${hosp.nome}</b><br>${hosp.indirizzo || ""}`);
                hosp._marker = marker;
            });
            if (this.calls && this.ui && typeof this.ui.updateMissioneInCorso === 'function') {
                Array.from(this.calls.values()).forEach(call => {
                    this.ui.updateMissioneInCorso(call);
                });
            }
        } catch (e) {
            console.error("Errore nel caricamento degli ospedali:", e);
        }
    }

    updateActiveMissionMezzi() {
        if (!this.mezzi) return;
        this.mezzi.forEach(m => {
            if (m.chiamata || m.ospedale) {
                this.ui.updateStatoMezzi(m);
            }
        });
    }

    getHospitalIcon() {
        return L.divIcon({
            className: 'hospital-marker',
            html: `<div class="hospital-icon">H</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28]
        });
    }

    getPostazioneIcon(hasLiberi, isCreli = false) {
        // SRL and SRP postazioni also have white background
        // White background for Creli or any external SOREU central markers
        const whiteBg = isCreli;
        // any isSRL, isSRM, isSRP flags passed as isCreli parameter
        const bg = whiteBg ? "#ffffff" : (hasLiberi ? "#43a047" : "#d32f2f");
        return L.divIcon({
            className: 'postazione-marker',
            html: `<div style="font-size:18px;background:${bg};border-radius:6px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">🏠</div>`,
            iconSize: [24, 24],  
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        });
    }

    updatePostazioneMarkers() {
        if (!this.map || !this.postazioniMap) return;
        if (!this._postazioneMarkers) this._postazioneMarkers = [];
        this._postazioneMarkers.forEach(m => this.map.removeLayer(m));
        this._postazioneMarkers = [];
        
        // Get current central for filtering
        const currentCentral = (window.selectedCentral||'').trim().toUpperCase();
        
        Object.values(this.postazioniMap).forEach(postazione => {
           // Skip entire postazione if central compatibility doesn't match
           const postazioniCentral = Object.keys(postazione).find(key => key.startsWith('is') && postazione[key] === true);
           if (postazioniCentral) {
               const centralCode = postazioniCentral.substring(2); // Remove "is" prefix
               if ((currentCentral === 'SRA' && centralCode === 'SRM') || 
                   (currentCentral === 'SRM' && centralCode === 'SRA')) {
                   return; // Skip SRA postazioni in SRM view and vice versa
               }
           }
            
            const mezziLiberi = (this.mezzi || []).filter(m => {
               // Filter out vehicles from incompatible centrals
               const vehicleCentral = (m.central||'').trim().toUpperCase();
               if ((currentCentral === 'SRA' && vehicleCentral === 'SRM') ||
                   (currentCentral === 'SRM' && vehicleCentral === 'SRA')) {
                   return false;
               }
                const isDisponibile = m.stato === 1; // è in stato disponibile
                const inThisPostazione = m.postazione === postazione.nome; // appartiene alla postazione
                const correctCoordinates = Math.abs(m.lat - postazione.lat) < 0.0001 && 
                                         Math.abs(m.lon - postazione.lon) < 0.0001; // coordinate corrette
                
                return isDisponibile && inThisPostazione && correctCoordinates;
            });
            
            const hasLiberi = mezziLiberi.length > 0;
            
            const mezziPostazione = (this.mezzi || []).filter(m =>
               // Filter out vehicles from incompatible centrals
               !((currentCentral === 'SRA' && m.central === 'SRM') || 
                 (currentCentral === 'SRM' && m.central === 'SRA')) &&
                m.stato !== 8 &&
                m.postazione === postazione.nome &&
                Math.abs(m.lat - postazione.lat) < 0.0001 &&
                Math.abs(m.lon - postazione.lon) < 0.0001
            );
              // If no matching vehicles after filtering, skip this postazione
            // Ottieni tutti i mezzi della postazione (inclusi quelli in stato 8) per garantire 
            // che tutte le postazioni vengano visualizzate, anche se hanno solo mezzi in stato 8
            const tuttiMezziPostazione = (this.mezzi || []).filter(m =>
                !((currentCentral === 'SRA' && m.central === 'SRM') || 
                  (currentCentral === 'SRM' && m.central === 'SRA')) &&
                m.postazione === postazione.nome &&
                Math.abs(m.lat - postazione.lat) < 0.0001 &&
                Math.abs(m.lon - postazione.lon) < 0.0001
            );
            // Se non ci sono proprio mezzi in questa postazione dopo il filtro, allora salta
            // if (tuttiMezziPostazione.length === 0) return;  // keep station visible even if all vehicles left coordinates
            
            let mezziHtml = '';
            if (mezziPostazione.length > 0) {
                mezziHtml = mezziPostazione.map(m => {
                    // Aggiungi un identificatore data per facilitare gli aggiornamenti tramite DOM
                    return `<div data-mezzo-id="${m.nome_radio}">
                        <b>${m.nome_radio}</b>
                        <span style="color:#555;">(${m.tipo_mezzo || '-'}</span>
                        <span style="color:#888;">${m.convenzione ? m.convenzione : ''}</span>)
                    </div>`;
                }).join('');
            } else {
                mezziHtml = `<div style="color:#d32f2f;"><i>Nessun mezzo</i></div>`;
            }
            
            // SRL, SRP, SRM postazioni should use white background: detect flags
            // Determine if postazione is external to selected central or a Creli postazione
            const sel = window.selectedCentral;
            const isSpecial = postazione.isCreli ||
                (sel === 'SRA' && (postazione.isSRL || postazione.isSRP)) ||
                (sel === 'SRL' && (postazione.isSRA || postazione.isSRP || postazione.isSRM)) ||
                (sel === 'SRM' && (postazione.isSRL || postazione.isSRP)) ||
                (sel === 'SRP' && (postazione.isSRA || postazione.isSRL || postazione.isSRM));
            const marker = L.marker([postazione.lat, postazione.lon], { 
                icon: this.getPostazioneIcon(hasLiberi, isSpecial) 
            }).addTo(this.map)
            .bindPopup(`<div style="font-weight:bold;font-size:15px;">${postazione.nome}</div>${mezziHtml}`);
            
            marker.on('popupopen', () => {
                const mezziLiberiNow = (this.mezzi || []).filter(m =>
                   // Filter out vehicles from incompatible centrals
                   !((currentCentral === 'SRA' && m.central === 'SRM') || 
                     (currentCentral === 'SRM' && m.central === 'SRA')) &&
                    m.stato === 1 &&
                    m.postazione === postazione.nome &&
                    Math.abs(m.lat - postazione.lat) < 0.0001 &&
                    Math.abs(m.lon - postazione.lon) < 0.0001
                );
                const hasLiberiNow = mezziLiberiNow.length > 0;
                
                const mezziPostazioneNow = (this.mezzi || []).filter(m =>
                   // Filter out vehicles from incompatible centrals
                   !((currentCentral === 'SRA' && m.central === 'SRM') || 
                     (currentCentral === 'SRM' && m.central === 'SRA')) &&
                    m.stato !== 8 &&
                    m.postazione === postazione.nome &&
                    Math.abs(m.lat - postazione.lat) < 0.0001 &&
                    Math.abs(m.lon - postazione.lon) < 0.0001
                );
                
                let mezziHtmlNow = '';
                if (mezziPostazioneNow.length > 0) {
                    mezziHtmlNow = mezziPostazioneNow.map(m => {
                        return `<div data-mezzo-id="${m.nome_radio}">
                            <b>${m.nome_radio}</b>
                            <span style="color:#555;">(${m.tipo_mezzo || '-'}</span>
                            <span style="color:#888;">${m.convenzione ? m.convenzione : ''}</span>)
                        </div>`;
                    }).join('');
                } else {
                    mezziHtmlNow = `<div style="color:#d32f2f;"><i>Nessun mezzo</i></div>`;
                }
                
                marker.setPopupContent(
                    `<div style="font-weight:bold;font-size:15px;">${postazione.nome}</div>${mezziHtmlNow}`
                );
                marker.setIcon(this.getPostazioneIcon(hasLiberiNow, isSpecial));
            });
            
            this._postazioneMarkers.push(marker);
        });
    }

    updateDettLuogo(luogo) {
        const dettLuogoSelect = document.getElementById('dett-luogo');
        if (!dettLuogoSelect) return;
        
        // Salva il valore corrente prima di cancellare
        const currentValue = dettLuogoSelect.value;
        
        dettLuogoSelect.innerHTML = '';
        let opzioni = [];
        
        switch(luogo) {
            case 'CASA':
                opzioni = ['ABITAZIONE PRIVATA', 'CONDOMINIO'];
                break;
            case 'STR. SANITARIA':
                opzioni = ['OSPEDALE', 'RSA/RSD','GUARDIA MEDICA', 'CENTRO ACCOGLIENZA','ALTRA STR. SANITARIA'];
                break;
            case 'STRADA':
                opzioni = ['INCROCIO','PIAZZA','URBANA','PROVINCIALE/STATALE','AUTOSTRADA','PONTE/VIADOTTO','GALLERIA','MARCIAPIEDE','CICLABILE'];
                break;
            case 'UFFICI ED ES. PUBBL.':
                opzioni = ['ALBERGO','BAR/RISTORANTI','NEGOZIO','UFFICI','POSTA','PARCO/GIARDINI PUBBLICI','PARCO DIVERTIMENTI','CENTRO COMMERCIALE','SUPERMERCATO','CAMPEGGIO','CINEMA/TEATRO','DISCOTECA'];
                break;
            case 'IMPIANTO SPORTIVO':
                opzioni = ['STADIO','CENTRO SPORTIVO','PISCINA','PALESTRA','MANEGGIO','IMPIANTO SCIISTICO'];
                break;
            case 'IMPIANTO LAVORATIVO':
                opzioni = ['FABBRICA','CANTIERE','CAPANNONE','FABBRICA SOSTANZE PERICOLOSE'];
                break;
            case 'SCUOLE':
                opzioni = ['ASILO','SCUOLE ELEMENTARI','SCUOLE MEDIE','SCUOLE SUPERIORI','UNIVERSITA'];
                break;
            case 'STAZIONE':
                opzioni = ['STAZIONE FERROVIARIA','STAZIONE METROPOLITANA', 'STAZIONE AUTOBUS'];
                break;
            case 'FERROVIA':
                opzioni = ['LINEA FERROVIARIA','GALLERIA FERROVIARIA','PASSAGGIO LIVELLO','PONTE/ VIADOTTO FERROVIARIO'];
                break;
            case 'METROPOLITANA':
                opzioni = ['LINEA METROPOLITANA','GALLERIA METROPOLITANA'];
                break;
            case 'AEREOPORTI':
                opzioni = ['AEREOSUPERFICIE','AEREOPORTO','PUNTO DI PRIMO INTERVENTO AEROPORTUALE'];
                break;
            case 'QUESTURA/CASERME':
                opzioni = ['RIFERIMENTO FF.OO.','RIFERIMENTO VV.FF', 'COMANDO POLIZIA LOCALE','QUESTURA','POLIZIA DI STATO','CASERMA CARABINIERI', 'CASERMA VVF','CASA CIRCONDARIALE'];
                break;
            case 'LUOGHI DI CULTO':
                opzioni = ['CHIESA','ALTRO LUOGO DI CULTO','CIMITERO'];
                break;
            case 'IMPERVIO':
                opzioni = ['RIFUGIO MONTANO','CORSO ACQUA','LAGO','BOSCO/FORESTA','SENTIERO','MONTAGNA','FORRA/GROTTA'];
                break;
            case 'ALTRO LUOGO':
                opzioni = ['ALTRO'];
                break;
        }
        
        // Recupera il call object per gestire il salvataggio
        const popup = document.getElementById('popupMissione');
        const callId = popup?.getAttribute('data-call-id');
        const call = callId ? this.calls.get(callId) : null;
        
        opzioni.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            // Ripristina il valore salvato se corrisponde
            option.selected = call && call.dettLuogo === opt;
            dettLuogoSelect.appendChild(option);
        });
        
        // Aggiungi listener per salvare automaticamente
        dettLuogoSelect.onchange = () => {
            if (call) {
                call.dettLuogo = dettLuogoSelect.value; // Salva automaticamente
            }
        };
    }

    updateDettMotivo(motivo) {
        const dettMotivoSelect = document.getElementById('dett-motivo');
        if (!dettMotivoSelect) return;
        
        dettMotivoSelect.innerHTML = '';
        let opzioni = [];
        
        switch(motivo) {
            case 'MEDICO ACUTO':
                opzioni = ['CARDIOCIRCOLATORIA','RESPIRATORIA','DIGERENTE','NEUROLOGICA','METABOLICA','NEOPLASTICA','URO-GENITALE','PSICHIATRICA','GRAVIDANZA/PARTO','OSTEO MUSCOLARE','ORECCHIO/NASO/GOLA', 'OCULISTICA', 'CUTE/TESS.CONNETTIVO','INFETTIVA', 'NON NOTO'];
                break;
            case 'INCIDENTE/INFORTUNIO':
                opzioni = ['FERITA LACERO CONTUSA','TRAUMA PENETRANTE','FOLGORATO','USTIONI','AMPUTAZIONE','SCONTRO DI GIOCO','SCHIACCIAMENTO'];
                break;
            case 'SOCCORSO PERSONA':
                opzioni = ['IMPICCAMENTO','TENTATO SUICIDIO','INC. DOMESTICO','APERTURA APPARTAMENTO','INCENDIO','ANNEGAMENTO','RICERCA DISPERSO','ASSISTENZA FFO', 'ASSISTENZA VVF'];
                break;
            case 'CADUTA':
                opzioni = ['CADUTA SUOLO','CADUTA DA SCALA','CADUTA DA BICI','CADUTA DA MOTO','CADUTA DA CAVALLO','PRECIPITATO'];
                break;
            case 'EVENTO VIOLENTO':
                opzioni = ['RISSA','AGGRESSIONE','FERITA','FERITA ARMA BIANCA','FERITA ARMA DA FUOCO', 'ASSISTENZA FFO'];
                break;
            case 'INC. STRADALE':
                opzioni = ['INVESTIMENTO PEDONE','INVESTIMENTO CICLISTA','SCONTRO BICICLETTE','RIBALTAMENTO','SBALZATO/PROIETTATO','FUORI STRADA','CONTRO OSTACOLO','MOTO/MOTO','MOTO/AUTO','AUTO/AUTO','MOTO/MEZZO PESANTE','AUTO/MEZZO PESANTE','MEZZO PESANTE/MEZZO PESANTE', 'PIU VEICOLI','INCASTRATO', 'INCARCERATO', 'ARROTAMENTO PERSONA','MICROMOB. ELETTRICA', 'DINAMICA NON NOTA'];
                break;
            case 'INC. FERROVIA':
                opzioni = ['ARROTAMENTO PERSONA', 'ALTRO INC. FERROVIARIO'];
                break;
            case 'INC. ACQUA':
                opzioni = ['IMBARCAZIONE', 'ANNEGAMENTO PERSONA', 'SOCCORSO A PERSONA'];
                break;
            case 'INC. ARIA':
                opzioni = ['AEROMOBILE'];
                break;
            case 'INC. MONTANO':
            case 'INC. SPELEO/FORRA':
                opzioni = ['INCRODATO', 'SOCCORSO A PERSONA', 'RICERCA DISPERSO', 'ALTRO'];
                break;
            case 'INTOSSICAZIONE':
                opzioni = ['ALIMENTARE','FARMACI','SOSTANZE PERICOLOSE', 'ETILICA', , 'VENIPUNTURA', 'ALTRA SOSTANZA PERICOLOSA'];
                break;
            case 'ANIMALI':
                opzioni = ['PUNTURA ANIMALE','MORSO ANIMALE', 'MORSO DI VIPERA'];
                break;
            case 'PREVENZIONE':
            case 'EVENTO DI MASSA':
            case 'MAXI EMERGENZA':
                opzioni = ['ESPLOSIONE','SCOPPIO','CROLLO','ESONDAZIONE','FRANA/VALANGA','NUBIFRAGIO','TERREMOTO','TROMBA D ARIA','FUGA GAS/ SOST. PERICOLOSE','INC. NUCLEARE','NUBE TOSSICA'];
                break;
            case 'SOCCORSO SECONDARIO':
                opzioni = ['SOCCORSO SECONDARIO', 'TRASPORTO INTRAOSPEDALIERO', 'TRASPORTO EQUIPE ELI', 'TRASPORTO ORGANI', 'TRASPORTO EQUIPE TRAPIANTI'];
                break;
            case 'ALTRO/NON NOTO':
                opzioni = ['PZ GRANDE OBESO','ALTRO', 'NON INDENTIFICATO'];
                break;
        }
        
        // Recupera il call object per gestire il salvataggio
        const popup = document.getElementById('popupMissione');
        const callId = popup?.getAttribute('data-call-id');
        const call = callId ? this.calls.get(callId) : null;
        
        opzioni.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            // Ripristina il valore salvato se corrisponde
            option.selected = call && call.dettMotivo === opt;
            dettMotivoSelect.appendChild(option);
        });
        
        // Aggiungi listener per salvare automaticamente
        dettMotivoSelect.onchange = () => {
            if (call) {
                call.dettMotivo = dettMotivoSelect.value; // Salva automaticamente
            }
        };
    }

    updateNoteEvento2(noteEvento) {
        const noteEvento2Select = document.getElementById('note-evento2');
        if (!noteEvento2Select) return;
        
        noteEvento2Select.innerHTML = '';
        let opzioni = [];
        
        switch(noteEvento) {
            case 'CARDIOCIRCOLATORIO':
                opzioni = ['ACC','RCP IN CORSO','CARDIOPALMO','CARDIOPATICO','IPERTESO','IPOTESO','CARDIOPATICO IPERTESO','PREGRESSO IMA'];
                break;
            case 'RESPIRATORIA':
                opzioni = ['NORMALE','A FATICA','TOSSE', 'BPCO', 'NON NOTO'];
                break;
            case 'RESPIRA':
                opzioni = ['NORMALE','A FATICA','TOSSE', 'BPCO', 'CORPO ESTRANEO', 'NON NOTO'];
                break;
            case 'DOLORE':
                opzioni = ['TESTA VOLTO','OCCHI','BOCCA','TORACE','TORACE/EPIGASTRICO/MANDIBOLA','ARTO SUP.','SPALLA','MANO','ADDOME','BACINO','SCHIENA','APPARATO GENITALE','ARTO INF.','PIEDE','SANGUINA','EPISTASSI'];
                break;
            case 'DEFORMITA':
                opzioni = ['TESTA VOLTO','OCCHI','BOCCA','TORACE','ARTO SUP.','SPALLA','MANO','ADDOME','BACINO','SCHIENA','APPARATO GENITALE','ARTO INF.','PIEDE','SANGUINA','EPISTASSI'];
                break;
            case 'DISTRETTO TRAUMA':
                opzioni = ['TRAUMA PENETRANTE','TESTA VOLTO','OCCHI','BOCCA','TORACE','ARTO SUP.','SPALLA','MANO','ADDOME','BACINO','SCHIENA','APPARATO GENITALE','ARTO INF.','PIEDE','SANGUINA','EPISTASSI'];
                break;
            case 'EDEMA':
                opzioni = ['TESTA VOLTO','OCCHI','BOCCA','TORACE','ARTO SUP.','SPALLA','MANO','ADDOME','BACINO','SCHIENA','APPARATO GENITALE','ARTO INF.','PIEDE'];
                break;
            case 'SANGUINA':
                opzioni = ['EPISTASSI','FERITA/LACERAZIONE','FERITA ARMA DA FUOCO','FERITA ARMA BIANCA', 'TESTA VOLTO','BOCCA','EMOTTISI', 'EMATEMESI','TORACE','ARTO SUP.','SPALLA','MANO','ADDOME','EMATEMESI','BACINO','SCHIENA','APPARATO GENITALE','ARTO INF.','PIEDE'];
                break;
            case 'CUTE':
                opzioni = ['NORMALE','CIANOTICA','ARROSSATA','SUDATA','PALLIDO','PALLIDO + SUDATO','USTIONE'];
                break;
            case 'CPSS':
                opzioni = ['POSITIVA','NEGATIVA','PREGRESSO ICTUS', 'NON NOTO'];
                break;
            case 'CONVULSIONI':
                opzioni = ['EPILETTICO NOTO','MORSUS','IPO/IPERGLICEMIA', 'NON NOTO'];
                break;
            case 'DIABETICO':
                opzioni = ['IPO/IPERGLICEMIA','INSULINO DIPENDENTE', 'NON NOTO'];
                break;
            case 'ALTRI SEGNI':
                opzioni = ['ASTENIA','FEBBRE','TOSSE + FEBBRE','VOMITA','DIARREA','DIARREA E VOMITO','SPOSIZIONAMENTO SNG/PEG','SPOSIZIONAMENTO CATETERE','NO/NON NOTO'];
                break;
            case 'SEGUE':
                opzioni = ['ASTENIA','FEBBRE','TOSSE + FEBBRE','VOMITA','DIARREA','DIARREA E VOMITO','SPOSIZIONAMENTO SNG/PEG','SPOSIZIONAMENTO CATETERE','NO/NON NOTO'];
                break;
            case 'TRAVAGLIO':
                opzioni = ['CONTRAZIONI','PARTO PRECIPITOSO','ROTTURA DELLE ACQUE','ESPULSIONE','SECONDAMENTO'];
                break;
            case 'PSICHIATRICO NOTO':
                opzioni = ['ASO/TSO','AGITATO', 'NON NOTO'];
                break;
            default:
                opzioni = ['NO/NON NOTO'];
        }
        
        // Recupera il call object per gestire il salvataggio
        const popup = document.getElementById('popupMissione');
        const callId = popup?.getAttribute('data-call-id');
        const call = callId ? this.calls.get(callId) : null;
        
        opzioni.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            // Ripristina il valore salvato se corrisponde
            option.selected = call && call.noteEvento2 === opt;
            noteEvento2Select.appendChild(option);
        });
        
        // Aggiungi listener per salvare automaticamente
        noteEvento2Select.onchange = () => {
            if (call) {
                call.noteEvento2 = noteEvento2Select.value; // Salva automaticamente
            }
        };
    }

    updateMezzoMarkers() {
        if (!this.map || !this.mezzi) return;
        this.mezzi.forEach(m => {
            if (m._marker) {
                this.map.removeLayer(m._marker);
                m._marker = null;
            }
        });
        this.mezzi.forEach(m => {
            // Filter out SRA <-> SRM vehicles not belonging to current view
            const currentCentral = (window.selectedCentral||'').trim().toUpperCase();
            const vehicleCentral = (m.central||'').trim().toUpperCase();
            if ((currentCentral === 'SRA' && vehicleCentral === 'SRM') ||
                (currentCentral === 'SRM' && vehicleCentral === 'SRA')) return;            // Never show markers for vehicles in state 3 (sul posto)
            if (m.stato === 3) return;
            // Show markers only for movement states 2, 4 and 7
            if (![2, 4, 7].includes(m.stato)) return;
            
            // Determine icon based on vehicle type
            let iconUrl = 'src/assets/MSB.png'; // Default icon
            if (m.tipo_mezzo && m.tipo_mezzo.toUpperCase().includes('ELI')) {
                iconUrl = 'src/assets/ELI.png';
            } else if (m.tipo_mezzo && (m.tipo_mezzo.startsWith('MSA1') || m.tipo_mezzo.startsWith('MSA2'))
           && m.tipo_mezzo !== 'MSA1_A' && m.tipo_mezzo !== 'MSA2_A') {
                iconUrl = 'src/assets/MSA.png';
            }
            
            // Create the icon
            const icon = L.icon({
                iconUrl: iconUrl,
                iconSize: [32, 32],
                iconAnchor: [16, 32],
                popupAnchor: [0, -32]
            });
            
            // Compute displayName with prefix when vehicle from another central
            const prefixMap = { SRA:['SRL','SRP'], SRL:['SRA','SRM','SRP'], SRM:['SRL','SRP'], SRP:['SRA','SRL','SRM'] };
            let markerName = m.nome_radio;
            if (vehicleCentral && prefixMap[currentCentral]?.includes(vehicleCentral)) {
                markerName = `(${vehicleCentral}) ${m.nome_radio}`;
            }
            // Get stato description
            const statiMezzi = {
                1: "Libero in sede",
                2: "Diretto intervento",
                3: "In Posto", 
                4: "Diretto ospedale",
                5: "In ospedale",
                6: "Libero in ospedale",
                7: "Diretto in sede",
                8: "Non disponibile"
            };
            const statoDescrizione = statiMezzi[m.stato] || `Stato ${m.stato}`;
            
            m._marker = L.marker([m.lat, m.lon], { icon }).addTo(this.map)
                .bindPopup(`<b>Nome Radio:</b> ${markerName}<br><b>Tipo:</b> ${m.tipo_mezzo || 'N/D'}<br><b>Stato:</b> ${statoDescrizione}`);
        });
    }

    async moveMezzoGradualmente(mezzo, lat1, lon1, lat2, lon2, durataMinuti, statoFinale, callback) {
        // Se non è ELI, usa percorso stradale
        let percorso = [[lat1, lon1], [lat2, lon2]];
        if (mezzo.tipo_mezzo !== 'ELI') {
            percorso = await getPercorsoStradaleOSRM(lat1, lon1, lat2, lon2);
        }
        // Calcola quanti step totali (1 step al secondo simulato)
        const stepTotali = durataMinuti * 60;
        let stepAttuale = 0;
        // Suddividi il percorso in stepTotali punti
        let puntiPercorso = [];
        if (percorso.length <= 2) {
            // fallback: linea retta
            for (let i = 0; i <= stepTotali; i++) {
                const frac = i / stepTotali;
                puntiPercorso.push([
                    lat1 + (lat2 - lat1) * frac,
                    lon1 + (lon2 - lon1) * frac
                ]);
            }
        } else {
            // Interpola i punti del percorso OSRM per avere stepTotali punti
            for (let i = 0; i < stepTotali; i++) {
                const t = i / stepTotali * (percorso.length - 1);
                const idx = Math.floor(t);
                const frac = t - idx;
                const p1 = percorso[idx];
                const p2 = percorso[Math.min(idx + 1, percorso.length - 1)];
                puntiPercorso.push([
                    p1[0] + (p2[0] - p1[0]) * frac,
                    p1[1] + (p2[1] - p1[1]) * frac
                ]);
            }
            puntiPercorso.push([lat2, lon2]);
        }
        const self = this;
        let canceled = false;
        function step() {
            if (canceled) {
                console.log('[INFO] Movimento interrotto per il mezzo:', mezzo.nome_radio);
                return;
            }
            
            if (!window.simRunning) {
                simTimeout(step, 1);
                return;
            }
            
            if (stepAttuale < puntiPercorso.length) {
                mezzo.lat = puntiPercorso[stepAttuale][0];
                mezzo.lon = puntiPercorso[stepAttuale][1];
                if (self.updateMezzoMarkers) self.updateMezzoMarkers();
                stepAttuale++;
                if (stepAttuale < puntiPercorso.length) {
                    simTimeout(step, 1);
                } else {
                    mezzo.lat = lat2;
                    mezzo.lon = lon2;
                    setStatoMezzo(mezzo, statoFinale);
                    if (self.updateMezzoMarkers) self.updateMezzoMarkers();
                    if (typeof callback === 'function') callback();
                }
            }
        }
        simTimeout(step, 1);
        mezzo._cancelMove = () => { canceled = true; };
    }

    generateNewCall() {
        // Inizializza array per tracciare chiamate recenti se non esiste
        if (!this.recentChiamate) this.recentChiamate = [];
        if (!this.recentIndirizzi) this.recentIndirizzi = [];
        
        // Seleziona template di chiamata evitando ripetizioni recenti
        let chiamataTemplate = null;
        let testo_chiamata = '';
        if (this.chiamateTemplate) {
            const keys = Object.keys(this.chiamateTemplate);
            let availableKeys = keys.filter(key => !this.recentChiamate.includes(key));
            
            // Se tutti i template sono stati usati di recente, reset della lista
            if (availableKeys.length === 0) {
                this.recentChiamate = [];
                availableKeys = keys;
            }
            
            const sel = availableKeys[Math.floor(Math.random() * availableKeys.length)];
            chiamataTemplate = this.chiamateTemplate[sel];
            testo_chiamata = chiamataTemplate.testo_chiamata;
            
            // Aggiungi alla lista delle chiamate recenti
            this.recentChiamate.push(sel);
            // Mantieni solo le ultime 8 chiamate per evitare ripetizioni immediate
            if (this.recentChiamate.length > 8) {
                this.recentChiamate.shift();
            }
        }
        // Determina lista indirizzi in base al placeholder nel testo
        const rawText = testo_chiamata || '';
        // Match any placeholder '(X)' and capture full content including 'indirizzo' if presente
        const match = rawText.match(/\(\s*([^)]+?)\s*\)/i);
        let sourceList = this.indirizziReali || [];
        const catMap = this.categorieIndirizzi || {};
        if (match) {
            // Usa il contenuto completo del placeholder per formare la chiave
            const keyRaw = match[1].toLowerCase().trim();
            const key = keyRaw.replace(/\s+/g, '_');
            if (catMap[key] && catMap[key].length) {
                sourceList = catMap[key];
            }
        }
        // Seleziona indirizzo evitando ripetizioni recenti
        let availableIndices = [];
        for (let i = 0; i < sourceList.length; i++) {
            const addr = sourceList[i].indirizzo;
            if (!this.recentIndirizzi.includes(addr)) {
                availableIndices.push(i);
            }
        }
        
        // Se tutti gli indirizzi sono stati usati di recente, reset della lista
        if (availableIndices.length === 0) {
            this.recentIndirizzi = [];
            availableIndices = Array.from({length: sourceList.length}, (_, i) => i);
        }
        
        const idx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
        const indirizzo = sourceList[idx] || { indirizzo: 'Indirizzo sconosciuto', lat: 45.68, lon: 9.67 };
        
        // Aggiungi alla lista degli indirizzi recenti
        this.recentIndirizzi.push(indirizzo.indirizzo);
        // Mantieni solo gli ultimi 15 indirizzi per evitare ripetizioni immediate
        if (this.recentIndirizzi.length > 15) {
            this.recentIndirizzi.shift();
        }
        // Sostituisci ogni placeholder con il label della categoria (solo parte prima della virgola)
        const placeholderRegex = /\((?:indirizzo\s*)?[^)]+\)/gi;
        // Label: parte prima della virgola (es. 'RSA Treviglio')
        const categoryLabel = indirizzo.indirizzo.split(',')[0];
        testo_chiamata = (testo_chiamata || '').replace(placeholderRegex, categoryLabel);
        // Fallback testo chiamata se vuoto
        if (!testo_chiamata.trim()) {
            testo_chiamata = 'Paziente con sintomi da valutare...';
        }
        // Rimuove qualsiasi tag tra parentesi quadre (es. [OTT])
        testo_chiamata = testo_chiamata.replace(/\[[^\]]*\]/g, '').trim();
        
        // Randomly select case type (stabile/poco stabile/critico)

        const caseTypes = ['caso_stabile', 'caso_poco_stabile', 'caso_critico'];
        const weights = [0.5, 0.3, 0.2]; // 50% stable,  30% less stable, 20% critical
        let selectedCase = null;

        const rand = Math.random();
        let sum = 0;
               for (let i = 0; i < weights.length; i++) {
            sum += weights[i];
            if (rand < sum) {
                selectedCase = caseTypes[i];
                break;
            }
        }

        // Generazione automatica di alcuni campi
        // Campi lasciati vuoti per inserimento manuale
        const luogo = '';
        const motivo = '';
        const coscienza = '';
        const codice = '';


        const now = new Date();
        const year = now.getFullYear();
        const decina = Math.floor((year % 100) / 10);
        const unita = year % 10;
        const central = window.selectedCentral || 'SRA';
        const codeMap = { SRA: 1, SRL: 3, SRM: 5, SRP: 7 };
        const code = codeMap[central] || 1;
        // incrementa contatore progressivo per central
        this.missionCounter[central] = (this.missionCounter[central] || 0) + 1;
        
        const progressivo = this.missionCounter[central].toString().padStart(6, '0');
        const missioneId = `${decina}${unita}${code}${progressivo}`;
        const id = 'C' + Date.now() + Math.floor(Math.random()*1000);

        const call = {
            id,
            missioneId,
            location: indirizzo.indirizzo,
            indirizzo: indirizzo.indirizzo,
            lat: indirizzo.lat,
            lon: indirizzo.lon,
            // Use only template text for call description
            simText: testo_chiamata,
            luogo,
            motivo,
            coscienza,
            codice,
            mezziAssegnati: [],
            selectedChiamata: chiamataTemplate,
            selectedCase: selectedCase
        };
        this.calls.set(id, call);
        this.ui.showNewCall(call);
        if (this.map) {
           
            const marker = L.marker([call.lat, call.lon], {
                icon: L.icon({
                    iconUrl: 'src/assets/marker-rosso.png',
                    iconSize: [36, 36],    // increased size
                    iconAnchor: [18, 36],  // center bottom
                    popupAnchor: [0, -36]
                })
            }).addTo(this.map).bindPopup(`<b>Chiamata</b><br>${call.indirizzo || call.location || 'Indirizzo sconosciuto'}`);
            call._marker = marker;
        }
    }

    openMissionPopup(call) {
        const popup = document.getElementById('popupMissione');
        if (!popup) return;
        // Initialize VVF/FFO checkboxes from call state and add live synchronization
        const vvfCheckbox = document.getElementById('check-vvf');
        const ffoCheckbox = document.getElementById('check-ffo');
        if (vvfCheckbox) {
            // Pre-select saved value
            vvfCheckbox.checked = !!call.vvfAllertati;
            // Live update on change
            vvfCheckbox.onchange = () => { call.vvfAllertati = vvfCheckbox.checked; };
        }
        if (ffoCheckbox) {
            ffoCheckbox.checked = !!call.ffoAllertate;
            ffoCheckbox.onchange = () => { call.ffoAllertate = ffoCheckbox.checked; };
        }
        // Microphone button logic: show/hide call text
        const btnMicrofono = document.getElementById('btn-microfono');
        const testoChiamataDiv = document.getElementById('testo-chiamata-popup');
        if (btnMicrofono && testoChiamataDiv) {
            // Reset state
            testoChiamataDiv.style.display = 'none';
            btnMicrofono.setAttribute('aria-pressed', 'false');
            // Set text
            testoChiamataDiv.textContent = call.simText || 'Testo chiamata non disponibile.';
            // Remove previous listener if any
            btnMicrofono.onclick = null;
            btnMicrofono.onclick = function() {
                const isVisible = testoChiamataDiv.style.display !== 'none';
                if (isVisible) {
                    testoChiamataDiv.style.display = 'none';
                    btnMicrofono.setAttribute('aria-pressed', 'false');
                } else {
                    testoChiamataDiv.style.display = 'block';
                    btnMicrofono.setAttribute('aria-pressed', 'true');
                }
            };
        }
        // Centra il popup ogni volta che si apre
        popup.style.left = '50%';
        popup.style.top = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.classList.remove('hidden');
        // Salva l'id della chiamata come attributo sul popup per referenza sicura
        popup.setAttribute('data-call-id', call.id);
        const mezzi = (this.mezzi || []).map(m => {
            const dist = (call.lat && call.lon && m.lat && m.lon)
                ? distanzaKm(m.lat, m.lon, call.lat, call.lon)
                : Infinity;
            return { ...m, _dist: dist };
        }).sort((a, b) => (a._dist || 0) - (b._dist || 0));

        // Funzione per aggiornare la tabella dei mezzi nel popup missione
        this.updateMissionPopupTable = function(call) {
            // Ottimizzazione tabella mezzi: compatta, moderna, coerente
            const sec = window.simTime || 0;
            const hh = Math.floor(sec/3600) % 24;
            const mm = Math.floor((sec % 3600) / 60);
            const orario = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
            const raw = mezzi.filter(m => [1,2].includes(m.stato) && isMezzoOperativo(m, orario));
            const mezziFiltrati = Array.from(
                new Map(raw.map(m => [m.nome_radio.trim(), m])).values()
            );
            let html = `<table class='stato-mezzi-table'>
                <thead><tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Conv.</th>
                    <th>Distanza</th>
                </tr></thead>
                <tbody>`;
            mezziFiltrati.forEach(m => {
                let icon = '';
                if (m.stato === 1) icon = '✅';
                else if (m.stato === 2) icon = '🚑';
                else if (m.stato === 7) icon = '↩️';
                const checked = (call.mezziAssegnati||[]).includes(m.nome_radio) ? 'checked' : '';
                const disabledAttr = ![1,2,7].includes(m.stato) ? 'disabled' : '';
                const currentCentral = (window.selectedCentral||'').trim().toUpperCase();
                const vehicleCentral = (m.central||'').trim().toUpperCase();
                const prefixMap = { SRA:['SRL','SRP'], SRL:['SRA','SRM','SRP'], SRM:['SRL','SRP'], SRP:['SRA','SRL','SRM'] };
                let displayName = m.nome_radio;
                if (vehicleCentral && prefixMap[currentCentral]?.includes(vehicleCentral)) {
                    displayName = `(${vehicleCentral}) ${m.nome_radio}`;
                }
                const distanza = (m._dist !== undefined && isFinite(m._dist))
                    ? `${m._dist.toFixed(1)} km`
                    : `<span data-mezzo-dist="${m.nome_radio}">...</span>`;
                html += `<tr>`+
                    `<td><label><input type='checkbox' name='mezzi' value='${m.nome_radio}' ${checked} ${disabledAttr}><span>${icon} ${displayName}</span></label></td>`+
                    `<td>${m.tipo_mezzo || ''}</td>`+
                    `<td>${m.convenzione || ''}</td>`+
                    `<td>${distanza}</td>`+
                `</tr>`;
            });
            html += `</tbody></table>`;

            const mezziAssegnatiDiv = document.getElementById('mezziAssegnatiScroll');
            if (mezziAssegnatiDiv) mezziAssegnatiDiv.innerHTML = html;
            // Event listener per i checkbox
            if (mezziAssegnatiDiv) {
                mezziAssegnatiDiv.addEventListener('change', function(e) {
                    if (e.target.type === 'checkbox' && e.target.name === 'mezzi') {

                        const mezzoId = e.target.value;
                        const mezzo = window.mezzi.find(m => m.nome_radio === mezzoId);
                        
                        if (!e.target.checked && mezzo && (call.mezziAssegnati || []).includes(mezzoId)) {
                            // Informazione visiva che il mezzo sarà rimosso e mandato in sede
                            const row = e.target.closest('tr');
                            if (row) {
                                if (!row.hasAttribute('data-original-bg')) {
                                    row.setAttribute('data-original-bg', row.style.background || '');
                                }
                                row.style.background = '#fff9c4'; // Giallo chiaro
                                
                                // Aggiungi messaggio informativo
                                const td = row.querySelector('td:last-child');
                                if (td && !td.querySelector('.mezzo-remove-info')) {
                                    const infoSpan = document.createElement('span');
                                    infoSpan.className = 'mezzo-remove-info';
                                    infoSpan.style.color = '#d32f2f';
                                    infoSpan.style.fontStyle = 'italic';
                                    infoSpan.style.fontSize = '12px';
                                    infoSpan.textContent = ' → Sarà rimosso e inviato in sede';
                                    td.appendChild(infoSpan);
                                }
                            }
                        } else if (e.target.checked) {
                            // Ripristina lo stile originale
                            const row = e.target.closest('tr');
                            if (row) {
                                if (row.hasAttribute('data-original-bg')) {
                                    row.style.background = row.getAttribute('data-original-bg');
                                }
                                
                                // Rimuovi il messaggio informativo
                                const infoSpan = row.querySelector('.mezzo-remove-info');
                                if (infoSpan) infoSpan.remove();
                            }
                        }
                    }
                });
            }
        };

        const indirizzoSpan = document.getElementById('missione-indirizzo');
        if (indirizzoSpan) indirizzoSpan.textContent = call.location || call.indirizzo || '';
        const indirizzoInput = document.getElementById('indirizzo');
        if (indirizzoInput) {
            indirizzoInput.value = call.location || '';
            indirizzoInput.readOnly = true;
        }
        const luogoSelect = document.getElementById('luogo');
        if (luogoSelect) {
            // RIMUOVI listener precedenti per evitare duplicati
            luogoSelect.replaceWith(luogoSelect.cloneNode(false));
            const newLuogoSelect = document.getElementById('luogo');
            
            newLuogoSelect.innerHTML = '';
            // Aggiungi opzione vuota come prima opzione
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-- Seleziona luogo --';
            emptyOption.selected = !call.luogo; // Seleziona solo se non c'è valore salvato
            newLuogoSelect.appendChild(emptyOption);
            
            const opzioniLuogo = ['CASA','STRADA','UFFICI ED ES. PUBBL.','STR. SANITARIA','IMPIANTO SPORTIVO','IMPIANTO LAVORATIVO','SCUOLE','STAZIONE','FERROVIA','METROPOLITANA','AEREOPORTI','QUESTURA/CASERME','LUOGHI DI CULTO','IMPERVIO','ALTRO LUOGO'];
            opzioniLuogo.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                option.selected = call.luogo === opt; // Ripristina valore salvato
                newLuogoSelect.appendChild(option);
            });
            
            // Event listener per aggiornare Dett. Luogo e salvare automaticamente - UNA SOLA VOLTA
            newLuogoSelect.addEventListener('change', () => {
                call.luogo = newLuogoSelect.value; // Salva automaticamente
                this.updateDettLuogo(newLuogoSelect.value);
            });
        }
        
        // Lascia vuoto il campo Dett. Luogo inizialmente
        
        const motivoSelect = document.getElementById('motivo');
        if (motivoSelect) {
            // RIMUOVI listener precedenti per evitare duplicati
            motivoSelect.replaceWith(motivoSelect.cloneNode(false));
            const newMotivoSelect = document.getElementById('motivo');
            
            newMotivoSelect.innerHTML = '';
            // Aggiungi opzione vuota come prima opzione
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-- Seleziona motivo --';
            emptyOption.selected = !call.motivo; // Seleziona solo se non c'è valore salvato
            newMotivoSelect.appendChild(emptyOption);
            
            const opzioniMotivo = ['MEDICO ACUTO','SOCCORSO PERSONA','EVENTO VIOLENTO','CADUTA','INCIDENTE/INFORTUNIO','INC. STRADALE','INC. FERROVIA','INC. ARIA','INC. ACQUA','INC. MONTANO','INC. SPELEO/FORRA','INTOSSICAZIONE','ANIMALI','PREVENZIONE','EVENTO DI MASSA','MAXI EMERGENZA','SOCCORSO SECONDARIO','ALTRO/NON NOTO'];
            opzioniMotivo.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                option.selected = call.motivo === opt; // Ripristina valore salvato
                newMotivoSelect.appendChild(option);
            });
            
            // Event listener per aggiornare Dett. Motivo e salvare automaticamente - UNA SOLA VOLTA
            newMotivoSelect.addEventListener('change', () => {
                call.motivo = newMotivoSelect.value; // Salva automaticamente
                this.updateDettMotivo(newMotivoSelect.value);
            });
        }
        
        // Lascia vuoto il campo Dett. Motivo inizialmente
        
        const coscienzaSelect = document.getElementById('coscienza');
        if (coscienzaSelect) {
            // RIMUOVI listener precedenti per evitare duplicati
            coscienzaSelect.replaceWith(coscienzaSelect.cloneNode(false));
            const newCoscienzaSelect = document.getElementById('coscienza');
            
            newCoscienzaSelect.innerHTML = '';
            // Aggiungi opzione vuota come prima opzione
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-- Seleziona coscienza --';
            emptyOption.selected = !call.coscienza; // Seleziona solo se non c'è valore salvato
            newCoscienzaSelect.appendChild(emptyOption);
            
            const opzioniCoscienza = ['RISPONDE','ALTERATA','NON RISPONDE','NON RISPONDE NON RESPIRA','INCOSCIENTE','NON NOTO'];
            opzioniCoscienza.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                option.selected = call.coscienza === opt; // Ripristina valore salvato
                newCoscienzaSelect.appendChild(option);
            });
            
            // Aggiungi listener per salvare automaticamente - UNA SOLA VOLTA
            newCoscienzaSelect.addEventListener('change', () => {
                call.coscienza = newCoscienzaSelect.value; // Salva automaticamente
            });
        }
        
        const noteEventoSelect = document.getElementById('note-evento');
        if (noteEventoSelect) {
            // RIMUOVI listener precedenti per evitare duplicati
            noteEventoSelect.replaceWith(noteEventoSelect.cloneNode(false));
            const newNoteEventoSelect = document.getElementById('note-evento');
            
            newNoteEventoSelect.innerHTML = '';
            // Aggiungi opzione vuota come prima opzione
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-- Seleziona note evento --';
            emptyOption.selected = !call.noteEvento; // Seleziona solo se non c'è valore salvato
            newNoteEventoSelect.appendChild(emptyOption);
            
            const opzioniNoteEvento = ['RESPIRA','DOLORE','DEFORMITA','CARDIOCIRCOLATORIO','EDEMA','DISTRETTO TRAUMA','CONVULSIONI','CPSS','VERTIGINI','STATO CONFUSIONALE','ASTENIA','SEGNI','CUTE','SANGUINA','ABRASIONE/CONTUSIONE','DIABETICO','INSUFFICIENZA RENALE','PENETRANTE','PROIETTATO','SBALZATO','INCASTRATO','-2.5 MT','2.5 - 5 MT','+ 5 MT','TRAVAGLIO','CONTRAZIONI - 5 MIN','GRAVIDANZA','PARTO','INCENDIO','INCENDIO INDUSTRIALE','INCENDIO ABITAZIONE','SOSP INTOSSICAZIONE DA MONOSSIDO','AUTOLESIONISMO','PSICHIATRICO NOTO','NO/NON NOTO','ALTRI SEGNI','SEGUE'];
            opzioniNoteEvento.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                option.selected = call.noteEvento === opt; // Ripristina valore salvato
                newNoteEventoSelect.appendChild(option);
            });
            
            // Event listener per aggiornare Note evento 2 e salvare automaticamente - UNA SOLA VOLTA
            newNoteEventoSelect.addEventListener('change', () => {
                call.noteEvento = newNoteEventoSelect.value; // Salva automaticamente
                this.updateNoteEvento2(newNoteEventoSelect.value);
            });
        }
        
        // Lascia vuoto il campo Note evento 2 inizialmente
        
        const noteEvento2Select = document.getElementById('note-evento2');
        
        const codiceSelect = document.getElementById('codice');
        if (codiceSelect) {
            // RIMUOVI listener precedenti per evitare duplicati
            codiceSelect.replaceWith(codiceSelect.cloneNode(false));
            const newCodiceSelect = document.getElementById('codice');
            
            newCodiceSelect.innerHTML = '';
            // Aggiungi opzione vuota come prima opzione
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-- Seleziona codice --';
            emptyOption.selected = !call.codice; // Seleziona solo se non c'è valore salvato
            newCodiceSelect.appendChild(emptyOption);
            
            ['ROSSO','GIALLO','VERDE'].forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                option.selected = call.codice === opt; // Ripristina valore salvato
                newCodiceSelect.appendChild(option);
            });
            
            // Aggiungi listener UNA SOLA VOLTA
            newCodiceSelect.addEventListener('change', () => {
                call.codice = newCodiceSelect.value; // Salva automaticamente
            });
        }
        const note1 = document.getElementById('altro-evento');
        if (note1) {
            note1.value = call.altroEvento || '';
            // Aggiungi listener per salvare automaticamente
            note1.addEventListener('input', () => {
                call.altroEvento = note1.value; // Salva automaticamente
            });
        }
        const note2 = document.getElementById('note2');
        if (note2) {
            note2.value = call.note2 || '';
            // Aggiungi listener per salvare automaticamente
            note2.addEventListener('input', () => {
                call.note2 = note2.value; // Salva automaticamente
            });
        }

        // Popola i campi dipendenti se ci sono valori salvati
        // Reset campi dipendenti per nuove missioni
        const dettLuogoSelect = document.getElementById('dett-luogo');
        if (dettLuogoSelect) {
            dettLuogoSelect.innerHTML = '<option value="">-- Seleziona dettaglio luogo --</option>';
        }
        const dettMotivoSelect = document.getElementById('dett-motivo');
        if (dettMotivoSelect) {
            dettMotivoSelect.innerHTML = '<option value="">-- Seleziona dettaglio motivo --</option>';
        }
        document.getElementById('note-evento2').innerHTML = '<option value="">-- Seleziona note evento 2 --</option>';
        if (call.luogo) {
            this.updateDettLuogo(call.luogo);
        }
        if (call.motivo) {
            this.updateDettMotivo(call.motivo);
        }
        if (call.noteEvento) {
            this.updateNoteEvento2(call.noteEvento);
        }

        const btnsRapidi = [
            {tipo:'MSB', label:'MSB'},
            {tipo:'MSA1', label:'MSA1'},
            {tipo:'MSA2', label:'MSA2'},
            {tipo:'ELI', label:'ELI'}
        ];
        const btnsRapidiDiv = document.getElementById('btnsRapidiMezzi');
               if (btnsRapidiDiv) {
            btnsRapidiDiv.innerHTML = btnsRapidi.map(b =>
                `<button type='button' class='btn-rapido-mezzo' data-tipo='${b.tipo}' style='font-size:15px;padding:2px 10px 2px 10px;border-radius:4px;background:#1976d2;color:#fff;border:none;line-height:1.2;min-width:44px;'>${b.label}</button>`
            ).join('');
        }

        // Mostra mezzi in stato 1, 2, 6, 7 oppure già assegnati, quindi deduplica per nome_radio
        const rawMezziFiltrati = mezzi.filter(m => [1,2,6,7].includes(m.stato) || (call.mezziAssegnati||[]).includes(m.nome_radio));
        const mezziFiltrati = Array.from(
            new Map(
                rawMezziFiltrati.map(m => [m.nome_radio.trim(), m])
            ).values()
        );
        let html = `<table class='stato-mezzi-table' style='width:100%;margin-bottom:0;'>
            <thead><tr>
                <th style='width:38%;text-align:left; padding:1px 2px;'>Nome</th>
                <th style='width:22%;text-align:left; padding:1px 2px;'>Tipo</th>
                <th style='width:12%;text-align:left; padding:1px 2px;'>Conv.</th>
                <th style='width:28%;text-align:left; padding:1px 2px;'>Distanza</th>
            </tr></thead>
            <tbody>`;
        mezziFiltrati.forEach(m => {
            // Set background color based on state: 1=green, 2=yellow, 7=grey
            // Se è in stato 1 ma ha già una chiamata assegnata, usa un colore diverso (arancione)
            let evidenzia = '';
            if (m.stato === 1 && m.chiamata) evidenzia = 'background:#ffcc80;'; // Arancione: stato 1 ma impegnato
            else if (m.stato === 1) evidenzia = 'background:#e8f5e9;'; // Verde: stato 1 libero
            else if (m.stato === 2) evidenzia = 'background:#fff9c4;'; // Giallo: in viaggio
            else if (m.stato === 7) evidenzia = 'background:#eeeeee;'; // Grigio: rientro
            // Add icon based on state
            let icon = '';
            if (m.stato === 1 && m.chiamata) icon = '⏳ '; // Clessidra: aspetta di partire
            else if (m.stato === 1) icon = '✅ '; // Check: libero
            else if (m.stato === 2) icon = '🚑 '; // Ambulanza: in viaggio
            else if (m.stato === 7) icon = '↩️ '; // Freccia: rientro
            // Solo i mezzi già assegnati a questa chiamata specifica vengono spuntati
            const checked = (call.mezziAssegnati||[]).includes(m.nome_radio) ? 'checked' : '';
            // Disable checkbox if vehicle is not in allowed states
            const disabledAttr = ![1,2,7].includes(m.stato) ? 'disabled' : '';
            // Compute displayName with prefix for vehicles from other centrals
            const currentCentral = (window.selectedCentral||'').trim().toUpperCase();
            const vehicleCentral = (m.central||'').trim().toUpperCase();
            const prefixMap = { SRA:['SRL','SRP'], SRL:['SRA','SRM','SRP'], SRM:['SRL','SRP'], SRP:['SRA','SRL','SRM'] };
            let displayName = m.nome_radio;
            if (vehicleCentral && prefixMap[currentCentral]?.includes(vehicleCentral)) {
                displayName = `(${vehicleCentral}) ${m.nome_radio}`;
            }
            // Compute distance display for each mezzo
            const distanza = (m._dist !== undefined && isFinite(m._dist))
                ? `${m._dist.toFixed(1)} km`
                : `<span data-mezzo-dist="${m.nome_radio}">...</span>`;
            html += `<tr style='${evidenzia}'>`+
                `<td style='white-space:nowrap;padding:1px 2px;text-align:left;'>`+
                `<label style='display:flex;align-items:center;gap:1px;'>`+
                `<input type='checkbox' name='mezzi' value='${m.nome_radio}' ${checked} ${disabledAttr} style='margin:0 2px 0 0;vertical-align:middle;'><span style='vertical-align:middle;'>${icon}${displayName}</span>`+
                `</label></td>`+
                `<td style='padding:1px 2px;text-align:left;'>${m.tipo_mezzo || ''}</td>`+
                `<td style='padding:1px 2px;text-align:left;'>${m.convenzione || ''}</td>`+
                `<td style='padding:1px 2px;text-align:left;'>${distanza}</td>`+
            `</tr>`;
        });
        html += `</tbody></table>`;

        const mezziAssegnatiDiv = document.getElementById('mezziAssegnatiScroll');
        if (mezziAssegnatiDiv) mezziAssegnatiDiv.innerHTML = html;
        attachBtnListeners();

        function attachBtnListeners() {
            document.querySelectorAll('.btn-rapido-mezzo').forEach(btn => {
                btn.onclick = function() {
                    const tipo = btn.getAttribute('data-tipo');
                    // Seleziona solo il primo mezzo non ancora selezionato di quel tipo
                    const checkboxes = Array.from(document.querySelectorAll('#mezziAssegnatiScroll input[type=checkbox]'));
                    // Consider only vehicles in state 1, 2 or 7
                    const mezziTipo = mezziFiltrati.filter(m => m.tipo_mezzo && m.tipo_mezzo.startsWith(tipo) && [1,7].includes(m.stato));
                    for (const m of mezziTipo) {
                        const cb = checkboxes.find(c => c.value === m.nome_radio);
                        if (cb && !cb.checked) {
                            cb.checked = true;
                            break;
                        }
                    }
                };
            });
        }
    }

    chiudiPopup() {
        const popup = document.getElementById('popupMissione');
        if (popup) popup.classList.add('hidden');
    }

    confirmCall() {
        const popup = document.getElementById('popupMissione');
        // Recupera l'id della chiamata dal popup
        const callId = popup?.getAttribute('data-call-id');
        const call = callId ? this.calls.get(callId) : null;
        // Lettura checkbox VVF e FFO
        const vvf = document.getElementById('check-vvf')?.checked || false;
        const ffo = document.getElementById('check-ffo')?.checked || false;
        if (call) {
            call.vvfAllertati = vvf;
            call.ffoAllertate = ffo;
        }
        if (!call) return;
        const luogo = document.getElementById('luogo')?.value || '';
        const dettLuogo = document.getElementById('dett-luogo')?.value || '';
        const motivo = document.getElementById('motivo')?.value || '';
        const dettMotivo = document.getElementById('dett-motivo')?.value || '';
        const coscienza = document.getElementById('coscienza')?.value || '';
        const noteEvento = document.getElementById('note-evento')?.value || '';
        const noteEvento2 = document.getElementById('note-evento2')?.value || '';
        const altroEvento = document.getElementById('altro-evento')?.value || '';
        const codice = document.getElementById('codice')?.value || '';
        
        call.luogo = luogo;
        call.dettLuogo = dettLuogo;
        call.motivo = motivo;
        call.dettMotivo = dettMotivo;
        call.coscienza = coscienza;
        call.noteEvento = noteEvento;
        call.noteEvento2 = noteEvento2;
        call.altroEvento = altroEvento;
        call.codice = codice;
        // Query robusta per i mezzi selezionati
        const mezziChecked = Array.from(document.querySelectorAll('#popupMissione input[type=checkbox][name=mezzi]:checked')).map(cb => cb.value);
        
        // Ottieni i mezzi precedentemente assegnati alla chiamata
        const prev = call.mezziAssegnati || [];
        
        // Identifica mezzi precedentemente assegnati che sono stati deselezionati
        const mezziRimossi = prev.filter(mezzoId => !mezziChecked.includes(mezzoId));
        
        // Identifica i nuovi mezzi aggiunti (non ancora presenti tra quelli assegnati)
        const aggiunti = mezziChecked.filter(id => !prev.includes(id));
        
        // Aggiorna la lista dei mezzi assegnati con i veicoli selezionti
        call.mezziAssegnati = mezziChecked;
        // Aggiorna immediatamente il pannello missione in corso per riflettere le rimozioni
        if (window.game.ui && typeof window.game.ui.updateMissioneInCorso === 'function') {
            window.game.ui.updateMissioneInCorso(call);
        }
        
        // Gestisci i mezzi rimossi (deselezionati)
        mezziRimossi.forEach(mezzoId => {
            const mezzo = window.game.mezzi.find(m => m.nome_radio === mezzoId);
            if (mezzo) {
                console.log('[INFO] Mezzo rimosso dalla missione:', mezzo.nome_radio);
                
                // Interrompi qualsiasi movimento in corso
                interrompiMovimento(mezzo);
                
                // Rimuovi il riferimento alla chiamata
                mezzo.chiamata = null;
                
                // Se il mezzo è in stato 2 o 3, mandalo in rientro (stato 7)
                if ([2, 3].includes(mezzo.stato)) {
                    setStatoMezzo(mezzo, 7);
                    
                    // Avvia il rientro in sede
                    if (window.game && window.game.gestisciStato7) {
                        window.game.gestisciStato7(mezzo);
                    }
               }
            }
        });
        
        // Gestisci i mezzi selezionati
        window.game.mezzi.forEach(m => {
            // Processa solo i mezzi nuovi aggiunti a questa chiamata
            if (aggiunti.includes(m.nome_radio)) {
                // Prima di assegnare la nuova chiamata, controlla lo stato del mezzo
                // e gestisci l'interruzione di eventuali percorsi in corso
                if (m.stato === 2) {
                    // Stato 2: mezzo diretto a un intervento, interrompere e reindirizzare
                    console.log('[INFO] Reindirizzamento mezzo in stato 2:', m.nome_radio);
                    interrompiMovimento(m);
                    // Rimuovi il mezzo dalla vecchia chiamata se presente
                    if (m.chiamata && m.chiamata.id !== call.id) {
                        const vecchiaChiamata = m.chiamata;
                        if (vecchiaChiamata.mezziAssegnati) {
                            vecchiaChiamata.mezziAssegnati = vecchiaChiamata.mezziAssegnati.filter(n => n !== m.nome_radio);
                            // Instead of closing the mission when no vehicles remain, always update to show 'nessun mezzo assegnato'
                            if (window.game.ui && typeof window.game.ui.updateMissioneInCorso === 'function') {
                                window.game.ui.updateMissioneInCorso(vecchiaChiamata);
                            }
                        }
                    }
                } else if (m.stato === 6) {
                    // Stato 6: mezzo libero in ospedale, cambiare a stato 2
                    console.log('[INFO] Attivazione mezzo in stato 6:', m.nome_radio);
                    interrompiMovimento(m);
                } else if (m.stato === 7) {
                    // Stato 7: mezzo in rientro, interrompere e assegnare nuova missione
                    console.log('[INFO] Riattivazione mezzo da rientro (stato 7):', m.nome_radio);
                    interrompiMovimento(m);
                    m._inRientroInSede = false;
                    // pulisci vecchi riferimenti
                    m.ospedale = null;
                    m.codice_trasporto = null;
                    // Evita che setStatoMezzo(1) chiuda la missione corrente togliendo questo mezzo
                    // rimuovendolo temporaneamente da call.mezziAssegnati prima del passaggio di stato
                    let eraSelezionato = false;
                    if (Array.isArray(call.mezziAssegnati) && call.mezziAssegnati.includes(m.nome_radio)) {
                        eraSelezionato = true;
                        call.mezziAssegnati = call.mezziAssegnati.filter(n => n !== m.nome_radio);
                    }
                    // CORRETTO: passa a stato 1, poi direttamente a 2 per assegnazione nuova missione
                    setStatoMezzo(m, 1);
                    // Dopo il passaggio a stato 1, il mezzo viene rimosso da tutte le chiamate
                    // Re-aggancialo esplicitamente alla chiamata corrente e aggiorna l'UI
                    if (!Array.isArray(call.mezziAssegnati)) call.mezziAssegnati = [];
                    if (eraSelezionato || !call.mezziAssegnati.includes(m.nome_radio)) {
                        call.mezziAssegnati.push(m.nome_radio);
                    }
                    // assegna chiamata e reset flags
                    m.chiamata = call;
                    if (window.game.ui && typeof window.game.ui.updateMissioneInCorso === 'function') {
                        window.game.ui.updateMissioneInCorso(call);
                    }
                    // Passa direttamente a stato 2
                    setStatoMezzo(m, 2, true);
                    m._reportProntoInviato = false;
                    m._timerReportPronto = null;
                    m._menuOspedaliShown = false;
                    // Pulizia comunicazioni e reset trasporto
                    m.comunicazioni = [];
                    m._trasportoConfermato = false;
                    m._trasportoAvviato = false;
                    // aggiorna UI, marker, e pannello missione in corso
                    window.game.ui.updateStatoMezzi(m);
                    window.game.updateMezzoMarkers();
                    // NON fare return qui - continua per avviare il timer di partenza
                } else if (m.stato === 3) {
                    // Stato 3: mezzo già in missione, interrompere e reindirizzare
                    console.log('[INFO] Reindirizzamento mezzo in stato 3:', m.nome_radio);
                    interrompiMovimento(m);
                    // reset old hospital and transport code to avoid carrying over
                    m.ospedale = null;
                    m.codice_trasporto = null;
                    // Forza transizione scena->disponibile->intervento
                    // Evita che setStatoMezzo(1) chiuda la missione corrente togliendo questo mezzo
                    // rimuovendolo temporaneamente da call.mezziAssegnati prima del passaggio di stato
                    let eraSelezionato3 = false;
                    if (Array.isArray(call.mezziAssegnati) && call.mezziAssegnati.includes(m.nome_radio)) {
                        eraSelezionato3 = true;
                        call.mezziAssegnati = call.mezziAssegnati.filter(n => n !== m.nome_radio);
                    }
                    setStatoMezzo(m, 1);
                    setStatoMezzo(m, 2, true); // MANUALE: con suono confirm
                    // Assegna la nuova chiamata e reset flags
                    // Dopo il passaggio a stato 1, il mezzo viene rimosso da tutte le chiamate
                    // Re-aggancialo esplicitamente alla chiamata corrente prima di assegnarla al mezzo
                    if (!Array.isArray(call.mezziAssegnati)) call.mezziAssegnati = [];
                    if (eraSelezionato3 || !call.mezziAssegnati.includes(m.nome_radio)) {
                        call.mezziAssegnati.push(m.nome_radio);
                    }
                    m.chiamata = call;
                    if (window.game.ui && typeof window.game.ui.updateMissioneInCorso === 'function') {
                        window.game.ui.updateMissioneInCorso(call);
                    }
                    m._reportProntoInviato = false;
                    m._timerReportPronto = null;
                    m._menuOspedaliShown = false;
                }
                
                // Assigna la nuova chiamata al mezzo
                m.chiamata = call;
                
                // AGGIUNTO: Riproduci immediatamente il suono confirm per assegnazione manuale
                if (aggiunti.length > 0 && aggiunti.includes(m.nome_radio)) {
                    console.log('[DEBUG] Riproduco suono confirm per assegnazione manuale di:', m.nome_radio);
                    window.soundManager?.play('confirm');
                }
                
                // Reset report and menu flags for new mission assignment
                m._reportProntoInviato = false;
                m._timerReportPronto = null;
                m._menuOspedaliShown = false;
                
                // MODIFICA: Non mettere subito a stato 2, lasciare a stato 1 
                // Il passaggio a stato 2 sarà gestito dal timer di partenza specifico
                if ([6].includes(m.stato)) {
                    setStatoMezzo(m, 1); // Prima a stato 1, poi il timer gestirà il passaggio a 2
                }
                // Se è già a stato 1, non fare nulla qui
            }
        });
        
        // Chiudi popup e aggiorna UI immediatamente
        popup?.classList.add('hidden');
        const callDiv = document.getElementById(`call-${call.id}`);
        if (callDiv) callDiv.remove();
        // Aggiungi la missione al pannello "Eventi in corso"
        if (this.ui && typeof this.ui.moveCallToEventiInCorso === 'function') {
            this.ui.moveCallToEventiInCorso(call);
        }

        // Esegui dopo che l'UI è stata aggiornata, per mantenere il sistema reattivo
        // Avvia i movimenti dei mezzi verso la chiamata con ritardi specifici per tipo di mezzo
        if (window.game && window.game.mezzi) {
            const mezziDaProcessare = window.game.mezzi.filter(m => 
                aggiunti.includes(m.nome_radio) && 
                m.stato === 1 && // CORRETTO: ora filtriamo su stato 1 invece di 2
                !m._inMovimentoMissione && 
                m.chiamata === call
            );
            
            // Processa ogni mezzo con il suo ritardo specifico
            mezziDaProcessare.forEach((m, indice) => {
                // Calcola il ritardo di partenza specifico per questo tipo di mezzo
                const ritardoPartenza = getRitardoPartenza(m.tipo_mezzo);
                // DEBUG: logga info dettagliate sulla partenza
                console.log(`[DEBUG] Mezzo: ${m.nome_radio}, tipo_mezzo: '${m.tipo_mezzo}', ritardoPartenza: ${ritardoPartenza} secondi (${(ritardoPartenza/60).toFixed(2)} minuti)`);
                
                // Memorizza quando il mezzo deve partire (in secondi simulati)
                const tempoPartenzaSimulato = (window.simTime || 0) + ritardoPartenza;
                const oraAttuale = formatSimTime(window.simTime || 0);
                const oraPartenza = formatSimTime(tempoPartenzaSimulato);
                
                // Memorizza i dati per il controllo della partenza
                m._tempoPartenzaSimulato = tempoPartenzaSimulato;
                m._chiamataPartenza = call.id;
                m._inAttesaPartenza = true;
                
                console.log(`[DEBUG] Programmata partenza per ${m.nome_radio} alle ore simulate ${oraPartenza} (ora attuale: ${oraAttuale}, ritardo: ${(ritardoPartenza/60).toFixed(1)} min)`);
                
                // Funzione per controllare se è ora di partire
                function controllaPartenza() {
                    // Se il tempo simulato attuale è >= tempo di partenza programmato
                    if ((window.simTime || 0) >= m._tempoPartenzaSimulato && m._inAttesaPartenza) {
                        // Ricontrolla che il mezzo sia ancora assegnato a questa chiamata
                        if (!m.chiamata || m.chiamata.id !== call.id || m._inMovimentoMissione) {
                            console.log(`[DEBUG] Partenza annullata per ${m.nome_radio} - condizioni cambiate`);
                            m._inAttesaPartenza = false;
                            return;
                        }
                        
                        const oraEffettivaPartenza = formatSimTime(window.simTime || 0);
                        console.log(`[INFO] Avvio movimento mezzo verso la nuova chiamata: ${m.nome_radio} alle ore simulate ${oraEffettivaPartenza}`);
                        
                        // Rimuovi il flag di attesa
                        m._inAttesaPartenza = false;
                        
                        // AGGIUNTO: Prima di avviare il movimento, passa il mezzo a stato 2
                        // NON riprodurre suono qui - è già stato riprodotto all'assegnazione
                        setStatoMezzo(m, 2, false);
                        
                        // Calcola la distanza e il tempo necessario
                        const dist = distanzaKm(m.lat, m.lon, call.lat, call.lon);
                        
                        // Usa una versione preimpostata di velocità per ridurre i calcoli
                        let velBase;
                        if (m.tipo_mezzo === 'ELI') velBase = 180;
                        else if (m.tipo_mezzo.startsWith('MSA')) velBase = 60;
                        else velBase = 50; // MSB e altri

                        let riduzione = 0;
                        if (call.codice === 'Rosso') riduzione = 0.15;
                        else if (call.codice === 'Giallo') riduzione = 0.10;
                    
                        else if (call.codice === 'Giallo') riduzione = 0.10;
                        
                        if (m.tipo_mezzo !== 'ELI') {
                            const traffico = 1 + (Math.random() * 0.2 - 0.1);
                            velBase = velBase * traffico;
                        }
                        const vel = velBase * (1 + riduzione);
                        
                        const tempoArrivo = Math.round((dist / vel) * 60);
                        m._inMovimentoMissione = true;
                        
                        // Avvia il movimento verso la chiamata
                        window.game.moveMezzoGradualmente(m, m.lat, m.lon, call.lat, call.lon, Math.max(tempoArrivo, 2), 3, () => {
                            window.game.ui.updateStatoMezzi(m);
                            window.game.updateMezzoMarkers();
                            m._inMovimentoMissione = false;
                            gestisciStato3.call(window.game, m, call);
                        });
                    }
                }
                
                // Usa un timer breve che controlla ogni 5 secondi simulati se è ora di partire
                const timerPartenza = simInterval(() => {
                    controllaPartenza();
                    
                    // Se il mezzo è partito o non è più in attesa, ferma il timer
                    if (!m._inAttesaPartenza) {
                        clearInterval(timerPartenza);
                    }
                }, 5); // Controlla ogni 5 secondi simulati
            });
        }
    }

    gestisciStato7(mezzo) {
        console.log(`[DEBUG] gestisciStato7 start for ${mezzo.nome_radio} at (${mezzo.lat.toFixed(5)},${mezzo.lon.toFixed(5)}) stato=${mezzo.stato}`);
        // Se il mezzo ha già una nuova chiamata, non procedere con il rientro
        if (mezzo.chiamata) {
            console.log('[INFO] Mezzo in stato 7 ha una nuova chiamata, non procedo con il rientro:', mezzo.nome_radio);
            return;
        }
        
        const postazione = Object.values(this.postazioniMap).find(p => p.nome === mezzo.postazione);
        if (!postazione) return;
        
        // NON saltare lo stato 7 con tolleranze: esci solo se coordinate esatte coincidono
        if (mezzo.lat === postazione.lat && mezzo.lon === postazione.lon) {
            // Reset dati di trasporto residui
            mezzo.ospedale = null;
            mezzo.codice_trasporto = null;
            mezzo._trasportoConfermato = false;
            mezzo._trasportoAvviato = false;
            setStatoMezzo(mezzo, 1);
            console.log(`[DEBUG] ${mezzo.nome_radio} già in postazione: passaggio diretto a stato 1`);
            return;
        }
        
        // Indica che il mezzo sta tornando alla base
        mezzo._inRientroInSede = true;
        
        // Calcola tempo di rientro e avvia movimento: lo stato 7 rappresenta il tragitto
        const dist = distanzaKm(mezzo.lat, mezzo.lon, postazione.lat, postazione.lon);
        getVelocitaMezzo(mezzo.tipo_mezzo).then(vel => {
            const tempoRientro = Math.max(2, Math.round((dist / vel) * 60));
            // Imposta/assicura stato 7 durante il rientro
            if (mezzo.stato !== 7) {
                console.log(`[DEBUG] ${mezzo.nome_radio} entra in stato 7 (rientro): distanza ${dist.toFixed(2)} km, tempo ${tempoRientro} min`);
                setStatoMezzo(mezzo, 7);
            } else {
                console.log(`[DEBUG] ${mezzo.nome_radio} continua rientro (stato 7): distanza ${dist.toFixed(2)} km, tempo ${tempoRientro} min`);
            }
            this.moveMezzoGradualmente(
                mezzo,
                mezzo.lat, mezzo.lon,
                postazione.lat, postazione.lon,
                tempoRientro,
                1,
                () => {
                    mezzo._inRientroInSede = false;
                    // Reset dati di trasporto residui
                    mezzo.ospedale = null;
                    mezzo.codice_trasporto = null;
                    mezzo._trasportoConfermato = false;
                    mezzo._trasportoAvviato = false;
                    mezzo.comunicazioni = (mezzo.comunicazioni || []).concat([`Libero in sede`]);
                    console.log(`[DEBUG] ${mezzo.nome_radio} ha completato il rientro: passaggio a stato 1`);
                    this.ui.updateStatoMezzi(mezzo);
                    this.updateMezzoMarkers();
                    this.updatePostazioneMarkers();
                }
            );
        });
    }
}

// Esporta la classe EmergencyDispatchGame globalmente
window.EmergencyDispatchGame = EmergencyDispatchGame;

// Esportazione della classe EmergencyDispatchGame
if (typeof window !== 'undefined') {
    // Non ridefinire la classe se già presente
    if (!window.hasOwnProperty('EmergencyDispatchGame')) {
        window.EmergencyDispatchGame = EmergencyDispatchGame;
        console.log("EmergencyDispatchGame class initialized and exposed to global scope");
    }
}

// Funzione per ottenere un percorso stradale da OSRM tra due coordinate (ritorna array di [lat,lon])
async function getPercorsoStradaleOSRM(lat1, lon1, lat2, lon2) {
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
    try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.routes && data.routes[0] && data.routes[0].geometry && data.routes[0].geometry.coordinates) {
            // OSRM restituisce [lon,lat], convertiamo in [lat,lon]
            return data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        }
    } catch (e) {
        console.error('Errore richiesta OSRM:', e);
    }
    // fallback: linea retta
    return [[lat1, lon1], [lat2, lon2]];
}

// Funzione asincrona per ottenere la distanza su strada tramite OSRM (in km)
window.getDistanzaStradaleOSRM = async function(lat1, lon1, lat2, lon2, tipoMezzo = '') {
    if (tipoMezzo === 'ELI') {
        // Per ELI usa distanza in linea d'aria
        return distanzaKm(lat1, lon1, lat2, lon2);
    }
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.routes && data.routes[0] && typeof data.routes[0].distance === 'number') {
            return data.routes[0].distance / 1000; // metri -> km
        }
    } catch (e) {
        console.error('Errore richiesta OSRM per distanza:', e);
    }
    // fallback: linea retta
    return distanzaKm(lat1, lon1, lat2, lon2);
};

// Restituisce la velocità media (in km/h) di un mezzo dato il tipo
async function getVelocitaMezzo(tipoMezzo) {
    // Carica la tabella solo una volta
    if (!window._tabellaMezzi118) {
        const response = await fetch('src/data/tabella_mezzi_118.json');
        const data = await response.json();
        window._tabellaMezzi118 = (data.Sheet1 || data.sheet1 || []);
    }
    const tab = window._tabellaMezzi118;
    // Cerca la voce corrispondente
    const entry = tab.find(e => (e.Tipo || '').toUpperCase() === (tipoMezzo || '').toUpperCase());
    if (entry && entry["Velocità media"]) {
        // Estrae il numero dalla stringa (es: "80 km/h")
        const match = entry["Velocità media"].toString().match(/\d+/);
        if (match) return Number(match[0]);
    }    // Default: 60 km/h
    return 60;
}

// Esporta la classe EmergencyDispatchGame globalmente
window.EmergencyDispatchGame = EmergencyDispatchGame;