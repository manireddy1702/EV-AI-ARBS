/**
 * Battery Management System (BMS)
 * Controls battery charge regulation, protection circuits, and health estimation
 */

class BMS {
    constructor() {
        this.soc = 75.0;            // % State of Charge
        this.nominalVoltage = 48.0; // 13S Li-ion pack (48V nominal, 39V-54.6V range)
        this.voltage = 48.0;
        this.current = 0.0;         // Positive = Discharging, Negative = Charging (Regen)
        this.temperature = 28.0;    // °C
        this.capacityAh = 15.0;     // 15 Ah battery capacity (720 Wh)
        this.health = 'GOOD';       // GOOD, WARNING, FAULT

        this.protections = {
            overVoltage: false,
            overCurrent: false,
            overHeat: false,
            underVoltage: false
        };
    }

    setSOC(soc) {
        this.soc = Math.min(100.0, Math.max(0.0, parseFloat(soc)));
    }

    setTemperature(temp) {
        this.temperature = Math.min(80.0, Math.max(0.0, parseFloat(temp)));
    }

    /**
     * Apply charging or discharging current to update battery state
     * @param {number} currentA - Current in Amperes (negative for charging)
     * @param {number} timeStepSec - Time interval in seconds
     */
    update(currentA, timeStepSec) {
        this.current = currentA;

        // Coulometric SOC calculation: ΔSOC = (I * Δt) / (CapacityAh * 3600) * 100
        const deltaAh = (this.current * timeStepSec) / 3600.0;
        const deltaSOC = (-deltaAh / this.capacityAh) * 100.0; // negative current increases SOC

        this.soc = Math.min(100.0, Math.max(0.0, this.soc + deltaSOC));

        // Voltage vs SOC curve simulation (39V empty -> 54.6V full)
        const baseV = 39.0 + (this.soc / 100.0) * 15.6;
        const internalR = 0.08; // 80 mΩ
        this.voltage = parseFloat((baseV - (this.current * internalR)).toFixed(1));

        // Real-time Thermodynamic Heat Model (Joule Heating I^2 * R)
        const currentMag = Math.abs(this.current);
        if (currentMag > 3.0) {
            // Heating during heavy discharge (drive) or heavy charge (regen)
            const heatingRate = (Math.pow(currentMag, 1.8) * internalR * 0.008) * timeStepSec;
            this.temperature = Math.min(80.0, this.temperature + heatingRate);
        } else {
            // Passive ambient cooling toward 25.0°C
            const coolingRate = ((this.temperature - 25.0) * 0.02) * timeStepSec;
            this.temperature = Math.max(25.0, this.temperature - coolingRate);
        }

        // Evaluate Protection Circuits
        this.protections.overVoltage = this.voltage >= 54.2;
        this.protections.underVoltage = this.voltage <= 40.0;
        this.protections.overCurrent = currentMag >= 25.0;
        this.protections.overHeat = this.temperature >= 55.0;

        // Health assessment & Thermal thresholds
        if (this.protections.overHeat || this.protections.overVoltage || this.protections.underVoltage) {
            this.health = 'FAULT';
        } else if (this.temperature >= 45.0 || this.soc < 15.0) {
            this.health = 'WARNING';
        } else {
            this.health = 'GOOD';
        }

        return this.getStatus();
    }

    getStatus() {
        return {
            soc: parseFloat(this.soc.toFixed(1)),
            voltage: parseFloat(this.voltage.toFixed(1)),
            current: parseFloat(this.current.toFixed(1)),
            power: parseFloat(Math.abs(this.voltage * this.current).toFixed(1)),
            temperature: parseFloat(this.temperature.toFixed(1)),
            health: this.health,
            protections: { ...this.protections }
        };
    }
}
