// playerRegistration.js
import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import registerPlayer from '@salesforce/apex/SettleUpController.registerPlayer';
export default class PlayerRegistration extends LightningElement {
    @track formData = {
        name: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        securityQuestion: '',
        securityAnswer: ''
    };

    @track errors = {
        name: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        securityQuestion: '',
        securityAnswer: ''
    };

    @track isLoading = false;
    @track showSuccess = false;
    @track registeredPlayerCode = '';

    // Input validation patterns
    emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    phonePattern = /^[\+]?[1-9][\d]{0,15}$/;

    handleInputChange(event) {
        const field = event.target.name;
        const value = event.target.value;
        
        this.formData = { ...this.formData, [field]: value };
        
        // Clear error when user starts typing
        if (this.errors[field]) {
            this.errors = { ...this.errors, [field]: '' };
        }
        
        // Real-time validation
        this.validateField(field, value);
    }

    validateField(field, value) {
        let error = '';
        
        switch (field) {
            case 'name':
                if (!value || value.trim().length < 2) {
                    error = 'Name must be at least 2 characters long';
                } else if (value.trim().length > 255) {
                    error = 'Name cannot exceed 255 characters';
                }
                break;
                
            case 'email':
                if (!value) {
                    error = 'Email is required';
                } else if (!this.emailPattern.test(value)) {
                    error = 'Please enter a valid email address';
                } else if (value.length > 255) {
                    error = 'Email cannot exceed 255 characters';
                }
                break;
                
            case 'phone':
                if (!value) {
                    error = 'Phone number is required';
                } else if (!this.phonePattern.test(value)) {
                    error = 'Please enter a valid phone number';
                } else if (value.length > 20) {
                    error = 'Phone number cannot exceed 20 characters';
                }
                break;

            case 'password':
                if (!value) {
                    error = 'Password is required';
                } else if (value.length < 6) {
                    error = 'Password must be at least 6 characters';
                } else if (value.length > 100) {
                    error = 'Password cannot exceed 100 characters';
                }
                break;
            case 'confirmPassword':
                if (!value) {
                    error = 'Please confirm your password';
                } else if (value !== this.formData.password) {
                    error = 'Passwords do not match';
                }
                break;
            case 'securityQuestion':
                if (!value || value.trim().length < 5) {
                    error = 'Security question must be at least 5 characters';
                } else if (value.length > 255) {
                    error = 'Security question cannot exceed 255 characters';
                }
                break;
            case 'securityAnswer':
                if (!value) {
                    error = 'Security answer is required';
                } else if (value.length > 100) {
                    error = 'Security answer cannot exceed 100 characters';
                }
                break;
        }
        
        this.errors = { ...this.errors, [field]: error };
        return !error;
    }

    validateForm() {
        const nameValid = this.validateField('name', this.formData.name);
        const emailValid = this.validateField('email', this.formData.email);
        const phoneValid = this.validateField('phone', this.formData.phone);
        const passwordValid = this.validateField('password', this.formData.password);
        const confirmPasswordValid = this.validateField('confirmPassword', this.formData.confirmPassword);
        const securityQuestionValid = this.validateField('securityQuestion', this.formData.securityQuestion);
        const securityAnswerValid = this.validateField('securityAnswer', this.formData.securityAnswer);
        return nameValid && emailValid && phoneValid && passwordValid && confirmPasswordValid && securityQuestionValid && securityAnswerValid;
    }

    async handleRegister(event) {
        event.preventDefault();
        if (!this.validateForm()) {
            this.showToast('Error', 'Please fix the validation errors', 'error');
            return;
        }
        this.isLoading = true;
        try {
            const result = await registerPlayer({
                name: this.formData.name.trim(),
                email: this.formData.email.trim().toLowerCase(),
                phone: this.formData.phone.trim(),
                password: this.formData.password,
                securityQuestion: this.formData.securityQuestion.trim(),
                securityAnswer: this.formData.securityAnswer
            });
            const response = JSON.parse(result);
            if (response.success) {
                this.showSuccess = true;
                this.registeredPlayerCode = response.playerCode || 'Generated';
                this.showToast('Success!', 'Your account has been created successfully. You can now login with your email.', 'success');
                this.resetForm();
                this.dispatchEvent(new CustomEvent('registrationsuccess', {
                    detail: {
                        playerId: response.playerId,
                        playerName: this.formData.name,
                        email: this.formData.email
                    }
                }));
            } else {
                this.showToast('Registration Failed', response.message, 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showToast('Error', 'An unexpected error occurred. Please try again.', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleBackToLogin() {
        // Dispatch event to parent to show login form
        this.dispatchEvent(new CustomEvent('backtologin'));
    }

    resetForm() {
        this.formData = {
            name: '',
            email: '',
            phone: '',
            password: '',
            confirmPassword: '',
            securityQuestion: '',
            securityAnswer: ''
        };
        this.errors = {
            name: '',
            email: '',
            phone: '',
            password: '',
            confirmPassword: '',
            securityQuestion: '',
            securityAnswer: ''
        };
        this.showSuccess = false;
    }

    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
        });
        this.dispatchEvent(event);
    }

    get isFormValid() {
        return this.formData.name && 
               this.formData.email && 
               this.formData.phone && 
               !this.errors.name && 
               !this.errors.email && 
               !this.errors.phone;
    }

    get nameInputClass() {
        return this.errors.name ? 'slds-input slds-has-error' : 'slds-input';
    }

    get emailInputClass() {
        return this.errors.email ? 'slds-input slds-has-error' : 'slds-input';
    }

    get phoneInputClass() {
        return this.errors.phone ? 'slds-input slds-has-error' : 'slds-input';
    }

    get passwordInputClass() {
        return this.errors.password ? 'slds-input slds-has-error' : 'slds-input';
    }

    get confirmPasswordInputClass() {
        return this.errors.confirmPassword ? 'slds-input slds-has-error' : 'slds-input';
    }

    get securityQuestionInputClass() {
        return this.errors.securityQuestion ? 'slds-input slds-has-error' : 'slds-input';
    }

    get securityAnswerInputClass() {
        return this.errors.securityAnswer ? 'slds-input slds-has-error' : 'slds-input';
    }
}