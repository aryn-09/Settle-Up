// groupDetail.js
import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import { CurrentPageReference } from 'lightning/navigation';
import { refreshApex } from '@salesforce/apex';
// import addExpense from '@salesforce/apex/SettleUpController.addExpense';
import createExpense from '@salesforce/apex/SettleUpController.createExpense';
import updateExpense from '@salesforce/apex/SettleUpController.updateExpense';
import getGroupDetails from '@salesforce/apex/SettleUpController.getGroupDetails';
import getGroupMembers from '@salesforce/apex/SettleUpController.getGroupMembers';
import getGroupExpenses from '@salesforce/apex/SettleUpController.getGroupExpenses';
import getGroupSettlements from '@salesforce/apex/SettleUpController.getGroupSettlements';
import getExpenseForView from '@salesforce/apex/SettleUpController.getExpenseForView';
import removeExpense from '@salesforce/apex/SettleUpController.removeExpense';
import createSettlement from '@salesforce/apex/SettleUpController.createSettlement';
import confirmSettlement from '@salesforce/apex/SettleUpController.confirmSettlement';
import getOutstandingBalances from '@salesforce/apex/SettleUpController.getOutstandingBalances';
import getOptimalSettlements from '@salesforce/apex/SettleUpController.getOptimalSettlements';
import cancelSettlement from '@salesforce/apex/SettleUpController.cancelSettlement';
import processExpenseCreation from '@salesforce/apex/SettleUpController.processExpenseCreation';

export default class GroupDetail extends NavigationMixin(LightningElement) {
    @api groupId;
    @api sessionToken;
    
    @track groupData = {};
    @track members = [];
    @track expenses = [];
    @track settlements = [];
    @track balances = [];
    @track showExpenseModal = false;
    @track showSettlementModal = false;
    @track showMemberModal = false;
    @track showExpenseDetailsModal = false;
    @track selectedTab = 'expenses';
    @track isLoading = true;
    @track error = null;
    @track suggestedSettlements = [];
    @track showSuggestions = false;
    @track selectedExpense = {};
    @track expenseSplits = [];
    @track isEditingExpense = false;
    @track settlementSummary = {};
    @track outstandingBalances = [];

    // Expense form data
    @track expenseForm = {
        name: '',
        amount: 0,
        category: 'Food',
        date: new Date().toISOString().split('T')[0],
        notes: '',
        splitMethod: 'Equal',
        selectedMembers: [],
        paidBy: ''
    };

    // Settlement form data
    @track settlementForm = {
        fromPlayer: '',
        toPlayer: '',
        amount: 0,
        paymentMethod: 'Cash',
        notes: ''
    };

    // Edit expense form data
    @track editExpenseForm = {
        name: '',
        amount: 0,
        category: 'Food',
        date: '',
        notes: '',
        splitMethod: 'Equal',
        selectedMembers: [],
        paidBy: '',
        customSplits: {}
    };

    categoryOptions = [
        { label: 'Food', value: 'Food' },
        { label: 'Transport', value: 'Transport' },
        { label: 'Accommodation', value: 'Accommodation' },
        { label: 'Entertainment', value: 'Entertainment' },
        { label: 'Utilities', value: 'Utilities' },
        { label: 'Other', value: 'Other' }
    ];

    splitMethodOptions = [
        { label: 'Equal', value: 'Equal' },
        { label: 'Percentage', value: 'Percentage' },
        { label: 'Custom Amount', value: 'Custom Amount' }
    ];

    paymentMethodOptions = [
        { label: 'Cash', value: 'Cash' },
        { label: 'Bank Transfer', value: 'Bank Transfer' },
        { label: 'UPI', value: 'UPI' },
        { label: 'PayPal', value: 'PayPal' },
        { label: 'Venmo', value: 'Venmo' },
        { label: 'Other', value: 'Other' }
    ];

    @wire(CurrentPageReference)
    getStateParameters(currentPageReference) {
        console.log('[GroupDetail] getStateParameters called with:', currentPageReference);
        if (currentPageReference) {
            this.groupId = currentPageReference.state?.groupId;
            // Get session token from localStorage instead of URL parameters
            this.sessionToken = this.getStoredSessionToken();
            console.log('[GroupDetail] Extracted groupId:', this.groupId, 'sessionToken:', this.sessionToken);
            if (this.groupId && this.sessionToken) {
                console.log('[GroupDetail] Calling loadData from wire service');
                this.loadData();
            } else {
                console.log('[GroupDetail] Missing groupId or sessionToken from URL params');
                if (!this.sessionToken) {
                    this.error = 'Session not found. Please login again.';
                }
            }
        } else {
            console.log('[GroupDetail] No currentPageReference available');
        }
    }

    connectedCallback() {
        console.log('[GroupDetail] connectedCallback called');
        this.refreshSessionAndLoad();
        
        // Add event listener for settlement actions
        this.addEventListener('settlementaction', this.handleSettlementAction.bind(this));
    }

    disconnectedCallback() {
        // Remove event listener
        this.removeEventListener('settlementaction', this.handleSettlementAction.bind(this));
    }

    // Helper method to get session token from storage
    getStoredSessionToken() {
        try {
            // Try localStorage first (from settleUpApp)
            const sessionData = localStorage.getItem('settleUpSession');
            if (sessionData) {
                const session = JSON.parse(sessionData);
                return session.token;
            }
            
            // Try sessionStorage (from playerLogin)
            const sessionToken = sessionStorage.getItem('settleUpSession');
            if (sessionToken) {
                return sessionToken;
            }
            
            return null;
        } catch (error) {
            console.error('[GroupDetail] Error reading stored session:', error);
            return null;
        }
    }

