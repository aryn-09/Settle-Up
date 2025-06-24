import { LightningElement, track } from 'lwc';
import getSecurityQuestion from '@salesforce/apex/SettleUpController.getSecurityQuestion';
import resetPassword from '@salesforce/apex/SettleUpController.resetPassword';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class ForgotPasswordss extends LightningElement {
    @track email = '';
    @track securityQuestion = '';
    @track securityAnswer = '';
    @track newPassword = '';
    @track confirmPassword = '';
    @track showSecurityStep = false;
    @track showSuccess = false;
    @track isLoading = false;
    @track errorMessage = '';

    handleEmailChange(event) {
        this.email = event.target.value;
        this.errorMessage = '';
    }
    handleSecurityAnswerChange(event) {
        this.securityAnswer = event.target.value;
        this.errorMessage = '';
    }
    handleNewPasswordChange(event) {
        this.newPassword = event.target.value;
        this.errorMessage = '';
    }
    handleConfirmPasswordChange(event) {
        this.confirmPassword = event.target.value;
        this.errorMessage = '';
    }
    handleBackToLogin() {
        this.dispatchEvent(new CustomEvent('backtologin'));
    }
    get emailInputClass() {
        return this.errorMessage && !this.showSecurityStep ? 'slds-input slds-has-error' : 'slds-input';
    }
    get securityAnswerInputClass() {
        return this.errorMessage && this.showSecurityStep ? 'slds-input slds-has-error' : 'slds-input';
    }
    get newPasswordInputClass() {
        return this.errorMessage && this.showSecurityStep ? 'slds-input slds-has-error' : 'slds-input';
    }
    get confirmPasswordInputClass() {
        return this.errorMessage && this.showSecurityStep ? 'slds-input slds-has-error' : 'slds-input';
    }
    async handleNext() {
        if (!this.email) {
            this.errorMessage = 'Please enter your email.';
            return;
        }
        this.isLoading = true;
        try {
            const result = await getSecurityQuestion({ email: this.email });
            const response = JSON.parse(result);
            if (response.success) {
                this.securityQuestion = response.securityQuestion;
                this.showSecurityStep = true;
                this.errorMessage = '';
            } else {
                this.errorMessage = response.message || 'Could not find your account.';
            }
        } catch (e) {
            this.errorMessage = 'An error occurred. Please try again.';
        } finally {
            this.isLoading = false;
        }
    }
    async handleResetPassword() {
        if (!this.securityAnswer) {
            this.errorMessage = 'Please enter your security answer.';
            return;
        }
        if (!this.newPassword || this.newPassword.length < 6) {
            this.errorMessage = 'Password must be at least 6 characters.';
            return;
        }
        if (this.newPassword !== this.confirmPassword) {
            this.errorMessage = 'Passwords do not match.';
            return;
        }
        this.isLoading = true;
        try {
            const result = await resetPassword({
                email: this.email,
                securityAnswer: this.securityAnswer,
                newPassword: this.newPassword
            });
            const response = JSON.parse(result);
            if (response.success) {
                this.showSuccess = true;
                this.errorMessage = '';
                this.showToast('Success', 'Password reset successful! You can now login.', 'success');
            } else {
                this.errorMessage = response.message || 'Failed to reset password.';
            }
        } catch (e) {
            this.errorMessage = 'An error occurred. Please try again.';
        } finally {
            this.isLoading = false;
        }
    }
    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
        });
        this.dispatchEvent(event);
    }
}