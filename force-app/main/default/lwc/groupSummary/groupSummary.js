import { LightningElement, api, track } from 'lwc';
import ChartJs from '@salesforce/resourceUrl/chartjss';
import { loadScript } from 'lightning/platformResourceLoader';

export default class GroupSummary extends LightningElement {
    @api groupId;
    @api members = [];
    @api expenses = [];
    @api currency = 'USD';

    chartJsInitialized = false;
    chartJsLoadAttempted = false;
    chartInstances = [];
    currencyCache = {};
    
    @track selectedUserId = 'all';
    @track userFilterOptions = [];
    @track isDataReady = true;
    @track cachedMetrics = {};

    // Debug mode toggle
    debugMode = true;

    // Professional Color Palette
    colorPalette = {
        primary: ['#007BFF', '#28A745', '#FFC107', '#DC3545', '#6F42C1', '#20C997', '#FD7E14', '#6C757D'],
        sequential: ['#E3F2FD', '#BBDEFB', '#90CAF9', '#64B5F6', '#42A5F5', '#2196F3', '#1E88E5', '#1976D2'],
        categorical: ['#007BFF', '#28A745', '#FFC107', '#DC3545', '#6F42C1', '#20C997', '#FD7E14', '#17A2B8'],
        radar: [
            'rgba(255, 99, 132, 0.2)',
            'rgba(54, 162, 235, 0.2)',
            'rgba(255, 205, 86, 0.2)',
            'rgba(75, 192, 192, 0.2)',
            'rgba(153, 102, 255, 0.2)'
        ],
        radarBorder: [
            'rgb(255, 99, 132)',
            'rgb(54, 162, 235)',
            'rgb(255, 205, 86)',
            'rgb(75, 192, 192)',
            'rgb(153, 102, 255)'
        ],
        polar: [
            'rgb(255, 99, 132)',
            'rgb(75, 192, 192)',
            'rgb(255, 205, 86)',
            'rgb(201, 203, 207)',
            'rgb(54, 162, 235)'
        ]
    };

    // Enhanced logging utility
    debugLog(message, data) {
        if (!this.debugMode) return;
        
        try {
            if (data === null || data === undefined) {
                console.debug(message, data);
                return;
            }
            
            let plainData;
            if (typeof data === 'object') {
                if (Array.isArray(data)) {
                    plainData = data.map(item => {
                        if (typeof item === 'object' && item !== null) {
                            return this.convertProxyToPlain(item);
                        }
                        return item;
                    });
                } else {
                    plainData = this.convertProxyToPlain(data);
                }
            } else {
                plainData = data;
            }
            
            console.debug(message, plainData);
        } catch (error) {
            console.debug(message, String(data));
        }
    }

    // Helper method to convert proxy objects to plain objects
    convertProxyToPlain(obj) {
        if (obj === null || obj === undefined || typeof obj !== 'object') {
            return obj;
        }
        
        const plain = {};
        try {
            for (const key in obj) {
                if (obj.hasOwnProperty && obj.hasOwnProperty(key)) {
                    const value = obj[key];
                    if (typeof value === 'object' && value !== null) {
                        if (Array.isArray(value)) {
                            plain[key] = value.map(item => 
                                typeof item === 'object' ? this.convertProxyToPlain(item) : item
                            );
                        } else {
                            plain[key] = this.convertProxyToPlain(value);
                        }
                    } else {
                        plain[key] = value;
                    }
                }
            }
        } catch (error) {
            return obj;
        }
        return plain;
    }

    // Data transformation methods - Fix the paidBy mapping issue
    transformExpenseData() {
        return (this.expenses || []).map(expense => ({
            // Map Salesforce fields to expected format
            id: expense.Id || expense.id,
            name: expense.Name || expense.name,
            amount: expense.Amount__c || expense.amount || 0,
            date: expense.Date__c || expense.date,
            category: expense.Category__c || expense.category || 'Other',
            paidBy: expense.Paid_By__c || expense.paidBy, // Fixed mapping
            paidByName: expense.Paid_By__r?.Name || expense.paidByName || 'Unknown'
        }));
    }

    transformMemberData() {
        return (this.members || []).map(member => ({
            id: member.Player__c || member.playerId || member.id,
            name: member.Player__r?.Name || member.playerName || member.nickname || 'Unknown'
        }));
    }

