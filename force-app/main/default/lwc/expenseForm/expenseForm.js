import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import { refreshApex } from '@salesforce/apex';
// import addExpense from '@salesforce/apex/SettleUpController.addExpense';
import addExpenseV2 from '@salesforce/apex/SettleUpController.addExpenseV2';
import updateExpenseSimple from '@salesforce/apex/SettleUpController.updateExpenseSimple';
import getGroupMembers from '@salesforce/apex/SettleUpController.getGroupMembers';
import getExpenseDetailsV4 from '@salesforce/apex/SettleUpController.getExpenseDetailsV4';

export default class ExpenseForm extends NavigationMixin(LightningElement) {
    @api groupId;
    @api expenseId = null; // null for new expense, populated for edit
    @api sessionToken;
    @api currentPlayer;
    @api isModalOpen = false;

    @track expenseData = {
        name: '',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        category: '',
        notes: '',
        paidBy: '',
        splitMethod: 'Equal',
        location: ''
    };

    @track groupMembers = [];
    @track selectedMembers = [];
    @track customSplits = [];
    @track isLoading = false;
    @track errors = {};

    // Picklist options
    categoryOptions = [
        { label: 'Food & Dining', value: 'Food' },
        { label: 'Transportation', value: 'Transport' },
        { label: 'Accommodation', value: 'Accommodation' },
        { label: 'Entertainment', value: 'Entertainment' },
        { label: 'Utilities', value: 'Utilities' },
        { label: 'Shopping', value: 'Shopping' },
        { label: 'Other', value: 'Other' }
    ];

    splitMethodOptions = [
        { label: 'Split Equally', value: 'Equal' },
        { label: 'Unequal Amounts', value: 'Unequal' },
        { label: 'Percentages', value: 'Percentage' },
        { label: 'Shares', value: 'Shares' }
    ];

    // Wire method to get group members
    @wire(getGroupMembers, { groupId: '$groupId', sessionToken: '$sessionToken' })
    wiredGroupMembers(result) {
        this.membersWireResult = result;
        console.log('[ExpenseForm] wiredGroupMembers called. groupId:', this.groupId, 'sessionToken:', this.sessionToken);
        console.log('[ExpenseForm] wiredGroupMembers result:', result);
        if (result.data) {
            this.groupMembers = result.data.map(member => ({
                id: member.Player__c,
                name: member.Player__r.Name,
                nickname: member.Nickname__c || member.Player__r.Name,
                isSelected: false,
                splitAmount: 0,
                splitPercentage: 0,
                splitShares: 1
            }));
            console.log('[ExpenseForm] Loaded groupMembers:', this.groupMembers);
            // If editing, load expense details
            if (this.expenseId) {
                this.loadExpenseDetails();
            } else {
                // For new expense, select all members by default
                this.selectAllMembers();
            }
        } else if (result.error) {
            this.showToast('Error', 'Failed to load group members', 'error');
            console.error('[ExpenseForm] Error loading group members:', result.error);
        }
    }

    connectedCallback() {
        // Initialize form for new expense
        if (!this.expenseId) {
            this.expenseData.date = new Date().toISOString().split('T')[0];
        }
        // Don't call selectAllMembers here - wait for data to load
    }

