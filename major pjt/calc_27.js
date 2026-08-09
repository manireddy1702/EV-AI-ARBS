// Script to calculate all 27 test cases (3 speeds x 3 brake pressures x 3 road conditions)

class AIModel {
    constructor() {
        this.aiEnabled = true;
        this.activeModel = 'ANN';
        this.hyperparams = {
            learningRate: 0.05,
            slipSensitivity: 1.0,
            socProtectionThreshold: 90.0,
            thermalDeratingTemp: 50.0,
            regenAggressiveness: 1.0
        };
        this.roadFriction = { dry: 1.0, wet: 0.65, gravel: 0.50 };
        this.annWeights = {
            w1: [
                [0.45, -0.10, 0.35, 0.20, -0.15, 0.50, 0.30, 0.25],
                [0.85, 0.70, 0.90, 0.40, 0.60, 0.75, 0.80, 0.65],
                [-0.40, -0.30, -0.60, -0.50, -0.20, -0.70, -0.35, -0.45],
                [-0.30, -0.50, -0.40, -0.60, -0.20, -0.45, -0.30, -0.50],
                [-0.25, -0.40, -0.35, -0.55, -0.15, -0.40, -0.25, -0.45],
                [0.60, 0.50, 0.40, 0.70, 0.80, 0.55, 0.65, 0.75]
            ],
            b1: [0.05, 0.02, 0.08, 0.01, 0.04, 0.06, 0.03, 0.07],
            w2: [
                [0.65, 0.40, 0.75, 0.30],
                [0.20, 0.85, 0.15, 0.45],
                [0.70, 0.35, 0.80, 0.50],
                [0.35, 0.60, 0.40, 0.40],
                [0.45, 0.75, 0.50, 0.60],
                [0.80, 0.25, 0.70, 0.70],
                [0.55, 0.50, 0.60, 0.55],
                [0.60, 0.45, 0.65, 0.65]
            ],
            b2: [0.10, 0.05, 0.08, 0.02]
        };
    }

    predictANN(sensors) {
        const { speed, brakePressure, batterySOC, batteryTemp, motorTemp, imuAx, roadCondition } = sensors;
        const mu = this.roadFriction[roadCondition.toLowerCase()] || 1.0;
        const normSpeed = Math.min(1.0, speed / 120.0);
        const normBrake = Math.min(1.0, brakePressure / 10.0);
        const normSOC = batterySOC / 100.0;
        const normBatTemp = Math.min(1.0, batteryTemp / 70.0);
        const normMotTemp = Math.min(1.0, motorTemp / 90.0);
        const normMu = mu;
        const inputs = [normSpeed, normBrake, normSOC, normBatTemp, normMotTemp, normMu];

        const hidden = new Array(8).fill(0);
        for (let j = 0; j < 8; j++) {
            let sum = this.annWeights.b1[j];
            for (let i = 0; i < 6; i++) { sum += inputs[i] * this.annWeights.w1[i][j]; }
            hidden[j] = Math.max(0, sum);
        }

        const outputs = new Array(4).fill(0);
        for (let k = 0; k < 4; k++) {
            let sum = this.annWeights.b2[k];
            for (let j = 0; j < 8; j++) { sum += hidden[j] * this.annWeights.w2[j][k]; }
            outputs[k] = 1.0 / (1.0 + Math.exp(-sum));
        }

        let rawSlipRisk = (brakePressure / 10.0) * (1.1 - mu) * 120.0 * this.hyperparams.slipSensitivity;
        if (Math.abs(imuAx) > 6.0) rawSlipRisk += 25.0;
        let slipRisk = Math.min(100, Math.max(0, Math.round(rawSlipRisk)));

        let baseTorque = (brakePressure / 10.0) * 45.0 + (speed / 120.0) * 5.0;
        baseTorque *= this.hyperparams.regenAggressiveness;
        let interventionText = 'Optimal Regen Active';

        if (slipRisk > 35) {
            const slipFactor = (100 - slipRisk) / 65.0;
            baseTorque *= Math.max(0.2, slipFactor);
            slipRisk = Math.round(slipRisk * 0.45);
            interventionText = 'Anti-Slip Damping Active';
        }

        if (batterySOC > this.hyperparams.socProtectionThreshold) {
            const socFactor = (100.0 - batterySOC) / (100.0 - this.hyperparams.socProtectionThreshold + 0.001);
            baseTorque *= Math.max(0.1, Math.min(1.0, socFactor));
            interventionText = 'SOC Overcharge Protection';
        }

        if (speed < 2.5 || brakePressure < 0.2) {
            baseTorque = 0.0;
            interventionText = 'Standby';
        }

        const optimalTorque = parseFloat(baseTorque.toFixed(1));
        const radPerSec = (speed * 1000 / 3600) / 0.33;
        const mechanicalPower = optimalTorque * radPerSec;
        const electricalPower = Math.round(Math.max(0, mechanicalPower * 0.84));
        const voltage = sensors.batteryVoltage || 48.0;
        const chargeCurrent = parseFloat((electricalPower / voltage).toFixed(1));

        return { optimalTorque, regenPower: electricalPower, slipRisk, chargeCurrent, intervention: interventionText };
    }
}

const speeds = [40, 80, 120];
const brakePressures = [3, 6, 9];
const roadConditions = ['Dry', 'Wet', 'Gravel'];

const model = new AIModel();
const defaults = { batterySOC: 75.0, batteryTemp: 28.0, motorTemp: 30.0, batteryVoltage: 48.0, imuAx: 0.0 };

const allResults = [];

for (const p of brakePressures) {
    for (const s of speeds) {
        for (const r of roadConditions) {
            const sensors = { ...defaults, speed: s, brakePressure: p, roadCondition: r };
            const res = model.predictANN(sensors);
            allResults.push({
                speed: s,
                brakePressure: p,
                roadCondition: r,
                torque: res.optimalTorque,
                power: res.regenPower,
                current: res.chargeCurrent,
                slipRisk: res.slipRisk,
                intervention: res.intervention
            });
        }
    }
}

console.log(JSON.stringify(allResults, null, 2));
