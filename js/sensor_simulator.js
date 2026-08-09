/**
 * Sensor Simulator
 * Generates realistic real-time telemetry data for the EV bike simulation
 */

class SensorSimulator {
    constructor() {
        this.speed = 0.0;          // km/h (0 to 120)
        this.brakePressure = 0.0;  // bar (0 to 10)
        this.wheelRPM = 0;         // RPM (0 to 1200)
        this.batterySOC = 75.0;    // % (0 to 100)
        this.batteryVoltage = 48.0;// V (36 to 54)
        this.batteryCurrent = 0.0; // A (-20 to +30)
        this.batteryTemp = 28.0;   // °C (20 to 60)
        this.motorTemp = 30.0;     // °C (20 to 80)
        this.imuAx = 0.0;          // m/s^2 (-15 to 15)
        this.imuAy = 0.0;          // m/s^2

        this.scenario = 'urban';
        this.roadCondition = 'dry'; // dry, wet, gravel
        this.throttleInput = 50;    // % (0 to 100)
        this.manualBrakeInput = 0;  // % (0 to 100)

        this.totalDistance = 0.0;   // km
        this.timeStep = 0.1;        // seconds (10 Hz simulation)
        this.scenarioStartTime = Date.now();
    }

    setScenario(scenario) {
        this.scenario = scenario;
        this.scenarioStartTime = Date.now();

        // Preset initial dynamic speed profiles on scenario trigger
        if (scenario === 'urban') {
            this.speed = Math.max(15.0, this.speed);
            this.manualBrakeInput = 0;
        } else if (scenario === 'highway') {
            this.speed = 70.0;
            this.manualBrakeInput = 0;
            this.throttleInput = 75;
        } else if (scenario === 'downhill') {
            this.speed = 45.0;
            this.manualBrakeInput = 25; // 2.5 bar initial slope brake
        } else if (scenario === 'emergency') {
            this.speed = 85.0;
            this.manualBrakeInput = 90; // 9.0 bar emergency clamp
            this.throttleInput = 0;
        } else if (scenario === 'custom') {
            this.manualBrakeInput = 0;
            this.throttleInput = 50;
        }
    }

    setRoadCondition(road) {
        this.roadCondition = road;
    }

    setManualBrake(val) {
        this.manualBrakeInput = parseFloat(val);
    }

    setThrottle(val) {
        this.throttleInput = parseFloat(val);
    }

    update() {
        let targetSpeed = 0;
        let targetBrake = (this.manualBrakeInput / 100) * 10.0; // 0 to 10 bar

        const elapsed = (Date.now() - this.scenarioStartTime) / 1000;

        switch (this.scenario) {
            case 'custom':
                targetSpeed = (this.throttleInput / 100) * 120.0;
                break;

            case 'urban': {
                // Realistic urban stop-and-go cycle (20s duration)
                const cycle = elapsed % 18;
                if (cycle < 8) {
                    targetSpeed = (this.throttleInput / 100) * 55.0;
                } else if (cycle < 13) {
                    targetSpeed = 15.0;
                    if (this.manualBrakeInput === 0) targetBrake = 4.0;
                } else {
                    targetSpeed = 0.0;
                    if (this.manualBrakeInput === 0) targetBrake = 6.5;
                }
                break;
            }

            case 'highway': {
                // High-speed cruising (60 - 90 km/h)
                const hCycle = elapsed % 24;
                if (hCycle < 18) {
                    targetSpeed = Math.max(60.0, (this.throttleInput / 100) * 95.0);
                } else {
                    targetSpeed = 45.0;
                    if (this.manualBrakeInput === 0) targetBrake = 3.0;
                }
                break;
            }

            case 'downhill': {
                // Gravity acceleration downhill requiring steady regen braking
                targetSpeed = 40.0 + Math.sin(elapsed * 0.8) * 12.0;
                if (this.manualBrakeInput === 0) {
                    targetBrake = 4.2 + Math.sin(elapsed * 1.2) * 1.2;
                }
                break;
            }

            case 'emergency': {
                // Sudden emergency stop sequence
                const eCycle = elapsed % 10;
                if (eCycle < 2.5) {
                    targetSpeed = 85.0;
                    if (this.manualBrakeInput === 0) targetBrake = 0;
                } else {
                    targetSpeed = 0.0;
                    if (this.manualBrakeInput === 0) targetBrake = 9.5;
                }
                break;
            }
        }

        // Apply physical deceleration & acceleration
        if (targetBrake > 0.2) {
            const decelRate = (targetBrake * 3.8 + 1.2) * this.timeStep;
            this.speed = Math.max(0, this.speed - decelRate);
        } else if (this.throttleInput > 5 && targetSpeed > this.speed) {
            const accelRate = (this.throttleInput / 100) * 6.5 * this.timeStep;
            this.speed = Math.min(120.0, this.speed + accelRate);
        } else {
            this.speed = Math.max(0, this.speed - 0.6 * this.timeStep);
        }

        // Smooth brake pressure
        this.brakePressure += (targetBrake - this.brakePressure) * 0.35;

        // Wheel RPM derived from speed (26-inch wheel)
        this.wheelRPM = Math.round((this.speed * 1000 / 60) / 2.07);

        // IMU Acceleration (m/s^2)
        if (this.brakePressure > 0.5) {
            this.imuAx = -1 * (this.brakePressure * 1.25 + (Math.random() * 0.2 - 0.1));
        } else {
            this.imuAx = (this.throttleInput > 10 ? 0.9 : -0.2) + (Math.random() * 0.2 - 0.1);
        }
        this.imuAy = (Math.sin(Date.now() / 800) * 0.3) + (Math.random() * 0.1 - 0.05);

        // Total distance
        this.totalDistance += (this.speed / 3600) * this.timeStep;

        // Thermal accumulation
        if (this.speed > 30) {
            this.motorTemp = Math.min(75, this.motorTemp + 0.03 * this.timeStep);
        } else {
            this.motorTemp = Math.max(25, this.motorTemp - 0.01 * this.timeStep);
        }

        return this.getData();
    }

    getData() {
        return {
            speed: parseFloat(this.speed.toFixed(1)),
            brakePressure: parseFloat(this.brakePressure.toFixed(1)),
            wheelRPM: this.wheelRPM,
            batterySOC: parseFloat(this.batterySOC.toFixed(1)),
            batteryVoltage: parseFloat(this.batteryVoltage.toFixed(1)),
            batteryCurrent: parseFloat(this.batteryCurrent.toFixed(1)),
            batteryTemp: parseFloat(this.batteryTemp.toFixed(1)),
            motorTemp: parseFloat(this.motorTemp.toFixed(1)),
            imuAx: parseFloat(this.imuAx.toFixed(2)),
            imuAy: parseFloat(this.imuAy.toFixed(2)),
            scenario: this.scenario,
            roadCondition: this.roadCondition,
            throttleInput: this.throttleInput,
            manualBrakeInput: this.manualBrakeInput,
            distance: parseFloat(this.totalDistance.toFixed(2))
        };
    }
}
