import { LightningElement, api, track } from 'lwc';
import ChartJs from '@salesforce/resourceUrl/chartjss';
import { loadScript } from 'lightning/platformResourceLoader';

export default class GroupSummary extends LightningElement {
    @api groupId;
    @api members = [];
    @api expenses = [];
    @api currency;

    chartJsInitialized = false;
    chartInstances = [];

    @track selectedUserId = 'all';
    @track userFilterOptions = [];

    renderedCallback() {
        if (this.chartJsInitialized) {
            return;
        }
        this.chartJsInitialized = true;
        loadScript(this, ChartJs)
            .then(() => {
                this.initUserFilterOptions();
                this.renderAllCharts();
            })
            .catch(error => {
                // eslint-disable-next-line no-console
                console.error('Error loading Chart.js', error);
            });
    }

    initUserFilterOptions() {
        this.userFilterOptions = [
            { label: 'All', value: 'all' },
            ...this.members.map(m => ({ label: m.playerName || m.nickname || 'Unknown', value: m.id }))
        ];
    }

    handleUserFilterChange(event) {
        this.selectedUserId = event.detail.value;
        this.renderFilteredLineChart();
    }

    renderAllCharts() {
        // Destroy previous chart instances
        if (window.Chart && this.chartInstances.length) {
            this.chartInstances.forEach(chart => chart.destroy());
            this.chartInstances = [];
        }
        // Expense by User
        this.renderChart('user', this.getExpenseByUserData(), 'bar', 'Expense by User');
        // Expense by Category
        this.renderChart('category', this.getExpenseByCategoryData(), 'pie', 'Expense by Category');
        // Expense by Month (old bar, now replaced by filtered line)
        // this.renderChart('month', this.getExpenseByMonthData(), 'bar', 'Expense by Month');
        // Expense by Year
        this.renderChart('year', this.getExpenseByYearData(), 'bar', 'Expense by Year');
        // Expense by Day
        this.renderChart('day', this.getExpenseByDayData(), 'line', 'Expense by Day');
        // Top Spender
        this.renderChart('topspender', this.getTopSpenderData(), 'doughnut', 'Top Spender');
        // Filtered Line Chart
        this.renderFilteredLineChart();
    }

    renderChart(chartType, chartData, chartKind, chartLabel) {
        const canvas = this.template.querySelector(`canvas[data-chart="${chartType}"]`);
        if (!canvas || !window.Chart || !chartData) return;
        const ctx = canvas.getContext('2d');
        const chart = new window.Chart(ctx, {
            type: chartKind,
            data: chartData,
            options: {
                responsive: true,
                plugins: {
                    legend: { display: chartKind !== 'bar' },
                    title: { display: true, text: chartLabel }
                },
                scales: chartKind === 'bar' || chartKind === 'line' ? {
                    y: { beginAtZero: true }
                } : undefined
            }
        });
        this.chartInstances.push(chart);
    }

    getExpenseByUserData() {
        const userMap = {};
        this.members.forEach(m => { userMap[m.id] = m.playerName || m.nickname || 'Unknown'; });
        const totals = {};
        this.expenses.forEach(e => {
            if (!totals[e.paidBy]) totals[e.paidBy] = 0;
            totals[e.paidBy] += e.amount;
        });
        return {
            labels: Object.keys(totals).map(id => userMap[id] || 'Unknown'),
            datasets: [{
                label: 'Total Expense',
                data: Object.values(totals),
                backgroundColor: '#6366f1'
            }]
        };
    }

    getExpenseByCategoryData() {
        const totals = {};
        this.expenses.forEach(e => {
            if (!totals[e.category]) totals[e.category] = 0;
            totals[e.category] += e.amount;
        });
        return {
            labels: Object.keys(totals),
            datasets: [{
                label: 'Total Expense',
                data: Object.values(totals),
                backgroundColor: [
                    '#6366f1', '#10b981', '#f59e0b', '#059669', '#d97706', '#dc2626', '#8b5cf6'
                ]
            }]
        };
    }

