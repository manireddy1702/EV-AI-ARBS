/**
 * Automotive EV ECU Terminal & Diagnostics Controller (js/terminal.js)
 * Powers terminal.html with live ASCII telemetry, CAN-FD stream, UDS DTC diagnostics,
 * LUT calibration tuning, waveform oscilloscope, hardware pinouts & interactive CLI.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ── 1. Domain Controllers ──
    const sensors = new SensorSimulator();
    const ai = new AIModel();
    const bms = new BMS();
    const motor = new MotorController();
    const energy = new EnergyTracker();

    // ── 2. DOM Elements ──
    const asciiScreen = document.getElementById('ascii-screen');
    const logConsole = document.getElementById('log-console');
    const cmdInput = document.getElementById('cmd-input');
    const btnExec = document.getElementById('btn-exec');
    const btnAudio = document.getElementById('btn-audio');
    const canFrameBody = document.getElementById('can-frame-body');
    const canBusLoadEl = document.getElementById('can-bus-load');
    const dtcListEl = document.getElementById('dtc-list');
    const dtcBannerEl = document.getElementById('dtc-banner');
    const dtcStatusTagEl = document.getElementById('dtc-status-tag');
    const dtcBadgeCount = document.getElementById('dtc-badge-count');
    const pinGridEl = document.getElementById('pin-grid');
    const scopeCanvas = document.getElementById('scopeCanvas');
    const scopeCtx = scopeCanvas ? scopeCanvas.getContext('2d') : null;

    // Diagnostic LEDs
    const ledPwr = document.getElementById('led-pwr');
    const ledCan = document.getElementById('led-can');
    const ledRegen = document.getElementById('led-regen');
    const ledDtc = document.getElementById('led-dtc');
    const ledAi = document.getElementById('led-ai');

    // ── 3. Internal ECU State ──
    let cycleCount = 0;
    const startTime = Date.now();
    let prevRegenState = false;
    let audioEnabled = true;
    let activeTab = 'tab-telemetry';
    const canFrames = [];
    const commandHistory = [];
    let historyIdx = -1;

    // Diagnostic Trouble Codes Database
    const activeDTCs = new Map(); // Code -> { code, sys, desc, status, severity }

    // Audio Synthesizer via Web Audio API
    let audioCtx = null;

    function playTone(freq, type = 'sine', duration = 0.08, vol = 0.05) {
        if (!audioEnabled) return;
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(vol, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {
            // Audio context blocked or not supported
        }
    }

    function playBeep(type = 'click') {
        if (type === 'click') playTone(800, 'sine', 0.04, 0.03);
        else if (type === 'error') {
            playTone(300, 'sawtooth', 0.15, 0.08);
            setTimeout(() => playTone(220, 'sawtooth', 0.2, 0.08), 120);
        } else if (type === 'success') {
            playTone(900, 'sine', 0.06, 0.04);
            setTimeout(() => playTone(1200, 'sine', 0.08, 0.04), 60);
        } else if (type === 'relay') {
            playTone(150, 'square', 0.03, 0.06);
            setTimeout(() => playTone(180, 'square', 0.03, 0.06), 40);
        }
    }

    if (btnAudio) {
        btnAudio.addEventListener('click', () => {
            audioEnabled = !audioEnabled;
            btnAudio.textContent = audioEnabled ? '🔊 SOUND: ON' : '🔇 SOUND: OFF';
            if (audioEnabled) playBeep('success');
        });
    }

    // ── 4. Tab Navigation Handler ──
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.tab-view').forEach(view => {
                view.classList.remove('active');
            });
            const targetView = document.getElementById(target);
            if (targetView) targetView.classList.add('active');
            activeTab = target;
            playBeep('click');
        });
    });

    // ── 5. DTC Diagnostics Engine ──
    function injectDTC(code, sys, desc, severity = 'WARNING') {
        activeDTCs.set(code, {
            code,
            sys,
            desc,
            status: 'CONFIRMED',
            severity,
            timestamp: new Date().toLocaleTimeString()
        });
        updateDTCDisplay();
        appendLog(`[DTC FAULT INJECTED] Code ${code}: ${desc}`, 'log-alert');
        playBeep('error');
    }

    function clearDTCs() {
        const count = activeDTCs.size;
        activeDTCs.clear();
        updateDTCDisplay();
        appendLog(`[UDS 0x04] Diagnostic Information Cleared (${count} DTCs wiped).`, 'log-success');
        playBeep('success');
    }

    function updateDTCDisplay() {
        const count = activeDTCs.size;
        dtcBadgeCount.textContent = count;
        dtcBadgeCount.style.background = count > 0 ? 'var(--term-red)' : 'var(--term-dim)';
        dtcBadgeCount.style.color = count > 0 ? '#fff' : '#000';

        if (count > 0) {
            ledDtc.className = 'led-dot red pulse';
            dtcStatusTagEl.textContent = `${count} FAULTS ACTIVE`;
            dtcStatusTagEl.style.color = 'var(--term-red)';
            dtcBannerEl.className = 'dtc-banner active-fault';
            dtcBannerEl.innerHTML = `<span>🚨 MIL LAMP ON: ${count} ACTIVE FAULT(S) DETECTED</span><span>ACTION REQUIRED</span>`;

            let html = '';
            activeDTCs.forEach((dtc) => {
                html += `
                    <div class="dtc-card">
                        <div>
                            <span class="dtc-code">${dtc.code}</span>
                            <span style="font-size:0.7rem; color:var(--term-dim);"> [${dtc.sys}]</span>
                        </div>
                        <div class="dtc-desc">${dtc.desc}</div>
                        <div class="dtc-status">${dtc.status} (${dtc.timestamp})</div>
                    </div>
                `;
            });
            dtcListEl.innerHTML = html;
        } else {
            ledDtc.className = 'led-dot green';
            dtcStatusTagEl.textContent = 'NO ACTIVE DTCs';
            dtcStatusTagEl.style.color = 'var(--term-green)';
            dtcBannerEl.className = 'dtc-banner clean';
            dtcBannerEl.innerHTML = `<span>SYSTEM HEALTH: NORMAL (MIL OFF)</span><span>0 ACTIVE CODES</span>`;
            dtcListEl.innerHTML = `<div style="color: var(--term-dim); font-size: 0.75rem; text-align: center; padding: 1.5rem;">No diagnostic trouble codes detected in ECU memory.</div>`;
        }
    }

    // ── 6. Hardware Pinout Generator ──
    const hardwarePins = [
        { pin: 'AN0', name: 'Brake Pressure Sensor', type: 'ADC', maxV: 5.0 },
        { pin: 'AN1', name: 'Motor Throttle Hall', type: 'ADC', maxV: 5.0 },
        { pin: 'AN2', name: 'Battery Temp NTC', type: 'ADC', maxV: 5.0 },
        { pin: 'AN3', name: 'Motor Temp PTC', type: 'ADC', maxV: 5.0 },
        { pin: 'DIG1', name: 'Wheel RPM Encoder A', type: 'PULSE', maxV: 5.0 },
        { pin: 'DIG2', name: 'Wheel RPM Encoder B', type: 'PULSE', maxV: 5.0 },
        { pin: 'CAN_H', name: 'High-Speed CAN High', type: 'CAN-FD', maxV: 3.5 },
        { pin: 'CAN_L', name: 'High-Speed CAN Low', type: 'CAN-FD', maxV: 1.5 },
        { pin: 'PWM1', name: 'Phase A Gate Driver', type: 'PWM', maxV: 12.0 },
        { pin: 'PWM2', name: 'Phase B Gate Driver', type: 'PWM', maxV: 12.0 },
        { pin: 'PWM3', name: 'Phase C Gate Driver', type: 'PWM', maxV: 12.0 },
        { pin: 'BMS_SPI', name: 'BMS ISO-SPI Interface', type: 'SPI', maxV: 3.3 }
    ];

    function updatePinouts(sensorData, motorState) {
        if (!pinGridEl) return;
        let html = '';
        hardwarePins.forEach(p => {
            let volt = 0;
            if (p.pin === 'AN0') volt = (sensorData.brakePressure / 10.0) * 4.5 + 0.5;
            else if (p.pin === 'AN1') volt = (sensorData.throttleInput / 100.0) * 4.2 + 0.8;
            else if (p.pin === 'AN2') volt = 2.5 + (sensorData.batteryTemp - 25) * 0.05;
            else if (p.pin === 'AN3') volt = 2.2 + (sensorData.motorTemp - 25) * 0.04;
            else if (p.pin.startsWith('PWM')) volt = (motorState.regenDutyCycle / 100.0) * 12.0;
            else if (p.pin.startsWith('CAN')) volt = p.pin === 'CAN_H' ? 3.2 : 1.4;
            else volt = (Math.sin(Date.now() / 200) * 0.5 + 0.5) * p.maxV;

            html += `
                <div class="pin-card">
                    <span class="pin-no">${p.pin}</span>
                    <span class="pin-name">${p.name}</span>
                    <span class="pin-volt">${volt.toFixed(2)} V</span>
                </div>
            `;
        });
        pinGridEl.innerHTML = html;
    }

    // ── 7. CAN Bus Generator & Frame Logger ──
    function logCANFrame(idStr, dlc, hexData, desc) {
        const timeStr = new Date().toLocaleTimeString() + '.' + String(Math.floor(Math.random() * 900 + 100));
        canFrames.unshift({ time: timeStr, id: idStr, dlc, data: hexData, desc });
        if (canFrames.length > 16) canFrames.pop();

        if (activeTab === 'tab-can' && canFrameBody) {
            let html = '';
            canFrames.forEach(f => {
                html += `
                    <tr>
                        <td style="color:var(--term-dim);">${f.time}</td>
                        <td class="can-id">${f.id}</td>
                        <td class="can-dlc">${f.dlc}</td>
                        <td class="can-data">${f.data}</td>
                        <td style="color:var(--term-text); font-size:0.7rem;">${f.desc}</td>
                    </tr>
                `;
            });
            canFrameBody.innerHTML = html;
        }
    }

    // ── 8. Oscilloscope Waveform Renderer ──
    let scopePhase = 0;
    function renderOscilloscope(sensorData, motorState, aiDecision) {
        if (!scopeCtx || activeTab !== 'tab-scope') return;
        const w = scopeCanvas.width;
        const h = scopeCanvas.height;

        scopeCtx.fillStyle = '#030509';
        scopeCtx.fillRect(0, 0, w, h);

        // Draw grid
        scopeCtx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
        scopeCtx.lineWidth = 1;
        for (let x = 0; x < w; x += 40) {
            scopeCtx.beginPath(); scopeCtx.moveTo(x, 0); scopeCtx.lineTo(x, h); scopeCtx.stroke();
        }
        for (let y = 0; y < h; y += 30) {
            scopeCtx.beginPath(); scopeCtx.moveTo(0, y); scopeCtx.lineTo(w, y); scopeCtx.stroke();
        }

        // Center line
        scopeCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        scopeCtx.beginPath(); scopeCtx.moveTo(0, h / 2); scopeCtx.lineTo(w, h / 2); scopeCtx.stroke();

        scopePhase += (sensorData.speed / 10.0) * 0.15 + 0.05;

        // CH1: Phase Voltage Sine (Green)
        scopeCtx.strokeStyle = '#00ff66';
        scopeCtx.lineWidth = 2;
        scopeCtx.beginPath();
        const amp1 = (motorState.backEMF / 60.0) * (h / 3);
        for (let x = 0; x < w; x++) {
            const y = (h / 2) + Math.sin(x * 0.05 + scopePhase) * amp1;
            if (x === 0) scopeCtx.moveTo(x, y); else scopeCtx.lineTo(x, y);
        }
        scopeCtx.stroke();

        // CH2: PWM Gate Duty Cycle Square/Step (Cyan)
        scopeCtx.strokeStyle = '#00f0ff';
        scopeCtx.lineWidth = 1.5;
        scopeCtx.beginPath();
        const pwmDuty = motorState.regenDutyCycle / 100.0;
        const pwmHeight = (h / 4) * pwmDuty;
        for (let x = 0; x < w; x++) {
            const square = Math.sin(x * 0.1 + scopePhase * 2) > 0 ? 1 : -1;
            const y = (h / 2) - square * pwmHeight;
            if (x === 0) scopeCtx.moveTo(x, y); else scopeCtx.lineTo(x, y);
        }
        scopeCtx.stroke();

        // CH3: Regen Current Pulse (Purple)
        if (aiDecision.regenPower > 0) {
            scopeCtx.strokeStyle = '#bb86fc';
            scopeCtx.lineWidth = 2;
            scopeCtx.beginPath();
            const currAmp = (aiDecision.chargeCurrent / 15.0) * (h / 3);
            for (let x = 0; x < w; x++) {
                const noise = (Math.random() - 0.5) * 4;
                const y = (h / 2) - Math.abs(Math.sin(x * 0.03 + scopePhase)) * currAmp + noise;
                if (x === 0) scopeCtx.moveTo(x, y); else scopeCtx.lineTo(x, y);
            }
            scopeCtx.stroke();
        }

        // Legend overlay
        scopeCtx.fillStyle = '#00ff66'; scopeCtx.fillText(`CH1 (Back-EMF): ${motorState.backEMF.toFixed(1)}V`, 10, 15);
        scopeCtx.fillStyle = '#00f0ff'; scopeCtx.fillText(`CH2 (PWM Duty): ${motorState.regenDutyCycle}%`, 160, 15);
        scopeCtx.fillStyle = '#bb86fc'; scopeCtx.fillText(`CH3 (Regen I): ${aiDecision.chargeCurrent.toFixed(1)}A`, 320, 15);
    }

    // ── 9. Interactive CLI Command Execution Handler ──
    window.execCmd = function(cmdStr) {
        if (!cmdStr) return;
        cmdStr = cmdStr.trim();
        commandHistory.push(cmdStr);
        historyIdx = commandHistory.length;

        appendLog(`ECU> ${cmdStr}`, 'log-info');
        playBeep('click');

        const parts = cmdStr.toLowerCase().split(' ');
        const verb = parts[0];

        if (verb === 'help' || verb === '?') {
            appendLog('══════════════ AUTOMOTIVE ECU CLI HELP COMMANDS ══════════════', 'log-ai');
            appendLog('  status                              : Vehicle & ECU operational summary', 'log-info');
            appendLog('  dtc read                            : Scan OBD-II active fault codes', 'log-info');
            appendLog('  dtc clear                           : UDS 0x04 Clear Diagnostic Info', 'log-info');
            appendLog('  dtc inject <slip|overheat|bms>     : Inject simulated component fault', 'log-warn');
            appendLog('  can dump                            : Stream live CAN-FD bus frames', 'log-info');
            appendLog('  set scenario <urban|highway|downhill|emergency>', 'log-info');
            appendLog('  set brake <0-100>                   : Set manual brake lever pressure %', 'log-info');
            appendLog('  set throttle <0-100>                : Set motor throttle %', 'log-info');
            appendLog('  set road <dry|wet|gravel>           : Set surface friction condition', 'log-info');
            appendLog('  ai model <ann|fuzzy|rf|rl>          : Switch active AI inference engine', 'log-ai');
            appendLog('  ai train [epochs]                   : Run continuous online training', 'log-ai');
            appendLog('  ai xai                              : Inspect XAI feature importances', 'log-ai');
            appendLog('  tune map <regen|slip|soc> <val>     : Calibrate ECU LUT parameters', 'log-ai');
            appendLog('  selftest / reboot                   : Trigger ECU POST power-cycle', 'log-warn');
            appendLog('  hex dump                            : Inspect 64-byte ROM memory', 'log-info');
            appendLog('  audio <on|off>                      : Enable/disable relay sounds', 'log-info');
            appendLog('  clear                               : Clear log console buffer', 'log-warn');
        } else if (verb === 'clear') {
            logConsole.innerHTML = '';
            appendLog('[SYSTEM] Console buffer cleared.', 'log-info');
        } else if (verb === 'status') {
            appendLog(`[STATUS] Speed: ${sensors.speed.toFixed(1)} km/h | SOC: ${bms.soc.toFixed(1)}% | Mode: ${motor.mode} | Recovered: ${(energy.totalEnergyJoules / 3600).toFixed(2)} Wh | AI: ${ai.activeModel}`, 'log-success');
            appendLog(`[DIAGNOSTICS] Active DTCs: ${activeDTCs.size} | Uptime: ${document.getElementById('t-uptime').textContent} | Bus Load: 18%`, 'log-info');
        } else if (verb === 'audio') {
            const state = parts[1];
            if (state === 'on') { audioEnabled = true; btnAudio.textContent = '🔊 SOUND: ON'; appendLog('[AUDIO] Sound synthesizer enabled.', 'log-success'); }
            else if (state === 'off') { audioEnabled = false; btnAudio.textContent = '🔇 SOUND: OFF'; appendLog('[AUDIO] Sound synthesizer muted.', 'log-warn'); }
            else appendLog('[USAGE] audio <on|off>', 'log-alert');
        } else if (verb === 'dtc') {
            const sub = parts[1];
            const code = parts[2];
            if (sub === 'read') {
                if (activeDTCs.size === 0) appendLog('[DTC SCAN] No active diagnostic trouble codes found in memory.', 'log-success');
                else {
                    appendLog(`[DTC SCAN] ${activeDTCs.size} Active DTC(s):`, 'log-alert');
                    activeDTCs.forEach((dtc) => appendLog(`  ${dtc.code} [${dtc.sys}]: ${dtc.desc}`, 'log-alert'));
                }
            } else if (sub === 'clear') {
                clearDTCs();
            } else if (sub === 'inject') {
                if (code === 'slip' || code === 'c1201') injectDTC('C1201', 'ABS/REGEN', 'ABS Wheel Slip / Traction Discrepancy Alert', 'CRITICAL');
                else if (code === 'overheat' || code === 'p0a9c') injectDTC('P0A9C', 'BMS THERMAL', 'Hybrid/EV Battery Pack Over-Temperature Protection', 'WARNING');
                else if (code === 'bms' || code === 'p0a1f') injectDTC('P0A1F', 'CAN COMM', 'Battery Energy Control Module Communication Loss', 'CRITICAL');
                else appendLog('[USAGE] dtc inject <slip|overheat|bms>', 'log-alert');
            } else {
                appendLog('[USAGE] dtc <read|clear|inject>', 'log-alert');
            }
        } else if (verb === 'can') {
            const sub = parts[1];
            if (sub === 'dump') {
                appendLog('[CAN BUS DUMP] 5 Mbps CAN-FD raw frame stream active:', 'log-can');
                logCANFrame('0x18FEEF00', '8', '3E 4F 12 A0 00 FF 80 12', 'Vehicle Telemetry');
                logCANFrame('0x18FEEE00', '8', '64 00 FA 01 28 00 FE 02', 'BMS Voltage/Current');
            } else appendLog('[USAGE] can dump', 'log-can');
        } else if (verb === 'selftest' || verb === 'reboot') {
            appendLog('[ECU] Triggering power-cycle and POST self-test diagnostic...', 'log-warn');
            playBeep('relay');
            setTimeout(() => appendLog('  [POST Phase 1] Testing Infineon TriCore TC397 Dual CPUs... PASS', 'log-info'), 300);
            setTimeout(() => appendLog('  [POST Phase 2] Validating CAN-FD 5Mbps transceiver loopback... PASS', 'log-info'), 600);
            setTimeout(() => appendLog('  [POST Phase 3] Checking BMS SPI battery monitor isolator... PASS', 'log-info'), 900);
            setTimeout(() => {
                appendLog('[ECU] Self-test clean. Vehicle Control Unit fully operational.', 'log-success');
                playBeep('success');
            }, 1200);
        } else if (verb === 'hex') {
            appendLog('[EEPROM HEX DUMP 0x08004000]', 'log-purple');
            appendLog('  0x08004000: 52 45 47 45 4E 5F 43 41 4C 49 42 5F 56 32 2E 34', 'log-info');
            appendLog('  0x08004010: 00 1F 3E 5D 7C 9B BA D9 F8 10 25 40 65 80 A5 C0', 'log-info');
        } else if (verb === 'tune') {
            const target = parts[2];
            const val = parseFloat(parts[3]);
            if (target === 'regen' && !isNaN(val)) {
                ai.hyperparams.regenAggressiveness = val;
                appendLog(`[CALIBRATION] Regen Torque gain calibrated to ${val}x`, 'log-success');
            } else if (target === 'slip' && !isNaN(val)) {
                ai.hyperparams.slipSensitivity = val;
                appendLog(`[CALIBRATION] Slip protection sensitivity set to ${val}x`, 'log-success');
            } else if (target === 'soc' && !isNaN(val)) {
                ai.hyperparams.socProtectionThreshold = val;
                appendLog(`[CALIBRATION] SOC protection threshold set to ${val}%`, 'log-success');
            } else appendLog('[USAGE] tune map <regen|slip|soc> <val>', 'log-alert');
        } else if (verb === 'ai') {
            const sub = parts[1];
            const arg = parts[2];
            if (sub === 'model') {
                const map = { ann: 'ANN', fuzzy: 'FUZZY', rf: 'RANDOM_FOREST', rl: 'RL_AGENT' };
                if (map[arg]) {
                    ai.setModel(map[arg]);
                    appendLog(`[AI] Active model switched to: ${map[arg]}`, 'log-ai');
                } else appendLog('[ERROR] Models: ann, fuzzy, rf, rl', 'log-alert');
            } else if (sub === 'train') {
                const epochs = parseInt(arg) || 20;
                appendLog(`[AI] Continuous online training started (${epochs} epochs)...`, 'log-ai');
                ai.trainModel(epochs, (prog) => {
                    if (prog.epoch % 5 === 0 || prog.epoch === prog.totalEpochs) {
                        appendLog(`  Epoch ${prog.epoch}/${prog.totalEpochs} -> Loss: ${prog.loss.toFixed(4)} | Acc: ${prog.accuracy.toFixed(1)}%`, 'log-info');
                    }
                    if (prog.epoch >= prog.totalEpochs) {
                        appendLog(`[AI] Training completed cleanly. Weights optimized.`, 'log-success');
                    }
                });
            } else if (sub === 'xai') {
                const xai = ai.featureImportance;
                appendLog('[XAI FEATURE IMPORTANCE]', 'log-ai');
                appendLog(`  Brake Pressure: ${xai.brakePressure}%`, 'log-info');
                appendLog(`  Vehicle Speed:  ${xai.vehicleSpeed}%`, 'log-info');
                appendLog(`  Road Friction:  ${xai.roadFriction}%`, 'log-info');
                appendLog(`  Battery SOC:    ${xai.batterySOC}%`, 'log-info');
                appendLog(`  Thermal Limits: ${xai.thermalState}%`, 'log-info');
            } else appendLog('[AI] Subcommands: model, train, xai', 'log-ai');
        } else if (verb === 'set') {
            const target = parts[1];
            const val = parts[2];
            if (target === 'scenario' && ['urban', 'highway', 'downhill', 'emergency'].includes(val)) {
                sensors.setScenario(val);
                appendLog(`[SCENARIO] Switched to ${val.toUpperCase()} mode.`, 'log-success');
            } else if (target === 'brake' && !isNaN(val)) {
                sensors.setManualBrake(val);
                appendLog(`[BRAKE] Lever pressure set to ${val}%.`, 'log-warn');
            } else if (target === 'throttle' && !isNaN(val)) {
                sensors.setThrottle(val);
                appendLog(`[THROTTLE] Motor throttle set to ${val}%.`, 'log-info');
            } else if (target === 'road' && ['dry', 'wet', 'gravel'].includes(val)) {
                sensors.setRoadCondition(val);
                appendLog(`[ROAD] Friction condition set to ${val.toUpperCase()}.`, 'log-ai');
            } else appendLog(`[ERROR] Invalid parameter '${target} ${val}'. Type 'help' for syntax.`, 'log-alert');
        } else {
            appendLog(`[ERROR] Unknown ECU command '${verb}'. Type 'help' for syntax.`, 'log-alert');
        }

        logConsole.scrollTop = logConsole.scrollHeight;
    };

    btnExec.addEventListener('click', () => {
        execCmd(cmdInput.value);
        cmdInput.value = '';
    });

    cmdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            execCmd(cmdInput.value);
            cmdInput.value = '';
        } else if (e.key === 'ArrowUp') {
            if (historyIdx > 0) {
                historyIdx--;
                cmdInput.value = commandHistory[historyIdx];
            }
        } else if (e.key === 'ArrowDown') {
            if (historyIdx < commandHistory.length - 1) {
                historyIdx++;
                cmdInput.value = commandHistory[historyIdx];
            } else {
                historyIdx = commandHistory.length;
                cmdInput.value = '';
            }
        }
    });

    function appendLog(msg, typeClass = 'log-info') {
        const timeStr = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.className = `log-line ${typeClass}`;
        line.textContent = `[${timeStr}] ${msg}`;
        logConsole.appendChild(line);
        logConsole.scrollTop = logConsole.scrollHeight;
    }

    // ── Helper ASCII Progress Bar ──
    function asciiBar(val, maxVal, length = 14) {
        const ratio = Math.min(1.0, Math.max(0.0, val / maxVal));
        const filled = Math.round(ratio * length);
        const empty = length - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    // ── 10. Real-Time ECU Control Loop (10 Hz) ──
    setInterval(() => {
        cycleCount++;

        // 1. Sensors update
        const sensorData = sensors.update();

        // 2. AI Model decision
        const aiDecision = ai.predict(sensorData);

        // 3. Motor Controller update
        const motorState = motor.update(sensorData, aiDecision);

        // 4. BMS update
        const isRegen = motorState.mode === 'GENERATOR';
        const netCurr = isRegen ? -aiDecision.chargeCurrent : (motorState.mode === 'DRIVE' ? motorState.phaseCurrent : 0);
        const bmsState = bms.update(netCurr, 0.1);

        sensorData.batterySOC = bmsState.soc;
        sensorData.batteryVoltage = bmsState.voltage;
        sensorData.batteryCurrent = bmsState.current;

        // 5. Energy Tracker
        const energyData = energy.update(aiDecision.regenPower, 0.1, isRegen);

        // Auto Log Notifications on Regen Switch
        if (isRegen && !prevRegenState) {
            ledRegen.className = 'led-dot yellow pulse';
            appendLog(`[REGEN ACTIVE] Motor in GENERATOR mode. Target Torque: ${aiDecision.optimalTorque} N·m | Power: ${aiDecision.regenPower} W`, 'log-ai');
            playBeep('relay');
        } else if (!isRegen && prevRegenState) {
            ledRegen.className = 'led-dot';
            appendLog(`[REGEN COMPLETED] Braking event finished. Recovered Energy: ${energyData.totalWh} Wh`, 'log-success');
        }
        prevRegenState = isRegen;

        // Dynamic CAN Bus Frame logging
        if (cycleCount % 2 === 0) {
            const speedHex = Math.round(sensorData.speed).toString(16).padStart(2, '0').toUpperCase();
            const brakeHex = Math.round(sensorData.brakePressure * 10).toString(16).padStart(2, '0').toUpperCase();
            logCANFrame('0x18FEEF00', '8', `${speedHex} ${brakeHex} 12 A0 00 FF 80 12`, `Speed: ${sensorData.speed.toFixed(0)}km/h, Brake: ${sensorData.brakePressure.toFixed(1)}b`);
        }

        if (cycleCount % 3 === 0) {
            const socHex = Math.round(bmsState.soc).toString(16).padStart(2, '0').toUpperCase();
            const vHex = Math.round(bmsState.voltage * 10).toString(16).padStart(4, '0').toUpperCase();
            logCANFrame('0x18FEEE00', '8', `${socHex} ${vHex.slice(0,2)} ${vHex.slice(2)} 01 28 00 FE 02`, `BMS SOC: ${bmsState.soc.toFixed(1)}%, PackV: ${bmsState.voltage.toFixed(1)}V`);
        }

        // Header Uptime & Stats
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        document.getElementById('t-uptime').textContent = `${mins}:${secs}`;
        document.getElementById('t-cycles').textContent = cycleCount;
        document.getElementById('t-state').textContent = motorState.mode;

        // Dynamic CAN Bus Load %
        if (canBusLoadEl) {
            const busLoad = Math.floor(15 + Math.sin(cycleCount * 0.1) * 8 + (isRegen ? 10 : 0));
            canBusLoadEl.textContent = `BUS LOAD: ${busLoad}%`;
        }

        // Update Pinout Readings
        updatePinouts(sensorData, motorState);

        // Render Scope Waveform
        renderOscilloscope(sensorData, motorState, aiDecision);

        // Render ASCII Telemetry Buffer
        const textBuffer = [
            `╔═════════════════════════════════════════════════════════════════════════╗`,
            `║ ⚡ AUTOMOTIVE EV ECU TELEMETRY & DIAGNOSTIC MONITOR                     ║`,
            `╠═════════════════════════════════════════════════════════════════════════╣`,
            `║ MODE: ${motorState.mode.padEnd(10)} │ SCENARIO: ${sensors.scenario.toUpperCase().padEnd(10)} │ ROAD: ${sensors.roadCondition.toUpperCase().padEnd(8)} ║`,
            `╠═════════════════════════════════════════════════════════════════════════╣`,
            `║ 1. VEHICLE TELEMETRY SENSORS           │ 2. AI REGEN DECISION ENGINE    ║`,
            `║ Speed:     ${sensorData.speed.toFixed(1).padStart(4)} km/h [${asciiBar(sensorData.speed, 80)}] │ Torque:    ${aiDecision.optimalTorque.toFixed(1).padStart(4)} Nm [${asciiBar(aiDecision.optimalTorque, 45)}] ║`,
            `║ Brake P:   ${sensorData.brakePressure.toFixed(1).padStart(4)} bar  [${asciiBar(sensorData.brakePressure, 10)}] │ Power:     ${String(aiDecision.regenPower).padStart(4)} W  [${asciiBar(aiDecision.regenPower, 500)}] ║`,
            `║ Wheel RPM: ${String(sensorData.wheelRPM).padStart(4)} RPM  [${asciiBar(sensorData.wheelRPM, 1200)}] │ Slip Risk: ${String(aiDecision.slipRisk).padStart(4)}%  [${asciiBar(aiDecision.slipRisk, 100)}] ║`,
            `║ IMU Ax:    ${sensorData.imuAx.toFixed(2).padStart(5)} m/s²               │ Charge:    ${aiDecision.chargeCurrent.toFixed(1).padStart(4)} A  [${asciiBar(aiDecision.chargeCurrent, 15)}] ║`,
            `║ Bat Temp:  ${sensorData.batteryTemp.toFixed(1).padStart(4)} °C                │ Confidence:${aiDecision.confidence.toFixed(1).padStart(4)}%               ║`,
            `╠═════════════════════════════════════════════════════════════════════════╣`,
            `║ 3. BATTERY MANAGEMENT SYSTEM (BMS)     │ 4. REGEN ENERGY TRACKER        ║`,
            `║ SOC:       ${bmsState.soc.toFixed(1).padStart(4)}%  [${asciiBar(bmsState.soc, 100)}] │ Recovered: ${energyData.totalWh.toFixed(3).padStart(6)} Wh          ║`,
            `║ Pack V:    ${bmsState.voltage.toFixed(1).padStart(4)} V                 │ Range:    +${energyData.rangeAddedKm.toFixed(2).padStart(5)} km          ║`,
            `║ Pack I:    ${bmsState.current.toFixed(1).padStart(5)} A                 │ Events:    ${String(energyData.brakeEvents).padStart(4)}               ║`,
            `║ Health:    ${bmsState.health.padEnd(8)}                 │ Live Power:${String(aiDecision.regenPower).padStart(4)} W              ║`,
            `╠═════════════════════════════════════════════════════════════════════════╣`,
            `║ 5. BLDC MOTOR CONTROLLER & CAN-FD BUS TELEMETRY                         ║`,
            `║ Back-EMF: ${motorState.backEMF.toFixed(1).padStart(4)} V │ Phase I: ${motorState.phaseCurrent.toFixed(1).padStart(4)} A │ PWM Duty: ${String(motorState.regenDutyCycle).padStart(3)}% │ Eff: ${String(motorState.efficiency).padStart(2)}% ║`,
            `╚═════════════════════════════════════════════════════════════════════════╝`
        ].join('\n');

        asciiScreen.textContent = textBuffer;

    }, 100);
});
