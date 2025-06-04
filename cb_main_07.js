// Soubor: consent-booster.js
// Verze: 1.0.6 (používá obecnou událost 'consent_state_updated')
(function(window, document) {
    'use strict';

    const SCRIPT_TAG = document.currentScript;
    const CONFIG = {
        gtmId: SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-gtm-id') : null,
        ga4Id: SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-ga4-id') : null,
        waitForUpdate: parseInt(SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-wait-for-update') : '500', 10),
        devMode: (SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-dev-mode') : 'false') === 'true',
        localStorageKey: 'consentBooster_userConsent_v1.0.6', // Klíč pro ukládání souhlasu
        updateDefaultStateFromStorage: (SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-default-state-updated') : 'false') === 'true',
        forceManagePlainScripts: (SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-force-manage-plain-scripts') : 'false') === 'true',
        categoryMapping: {
            'analytics': ['analytics_storage'],
            'marketing': ['ad_storage', 'ad_user_data', 'ad_personalization'],
            'preferences': ['functionality_storage']
        },
        managedConsentParams: [
            'analytics_storage',
            'ad_storage',
            'ad_user_data',
            'ad_personalization',
            'functionality_storage'
        ]
    };

    class ConsentBooster {
        constructor(config) {
            this.config = config;
            this.elements = {};
            this.consentState = {}; // Aktuální stav souhlasu (oficiální Google parametry)
            this.defaultStateWasUpdatedFromStorage = false;
            
            if (this.config.forceManagePlainScripts) {
                this.shouldManagePlainScripts = true;
            } else {
                this.shouldManagePlainScripts = !this.config.gtmId;
            }

            this._log('ConsentBooster initialized with config (v1.0.6):', this.config);
            if (this.config.updateDefaultStateFromStorage) {
                this._log('Strategy: Attempting to update default consent state from localStorage.', 'warn');
            }
            if (this.config.forceManagePlainScripts && this.config.gtmId) {
                this._log('Strategy: Forcing management of text/plain scripts alongside GTM. Ensure no conflicts.', 'warn');
            }
            this._log('Should manage text/plain scripts:', this.shouldManagePlainScripts);
        }

        _getInitialConsentStateForDefault() {
            const initialConsent = {};
            if (this.config.updateDefaultStateFromStorage) {
                const storedConsent = this.loadConsentFromStorage();
                if (storedConsent) {
                    this._log('Attempting to use stored consent for default state.', storedConsent);
                    this.config.managedConsentParams.forEach(param => {
                        initialConsent[param] = storedConsent[param] || 'denied';
                    });
                    this.consentState = { ...initialConsent }; 
                    this.defaultStateWasUpdatedFromStorage = true;
                    return initialConsent;
                }
                this._log('No stored consent found for default state update, defaulting all to denied.');
            }
            this.config.managedConsentParams.forEach(param => {
                initialConsent[param] = 'denied';
            });
            return initialConsent;
        }

        initDefaultConsent() {
            window.dataLayer = window.dataLayer || [];
            window.gtag = window.gtag || function() { dataLayer.push(arguments); };

            const defaultValues = this._getInitialConsentStateForDefault();
            const consentDefaultCommand = { ...defaultValues };
            consentDefaultCommand.wait_for_update = this.defaultStateWasUpdatedFromStorage ? 0 : this.config.waitForUpdate;

            this._log('Setting default consent:', consentDefaultCommand);
            gtag('consent', 'default', consentDefaultCommand);
        }

        updateConsent(newGoogleConsentStateFromUI) {
            const fullConsentState = {};
            this.config.managedConsentParams.forEach(param => {
                fullConsentState[param] = newGoogleConsentStateFromUI[param] || 'denied';
            });

            this._log('Updating consent via gtag("consent", "update"):', fullConsentState);
            gtag('consent', 'update', fullConsentState);
            
            this.consentState = fullConsentState;
            this.saveConsentToStorage(fullConsentState);

            // Vždy pušni událost o aktualizaci stavu souhlasu
            this._log('Pushing consent_state_updated event to dataLayer.');
            window.dataLayer.push({
                'event': 'consent_state_updated',
                'updated_consent_state': { ...fullConsentState } // Posíláme kopii aktuálního stavu
            });

            if (this.shouldManagePlainScripts) {
                this._log('Activating scripts based on consent updated from UI.');
                this.config.managedConsentParams.forEach(googleParam => {
                    if (this.consentState[googleParam] === 'granted') {
                        this._activateScriptsForGoogleParam(googleParam);
                    }
                });
            }
        }
        
        saveConsentToStorage(consentState) {
            try {
                localStorage.setItem(this.config.localStorageKey, JSON.stringify(consentState));
                this._log('Consent saved to localStorage.');
            } catch (e) {
                this._log('Error saving consent: ' + e.message, 'error');
            }
        }

        loadConsentFromStorage() {
            try {
                const storedConsent = localStorage.getItem(this.config.localStorageKey);
                if (storedConsent) {
                    this._log('Consent loaded from localStorage.');
                    return JSON.parse(storedConsent);
                }
            } catch (e) {
                this._log('Error loading consent: ' + e.message, 'error');
                localStorage.removeItem(this.config.localStorageKey);
            }
            return null;
        }

        _queryElements() {
            this.elements.banner = document.querySelector('[data-cb-banner]');
            this.elements.settingsModal = document.querySelector('[data-cb-modal="settings"]');
            this.elements.actionButtons = document.querySelectorAll('[data-cb-action]');
            this.elements.categoryCheckboxes = document.querySelectorAll('[data-cb-category]');
            this.elements.privacyLink = document.querySelector('[data-cb-link="privacy-policy"]');
        }

        _bindEventListeners() {
            if (!this.elements.actionButtons) return;
            this.elements.actionButtons.forEach(button => {
                const action = button.getAttribute('data-cb-action');
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    switch (action) {
                        case 'accept-all': this._handleAcceptAll(); break;
                        case 'reject-all': this._handleRejectAll(); break;
                        case 'open-settings': this._handleOpenSettings(); break;
                        case 'reopen-settings': this._handleOpenSettings(); break;
                        case 'save-settings': this._handleSaveSettings(); break;
                        case 'close-modal':
                            const targetModal = button.getAttribute('data-cb-target-modal');
                            if (targetModal) this._handleCloseModal(targetModal);
                            break;
                    }
                });
            });
        }

        _showElement(element) {
            if (element) {
                 if (element.hasAttribute('data-cb-modal')) {
                    element.style.display = 'flex';
                } else {
                    element.style.display = 'block';
                }
            }
        }

        _hideElement(element) {
            if (element) element.style.display = 'none';
        }

        _updateCheckboxesUI(googleConsentState) {
            if (!this.elements.categoryCheckboxes) return;
            this.elements.categoryCheckboxes.forEach(checkbox => {
                const userCategoryAlias = checkbox.getAttribute('data-cb-category');
                if (userCategoryAlias && this.config.categoryMapping.hasOwnProperty(userCategoryAlias)) {
                    const googleParamsForAlias = this.config.categoryMapping[userCategoryAlias];
                    let allUnderlyingGranted = googleParamsForAlias.length > 0;
                    googleParamsForAlias.forEach(googleParam => {
                        if (googleConsentState[googleParam] !== 'granted') {
                            allUnderlyingGranted = false;
                        }
                    });
                    checkbox.checked = allUnderlyingGranted;
                }
            });
        }
        
        _loadGtm() {
            if (!this.config.gtmId) return;
            this._log('Preparing to load GTM script for ID:', this.config.gtmId);
            window.dataLayer = window.dataLayer || []; // Ujistit se, že existuje
            window.dataLayer.push({
                'gtm.start': new Date().getTime(),
                event: 'gtm.js'
            });
            this._log('Pushed gtm.start and gtm.js event to dataLayer.');

            const gtmScript = document.createElement('script');
            gtmScript.async = true;
            gtmScript.src = `https://www.googletagmanager.com/gtm.js?id=${this.config.gtmId}`;
            gtmScript.onload = () => this._log('GTM script (gtm.js) loaded successfully.');
            gtmScript.onerror = () => this._log('Error loading GTM script (gtm.js).', 'error');

            const firstScript = document.getElementsByTagName('script')[0];
            if (firstScript && firstScript.parentNode) {
                firstScript.parentNode.insertBefore(gtmScript, firstScript);
            } else { document.head.appendChild(gtmScript); }
        }
        
        _loadGa4Direct() {
            if (!this.config.ga4Id) return;
            this._log('Preparing to load GA4 script directly for ID:', this.config.ga4Id);
            const ga4Script = document.createElement('script');
            ga4Script.async = true;
            ga4Script.src = `https://www.googletagmanager.com/gtag/js?id=${this.config.ga4Id}`;
            ga4Script.onload = () => {
                this._log('GA4 script (gtag.js) loaded. Configuring GA4.');
                window.dataLayer.push({'event': 'gtag.js_loaded'});
                gtag('js', new Date());
                gtag('config', this.config.ga4Id);
                this._log('GA4 configured with ID:', this.config.ga4Id);
            };
            ga4Script.onerror = () => this._log('Error loading GA4 script (gtag.js).', 'error');
            const firstScript = document.getElementsByTagName('script')[0];
            if (firstScript && firstScript.parentNode) {
                firstScript.parentNode.insertBefore(ga4Script, firstScript);
            } else { document.head.appendChild(ga4Script); }
        }

        loadGoogleScripts() {
            if (this.config.gtmId) {
                this._loadGtm();
            } else if (this.config.ga4Id) {
                this._loadGa4Direct();
            }
        }

        _activateScriptsForGoogleParam(googleParamKey) {
            if (!this.shouldManagePlainScripts) return;
            const relevantUserAliases = [];
            for (const alias in this.config.categoryMapping) {
                if (this.config.categoryMapping[alias].includes(googleParamKey)) {
                    relevantUserAliases.push(alias);
                }
            }
            relevantUserAliases.forEach(alias => {
                this._log(`Activating scripts for user category: ${alias} (triggered by Google param: ${googleParamKey})`);
                const scriptsToActivate = document.querySelectorAll(
                    `script[type="text/plain"][data-cb-consent-category="${alias}"]`
                );
                scriptsToActivate.forEach(originalScript => {
                    if (originalScript.dataset.cbActivated === 'true') return;
                    const newScript = document.createElement('script');
                    Array.from(originalScript.attributes).forEach(attr => {
                        if (attr.name !== 'type' && attr.name !== 'data-cb-consent-category' && attr.name !== 'data-cb-activated') {
                            newScript.setAttribute(attr.name, attr.value);
                        }
                    });
                    newScript.type = 'text/javascript';
                    if (originalScript.src) {} else { newScript.textContent = originalScript.textContent; }
                    originalScript.parentNode.insertBefore(newScript, originalScript.nextSibling);
                    originalScript.dataset.cbActivated = 'true';
                    this._log(`Activated script (user category: ${alias}):`, newScript.src || 'inline');
                });
            });
        }

        _handleAcceptAll() {
            const consentState = {};
            this.config.managedConsentParams.forEach(param => consentState[param] = 'granted');
            this.updateConsent(consentState); // Pušne 'consent_state_updated'
            this._hideElement(this.elements.banner);
            this._hideElement(this.elements.settingsModal);
        }

        _handleRejectAll() {
            const consentState = {};
            this.config.managedConsentParams.forEach(param => consentState[param] = 'denied');
            this.updateConsent(consentState); // Pušne 'consent_state_updated'
            this._hideElement(this.elements.banner);
            this._hideElement(this.elements.settingsModal);
        }

        _handleOpenSettings() {
            let consentForUI = this.consentState && Object.keys(this.consentState).length > 0
                ? this.consentState
                : this.loadConsentFromStorage();

            if (!consentForUI || Object.keys(consentForUI).length === 0) {
                consentForUI = {};
                this.config.managedConsentParams.forEach(param => {
                    consentForUI[param] = 'denied';
                });
            }
            
            const displayConsent = {};
            this.config.managedConsentParams.forEach(param => {
                displayConsent[param] = consentForUI[param] || 'denied';
            });

            this._updateCheckboxesUI(displayConsent);
            this._showElement(this.elements.settingsModal);
        }

        _handleSaveSettings() {
            const userChoices = {};
            if(this.elements.categoryCheckboxes){
                this.elements.categoryCheckboxes.forEach(checkbox => {
                    const userCategoryAlias = checkbox.getAttribute('data-cb-category');
                    if (userCategoryAlias) userChoices[userCategoryAlias] = checkbox.checked;
                });
            }

            const newGoogleConsentState = {};
            this.config.managedConsentParams.forEach(param => newGoogleConsentState[param] = 'denied');

            for (const alias in userChoices) {
                if (userChoices.hasOwnProperty(alias) && this.config.categoryMapping.hasOwnProperty(alias)) {
                    if (userChoices[alias]) {
                        this.config.categoryMapping[alias].forEach(googleParam => {
                            newGoogleConsentState[googleParam] = 'granted';
                        });
                    }
                }
            }
            this.updateConsent(newGoogleConsentState); // Pušne 'consent_state_updated'
            this._hideElement(this.elements.settingsModal);
            this._hideElement(this.elements.banner);
        }

        _handleCloseModal(modalName) {
            const modalToClose = document.querySelector(`[data-cb-modal="${modalName}"]`);
            this._hideElement(modalToClose);
        }

        init() {
            this._log('Starting ConsentBooster init sequence...');
            this.initDefaultConsent();
            this._queryElements();

            if (!this.elements.banner) {
                this._log('Banner element [data-cb-banner] not found. Consent UI will not be displayed.', 'warn');
            } else {
                this._bindEventListeners();
            }

            if (this.defaultStateWasUpdatedFromStorage) {
                this._log('Default consent was updated from storage. Hiding banner and activating scripts.');
                if (this.elements.banner) this._hideElement(this.elements.banner);
                // `this.consentState` je již nastaveno z _getInitialConsentStateForDefault
                // a `gtag('consent', 'default', ...)` bylo voláno s těmito hodnotami.
                // Pušnutí 'consent_state_updated' zde může být užitečné pro GTM, aby tagy reagovaly.
                window.dataLayer.push({
                    'event': 'consent_state_updated',
                    'updated_consent_state': { ...this.consentState }
                });
                if (this.shouldManagePlainScripts) {
                    this.config.managedConsentParams.forEach(googleParam => {
                        if (this.consentState[googleParam] === 'granted') {
                            this._activateScriptsForGoogleParam(googleParam);
                        }
                    });
                }
            } else {
                const storedConsent = this.loadConsentFromStorage();
                if (storedConsent) {
                    this._log('Stored consent found (standard path). Applying update.');
                    // `updateConsent` pušne 'consent_state_updated'
                    this.updateConsent(storedConsent); 
                    if (this.elements.banner) this._hideElement(this.elements.banner);
                } else {
                    this._log('No stored consent found. Banner will be shown.');
                    if (this.elements.banner) {
                        this._showElement(this.elements.banner);
                    }
                }
            }
            this.loadGoogleScripts();
            this._log('ConsentBooster setup complete.');
        }

        _log(message, data = '', type = 'info') {
            if (this.config.devMode || type === 'error' || type === 'warn') {
                const logFn = console[type] || console.log;
                let dataToLog = data;
                if (data && typeof data === 'object') {
                    try { dataToLog = JSON.parse(JSON.stringify(data)); } catch (e) { /* fallback */ }
                }
                if (data !== '') { logFn(`[ConsentBooster] ${message}`, dataToLog); }
                else { logFn(`[ConsentBooster] ${message}`); }
            }
        }

    } // Konec třídy ConsentBooster

    if (!SCRIPT_TAG) {
        console.error('[ConsentBooster] CRITICAL: Script tag not identified. Configuration may be missing.');
        return;
    }

    const consentManager = new ConsentBooster(CONFIG);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => consentManager.init());
    } else {
        consentManager.init();
    }
})(window, document);