    getExpenseByMonthData() {
        const totals = {};
        this.expenses.forEach(e => {
            if (!e.date) return;
            const d = new Date(e.date);
            const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`;
            if (!totals[key]) totals[key] = 0;
            totals[key] += e.amount;
        });
        const sortedKeys = Object.keys(totals).sort();
        return {
            labels: sortedKeys,
            datasets: [{
                label: 'Total Expense',
                data: sortedKeys.map(k => totals[k]),
                backgroundColor: '#4f46e5'
            }]
        };
    }

    getExpenseByYearData() {
        const totals = {};
        this.expenses.forEach(e => {
            if (!e.date) return;
            const d = new Date(e.date);
            const key = `${d.getFullYear()}`;
            if (!totals[key]) totals[key] = 0;
            totals[key] += e.amount;
        });
        const sortedKeys = Object.keys(totals).sort();
        return {
            labels: sortedKeys,
            datasets: [{
                label: 'Total Expense',
                data: sortedKeys.map(k => totals[k]),
                backgroundColor: '#8b5cf6'
            }]
        };
    }

    getExpenseByDayData() {
        const totals = {};
        this.expenses.forEach(e => {
            if (!e.date) return;
            const d = new Date(e.date);
            const key = d.toISOString().split('T')[0];
            if (!totals[key]) totals[key] = 0;
            totals[key] += e.amount;
        });
        const sortedKeys = Object.keys(totals).sort();
        return {
            labels: sortedKeys,
            datasets: [{
                label: 'Total Expense',
                data: sortedKeys.map(k => totals[k]),
                backgroundColor: '#10b981'
            }]
        };
    }

    getTopSpenderData() {
        const userMap = {};
        this.members.forEach(m => { userMap[m.id] = m.playerName || m.nickname || 'Unknown'; });
        const totals = {};
        this.expenses.forEach(e => {
            if (!totals[e.paidBy]) totals[e.paidBy] = 0;
            totals[e.paidBy] += e.amount;
        });
        const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
        const top = sorted.length ? [sorted[0]] : [];
        return {
            labels: top.map(([id]) => userMap[id] || 'Unknown'),
            datasets: [{
                label: 'Top Spender',
                data: top.map(([, amt]) => amt),
                backgroundColor: ['#f59e0b']
            }]
        };
    }

    renderFilteredLineChart() {
        // Destroy previous filteredline chart if exists
        if (window.Chart && this.chartInstances.length) {
            this.chartInstances = this.chartInstances.filter(chart => {
                if (chart.canvas && chart.canvas.dataset.chart === 'filteredline') {
                    chart.destroy();
                    return false;
                }
                return true;
            });
        }
        const canvas = this.template.querySelector('canvas[data-chart="filteredline"]');
        if (!canvas || !window.Chart) return;
        const ctx = canvas.getContext('2d');
        const { labels, data, avgData } = this.getFilteredLineChartData();
        const chart = new window.Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Expense',
                        data,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99,102,241,0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        pointBackgroundColor: '#6366f1',
                        pointStyle: 'circle',
                        borderWidth: 3
                    },
                    {
                        label: 'Average',
                        data: avgData,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245,158,11,0.08)',
                        fill: false,
                        borderDash: [8, 4],
                        pointRadius: 0,
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: true },
                    title: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: value => `${this.currency || ''} ${value}`
                        }
                    }
                }
            }
        });
        this.chartInstances.push(chart);
    }

    getFilteredLineChartData() {
        // Get all months in expenses
        const monthSet = new Set();
        this.expenses.forEach(e => {
            if (!e.date) return;
            const d = new Date(e.date);
            const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`;
            monthSet.add(key);
        });
        const months = Array.from(monthSet).sort();
        // For each month, sum expenses for selected user or all
        const data = months.map(month => {
            return this.expenses.filter(e => {
                if (!e.date) return false;
                const d = new Date(e.date);
                const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`;
                if (this.selectedUserId === 'all') return key === month;
                return key === month && e.paidBy === this.selectedUserId;
            }).reduce((sum, e) => sum + e.amount, 0);
        });
        // Average line: for each month, average of all users' expenses
        const avgData = months.map(month => {
            const userTotals = {};
            this.members.forEach(m => { userTotals[m.id] = 0; });
            this.expenses.forEach(e => {
                if (!e.date) return;
                const d = new Date(e.date);
                const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`;
                if (key === month && userTotals.hasOwnProperty(e.paidBy)) {
                    userTotals[e.paidBy] += e.amount;
                }
            });
            const values = Object.values(userTotals);
            const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            return avg;
        });
        return { labels: months, data, avgData };
    }

    disconnectedCallback() {
        // Destroy all chart instances to avoid memory leaks
        if (window.Chart && this.chartInstances.length) {
            this.chartInstances.forEach(chart => chart.destroy());
        }
    }
}