    // Method to refresh session token and retry loading
    refreshSessionAndLoad() {
        console.log('[GroupDetail] refreshSessionAndLoad called');
        this.sessionToken = this.getStoredSessionToken();
        if (this.groupId && this.sessionToken) {
            this.error = null;
            this.loadData();
        } else {
            this.error = 'Session not found. Please login again.';
        }
    }

    async loadData() {
        console.log('[GroupDetail] loadData called with groupId:', this.groupId, 'sessionToken:', this.sessionToken);
        this.isLoading = true;
        try {
            const result = await getGroupDetails({
                sessionToken: this.sessionToken,
                groupId: this.groupId
            });
            
            console.log('[GroupDetail] getGroupDetails result:', result);
            const response = JSON.parse(result);
            console.log('[GroupDetail] parsed response:', response);
            
            if (response.success) {
                const group = response.group;
                this.groupData = {
                    name: group.Name,
                    description: group.Description__c,
                    memberCount: group.Member_Count__c,
                    currency: group.Currency__c,
                    totalExpenses: group.Total_Expenses__c,
                    groupCode: group.Group_Code__c,
                    lastActivity: group.Last_Activity__c,
                    createdDate: group.Created_Date__c
                };
                
                // Process members data for proper display
                this.members = (response.members || []).map(member => ({
                    id: member.Id,
                    playerId: member.Player__c,
                    playerName: member.Player__r ? member.Player__r.Name : 'Unknown Player',
                    email: member.Player__r ? member.Player__r.Email__c : '',
                    nickname: member.Nickname__c || member.Player__r ? member.Player__r.Name : 'Unknown Player',
                    role: member.Role__c || 'Member',
                    roleVariant: member.Role__c === 'Admin' ? 'brand' : 'neutral',
                    avatarUrl: member.Player__r ? member.Player__r.Avatar_URL__c : null,
                    formattedJoinDate: member.CreatedDate ? this.formatDate(member.CreatedDate) : 'Unknown',
                    totalPaid: member.Total_Paid__c || 0,
                    totalOwed: member.Total_Owed__c || 0,
                    netBalance: member.Net_Balance__c || 0,
                    formattedTotalPaid: this.formatCurrency(member.Total_Paid__c || 0),
                    formattedTotalOwed: this.formatCurrency(member.Total_Owed__c || 0),
                    formattedNetBalance: this.formatCurrency(member.Net_Balance__c || 0),
                    balanceClass: this.getBalanceClass(member.Net_Balance__c || 0),
                    // Keep original data for backward compatibility
                    ...member
                }));
                
                console.log('[GroupDetail] Processed members data:', this.members);
                console.log('[GroupDetail] Members array length:', this.members.length);
                console.log('[GroupDetail] Members array content:', JSON.stringify(this.members, null, 2));
                
                this.expenses = (response.expenses || []).map(exp => ({
                    id: exp.Id,
                    name: exp.Name,
                    category: exp.Category__c || '',
                    paidByName: exp.Paid_By__r ? exp.Paid_By__r.Name : '',
                    formattedDate: exp.Date__c ? this.formatDate(exp.Date__c) : '',
                    formattedAmount: this.formatCurrency(exp.Amount__c),
                    amount: exp.Amount__c,
                    notes: exp.Notes__c || '',
                    categoryIcon: this.getCategoryIcon(exp.Category__c),
                    ...exp
                }));
                this.settlements = (response.settlements || []).map(settlement => ({
                    id: settlement.Id,
                    fromPlayerName: settlement.From_Player__r ? settlement.From_Player__r.Name : '',
                    toPlayerName: settlement.To_Player__r ? settlement.To_Player__r.Name : '',
                    amount: settlement.Amount__c,
                    formattedAmount: this.formatCurrency(settlement.Amount__c),
                    paymentMethod: settlement.Payment_Method__c || '',
                    notes: settlement.Notes__c || '',
                    status: settlement.Status__c,
                    statusVariant: settlement.Status__c === 'Confirmed' ? 'success' : (settlement.Status__c === 'Pending' ? 'warning' : 'inverse'),
                    formattedDate: settlement.Date__c ? this.formatDate(settlement.Date__c) : '',
                    canConfirm: settlement.Status__c === 'Pending',
                    ...settlement
                }));
                this.balances = response.balances || [];
                this.error = null;
                console.log('[GroupDetail] Data loaded successfully:', {
                    groupData: this.groupData,
                    membersCount: this.members.length,
                    expensesCount: this.expenses.length,
                    settlementsCount: this.settlements.length,
                    balancesCount: this.balances.length
                });
            } else {
                this.error = response.message || 'Failed to load group details';
                console.error('[GroupDetail] Error in response:', this.error);
            }
        } catch (error) {
            this.error = 'Failed to load group details: ' + error.message;
            console.error('[GroupDetail] Error loading group details:', error);
        } finally {
            this.isLoading = false;
            console.log('[GroupDetail] loadData completed, isLoading:', this.isLoading);
        }
    }