    // Computed properties for metrics
    get totalMembers() {
        if (!this.cachedMetrics.totalMembers) {
            const count = this.transformMemberData().length;
            this.debugLog('Calculating totalMembers', { count });
            this.cachedMetrics.totalMembers = count;
        }
        return this.cachedMetrics.totalMembers;
    }

    get totalExpenseCount() {
        if (!this.cachedMetrics.totalExpenseCount) {
            const count = this.transformExpenseData().length;
            this.debugLog('Calculating totalExpenseCount', { count });
            this.cachedMetrics.totalExpenseCount = count;
        }
        return this.cachedMetrics.totalExpenseCount;
    }

    get totalExpenses() {
        if (!this.cachedMetrics.totalExpenses) {
            const expenses = this.transformExpenseData();
            const total = expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
            this.debugLog('Calculating totalExpenses', { total, expenseCount: expenses.length });
            this.cachedMetrics.totalExpenses = total;
        }
        return this.cachedMetrics.totalExpenses;
    }

    get formattedTotalExpenses() {
        const total = this.totalExpenses;
        this.debugLog('Formatting totalExpenses', { total });
        return this.formatCurrency(total);
    }

    get averageExpense() {
        if (!this.cachedMetrics.averageExpense) {
            const total = this.totalExpenses;
            const count = this.totalExpenseCount;
            const avg = count > 0 ? total / count : 0;
            this.debugLog('Calculating averageExpense', { total, count, avg });
            this.cachedMetrics.averageExpense = avg;
        }
        return this.cachedMetrics.averageExpense;
    }

    get formattedAvgExpense() {
        const avg = this.averageExpense;
        this.debugLog('Formatting averageExpense', { avg });
        return this.formatCurrency(avg);
    }

    // Smart insights with fixed data mapping
    get topSpenderInsight() {
        if (!this.cachedMetrics.topSpenderInsight) {
            const expenses = this.transformExpenseData();
            const members = this.transformMemberData();
            
            this.debugLog('Calculating topSpenderInsight', { 
                expenseCount: expenses.length, 
                memberCount: members.length 
            });
            
            if (!expenses.length || !members.length) {
                this.cachedMetrics.topSpenderInsight = '';
                return this.cachedMetrics.topSpenderInsight;
            }
            
            const userTotals = {};
            expenses.forEach(e => {
                const paidBy = e.paidBy;
                if (paidBy) { // Only process if paidBy exists
                    if (!userTotals[paidBy]) userTotals[paidBy] = 0;
                    userTotals[paidBy] += e.amount || 0;
                }
            });
            
            this.debugLog('User totals calculated', userTotals);
            
            if (Object.keys(userTotals).length === 0) {
                this.cachedMetrics.topSpenderInsight = 'No valid expense data found.';
                return this.cachedMetrics.topSpenderInsight;
            }
            
            const topSpender = Object.entries(userTotals).reduce((a, b) => 
                userTotals[a[0]] > userTotals[b[0]] ? a : b
            );
            
            const memberName = this.getMemberNameById(topSpender[0], members);
            const percentage = ((topSpender[1] / this.totalExpenses) * 100).toFixed(1);
            
            this.debugLog('Top spender insight generated', { 
                memberName, 
                percentage,
                amount: topSpender[1]
            });
            this.cachedMetrics.topSpenderInsight = `${memberName} is the top spender, contributing ${percentage}% of total expenses.`;
        }
        return this.cachedMetrics.topSpenderInsight;
    }

    get categoryInsight() {
        if (!this.cachedMetrics.categoryInsight) {
            const expenses = this.transformExpenseData();
            
            this.debugLog('Calculating categoryInsight', { expenseCount: expenses.length });
            
            if (!expenses.length) {
                this.cachedMetrics.categoryInsight = '';
                return this.cachedMetrics.categoryInsight;
            }
            
            const categoryTotals = {};
            expenses.forEach(e => {
                const category = e.category || 'Other';
                if (!categoryTotals[category]) categoryTotals[category] = 0;
                categoryTotals[category] += e.amount || 0;
            });
            
            this.debugLog('Category totals calculated', categoryTotals);
            
            const topCategory = Object.entries(categoryTotals).reduce((a, b) => 
                categoryTotals[a[0]] > categoryTotals[b[0]] ? a : b
            );
            
            const percentage = ((topCategory[1] / this.totalExpenses) * 100).toFixed(1);
            this.debugLog('Category insight generated', { 
                topCategory: topCategory[0], 
                percentage,
                amount: topCategory[1]
            });
            this.cachedMetrics.categoryInsight = `${topCategory[0]} expenses account for ${percentage}% of your group spending.`;
        }
        return this.cachedMetrics.categoryInsight;
    }

