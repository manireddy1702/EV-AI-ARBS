/**
 * Energy Recovery Tracker
 * Accumulates electrical energy recovered during braking sessions
 */

class EnergyTracker {
    constructor() {
        this.totalEnergyJoules = 0.0; // Joules (Ws)
        this.brakeEventCount = 0;
        this.isBrakingPrev = false;
        this.batteryWhPerKm = 15.0;   // EV bike baseline consumption (~15 Wh/km)
    }

    /**
     * Integrate power over time to compute cumulative energy recovered
     * @param {number} powerWatts - Instantaneous electrical recovery power
     * @param {number} timeStepSec - Time interval in seconds
     * @param {boolean} isBraking - Whether braking is active
     */
    update(powerWatts, timeStepSec, isBraking) {
        if (isBraking && powerWatts > 0) {
            this.totalEnergyJoules += powerWatts * timeStepSec;
        }

        // Count discrete braking events
        if (isBraking && !this.isBrakingPrev) {
            this.brakeEventCount++;
        }
        this.isBrakingPrev = isBraking;

        // Convert Joules to Watt-hours (1 Wh = 3600 Joules)
        const totalWh = this.totalEnergyJoules / 3600.0;

        // Distance range added (km) = totalWh / baseline energy consumption per km
        const rangeAddedKm = totalWh / this.batteryWhPerKm;

        return {
            totalWh: parseFloat(totalWh.toFixed(3)),
            livePowerWatts: Math.round(powerWatts),
            rangeAddedKm: parseFloat(rangeAddedKm.toFixed(2)),
            brakeEvents: this.brakeEventCount
        };
    }
}