    get tabClasses() {
        return {
            expenses: `slds-tabs_default__item ${this.selectedTab === 'expenses' ? 'slds-is-active' : ''}`,
            balances: `slds-tabs_default__item ${this.selectedTab === 'balances' ? 'slds-is-active' : ''}`,
            settlements: `slds-tabs_default__item ${this.selectedTab === 'settlements' ? 'slds-is-active' : ''}`
        };
    }

    get tabContentClasses() {
        return {
            expenses: `slds-tabs_default__content ${this.selectedTab === 'expenses' ? 'slds-show' : 'slds-hide'}`,
            balances: `slds-tabs_default__content ${this.selectedTab === 'balances' ? 'slds-show' : 'slds-hide'}`,
            settlements: `slds-tabs_default__content ${this.selectedTab === 'settlements' ? 'slds-show' : 'slds-hide'}`
        };
    }

    get totalExpenses() {
        return this.expenses.reduce((sum, expense) => sum + expense.amount, 0).toFixed(2);
    }

    get memberOptions() {
        console.log('[GroupDetail] memberOptions getter called');
        console.log('[GroupDetail] members for options:', this.members);
        
        const options = (this.members || []).map(member => ({
            label: member.Player__r ? member.Player__r.Name : member.name || member.nickname || 'Member',
            value: member.Player__c || member.playerId
        }));
        
        console.log('[GroupDetail] memberOptions result:', options);
        return options;
    }

    get settlementFromOptions() {
        return this.balances
            .filter(balance => balance.netBalance < 0)
            .map(balance => ({
                label: balance.playerName,
                value: balance.playerId
            }));
    }

    get settlementToOptions() {
        return this.balances
            .filter(balance => balance.netBalance > 0)
            .map(balance => ({
                label: balance.playerName,
                value: balance.playerId
            }));
    }

    // Tab Navigation
    handleTabClick(event) {
        this.selectedTab = event.target.dataset.tab;
    }

    // Modal Controls
    openExpenseModal() {
        console.log('[GroupDetail] openExpenseModal called');
        console.log('[GroupDetail] openExpenseModal - this.members:', this.members);
        console.log('[GroupDetail] openExpenseModal - this.members.length:', this.members ? this.members.length : 'undefined');
        
        // Check if members are loaded
        if (!this.members || this.members.length === 0) {
            console.log('[GroupDetail] openExpenseModal - No members loaded, showing error');
            this.showToast('Error', 'Members not loaded yet. Please wait a moment and try again.', 'error');
            return;
        }
        
        this.showExpenseModal = true;
        this.resetExpenseForm();
    }

    closeExpenseModal() {
        this.showExpenseModal = false;
    }

    openSettlementModal() {
        this.showSettlementModal = true;
        this.resetSettlementForm();
    }

    closeSettlementModal() {
        this.showSettlementModal = false;
    }

    openMemberModal() {
        console.log('[GroupDetail] Opening member modal');
        console.log('[GroupDetail] Current members data:', this.members);
        this.showMemberModal = true;
    }

    closeMemberModal() {
        this.showMemberModal = false;
    }

    // Expense Details Modal Controls
    async handleExpenseClick(event) {
        const expenseId = event.currentTarget.dataset.expenseId;
        console.log('[GroupDetail] handleExpenseClick called for expense:', expenseId);
        this.isLoading = true;
        try {
            const expense = await getExpenseForView({ expenseId });
            this.selectedExpense = {
                id: expense.Id,
                name: expense.Name,
                amount: expense.Amount__c,
                category: expense.Category__c,
                date: expense.Date__c,
                notes: expense.Notes__c,
                splitMethod: expense.Split_Method__c,
                location: expense.Location__c,
                paidBy: expense.Paid_By__c,
                paidByName: expense.Paid_By__c, // You may want to resolve name from members
                formattedAmount: this.formatCurrency(expense.Amount__c),
                formattedDate: expense.Date__c ? this.formatDate(expense.Date__c) : ''
            };
            this.expenseSplits = (expense.Expense_Split__r || []).map(split => ({
                id: split.Id,
                playerId: split.Player__c,
                playerName: this.getPlayerNameById(split.Player__c),
                amount: split.Amount__c,
                percentage: split.Percentage__c,
                shares: split.Shares__c,
                isPaid: split.Is_Paid__c,
                formattedAmount: this.formatCurrency(split.Amount__c)
            }));
            this.showExpenseDetailsModal = true;
            this.isEditingExpense = false;
            console.log('[GroupDetail] Expense details loaded:', this.selectedExpense);
            console.log('[GroupDetail] Expense splits loaded:', this.expenseSplits);
        } catch (error) {
            console.error('Error loading expense details:', error);
            this.showToast('Error', 'Failed to load expense details: ' + (error.body?.message || error.message), 'error');
        }
        this.isLoading = false;
    }

    closeExpenseDetailsModal() {
        this.showExpenseDetailsModal = false;
        this.selectedExpense = {};
        this.expenseSplits = [];
        this.isEditingExpense = false;
    }

    startEditExpense() {
        // Populate edit form with current expense data
        this.editExpenseForm = {
            name: this.selectedExpense.name || '',
            amount: this.selectedExpense.amount || 0,
            category: this.selectedExpense.category || 'Food',
            date: this.selectedExpense.date ? this.selectedExpense.date.split('T')[0] : new Date().toISOString().split('T')[0],
            notes: this.selectedExpense.notes || '',
            splitMethod: this.selectedExpense.splitMethod || 'Equal',
            selectedMembers: this.expenseSplits.map(split => split.playerId),
            paidBy: this.selectedExpense.paidBy || '',
            customSplits: this.expenseSplits.reduce((acc, split) => ({ ...acc, [split.playerId]: split.amount }), {})
        };
        this.isEditingExpense = true;
        console.log('[GroupDetail] Started editing expense:', this.editExpenseForm);
    }

