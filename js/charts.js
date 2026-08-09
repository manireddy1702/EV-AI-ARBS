/**
 * Charts & Canvas Gauges Module
 * Handles real-time Chart.js line charts and custom HTML5 canvas circular gauges
 */

class DashboardCharts {
    constructor() {
        this.maxDataPoints = 30; // 30 time steps in rolling history
        this.labels = Array(this.maxDataPoints).fill('');

        this.initCharts();
    }

    initCharts() {
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 10 } } }
            },
            scales: {
                x: { display: false },
                y: {
                    ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 9 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            }
        };

        // 1. Speed vs Torque Chart
        const ctxSpeedTorque = document.getElementById('chart-speed-torque').getContext('2d');
        this.chartSpeedTorque = new Chart(ctxSpeedTorque, {
            type: 'line',
            data: {
                labels: this.labels,
                datasets: [
                    {
                        label: 'Speed (km/h)',
                        data: Array(this.maxDataPoints).fill(0),
                        borderColor: '#00f0ff',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 0
                    },
                    {
                        label: 'Regen Torque (N·m)',
                        data: Array(this.maxDataPoints).fill(0),
                        borderColor: '#7c3aed',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 0
                    }
                ]
            },
            options: commonOptions
        });

        // 2. SOC Chart
        const ctxSOC = document.getElementById('chart-soc').getContext('2d');
        this.chartSOC = new Chart(ctxSOC, {
            type: 'line',
            data: {
                labels: this.labels,
                datasets: [{
                    label: 'SOC (%)',
                    data: Array(this.maxDataPoints).fill(75),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 0
                }]
            },
            options: {
                ...commonOptions,
                scales: {
                    ...commonOptions.scales,
                    y: { ...commonOptions.scales.y, min: 0, max: 100 }
                }
            }
        });

        // 3. Energy Chart
        const ctxEnergy = document.getElementById('chart-energy').getContext('2d');
        this.chartEnergy = new Chart(ctxEnergy, {
            type: 'line',
            data: {
                labels: this.labels,
                datasets: [{
                    label: 'Energy (Wh)',
                    data: Array(this.maxDataPoints).fill(0),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    fill: true,
                    borderWidth: 2,
                    tension: 0.2,
                    pointRadius: 0
                }]
            },
            options: commonOptions
        });

        // 4. Brake Pressure vs Power Chart
        const ctxBrakePower = document.getElementById('chart-brake-power').getContext('2d');
        this.chartBrakePower = new Chart(ctxBrakePower, {
            type: 'line',
            data: {
                labels: this.labels,
                datasets: [
                    {
                        label: 'Brake (bar)',
                        data: Array(this.maxDataPoints).fill(0),
                        borderColor: '#ef4444',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 0,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Regen Power (W)',
                        data: Array(this.maxDataPoints).fill(0),
                        borderColor: '#10b981',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 0,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                ...commonOptions,
                scales: {
                    x: { display: false },
                    y: {
                        type: 'linear',
                        position: 'left',
                        ticks: { color: '#ef4444', font: { family: 'JetBrains Mono', size: 9 } },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        ticks: { color: '#10b981', font: { family: 'JetBrains Mono', size: 9 } },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }

    /**
     * Push new telemetry step to line charts
     */
    updateCharts(speed, torque, soc, totalWh, brakePressure, regenPower) {
        this.pushData(this.chartSpeedTorque, 0, speed);
        this.pushData(this.chartSpeedTorque, 1, torque);

        this.pushData(this.chartSOC, 0, soc);
        this.pushData(this.chartEnergy, 0, totalWh);

        this.pushData(this.chartBrakePower, 0, brakePressure);
        this.pushData(this.chartBrakePower, 1, regenPower);
    }

    pushData(chart, datasetIdx, val) {
        chart.data.datasets[datasetIdx].data.shift();
        chart.data.datasets[datasetIdx].data.push(val);
        chart.update('none'); // Update without animation for 10Hz smoothness
    }

    /**
     * Draw Speed Circular Canvas Gauge
     */
    drawSpeedGauge(speed, maxSpeed = 120) {
        const canvas = document.getElementById('speed-gauge');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const radius = 110;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const startAngle = 0.75 * Math.PI;
        const endAngle = 2.25 * Math.PI;
        const currentAngle = startAngle + (speed / maxSpeed) * (endAngle - startAngle);

        // Track Arc
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 14;
        ctx.stroke();

        // Active Arc
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, currentAngle);
        const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
        grad.addColorStop(0, '#00f0ff');
        grad.addColorStop(1, '#7c3aed');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    /**
     * Draw SOC Circular Canvas Gauge
     */
    drawSOCGauge(soc) {
        const canvas = document.getElementById('soc-gauge');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const radius = 75;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const startAngle = 0.75 * Math.PI;
        const endAngle = 2.25 * Math.PI;
        const currentAngle = startAngle + (soc / 100) * (endAngle - startAngle);

        // Track
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 10;
        ctx.stroke();

        // Fill
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, currentAngle);
        let color = '#10b981'; // Green
        if (soc < 30) color = '#ef4444'; // Red
        else if (soc < 50) color = '#f59e0b'; // Yellow

        ctx.strokeStyle = color;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.stroke();
    }
}
