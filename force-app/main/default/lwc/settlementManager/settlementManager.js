import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import getGroupSettlements from '@salesforce/apex/SettleUpController.getGroupSettlements';
import getOptimalSettlements from '@salesforce/apex/SettleUpController.getOptimalSettlements';
import createSettlement from '@salesforce/apex/SettleUpController.createSettlement';
import confirmSettlement from '@salesforce/apex/SettleUpController.confirmSettlement';
import cancelSettlement from '@salesforce/apex/SettleUpController.cancelSettlement';
import getGroupMembers from '@salesforce/apex/SettleUpController.getGroupMembers';

export default class SettlementManager extends NavigationMixin(LightningElement) {
    @api groupId;
    @api sessionToken;
    @api currentPlayerId;

    @track settlements = [];
    @track groupMembers = [];
    @track optimalSettlements = [];
    @track isLoading = false;
    @track showCreateModal = false;
    @track showConfirmModal = false;
    @track selectedSettlement = null;

    // Create settlement form data
    @track newSettlement = {
        fromPlayerId: '',
        toPlayerId: '',
        amount: 0,
        notes: '',
        paymentMethod: 'Cash',
        referenceNumber: ''
    };

    // Payment method options
    paymentMethodOptions = [
        { label: 'Cash', value: 'Cash' },
        { label: 'Bank Transfer', value: 'Bank Transfer' },
        { label: 'UPI', value: 'UPI' },
        { label: 'PayPal', value: 'PayPal' },
        { label: 'Venmo', value: 'Venmo' },
        { label: 'Other', value: 'Other' }
    ];

    connectedCallback() {
        this.loadData();
    }

    async loadData() {
        this.isLoading = true;
        try {
            // Load settlements
            const settlementsResult = await getGroupSettlements({
                sessionToken: this.sessionToken,
                groupId: this.groupId
            });
            this.settlements = JSON.parse(settlementsResult).map(settlement => ({
                ...settlement,
                statusVariant: this.getStatusVariant(settlement.Status__c),
                formattedAmount: this.formatCurrency(settlement.Amount__c),
                canConfirm: settlement.Status__c === 'Pending' && settlement.To_Player__c === this.currentPlayerId,
                canCancel: settlement.Status__c === 'Pending' && settlement.From_Player__c === this.currentPlayerId,
                isMySettlement: settlement.From_Player__c === this.currentPlayerId || settlement.To_Player__c === this.currentPlayerId
            }));

            // Load group members
            const membersResult = await getGroupMembers({
                sessionToken: this.sessionToken,
                groupId: this.groupId
            });
            this.groupMembers = JSON.parse(membersResult).map(member => ({
                ...member,
                isCurrentPlayer: member.Player__c === this.currentPlayerId
            }));

            // Load optimal settlements
            await this.loadOptimalSettlements();
        } catch (error) {
            this.showToast('Error', 'Failed to load data', 'error');
            console.error('Error loading data:', error);
        } finally {
            this.isLoading = false;
        }
    }

    handleCreateSettlement() {
        this.resetForm();
        this.showCreateModal = true;
    }

    handleOptimalSettlements() {
        this.loadOptimalSettlements();
    }

    handleCreateOptimalSettlement(event) {
        const settlement = event.target.dataset.settlement;
        const optimalData = JSON.parse(settlement);
        
        this.newSettlement = {
            fromPlayerId: optimalData.fromPlayerId,
            toPlayerId: optimalData.toPlayerId,
            amount: optimalData.amount,
            notes: `Optimal settlement - ${optimalData.description}`,
            paymentMethod: 'Cash',
            referenceNumber: ''
        };
        this.showCreateModal = true;
    }

    handleFormInput(event) {
        const field = event.target.dataset.field;
        this.newSettlement[field] = event.target.value;
    }

    handleSaveSettlement() {
        if (!this.validateForm()) {
            return;
        }

        this.isLoading = true;
        const settlementData = {
            groupId: this.groupId,
            fromPlayerId: this.newSettlement.fromPlayerId,
            toPlayerId: this.newSettlement.toPlayerId,
            amount: parseFloat(this.newSettlement.amount),
            notes: this.newSettlement.notes,
            paymentMethod: this.newSettlement.paymentMethod,
            referenceNumber: this.newSettlement.referenceNumber
        };

        createSettlement({ 
            sessionToken: this.sessionToken, 
            settlementData: JSON.stringify(settlementData) 
        })
        .then(result => {
            const response = JSON.parse(result);
            if (response.success) {
                this.showToast('Success', 'Settlement created successfully', 'success');
                this.showCreateModal = false;
                this.refreshData();
                // Dispatch event to notify other components
                this.dispatchSettlementEvent('settlementCreated', { groupId: this.groupId });
            } else {
                this.showToast('Error', response.message, 'error');
            }
        })
        .catch(error => {
            this.showToast('Error', 'Failed to create settlement', 'error');
            console.error(error);
        })
        .finally(() => {
            this.isLoading = false;
        });
    }

    handleConfirmSettlement(event) {
        const settlementId = event.target.dataset.id;
        this.selectedSettlement = this.settlements.find(s => s.Id === settlementId);
        this.showConfirmModal = true;
    }