    // Load expense details for editing
    async loadExpenseDetails() {
        try {
            this.isLoading = true;
            const result = await getExpenseDetailsV4(this.expenseId, this.sessionToken);
            
            if (result && result.success && result.expense) {
                const expenseDetails = result.expense;
                this.expenseData = {
                    name: expenseDetails.Name,
                    amount: expenseDetails.Amount__c,
                    date: expenseDetails.Date__c,
                    category: expenseDetails.Category__c,
                    notes: expenseDetails.Notes__c || '',
                    paidBy: expenseDetails.Paid_By__c,
                    splitMethod: expenseDetails.Split_Method__c,
                    location: expenseDetails.Location__c || ''
                };

                // Load existing splits
                this.loadExistingSplits(expenseDetails.Expense_Split__r);
            } else {
                const errorMessage = result && result.message ? result.message : 'Failed to load expense details';
                this.showToast('Error', errorMessage, 'error');
            }
        } catch (error) {
            console.error('Error loading expense details:', error);
            this.showToast('Error', 'Failed to load expense details: ' + error.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    loadExistingSplits(splits) {
        this.groupMembers = this.groupMembers.map(member => {
            const existingSplit = splits.find(split => split.Player__c === member.id);
            return {
                ...member,
                isSelected: !!existingSplit,
                splitAmount: existingSplit ? existingSplit.Amount__c : 0,
                splitPercentage: existingSplit ? existingSplit.Percentage__c : 0,
                splitShares: existingSplit ? existingSplit.Shares__c : 1
            };
        });
        this.updateSelectedMembers();
    }

    // Event handlers
    handleInputChange(event) {
        const field = event.target.dataset.field;
        let value = event.target.value;

        if (field === 'amount') {
            value = parseFloat(value) || 0;
        }

        this.expenseData = { ...this.expenseData, [field]: value };
        
        // Clear errors when user starts typing
        if (this.errors[field]) {
            this.errors = { ...this.errors, [field]: null };
        }

        // Recalculate splits if amount changes
        if (field === 'amount' && this.expenseData.splitMethod === 'Equal') {
            this.calculateEqualSplits();
        }
    }

    handleSplitMethodChange(event) {
        this.expenseData.splitMethod = event.target.value;
        console.log('[ExpenseForm] Split method changed to:', this.expenseData.splitMethod);
        this.calculateSplits();
    }

    handleMemberSelection(event) {
        const memberId = event.target.dataset.memberId;
        const isChecked = event.target.checked;

        this.groupMembers = this.groupMembers.map(member => {
            if (member.id === memberId) {
                return { ...member, isSelected: isChecked };
            }
            return member;
        });

        this.updateSelectedMembers();
        this.calculateSplits();
    }

    handleCustomSplitChange(event) {
        const memberId = event.target.dataset.memberId;
        const field = event.target.dataset.field;
        const value = parseFloat(event.target.value) || 0;

        this.groupMembers = this.groupMembers.map(member => {
            if (member.id === memberId) {
                return { ...member, [field]: value };
            }
            return member;
        });

        this.validateCustomSplits();
    }

    selectAllMembers() {
        if (!this.groupMembers || this.groupMembers.length === 0) {
            console.log('[ExpenseForm] selectAllMembers: No group members available yet');
            return;
        }
        this.groupMembers = this.groupMembers.map(member => ({
            ...member,
            isSelected: true
        }));
        this.updateSelectedMembers();
        this.calculateSplits();
    }

    selectNoneMembers() {
        if (!this.groupMembers || this.groupMembers.length === 0) {
            console.log('[ExpenseForm] selectNoneMembers: No group members available yet');
            return;
        }
        this.groupMembers = this.groupMembers.map(member => ({
            ...member,
            isSelected: false
        }));
        this.updateSelectedMembers();
    }

    updateSelectedMembers() {
        if (!this.groupMembers) {
            this.selectedMembers = [];
            return;
        }
        this.selectedMembers = this.groupMembers.filter(member => member && member.isSelected);
    }

    calculateSplits() {
        if (!this.selectedMembers || this.selectedMembers.length === 0) {
            console.log('[ExpenseForm] calculateSplits: No selected members');
            return;
        }
        
        switch (this.expenseData.splitMethod) {
            case 'Equal':
                this.calculateEqualSplits();
                break;
            case 'Percentage':
                this.calculatePercentageSplits();
                break;
            case 'Shares':
                this.calculateShareSplits();
                break;
            default:
                break;
        }
    }

    calculateEqualSplits() {
        const selectedCount = this.selectedMembers.length;
        if (selectedCount === 0) return;

        const splitAmount = this.expenseData.amount / selectedCount;
        const splitPercentage = 100 / selectedCount;

        this.groupMembers = this.groupMembers.map(member => {
            if (member && member.isSelected) {
                return {
                    ...member,
                    splitAmount: Math.round(splitAmount * 100) / 100,
                    splitPercentage: Math.round(splitPercentage * 100) / 100
                };
            }
            return member;
        });
    }

    calculatePercentageSplits() {
        this.groupMembers = this.groupMembers.map(member => {
            if (member && member.isSelected) {
                const amount = (this.expenseData.amount * member.splitPercentage) / 100;
                return {
                    ...member,
                    splitAmount: Math.round(amount * 100) / 100
                };
            }
            return member;
        });
    }

    calculateShareSplits() {
        const totalShares = this.selectedMembers.reduce((sum, member) => sum + (member ? member.splitShares : 0), 0);
        if (totalShares === 0) return;

        this.groupMembers = this.groupMembers.map(member => {
            if (member && member.isSelected) {
                const amount = (this.expenseData.amount * member.splitShares) / totalShares;
                const percentage = (member.splitShares / totalShares) * 100;
                return {
                    ...member,
                    splitAmount: Math.round(amount * 100) / 100,
                    splitPercentage: Math.round(percentage * 100) / 100
                };
            }
            return member;
        });
    }

    validateForm() {
        const errors = {};

        if (!this.expenseData.name || !this.expenseData.name.trim()) {
            errors.name = 'Expense description is required';
        }

        if (!this.expenseData.amount || this.expenseData.amount <= 0) {
            errors.amount = 'Amount must be greater than 0';
        }

        if (!this.expenseData.paidBy) {
            errors.paidBy = 'Please select who paid for this expense';
        }

        if (!this.expenseData.category) {
            errors.category = 'Please select a category';
        }

        if (!this.selectedMembers || this.selectedMembers.length === 0) {
            errors.members = 'Please select at least one member to split with';
        }

        // Validate custom splits
        if (this.expenseData.splitMethod !== 'Equal') {
            const splitErrors = this.validateCustomSplits();
            if (splitErrors.length > 0) {
                errors.splits = splitErrors.join(', ');
            }
        }

        this.errors = errors;
        return Object.keys(errors).length === 0;
    }

    validateCustomSplits() {
        const errors = [];
        if (!this.selectedMembers || this.selectedMembers.length === 0) {
            return errors;
        }
        
        const totalAmount = this.selectedMembers.reduce((sum, member) => sum + (member ? member.splitAmount : 0), 0);
        const totalPercentage = this.selectedMembers.reduce((sum, member) => sum + (member ? member.splitPercentage : 0), 0);

        if (this.expenseData.splitMethod === 'Percentage') {
            if (Math.abs(totalPercentage - 100) > 0.01) {
                errors.push('Percentages must add up to 100%');
            }
        } else if (this.expenseData.splitMethod === 'Unequal') {
            if (Math.abs(totalAmount - this.expenseData.amount) > 0.01) {
                errors.push('Split amounts must add up to total expense amount');
            }
        }

        return errors;
    }

    async handleSave() {
        console.log('[ExpenseForm] handleSave called');
        console.log('[ExpenseForm] groupId:', this.groupId);
        console.log('[ExpenseForm] paidBy:', this.expenseData.paidBy);
        console.log('[ExpenseForm] selectedMembers:', this.selectedMembers);
        console.log('[ExpenseForm] expenseData:', this.expenseData);
        console.log('[ExpenseForm] groupMembers:', this.groupMembers);

        // Defensive checks for required fields
        if (!this.groupId) {
            this.showToast('Error', 'Group ID is missing.', 'error');
            return;
        }
        if (!this.sessionToken) {
            this.showToast('Error', 'Session token is missing.', 'error');
            return;
        }
        if (!this.expenseData || typeof this.expenseData !== 'object') {
            this.showToast('Error', 'Expense data is missing or invalid.', 'error');
            return;
        }
        if (!this.selectedMembers || this.selectedMembers.length === 0) {
            this.showToast('Error', 'No members selected for split.', 'error');
            return;
        }
        if (!this.expenseData.paidBy || this.expenseData.paidBy === 'undefined') {
            this.showToast('Error', 'Group or Paid By is missing or invalid. Please select a payer and try again.', 'error');
            return;
        }
        if (!this.validateForm()) {
            this.showToast('Error', 'Please fix the errors before saving', 'error');
            return;
        }

        try {
            this.isLoading = true;

            // Validate selectedMembers before creating payload
            const validMembers = this.selectedMembers.filter(member => {
                if (!member) {
                    console.error('[ExpenseForm] Found null member in selectedMembers');
                    return false;
                }
                if (!member.id) {
                    console.error('[ExpenseForm] Found member without id:', member);
                    return false;
                }
                return true;
            });

            if (validMembers.length === 0) {
                this.showToast('Error', 'No valid members found for expense split.', 'error');
                return;
            }

            const expensePayload = {
                groupId: this.groupId,
                sessionToken: this.sessionToken,
                expenseData: JSON.stringify(this.expenseData),
                splits: JSON.stringify(validMembers.map(member => ({
                    playerId: member.id,
                    amount: this.expenseData.splitMethod === 'Equal' ? this.expenseData.amount / validMembers.length : member.splitAmount,
                    percentage: this.expenseData.splitMethod === 'Percentage' ? member.splitPercentage : null,
                    shares: this.expenseData.splitMethod === 'Shares' ? member.splitShares : null
                })))
            };

            // Log all payload inputs
            console.log('About to call addExpenseV2 with:');
            console.log('groupId:', this.groupId);
            console.log('sessionToken:', this.sessionToken);
            console.log('expenseData:', this.expenseData);
            console.log('selectedMembers:', this.selectedMembers);
            console.log('expensePayload:', expensePayload);

            // Fail-safe: Prevent null payload
            if (!expensePayload || typeof expensePayload !== 'object') {
                this.showToast('Error', 'Expense payload is not being built correctly in JS.', 'error');
                return;
            }

            let result;
            if (this.expenseId) {
                expensePayload.expenseId = this.expenseId;
                const splits = validMembers.map(member => ({
                    playerId: member.id,
                    amount: this.expenseData.splitMethod === 'Equal' ? this.expenseData.amount / validMembers.length : member.splitAmount,
                    percentage: this.expenseData.splitMethod === 'Percentage' ? member.splitPercentage : null,
                    shares: this.expenseData.splitMethod === 'Shares' ? member.splitShares : null
                }));
                
                result = await updateExpenseSimple(
                    this.sessionToken,
                    this.expenseId,
                    JSON.stringify(this.expenseData),
                    JSON.stringify(splits),
                    this.groupId
                );
            } else {
                result = await addExpenseV2(expensePayload);
            }

            console.log('[ExpenseForm] Backend result:', result);

            if (result.success) {
                this.showToast(
                    'Success',
                    this.expenseId ? 'Expense updated successfully' : 'Expense added successfully',
                    'success'
                );
                this.handleCancel();
                this.dispatchEvent(new CustomEvent('expensesaved', {
                    detail: { expenseId: result.expenseId }
                }));
            } else {
                this.showToast('Error', result.message || 'Failed to save expense', 'error');
            }
        } catch (error) {
            console.error('[ExpenseForm] Error in handleSave:', error);
            console.error('[ExpenseForm] Error stack:', error.stack);
            this.showToast('Error', 'Error adding expense: ' + error.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleCancel() {
        this.resetForm();
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    resetForm() {
        this.expenseData = {
            name: '',
            amount: 0,
            date: new Date().toISOString().split('T')[0],
            category: '',
            notes: '',
            paidBy: '',
            splitMethod: 'Equal',
            location: ''
        };
        this.errors = {};
        // Only call selectAllMembers if groupMembers are already loaded
        if (this.groupMembers && this.groupMembers.length > 0) {
            this.selectAllMembers();
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({
            title,
            message,
            variant
        }));
    }

    // Getters for template
    get isEqualSplit() {
        return this.expenseData.splitMethod === 'Equal';
    }

    get isUnequalSplit() {
        return this.expenseData.splitMethod === 'Unequal';
    }

    get isPercentageSplit() {
        return this.expenseData.splitMethod === 'Percentage';
    }

    get isSharesSplit() {
        return this.expenseData.splitMethod === 'Shares';
    }

    get totalSplitAmount() {
        if (!this.selectedMembers) return 0;
        return this.selectedMembers.reduce((sum, member) => sum + (member ? member.splitAmount : 0), 0);
    }

    get totalSplitPercentage() {
        if (!this.selectedMembers) return 0;
        return this.selectedMembers.reduce((sum, member) => sum + (member ? member.splitPercentage : 0), 0);
    }

    get remainingAmount() {
        return this.expenseData.amount - this.totalSplitAmount;
    }

    get memberOptions() {
        if (!this.groupMembers) return [];
        return this.groupMembers.map(member => ({
            label: member ? member.nickname : '',
            value: member ? member.id : ''
        })).filter(option => option.value);
    }

    get modalTitle() {
        return this.expenseId ? 'Edit Expense' : 'Add New Expense';
    }

    get saveButtonLabel() {
        return this.expenseId ? 'Update Expense' : 'Add Expense';
    }

    get paidByOptions() {
        if (!this.groupMembers) return [];
        return this.groupMembers.map(member => ({
            label: member ? member.nickname : '',
            value: member ? member.id : ''
        })).filter(option => option.value);
    }

    // Navigation Methods
    navigateToGroupDetails() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: `/groupdetailspage?groupId=${this.groupId}`
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
}