    cancelEditExpense() {
        this.isEditingExpense = false;
        this.editExpenseForm = {
            name: '',
            amount: 0,
            category: 'Food',
            date: '',
            notes: '',
            splitMethod: 'Equal',
            selectedMembers: [],
            paidBy: '',
            customSplits: {}
        };
    }

    // Form Handlers
    handleExpenseInputChange(event) {
        const field = event.target.dataset.field;
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        
        console.log('[GroupDetail] handleExpenseInputChange - field:', field, 'value:', value, 'event:', event);
        
        if (field === 'selectedMembers') {
            this.expenseForm.selectedMembers = Array.from(event.detail.value);
            console.log('[GroupDetail] Updated selectedMembers:', this.expenseForm.selectedMembers);
        } else {
            this.expenseForm = { ...this.expenseForm, [field]: value };
            console.log('[GroupDetail] Updated expenseForm:', this.expenseForm);
        }
    }

    handleSettlementInputChange(event) {
        const field = event.target.dataset.field;
        const value = event.target.value;
        this.settlementForm = { ...this.settlementForm, [field]: value };
    }

    // Edit Expense Form Handlers
    handleEditExpenseInputChange(event) {
        const field = event.target.dataset.field;
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        
        console.log('[GroupDetail] handleEditExpenseInputChange - field:', field, 'value:', value);
        
        if (field === 'selectedMembers') {
            this.editExpenseForm.selectedMembers = Array.from(event.detail.value);
            console.log('[GroupDetail] Updated editExpenseForm.selectedMembers:', this.editExpenseForm.selectedMembers);
        } else {
            this.editExpenseForm = { ...this.editExpenseForm, [field]: value };
            console.log('[GroupDetail] Updated editExpenseForm:', this.editExpenseForm);
        }
    }

    handleEditCustomSplitChange(event) {
        const memberId = event.target.dataset.memberId;
        const field = event.target.dataset.field;
        const value = event.target.value;
        this.editExpenseForm = {
            ...this.editExpenseForm,
            [`${field}_${memberId}`]: value
        };
    }

