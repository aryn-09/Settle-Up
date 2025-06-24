import { LightningElement, track, wire, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import { refreshApex } from '@salesforce/apex';
import loginPlayer from '@salesforce/apex/SettleUpController.loginPlayer';
import getPlayerGroups from '@salesforce/apex/SettleUpController.getPlayerGroups';
import validateSession from '@salesforce/apex/SettleUpController.validateSession';
import endSession from '@salesforce/apex/SettleUpController.endSession';

export default class SettleUpApp extends NavigationMixin(LightningElement) {
    @api title = 'Settle Up App';
    
    // Session Management
    @track sessionToken = '';
    @track isLoggedIn = false;
    @track currentPlayer = {};
    
    // Navigation State
    @track activeTab = 'dashboard';
    @track showLogin = true;
    @track showRegistration = false;
    @track showLoading = false;
    
    // View States
    @track currentPlayer = {};
    @track activeTab = 'dashboard';
    // @track selectedGroupId = '';
    @track showGroupDetail = false;
    @track showExpenseForm = false;
    @track selectedGroupId = '';
    
    // Data
    @track playerGroups = [];
    
    // Session timeout handling
    sessionCheckInterval;
    sessionWarningTimeout;
    @track showSessionWarning = false;
    
    // Constants
    SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
    SESSION_WARNING_TIME = 2 * 60 * 1000;   // 2 minutes before expiry
    
    @track showForgotPassword = false;
    
    connectedCallback() {
        this.initializeApp();
        this.startSessionMonitoring();
    }
    
    disconnectedCallback() {
        this.stopSessionMonitoring();
    }
    
    // ==================== INITIALIZATION ====================
    
    initializeApp() {
        // Check if there's an existing session in localStorage
        const savedSession = this.getStoredSession();
        if (savedSession) {
            this.validateExistingSession(savedSession);
        } else {
            this.showAuthenticationView();
        }
    }
    
    getStoredSession() {
        // Note: In real implementation, you might want to use secure storage
        try {
            const session = localStorage.getItem('settleUpSession');
            return session ? JSON.parse(session) : null;
        } catch (error) {
            console.error('Error reading stored session:', error);
            return null;
        }
    }
    
    async validateExistingSession(savedSession) {
        this.showLoading = true;
        try {
            const isValid = await validateSession({ sessionToken: savedSession.token });
            if (isValid) {
                this.sessionToken = savedSession.token;
                this.currentPlayer = savedSession.player;
                this.isLoggedIn = true;
                await this.loadPlayerData();
            } else {
                this.clearStoredSession();
                this.showAuthenticationView();
            }
        } catch (error) {
            console.error('Session validation error:', error);
            this.clearStoredSession();
            this.showAuthenticationView();
        } finally {
            this.showLoading = false;
        }
    }
    
    showAuthenticationView() {
        this.showLogin = true;
        this.showRegistration = false;
        this.isLoggedIn = false;
    }
    
    // ==================== AUTHENTICATION HANDLERS ====================
    
    async handleLoginSuccess(event) {
        const { sessionToken, playerId, playerName, email } = event.detail;
        
        this.sessionToken = sessionToken;
        this.currentPlayer = {
            id: playerId,
            name: playerName,
            email: email
        };
        
        // Store session
        this.storeSession(sessionToken, this.currentPlayer);
        
        this.isLoggedIn = true;
        this.showLogin = false;
        this.activeTab = 'dashboard';
        
        await this.loadPlayerData();
        this.showToast('Welcome!', `Hello ${playerName}, welcome to Settle Up!`, 'success');
    }
    
    handleRegistrationSuccess(event) {
        this.showRegistration = false;
        this.showLogin = true;
        this.showToast('Registration Complete', 'Please login with your new account', 'success');
    }
    
    handleShowRegistration() {
        this.showLogin = false;
        this.showRegistration = true;
    }
    
    handleShowForgotPassword() {
        this.showForgotPassword = true;
        this.showLogin = false;
        this.showRegistration = false;
    }
    
    handleBackToLogin() {
        this.showForgotPassword = false;
        this.showRegistration = false;
        this.showLogin = true;
    }
    
    async handleLogout() {
        try {
            if (this.sessionToken) {
                await endSession({ sessionToken: this.sessionToken });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearSession();
            this.showToast('Logged Out', 'You have been successfully logged out', 'info');
            // Navigate to login page
            this[NavigationMixin.Navigate]({
                type: 'standard__webPage',
                attributes: {
                    url: '/loginregisterpage'
                }
            });
        }
    }
    
    // ==================== SESSION MANAGEMENT ====================
    
    storeSession(token, player) {
        try {
            const sessionData = {
                token: token,
                player: player,
                timestamp: Date.now()
            };
            localStorage.setItem('settleUpSession', JSON.stringify(sessionData));
        } catch (error) {
            console.error('Error storing session:', error);
        }
    }
    
    clearStoredSession() {
        try {
            localStorage.removeItem('settleUpSession');
        } catch (error) {
            console.error('Error clearing stored session:', error);
        }
    }
    
    clearSession() {
        this.sessionToken = '';
        this.isLoggedIn = false;
        this.currentPlayer = {};
        this.playerGroups = [];
        this.activeTab = 'dashboard';
        this.showGroupDetail = false;
        this.showExpenseForm = false;
        this.selectedGroupId = '';
        this.clearStoredSession();
        this.showAuthenticationView();
    }
    
    startSessionMonitoring() {
        this.sessionCheckInterval = setInterval(() => {
            this.checkSessionValidity();
        }, this.SESSION_CHECK_INTERVAL);
    }
    
    stopSessionMonitoring() {
        if (this.sessionCheckInterval) {
            clearInterval(this.sessionCheckInterval);
        }
        if (this.sessionWarningTimeout) {
            clearTimeout(this.sessionWarningTimeout);
        }
    }
    
    async checkSessionValidity() {
        if (!this.sessionToken) return;
        
        try {
            const isValid = await validateSession({ sessionToken: this.sessionToken });
            if (!isValid) {
                this.showToast('Session Expired', 'Your session has expired. Please login again.', 'warning');
                this.clearSession();
            }
        } catch (error) {
            console.error('Session check error:', error);
        }
    }
    
    // ==================== DATA LOADING ====================
    
    async loadPlayerData() {
        try {
            await this.loadPlayerGroups();
        } catch (error) {
            console.error('Error loading player data:', error);
            this.showToast('Error', 'Failed to load your data. Please refresh the page.', 'error');
        }
    }
    
    async loadPlayerGroups() {
        try {
            const groups = await getPlayerGroups({ sessionToken: this.sessionToken });
            this.playerGroups = groups || [];
        } catch (error) {
            console.error('Error loading groups:', error);
            this.playerGroups = [];
        }
    }
    
    // ==================== NAVIGATION HANDLERS ====================
    
    handleTabClick(event) {
        event.preventDefault();
        const tabName = event.target.dataset.tab;
        if (tabName) {
            this.activeTab = tabName;
            this.resetViewStates();
        }
    }
    
    resetViewStates() {
        this.showGroupDetail = false;
        this.showExpenseForm = false;
        this.selectedGroupId = '';
    }
    
    // ==================== GROUP HANDLERS ====================
    
    handleViewGroup(event) {
        this.selectedGroupId = event.detail.groupId;
        this.showGroupDetail = true;
        this.activeTab = 'groups';
    }
    
    handleBackToGroups() {
        this.showGroupDetail = false;
        this.selectedGroupId = '';
    }
    
    async handleCreateGroup(event) {
        // Group creation handled by child components
        await this.loadPlayerGroups();
        this.showToast('Success', 'Group created successfully!', 'success');
    }
    
    async handleJoinGroup(event) {
        // Group joining handled by child components
        await this.loadPlayerGroups();
        this.showToast('Success', 'Joined group successfully!', 'success');
    }
    
    async handleRefreshGroups() {
        await this.loadPlayerGroups();
    }
    
    // ==================== EXPENSE HANDLERS ====================
    
    handleAddExpense(event) {
        this.selectedGroupId = event.detail.groupId || this.selectedGroupId;
        this.showExpenseForm = true;
        this.activeTab = 'expenses';
    }
    
    handleEditExpense(event) {
        // Handle expense editing
        this.showExpenseForm = true;
        this.activeTab = 'expenses';
    }
    
    async handleExpenseAdded() {
        this.showExpenseForm = false;
        await this.loadPlayerGroups();
        this.showToast('Success', 'Expense added successfully!', 'success');
    }
    
    handleCancelExpense() {
        this.showExpenseForm = false;
    }
    
    // ==================== SETTLEMENT HANDLERS ====================
    
    handleViewSettlements(event) {
        this.selectedGroupId = event.detail.groupId || this.selectedGroupId;
        this.activeTab = 'settlements';
    }
    
    async handleSettlementCreated() {
        await this.loadPlayerGroups();
        this.showToast('Success', 'Settlement recorded successfully!', 'success');
    }
    
    // ==================== COMPUTED PROPERTIES ====================
    
    // Tab active states
    get isDashboardActive() { return this.activeTab === 'dashboard'; }
    get isGroupsActive() { return this.activeTab === 'groups'; }
    get isExpensesActive() { return this.activeTab === 'expenses'; }
    get isSettlementsActive() { return this.activeTab === 'settlements'; }
    
    // Tab CSS classes
    get dashboardTabClass() {
        return this.isDashboardActive ? 'slds-tabs_default__item slds-is-active' : 'slds-tabs_default__item';
    }
    get groupsTabClass() {
        return this.isGroupsActive ? 'slds-tabs_default__item slds-is-active' : 'slds-tabs_default__item';
    }
    get expensesTabClass() {
        return this.isExpensesActive ? 'slds-tabs_default__item slds-is-active' : 'slds-tabs_default__item';
    }
    get settlementsTabClass() {
        return this.isSettlementsActive ? 'slds-tabs_default__item slds-is-active' : 'slds-tabs_default__item';
    }
    
    // Tab content CSS classes
    get dashboardContentClass() {
        return this.isDashboardActive ? 'slds-tabs_default__content slds-show' : 'slds-tabs_default__content slds-hide';
    }
    get groupsContentClass() {
        return this.isGroupsActive ? 'slds-tabs_default__content slds-show' : 'slds-tabs_default__content slds-hide';
    }
    get expensesContentClass() {
        return this.isExpensesActive ? 'slds-tabs_default__content slds-show' : 'slds-tabs_default__content slds-hide';
    }
    get settlementsContentClass() {
        return this.isSettlementsActive ? 'slds-tabs_default__content slds-show' : 'slds-tabs_default__content slds-hide';
    }
    
    // ==================== UTILITY METHODS ====================
    
    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
        });
        this.dispatchEvent(event);
    }

    // Navigation Methods
    navigateToGroupManagement() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/groupmanagementpage'
            }
        });
    }

    navigateToExpenseManagement() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/expensemanagement'
            }
        });
    }

    navigateToSettlementManagement() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/settlementmanagement'
            }
        });
    }

    navigateToLoginRegister() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/loginregisterpage'
            }
        });
    }

    navigateToHome() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/Home'
            }
        });
    }
}