    connectedCallback() {
        this.debugLog('connectedCallback triggered', { 
            groupId: this.groupId,
            membersCount: this.members?.length || 0,
            expensesCount: this.expenses?.length || 0
        });
    }

    renderedCallback() {
        this.debugLog('renderedCallback triggered', { 
            chartJsInitialized: this.chartJsInitialized, 
            isDataReady: this.isDataReady, 
            chartJsLoadAttempted: this.chartJsLoadAttempted 
        });
        
        if (this.chartJsInitialized || !this.isDataReady || this.chartJsLoadAttempted) {
            return;
        }

        this.chartJsLoadAttempted = true;
        
        loadScript(this, ChartJs)
            .then(() => {
                this.debugLog('Chart.js loaded successfully', { 
                    version: window.Chart ? window.Chart.version : 'unknown' 
                });
                this.chartJsInitialized = true;
                this.initUserFilterOptions();
                this.renderAllCharts();
            })
            .catch(error => {
                console.error('Error loading Chart.js', error);
            });
    }

    initUserFilterOptions() {
        const members = this.transformMemberData();
        this.debugLog('Initializing user filter options', { memberCount: members.length });
        
        this.userFilterOptions = [
            { label: 'All Members', value: 'all' },
            ...members.map(m => ({ 
                label: m.name, 
                value: m.id 
            }))
        ];
        
        this.debugLog('User filter options initialized', this.userFilterOptions);
    }

    handleUserFilterChange(event) {
        this.debugLog('Handling user filter change', { newValue: event.detail.value });
        this.selectedUserId = event.detail.value;
        this.renderFilteredLineChart();
    }

    renderAllCharts() {
        this.debugLog('Rendering all charts', { existingChartInstances: this.chartInstances.length });
        
        if (window.Chart && this.chartInstances.length) {
            this.chartInstances.forEach(chart => chart.destroy());
            this.chartInstances = [];
        }

        // Render charts with proper data validation
        this.renderChartSafe('user', () => this.getExpenseByUserData(), 'bar', 'Expense by User');
        this.renderChartSafe('category', () => this.getExpenseByCategoryData(), 'doughnut', 'Expense by Category');
        this.renderChartSafe('year', () => this.getExpenseByYearData(), 'bar', 'Expense by Year');
        this.renderChartSafe('radar', () => this.getRadarChartData(), 'radar', 'Member Spending Pattern');
        this.renderChartSafe('polar', () => this.getPolarChartData(), 'polarArea', 'Monthly Distribution');
        this.renderChartSafe('bubble', () => this.getBubbleChartData(), 'bubble', 'Daily Spending Analysis');
        this.renderChartSafe('velocity', () => this.getVelocityChartData(), 'line', 'Spending Velocity');
        this.renderChartSafe('mixed', () => this.getMixedChartData(), 'bar', 'Expense vs Budget Analysis');
        this.renderFilteredLineChart();
    }

    renderChartSafe(chartType, dataGenerator, chartKind, chartLabel) {
        try {
            const chartData = dataGenerator();
            if (chartData && this.validateChartData(chartData, chartKind)) {
                this.renderChart(chartType, chartData, chartKind, chartLabel);
            } else {
                this.debugLog(`Skipping ${chartType} chart - invalid data`, chartData);
            }
        } catch (error) {
            console.error(`Error generating ${chartType} chart data:`, error);
        }
    }

