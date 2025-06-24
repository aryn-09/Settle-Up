import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getMemberBalances from '@salesforce/apex/SettleUpController.getMemberBalances';
import getOptimalSettlements from '@salesforce/apex/SettleUpController.getOptimalSettlements';
import createSettlement from '@salesforce/apex/SettleUpController.createSettlement';
import confirmSettlement from '@salesforce/apex/SettleUpController.confirmSettlement';

export default class MemberBalances extends LightningElement {
    @api groupId;
    @api sessionToken;
    @api currentPlayerId;
    @api showHeader = false;
    @api compactView = false;
    
    @track members = [];
    @track settlements = [];
    @track isLoading = false;
    @track balanceFilter = 'all'; // all, owes, owed
    @track sortBy = 'name'; // name, balance, amount

    connectedCallback() {
        this.loadData();
        
        // Add event listener for settlement actions
        this.addEventListener('settlementaction', this.handleSettlementEvent.bind(this));
    }

    disconnectedCallback() {
        // Remove event listener
        this.removeEventListener('settlementaction', this.handleSettlementEvent.bind(this));
    }

    async loadData() {
        this.isLoading = true;
        try {
            // Load member balances
            const balancesResult = await getMemberBalances({
                sessionToken: this.sessionToken,
                groupId: this.groupId
            });
            this.members = this.processBalanceData(JSON.parse(balancesResult));

            // Load optimal settlements
            const settlementsResult = await getOptimalSettlements({
                sessionToken: this.sessionToken,
                groupId: this.groupId
            });
            this.settlements = JSON.parse(settlementsResult);
        } catch (error) {
            this.showToast('Error', 'Failed to load data', 'error');
            console.error('Error loading data:', error);
        } finally {
            this.isLoading = false;
        }
    }

    // Process and format balance data
    processBalanceData(rawData) {
        return rawData.map(member => {
            const netBalance = member.netBalance || 0;
            const totalPaid = member.totalPaid || 0;
            const totalOwed = member.totalOwed || 0;
            
            return {
                ...member,
                netBalance: netBalance,
                totalPaid: totalPaid,
                totalOwed: totalOwed,
                balanceType: netBalance > 0 ? 'owed' : netBalance < 0 ? 'owes' : 'settled',
                balanceAmount: Math.abs(netBalance),
                formattedBalance: this.formatCurrency(Math.abs(netBalance)),
                formattedPaid: this.formatCurrency(totalPaid),
                formattedOwed: this.formatCurrency(totalOwed),
                isCurrentPlayer: member.playerId === this.currentPlayerId,
                avatarUrl: member.avatarUrl || '/resource/default-avatar',
                statusColor: this.getStatusColor(netBalance)
            };
        });
    }

    // Getters for filtered and sorted data
    get filteredMembers() {
        let filtered = [...this.members];
        
        // Apply balance filter
        if (this.balanceFilter === 'owes') {
            filtered = filtered.filter(member => member.netBalance < 0);
        } else if (this.balanceFilter === 'owed') {
            filtered = filtered.filter(member => member.netBalance > 0);
        }
        
        // Apply sorting
        filtered.sort((a, b) => {
            switch (this.sortBy) {
                case 'balance':
                    return Math.abs(b.netBalance) - Math.abs(a.netBalance);
                case 'amount':
                    return b.totalPaid - a.totalPaid;
                default:
                    return a.name.localeCompare(b.name);
            }
        });
        
        return filtered;
    }

    get hasSettlements() {
        return this.settlements && this.settlements.length > 0;
    }

    get groupSummary() {
        const totalExpenses = this.members.reduce((sum, member) => sum + member.totalPaid, 0);
        const totalOutstanding = this.members
            .filter(member => member.netBalance < 0)
            .reduce((sum, member) => sum + Math.abs(member.netBalance), 0);
        
        return {
            totalExpenses: this.formatCurrency(totalExpenses),
            totalOutstanding: this.formatCurrency(totalOutstanding),
            memberCount: this.members.length
        };
    }

    // Filter options
    get filterOptions() {
        return [
            { label: 'All Members', value: 'all' },
            { label: 'Owes Money', value: 'owes' },
            { label: 'Owed Money', value: 'owed' }
        ];
    }

    // Sort options
    get sortOptions() {
        return [
            { label: 'Name', value: 'name' },
            { label: 'Balance Amount', value: 'balance' },
            { label: 'Total Paid', value: 'amount' }
        ];
    }

    // Event handlers
    handleFilterChange(event) {
        this.balanceFilter = event.detail.value;
    }

    handleSortChange(event) {
        this.sortBy = event.detail.value;
    }

    handleSettleUp(event) {
        const memberId = event.currentTarget.dataset.memberId;
        const member = this.members.find(m => m.id === memberId);
        
        if (member && member.netBalance < 0) {
            // Find who this member owes money to
            const owedMembers = this.members.filter(m => m.netBalance > 0);
            if (owedMembers.length === 1) {
                // Direct settlement
                this.createDirectSettlement(member, owedMembers[0]);
            } else {
                // Multiple creditors - show settlement options
                this.showSettlementOptions(member, owedMembers);
            }
        }
    }