    handleConfirmPayment() {
        this.isLoading = true;
        confirmSettlement({ 
            sessionToken: this.sessionToken, 
            settlementId: this.selectedSettlement.Id 
        })
        .then(result => {
            const response = JSON.parse(result);
            if (response.success) {
                this.showToast('Success', 'Settlement confirmed successfully', 'success');
                this.showConfirmModal = false;
                this.refreshData();
                // Dispatch event to notify other components
                this.dispatchSettlementEvent('settlementConfirmed', { 
                    groupId: this.groupId,
                    settlementId: this.selectedSettlement.Id 
                });
            } else {
                this.showToast('Error', response.message, 'error');
            }
        })
        .catch(error => {
            this.showToast('Error', 'Failed to confirm settlement', 'error');
            console.error(error);
        })
        .finally(() => {
            this.isLoading = false;
        });
    }

    handleCancelSettlement(event) {
        const settlementId = event.target.dataset.id;
        this.isLoading = true;
        
        cancelSettlement({ 
            sessionToken: this.sessionToken, 
            settlementId: settlementId 
        })
        .then(result => {
            const response = JSON.parse(result);
            if (response.success) {
                this.showToast('Success', 'Settlement cancelled successfully', 'success');
                this.refreshData();
                // Dispatch event to notify other components
                this.dispatchSettlementEvent('settlementCancelled', { 
                    groupId: this.groupId,
                    settlementId: settlementId 
                });
            } else {
                this.showToast('Error', response.message, 'error');
            }
        })
        .catch(error => {
            this.showToast('Error', 'Failed to cancel settlement', 'error');
            console.error(error);
        })
        .finally(() => {
            this.isLoading = false;
        });
    }

    handleCloseModal() {
        this.showCreateModal = false;
        this.showConfirmModal = false;
        this.selectedSettlement = null;
    }

    // Helper methods
    loadOptimalSettlements() {
        this.isLoading = true;
        getOptimalSettlements({ sessionToken: this.sessionToken, groupId: this.groupId })
        .then(result => {
            const response = JSON.parse(result);
            if (response.settlements) {
                this.optimalSettlements = response.settlements.map(settlement => ({
                    ...settlement,
                    formattedAmount: this.formatCurrency(settlement.amount),
                    fromPlayerName: this.getPlayerName(settlement.fromPlayerId),
                    toPlayerName: this.getPlayerName(settlement.toPlayerId),
                    settlementData: JSON.stringify(settlement),
                    description: settlement.description || `Settlement from ${this.getPlayerName(settlement.fromPlayerId)} to ${this.getPlayerName(settlement.toPlayerId)}`
                }));
            }
        })
        .catch(error => {
            console.error('Error loading optimal settlements:', error);
        })
        .finally(() => {
            this.isLoading = false;
        });
    }

    validateForm() {
        if (!this.newSettlement.fromPlayerId) {
            this.showToast('Error', 'Please select who is paying', 'error');
            return false;
        }
        if (!this.newSettlement.toPlayerId) {
            this.showToast('Error', 'Please select who is receiving', 'error');
            return false;
        }
        if (!this.newSettlement.amount || this.newSettlement.amount <= 0) {
            this.showToast('Error', 'Please enter a valid amount', 'error');
            return false;
        }
        return true;
    }

    resetForm() {
        this.newSettlement = {
            fromPlayerId: '',
            toPlayerId: '',
            amount: 0,
            notes: '',
            paymentMethod: 'Cash',
            referenceNumber: ''
        };
    }

    refreshData() {
        this.loadData();
    }

    getPlayerName(playerId) {
        const member = this.groupMembers.find(m => m.Player__c === playerId);
        return member ? (member.Nickname__c || member.Player__r.Name) : 'Unknown';
    }

    getStatusVariant(status) {
        switch (status) {
            case 'Pending': return 'warning';
            case 'Confirmed': return 'success';
            case 'Cancelled': return 'error';
            default: return 'neutral';
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({
            title,
            message,
            variant
        }));
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

    navigateToExpenseManagement() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: `/expensemanagement?groupId=${this.groupId}`
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

    // Computed properties
    get fromPlayerOptions() {
        return this.groupMembers.map(member => ({
            label: member.Nickname__c || member.Player__r.Name,
            value: member.Player__c
        }));
    }

    get toPlayerOptions() {
        return this.groupMembers
            .filter(member => member.Player__c !== this.newSettlement.fromPlayerId)
            .map(member => ({
                label: member.Nickname__c || member.Player__r.Name,
                value: member.Player__c
            }));
    }

    get pendingSettlements() {
        return this.settlements.filter(s => s.Status__c === 'Pending');
    }

    get confirmedSettlements() {
        return this.settlements.filter(s => s.Status__c === 'Confirmed');
    }

    get hasSettlements() {
        return this.settlements.length > 0;
    }

    get hasOptimalSettlements() {
        return this.optimalSettlements.length > 0;
    }

    // Helper method to dispatch settlement events
    dispatchSettlementEvent(eventType, data) {
        console.log('[SettlementManager] Dispatching settlement event:', eventType, 'for group:', this.groupId, 'data:', data);
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
        console.log('[SettlementManager] Settlement event dispatched successfully');
    }
}