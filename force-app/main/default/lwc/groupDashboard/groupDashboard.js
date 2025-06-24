import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import { refreshApex } from '@salesforce/apex';
import getPlayerGroups from '@salesforce/apex/SettleUpController.getPlayerGroups';
import createGroup from '@salesforce/apex/SettleUpController.createGroup';
import joinGroup from '@salesforce/apex/SettleUpController.joinGroup';
import getGroupSummary from '@salesforce/apex/SettleUpController.getGroupSummary';

export default class GroupDashboard extends NavigationMixin(LightningElement) {
    @track groups = [];
    @track showCreateModal = false;
    @track showJoinModal = false;
    @track isLoading = false;
    @track error = null;
    @track showGroupCodeModal = false;
    @track selectedGroupCode = '';
    
    // Session management
    sessionToken = '';
    
    // Form data
    @track createGroupForm = {
        name: '',
        description: '',
        currency: 'USD'
    };
    
    @track joinGroupForm = {
        groupCode: ''
    };
    
    // Currency options
    currencyOptions = [
        { label: 'USD - US Dollar', value: 'USD' },
        { label: 'EUR - Euro', value: 'EUR' },
        { label: 'GBP - British Pound', value: 'GBP' },
        { label: 'INR - Indian Rupee', value: 'INR' },
        { label: 'CAD - Canadian Dollar', value: 'CAD' },
        { label: 'AUD - Australian Dollar', value: 'AUD' }
    ];
    
    // Wired method to get groups
    wiredGroupsResult;
    @wire(getPlayerGroups, { sessionToken: '$sessionToken' })
    wiredGroups(result) {
        this.wiredGroupsResult = result;
        console.log('wiredGroups result:', result);
        if (result.data) {
            console.log('Groups data loaded:', result.data);
            this.groups = result.data.map(group => ({
                ...group,
                Id: group.groupId,
                Name: group.groupName,
                Description__c: group.description,
                groupCode: group.groupCode,
                currency: group.currencs,
                formattedTotalExpenses: this.formatCurrency(group.totalExpenses, group.currencs),
                memberCountText: group.memberCount === 1 ? '1 member' : `${group.memberCount} members`,
                lastActivityText: this.formatDate(group.lastActivity),
                statusClass: this.getStatusClass(group.status)
            }));
            this.error = null;
        } else if (result.error) {
            console.error('Error loading groups:', result.error);
            this.error = result.error;
            this.showToast('Error', 'Failed to load groups', 'error');
        }
    }
    
    connectedCallback() {
        // Get session token from local storage or parent component
        this.sessionToken = sessionStorage.getItem('settleUpSession') || '';
        if (!this.sessionToken) {
            this.showToast('Error', 'Please login to continue', 'error');
            // Redirect to login
            this.dispatchEvent(new CustomEvent('logout'));
        }
    }
    
    // Event handlers for create group modal
    handleCreateGroup() {
        this.showCreateModal = true;
    }
    
    handleCloseCreateModal() {
        this.showCreateModal = false;
        this.resetCreateForm();
    }
    
    handleCreateFormChange(event) {
        const field = event.target.dataset.field;
        this.createGroupForm = {
            ...this.createGroupForm,
            [field]: event.target.value
        };
    }
    
