/**
 * BLDC Motor Controller Simulator
 * Simulates motor state transitions (DRIVE / GENERATOR / STANDBY), back-EMF, and PWM duty cycle
 */

class MotorController {
    constructor() {
        this.mode = 'STANDBY'; // STANDBY, DRIVE, GENERATOR
        this.backEMF = 0.0;    // Volts
        this.phaseCurrent = 0.0; // Amperes
        this.regenDutyCycle = 0; // % (0 to 100)
        this.efficiency = 0;   // %
    }

    /**
     * Update motor state based on sensor inputs and AI command
     * @param {Object} sensors 
     * @param {Object} aiDecision 
     */
    update(sensors, aiDecision) {
        const { speed, brakePressure, throttleInput } = sensors;
        const { optimalTorque, regenPower, chargeCurrent } = aiDecision;

        // Determine Operational Mode
        if (brakePressure > 0.2 && speed > 2.0 && optimalTorque > 0) {
            this.mode = 'GENERATOR';
        } else if (speed > 1.0 && throttleInput > 5) {
            this.mode = 'DRIVE';
        } else {
            this.mode = 'STANDBY';
        }

        // Calculate Back-EMF Voltage (Ke = 0.65 V / (km/h))
        this.backEMF = parseFloat((speed * 0.65).toFixed(1));

        // Calculate Motor Phase Current & Duty Cycle
        if (this.mode === 'GENERATOR') {
            // Regen PWM duty cycle is proportional to target torque
            this.regenDutyCycle = Math.min(100, Math.round((optimalTorque / 45.0) * 100));
            this.phaseCurrent = parseFloat((chargeCurrent * 1.25).toFixed(1)); // Phase current is slightly higher than DC link current
            this.efficiency = speed > 15 ? 86 : Math.round(50 + (speed / 15) * 36);
        } else if (this.mode === 'DRIVE') {
            this.regenDutyCycle = 0;
            this.phaseCurrent = parseFloat(((sensors.throttleInput / 100) * 15.0).toFixed(1));
            this.efficiency = 88;
        } else {
            this.regenDutyCycle = 0;
            this.phaseCurrent = 0.0;
            this.efficiency = 0;
        }

        return {
            mode: this.mode,
            backEMF: this.backEMF,
            phaseCurrent: this.phaseCurrent,
            regenDutyCycle: this.regenDutyCycle,
            efficiency: this.efficiency
        };
    }
}