    // Handle settlement actions from other components
    handleSettlementAction(event) {
        const action = event.detail.action;
        const settlementId = event.detail.settlementId;
        
        if (action === 'confirm') {
            this.confirmSettlementPayment(settlementId);
        } else if (action === 'cancel') {
            this.cancelSettlement(settlementId);
        } else if (action === 'create') {
            // Create settlement directly without modal
            const settlement = event.detail.settlement;
            this.createDirectSettlementFromSettlement(settlement);
        }
    }

    // Handle settlement events from other components
    handleSettlementEvent(event) {
        const { type, groupId } = event.detail;
        
        console.log('[MemberBalances] Settlement event received:', type, 'for group:', groupId, 'current groupId:', this.groupId);
        
        // Only refresh if the event is for this group
        if (groupId === this.groupId) {
            console.log('[MemberBalances] Settlement event matches current group, refreshing data...');
            
            // Refresh data based on the action type
            switch (type) {
                case 'settlementCreated':
                case 'settlementConfirmed':
                case 'settlementCancelled':
                    console.log('[MemberBalances] Refreshing data due to settlement event:', type);
                    this.loadData();
                    break;
                default:
                    console.log('[MemberBalances] Unknown settlement event type:', type);
            }
        } else {
            console.log('[MemberBalances] Settlement event groupId does not match current groupId, ignoring');
        }
    }

    // Settlement methods
    async createDirectSettlement(debtor, creditor) {
        this.isLoading = true;
        try {
            const settlementAmount = Math.min(Math.abs(debtor.netBalance), creditor.netBalance);
            const result = await createSettlement({
                sessionToken: this.sessionToken,
                groupId: this.groupId,
                fromPlayerId: debtor.playerId,
                toPlayerId: creditor.playerId,
                amount: settlementAmount,
                notes: `Settlement from ${debtor.name} to ${creditor.name}`
            });
            
            if (result.includes('success')) {
                this.showToast('Success', 'Settlement created successfully', 'success');
                this.loadData();
                
                // Dispatch event to notify other components
                this.dispatchSettlementEvent('settlementCreated', { groupId: this.groupId });
            } else {
                this.showToast('Error', 'Failed to create settlement', 'error');
            }
        } catch (error) {
            this.showToast('Error', error.body?.message || 'Failed to create settlement', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async confirmSettlementPayment(settlementId) {
        this.isLoading = true;
        try {
            const result = await confirmSettlement({
                sessionToken: this.sessionToken,
                settlementId: settlementId
            });
            
            if (result.includes('success')) {
                this.showToast('Success', 'Settlement confirmed', 'success');
                this.loadData();
                
                // Dispatch event to notify other components
                this.dispatchSettlementEvent('settlementConfirmed', { 
                    groupId: this.groupId,
                    settlementId: settlementId 
                });
            } else {
                this.showToast('Error', 'Failed to confirm settlement', 'error');
            }
        } catch (error) {
            this.showToast('Error', error.body?.message || 'Failed to confirm settlement', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async createDirectSettlementFromSettlement(settlement) {
        this.isLoading = true;
        try {
            const result = await createSettlement({
                sessionToken: this.sessionToken,
                groupId: this.groupId,
                fromPlayerId: settlement.fromPlayerId,
                toPlayerId: settlement.toPlayerId,
                amount: settlement.amount,
                notes: `Settlement from ${settlement.fromPlayerName} to ${settlement.toPlayerName}`
            });
            
            if (result.includes('success')) {
                this.showToast('Success', 'Settlement created successfully', 'success');
                this.loadData();
                
                // Dispatch event to notify other components
                this.dispatchSettlementEvent('settlementCreated', { groupId: this.groupId });
            } else {
                this.showToast('Error', 'Failed to create settlement', 'error');
            }
        } catch (error) {
            this.showToast('Error', error.body?.message || 'Failed to create settlement', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    // Utility methods
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(amount);
    }

    getStatusColor(balance) {
        if (balance > 0) return 'success'; // Owed money (green)
        if (balance < 0) return 'error';   // Owes money (red)
        return 'neutral';                   // Settled (gray)
    }

    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(evt);
    }

    // CSS classes for dynamic styling
    getMemberCardClass(member) {
        let baseClass = 'member-card slds-card slds-p-around_medium slds-m-bottom_small';
        if (member.isCurrentPlayer) {
            baseClass += ' current-player';
        }
        if (member.balanceType === 'owed') {
            baseClass += ' owed-money';
        } else if (member.balanceType === 'owes') {
            baseClass += ' owes-money';
        }
        return baseClass;
    }

    getBalanceClass(member) {
        return `balance-amount slds-text-heading_medium ${member.statusColor}`;
    }

    handleRefresh() {
        this.loadData();
    }

    // Public method to refresh data from parent components
    @api
    refresh() {
        this.loadData();
    }

    // Helper method to dispatch settlement events
    dispatchSettlementEvent(eventType, data) {
        console.log('[MemberBalances] Dispatching settlement event:', eventType, 'for group:', this.groupId, 'data:', data);
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
        console.log('[MemberBalances] Settlement event dispatched successfully');
    }
}