    async handleCreateSubmit() {
        if (!this.validateCreateForm()) {
            return;
        }
        this.isLoading = true;
        try {
            console.log('Creating group with:', this.createGroupForm);
            const groupId = await createGroup({
                sessionToken: this.sessionToken,
                groupName: this.createGroupForm.name,
                description: this.createGroupForm.description,
                currencs: this.createGroupForm.currency
            });
            console.log('Group created, ID:', groupId);
            this.showToast('Success', 'Group created successfully!', 'success');
            this.handleCloseCreateModal();
            await refreshApex(this.wiredGroupsResult);
            this.dispatchEvent(new CustomEvent('navigategroup', {
                detail: { groupId: groupId }
            }));
        } catch (error) {
            console.error('Failed to create group:', error);
            this.showToast('Error', 'Failed to create group: ' + error.body.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    // Event handlers for join group modal
    handleJoinGroup() {
        this.showJoinModal = true;
    }
    
    handleCloseJoinModal() {
        this.showJoinModal = false;
        this.resetJoinForm();
    }
    
    handleJoinFormChange(event) {
        this.joinGroupForm.groupCode = event.target.value.toUpperCase();
    }
    
    async handleJoinSubmit() {
        if (!this.validateJoinForm()) {
            return;
        }
        this.isLoading = true;
        try {
            console.log('Joining group with code:', this.joinGroupForm.groupCode);
            const result = await joinGroup({
                sessionToken: this.sessionToken,
                groupCode: this.joinGroupForm.groupCode
            });
            console.log('Join group result:', result);
            if (result === 'Success') {
                this.showToast('Success', 'Successfully joined group!', 'success');
                this.handleCloseJoinModal();
                await refreshApex(this.wiredGroupsResult);
            } else {
                this.showToast('Error', result, 'error');
            }
        } catch (error) {
            console.error('Failed to join group:', error);
            this.showToast('Error', 'Failed to join group: ' + error.body.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    // Group navigation
    handleGroupClick(event) {
        const groupId = event.currentTarget.dataset.groupId;
        // Navigate to group details page
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: `/groupdetailspage?groupId=${groupId}`
            }
        });
    }
    
    // Navigate to expense management
    navigateToExpenseManagement() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/expensemanagement'
            }
        });
    }
    
    // Navigate to settlement management
    navigateToSettlementManagement() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/settlementmanagement'
            }
        });
    }
    
    // Navigate to group management
    navigateToGroupManagement() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/groupmanagementpage'
            }
        });
    }
    
    // Refresh groups
    async handleRefresh() {
        this.isLoading = true;
        try {
            await refreshApex(this.wiredGroupsResult);
            this.showToast('Success', 'Groups refreshed', 'success');
        } catch (error) {
            this.showToast('Error', 'Failed to refresh groups', 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    // Validation methods
    validateCreateForm() {
        const name = this.createGroupForm.name.trim();
        if (!name) {
            this.showToast('Error', 'Group name is required', 'error');
            return false;
        }
        if (name.length < 3) {
            this.showToast('Error', 'Group name must be at least 3 characters', 'error');
            return false;
        }
        return true;
    }
    
    validateJoinForm() {
        const code = this.joinGroupForm.groupCode.trim();
        if (!code) {
            this.showToast('Error', 'Group code is required', 'error');
            return false;
        }
        if (code.length < 6) {
            this.showToast('Error', 'Please enter a valid group code', 'error');
            return false;
        }
        return true;
    }
    
    // Reset form methods
    resetCreateForm() {
        this.createGroupForm = {
            name: '',
            description: '',
            currency: this.createGroupForm.currency
        };
    }
    
    resetJoinForm() {
        this.joinGroupForm = {
            groupCode: ''
        };
    }
    
    // Utility methods
    formatCurrency(amount, currency) {
        if (!amount) return `${currency} 0.00`;
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD'
        }).format(amount);
    }
    
    formatDate(dateString) {
        if (!dateString) return 'Never';
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    }
    
    getStatusClass(status) {
        switch (status) {
            case 'Active': return 'status-active';
            case 'Inactive': return 'status-inactive';
            case 'Archived': return 'status-archived';
            default: return 'status-default';
        }
    }
    
    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }
    
    // Computed properties
    get hasGroups() {
        return this.groups && this.groups.length > 0;
    }
    
    get emptyStateMessage() {
        return 'No groups found. Create a new group or join an existing one to get started!';
    }
    
    get createModalTitle() {
        return 'Create New Group';
    }
    
    get joinModalTitle() {
        return 'Join Group';
    }
    
    handleShareGroupCode(event) {
        event.stopPropagation();
        const groupCode = event.currentTarget.dataset.groupCode;
        this.selectedGroupCode = groupCode;
        this.showGroupCodeModal = true;
    }

    handleCloseGroupCodeModal() {
        this.showGroupCodeModal = false;
        this.selectedGroupCode = '';
    }
}