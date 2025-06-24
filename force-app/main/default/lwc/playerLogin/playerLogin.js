// playerLogin.js
import { LightningElement, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import loginPlayer from '@salesforce/apex/SettleUpController.loginPlayer';
import registerPlayer from '@salesforce/apex/SettleUpController.registerPlayer';

export default class PlayerLogin extends NavigationMixin(LightningElement) {
    @api title = 'Player Login';
    @track email = '';
    @track password = '';
    @track isLoading = false;
    @track showRegistration = false;
    @track showForgotPassword = false;
    
    // Registration fields
    @track regName = '';
    @track regEmail = '';
    @track regPhone = '';
    @track regPassword = '';
    @track regConfirmPassword = '';

    // Handle login form inputs
    handleEmailChange(event) {
        this.email = event.target.value;
    }

    handlePasswordChange(event) {
        this.password = event.target.value;
    }

    // Handle registration form inputs
    handleRegNameChange(event) {
        this.regName = event.target.value;
    }

    handleRegEmailChange(event) {
        this.regEmail = event.target.value;
    }

    handleRegPhoneChange(event) {
        this.regPhone = event.target.value;
    }

    handleRegPasswordChange(event) {
        this.regPassword = event.target.value;
    }

    handleRegConfirmPasswordChange(event) {
        this.regConfirmPassword = event.target.value;
    }

    // Handle login
    async handleLogin() {
        if (!this.validateLogin()) {
            return;
        }

        this.isLoading = true;
        
        try {
            const deviceInfo = JSON.stringify(this.getDeviceInfo());
            const result = await loginPlayer({
                email: this.email,
                password: this.password,
                deviceInfo: deviceInfo
            });

            const response = JSON.parse(result);
            
            if (response.success) {
                // Store session data
                sessionStorage.setItem('settleUpSession', response.sessionToken);
                sessionStorage.setItem('playerId', response.playerId);
                sessionStorage.setItem('playerName', response.playerName);
                
                this.showToast('Success', 'Login successful!', 'success');
                
                // Navigate to main app
                this.navigateToApp();
            } else {
                this.showToast('Error', response.message, 'error');
            }
        } catch (error) {
            this.showToast('Error', 'Login failed: ' + error.body.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    // Handle registration
    async handleRegister() {
        if (!this.validateRegistration()) {
            return;
        }

        this.isLoading = true;
        
        try {
            const result = await registerPlayer({
                name: this.regName,
                email: this.regEmail,
                phone: this.regPhone
            });

            const response = JSON.parse(result);
            
            if (response.success) {
                this.showToast('Success', 'Registration successful! Please login.', 'success');
                this.showRegistration = false;
                this.clearRegistrationForm();
            } else {
                this.showToast('Error', response.message, 'error');
            }
        } catch (error) {
            this.showToast('Error', 'Registration failed: ' + error.body.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    // Validation methods
    validateLogin() {
        if (!this.email) {
            this.showToast('Error', 'Please enter your email', 'error');
            return false;
        }
        
        if (!this.isValidEmail(this.email)) {
            this.showToast('Error', 'Please enter a valid email address', 'error');
            return false;
        }

        return true;
    }

    validateRegistration() {
        if (!this.regName) {
            this.showToast('Error', 'Please enter your name', 'error');
            return false;
        }
        
        if (!this.regEmail) {
            this.showToast('Error', 'Please enter your email', 'error');
            return false;
        }
        
        if (!this.isValidEmail(this.regEmail)) {
            this.showToast('Error', 'Please enter a valid email address', 'error');
            return false;
        }
        
        if (!this.regPhone) {
            this.showToast('Error', 'Please enter your phone number', 'error');
            return false;
        }

        return true;
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Utility methods
    getDeviceInfo() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            timestamp: new Date().toISOString()
        };
    }

    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
            mode: 'dismissable'
        });
        this.dispatchEvent(evt);
    }

    navigateToApp() {
        // Navigate to the main dashboard page
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/maindashboardpage'
            }
        });
    }

    // Toggle between login and registration
    showRegisterForm() {
        this.dispatchEvent(new CustomEvent('showregistration'));
    }

    showLoginForm() {
        this.showRegistration = false;
        this.clearRegistrationForm();
    }

    clearRegistrationForm() {
        this.regName = '';
        this.regEmail = '';
        this.regPhone = '';
        this.regPassword = '';
        this.regConfirmPassword = '';
    }

    // Handle Enter key press
    handleKeyPress(event) {
        if (event.keyCode === 13) {
            if (this.showRegistration) {
                this.handleRegister();
            } else {
                this.handleLogin();
            }
        }
    }

    // Demo login method (for testing)
    handleDemoLogin() {
        this.email = 'john@example.com';
        this.handleLogin();
    }

    // Computed properties
    get loginButtonLabel() {
        return this.isLoading ? 'Logging in...' : 'Login';
    }

    get registerButtonLabel() {
        return this.isLoading ? 'Registering...' : 'Register';
    }

    get isLoginDisabled() {
        return this.isLoading || !this.email;
    }

    get isRegisterDisabled() {
        return this.isLoading || !this.regName || !this.regEmail || !this.regPhone;
    }

    showForgotPasswordForm() {
        this.dispatchEvent(new CustomEvent('showforgotpassword'));
    }

    handleBackToLogin() {
        this.showForgotPassword = false;
        this.showRegistration = false;
    }
}