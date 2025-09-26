// Helper: map mission code to color
function getColoreCodice(codice) {
    switch (codice) {
        case 'ROSSO':
        case 'Rosso':
        case 'R - ROSSO': return '#e53935';
        case 'GIALLO':
        case 'Giallo':
        case 'G - GIALLO': return '#ffb300';
        case 'VERDE':
        case 'Verde':
        case 'V - VERDE': return '#4caf50';
        case 'BIANCO':
        case 'Bianco':
        case 'B - BIANCO': return '#ffffff';
        default: return '#888';
    }
}

class GameUI {
    constructor(game) {
        this.game = game;
        this._mezziInAlto = []; // Persistenza dei mezzi in alto
    }

    showNewCall(call) {
        const arriviBox = document.querySelector('#chiamateInArrivo .box-content');
        if (!arriviBox) return;
        // Controlla se già presente
        if (document.getElementById(`call-${call.id}`)) return;
        // Forza sempre call.indirizzo valorizzato
        if (!call.indirizzo && call.location) call.indirizzo = call.location;
        if (!call.location && call.indirizzo) call.location = call.indirizzo;
        const div = document.createElement('div');
        div.className = 'evento chiamata-arrivo';
        div.id = `call-${call.id}`;
        
        // Stile per le chiamate in arrivo: bordo lampeggiante
        div.style.border = '2px solid #f44336';
        div.style.borderRadius = '5px';
        div.style.background = '#ffebee';
        div.style.animation = 'pulsate 2s infinite';
        
        // Aggiungi stile keyframe per l'animazione pulsante
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes pulsate {
                0% { box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(244, 67, 54, 0); }
                100% { box-shadow: 0 0 0 0 rgba(244, 67, 54, 0); }
            }
        `;
        document.head.appendChild(style);
        
        div.innerHTML = `
            <div class="call-header" style="cursor:pointer;display:flex;align-items:center;">
                <span style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:16px;">🚨</span>
                    <b>Nuova chiamata in arrivo</b>
                </span>
            </div>
            <div class="call-details" style="display:none;">
                <div class="call-sim-voice"><span class="sim-patologia">${call.simText || 'Paziente con sintomi da valutare...'}</span></div>
                <div class="call-indirizzo"><b>Indirizzo:</b> ${call.indirizzo || call.location || 'Indirizzo sconosciuto'}</div>
                <div class="call-actions" style="margin-top:10px;">
                    <button class="btn-crea-missione" style="background:#1976d2;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">Crea missione</button>
                    <button class="btn-chiudi" style="background:#e53935;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;margin-left:10px;">Chiudi</button>
                </div>
            </div>
        `;
        // Espansione/collapse
        div.querySelector('.call-header').onclick = () => {
            const det = div.querySelector('.call-details');
            const expanded = det.style.display === 'none';
            det.style.display = expanded ? 'block' : 'none';
            // Mostra marker sulla mappa se espanso
            if (expanded && call._marker && window.game && window.game.map) {
                try {
                    window.game.map.setView([call.lat, call.lon], 16, { animate: true });
                    call._marker.openPopup && call._marker.openPopup();
                } catch (err) {}
            }
        };
        // Chiudi
        div.querySelector('.btn-chiudi').onclick = () => {
            div.remove();
            if (call._marker && window.game && window.game.map) window.game.map.removeLayer(call._marker);
            window.game.calls.delete(call.id);
        };
        // Crea missione
        div.querySelector('.btn-crea-missione').onclick = () => {
            window.game.openMissionPopup(call);
        };
        arriviBox.appendChild(div);
        window.soundManager.play('phone_ring');
    }

    moveCallToEventiInCorso(call) {
        // Forza sempre call.indirizzo valorizzato
        if (!call.indirizzo && call.location) call.indirizzo = call.location;
        if (!call.location && call.indirizzo) call.location = call.indirizzo;
        const eventiBox = document.querySelector('#eventiInCorso .box-content');
        if (!eventiBox) return;
        // Controlla se già presente
        if(document.getElementById(`evento-${call.missioneId}`)) return;
        const div = document.createElement('div');
        div.className = 'evento missione-corso';
        div.id = `evento-${call.missioneId}`;
        // Estrai via e comune senza CAP
        let indirizzo = call.indirizzo || call.location || 'Indirizzo sconosciuto';
        let via = '', comune = '';
        const viaMatch = indirizzo.match(/((Via|Viale|Piazza|Corso|Largo|Vicolo|Contrada|Borgo|Strada) [^,]+)/i);
        if(viaMatch) via = viaMatch[1];
        // Regex: cerca la parte dopo la virgola, elimina CAP e prende solo il nome del comune
        // Esempio: "Via Decò e Canetta, 24068 Seriate BG" => comune = "Seriate"
        const comuneMatch = indirizzo.match(/,\s*(?:\d{5}\s*)?([\w' ]+?)\s+[A-Z]{2}/);
        if(comuneMatch) comune = comuneMatch[1].replace(/\d+/g, '').trim();
        // Fallback per indirizzi con formato "... – 25012 Comune BS"
        if(!comune && indirizzo.includes('–')) {
            const parts = indirizzo.split('–');
            const tail = parts[parts.length-1] || '';
            // Rimuovi CAP e sigla provincia
            let cleaned = tail.replace(/^\s*\d{5}\s*/,'').replace(/\s+[A-Z]{2}\s*$/,'').trim();
            if(cleaned) comune = cleaned;
        }
        // Ulteriore fallback: se manca provincia/CAP ma c'è una virgola, usa il testo dopo l'ultima virgola
        if(!comune && indirizzo.includes(',')) {
            const partsComma = indirizzo.split(',');
            const tailComma = partsComma[partsComma.length-1].trim();
            if(tailComma) comune = tailComma;
        }
        let indirizzoSintetico = via;
        if(comune) indirizzoSintetico += ' - ' + comune;
        indirizzoSintetico = indirizzoSintetico.trim() || indirizzo;
        
        // Imposta lo stile base in base alla presenza o meno di mezzi
        let missioneStyle = '';
        let missioneStatusIcon = '';
        let missioneStatusText = '';
        
        // Verifica se ci sono mezzi assegnati
        const hasMezziAssegnati = call.mezziAssegnati && call.mezziAssegnati.length > 0;
          if (!hasMezziAssegnati) {
            // Stile per missioni senza mezzi: bordo tratteggiato grigio
            missioneStyle = 'border: 2px dashed #999; border-radius: 5px;';
            missioneStatusText = '<span style="color:#999;font-size:12px;margin-left:10px;">■ Nessun mezzo</span>';
        } else if (window.game && window.game.mezzi) {
            const mezzi = window.game.mezzi.filter(m => (call.mezziAssegnati||[]).includes(m.nome_radio));
            
            // Verifica se c'è almeno un mezzo con report pronto
            const hasReportPronto = mezzi.some(m => (m.comunicazioni||[]).some(c => c.toLowerCase().includes('report pronto')));
            
            // Verifica se c'è almeno un mezzo in trasporto verso ospedale
            const hasOspedaleTransfer = mezzi.some(m => m.stato === 4);
            
            // Verifica se c'è almeno un mezzo in ospedale
            const hasOspedale = mezzi.some(m => m.stato === 5 || m.stato === 6);
            
            if (hasOspedale) {
                missioneStyle = 'border: 2px solid #ffca28; border-radius: 5px; background-color: #fff8e1;';
                missioneStatusIcon = '<span style="font-size:16px;margin-left:10px;">🏥</span>';
                missioneStatusText = '<span style="color:#e65100;font-size:12px;margin-left:5px;">■ Mezzo in ospedale</span>';
            } else if (hasOspedaleTransfer) {
                missioneStyle = 'border: 2px solid #66bb6a; border-radius: 5px; background-color: #e8f5e9;';
                missioneStatusIcon = '<span style="font-size:16px;margin-left:10px;">🚑</span>';
                missioneStatusText = '<span style="color:#1b5e20;font-size:12px;margin-left:5px;">■ In trasporto verso ospedale</span>';
            } else if (hasReportPronto) {
                missioneStyle = 'border: 2px solid #42a5f5; border-radius: 5px; background-color: #e3f2fd;';                missioneStatusIcon = '<span style="font-size:16px;margin-left:10px;">📋</span>';
                missioneStatusText = '<span style="color:#0d47a1;font-size:12px;margin-left:5px;">■ Report pronto</span>';
            } else {
                // Missione con mezzi in stato normale
                missioneStyle = 'border: 2px solid #5c6bc0; border-radius: 5px;';
                missioneStatusText = '<span style="color:#3949ab;font-size:12px;margin-left:10px;">■ In corso</span>';
            }
        }
        
        // Aggiungi lo stile al div principale
        div.setAttribute('style', missioneStyle);
        
        // Ospedale e codice trasporto SOLO se confermati
        let ospedaleHtml = '';
        if (call.mezziAssegnati && call.mezziAssegnati.length > 0 && window.game && window.game.mezzi) {
            const mezzi = window.game.mezzi.filter(m => (call.mezziAssegnati||[]).includes(m.nome_radio));
            // Filtra solo MSA1_A, MSA2_A, ELI o MSB
            const eligibleMezzi = mezzi.filter(m => {
                const tipo = m.tipo_mezzo || '';
                return tipo === 'MSA1_A' || tipo === 'MSA2_A' || tipo.includes('ELI') || tipo === 'MSB';
            });
            const mezzoConOspedale = eligibleMezzi.find(m => m.ospedale && m.codice_trasporto && m._trasportoConfermato);
            if (mezzoConOspedale) {
                ospedaleHtml = ` <span style='margin-left:12px;'></span><span style='font-size:13px;'>Destinazione: <b>${mezzoConOspedale.ospedale.nome}</b></span> <span style='display:inline-block;width:5px;height:5px;margin-left:6px;vertical-align:middle;background:${getColoreCodice(mezzoConOspedale.codice_trasporto)};background-size:cover;border:1px solid #000;'></span>`;
            }
        }
          // Calcola fasce operative basate sul nome_radio assegnati e orario simulato
        const assignedUnique = Array.from(new Set((call.mezziAssegnati||[]).map(n=>n.trim())));
        // Build current time string
        const secEC = window.simTime || 0;
        const hhEC = Math.floor(secEC/3600) % 24;
        const mmEC = Math.floor((secEC % 3600)/60);
        const oraEC = `${String(hhEC).padStart(2,'0')}:${String(mmEC).padStart(2,'0')}`;
        let mezziInMissioneEC = (window.game.mezzi||[]).filter(m => assignedUnique.includes(m.nome_radio.trim()));
        // Preferisci solo i mezzi operativi al momento
        const operativiEC = typeof isMezzoOperativo === 'function'
            ? mezziInMissioneEC.filter(m => isMezzoOperativo(m, oraEC))
            : mezziInMissioneEC;
        if (operativiEC.length) mezziInMissioneEC = operativiEC;
        const tipiMezziHeader = Array.from(new Set(mezziInMissioneEC.map(m => m.tipo_mezzo)));
        const tipiMezziText = tipiMezziHeader.length > 0 
            ? `<span style="color:#1565C0;font-size:12px;margin-left:6px;">[${tipiMezziHeader.join(', ')}]</span>` 
            : '';
        
        div.innerHTML = `            <div class="missione-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;">
                 <span>
                     <span class="missione-codice-box" style="display:inline-block;width:5px;height:5px;margin-right:8px;vertical-align:middle;background:${getColoreCodice(call.codice)};background-size:cover;border:1px solid #000;"></span>
                     ${call.missioneId} - ${indirizzoSintetico}${tipiMezziText}${ospedaleHtml}
                     ${missioneStatusIcon}${missioneStatusText}
                     ${call.vvfAllertati ? '<span style="margin-left:8px;color:#d32f2f;font-weight:bold;">VVF</span>' : ''}
                     ${call.ffoAllertate ? '<span style="margin-left:8px;color:#1565C0;font-weight:bold;">FFO</span>' : ''}
                 </span>
                 <button class='btn-edit-missione'>Modifica</button>
            </div>
            <div class="missione-details" style="display:none;">
                <div><b>Tipologia Mezzi:</b> ${
                    (call.mezziAssegnati && call.mezziAssegnati.length > 0 && window.game && window.game.mezzi) 
                    ? Array.from(new Set(window.game.mezzi
                        .filter(m => call.mezziAssegnati.includes(m.nome_radio))
                        .map(m => m.tipo_mezzo)
                      )).join(', ') || 'Nessuno'
                    : 'Nessuno'
                }
                ${call.vvfAllertati ? '<span style="margin-left:8px;color:#d32f2f;font-weight:bold;">VVF allertati</span>' : ''}
                ${call.ffoAllertate ? '<span style="margin-left:8px;color:#388e3c;font-weight:bold;">FFO allertate</span>' : ''}
                </div>
                <div class='report-section'></div>
            </div>
        `;
        // Espansione/collapse
        div.querySelector('.missione-header').onclick = (e) => {
            if(e.target.classList.contains('btn-edit-missione')) return;
            const det = div.querySelector('.missione-details');
            const expanded = det.style.display === 'none';
            det.style.display = expanded ? 'block' : 'none';
            // Mostra marker sulla mappa se espanso
            if (expanded && call._marker && window.game && window.game.map) {
                try {
                    window.game.map.setView([call.lat, call.lon], 16, { animate: true });
                    call._marker.openPopup && call._marker.openPopup();
                } catch (err) {}
            }
        };
        // Modifica missione
        div.querySelector('.btn-edit-missione').onclick = (e) => {
            e.stopPropagation();
            window.game.openMissionPopup(call);
        };
        eventiBox.appendChild(div);
        // Aggiorna subito la missione per mostrare correttamente il menù ospedali/codice se necessario
        this.updateMissioneInCorso(call);
    }    // Aggiorna la visualizzazione di una missione già presente in Eventi in corso
    updateMissioneInCorso(call) {
        // Forza sempre call.indirizzo valorizzato
        if (!call.indirizzo && call.location) call.indirizzo = call.location;
        if (!call.location && call.indirizzo) call.location = call.indirizzo;
        // Build list of current assigned vehicle records (only operational, non-returned)
        // Build assignedRecords: vehicles on mission (exclude returned state 7)
        const assignedUnique = Array.from(new Set((call.mezziAssegnati||[]).map(n => n.trim())));
        const allAssigned = (this.game.mezzi||[]).filter(m => assignedUnique.includes(m.nome_radio.trim()) && m.stato !== 7);
        // Determine current simulated time for schedule filter
        const secT = window.simTime || 0;
        const hhT = Math.floor(secT/3600)%24;
        const mmT = Math.floor((secT%3600)/60);
        const oraT = `${String(hhT).padStart(2,'0')}:${String(mmT).padStart(2,'0')}`;
        // Prefer vehicles operational now, else use any non-returned
        const operativi = typeof isMezzoOperativo === 'function'
            ? allAssigned.filter(m => isMezzoOperativo(m, oraT))
            : allAssigned;
        const selected = operativi.length ? operativi : allAssigned;
        // Deduplicate by nome_radio
        const assignedRecords = Array.from(new Map(selected.map(m=>[m.nome_radio.trim(), m])).values());
        const div = document.getElementById(`evento-${call.missioneId}`);
        if (!div) return;
        // Estrai via e comune senza CAP
        let indirizzo = call.indirizzo || call.location || 'Indirizzo sconosciuto';
        let via = '', comune = '';
        const viaMatch = indirizzo.match(/((Via|Viale|Piazza|Corso|Largo|Vicolo|Contrada|Borgo|Strada) [^,]+)/i);
        if(viaMatch) via = viaMatch[1];
        // Regex: cerca la parte dopo la virgola, elimina CAP e prende solo il nome del comune
        // Esempio: "Via Decò e Canetta, 24068 Seriate BG" => comune = "Seriate"
        const comuneMatch = indirizzo.match(/,\s*(?:\d{5}\s*)?([\w' ]+?)\s+[A-Z]{2}/);
        if(comuneMatch) comune = comuneMatch[1].replace(/\d+/g, '').trim();
        // Fallback per indirizzi con formato "... – 25012 Comune BS"
        if(!comune && indirizzo.includes('–')) {
            const parts = indirizzo.split('–');
            const tail = parts[parts.length-1] || '';
            // Rimuovi CAP e sigla provincia
            let cleaned = tail.replace(/^\s*\d{5}\s*/,'').replace(/\s+[A-Z]{2}\s*$/,'').trim();
            if(cleaned) comune = cleaned;
        }
        // Ulteriore fallback: se manca provincia/CAP ma c'è una virgola, usa il testo dopo l'ultima virgola
        if(!comune && indirizzo.includes(',')) {
            const partsComma = indirizzo.split(',');
            const tailComma = partsComma[partsComma.length-1].trim();
            if(tailComma) comune = tailComma;
        }
        let indirizzoSintetico = via;
        if(comune) indirizzoSintetico += ' - ' + comune;
        indirizzoSintetico = indirizzoSintetico.trim() || indirizzo;
        
        // Imposta lo stile in base alla presenza o meno di mezzi
        let missioneStyle = '';
        let missioneStatusIcon = '';
        let missioneStatusText = '';
        
        // Verifica se ci sono mezzi assegnati
        const hasMezziAssegnati = assignedRecords.length > 0;
        if (!hasMezziAssegnati) {
            // Stile per missioni senza mezzi: bordo tratteggiato grigio
            missioneStyle = 'border: 2px dashed #999; border-radius: 5px;';
            missioneStatusText = '<span style="color:#999;font-size:12px;margin-left:10px;">■ Nessun mezzo</span>';
        } else if (this.game && this.game.mezzi) {
            // Use assignedRecords (vehicles on mission) for status logic
            const mezzi = assignedRecords;
            
            // Verifica se c'è almeno un mezzo con report pronto
            const hasReportPronto = mezzi.some(m => (m.comunicazioni||[]).some(c => c.toLowerCase().includes('report pronto')));
            
            // Verifica se c'è almeno un mezzo in trasporto verso ospedale
            const hasOspedaleTransfer = mezzi.some(m => m.stato === 4);
            
            // Verifica se c'è almeno un mezzo in ospedale
            const hasOspedale = mezzi.some(m => m.stato === 5 || m.stato === 6);
            
            if (hasOspedale) {
                missioneStyle = 'border: 2px solid #ffca28; border-radius: 5px; background-color: #fff8e1;';
                missioneStatusIcon = '<span style="font-size:16px;margin-left:10px;">🏥</span>';
                missioneStatusText = '<span style="color:#e65100;font-size:12px;margin-left:5px;">■ Mezzo in ospedale</span>';
            } else if (hasOspedaleTransfer) {
                missioneStyle = 'border: 2px solid #66bb6a; border-radius: 5px; background-color: #e8f5e9;';
                missioneStatusIcon = '<span style="font-size:16px;margin-left:10px;">🚑</span>';
                missioneStatusText = '<span style="color:#1b5e20;font-size:12px;margin-left:5px;">■ In trasporto verso ospedale</span>';
            } else if (hasReportPronto) {
                missioneStyle = 'border: 2px solid #42a5f5; border-radius: 5px; background-color: #e3f2fd;';                missioneStatusIcon = '<span style="font-size:16px;margin-left:10px;">📋</span>';
                missioneStatusText = '<span style="color:#0d47a1;font-size:12px;margin-left:5px;">■ Report pronto</span>';
            } else {
                // Missione con mezzi in stato normale
                missioneStyle = 'border: 2px solid #5c6bc0; border-radius: 5px;';
                missioneStatusText = '<span style="color:#3949ab;font-size:12px;margin-left:10px;">■ In corso</span>';
            }
        }
        
        // Aggiorna lo stile del div principale
        div.setAttribute('style', missioneStyle);

        // Ospedale e codice trasporto SOLO se confermati
        let ospedaleHtml = '';
        if (call.mezziAssegnati && call.mezziAssegnati.length > 0 && this.game && this.game.mezzi) {
            const mezzi = this.game.mezzi.filter(m => (call.mezziAssegnati||[]).includes(m.nome_radio));
            // Filtra solo MSA1_A, MSA2_A, ELI o MSB
            const eligibleMezzi = mezzi.filter(m => {
                const tipo = m.tipo_mezzo || '';
                return tipo === 'MSA1_A' || tipo === 'MSA2_A' || tipo.includes('ELI') || tipo === 'MSB';
            });
            const mezzoConOspedale = eligibleMezzi.find(m => m.ospedale && m.codice_trasporto && m._trasportoConfermato);
            if (mezzoConOspedale) {
                ospedaleHtml = ` <span style='margin-left:12px;'></span><span style='font-size:13px;'>Destinazione: <b>${mezzoConOspedale.ospedale.nome}</b></span> <span style='display:inline-block;width:16px;height:16px;border-radius:4px;margin-left:6px;vertical-align:middle;background:${getColoreCodice(mezzoConOspedale.codice_trasporto)};border:1px solid #888;'></span>`;
            }
        }        // Aggiorna header e dettagli
        const header = div.querySelector('.missione-header');
        if(header) {
            // Ottieni solo i mezzi assegnati, filtra per operatività oraria e deduplica tipi
            let tipiMezziHeader = [];
            if (call.mezziAssegnati && call.mezziAssegnati.length > 0 && this.game && this.game.mezzi) {
                // Calcola orario simulato nel formato HH:mm
                const secUI = window.simTime || 0;
                const hhUI = Math.floor(secUI/3600) % 24;
                const mmUI = Math.floor((secUI % 3600)/60);
                const oraUI = `${String(hhUI).padStart(2,'0')}:${String(mmUI).padStart(2,'0')}`;
                const assigned = Array.from(new Set(call.mezziAssegnati.map(n=>n.trim())));
                let mezziInMissione = this.game.mezzi.filter(m => assigned.includes(m.nome_radio.trim()));
                // Preferisci i mezzi attualmente operativi
                const operativi = mezziInMissione.filter(m => typeof isMezzoOperativo === 'function' && isMezzoOperativo(m, oraUI));
                if (operativi.length) mezziInMissione = operativi;
                tipiMezziHeader = Array.from(new Set(mezziInMissione.map(m => m.tipo_mezzo)));
            }
            
            const tipiMezziText = tipiMezziHeader.length > 0 
                ? `<span style="color:#1565C0;font-size:12px;margin-left:6px;">[${tipiMezziHeader.join(', ')}]</span>` 
                : '';
            
            header.innerHTML = `
            <span style="display:flex;align-items:center;gap:8px;">
                <span class="missione-codice-box" style="display:inline-block;width:18px;height:18px;border-radius:4px;margin-right:8px;vertical-align:middle;background:${getColoreCodice(call.codice)};border:1px solid #000;"></span>
                ${call.missioneId} - ${indirizzoSintetico}${tipiMezziText}${ospedaleHtml}
                ${missioneStatusIcon}${missioneStatusText}
                ${call.vvfAllertati ? '<span style="margin-left:8px;color:#d32f2f;font-weight:bold;">VVF</span>' : ''}
                ${call.ffoAllertate ? '<span style="margin-left:8px;color:#1565C0;font-weight:bold;">FFO</span>' : ''}
            </span>
            <button class='btn-edit-missione'>Modifica</button>
        `;
        }

        // Riaggancia il listener al pulsante Modifica
        const btnEdit = div.querySelector('.btn-edit-missione');
        if(btnEdit) {
            btnEdit.onclick = (e) => {
                e.stopPropagation();
                window.game.openMissionPopup(call);
            };
        }

        const dettagli = div.querySelector('.missione-details');
        if(dettagli) {
            // Blocca aggiornamento se l'utente sta interagendo con il menù ospedali/codice
            const active = document.activeElement;
            if (active && (active.classList.contains('select-ospedale') || active.classList.contains('select-codice-trasporto') || active.classList.contains('btn-conferma-trasporto'))) {
                return;
            }

            let html = '';
            // Use deduplicated assignedRecords for listing vehicles
            const mezzi = assignedRecords;
             const ospedali = (window.game && window.game.hospitals) ? window.game.hospitals : (this.game.hospitals||[]);

            // Se non ci sono ospedali, mostra messaggio di caricamento
            if (!ospedali.length) {
                if (!dettagli.innerHTML.includes('Caricamento ospedali in corso')) {
                    dettagli.innerHTML += `<div style='color:#d32f2f;font-weight:bold;'>Caricamento ospedali in corso...</div>`;
                }
                setTimeout(() => {
                    // Refresh missions once hospitals finally loaded
                    if (window.game && window.game.hospitals && window.game.hospitals.length > 0) {
                        window.game.calls.forEach(c => this.updateMissioneInCorso(c));
                    }
                }, 500);
                return;
            }

            // Determine recommended department code from the report template
            let recommendedDept = null;
            if (call.selectedChiamata) {
                const caseTemplates = call.selectedChiamata[call.selectedCase] || call.selectedChiamata['caso_stabile'] || {};
                for (const rpt of Object.values(caseTemplates)) {
                    const match = rpt.match(/\[([^\]]+)\]$/);
                    if (match) { recommendedDept = match[1].trim().toUpperCase(); break; }
                }
            }
            
            // Define hierarchies for class and trauma recommendations
            const classHierarchy = {
                'PS': ['PS','DEA','EAS'],
                'DEA': ['DEA','EAS'],
                'EAS': ['EAS']
            };
            const traumaHierarchy = {
                'OTT': ['OTT','PST','CTZ','CTS'],
                'PST': ['PST','CTZ','CTS'],
                'CTZ': ['CTZ','CTS'],
                'CTS': ['CTS']
            };
            
            // Define hospitals with single specialities - only recommended when their specific specialty is required
            const singleSpecialityHospitals = {
                'PEDIATRIA': ['H CIVILI BS PEDIATRICO', 'H DEL PONTE', 'H DE MARCHI', 'H BUZZI'],
                'PUNTO NASCITA': ['H MANGIAGALLI', 'H MELLONI'], 
                'EMODINAMICA': ['H MONZINO'],
                'OTT': ['H PINI', 'H CTO'],
                'PST': ['H PINI', 'H CTO']
            };
            
            let almenoUnMezzoReportPronto = false;
            mezzi.forEach(m => {
                let testoScheda = '';
                const avanzati = mezzi.filter(x => (x.tipo_mezzo && (x.tipo_mezzo.startsWith('MSA1') || x.tipo_mezzo.startsWith('MSA2') || (x.tipo_mezzo.toUpperCase().includes('ELI')))) && (x.comunicazioni||[]).some(c => c.toLowerCase().includes('report pronto')));
                // Se c'è almeno un MSB in stato 3 e almeno un avanzato, non mostrare il report del MSB
                const isMSBStato3 = m.tipo_mezzo && m.tipo_mezzo.startsWith('MSB') && m.stato === 3;
                const altriAvanzatiPresenti = avanzati.length > 0;
                let mostraReport = true;
                if (isMSBStato3 && altriAvanzatiPresenti) {
                    mostraReport = false;
                }
                
                // Verifica se il mezzo ha inviato un report pronto
                const hasReportPronto = (m.comunicazioni||[]).some(c => c.toLowerCase().includes('report pronto'));
                
                if (hasReportPronto && mostraReport) {
                    // Determina il tipo di mezzo per la ricerca del report
                    let tipo = '';
                    if (m.tipo_mezzo && m.tipo_mezzo.startsWith('MSB')) tipo = 'MSB';
                    else if (m.tipo_mezzo && m.tipo_mezzo.startsWith('MSA1')) tipo = 'MSA1';
                    else if (m.tipo_mezzo && m.tipo_mezzo.startsWith('MSA2')) tipo = 'MSA2';
                    else if (m.tipo_mezzo && m.tipo_mezzo.toUpperCase().includes('ELI')) tipo = 'MSA2'; // ELI usa sempre MSA2
                    
                    // Cerca il report nella struttura dati della chiamata
                    if (tipo && call.selectedChiamata) {
                        // Prima cerca nel caso selezionato
                        if (call.selectedCase && call.selectedChiamata[call.selectedCase] && 
                            call.selectedChiamata[call.selectedCase][tipo]) {
                            testoScheda = call.selectedChiamata[call.selectedCase][tipo];
                        } 
                        // Se non trova il report nel caso selezionato, usa caso_stabile come fallback
                        else if (call.selectedChiamata['caso_stabile'] && call.selectedChiamata['caso_stabile'][tipo]) {
                            testoScheda = call.selectedChiamata['caso_stabile'][tipo];
                        } 
                        // Solo se non trova niente in caso_stabile usa un messaggio generico
                        else {
                            // Report fallback se non troviamo un report specifico
                            const codiceColore = call.codice || 'Verde';
                            if (tipo === 'MSB') {
                                testoScheda = `Paziente soccorso, parametri vitali stabili. Codice ${codiceColore}. Nessun report dettagliato disponibile.`;
                            } else if (tipo === 'MSA1' || tipo === 'MSA2' || tipo.includes('ELI')) {
                                testoScheda = `Paziente soccorso, valutazione clinica completata. Parametri vitali monitorati. Codice ${codiceColore}. Nessun report dettagliato disponibile.`;
                            } else {
                                testoScheda = `Intervento completato. Codice ${codiceColore}. Nessun report dettagliato disponibile.`;
                            }
                        }
                    } else {
                        // Report fallback se non troviamo un report specifico
                        const codiceColore = call.codice || 'Verde';
                        if (tipo === 'MSB') {
                            testoScheda = `Paziente soccorso, parametri vitali stabili. Codice ${codiceColore}. Nessun report dettagliato disponibile.`;
                        } else if (tipo === 'MSA1' || tipo === 'MSA2' || tipo.includes('ELI')) {
                            testoScheda = `Paziente soccorso, valutazione clinica completata. Parametri vitali monitorati. Codice ${codiceColore}. Nessun report dettagliato disponibile.`;
                        } else {
                            testoScheda = `Intervento completato. Codice ${codiceColore}. Nessun report dettagliato disponibile.`;
                        }
                    }
                }
                // Highlight vehicles arrived at hospital (stato 6)
                const highlightStyle = m.stato === 6 ? 'background:#fff9c4;padding:4px;border-radius:4px;' : '';
                html += `<div style='margin-bottom:6px;${highlightStyle}'><b>${m.nome_radio}</b>`;
                if (testoScheda) {
                    // Remove any text in square brackets from report text
                    testoScheda = testoScheda.replace(/\[[^\]]*\]/g, '').trim();
                    html += `<br><span style='font-size:12px;color:#1976d2;white-space:pre-line;'>${testoScheda}</span>`;
                }

                // Aggiungi stato e comunicazioni del mezzo
                let comunicazioni = '';
                if (Array.isArray(m.comunicazioni) && m.comunicazioni.length > 0) {
                    comunicazioni = m.comunicazioni[m.comunicazioni.length - 1];
                    if (comunicazioni) {
                        html += ` - <span style='color:#555;'>${comunicazioni}</span>`;
                    }
                }

                // Gestione menu ospedali e codice trasporto
                // Mostra il menu solo dopo il report del singolo mezzo e se non confermato
                const showMenu = !m._trasportoConfermato && hasReportPronto;
                if (showMenu) {
                    almenoUnMezzoReportPronto = true;
                    // Reset dei campi solo la prima volta che il menu appare
                    if (!m._menuOspedaliShown) {
                        m.ospedale = null;
                        m.codice_trasporto = null;
                        if (!m.comunicazioni || !m.comunicazioni.includes("Report pronto")) {
                            m.comunicazioni = ["Report pronto"];
                        }
                        m._menuOspedaliShown = true;
                    }                    // Calcola distanza aerea per ogni ospedale
                    let ospedaliConDistanza = ospedali.slice();
                    if (call && call.lat && call.lon) {
                        ospedaliConDistanza = ospedaliConDistanza.map(o => {
                            const d = (o.lat && o.lon)
                                ? distanzaKm(call.lat, call.lon, o.lat, o.lon)
                                : Infinity;
                            return { ...o, _dist: d };
                        });
                    }
                      // Calcola la percentuale di occupazione per ogni ospedale
                    const ospedaliConOccupazione = ospedaliConDistanza.map(h => {
                        const count = window.game.hospitalPatientCount[h.nome] || 0;
                        const capacity = Number(h.raw["N° pazienti Max"] || 0);
                        const pct = capacity ? (count / capacity) * 100 : 0;
                        return {
                            ...h,
                            pct: pct
                        };
                    });
                    
                    // Nel report, ordina gli ospedali solo per distanza dalla chiamata
                    // indipendentemente dalla centrale operativa
                    const ospedaliOrdinati = [...ospedaliConOccupazione].sort((a, b) => {
                        // Se entrambi hanno distanza, ordina per distanza crescente
                        if (a._dist !== undefined && isFinite(a._dist) && 
                            b._dist !== undefined && isFinite(b._dist)) {
                            return a._dist - b._dist;
                        }
                        // Se solo uno ha distanza, quello con distanza viene prima
                        if (a._dist !== undefined && isFinite(a._dist)) return -1;
                        if (b._dist !== undefined && isFinite(b._dist)) return 1;
                        // Se nessuno ha distanza, mantieni l'ordine originale
                        return 0;
                    });

                    // Per veicoli MSA1 e MSA2 mostriamo solo rientro o accompagna
                    if (m.tipo_mezzo === 'MSA1' || m.tipo_mezzo === 'MSA2') {
                        const selectOsp = `<select class='select-ospedale' data-nome='${m.nome_radio}'>`+
                            `<option value="__rientro__">Rientro in sede</option>`+
                            `<option value="__accompagna__">Accompagna in ospedale</option>`+
                            `</select>`;
                        html += `<br>Ospedale: ${selectOsp} <button class='btn-conferma-trasporto' data-nome='${m.nome_radio}'>Conferma</button>`;
                    } else {
                        // Genera il menu ospedali
                        const selectOsp = `<select class='select-ospedale' data-nome='${m.nome_radio}'>`+
                            `<option value="__rientro__">Rientro in sede</option>`+
                            ospedaliOrdinati.map(o => {
                                // Compute occupancy percentage
                                const count = window.game.hospitalPatientCount[o.nome] || 0;
                                const capacity = Number(o.raw["N° pazienti Max"] || 0);
                                const pct = capacity ? Math.round((count / capacity) * 100) : 0;
                                // Distance text
                                const distText = (o._dist !== undefined && isFinite(o._dist)) ? ` (${o._dist.toFixed(1)} km)` : '';
                                // Label with occupancy
                                let label = o.nome.trim() + ` (${pct}%)`;
                                if (recommendedDept) {
                                    let matchRecommended = false;
                                    const dept = recommendedDept.toUpperCase();
                                    const raw = o.raw || {}; // safeguard undefined raw
                                    const hospitalName = o.nome.trim();
                                    
                                    // Check if this is a single-speciality hospital
                                    let isSingleSpecialityHospital = false;
                                    for (const [specialty, hospitals] of Object.entries(singleSpecialityHospitals)) {
                                        if (hospitals.includes(hospitalName)) {
                                            isSingleSpecialityHospital = true;
                                            // Only recommend if the required specialty matches exactly
                                            if (dept === specialty) {
                                                matchRecommended = true;
                                            }
                                            break;
                                        }
                                    }
                                    
                                    // For non-single-speciality hospitals, use normal logic
                                    if (!isSingleSpecialityHospital) {
                                        // Class recommendation
                                        if (classHierarchy[dept]) {
                                            const cls = (raw.CLASSE || raw.classe || '').toString().trim().toUpperCase();
                                            matchRecommended = classHierarchy[dept].some(c => cls.startsWith(c));
                                        }
                                        // Trauma recommendation
                                        else if (traumaHierarchy[dept]) {
                                            const tr = (raw.TRAUMA || raw.trauma || '').toString().trim().toUpperCase();
                                            matchRecommended = traumaHierarchy[dept].includes(tr);
                                        }
                                        // Other departments
                                        else {
                                            const val = raw[dept] != null ? raw[dept].toString().trim().toUpperCase() : '';
                                            matchRecommended = (val === 'TRUE' || val === dept);
                                        }
                                    }
                                    
                                    if (matchRecommended) {
                                        label += ' (consigliato)';
                                    }
                                }
                                return `<option value="${o.nome.trim()}">${label}${distText}</option>`;
                            }).join('')+
                            `</select>`;
                        // Genera il menu codice trasporto
                        const selectCod = `<select class='select-codice-trasporto' data-nome='${m.nome_radio}'>`+
                            ['Rosso','Giallo','Verde'].map(c=>`<option value="${c}">${c}</option>`).join('')+
                            `</select>`;
                        html += `<br>Ospedale: ${selectOsp} Codice: ${selectCod} <button class='btn-conferma-trasporto' data-nome='${m.nome_radio}'>Conferma</button>`;
                    }
                } else if(m.ospedale && m.codice_trasporto) {
                    html += `<br><span style='color:#333;'>Destinazione: <b>${m.ospedale.nome}</b> (${m.codice_trasporto})</span>`;
                }                html += '</div>';
            });

            // Ottieni le tipologie dei mezzi assegnati sul campo (stato !=7)
            const tipiMezziHeader = Array.from(new Set(assignedRecords.map(m => m.tipo_mezzo)));
            const tipiMezziText = tipiMezziHeader.length > 0 
                ? `<span style="color:#1565C0;font-size:12px;margin-left:6px;">[${tipiMezziHeader.join(', ')}]</span>` 
                : '';
            
            dettagli.innerHTML = `<div><b>Tipologia Mezzi:</b> ${tipiMezziHeader.join(', ') || 'Nessuno'}</div>${html}<div class='report-section'></div>`;
            
            // Mostra i dettagli se almeno un mezzo ha inviato report pronto
            if(almenoUnMezzoReportPronto) {
                dettagli.style.display = 'block';
            }

            // Gestione conferma trasporto
            setTimeout(() => {
                dettagli.querySelectorAll('.btn-conferma-trasporto').forEach(btn => {
                    btn.onclick = () => {
                        const nome = btn.getAttribute('data-nome');
                        const ospedaleSel = dettagli.querySelector(`.select-ospedale[data-nome='${nome}']`).value;
                        const codiceSel = dettagli.querySelector(`.select-codice-trasporto[data-nome='${nome}']`)?.value;
                        const mezzo = mezzi.find(m => m.nome_radio === nome);
                        if (!mezzo) return;
                        // Escort for MSA1/MSA2: accompany confirmed transport to hospital in Verde
                        if ((mezzo.tipo_mezzo === 'MSA1' || mezzo.tipo_mezzo === 'MSA2') && ospedaleSel === '__accompagna__') {
                            const lead = mezzi.find(x =>
                                (call.mezziAssegnati || []).includes(x.nome_radio) &&
                                (x.tipo_mezzo.startsWith('MSB') || x.tipo_mezzo.endsWith('_A') || x.tipo_mezzo === 'ELI')
                            );
                            if (lead && lead._trasportoConfermato && lead.ospedale) {                                mezzo.ospedale = lead.ospedale;
                                mezzo.codice_trasporto = 'Verde';
                                mezzo._trasportoConfermato = true;
                                mezzo._reportProntoInviato = true; // Assicuriamoci che il report sia segnato come inviato
                                mezzo.comunicazioni = [lead.ospedale.nome + ', V'];
                                aggiornaMissioniPerMezzo(mezzo);
                                if (window.avanzaMezzoAStato4DopoConferma) window.avanzaMezzoAStato4DopoConferma(mezzo);
                                mezzo._attesaDestinazioneDa = null;
                            } else if (lead) {
                                // MSB non ha ancora destinazione/codice: metti MSA in attesa
                                mezzo._attesaDestinazioneDa = lead.nome_radio;
                                mezzo.ospedale = null;
                                mezzo.codice_trasporto = null;
                                mezzo._trasportoConfermato = false;
                                mezzo.comunicazioni = ['In attesa destinazione MSB'];
                                aggiornaMissioniPerMezzo(mezzo);
                            }
                            return;
                        }
                        // Rientro alla base
                        if (ospedaleSel === '__rientro__') {
                            mezzo.ospedale = null;
                            mezzo.codice_trasporto = null;
                            mezzo._trasportoConfermato = false;
                            mezzo._trasportoAvviato = false;
                            // Distingue il messaggio in base allo stato di partenza
                            const messaggioRientro = mezzo.stato === 3 ? 'Non trasporta' : 'Missione interrotta';
                            mezzo.comunicazioni = [messaggioRientro];
                            // Aggiunge timer di 2-3 minuti per preparazione rientro
                            if (!mezzo._timerRientro) {
                                mezzo._timerRientro = simTimeout(() => {
                                    setStatoMezzo(mezzo, 7);
                                    mezzo._timerRientro = null;
                                    aggiornaMissioniPerMezzo(mezzo);
                                    if (window.game && window.game.postazioniMap && mezzo.postazione) {
                                        const postazione = Object.values(window.game.postazioniMap).find(p => p.nome === mezzo.postazione);
                                        if (postazione) {
                                            const dist = distanzaKm(mezzo.lat, mezzo.lon, postazione.lat, postazione.lon);
                                            getVelocitaMezzo(mezzo.tipo_mezzo).then(vel => {
                                                const tempo = Math.round((dist / vel) * 60);
                                                window.game.moveMezzoGradualmente(mezzo, mezzo.lat, mezzo.lon, postazione.lat, postazione.lon, Math.max(tempo, 2), 1, () => {
                                                    mezzo.comunicazioni = [];
                                                    window.game.ui.updateStatoMezzi(mezzo);
                                                });
                                            });
                                        }
                                    }
                                }, randomMinuti(2, 3) * 60);
                            }
                            aggiornaMissioniPerMezzo(mezzo);
                            return;
                        }
                        // Normal transport for MSB, MSA1_A, MSA2_A, ELI
                        mezzo.ospedale = ospedali.find(o => o.nome.trim() === ospedaleSel) || mezzo.ospedale;
                        if (codiceSel) mezzo.codice_trasporto = codiceSel;                        mezzo._trasportoConfermato = true;
                        mezzo._reportProntoInviato = true; // Assicuriamoci che il report sia segnato come inviato
                        mezzo.comunicazioni = [ospedaleSel + ', ' + codiceSel.charAt(0)];
                        aggiornaMissioniPerMezzo(mezzo);
                        if (window.avanzaMezzoAStato4DopoConferma) window.avanzaMezzoAStato4DopoConferma(mezzo);

                        // --- AGGIORNAMENTO AUTOMATICO MSA IN ATTESA ---
                        // Se questo mezzo è un MSB/ELI che ha appena confermato, aggiorna eventuali MSA in attesa
                        if ((mezzo.tipo_mezzo.startsWith('MSB') || mezzo.tipo_mezzo.endsWith('_A') || mezzo.tipo_mezzo === 'ELI') && mezzo._trasportoConfermato && mezzo.ospedale) {
                            (mezzi || []).forEach(m => {
                                if ((m.tipo_mezzo === 'MSA1' || m.tipo_mezzo === 'MSA2') && m._attesaDestinazioneDa === mezzo.nome_radio) {                                    m.ospedale = mezzo.ospedale;
                                    m.codice_trasporto = 'Verde';
                                    m._trasportoConfermato = true;
                                    m._reportProntoInviato = true; // Assicuriamoci che il report sia segnato come inviato
                                    m.comunicazioni = [mezzo.ospedale.nome + ', V'];
                                    m._attesaDestinazioneDa = null;
                                    aggiornaMissioniPerMezzo(m);
                                    if (window.avanzaMezzoAStato4DopoConferma) window.avanzaMezzoAStato4DopoConferma(m);
                                }
                            });
                        }
                    };
                });
            }, 100);
        }
    }
    
    // Close mission entry when no vehicles remain assigned
    closeMissioneInCorso(call) {
        // Clear note-evento field for this mission
        call.noteEvento = '';
        
        // Remove mission element from UI
        const elem = document.getElementById(`evento-${call.missioneId}`);
        if (elem) elem.remove();
        // Remove call marker from map
        if (call._marker && this.game && this.game.map) {
            this.game.map.removeLayer(call._marker);
        }
        // Remove call from game data
        if (this.game && this.game.calls) {
            this.game.calls.delete(call.id);
        }
    }
    
    // Aggiorna la lista dei mezzi e i loro stati in tempo reale
    updateStatoMezzi(mezzoCambiato = null) {
        // Definisce keyframes per lampeggio report pronto (una sola volta)
        if (!document.getElementById('blink-report-style')) {
            const style = document.createElement('style');
            style.id = 'blink-report-style';
            style.innerHTML = `
                @keyframes blink-report {
                    0% { background-color: #ffebee; }
                    50% { background-color: transparent; }
                    100% { background-color: #ffebee; }
                }
            `;
            document.head.appendChild(style);
        }
        // Select content container instead of entire box
        const container = document.querySelector('#statoMezzi .box-content');
        if (!container || !window.game || !window.game.mezzi) return;

        // Prepare split-pane layout
        container.innerHTML = '';
        container.style.display = 'flex';
        container.style.flexDirection = 'row';
        container.style.maxHeight = 'none';

        // Create left panel for mezzi and right panel for ospedali
        container.insertAdjacentHTML('beforeend', `
            <div id="stateMezziList" style="flex:2;display:flex;flex-direction:column;overflow-y:auto;height:100%;"></div>
            <div id="hospitalList" style="flex:1;display:flex;flex-direction:column;overflow-y:auto;border-left:1px solid #005baa;padding:0;">
                <div class="mezzo-row ospedali-sticky-header" style="display:flex;align-items:center;font-weight:bold;background:#e3e3e3;border-bottom:1px solid #bbb;padding:4px 0 4px 0;position:sticky;top:0;z-index:2;">
                    <div style="flex:1;overflow:hidden;text-overflow:ellipsis;">Elenco Ospedali</div>
                </div>
            </div>
        `);
        const stateDiv = container.querySelector('#stateMezziList');
        const hospDiv = container.querySelector('#hospitalList');

        // Build Stato Mezzi header in stateDiv
        stateDiv.insertAdjacentHTML('beforeend', `
            <div class="mezzo-header-row" style="display:flex;align-items:center;font-weight:bold;background:#e3e3e3;border-bottom:1px solid #bbb;padding:2px 4px;">
                <div style="flex:3;overflow:hidden;text-overflow:ellipsis;">Mezzo</div>
                <div style="flex:2;overflow:hidden;text-overflow:ellipsis;">Tipo/Conv.</div>
                <div style="flex:1;text-align:left;">Stato</div>
                <div style="flex:2;overflow:hidden;text-overflow:ellipsis;">Comunicazioni</div>
            </div>
        `);

        // Funzione robusta per etichetta stato
        function getStatoLabel(stato) {
             if (window.game && window.game.statiMezzi && window.game.statiMezzi[stato] && window.game.statiMezzi[stato].Descrizione) {
                 return window.game.statiMezzi[stato].Descrizione;
             }
             return '';
        }

        // Filter vehicles: always include Creli (no m.central) and those of selected central; others only if state !=1 and !=8
        const allMezzi = window.game.mezzi || [];
        const currentCentral = (window.selectedCentral || '').trim().toUpperCase();
        const mezzi = allMezzi.filter(m => {
            // Creli vehicles have no m.central
            if (!m.central) return true;
            // Vehicles of selected central
            if (m.central === currentCentral) return true;
            // Other central vehicles only if not available (state !=1) and not unknown(8)
            return m.stato !== 1 && m.stato !== 8;
        });
        const mezziStato8 = mezzi.filter(m => m.stato === 8);
        let altriMezzi = mezzi.filter(m => m.stato !== 8);
        altriMezzi.forEach(m => {
            let lastMsg = 0;
            if (Array.isArray(m.comunicazioni) && m.comunicazioni.length > 0) {
                const reportMsg = m.comunicazioni.find(c => c.toLowerCase().includes('report pronto'));
                if (reportMsg) lastMsg = m._lastMsgTime || 0;
            }
            m._sortKey = Math.max(m._lastEvent || 0, lastMsg);
        });
        altriMezzi.sort((a, b) => (b._sortKey || 0) - (a._sortKey || 0));
        mezziStato8.sort((a, b) => (a.nome_radio || '').localeCompare(b.nome_radio || ''));

        // Unisci e porta in testa i mezzi con report pronto
        const merged = [...altriMezzi, ...mezziStato8];
        merged.sort((a, b) => {
            const aHas = (a.comunicazioni||[]).some(c => c.toLowerCase().includes('report pronto'));
            const bHas = (b.comunicazioni||[]).some(c => c.toLowerCase().includes('report pronto'));
            return (bHas === true) - (aHas === true);
        });
        merged.forEach(m => {
                // Calcola missioneId se presente
                const call = Array.from(window.game.calls.values()).find(c => (c.mezziAssegnati||[]).includes(m.nome_radio));
                const missioneId = call ? call.missioneId : '';
                // Stato sempre numerico
                const statoLabel = m.stato;
                
                // Comunicazioni: per stato 7 usa messaggio specifico basato su stato precedente
                let comunicazione = '';
                if (m.stato === 7 && m.statoPrecedente) {
                    if (m.statoPrecedente === 3) {
                        comunicazione = 'Non trasporta';
                    } else if (m.statoPrecedente === 2) {
                        comunicazione = 'Missione interrotta';
                    } else {
                        comunicazione = 'Diretto in sede';
                    }
                } else {
                    // Per altri stati, usa l'ultima comunicazione
                    comunicazione = Array.isArray(m.comunicazioni) && m.comunicazioni.length
                        ? m.comunicazioni[m.comunicazioni.length - 1]
                        : '';
                }
                // Build row: Nome, Tipo/Convenzione, Stato, Comunicazioni
                const hasReport = comunicazione.toLowerCase().includes('report pronto');
                // differenzia report non letto (lampeggio) da report letto
                const hasUnreadReport = hasReport && !m._reportLetto;
                // Aggiungi prefisso e sfondo bianco ai mezzi di altre centrali
                let displayName = m.nome_radio;
                let extraStyle = '';
                // Prefix other central vehicles and apply white background
                const vehicleCentral = (m.central || '').trim().toUpperCase();
                const sel = currentCentral;
                const prefixMap = { ASL1: ['ASL2','ASL3','ASL4','ASL5'], ASL2: ['ASL1','ASL3','ASL4','ASL5'], ASL3: ['ASL1','ASL2','ASL4','ASL5'], ASL4: ['ASL1','ASL2','ASL3','ASL5'], ASL5: ['ASL1','ASL2','ASL3','ASL4'] };
                if (vehicleCentral && vehicleCentral !== sel && prefixMap[sel]?.includes(vehicleCentral)) {
                    displayName = `(${vehicleCentral}) ${m.nome_radio}`;
                    extraStyle = 'background-color:white;';
                }
                const rowStyle = `display:flex;align-items:center;border-bottom:1px solid #ddd;padding:4px 0;${hasUnreadReport ? 'animation: blink-report 1s infinite;' : ''}${extraStyle}`;
                stateDiv.insertAdjacentHTML('beforeend', `
                    <div class="mezzo-row" data-mezzo-id="${m.nome_radio}" style="${rowStyle}">
                        <div class="mezzo-cell" style="flex:3;overflow:hidden;text-overflow:ellipsis;">${displayName}</div>
                        <div class="tipo-cell" style="flex:2;overflow:hidden;text-overflow:ellipsis;">${m.tipo_mezzo || ''}${m.convenzione ? ' - ' + m.convenzione : ''}</div>
                        <div class="stato-cell" style="flex:1;text-align:left;">${statoLabel}</div>
                        <div class="comunicazione-cell" style="flex:2;overflow:hidden;text-overflow:ellipsis;color:${hasUnreadReport ? '#d32f2f' : '#555'};">${comunicazione}</div>
                    </div>
                `);
                // Aggiungo click handler per marcare report come letto
                if (comunicazione.toLowerCase().includes('report pronto')) {
                   // Selezione robusta evitando caratteri invalidi nel selettore
                   const rows = stateDiv.querySelectorAll('.mezzo-row');
                   const rowEl = Array.from(rows).find(el => el.getAttribute('data-mezzo-id') === m.nome_radio);
                   if (rowEl) {
                       rowEl.addEventListener('click', () => {
                           m._reportLetto = true;
                           m._msgLampeggia = false;
                           if (window.game && window.game.ui && typeof window.game.ui.updateStatoMezzi === 'function') {
                               window.game.ui.updateStatoMezzi(m);
                           }
                       });
                   }
                }
        });
        
        // Populate hospital list - separazione come in Veneto
        const center = window.selectedCentral || 'ASL1'; // Centrale corrente
        
        // Calcola la percentuale di occupazione per ogni ospedale prima dell'ordinamento
        const ospedaliConOccupazione = window.game.hospitals.map(h => {
            const count = window.game.hospitalPatientCount[h.nome] || 0;
            const capacity = Number(h.raw["N° pazienti Max"] || 0);
            const pct = capacity ? (count / capacity) * 100 : 0;
            
            // Determina la centrale di appartenenza dell'ospedale dal prefisso
            let ospedalecentral = center; // Default: centrale corrente
            const nameA = h.nome || '';
            if (nameA.startsWith('(ASL1)')) ospedalecentral = 'ASL1';
            else if (nameA.startsWith('(ASL2)')) ospedalecentral = 'ASL2';
            else if (nameA.startsWith('(ASL3)')) ospedalecentral = 'ASL3';
            else if (nameA.startsWith('(ASL4)')) ospedalecentral = 'ASL4';
            else if (nameA.startsWith('(ASL5)')) ospedalecentral = 'ASL5';
            
            return {
                ...h,
                pct: pct,
                central: ospedalecentral
            };
        });
        
        // Raggruppa ospedali per centrale operativa di Liguria
        const ospedaliCentraleCorrente = [];
        const ospedaliAltreCentrali = [];
        
        ospedaliConOccupazione.forEach(h => {
            if (h.central === center) {
                ospedaliCentraleCorrente.push(h);
            } else {
                ospedaliAltreCentrali.push(h);
            }
        });
        
        // Ordina entrambi i gruppi per percentuale di occupazione decrescente
        ospedaliCentraleCorrente.sort((a, b) => b.pct - a.pct);
        ospedaliAltreCentrali.sort((a, b) => b.pct - a.pct);
        
        // Unisci: prima centrale corrente, poi altre centrali
        const ospedaliOrdinati = [...ospedaliCentraleCorrente, ...ospedaliAltreCentrali];
        
        // Visualizza gli ospedali ordinati con separazione visiva
        let separatorAdded = false;
        ospedaliOrdinati.forEach((h, index) => {
            // Use persistent counter for patient occupancy
            const capacity = Number(h.raw["N° pazienti Max"] || 0);
            const count = (window.game.hospitalPatientCount && window.game.hospitalPatientCount[h.nome]) || 0;
            const pct = capacity ? Math.round((count / capacity) * 100) : 0;
            
            // Aggiungi separatore prima degli ospedali di altre centrali
            if (!separatorAdded && h.central !== center) {
                hospDiv.insertAdjacentHTML('beforeend', `
                    <div style="padding:4px 4px;border-bottom:2px solid #005baa;background:#e3e3e3;font-weight:bold;font-size:12px;">
                        Altre ASL
                    </div>
                `);
                separatorAdded = true;
            }
            
            hospDiv.insertAdjacentHTML('beforeend', `
                <div style="padding:2px 4px;border-bottom:1px solid #eee;">
                    ${h.nome} (${pct}%)
                </div>
            `);
        });

        // Attach event handlers to rows as before, using stateDiv
        const rows = stateDiv.querySelectorAll('.mezzo-row');
        rows.forEach(row => {
            const mezzoId = row.getAttribute('data-mezzo-id');
            // Click on mezzo name to center map
            const cellMezzo = row.querySelector('.mezzo-cell');
            if (cellMezzo) {
                cellMezzo.addEventListener('click', e => {
                    e.stopPropagation();
                    const mezzo = window.game.mezzi.find(x => x.nome_radio === mezzoId);
                    if (mezzo && mezzo._marker && window.game.map) {
                        window.game.map.setView([mezzo.lat, mezzo.lon], 16, { animate: true });
                        mezzo._marker.openPopup && mezzo._marker.openPopup();
                    }
                });
            }
            // Click on Report pronto to show mission report
            const cellComm = row.querySelector('.comunicazione-cell');
            if (cellComm) {
                cellComm.addEventListener('click', e => {
                    e.stopPropagation();
                    // Recupera il mezzo corrispondente e marca il report come letto
                    const mezzo = window.game.mezzi.find(x => x.nome_radio === mezzoId);
                    if (mezzo && mezzo._reportLetto !== true) {
                        mezzo._reportLetto = true;
                        this.updateStatoMezzi();
                    }
                    // Se presente report, espandi la missione e scrolla
                    if (cellComm.textContent.includes('Report pronto')) {
                        const calls = Array.from(window.game.calls.values())
                            .filter(call => (call.mezziAssegnati||[]).includes(mezzoId));
                        calls.forEach(call => {
                            window.game.ui.updateMissioneInCorso(call);
                            const elem = document.getElementById(`evento-${call.missioneId}`);
                            if (elem) {
                                const det = elem.querySelector('.missione-details');
                                if (det) det.style.display = 'block';
                                elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        });
                    }
                });
            }
        });
    }
}
