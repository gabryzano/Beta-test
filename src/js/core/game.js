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
            console.log('[DEBUG] Day rollover - Midnight transition detected');
            sec = 0; // Reset a mezzanotte
            dayIdx = (dayIdx + 1) % 7;
            window.simDay = giorniSettimanaIT[dayIdx];
            
            // Force availability update at midnight rollover
            window._forceAvailabilityUpdate = true;
            console.log('[DEBUG] Setting _forceAvailabilityUpdate=true due to midnight rollover');
        } else {
            sec = nextSec;
        }
        
        window.simTime = sec;
        updateSimClock();
    }
}

// Funzione per gestire intervalli simulati
function simInterval(fn, sec) {
    const id = setInterval(fn, sec * 1000 / getSimSpeed());
    window._simIntervals.push(id);
    return id;
}

// Funzione per gestire timeout simulati
function simTimeout(fn, sec) {
    const id = setTimeout(fn, sec * 1000 / getSimSpeed());
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
    
    // Se il mezzo era in stato 7 (rientro in sede), mostra solo 'missione interrotta'
    if (mezzo.stato === 7) {
        mezzo.comunicazioni = ['missione interrotta'];
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

        // Clear previous communications and keep only Report pronto if in appropriate state
        if (Array.isArray(mezzo.comunicazioni)) {
            const reportPronto = mezzo.comunicazioni.find(msg => msg.includes('Report pronto'));
            mezzo.comunicazioni = [];
            if (reportPronto && mezzo.stato === 3) {
                mezzo.comunicazioni.push(reportPronto);
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
setStatoMezzo = function(mezzo, nuovoStato) {
    const prevStato = mezzo.stato;
    const res = _oldSetStatoMezzo.apply(this, arguments);
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
    if (mezzo.stato === 1 && mezzo.chiamata && !mezzo._timerStato2) {
        mezzo._timerStato2 = simTimeout(() => {
            setStatoMezzo(mezzo, 2);
            mezzo._timerStato2 = null;
        }, randomMinuti(2, 3) * 60);    }
    // Stato 3: dopo 20-30 minuti simulati manda "report pronto"    
    if (mezzo.stato === 3 && !mezzo._timerReportPronto && !mezzo._reportProntoInviato) {
        // Timer di report ridotto a 2-5 minuti simulati
        mezzo._timerReportPronto = simTimeout(() => {
            mezzo.comunicazioni = (mezzo.comunicazioni || []).concat([`Report pronto`]);
            console.log('[DEBUG] Mezzo', mezzo.nome_radio, 'ha inviato REPORT PRONTO');
            mezzo._reportProntoInviato = true;
        }, randomMinuti(2, 5) * 60);
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

    // Automatically send report after 20-30 minutes
    if (mezzo.stato === 3 && !mezzo._timerReportPronto && !mezzo._reportProntoInviato) {
        // Reset flags to allow hospital transport menu to show after report
        mezzo._menuOspedaliShown = false;
        mezzo._trasportoConfermato = false;
        mezzo._trasportoAvviato = false;
        mezzo.comunicazioni = [];
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
                }

                // Update vehicle state based on availability
                if (disponibile) {
                    if (m.stato === 8) {
                        console.log(`[INFO] Mezzo ${m.nome_radio || 'sconosciuto'} passa a disponibile (stato 1)`);
                        m.stato = 1;
                    }
                } else {
                    if (m.stato === 1) {
                        console.log(`[INFO] Mezzo ${m.nome_radio || 'sconosciuto'} passa a non disponibile (stato 8)`);
                        m.stato = 8;
                    }
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
                    // Limita il tempo di arrivo a un massimo di 30 minuti simulati
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
                    // Limita il tempo di arrivo in ospedale a un massimo di 30 minuti simulati
                    const arrivoOspedaleMinuti = Math.min(Math.max(tempoArrivo, 2), 30);
                    this.moveMezzoGradualmente(m, m.lat, m.lon, m.ospedale.lat, m.ospedale.lon, arrivoOspedaleMinuti, 5, () => {
                        this.ui.updateStatoMezzi(m);
                        this.updateMezzoMarkers();
                        m._inMovimentoOspedale = false;
                        // Sosta in ospedale breve: 1-2 minuti simulati
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
                this.scheduleNextCall();
            }
         } catch (e) {
             console.error("Error during initialization:", e);
         }
    }

    // Schedule automatic new calls at random intervals based on simulated time
    scheduleNextCall() {
        // Determine current simulated hour
        const sec = window.simTime || 0;
        const hour = Math.floor(sec / 3600);
        // Daytime 7-19: shorter intervals, night: longer intervals
        let minInterval = 45; // seconds
        let maxInterval = 300; // seconds
        if (hour >= 7 && hour < 19) {
            minInterval = 45;
            maxInterval = 180;
        } else {
            minInterval = 180;
            maxInterval = 300;
        }
        const interval = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
        simTimeout(() => {
            this.generateNewCall();
            this.scheduleNextCall();
        }, interval);
    }

    initializeMap() {
        if (this.map) {
            this.map.remove();
        }
        // Determine initial map center and zoom based on selected central
        let initCenter = [42.4021, 12.8579]; // default Rieti (VT - CORES Nord)
        const initZoom = 13;
        switch (window.selectedCentral) {
            case 'RM': // Ospedale San Camillo, Roma
                initCenter = [41.8792, 12.4933]; break;
            case 'LT': // Latina
                initCenter = [41.4676, 12.9037]; break;
        }
        this.map = L.map('game-map').setView(initCenter, initZoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
        this.updatePostazioneMarkers();
        this.updateMezzoMarkers();
    }    async loadMezzi() {
         try {
            // Determine base mezzi file based on selected CORES
            let baseFile = '';
            switch(window.selectedCentral) {
                case 'VT': baseFile = 'src/data/mezzi_vt.json'; break;
                case 'RM': baseFile = 'src/data/mezzi_rm.json'; break;
                case 'LT': baseFile = 'src/data/mezzi_lt.json'; break;
            }
             // Fetch the base mezzi file and strip comments
             const resMezzi = await fetch(baseFile);
             if (!resMezzi.ok) {
                 console.error(`File ${baseFile} non trovato (HTTP ${resMezzi.status}). Caricamento mezzi interrotto.`);
                 return;
             }
             const textMezzi = await resMezzi.text();
             let mezziData;
             try {
                 mezziData = JSON.parse(textMezzi.replace(/\/\/.*$/gm, ''));
             } catch(e) {
                 console.error(`Errore parsing JSON mezzi da ${baseFile}:`, e);
                 return;
             }
             let mezzi = Array.isArray(mezziData) ? mezziData : Object.values(mezziData).find(v => Array.isArray(v)) || [];

            // Ogni riga del file è un mezzo distinto, nessuna manipolazione
            mezzi = mezzi.map(m => {
                let lat = m.lat ?? null;
                let lon = m.lon ?? null;
                if ((!lat || !lon) && m["Coordinate Postazione"]) {
                    const coords = m["Coordinate Postazione"].split(',').map(s => Number(s.trim()));
                    lat = coords[0];
                    lon = coords[1];
                }
                // Normalize radio name to string and trim
                const rawName = m.nome_radio ?? m["Nome radio"] ?? "";
                const nomeRadio = String(rawName).trim();
                return {
                    nome_radio: nomeRadio,
                    postazione: m.postazione || m["Nome Postazione"] || "",
                    tipo_mezzo: m.tipo_mezzo || m.Mezzo || "",
                    convenzione: m.convenzione || m["Convenzione"] || "",
                    Giorni: m.Giorni || m.giorni || "LUN-DOM",
                    "Orario di lavoro": m["Orario di lavoro"] || "",
                    lat: lat,
                    lon: lon,
                    stato: 1,
                    _marker: null,
                    _callMarker: null,
                    _ospedaleMarker: null
                };
            });

            // Raggruppa per nome_radio tutte le varianti
            const now = window.simTime
                ? (() => { const d = new Date(); d.setHours(Math.floor(window.simTime/3600), Math.floor((window.simTime%3600)/60), 0, 0); return d; })()
                : new Date();
            const ora = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            const giornoIT = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'][now.getDay()];
            const isMezzoOperativoFn = window.isMezzoOperativo || (window.jsUtils && window.jsUtils.isMezzoOperativo);
            if (!isMezzoOperativoFn) {
                console.error('Funzione isMezzoOperativo non trovata su window. Assicurati che orariMezzi.js sia caricato PRIMA di game.js');
            }
            // Raggruppa per nome_radio
            const mezziByRadio = {};
            mezzi.forEach(m => {
                const key = m.nome_radio.trim();
                if (!mezziByRadio[key]) mezziByRadio[key] = [];
                mezziByRadio[key].push(m);
            });
            // MODIFICA: carica tutte le varianti di ogni mezzo (tutti i turni)
            // Prima: solo la variante attiva
            // const mezziOperativi = [];
            // Object.values(mezziByRadio).forEach(varianti => {
            //     const attiva = varianti.find(m => isMezzoOperativoFn && isMezzoOperativoFn(m, ora, now, giornoIT));
            //     if (attiva) mezziOperativi.push(attiva);
            // });
            // this.mezzi = mezziOperativi;
            // Ora: tutte le varianti
            this.mezzi = [];
            Object.values(mezziByRadio).forEach(varianti => {
                varianti.forEach(m => this.mezzi.push(m));
            });

            // Una postazione può ospitare più mezzi (anche con stesso nome_radio)
            this.postazioniMap = {};
            mezzi.forEach(m => {
                if (!m.postazione || m.postazione.trim() === "" || !m.lat || !m.lon) return;
                const key = m.postazione.trim() + '_' + m.lat + '_' + m.lon;
                if (!this.postazioniMap[key]) {
                    this.postazioniMap[key] = {
                        nome: m.postazione.trim(),
                        lat: m.lat,
                        lon: m.lon,
                        mezzi: []
                    };
                }
                this.postazioniMap[key].mezzi.push(m);
            });

            // Additional extra SOREU vehicles per central
            // SRA: load SRL then SRP
            if (window.selectedCentral === 'SRA') {
                // SRL
                try {
                    const res = await fetch('src/data/Mezzi_SRL.json');
                    let arr = await res.json(); if (!Array.isArray(arr)) arr = Object.values(arr).find(v=>Array.isArray(v))||[];
                    arr.forEach(item => {
                        const nomePost = (item['Nome Postazione']||'').trim(); if (!nomePost) return;
                        const [lat, lon] = (item['Coordinate Postazione']||'').split(',').map(s=>Number(s.trim())); if (lat==null||lon==null) return;
                        const mezzo = { nome_radio: `(SRL) ${(item['Nome radio']||'').trim()}`, postazione: nomePost, tipo_mezzo: item['Mezzo']||'', convenzione: item['Convenzione']||'', Giorni: item['Giorni']||item['giorni']||'LUN-DOM', 'Orario di lavoro': item['Orario di lavoro']||'', lat, lon, stato:1 }; 
                        this.mezzi.push(mezzo); const key = `${nomePost}_${lat}_${lon}`;
                        if (!this.postazioniMap[key]) this.postazioniMap[key] = { nome: nomePost, lat, lon, mezzi: [], isSRL:true };
                        this.postazioniMap[key].mezzi.push(mezzo);
                    });
                } catch(e){console.error(e)}                // SRP
                try {
                    const res = await fetch('src/data/mezzi_srp.json');
                    let arr = await res.json(); if (!Array.isArray(arr)) arr = Object.values(arr).find(v=>Array.isArray(v))||[];
                    arr.forEach(item => {
                        const nomePost = (item['Nome Postazione']||'').trim(); if (!nomePost) return;
                        const [lat, lon] = (item['Coordinate Postazione']||'').split(',').map(s=>Number(s.trim())); if (lat==null||lon==null) return;
                        const mezzo = { nome_radio: `(SRP) ${(item['Nome radio']||'').trim()}`, postazione: nomePost, tipo_mezzo: item['Mezzo']||'', convenzione: item['Convenzione']||'', Giorni: item['Giorni']||item['giorni']||'LUN-DOM', 'Orario di lavoro': item['Orario di lavoro']||'', lat, lon, stato:1 };
                        this.mezzi.push(mezzo); const key = `${nomePost}_${lat}_${lon}`;
                        if (!this.postazioniMap[key]) this.postazioniMap[key] = { nome: nomePost, lat, lon, mezzi: [], isSRP:true };
                        this.postazioniMap[key].mezzi.push(mezzo);
                    });
                } catch(e){console.error(e)}
            }
            // SRL: load SRA, SRP
            if (window.selectedCentral === 'SRL') {
                for (const [file,prefix,flag] of [
                    ['src/data/mezzi_sra.json','SRA','isSRL'],
                    ['src/data/mezzi_srp.json','SRP','isSRP']
                ]) {
                    try {
                        const res = await fetch(file);
                        let arr = await res.json(); if (!Array.isArray(arr)) arr = Object.values(arr).find(v=>Array.isArray(v))||[];
                        // Raggruppa per nome_radio e carica tutte le varianti
                        const mezziByRadio = {};
                        arr.forEach(m => {
                            const key = (m['Nome radio']||'').trim();
                            if (!mezziByRadio[key]) mezziByRadio[key] = [];
                            mezziByRadio[key].push(m);
                        });
                        Object.values(mezziByRadio).forEach(varianti => {
                            varianti.forEach(item => {
                                const nomePost = (item['Nome Postazione']||'').trim(); if(!nomePost)return;
                                const [lat,lon]=(item['Coordinate Postazione']||'').split(',').map(s=>Number(s.trim())); if(lat==null||lon==null)return;
                                const mezzo={ nome_radio:`(${prefix}) ${(item['Nome radio']||'').trim()}`, postazione:nomePost, tipo_mezzo:item['Mezzo']||'', convenzione:item['Convenzione']||'', Giorni:item['Giorni']||item['giorni']||'LUN-DOM', 'Orario di lavoro':item['Orario di lavoro']||'', lat, lon, stato:1 };
                                this.mezzi.push(mezzo); const key2=`${nomePost}_${lat}_${lon}`;
                                if(!this.postazioniMap[key2]) this.postazioniMap[key2]={ nome:nomePost, lat, lon, mezzi:[], isSRL:true };
                                this.postazioniMap[key2].mezzi.push(mezzo);
                            });
                        });
                    } catch(e){console.error(e)}
                }
            }
            // SRM: load SRA, SRL, SRP
            if (window.selectedCentral === 'SRM') {
                for (const [file,prefix,flag] of [
                    ['src/data/mezzi_sra.json','SRA','isSRM'],
                    ['src/data/Mezzi_SRL.json','SRL','isSRL'],
                    ['src/data/mezzi_srp.json','SRP','isSRP']
                ]) {
                    try {
                        const res = await fetch(file);
                        let arr = await res.json();
                        if (!Array.isArray(arr)) arr = Object.values(arr).find(v => Array.isArray(v)) || [];
                        // Raggruppa per nome_radio e carica tutte le varianti
                        const mezziByRadio = {};
                        arr.forEach(m => {
                            const key = (m['Nome radio']||'').trim();
                            if (!mezziByRadio[key]) mezziByRadio[key] = [];
                            mezziByRadio[key].push(m);
                        });
                        Object.values(mezziByRadio).forEach(varianti => {
                            varianti.forEach(item => {
                                const nomePost = (item['Nome Postazione']||'').trim(); if(!nomePost)return;
                                const [lat,lon]=(item['Coordinate Postazione']||'').split(',').map(s=>Number(s.trim())); if(lat==null||lon==null)return;
                                const mezzo={ nome_radio:`(${prefix}) ${(item['Nome radio']||'').trim()}`, postazione:nomePost, tipo_mezzo:item['Mezzo']||'', convenzione:item['Convenzione']||'', Giorni:item['Giorni']||item['giorni']||'LUN-DOM', 'Orario di lavoro':item['Orario di lavoro']||'', lat, lon, stato:1 };
                                this.mezzi.push(mezzo); const key2=`${nomePost}_${lat}_${lon}`;
                                if(!this.postazioniMap[key2]) this.postazioniMap[key2]={ nome:nomePost, lat, lon, mezzi:[], [flag]:true };
                                this.postazioniMap[key2].mezzi.push(mezzo);
                            });
                        });
                    } catch(e) { console.error(e); }
                }
            }
            // SRP: load SRA, SRM, SRL
            if (window.selectedCentral === 'SRP') {
                for (const [file,prefix,flag] of [
                    ['src/data/mezzi_sra.json','SRA','isSRP'],
                    ['src/data/mezzi_srm.json','SRM','isSRP'],
                    ['src/data/Mezzi_SRL.json','SRL','isSRP']
                ]) {
                    try {
                        const res = await fetch(file);
                        let arr = await res.json(); if (!Array.isArray(arr)) arr = Object.values(arr).find(v=>Array.isArray(v))||[];
                        // Raggruppa per nome_radio e carica tutte le varianti
                        const mezziByRadio = {};
                        arr.forEach(m => {
                            const key = (m['Nome radio']||'').trim();
                            if (!mezziByRadio[key]) mezziByRadio[key] = [];
                            mezziByRadio[key].push(m);
                        });
                        Object.values(mezziByRadio).forEach(varianti => {
                            varianti.forEach(item => {
                                const nomePost = (item['Nome Postazione']||'').trim(); if(!nomePost)return;
                                const [lat,lon]=(item['Coordinate Postazione']||'').split(',').map(s=>Number(s.trim())); if(lat==null||lon==null)return;
                                const mezzo={ nome_radio:`(${prefix}) ${(item['Nome radio']||'').trim()}`, postazione:nomePost, tipo_mezzo:item['Mezzo']||'', convenzione:item['Convenzione']||'', Giorni:item['Giorni']||item['giorni']||'LUN-DOM', 'Orario di lavoro':item['Orario di lavoro']||'', lat, lon, stato:1 };
                                this.mezzi.push(mezzo); const key2=`${nomePost}_${lat}_${lon}`;
                                if(!this.postazioniMap[key2]) this.postazioniMap[key2]={ nome:nomePost, lat, lon, mezzi:[], [flag]:true };
                                this.postazioniMap[key2].mezzi.push(mezzo);
                            });
                        });
                    } catch(e){console.error(e)}
                }
            }            // Non ordinare gli ospedali globalmente qui, l'ordinamento avverrà in UI.js per rispettare i gruppi
        } catch(e) {
            console.error("Errore nel caricamento dei mezzi:",e);
        }
    }

    async loadHospitals() {
        try {
            // Load and parse hospitals for primary and neighboring CORES
            const hospitalsAll = [];
            // Define files: primary and neighbors
            const core = window.selectedCentral.toLowerCase();
            const order = [core, ...['vt','rm','lt'].filter(c=>c!==core)];
            for (const c of order) {
                const prefix = c === core ? '' : (c === 'vt' ? 'NORD' : c === 'rm' ? 'METRO' : 'SUD');
                const filePath = `src/data/ps_${c}.json`;
                // Fetch and strip comments
                const res = await fetch(filePath);
                if (!res.ok) {
                    console.error(`File ospedali ${filePath} non trovato (HTTP ${res.status}).`);
                    continue;
                }
                const text = await res.text();
                let arr;
                try {
                    arr = JSON.parse(text.replace(/\/\/.*$/gm, ''));
                } catch(err) {
                    console.error(`Errore parsing JSON ospedali da ${filePath}:`, err);
                    continue;
                }
                const list = Array.isArray(arr) ? arr : [];
                list.forEach(h => {
                    // Parse coordinates
                    const coord = (h.COORDINATE||h.Coordinate||'').split(',').map(s=>Number(s.trim()));
                    const lat = coord[0], lon = coord[1];
                    if (lat == null || lon == null) return;
                    const name = prefix ? `(${prefix}) ${h.OSPEDALE?.trim()||''}` : h.OSPEDALE?.trim()||'';
                    hospitalsAll.push({ nome: name, lat, lon, indirizzo: h.INDIRIZZO||'', raw: h });
                });
            }
            // Render all hospital markers
            this.hospitals = hospitalsAll;
            hospitalsAll.forEach(hosp => {
                const marker = L.marker([hosp.lat, hosp.lon], { icon: this.getHospitalIcon() })
                    .addTo(this.map)
                    .bindPopup(`<b>${hosp.nome}</b><br>${hosp.indirizzo||''}`);
                hosp._marker = marker;
            });
        } catch(e) {
            console.error("Error loading hospitals:", e);
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
        const bg = isCreli ? "#ffffff" : (hasLiberi ? "#43a047" : "#d32f2f");
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
        
        Object.values(this.postazioniMap).forEach(postazione => {
            const mezziLiberi = (this.mezzi || []).filter(m => {
                const isDisponibile = m.stato === 1; // è in stato disponibile
                const inThisPostazione = m.postazione === postazione.nome; // appartiene alla postazione
                const correctCoordinates = Math.abs(m.lat - postazione.lat) < 0.0001 && 
                                         Math.abs(m.lon - postazione.lon) < 0.0001; // coordinate corrette
                
                return isDisponibile && inThisPostazione && correctCoordinates;
            });
            
            const hasLiberi = mezziLiberi.length > 0;
            
            const mezziPostazione = (this.mezzi || []).filter(m =>
                m.stato !== 8 &&
                m.postazione === postazione.nome &&
                Math.abs(m.lat - postazione.lat) < 0.0001 &&
                Math.abs(m.lon - postazione.lon) < 0.0001
            );
            
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
            const isSpecial = postazione.isCreli || postazione.isSRL || postazione.isSRP || postazione.isSRM;
            const marker = L.marker([postazione.lat, postazione.lon], { 
                icon: this.getPostazioneIcon(hasLiberi, isSpecial) 
            }).addTo(this.map)
            .bindPopup(`<div style="font-weight:bold;font-size:15px;">${postazione.nome}</div>${mezziHtml}`);
            
            marker.on('popupopen', () => {
                const mezziLiberiNow = (this.mezzi || []).filter(m =>
                    m.stato === 1 &&
                    m.postazione === postazione.nome &&
                    Math.abs(m.lat - postazione.lat) < 0.0001 &&
                    Math.abs(m.lon - postazione.lon) < 0.0001
                );
                const hasLiberiNow = mezziLiberiNow.length > 0;
                
                const mezziPostazioneNow = (this.mezzi || []).filter(m =>
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

    updateMezzoMarkers() {
        if (!this.map || !this.mezzi) return;
        this.mezzi.forEach(m => {
            if (m._marker) {
                this.map.removeLayer(m._marker);
                m._marker = null;
            }
        });
        this.mezzi.forEach(m => {
            // Never show markers for vehicles in state 3 (sul posto)
            if (m.stato === 3) return;
            // Show markers only for movement states 2, 4 and 7
            if (![2, 4, 7].includes(m.stato)) return;
            // Mostra marker per mezzi in movimento (stati 2, 3, 4, 7) o per mezzi con chiamata assegnata
            if (![2, 4, 7].includes(m.stato) && !m.chiamata) return;            // Use images PNG instead of emoji
            let iconUrl;
            // Use specific icons per vehicle type
            let tipo = m.tipo_mezzo || '';
            if (tipo.startsWith('MSB') || tipo === 'ASI' || tipo === 'ASM') {
                iconUrl = 'src/assets/MSB.png';
            } else if (tipo.startsWith('MSA') || tipo === 'AM') {
                iconUrl = 'src/assets/MSA.png';
            } else if (tipo === 'ELI') {
                iconUrl = 'src/assets/ELI.png';
            } else {
                iconUrl = 'src/assets/marker-rosso.png';
            }
            const icon = L.icon({
                iconUrl,
                iconSize: [36, 36],        // increased size
                iconAnchor: [18, 36],      // center bottom
                popupAnchor: [0, -36]
            });
            m._marker = L.marker([m.lat, m.lon], { icon }).addTo(this.map)
                .bindPopup(`<b>${m.nome_radio}</b><br>${m.postazione}<br>Stato: ${m.stato}`);
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
        // Seleziona prima il template di chiamata casuale
        let chiamataTemplate = null;
        let testo_chiamata = '';
        if (this.chiamateTemplate) {
            const keys = Object.keys(this.chiamateTemplate);
            const sel = keys[Math.floor(Math.random() * keys.length)];
            chiamataTemplate = this.chiamateTemplate[sel];
            testo_chiamata = chiamataTemplate.testo_chiamata;
        }
        // Determina lista indirizzi in base al placeholder nel testo
        const rawText = testo_chiamata || '';
        const match = rawText.match(/\(indirizzo ([^)]+)\)/i);
        let sourceList = window.indirizziReali || [];
        if (match) {
            const key = match[1].toLowerCase().trim().replace(/\s+/g, '_');
            if (this.categorieIndirizzi[key] && this.categorieIndirizzi[key].length) {
                sourceList = this.categorieIndirizzi[key];
            }
        }
        const idx = Math.floor(Math.random() * sourceList.length);
        const indirizzo = sourceList[idx] || { indirizzo: 'Indirizzo sconosciuto', lat: 45.68, lon: 9.67 };
        // Sostituisci ogni placeholder con l'indirizzo selezionato
        testo_chiamata = (testo_chiamata || '').replace(/\(indirizzo [^)]+\)/gi, indirizzo.indirizzo);
         
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

        const patologie = ['Trauma', 'Malore', 'Incidente', 'Dolore toracico', 'Dispnea', 'Altro'];

        const patologia = patologie[Math.floor(Math.random() * patologie.length)];
        // ensure codice list from loaded statiMezzi
        const codici = this.statiMezzi ? Object.keys(this.statiMezzi) : ['Rosso','Giallo','Verde'];
        const codice = codici[Math.floor(Math.random() * codici.length)];

        const now = new Date();
        const year = now.getFullYear();
        const decina = Math.floor((year % 100) / 10);
        const unita = year % 10;
        // per-central mission numbering: SRA=1, SRL=3, SRM=5, SRP=7
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
            patologia,
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
        // Refresh availability so vehicles respect Giorni/Orario rules immediately
        // Reset lastAvailabilityCheck to force update
        if (window._lastAvailabilityCheck) {
            window._lastAvailabilityCheck.ora = -1;
            window._lastAvailabilityCheck.giorno = -1;
        }
        if (typeof aggiornaDisponibilitaMezzi === 'function') aggiornaDisponibilitaMezzi();
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
            const mezziFiltrati = this.mezzi.filter(m => [1,2,7].includes(m.stato));
            let html = `<table class='stato-mezzi-table' style='width:100%;margin-bottom:0;'>
                <thead><tr>
                    <th style='width:40%;text-align:left; padding:1px 2px;'>Nome</th>
                    <th style='width:30%;text-align:left; padding:1px 2px;'>Tipo</th>
                    <th style='width:12%;text-align:left; padding:1px 2px;'>Conv.</th>
                    <th style='width:28%;text-align:left; padding:1px 2px;'>Distanza</th>
                </tr></thead>
                <tbody>`;
            mezziFiltrati.forEach(m => {
                // Set background color based on state: 1=green, 2=yellow, 7=grey
                let evidenzia = '';
                if (m.stato === 1) evidenzia = 'background:#e8f5e9;';
                else if (m.stato === 2) evidenzia = 'background:#fff9c4;';
                else if (m.stato === 7) evidenzia = 'background:#eeeeee;';
                // Add icon based on state
                let icon = '';
                if (m.stato === 1) icon = '✅ ';
                else if (m.stato === 2) icon = '🚑 ';
                else if (m.stato === 7) icon = '↩️ ';
                const checked = (call.mezziAssegnati||[]).includes(m.nome_radio) ? 'checked' : '';
                let distanza = (m._dist !== undefined && isFinite(m._dist))
                    ? `${m._dist.toFixed(1)} km`
                    : `<span data-mezzo-dist="${m.nome_radio}">...</span>`;
                html += `<tr style='${evidenzia}'>`+
                    `<td style='white-space:nowrap;padding:1px 2px;text-align:left;'>`+
                    `<label style='display:flex;align-items:center;gap:1px;'>`+
                    `<input type='checkbox' name='mezzi' value='${m.nome_radio}' ${checked} style='margin:0 2px 0 0;vertical-align:middle;'><span style='vertical-align:middle;'>${icon}${m.nome_radio}</span>`+
                    `</label></td>`+
                    `<td style='padding:1px 2px;text-align:left;'>${m.tipo_mezzo || ''}</td>`+
                    `<td style='padding:1px 2px;text-align:left;'>${m.convenzione || ''}</td>`+
                    `<td style='padding:1px 2px;text-align:left;'>${distanza}</td>`+
                `</tr>`;
            });
            html += `</tbody></table>`;

            const mezziAssegnatiDiv = document.getElementById('mezziAssegnatiScroll');
            if (mezziAssegnatiDiv) mezziAssegnatiDiv.innerHTML = html;
            
            // Aggiungi event listener per i checkbox
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
            luogoSelect.innerHTML = '';
            const opzioniLuogo = ['Casa', 'Strada', 'Esercizi pubblici', 'Impianto lavorativo', 'Impianto sportivo', 'Scuola', 'Altro'];
            opzioniLuogo.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                if (call.luogo === opt) option.selected = true;
                luogoSelect.appendChild(option);
            });
        }
        const patologiaSelect = document.getElementById('patologia');
        if (patologiaSelect) {
            patologiaSelect.innerHTML = '';
            const opzioniPatologia = [
                'Traumatica','Cardiocircolatoria','Respiratoria','Neurologica','Psichiatrica','Tossicologica','Metabolica','Gastroenterologica','Urologica','Oculistica','Otorinolaringoiatrica','Dermatologica','Ostetrico-ginecologica','Infettiva','Neoplastica','Altra patologia','Non identificata'
            ];
            opzioniPatologia.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                if (call.patologia === opt) option.selected = true;
                patologiaSelect.appendChild(option);
            });
        }
        const codiceSelect = document.getElementById('codice');
        if (codiceSelect) {
            codiceSelect.innerHTML = '';
            ['Rosso','Giallo','Verde'].forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                if (call.codice === opt) option.selected = true;
                codiceSelect.appendChild(option);
            });
        }
        const note1 = document.getElementById('note1');
        if (note1) note1.value = call.note1 || '';
        const note2 = document.getElementById('note2');
        if (note2) note2.value = call.note2 || '';

        const btnsRapidi = [
            {tipo:'MSA1', label:'ASI'},
            {tipo:'MSA2', label:'AM'},
            {tipo:'ELI', label:'ELI'}
        ];
        const btnsRapidiDiv = document.getElementById('btnsRapidiMezzi');
               if (btnsRapidiDiv) {
            btnsRapidiDiv.innerHTML = btnsRapidi.map(b =>
                `<button type='button' class='btn-rapido-mezzo' data-tipo='${b.tipo}' style='font-size:15px;padding:2px 10px 2px 10px;border-radius:4px;background:#1976d2;color:#fff;border:none;line-height:1.2;min-width:44px;'>${b.label}</button>`
            ).join('');
            // Attach click handlers to quick-select buttons
            btnsRapidiDiv.querySelectorAll('.btn-rapido-mezzo').forEach(btn => {
                btn.onclick = () => {
                    const tipo = btn.getAttribute('data-tipo');
                    const checkboxes = document.querySelectorAll('#mezziAssegnatiScroll input[type=checkbox][name=mezzi]');
                    for (const cb of checkboxes) {
                        const nome = cb.value;
                        const m = window.game.mezzi.find(x => x.nome_radio === nome);
                        if (!m) continue;
                        // Determine vehicle type for quick select: ELI, MSA1 (ASI), MSA2 (AM), MSB
                        let t = '';
                        const tm = m.tipo_mezzo || '';
                        if (tm.toUpperCase().includes('ELI')) {
                            t = 'ELI';
                        } else if (tm.startsWith('MSA1') || tm.startsWith('ASI')) {
                            t = 'MSA1';
                        } else if (tm.startsWith('MSA2') || tm.startsWith('AM')) {
                            t = 'MSA2';
                        } else if (tm.startsWith('MSB')) {
                            t = 'MSB';
                        }
                        if (t === tipo) {
                            if (!cb.checked) cb.checked = true;
                            break;
                        }
                    }
                };
            });
        }

        // Mostra mezzi in stato 1, 2, 6, 7 oppure già assegnati
        const mezziFiltrati = mezzi.filter(m => [1,2,6,7].includes(m.stato) || (call.mezziAssegnati||[]).includes(m.nome_radio));
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
            let evidenzia = '';
            if (m.stato === 1) evidenzia = 'background:#e8f5e9;';
            else if (m.stato === 2) evidenzia = 'background:#fff9c4;';
            else if (m.stato === 7) evidenzia = 'background:#eeeeee;';
            // Add icon based on state
            let icon = '';
            if (m.stato === 1) icon = '✅ ';
            else if (m.stato === 2) icon = '🚑 ';
            else if (m.stato === 7) icon = '↩️ ';
            const checked = (call.mezziAssegnati||[]).includes(m.nome_radio) ? 'checked' : '';
            let distanza = (m._dist !== undefined && isFinite(m._dist))
                ? `${m._dist.toFixed(1)} km`
                : `<span data-mezzo-dist="${m.nome_radio}">...</span>`;
            html += `<tr style='${evidenzia}'>`+
                `<td style='white-space:nowrap;padding:1px 2px;text-align:left;'>`+
                `<label style='display:flex;align-items:center;gap:1px;'>`+
                `<input type='checkbox' name='mezzi' value='${m.nome_radio}' ${checked} style='margin:0 2px 0 0;vertical-align:middle;'><span style='vertical-align:middle;'>${icon}${m.nome_radio}</span>`+
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
                    const mezziTipo = mezziFiltrati.filter(m => m.tipo_mezzo && m.tipo_mezzo.startsWith(tipo));
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
        if (!call) return;
        const luogo = document.getElementById('luogo')?.value || '';
        const patologia = document.getElementById('patologia')?.value || '';
        const codice = document.getElementById('codice')?.value || '';
        const note1 = document.getElementById('note1')?.value || '';
        const note2 = document.getElementById('note2')?.value || '';
        call.luogo = luogo;
        call.patologia = patologia;
        call.codice = codice;
        call.note1 = note1;
        call.note2 = note2;
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
                    
                    // Aggiungi una comunicazione
                    aggiungiComunicazioneMezzo(mezzo, 'Rimosso dalla missione, rientro in sede');
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
                    // Stato 7: mezzo in rientro, interrompere e assegnare nuova missione senza cancellare
                    console.log('[INFO] Riattivazione mezzo da rientro (stato 7):', m.nome_radio);
                    interrompiMovimento(m);
                    m._inRientroInSede = false;
                    // pulisci vecchi riferimenti
                    m.ospedale = null;
                    m.codice_trasporto = null;
                    // bypass setStatoMezzo che pulisce chiamata: imposta direttamente a intervento
                    m.stato = 2;
                    aggiornaMissioniPerMezzo(m);
                    // assegna chiamata e reset flags
                    m.chiamata = call;
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
                    window.game.ui.updateMissioneInCorso(call);
                    return;
                } else if (m.stato === 3) {
                    // Stato 3: mezzo già in missione, interrompere e reindirizzare
                    console.log('[INFO] Reindirizzamento mezzo in stato 3:', m.nome_radio);
                    interrompiMovimento(m);
                    // reset old hospital and transport code to avoid carrying over
                    m.ospedale = null;
                    m.codice_trasporto = null;
                    // Forza transizione scena->disponibile->intervento
                    setStatoMezzo(m, 1);
                    setStatoMezzo(m, 2);
                    // Assegna la nuova chiamata e reset flags
                    m.chiamata = call;
                    m._reportProntoInviato = false;
                    m._timerReportPronto = null;
                    m._menuOspedaliShown = false;
                }
                
                // Assigna la nuova chiamata al mezzo
                m.chiamata = call;
                
                // Reset report and menu flags for new mission assignment
                m._reportProntoInviato = false;
                m._timerReportPronto = null;
                m._menuOspedaliShown = false;
                
                // Cambia stato a 2 per tutti i mezzi assegnati eccetto quelli in fase di trasporto
                if ([1, 6].includes(m.stato)) {
                    setStatoMezzo(m, 2);
                }
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
        // Avvia i movimenti dei mezzi verso la chiamata con un piccolo ritardo
        setTimeout(() => {
            if (window.game && window.game.mezzi) {
                // Utilizziamo un batch di processamento per non bloccare il thread UI
                const mezziDaProcessare = window.game.mezzi.filter(m => 
                    aggiunti.includes(m.nome_radio) && 
                    m.stato === 2 && 
                    !m._inMovimentoMissione && 
                    m.chiamata === call
                );
                
                // Funzione per processare i mezzi in piccoli batch
                const processaBatchMezzi = (indice) => {
                    if (indice >= mezziDaProcessare.length) return;
                    
                    const m = mezziDaProcessare[indice];
                    console.log('[INFO] Avvio movimento mezzo verso la nuova chiamata:', m.nome_radio);
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
                    
                    // Passa al prossimo mezzo con un piccolo ritardo per evitare blocchi
                    setTimeout(() => processaBatchMezzi(indice + 1), 50);
                };
                
                // Avvia il processamento batch
                processaBatchMezzi(0);
            }
        }, 100);
    }

    gestisciStato7(mezzo) {
        // Se il mezzo ha già una nuova chiamata, non procedere con il rientro
        if (mezzo.chiamata) {
            console.log('[INFO] Mezzo in stato 7 ha una nuova chiamata, non procedo con il rientro:', mezzo.nome_radio);
            return;
        }
        
        const postazione = Object.values(this.postazioniMap).find(p => p.nome === mezzo.postazione);
        if (!postazione) return;
        
        // Se il mezzo è già alla postazione, passa a stato 1
        if (Math.abs(mezzo.lat - postazione.lat) < 0.0001 && Math.abs(mezzo.lon - postazione.lon) < 0.0001) {
            // Reset dati di trasporto residui
            mezzo.ospedale = null;
            mezzo.codice_trasporto = null;
            mezzo._trasportoConfermato = false;
            mezzo._trasportoAvviato = false;
            setStatoMezzo(mezzo, 1);
            return;
        }
        
        // Indica che il mezzo sta tornando alla base
        mezzo._inRientroInSede = true;
        
        // Calcola tempo di rientro
        const dist = distanzaKm(mezzo.lat, mezzo.lon, postazione.lat, postazione.lon);
        getVelocitaMezzo(mezzo.tipo_mezzo).then(vel => {
            const tempoRientro = Math.round((dist / vel) * 60);
            this.moveMezzoGradualmente(
                mezzo,
                mezzo.lat, mezzo.lon,
                postazione.lat, postazione.lon,
                Math.max(tempoRientro, 2),
                1,
                () => {
                    mezzo._inRientroInSede = false;
                    // Reset dati di trasporto residui
                    mezzo.ospedale = null;
                    mezzo.codice_trasporto = null;
                    mezzo._trasportoConfermato = false;
                    mezzo._trasportoAvviato = false;
                    mezzo.comunicazioni = (mezzo.comunicazioni || []).concat([`Rientrato in postazione`]);
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