    validateChartData(chartData, chartKind) {
        if (!chartData || !chartData.datasets || !Array.isArray(chartData.datasets)) {
            return false;
        }

        // Chart.js data structure validation based on chart type
        switch (chartKind) {
            case 'bar':
            case 'line':
                return chartData.labels && chartData.labels.length > 0 && 
                       chartData.datasets.every(dataset => dataset.data && dataset.data.length > 0);
            case 'doughnut':
            case 'polarArea':
                return chartData.labels && chartData.labels.length > 0 && 
                       chartData.datasets.length > 0 && chartData.datasets[0].data && 
                       chartData.datasets[0].data.length > 0;
            case 'radar':
                return chartData.labels && chartData.labels.length > 0 && 
                       chartData.datasets.every(dataset => dataset.data && 
                       dataset.data.length === chartData.labels.length);
            case 'bubble':
                return chartData.datasets.every(dataset => dataset.data && 
                       Array.isArray(dataset.data) && 
                       dataset.data.every(point => point.x !== undefined && point.y !== undefined));
            default:
                return true;
        }
    }

    renderChart(chartType, chartData, chartKind, chartLabel) {
        this.debugLog('Rendering chart', { chartType, chartKind, chartLabel });
        
        const canvas = this.template.querySelector(`canvas[data-chart="${chartType}"]`);
        if (!canvas || !window.Chart || !chartData) {
            this.debugLog('Chart rendering skipped', { 
                canvasExists: !!canvas, 
                chartJsLoaded: !!window.Chart, 
                hasChartData: !!chartData 
            });
            return;
        }

        const ctx = canvas.getContext('2d');
        
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    display: true,
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: {
                            size: 12,
                            family: 'Salesforce Sans'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(33, 37, 41, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#007BFF',
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: (context) => {
                            if (chartKind === 'radar' || chartKind === 'polarArea') {
                                return `${context.dataset.label}: ${this.formatCurrency(context.parsed.r || context.parsed)}`;
                            }
                            return `${context.label}: ${this.formatCurrency(context.parsed.y || context.parsed)}`;
                        }
                    }
                }
            },
            scales: this.getScalesConfig(chartKind),
            elements: {
                point: {
                    radius: 6,
                    hoverRadius: 8
                },
                line: {
                    tension: 0.4,
                    borderWidth: 3
                }
            }
        };

        this.debugLog('Creating chart instance', { chartType, chartKind, chartData });
        
        const chart = new window.Chart(ctx, {
            type: chartKind,
            data: chartData,
            options: options
        });

        this.debugLog('Chart instance created', { chartType });
        this.chartInstances.push(chart);
    }

    getScalesConfig(chartKind) {
        if (chartKind === 'bar' || chartKind === 'line') {
            return {
                y: { 
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(108, 117, 125, 0.1)'
                    },
                    ticks: {
                        callback: (value) => this.formatCurrency(value),
                        font: {
                            family: 'Salesforce Sans'
                        }
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(108, 117, 125, 0.1)'
                    },
                    ticks: {
                        font: {
                            family: 'Salesforce Sans'
                        }
                    }
                }
            };
        } else if (chartKind === 'radar') {
            return {
                r: {
                    angleLines: {
                        display: true
                    },
                    suggestedMin: 0,
                    ticks: {
                        callback: (value) => this.formatCurrency(value),
                        font: {
                            family: 'Salesforce Sans'
                        }
                    }
                }
            };
        }
        return undefined;
    }

    // Chart data generation methods with proper Chart.js structure
    getExpenseByUserData() {
        const expenses = this.transformExpenseData();
        const members = this.transformMemberData();
        
        this.debugLog('Getting expense by user data', { 
            expenseCount: expenses.length, 
            memberCount: members.length 
        });
        
        const userMap = {};
        members.forEach(m => { 
            userMap[m.id] = m.name; 
        });
        
        const totals = {};
        expenses.forEach(e => {
            if (e.paidBy) { // Only process valid paidBy values
                if (!totals[e.paidBy]) totals[e.paidBy] = 0;
                totals[e.paidBy] += e.amount || 0;
            }
        });

        this.debugLog('User mapping and totals', { userMap, totals });

        // Chart.js bar chart data structure
        const chartData = {
            labels: Object.keys(totals).map(id => userMap[id] || 'Unknown'),
            datasets: [{
                label: 'Total Expense',
                data: Object.values(totals),
                backgroundColor: this.colorPalette.primary,
                borderColor: this.colorPalette.primary.map(color => color + 'CC'),
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false
            }]
        };
        
        this.debugLog('Bar chart data generated', chartData);
        return chartData;
    }

    getExpenseByCategoryData() {
        const expenses = this.transformExpenseData();
        
        this.debugLog('Getting expense by category data', { expenseCount: expenses.length });
        
        const totals = {};
        expenses.forEach(e => {
            const category = e.category || 'Other';
            if (!totals[category]) totals[category] = 0;
            totals[category] += e.amount || 0;
        });

        this.debugLog('Category totals', totals);

        // Chart.js doughnut chart data structure
        const chartData = {
            labels: Object.keys(totals),
            datasets: [{
                label: 'Total Expense',
                data: Object.values(totals),
                backgroundColor: this.colorPalette.categorical,
                borderColor: '#FFFFFF',
                borderWidth: 3,
                hoverBorderWidth: 4,
                hoverOffset: 4
            }]
        };
        
        this.debugLog('Doughnut chart data generated', chartData);
        return chartData;
    }

    // Chart.js compliant radar chart data structure
    getRadarChartData() {
        const expenses = this.transformExpenseData();
        const members = this.transformMemberData();
        
        this.debugLog('Getting radar chart data', { 
            expenseCount: expenses.length, 
            memberCount: members.length 
        });
        
        const categories = ['Food', 'Transport', 'Accommodation', 'Entertainment', 'Utilities', 'Other'];
        const datasets = [];

        const topMembers = members.slice(0, 3);
        
        topMembers.forEach((member, index) => {
            const memberExpenses = expenses.filter(e => e.paidBy === member.id);
            
            const categoryTotals = categories.map(category => {
                return memberExpenses
                    .filter(e => (e.category || 'Other') === category)
                    .reduce((sum, e) => sum + (e.amount || 0), 0);
            });

            datasets.push({
                label: member.name,
                data: categoryTotals,
                fill: true,
                backgroundColor: this.colorPalette.radar[index] || 'rgba(255, 99, 132, 0.2)',
                borderColor: this.colorPalette.radarBorder[index] || 'rgb(255, 99, 132)',
                pointBackgroundColor: this.colorPalette.radarBorder[index] || 'rgb(255, 99, 132)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: this.colorPalette.radarBorder[index] || 'rgb(255, 99, 132)',
                borderWidth: 3,
                pointBorderWidth: 2
            });
        });

        const chartData = {
            labels: categories,
            datasets: datasets
        };
        
        this.debugLog('Radar chart data generated', chartData);
        return chartData;
    }

    // Chart.js compliant polar area chart data structure
    getPolarChartData() {
        const expenses = this.transformExpenseData();
        
        this.debugLog('Getting polar chart data', { expenseCount: expenses.length });
        
        const monthTotals = {};
        expenses.forEach(e => {
            if (!e.date) return;
            const d = new Date(e.date);
            const key = d.toLocaleString('default', { month: 'short' });
            if (!monthTotals[key]) monthTotals[key] = 0;
            monthTotals[key] += e.amount || 0;
        });

        this.debugLog('Month totals for polar chart', monthTotals);

        const chartData = {
            labels: Object.keys(monthTotals),
            datasets: [{
                label: 'Monthly Expenses',
                data: Object.values(monthTotals),
                backgroundColor: this.colorPalette.polar,
                borderColor: '#FFFFFF',
                borderWidth: 2,
                borderAlign: 'center'
            }]
        };
        
        this.debugLog('Polar chart data generated', chartData);
        return chartData;
    }

    getBubbleChartData() {
        const expenses = this.transformExpenseData();
        
        this.debugLog('Getting bubble chart data', { expenseCount: expenses.length });
        
        const dailyData = {};
        expenses.forEach(e => {
            if (!e.date) return;
            const date = new Date(e.date);
            const key = date.toISOString().split('T')[0];
            if (!dailyData[key]) {
                dailyData[key] = { total: 0, count: 0, date: date };
            }
            dailyData[key].total += e.amount || 0;
            dailyData[key].count += 1;
        });

        // Chart.js bubble chart data structure
        const bubbleData = Object.values(dailyData).map(day => ({
            x: day.date.getDate(),
            y: day.total,
            r: Math.max(5, day.count * 3)
        }));

        this.debugLog('Bubble data points', { count: bubbleData.length, data: bubbleData });

        const chartData = {
            datasets: [{
                label: 'Daily Spending (Size = Transaction Count)',
                data: bubbleData,
                backgroundColor: 'rgba(0, 123, 255, 0.6)',
                borderColor: 'rgba(0, 123, 255, 1)',
                borderWidth: 2
            }]
        };
        
        this.debugLog('Bubble chart data generated', chartData);
        return chartData;
    }

    getVelocityChartData() {
        const expenses = this.transformExpenseData();
        
        this.debugLog('Getting velocity chart data', { expenseCount: expenses.length });
        
        const sortedExpenses = [...expenses].sort((a, b) => 
            new Date(a.date || 0) - new Date(b.date || 0)
        );

        const velocityData = [];
        let runningTotal = 0;

        sortedExpenses.forEach((expense) => {
            runningTotal += expense.amount || 0;
            velocityData.push({
                x: expense.date,
                y: runningTotal
            });
        });

        this.debugLog('Velocity data points', { count: velocityData.length });

        // Chart.js line chart data structure
        const chartData = {
            datasets: [{
                label: 'Cumulative Spending',
                data: velocityData,
                borderColor: '#007BFF',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                borderWidth: 3
            }]
        };
        
        this.debugLog('Velocity chart data generated', chartData);
        return chartData;
    }

    getMixedChartData() {
        const expenses = this.transformExpenseData();
        
        this.debugLog('Getting mixed chart data', { expenseCount: expenses.length });
        
        const monthTotals = {};
        expenses.forEach(e => {
            if (!e.date) return;
            const d = new Date(e.date);
            const key = d.toLocaleString('default', { month: 'short' });
            if (!monthTotals[key]) monthTotals[key] = 0;
            monthTotals[key] += e.amount || 0;
        });

        const months = Object.keys(monthTotals);
        const actualData = Object.values(monthTotals);
        const budgetData = actualData.map(val => val * 1.2);

        this.debugLog('Mixed chart data', { months, actualData, budgetData });

        // Chart.js mixed chart data structure
        const chartData = {
            labels: months,
            datasets: [
                {
                    type: 'bar',
                    label: 'Actual Expenses',
                    data: actualData,
                    backgroundColor: 'rgba(0, 123, 255, 0.8)',
                    borderColor: '#007BFF',
                    borderWidth: 2
                },
                {
                    type: 'line',
                    label: 'Budget',
                    data: budgetData,
                    borderColor: '#DC3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    fill: false,
                    tension: 0.4
                }
            ]
        };
        
        this.debugLog('Mixed chart data generated', chartData);
        return chartData;
    }

    getExpenseByYearData() {
        const expenses = this.transformExpenseData();
        
        this.debugLog('Getting expense by year data', { expenseCount: expenses.length });
        
        const totals = {};
        expenses.forEach(e => {
            if (!e.date) return;
            const d = new Date(e.date);
            const key = `${d.getFullYear()}`;
            if (!totals[key]) totals[key] = 0;
            totals[key] += e.amount || 0;
        });

        const sortedKeys = Object.keys(totals).sort();
        
        this.debugLog('Year totals and sorted keys', { totals, sortedKeys });

        const chartData = {
            labels: sortedKeys,
            datasets: [{
                label: 'Total Expense',
                data: sortedKeys.map(k => totals[k]),
                backgroundColor: 'rgba(111, 66, 193, 0.8)',
                borderColor: '#6F42C1',
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false
            }]
        };
        
        this.debugLog('Year chart data generated', chartData);
        return chartData;
    }

    renderFilteredLineChart() {
        this.debugLog('Rendering filtered line chart', { selectedUserId: this.selectedUserId });
        
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
        if (!canvas || !window.Chart) {
            this.debugLog('Filtered line chart rendering skipped', { 
                canvasExists: !!canvas, 
                chartJsLoaded: !!window.Chart 
            });
            return;
        }

        const ctx = canvas.getContext('2d');
        const { labels, data, avgData } = this.getFilteredLineChartData();
        
        this.debugLog('Filtered line chart data', { 
            labelsCount: labels.length, 
            dataPoints: data.length, 
            avgDataPoints: avgData.length
        });

        // Chart.js line chart data structure
        const chart = new window.Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: this.selectedUserId === 'all' ? 'Total Expenses' : 'User Expenses',
                        data,
                        borderColor: '#007BFF',
                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 6,
                        pointHoverRadius: 8,
                        pointBackgroundColor: '#007BFF',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        borderWidth: 3
                    },
                    {
                        label: 'Average',
                        data: avgData,
                        borderColor: '#FFC107',
                        backgroundColor: 'rgba(255, 193, 7, 0.08)',
                        fill: false,
                        borderDash: [8, 4],
                        pointRadius: 4,
                        pointBackgroundColor: '#FFC107',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        display: true,
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 20,
                            font: {
                                family: 'Salesforce Sans'
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(33, 37, 41, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#007BFF',
                        borderWidth: 1,
                        cornerRadius: 8,
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${this.formatCurrency(context.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(108, 117, 125, 0.1)'
                        },
                        ticks: {
                            callback: (value) => this.formatCurrency(value),
                            font: {
                                family: 'Salesforce Sans'
                            }
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(108, 117, 125, 0.1)'
                        },
                        ticks: {
                            font: {
                                family: 'Salesforce Sans'
                            }
                        }
                    }
                }
            }
        });

        this.chartInstances.push(chart);
    }

    getFilteredLineChartData() {
        const expenses = this.transformExpenseData();
        const members = this.transformMemberData();
        
        this.debugLog('Getting filtered line chart data', { 
            selectedUserId: this.selectedUserId, 
            expenseCount: expenses.length 
        });
        
        const monthSet = new Set();
        expenses.forEach(e => {
            if (!e.date) return;
            const d = new Date(e.date);
            const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`;
            monthSet.add(key);
        });

        const months = Array.from(monthSet).sort();
        this.debugLog('Months calculated', months);

        const data = months.map(month => {
            return expenses.filter(e => {
                if (!e.date) return false;
                const d = new Date(e.date);
                const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`;
                if (this.selectedUserId === 'all') return key === month;
                return key === month && e.paidBy === this.selectedUserId;
            }).reduce((sum, e) => sum + (e.amount || 0), 0);
        });

        const avgData = months.map(month => {
            const userTotals = {};
            members.forEach(m => { userTotals[m.id] = 0; });
            expenses.forEach(e => {
                if (!e.date || !e.paidBy) return;
                const d = new Date(e.date);
                const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`;
                if (key === month && userTotals.hasOwnProperty(e.paidBy)) {
                    userTotals[e.paidBy] += e.amount || 0;
                }
            });

            const values = Object.values(userTotals);
            const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            return avg;
        });

        this.debugLog('Filtered line chart data generated', { 
            monthsCount: months.length, 
            dataSum: data.reduce((a, b) => a + b, 0),
            avgSum: avgData.reduce((a, b) => a + b, 0)
        });
        
        return { labels: months, data, avgData };
    }

    // Utility methods
    formatCurrency(amount) {
        const key = `${amount}_${this.currency}`;
        if (this.currencyCache[key]) {
            return this.currencyCache[key];
        }
        
        try {
            if (amount === null || amount === undefined) {
                const defaultValue = `${this.currency} 0.00`;
                this.currencyCache[key] = defaultValue;
                return defaultValue;
            }
            
            const formatted = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: this.currency || 'USD'
            }).format(amount);
            
            this.currencyCache[key] = formatted;
            return formatted;
        } catch (error) {
            console.error('Error formatting currency:', error);
            const fallback = `${this.currency} 0.00`;
            this.currencyCache[key] = fallback;
            return fallback;
        }
    }

    getMemberNameById(memberId, members = null) {
        const memberList = members || this.transformMemberData();
        this.debugLog('Getting member name by ID', { memberId });
        const member = memberList.find(m => m.id === memberId);
        const memberName = member ? member.name : 'Unknown';
        this.debugLog('Member name found', { memberId, memberName });
        return memberName;
    }

    disconnectedCallback() {
        this.debugLog('disconnectedCallback triggered', { 
            chartInstances: this.chartInstances.length 
        });
        
        if (window.Chart && this.chartInstances.length) {
            this.chartInstances.forEach(chart => chart.destroy());
            this.chartInstances = [];
        }
        
        // Clear cache
        this.currencyCache = {};
        this.cachedMetrics = {};
    }
}