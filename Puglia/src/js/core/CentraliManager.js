class CentraliManager {
    constructor() {
        this.centrali = null;
        this.hems = null;
        this.centraleSelezionata = null;
        this.eventHandlers = [];
    }

    async loadCentrali() {
        if (this.centrali) return this.centrali;
        
        try {
            const response = await fetch('src/data/centrali.json');
            this.centrali = await response.json();
            console.log('[INFO] Centrali caricate:', Object.keys(this.centrali));
            return this.centrali;
        } catch (error) {
            console.error('[ERROR] Impossibile caricare centrali.json:', error);
            this.centrali = {};
            return this.centrali;
        }
    }

    async loadHEMS() {
        if (this.hems) return this.hems;
        
        try {
            const response = await fetch('src/data/hems.json');
            const data = await response.json();
            this.hems = Array.isArray(data) ? data : Object.values(data).find(v => Array.isArray(v)) || [];
            console.log('[INFO] HEMS caricati:', this.hems.length, 'mezzi');
            return this.hems;
        } catch (error) {
            console.error('[ERROR] Impossibile caricare hems.json:', error);
            this.hems = [];
            return this.hems;
        }
    }

    setCentraleSelezionata(codice) {
        this.centraleSelezionata = codice;
        console.log('[INFO] Centrale selezionata:', codice);
        this.notifyHandlers('centralChanged', codice);
    }

    getCentraleSelezionata() {
        return this.centraleSelezionata;
    }

    getCentraleInfo(codice) {
        return this.centrali && this.centrali[codice] ? this.centrali[codice] : null;
    }

    async loadMezziCentrale(codice) {
        if (!this.centrali || !this.centrali[codice]) {
            console.error('[ERROR] Centrale non trovata:', codice);
            return [];
        }

        const centrale = this.centrali[codice];
        let mezzi = [];

        try {
            // Carica mezzi della centrale specifica
            const response = await fetch(centrale.mezziFile);
            if (response.ok) {
                let data = await response.json();
                if (!Array.isArray(data)) {
                    data = Object.values(data).find(v => Array.isArray(v)) || [];
                }
                
                mezzi = data.map(m => {
                    let lat = m.lat ?? null;
                    let lon = m.lon ?? null;
                    
                    if ((!lat || !lon) && m['Coordinate Postazione']) {
                        const coords = m['Coordinate Postazione'].split(',').map(s => Number(s.trim()));
                        lat = coords[0];
                        lon = coords[1];
                    }
                    
                    return {
                        nome_radio: (m.nome_radio || m['Nome radio'] || '').trim(),
                        postazione: (m.postazione || m['Nome Postazione'] || '').trim(),
                        tipo_mezzo: m.tipo_mezzo || m.Mezzo || '',
                        convenzione: m.convenzione || m['Convenzione'] || '',
                        Giorni: m.Giorni || m.giorni || 'LUN-DOM',
                        'Orario di lavoro': m['Orario di lavoro'] || '',
                        lat,
                        lon,
                        stato: 1,
                        _marker: null,
                        _callMarker: null,
                        _ospedaleMarker: null,
                        central: codice
                    };
                });
                console.log(`[INFO] Caricati ${mezzi.length} mezzi per ${codice}`);
            }
        } catch (error) {
            console.error(`[ERROR] Errore caricamento mezzi ${codice}:`, error);
        }

        return mezzi;
    }

    async loadOspedaliCentrale(codice) {
        if (!this.centrali || !this.centrali[codice]) {
            console.error('[ERROR] Centrale non trovata:', codice);
            return [];
        }

        const centrale = this.centrali[codice];
        let ospedali = [];

        try {
            const response = await fetch(centrale.ospedaliFile);
            if (response.ok) {
                let data = await response.json();
                if (!Array.isArray(data)) {
                    data = Object.values(data).find(v => Array.isArray(v)) || [];
                }
                
                ospedali = data.map(h => {
                    let lat, lon, nome, indirizzo;
                    
                    // Gestisce il formato nuovo (Bari, Foggia, Lecce)
                    if (h.ospedale && h.coordinate) {
                        nome = h.ospedale?.trim() || '';
                        lat = h.coordinate.lat;
                        lon = h.coordinate.lon;
                        indirizzo = h.indirizzo || '';
                        
                        // Normalizza i campi raw per compatibilità
                        const normalizedRaw = {
                            OSPEDALE: h.ospedale,
                            COORDINATE: `${lat},${lon}`,
                            INDIRIZZO: h.indirizzo || '',
                            'N° pazienti Max': h.numero_pazienti_max || 0,
                            CLASSE: h.classe || '',
                            'PUNTO NASCITA': h.punto_nascita ? 'TRUE' : 'FALSE',
                            PEDIATRIA: h.pediatria ? 'TRUE' : 'FALSE',
                            TRAUMA: h.trauma || '',
                            EMODINAMICA: h.emodinamica ? 'TRUE' : 'FALSE',
                            'STROKE UNIT': h.stroke_unit ? 'TRUE' : 'FALSE',
                            NCH: h.nch ? 'TRUE' : 'FALSE',
                            RIANIMAZIONE: h.rianimazione ? 'TRUE' : 'FALSE',
                            PSICHIATRIA: h.psichiatria ? 'TRUE' : 'FALSE'
                        };
                        
                        return {
                            nome,
                            lat,
                            lon,
                            indirizzo,
                            raw: normalizedRaw,
                            central: codice
                        };
                    }
                    // Gestisce il formato vecchio (Brindisi, Taranto)
                    else if (h.OSPEDALE && h.COORDINATE) {
                        const coords = (h.COORDINATE || '').split(',').map(s => Number(s.trim()));
                        lat = coords[0];
                        lon = coords[1];
                        nome = h.OSPEDALE?.trim() || '';
                        indirizzo = h.INDIRIZZO || '';
                        
                        return {
                            nome,
                            lat,
                            lon,
                            indirizzo,
                            raw: h,
                            central: codice
                        };
                    }
                    
                    return null;
                }).filter(h => h !== null);
                
                console.log(`[INFO] Caricati ${ospedali.length} ospedali per ${codice}`);
            }
        } catch (error) {
            console.error(`[ERROR] Errore caricamento ospedali ${codice}:`, error);
        }

        return ospedali;
    }

    async loadIndirizziCentrale(codice) {
        if (!this.centrali || !this.centrali[codice]) {
            console.error('[ERROR] Centrale non trovata:', codice);
            return [];
        }

        const centrale = this.centrali[codice];
        let indirizzi = [];

        try {
            const response = await fetch(centrale.indirizziFile);
            if (response.ok) {
                indirizzi = await response.json();
                if (!Array.isArray(indirizzi)) {
                    indirizzi = Object.values(indirizzi).find(v => Array.isArray(v)) || [];
                }
                console.log(`[INFO] Caricati ${indirizzi.length} indirizzi per ${codice}`);
            }
        } catch (error) {
            console.error(`[ERROR] Errore caricamento indirizzi ${codice}:`, error);
        }

        return indirizzi;
    }

    // Nuovo sistema per visualizzare tutte le centrali
    async loadAllCentraliData() {
        const centrali = await this.loadCentrali();
        const allData = {};
        
        for (const [codice, centrale] of Object.entries(centrali)) {
            try {
                const [mezzi, ospedali] = await Promise.all([
                    this.loadMezziCentrale(codice),
                    this.loadOspedaliCentrale(codice)
                ]);
                
                allData[codice] = {
                    info: centrale,
                    mezzi: mezzi,
                    ospedali: ospedali
                };
                
                console.log(`[INFO] Dati caricati per centrale ${codice}:`, 
                           `${mezzi.length} mezzi, ${ospedali.length} ospedali`);
            } catch (error) {
                console.error(`[ERROR] Errore caricamento dati centrale ${codice}:`, error);
                allData[codice] = {
                    info: centrale,
                    mezzi: [],
                    ospedali: []
                };
            }
        }
        
        return allData;
    }

    // Ottieni i mezzi di tutte le centrali (non più filtrato)
    async getAllMezzi() {
        const centrali = await this.loadCentrali();
        const rawHems = await this.loadHEMS();
        
        // Processa mezzi HEMS con formato standardizzato
        const hems = rawHems.map(h => {
            let lat = h.lat ?? null;
            let lon = h.lon ?? null;
            
            if ((!lat || !lon) && h['Coordinate Postazione']) {
                const coords = h['Coordinate Postazione'].split(',').map(s => Number(s.trim()));
                lat = coords[0];
                lon = coords[1];
            }
            
            return {
                nome_radio: (h.nome_radio || h['Nome radio'] || '').trim(),
                postazione: (h.postazione || h['Nome Postazione'] || '').trim(),
                tipo_mezzo: h.tipo_mezzo || h.Mezzo || '',
                convenzione: h.convenzione || h['Convenzione'] || '',
                Giorni: h.Giorni || h.giorni || 'LUN-DOM',
                'Orario di lavoro': h['Orario di lavoro'] || '',
                lat,
                lon,
                stato: 1,
                _marker: null,
                _callMarker: null,
                _ospedaleMarker: null,
                central: 'HEMS',
                isHEMS: true
            };
        });
        
        let allMezzi = [...hems]; // Inizia con HEMS (una sola volta)

        for (const codice of Object.keys(centrali)) {
            try {
                const mezzi = await this.loadMezziCentrale(codice);
                allMezzi = allMezzi.concat(mezzi);
            } catch (error) {
                console.error(`[ERROR] Errore caricamento mezzi centrale ${codice}:`, error);
            }
        }

        console.log('[INFO] Mezzi totali caricati da tutte le centrali:', allMezzi.length, `(${hems.length} HEMS + ${allMezzi.length - hems.length} provinciali)`);
        return allMezzi;
    }

    // Ottieni gli ospedali di tutte le centrali
    async getAllOspedali() {
        const centrali = await this.loadCentrali();
        let allOspedali = [];

        for (const codice of Object.keys(centrali)) {
            try {
                const ospedali = await this.loadOspedaliCentrale(codice);
                // Aggiungi informazioni sulla centrale di appartenenza
                const ospedaliWithCentral = ospedali.map(ospedale => ({
                    ...ospedale,
                    centrale: codice,
                    centraleName: centrali[codice].nome
                }));
                allOspedali = allOspedali.concat(ospedaliWithCentral);
            } catch (error) {
                console.error(`[ERROR] Errore caricamento ospedali centrale ${codice}:`, error);
            }
        }

        console.log('[INFO] Ospedali totali caricati da tutte le centrali:', allOspedali.length);
        return allOspedali;
    }

    // Ottieni le centrali collegate a quella selezionata
    getCentraliCollegate(codice = null) {
        const centrale = codice || this.centraleSelezionata;
        if (!centrale || !this.centrali) return [];
        
        const centraleInfo = this.centrali[centrale];
        return centraleInfo?.centraliCollegate || [];
    }

    // Verifica se una centrale è collegata a quella selezionata
    isCentraleCollegata(codiceCentrale) {
        const collegate = this.getCentraliCollegate();
        return collegate.includes(codiceCentrale) || codiceCentrale === this.centraleSelezionata;
    }

    // Filtra i mezzi per mostrare solo quelli della centrale selezionata + HEMS (DEPRECATO)
    filterMezziBySelected(allMezzi) {
        console.warn('[DEPRECATED] filterMezziBySelected è deprecato, usa getAllMezzi()');
        return allMezzi; // Ora mostra tutti i mezzi
    }

    // Event system per notificare i cambiamenti
    onCentralChanged(handler) {
        this.eventHandlers.push({ event: 'centralChanged', handler });
    }

    notifyHandlers(event, data) {
        this.eventHandlers
            .filter(h => h.event === event)
            .forEach(h => h.handler(data));
    }
}

// Istanza globale del manager
window.centraliManager = new CentraliManager();