    // Expense Operations
    async handleAddExpense() {
        console.log('[GroupDetail] handleAddExpense called');
        console.log('[GroupDetail] expenseForm:', JSON.stringify(this.expenseForm));
        console.log('[GroupDetail] selectedMemberObjects:', JSON.stringify(this.selectedMemberObjects));
        console.log('[GroupDetail] selectedMemberObjects.length:', this.selectedMemberObjects?.length);
        console.log('[GroupDetail] sessionToken:', this.sessionToken);
        console.log('[GroupDetail] groupId:', this.groupId);

        // Validate that we have members loaded
        try {
            console.log('[GroupDetail] Validating members');
            if (!this.members || this.members.length === 0) {
                console.log('[GroupDetail] No members found');
                this.showToast('Error', 'No members found. Please refresh the page and try again.', 'error');
                return;
            }
            console.log('[GroupDetail] Members validation passed');
        } catch (error) {
            console.error('[GroupDetail] Error in members validation:', error);
            console.log('[GroupDetail] Error details:', JSON.stringify(error.message));
            this.showToast('Error', 'Error validating members: ' + error.message, 'error');
            this.isLoading = false;
            return;
        }

        // Validate that we have selected members
        try {
            console.log('[GroupDetail] Validating selected members');
            if (!this.selectedMemberObjects || this.selectedMemberObjects.length === 0) {
                console.log('[GroupDetail] No members selected');
                this.showToast('Error', 'No members selected for expense split. Please select at least one member.', 'error');
                return;
            }
            console.log('[GroupDetail] Selected members validation passed');
        } catch (error) {
            console.error('[GroupDetail] Error in selected members validation:', error);
            console.log('[GroupDetail] Error details:', JSON.stringify(error.message));
            this.showToast('Error', 'Error validating selected members: ' + error.message, 'error');
            this.isLoading = false;
            return;
        }

        // Validate expense form
        try {
            console.log('[GroupDetail] Validating expense form');
            if (!this.validateExpenseForm()) {
                console.log('[GroupDetail] Expense form validation failed');
                return;
            }
            console.log('[GroupDetail] Expense form validation passed');
        } catch (error) {
            console.error('[GroupDetail] Error in expense form validation:', error);
            console.log('[GroupDetail] Error details:', JSON.stringify(error.message));
            this.showToast('Error', 'Error validating expense form: ' + error.message, 'error');
            this.isLoading = false;
            return;
        }

        this.isLoading = true;

        // Prepare splits for selected members
        let splits;
        try {
            console.log('[GroupDetail] Preparing splits for selected members');
            splits = this.selectedMemberObjects.map(member => {
                console.log('[GroupDetail] Processing member:', JSON.stringify(member));
                const split = {
                    playerId: member.value
                };

                if (this.isUnequalSplit) {
                    console.log('[GroupDetail] Unequal split for member:', member.label);
                    split.amount = parseFloat(member.splitAmount) || 0;
                } else if (this.isPercentageSplit) {
                    console.log('[GroupDetail] Percentage split for member:', member.label);
                    split.percentage = parseFloat(member.splitPercentage) || 0;
                    split.amount = (parseFloat(member.splitPercentage) || 0) * this.expenseForm.amount / 100;
                } else {
                    console.log('[GroupDetail] Equal split for member:', member.label);
                    split.amount = parseFloat(this.expenseForm.amount) / this.selectedMemberObjects.length;
                }

                console.log('[GroupDetail] Created split for member:', member.label, 'split:', JSON.stringify(split));
                return split;
            });
            console.log('[GroupDetail] Splits prepared:', JSON.stringify(splits));
        } catch (error) {
            console.error('[GroupDetail] Error preparing splits:', error);
            console.log('[GroupDetail] Error details:', JSON.stringify(error.message));
            this.showToast('Error', 'Error preparing splits: ' + error.message, 'error');
            this.isLoading = false;
            return;
        }

        // Prepare expense data
        let expenseData;
        try {
            console.log('[GroupDetail] Preparing expense data');
            expenseData = {
                ...this.expenseForm,
                amount: parseFloat(this.expenseForm.amount), // Convert amount to number
                groupId: this.groupId
            };
            console.log('[GroupDetail] Expense data prepared:', JSON.stringify(expenseData));
        } catch (error) {
            console.error('[GroupDetail] Error preparing expense data:', error);
            console.log('[GroupDetail] Error details:', JSON.stringify(error.message));
            this.showToast('Error', 'Error preparing expense data: ' + error.message, 'error');
            this.isLoading = false;
            return;
        }

        // Prepare request data
        let requestData;
        try {
            console.log('[GroupDetail] Preparing request data');
            requestData = {
                groupId: this.groupId,
                sessionToken: this.sessionToken,
                expenseData: expenseData,
                splits: splits
            };
            console.log('[GroupDetail] Request data prepared:', JSON.stringify(requestData));
        } catch (error) {
            console.error('[GroupDetail] Error preparing request data:', error);
            console.log('[GroupDetail] Error details:', JSON.stringify(error.message));
            this.showToast('Error', 'Error preparing request data: ' + error.message, 'error');
            this.isLoading = false;
            return;
        }

        // Call backend to process expense creation
        try {
            console.log('[GroupDetail] Calling processExpenseCreation with request data');
            // Serialize the request data as JSON string to avoid serialization issues
            const requestDataJson = JSON.stringify(requestData);
            console.log('[GroupDetail] Serialized request data:', requestDataJson);
            const result = await processExpenseCreation({ requestDataJson: requestDataJson });
            console.log('[GroupDetail] Backend response:', result);

            let response;
            try {
                response = JSON.parse(result);
            } catch (parseError) {
                console.error('[GroupDetail] Error parsing backend response:', parseError);
                throw new Error('Invalid response format from server');
            }
            console.log('[GroupDetail] Parsed response:', JSON.stringify(response));

            if (response.success) {
                console.log('[GroupDetail] Expense added successfully');
                this.showToast('Success', 'Expense added successfully', 'success');
                this.closeExpenseModal();
                this.refreshData();
            } else {
                console.log('[GroupDetail] Backend returned failure:', response.message);
                this.showToast('Error', response.message || 'Failed to add expense', 'error');
            }
        } catch (error) {
            console.error('[GroupDetail] Error in processExpenseCreation:', error);
            console.log('[GroupDetail] Error details:', JSON.stringify({
                message: error.message,
                body: error.body,
                stack: error.stack
            }));
            this.showToast('Error', 'Failed to add expense: ' + error.message, 'error');
        }

        console.log('[GroupDetail] Setting isLoading to false');
        this.isLoading = false;
    }

