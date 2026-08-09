/**
 * Main Application Entry Point
 * Orchestrates SensorSimulator, AIModel, BMS, MotorController, EnergyTracker, and Charts
 */

document.addEventListener('DOMContentLoaded', () => {
    // Instantiate Core Subsystems
    const sensors = new SensorSimulator();
    const ai = new AIModel();
    const bms = new BMS();
    const motor = new MotorController();
    const energy = new EnergyTracker();
    const charts = new DashboardCharts();

    let cycleCount = 0;
    const startTime = Date.now();

    // ── Setup UI Event Listeners ──

    // Scenario Selectors
    const scenarioBtns = document.querySelectorAll('.scenario-btn');
    scenarioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            scenarioBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const sc = btn.getAttribute('data-scenario');
            sensors.setScenario(sc);

            // Sync manual sliders on UI according to scenario defaults
            const brakeSlider = document.getElementById('brake-lever');
            const throttleSlider = document.getElementById('throttle-lever');
            if (brakeSlider) {
                brakeSlider.value = sensors.manualBrakeInput;
                document.getElementById('brake-lever-val').textContent = `${sensors.manualBrakeInput}%`;
            }
            if (throttleSlider) {
                throttleSlider.value = sensors.throttleInput;
                document.getElementById('throttle-lever-val').textContent = `${sensors.throttleInput}%`;
            }
        });
    });

    // AI Adaptive Control ON/OFF Toggle
    const aiToggle = document.getElementById('ai-enable-toggle');
    const aiToggleLabel = document.getElementById('ai-toggle-label');
    if (aiToggle) {
        aiToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            ai.setAIToggle(enabled);
            if (aiToggleLabel) {
                aiToggleLabel.textContent = enabled ? 'AI OPTIMIZATION: ON' : 'AI OPTIMIZATION: OFF (BASELINE)';
                aiToggleLabel.className = enabled ? 'toggle-text text-cyan' : 'toggle-text text-warn';
            }
        });
    }

    // Road Condition Selectors
    const roadBtns = document.querySelectorAll('.road-btn');
    roadBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            roadBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const rd = btn.getAttribute('data-road');
            sensors.setRoadCondition(rd);
        });
    });

    // Brake Lever Slider
    const brakeSlider = document.getElementById('brake-lever');
    const brakeValDisp = document.getElementById('brake-lever-val');
    brakeSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        brakeValDisp.textContent = `${val}%`;
        sensors.setManualBrake(val);
    });

    // Throttle Slider
    const throttleSlider = document.getElementById('throttle-lever');
    const throttleValDisp = document.getElementById('throttle-lever-val');
    throttleSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        throttleValDisp.textContent = `${val}%`;
        sensors.setThrottle(val);
    });

    // Manual Battery SOC Slider
    const socSlider = document.getElementById('soc-override');
    const socValDisp = document.getElementById('soc-override-val');
    if (socSlider) {
        socSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            socValDisp.textContent = `${val}%`;
            bms.setSOC(val);
        });
    }

    // Manual Battery Temp Slider & Quick Presets
    const tempSlider = document.getElementById('temp-override');
    const tempValDisp = document.getElementById('temp-override-val');
    if (tempSlider) {
        tempSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            tempValDisp.textContent = `${val}°C`;
            bms.setTemperature(val);
            updateTempPresetBtns(val);
        });
    }

    const tempPresetBtns = document.querySelectorAll('.temp-btn');
    tempPresetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tempVal = parseFloat(btn.getAttribute('data-temp'));
            bms.setTemperature(tempVal);
            if (tempSlider) tempSlider.value = tempVal;
            if (tempValDisp) tempValDisp.textContent = `${tempVal}°C`;
            updateTempPresetBtns(tempVal);
        });
    });

    function updateTempPresetBtns(currentTemp) {
        tempPresetBtns.forEach(b => {
            const bVal = parseFloat(b.getAttribute('data-temp'));
            if (Math.abs(bVal - currentTemp) < 5) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
    }

    // ── Main Simulation Loop (10 Hz = 100ms interval) ──
    setInterval(() => {
        cycleCount++;

        // 1. Update Sensor Readings
        const sensorData = sensors.update();

        // 2. Pass Sensor Data to AI Decision Engine
        const aiDecision = ai.predict(sensorData);

        // 3. Update Motor Controller State
        const motorState = motor.update(sensorData, aiDecision);

        // 4. Update BMS State (charging when current < 0)
        const isRegenActive = motorState.mode === 'GENERATOR';
        const netCurrent = isRegenActive ? -aiDecision.chargeCurrent : (motorState.mode === 'DRIVE' ? motorState.phaseCurrent : 0);
        const bmsState = bms.update(netCurrent, 0.1);

        // Update sensor data with accurate BMS SOC, Voltage, and Temperature telemetry
        sensorData.batterySOC = bmsState.soc;
        sensorData.batteryVoltage = bmsState.voltage;
        sensorData.batteryCurrent = bmsState.current;
        sensorData.batteryTemp = bmsState.temperature;

        // 5. Update Energy Recovery Accumulator
        const energyData = energy.update(aiDecision.regenPower, 0.1, isRegenActive);

        // 6. Update UI Components
        updateUI(sensorData, aiDecision, motorState, bmsState, energyData);

        // 7. Update Real-Time Charts & Gauges
        charts.updateCharts(
            sensorData.speed,
            aiDecision.optimalTorque,
            bmsState.soc,
            energyData.totalWh,
            sensorData.brakePressure,
            aiDecision.regenPower
        );

        charts.drawSpeedGauge(sensorData.speed);
        charts.drawSOCGauge(bmsState.soc);

    }, 100);

    // ── AI Model Selector Event Handlers ──
    const modelBtns = document.querySelectorAll('.ai-model-btn');
    modelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modelBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const modelKey = btn.getAttribute('data-model');
            ai.setModel(modelKey);

            // Update badges
            document.getElementById('active-model-badge').textContent = `${modelKey} MODEL`;
            const nameLabel = document.getElementById('ai-model-name-label');
            if (nameLabel) {
                if (modelKey === 'ANN') nameLabel.textContent = 'ANN (Multilayer Perceptron)';
                else if (modelKey === 'FUZZY') nameLabel.textContent = 'Mamdani Fuzzy Logic Controller';
                else if (modelKey === 'RANDOM_FOREST') nameLabel.textContent = 'Random Forest Regressor';
                else if (modelKey === 'RL_AGENT') nameLabel.textContent = 'Reinforcement Learning Q-Agent';
            }
        });
    });

    // ── Real-Life Learned AI Rules Engine — Dynamic Badge Updater ──
    function updateRealLifeRuleBadges(sensorData, aiDecision, bmsState) {
        const speed = sensorData.speed;
        const brake = sensorData.brakePressure;
        const soc = bmsState.soc;
        const batTemp = bmsState.temperature;
        const motTemp = sensorData.motorTemp;

        // Rule 1: High Speed Energy Capture (speed > 40 km/h)
        const ruleSpeed = document.getElementById('rule-item-speed');
        const badgeSpeed = document.getElementById('rule-status-speed');
        if (ruleSpeed && badgeSpeed) {
            if (speed > 40 && brake > 1) {
                ruleSpeed.classList.add('active-rule');
                badgeSpeed.textContent = `ACTIVE (${speed.toFixed(0)} km/h)`;
                badgeSpeed.className = 'rule-badge badge-active';
            } else {
                ruleSpeed.classList.remove('active-rule');
                badgeSpeed.textContent = 'STANDBY';
                badgeSpeed.className = 'rule-badge badge-standby';
            }
        }

        // Rule 2: Battery Overcharge Protection (SOC > 90%)
        const ruleSoc = document.getElementById('rule-item-soc');
        const badgeSoc = document.getElementById('rule-status-soc');
        if (ruleSoc && badgeSoc) {
            if (soc > 90) {
                ruleSoc.classList.add('active-rule');
                badgeSoc.textContent = `LIMITING (${soc.toFixed(0)}%)`;
                badgeSoc.className = 'rule-badge badge-alert';
            } else {
                ruleSoc.classList.remove('active-rule');
                badgeSoc.textContent = `NORMAL (${soc.toFixed(0)}%)`;
                badgeSoc.className = 'rule-badge badge-ok';
            }
        }

        // Rule 3: Hard Braking Rider Safety (brake > 7 bar)
        const ruleSafety = document.getElementById('rule-item-safety');
        const badgeSafety = document.getElementById('rule-status-safety');
        if (ruleSafety && badgeSafety) {
            if (brake > 7) {
                ruleSafety.classList.add('active-rule');
                badgeSafety.textContent = `ENGAGED (${brake.toFixed(1)} bar)`;
                badgeSafety.className = 'rule-badge badge-alert';
            } else {
                ruleSafety.classList.remove('active-rule');
                badgeSafety.textContent = 'STANDBY';
                badgeSafety.className = 'rule-badge badge-standby';
            }
        }

        // Rule 4: Battery Thermal Protection (temp > 50°C)
        const ruleThermal = document.getElementById('rule-item-thermal');
        const badgeThermal = document.getElementById('rule-status-thermal');
        if (ruleThermal && badgeThermal) {
            const maxTemp = Math.max(batTemp, motTemp);
            if (maxTemp > 50) {
                ruleThermal.classList.add('active-rule');
                badgeThermal.textContent = `HOT (${maxTemp.toFixed(0)}°C)`;
                badgeThermal.className = 'rule-badge badge-alert';
            } else {
                ruleThermal.classList.remove('active-rule');
                badgeThermal.textContent = `COOL (${maxTemp.toFixed(0)}°C)`;
                badgeThermal.className = 'rule-badge badge-ok';
            }
        }

        // Rule 5: Light Braking Max Efficiency (brake 0.5-3 bar, speed > 10)
        const ruleLight = document.getElementById('rule-item-light');
        const badgeLight = document.getElementById('rule-status-light');
        if (ruleLight && badgeLight) {
            if (brake > 0.5 && brake <= 3 && speed > 10) {
                ruleLight.classList.add('active-rule');
                badgeLight.textContent = `ACTIVE (${brake.toFixed(1)} bar)`;
                badgeLight.className = 'rule-badge badge-active';
            } else {
                ruleLight.classList.remove('active-rule');
                badgeLight.textContent = 'STANDBY';
                badgeLight.className = 'rule-badge badge-standby';
            }
        }
    }

    // ── UI Update Helper Function ──
    function updateUI(sensorData, aiDecision, motorState, bmsState, energyData) {
        // Session Timer & Cycle
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        document.getElementById('session-time').textContent = `${mins}:${secs}`;
        document.getElementById('sim-cycle').textContent = cycleCount;

        // System Status Badge
        const statusBadge = document.getElementById('system-status');
        const statusText = document.getElementById('status-text');
        statusBadge.className = 'status-badge';

        if (sensors.scenario === 'emergency') {
            statusBadge.classList.add('status-emergency');
            statusText.textContent = 'EMERGENCY BRAKE';
        } else if (motorState.mode === 'GENERATOR') {
            statusBadge.classList.add('status-regen');
            statusText.textContent = 'REGEN CHARGING';
        } else if (motorState.mode === 'DRIVE') {
            statusBadge.classList.add('status-drive');
            statusText.textContent = 'MOTOR DRIVE';
        } else {
            statusBadge.classList.add('status-standby');
            statusText.textContent = 'STANDBY';
        }

        // Speed Gauge Values
        document.getElementById('speed-value').textContent = Math.round(sensorData.speed);
        document.getElementById('wheel-rpm').textContent = sensorData.wheelRPM;
        document.getElementById('distance').textContent = `${sensorData.distance} km`;

        // AI Intervention Alert Banner
        const alertBanner = document.getElementById('ai-alert-banner');
        const alertText = document.getElementById('ai-alert-text');
        if (alertBanner && alertText) {
            alertText.textContent = aiDecision.intervention || 'AI SYSTEM OPTIMAL';
            if (bmsState.temperature >= 55.0 || aiDecision.slipRisk > 50 || !aiDecision.aiActive) {
                alertBanner.className = 'ai-alert-banner hazard-mode';
            } else if (bmsState.temperature >= 45.0) {
                alertBanner.className = 'ai-alert-banner warm-mode';
            } else {
                alertBanner.className = 'ai-alert-banner';
            }
        }

        // AI Engine Inputs & Outputs Panel (Strict formatting to prevent UI shaking)
        document.getElementById('ai-in-speed').textContent = `${sensorData.speed.toFixed(1)} km/h`;
        document.getElementById('ai-in-brake').textContent = `${sensorData.brakePressure.toFixed(1)} bar`;
        document.getElementById('ai-in-soc').textContent = `${bmsState.soc.toFixed(1)}%`;
        document.getElementById('ai-in-btemp').textContent = `${bmsState.temperature.toFixed(1)}°C`;
        document.getElementById('ai-in-mtemp').textContent = `${sensorData.motorTemp.toFixed(1)}°C`;
        document.getElementById('ai-in-road').textContent = sensorData.roadCondition.toUpperCase();

        document.getElementById('ai-out-torque').textContent = `${aiDecision.optimalTorque.toFixed(1)} N·m`;
        document.getElementById('ai-out-power').textContent = `${aiDecision.regenPower} W`;
        document.getElementById('ai-out-slip').textContent = `${aiDecision.slipRisk}%`;
        document.getElementById('ai-out-current').textContent = `${aiDecision.chargeCurrent.toFixed(1)} A`;

        document.getElementById('torque-bar').style.width = `${(aiDecision.optimalTorque / 45.0) * 100}%`;
        document.getElementById('power-bar').style.width = `${(aiDecision.regenPower / 500.0) * 100}%`;
        document.getElementById('slip-bar').style.width = `${aiDecision.slipRisk}%`;
        document.getElementById('current-bar').style.width = `${(aiDecision.chargeCurrent / 15.0) * 100}%`;

        // AI Confidence & Meter
        document.getElementById('confidence-val').textContent = `${Math.round(aiDecision.confidence)}%`;
        const confFill = document.getElementById('confidence-meter-fill');
        if (confFill) confFill.style.width = `${aiDecision.confidence}%`;

        // Real-Life Learned AI Rules Dynamic Status Updates
        updateRealLifeRuleBadges(sensorData, aiDecision, bmsState);

        // Explainable AI (XAI) Feature Importance Bars
        const xai = ai.featureImportance;
        if (xai) {
            document.getElementById('xai-bar-brake').style.width = `${xai.brakePressure}%`;
            document.getElementById('xai-val-brake').textContent = `${xai.brakePressure.toFixed(1)}%`;
            document.getElementById('xai-bar-speed').style.width = `${xai.vehicleSpeed}%`;
            document.getElementById('xai-val-speed').textContent = `${xai.vehicleSpeed.toFixed(1)}%`;
            document.getElementById('xai-bar-road').style.width = `${xai.roadFriction}%`;
            document.getElementById('xai-val-road').textContent = `${xai.roadFriction.toFixed(1)}%`;
            document.getElementById('xai-bar-soc').style.width = `${xai.batterySOC}%`;
            document.getElementById('xai-val-soc').textContent = `${xai.batterySOC.toFixed(1)}%`;
            document.getElementById('xai-bar-temp').style.width = `${xai.thermalState}%`;
            document.getElementById('xai-val-temp').textContent = `${xai.thermalState.toFixed(1)}%`;
        }

        // Sensor Grid
        document.getElementById('s-speed').textContent = sensorData.speed;
        document.getElementById('s-brake').textContent = sensorData.brakePressure;
        document.getElementById('s-wheelrpm').textContent = sensorData.wheelRPM;
        document.getElementById('s-batsoc').textContent = bmsState.soc;
        document.getElementById('s-batvolt').textContent = bmsState.voltage;
        document.getElementById('s-batcurr').textContent = bmsState.current;
        document.getElementById('s-battemp').textContent = bmsState.temperature;
        document.getElementById('s-mottemp').textContent = sensorData.motorTemp;

        document.getElementById('bar-speed').style.width = `${(sensorData.speed / 120) * 100}%`;
        document.getElementById('bar-brake').style.width = `${(sensorData.brakePressure / 10) * 100}%`;
        document.getElementById('bar-wheelrpm').style.width = `${(sensorData.wheelRPM / 1200) * 100}%`;
        document.getElementById('bar-batsoc').style.width = `${bmsState.soc}%`;
        document.getElementById('bar-batvolt').style.width = `${((bmsState.voltage - 36) / 18.6) * 100}%`;
        document.getElementById('bar-batcurr').style.width = `${(Math.abs(bmsState.current) / 25) * 100}%`;
        document.getElementById('bar-battemp').style.width = `${(bmsState.temperature / 60) * 100}%`;
        document.getElementById('bar-mottemp').style.width = `${(sensorData.motorTemp / 80) * 100}%`;

        // Motor Controller Panel
        const mRingArc = document.getElementById('motor-ring-arc');
        mRingArc.style.strokeDashoffset = 439.82 * (1 - motorState.regenDutyCycle / 100);

        const mIcon = document.getElementById('motor-mode-icon');
        const mText = document.getElementById('motor-mode-text');
        mText.textContent = motorState.mode;

        if (motorState.mode === 'GENERATOR') {
            mIcon.textContent = '⚡';
            mText.style.color = '#00f0ff';
        } else if (motorState.mode === 'DRIVE') {
            mIcon.textContent = '🏎️';
            mText.style.color = '#10b981';
        } else {
            mIcon.textContent = '⏸️';
            mText.style.color = '#94a3b8';
        }

        document.getElementById('motor-bemf').textContent = `${motorState.backEMF} V`;
        document.getElementById('motor-phase').textContent = `${motorState.phaseCurrent} A`;
        document.getElementById('motor-duty').textContent = `${motorState.regenDutyCycle}%`;
        document.getElementById('motor-eff').textContent = `${motorState.efficiency}%`;

        // BMS Panel
        document.getElementById('soc-value').textContent = Math.round(bmsState.soc);
        document.getElementById('bms-voltage').textContent = `${bmsState.voltage} V`;
        document.getElementById('bms-current').textContent = `${bmsState.current} A`;
        document.getElementById('bms-power').textContent = `${bmsState.power} W`;

        const bmsHealth = document.getElementById('bms-health');
        bmsHealth.textContent = bmsState.health;
        bmsHealth.className = `bstat-val mono health-${bmsState.health.toLowerCase()}`;

        // BMS Protection Status
        setProtState('prot-overvolt', bmsState.protections.overVoltage);
        setProtState('prot-overcurr', bmsState.protections.overCurrent);
        setProtState('prot-overheat', bmsState.protections.overHeat);
        setProtState('prot-undervolt', bmsState.protections.underVoltage);

        // Energy Recovery Panel
        document.getElementById('energy-total').textContent = energyData.totalWh.toFixed(2);
        document.getElementById('energy-power-now').textContent = `${energyData.livePowerWatts} W`;
        document.getElementById('energy-efficiency').textContent = `${motorState.efficiency}%`;
        document.getElementById('energy-range').textContent = `+${energyData.rangeAddedKm.toFixed(2)} km`;
        document.getElementById('energy-cycles').textContent = energyData.brakeEvents;

        // Power Flow Arrows Animation
        const flow1 = document.getElementById('flow-arrow-1');
        const flow2 = document.getElementById('flow-arrow-2');
        const flow3 = document.getElementById('flow-arrow-3');

        if (motorState.mode === 'GENERATOR') {
            flow1.classList.add('active');
            flow2.classList.add('active');
            flow3.classList.add('active');
        } else {
            flow1.classList.remove('active');
            flow2.classList.remove('active');
            flow3.classList.remove('active');
        }

        // Block Diagram Highlight Flow
        updateBlockDiagram(motorState.mode, sensorData.brakePressure > 0.2);
    }

    function setProtState(id, isFault) {
        const item = document.getElementById(id);
        if (!item) return;
        const dot = item.querySelector('.prot-dot');
        if (isFault) {
            if (dot) dot.className = 'prot-dot prot-trip';
            item.style.color = '#ef4444';
            item.style.fontWeight = 'bold';
        } else {
            if (dot) dot.className = 'prot-dot prot-ok';
            item.style.color = '';
            item.style.fontWeight = '';
        }
    }

    function updateBlockDiagram(motorMode, isBraking) {
        const nodes = ['bd-brake', 'bd-sensor', 'bd-esp32', 'bd-ai-node', 'bd-mctrl', 'bd-motor-node', 'bd-bms-node', 'bd-battery-node', 'bd-display'];
        const connectors = ['bd-c1', 'bd-c2', 'bd-c3', 'bd-c4', 'bd-c5', 'bd-c6', 'bd-c7', 'bd-c8'];

        nodes.forEach(n => {
            const el = document.getElementById(n);
            if (el) el.classList.remove('active-node');
        });
        connectors.forEach(c => {
            const el = document.querySelector(`.${c}`);
            if (el) el.classList.remove('active-flow');
        });

        // Always highlight ESP32 & Display as active controllers
        document.getElementById('bd-esp32').classList.add('active-node');
        document.getElementById('bd-display').classList.add('active-node');
        document.getElementById('bd-ai-node').classList.add('active-node');

        if (isBraking || motorMode === 'GENERATOR') {
            nodes.forEach(n => {
                const el = document.getElementById(n);
                if (el) el.classList.add('active-node');
            });
            connectors.forEach(c => {
                const el = document.querySelector(`.${c}`);
                if (el) el.classList.add('active-flow');
            });
        }
    }
});