    async handleSaveExpenseChanges() {
        if (!this.validateEditExpenseForm()) {
            return;
        }
        this.isLoading = true;
        try {
            // Prepare Expense__c and Expense_Split__c objects
            const expense = {
                Id: this.selectedExpense.id,
                Name: this.editExpenseForm.name,
                Amount__c: this.editExpenseForm.amount,
                Category__c: this.editExpenseForm.category,
                Date__c: this.editExpenseForm.date,
                Notes__c: this.editExpenseForm.notes,
                Split_Method__c: this.editExpenseForm.splitMethod,
                Location__c: this.editExpenseForm.location || '',
                Paid_By__c: this.editExpenseForm.paidBy
            };
            const splits = this.editSelectedMemberObjects.map(member => {
                const split = {
                    Expense__c: this.selectedExpense.id,
                    Player__c: member.value,
                    Amount__c: this.isEditUnequalSplit ? parseFloat(member.splitAmount) || 0 : (this.isEditPercentageSplit ? ((parseFloat(member.splitPercentage) || 0) * this.editExpenseForm.amount / 100) : (this.editExpenseForm.amount / this.editSelectedMemberObjects.length)),
                    Percentage__c: this.isEditPercentageSplit ? parseFloat(member.splitPercentage) || 0 : null,
                    Shares__c: null, // Add logic if you support shares
                    Is_Paid__c: member.value === this.editExpenseForm.paidBy
                };
                return split;
            });
            await updateExpense({ expense, splits });
            this.showToast('Success', 'Expense updated successfully', 'success');
            this.closeExpenseDetailsModal();
            await this.refreshData();
        } catch (error) {
            this.showToast('Error', 'Failed to update expense: ' + (error.body?.message || error.message), 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async handleRemoveExpense(event) {
        const expenseId = event.target.dataset.expenseId;
        
        if (!confirm('Are you sure you want to remove this expense?')) {
            return;
        }

        this.isLoading = true;
        try {
            const result = await removeExpense({
                sessionToken: this.sessionToken,
                expenseId: expenseId
            });

            const response = JSON.parse(result);
            if (response.success) {
                this.showToast('Success', 'Expense removed successfully', 'success');
                this.refreshData();
            } else {
                this.showToast('Error', response.message, 'error');
            }
        } catch (error) {
            this.showToast('Error', 'Failed to remove expense', 'error');
        }
        this.isLoading = false;
    }

    // Settlement Operations
    async handleCreateSettlement() {
        if (!this.validateSettlementForm()) {
            return;
        }

        this.isLoading = true;
        try {
            const settlementData = {
                ...this.settlementForm,
                groupId: this.groupId
            };

            console.log('[GroupDetail] handleCreateSettlement: sending', settlementData);
            const result = await createSettlement({
                sessionToken: this.sessionToken,
                settlementData: JSON.stringify(settlementData)
            });

            const response = JSON.parse(result);
            console.log('[GroupDetail] handleCreateSettlement: response', response);
            if (response.success) {
                this.showToast('Success', 'Settlement created successfully', 'success');
                this.closeSettlementModal();
                this.selectedTab = 'balances';
                await this.refreshData();
                console.log('[GroupDetail] handleCreateSettlement: refreshData called');
                
                // Dispatch event to notify other components
                this.dispatchSettlementEvent('settlementCreated', { groupId: this.groupId });
            } else {
                this.showToast('Error', response.message, 'error');
            }
        } catch (error) {
            this.showToast('Error', 'Failed to create settlement', 'error');
            console.error('[GroupDetail] handleCreateSettlement: error', error);
        }
        this.isLoading = false;
    }

    async handleConfirmSettlement(event) {
        const settlementId = event.target.dataset.settlementId;
        this.isLoading = true;
        try {
            const result = await confirmSettlement({
                sessionToken: this.sessionToken,
                settlementId: settlementId
            });

            const response = JSON.parse(result);
            if (response.success) {
                this.showToast('Success', 'Settlement confirmed', 'success');
                this.selectedTab = 'balances';
                await this.refreshData();
                
                // Dispatch event to notify other components
                this.dispatchSettlementEvent('settlementConfirmed', { 
                    groupId: this.groupId,
                    settlementId: settlementId 
                });
            } else {
                this.showToast('Error', response.message, 'error');
            }
        } catch (error) {
            this.showToast('Error', 'Failed to confirm settlement', 'error');
        }
        this.isLoading = false;
    }

    // Validation
    validateExpenseForm() {
        if (!this.expenseForm.name.trim()) {
            this.showToast('Error', 'Please enter expense name', 'error');
            return false;
        }
        if (this.expenseForm.amount <= 0) {
            this.showToast('Error', 'Please enter a valid amount', 'error');
            return false;
        }
        if (this.expenseForm.selectedMembers.length === 0) {
            this.showToast('Error', 'Please select at least one member', 'error');
            return false;
        }
        if (!this.expenseForm.paidBy) {
            this.showToast('Error', 'Please select who paid for this expense', 'error');
            return false;
        }
        return true;
    }

    validateSettlementForm() {
        if (!this.settlementForm.fromPlayer) {
            this.showToast('Error', 'Please select who is paying', 'error');
            return false;
        }
        if (!this.settlementForm.toPlayer) {
            this.showToast('Error', 'Please select who is receiving', 'error');
            return false;
        }
        if (this.settlementForm.amount <= 0) {
            this.showToast('Error', 'Please enter a valid amount', 'error');
            return false;
        }
        if (this.settlementForm.fromPlayer === this.settlementForm.toPlayer) {
            this.showToast('Error', 'From and To players cannot be the same', 'error');
            return false;
        }
        return true;
    }

    validateEditExpenseForm() {
        if (!this.editExpenseForm.name.trim()) {
            this.showToast('Error', 'Please enter expense name', 'error');
            return false;
        }
        if (this.editExpenseForm.amount <= 0) {
            this.showToast('Error', 'Please enter a valid amount', 'error');
            return false;
        }
        if (this.editExpenseForm.selectedMembers.length === 0) {
            this.showToast('Error', 'Please select at least one member', 'error');
            return false;
        }
        if (!this.editExpenseForm.paidBy) {
            this.showToast('Error', 'Please select who paid for this expense', 'error');
            return false;
        }
        return true;
    }

    // Utility Methods
    resetExpenseForm() {
        console.log('[GroupDetail] resetExpenseForm called');
        console.log('[GroupDetail] resetExpenseForm - this.members:', this.members);
        console.log('[GroupDetail] resetExpenseForm - this.members.length:', this.members ? this.members.length : 'undefined');
        
        // Pre-select all members by default
        const allMemberIds = (this.members || []).map(member => member.Player__c || member.playerId);
        
        console.log('[GroupDetail] resetExpenseForm - allMemberIds:', allMemberIds);
        
        this.expenseForm = {
            name: '',
            amount: 0,
            category: 'Food',
            date: new Date().toISOString().split('T')[0],
            notes: '',
            splitMethod: 'Equal',
            selectedMembers: allMemberIds, // Pre-select all members
            paidBy: ''
        };
        
        console.log('[GroupDetail] resetExpenseForm - expenseForm.selectedMembers:', this.expenseForm.selectedMembers);
    }

    resetSettlementForm() {
        this.settlementForm = {
            fromPlayer: '',
            toPlayer: '',
            amount: 0,
            paymentMethod: 'Cash',
            notes: ''
        };
    }

    refreshData() {
        console.log('[GroupDetail] refreshData called');
        return this.loadData();
    }

    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }

    formatCurrency(amount) {
        try {
            if (amount === null || amount === undefined) {
                return '$0.00';
            }
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: this.groupData.currency || 'USD'
            }).format(amount);
        } catch (error) {
            console.error('[GroupDetail] Error formatting currency:', error);
            return '$0.00';
        }
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString();
    }

    getBalanceClass(balance) {
        if (balance > 0) return 'slds-text-color_success';
        if (balance < 0) return 'slds-text-color_error';
        return 'slds-text-color_default';
    }

    getCategoryIcon(category) {
        const icons = {
            'Food': 'utility:food_and_drink',
            'Transport': 'utility:travel_and_places',
            'Accommodation': 'utility:home',
            'Entertainment': 'utility:event',
            'Utilities': 'utility:settings',
            'Other': 'utility:apps'
        };
        return icons[category] || 'utility:apps';
    }

    // Navigation Methods
    navigateToExpenseManagement() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: `/expensemanagement?groupId=${this.groupId}`
            }
        });
    }

    navigateToSettlementManagement() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: `/settlementmanagement?groupId=${this.groupId}`
            }
        });
    }

    navigateToGroupManagement() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/groupmanagementpage'
            }
        });
    }

    navigateToMainDashboard() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/maindashboardpage'
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

    get isUnequalSplit() {
        return this.expenseForm.splitMethod === 'Unequal';
    }
    get isPercentageSplit() {
        return this.expenseForm.splitMethod === 'Percentage';
    }
    get isEditUnequalSplit() {
        return this.editExpenseForm.splitMethod === 'Unequal';
    }
    get isEditPercentageSplit() {
        return this.editExpenseForm.splitMethod === 'Percentage';
    }
    get selectedMemberObjects() {
        console.log('[GroupDetail] selectedMemberObjects getter called');
        console.log('[GroupDetail] members:', this.members);
        console.log('[GroupDetail] expenseForm.selectedMembers:', this.expenseForm.selectedMembers);
        
        // If no members are explicitly selected, return all members
        const selectedMemberIds = this.expenseForm.selectedMembers || [];
        const membersToUse = selectedMemberIds.length > 0 ? selectedMemberIds : 
            (this.members || []).map(member => member.Player__c || member.playerId);
        
        console.log('[GroupDetail] selectedMemberIds:', selectedMemberIds);
        console.log('[GroupDetail] membersToUse:', membersToUse);
        console.log('[GroupDetail] this.members.length:', this.members ? this.members.length : 'undefined');
        console.log('[GroupDetail] this.members type:', typeof this.members);
        console.log('[GroupDetail] this.members constructor:', this.members ? this.members.constructor.name : 'undefined');
        
        // Debug the filter operation
        const filteredMembers = (this.members || []).filter(member => {
            const memberId = member.Player__c || member.playerId;
            const isIncluded = membersToUse.includes(memberId);
            console.log('[GroupDetail] Filtering member:', member, 'memberId:', memberId, 'isIncluded:', isIncluded);
            return isIncluded;
        });
        
        console.log('[GroupDetail] filteredMembers:', filteredMembers);
        console.log('[GroupDetail] filteredMembers.length:', filteredMembers.length);
        
        // Return objects for selected members with split values
        const selectedMembers = filteredMembers.map(member => {
            const id = member.Player__c || member.playerId;
            const result = {
                label: member.Player__r ? member.Player__r.Name : member.name || member.nickname || 'Member',
                value: id,
                splitAmount: this.expenseForm[`splitAmount_${id}`] || '',
                splitPercentage: this.expenseForm[`splitPercentage_${id}`] || ''
            };
            console.log('[GroupDetail] Mapped member:', member, 'to result:', result);
            return result;
        });
        
        console.log('[GroupDetail] selectedMemberObjects result:', selectedMembers);
        console.log('[GroupDetail] selectedMemberObjects result length:', selectedMembers.length);
        console.log('[GroupDetail] selectedMemberObjects result content:', JSON.stringify(selectedMembers, null, 2));
        return selectedMembers;
    }
    get editSelectedMemberObjects() {
        console.log('[GroupDetail] editSelectedMemberObjects getter called');
        console.log('[GroupDetail] members:', this.members);
        console.log('[GroupDetail] editExpenseForm.selectedMembers:', this.editExpenseForm.selectedMembers);
        
        // Return objects for selected members with split values for edit form
        const selectedMembers = (this.members || [])
            .filter(member => (this.editExpenseForm.selectedMembers || []).includes(member.Player__c || member.playerId))
            .map(member => {
                const id = member.Player__c || member.playerId;
                return {
                    label: member.Player__r ? member.Player__r.Name : member.name || member.nickname || 'Member',
                    value: id,
                    splitAmount: this.editExpenseForm[`splitAmount_${id}`] || '',
                    splitPercentage: this.editExpenseForm[`splitPercentage_${id}`] || ''
                };
            });
        
        console.log('[GroupDetail] editSelectedMemberObjects result:', selectedMembers);
        return selectedMembers;
    }
    get splitAmountSum() {
        return this.selectedMemberObjects.reduce((sum, m) => sum + (parseFloat(m.splitAmount) || 0), 0);
    }
    get splitPercentageSum() {
        return this.selectedMemberObjects.reduce((sum, m) => sum + (parseFloat(m.splitPercentage) || 0), 0);
    }
    get editSplitAmountSum() {
        return this.editSelectedMemberObjects.reduce((sum, m) => sum + (parseFloat(m.splitAmount) || 0), 0);
    }
    get editSplitPercentageSum() {
        return this.editSelectedMemberObjects.reduce((sum, m) => sum + (parseFloat(m.splitPercentage) || 0), 0);
    }
    handleCustomSplitChange(event) {
        const memberId = event.target.dataset.memberId;
        const field = event.target.dataset.field;
        const value = event.target.value;
        this.expenseForm = {
            ...this.expenseForm,
            [`${field}_${memberId}`]: value
        };
    }

    get formattedBalances() {
        return (this.balances || []).map(balance => ({
            ...balance,
            formattedTotalPaid: this.formatCurrency(balance.totalPaid || 0),
            formattedTotalOwed: this.formatCurrency(balance.totalOwed || 0),
            formattedNetBalance: this.formatCurrency(balance.netBalance || 0),
            balanceClass: this.getBalanceClass(balance.netBalance || 0)
        }));
    }

    get balancesJson() {
        return JSON.stringify(this.balances, null, 2);
    }

    get formattedSettlementSummary() {
        if (!this.settlementSummary) return {};
        
        return {
            ...this.settlementSummary,
            formattedTotalDebt: this.formatCurrency(this.settlementSummary.totalDebt || 0),
            formattedTotalCredit: this.formatCurrency(this.settlementSummary.totalCredit || 0),
            formattedCreditors: (this.settlementSummary.creditors || []).map(creditor => ({
                ...creditor,
                formattedAmount: this.formatCurrency(creditor.amount || 0)
            })),
            formattedDebtors: (this.settlementSummary.debtors || []).map(debtor => ({
                ...debtor,
                formattedAmount: this.formatCurrency(debtor.amount || 0)
            }))
        };
    }

    get formattedOutstandingBalances() {
        return (this.outstandingBalances || []).map(balance => ({
            ...balance,
            formattedTotalPaid: this.formatCurrency(balance.totalPaid || 0),
            formattedTotalOwed: this.formatCurrency(balance.totalOwed || 0),
            formattedOutstandingBalance: this.formatCurrency(balance.outstandingBalance || 0),
            status: {
                owed: balance.status === 'owed',
                owes: balance.status === 'owes',
                settled: balance.status === 'settled'
            }
        }));
    }

    async fetchOutstandingBalances() {
        try {
            const result = await getOutstandingBalances({
                sessionToken: this.sessionToken,
                groupId: this.groupId
            });
            
            this.outstandingBalances = JSON.parse(result);
        } catch (e) {
            console.error('Error fetching outstanding balances:', e);
        }
    }

    async fetchOptimalSettlements() {
        this.isLoading = true;
        try {
            // First fetch outstanding balances
            await this.fetchOutstandingBalances();
            
            const result = await getOptimalSettlements({
                sessionToken: this.sessionToken,
                groupId: this.groupId
            });
            
            const response = JSON.parse(result);
            this.suggestedSettlements = response.settlements || [];
            this.settlementSummary = {
                totalSettlements: response.totalSettlements || 0,
                totalDebt: response.totalDebt || 0,
                totalCredit: response.totalCredit || 0,
                isBalanced: response.isBalanced || false,
                creditors: response.creditors || [],
                debtors: response.debtors || []
            };
            this.showSuggestions = true;
        } catch (e) {
            this.showToast('Error', 'Failed to fetch suggested settlements', 'error');
            console.error('Error fetching optimal settlements:', e);
        }
        this.isLoading = false;
    }

    hideSuggestions() {
        this.showSuggestions = false;
    }

    getPlayerNameById(playerId) {
        const member = this.members.find(m => (m.Player__c || m.playerId) === playerId);
        return member ? (member.Player__r ? member.Player__r.Name : member.name || member.nickname || 'Unknown Player') : 'Unknown Player';
    }

    // Handle settlement actions from other components
    handleSettlementAction(event) {
        const { type, groupId } = event.detail;
        
        console.log('[GroupDetail] Settlement action received:', type, 'for group:', groupId, 'current groupId:', this.groupId);
        
        // Only refresh if the event is for this group
        if (groupId === this.groupId) {
            console.log('[GroupDetail] Settlement action matches current group, refreshing data...');
            
            // Refresh data based on the action type
            switch (type) {
                case 'settlementCreated':
                case 'settlementConfirmed':
                case 'settlementCancelled':
                    console.log('[GroupDetail] Refreshing data due to settlement action:', type);
                    this.refreshData();
                    break;
                default:
                    console.log('[GroupDetail] Unknown settlement action type:', type);
            }
        } else {
            console.log('[GroupDetail] Settlement action groupId does not match current groupId, ignoring');
        }
    }

    // Helper method to dispatch settlement events
    dispatchSettlementEvent(eventType, data) {
        console.log('[GroupDetail] Dispatching settlement event:', eventType, 'for group:', this.groupId, 'data:', data);
        const event = new CustomEvent('settlementaction', {
            detail: {
                type: eventType,
                groupId: this.groupId,
                ...data
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
        console.log('[GroupDetail] Settlement event dispatched successfully');
    }
}