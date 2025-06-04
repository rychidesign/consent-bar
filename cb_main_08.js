// Soubor: consent-booster.js
// Verze: 1.0.7 (Strategie 3: 'consent_state_updated' pouze při aktivní změně UI)
(function(window, document) {
    'use strict';

    const SCRIPT_TAG = document.currentScript;
    const CONFIG = {
        gtmId: SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-gtm-id') : null,
        ga4Id: SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-ga4-id') : null,
        waitForUpdate: parseInt(SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-wait-for-update') : '500', 10),
        devMode: (SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-dev-mode') : 'false') === 'true',
        localStorageKey: 'consentBooster_userConsent_v1.0.7',
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
            this.consentState = {};
            this.defaultStateWasUpdatedFromStorage = false;
            
            if (this.config.forceManagePlainScripts) {
                this.shouldManagePlainScripts = true;
            } else {
                this.shouldManagePlainScripts = !this.config.gtmId;
            }

            this._log('ConsentBooster initialized with config (v1.0.7):', this.config);
            // ... (ostatní logy z konstruktoru) ...
        }

        _getInitialConsentStateForDefault() {
            // ... (beze změny z verze 1.0.5/1.0.6) ...
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
            // ... (beze změny z verze 1.0.5/1.0.6) ...
            window.dataLayer = window.dataLayer || [];
            window.gtag = window.gtag || function() { dataLayer.push(arguments); };
            const defaultValues = this._getInitialConsentStateForDefault();
            const consentDefaultCommand = { ...defaultValues };
            consentDefaultCommand.wait_for_update = this.defaultStateWasUpdatedFromStorage ? 0 : this.config.waitForUpdate;
            this._log('Setting default consent:', consentDefaultCommand);
            gtag('consent', 'default', consentDefaultCommand);
        }

        // Tato metoda je nyní volána POUZE z UI handlerů (_handleAcceptAll, _handleRejectAll, _handleSaveSettings)
        updateConsentAfterUInteraction(newGoogleConsentStateFromUI) {
            const fullConsentState = {};
            this.config.managedConsentParams.forEach(param => {
                fullConsentState[param] = newGoogleConsentStateFromUI[param] || 'denied';
            });

            this._log('Updating consent via gtag("consent", "update") AFTER UI interaction:', fullConsentState);
            gtag('consent', 'update', fullConsentState); // Odešle update do Google Consent Mode
            
            this.consentState = fullConsentState; // Aktualizuje interní stav
            this.saveConsentToStorage(fullConsentState); // Uloží do localStorage

            // Pušne událost do dataLayer, protože došlo k aktivní změně uživatelem
            this._log('Pushing consent_state_updated event to dataLayer (due to UI interaction).');
            window.dataLayer.push({
                'event': 'consent_state_updated',
                'updated_consent_state': { ...fullConsentState }
            });

            // Aktivace skriptů třetích stran (pokud je relevantní)
            if (this.shouldManagePlainScripts) {
                this._log('Activating scripts based on consent updated from UI.');
                this.config.managedConsentParams.forEach(googleParam => {
                    if (this.consentState[googleParam] === 'granted') {
                        this._activateScriptsForGoogleParam(googleParam);
                    }
                });
            }
        }
        
        // ... (saveConsentToStorage, loadConsentFromStorage beze změny) ...
        // ... (_queryElements, _bindEventListeners, _showElement, _hideElement, _updateCheckboxesUI beze změny) ...
        // ... (_loadGtm, _loadGa4Direct, loadGoogleScripts beze změny) ...
        // ... (_activateScriptsForGoogleParam beze změny) ...

        _handleAcceptAll() {
            const consentState = {};
            this.config.managedConsentParams.forEach(param => consentState[param] = 'granted');
            this.updateConsentAfterUInteraction(consentState); // Volá novou metodu
            this._hideElement(this.elements.banner);
            this._hideElement(this.elements.settingsModal);
        }

        _handleRejectAll() {
            const consentState = {};
            this.config.managedConsentParams.forEach(param => consentState[param] = 'denied');
            this.updateConsentAfterUInteraction(consentState); // Volá novou metodu
            this._hideElement(this.elements.banner);
            this._hideElement(this.elements.settingsModal);
        }
        
        _handleOpenSettings() {
            // ... (beze změny z verze 1.0.6) ...
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
            this.updateConsentAfterUInteraction(newGoogleConsentState); // Volá novou metodu
            this._hideElement(this.elements.settingsModal);
            this._hideElement(this.elements.banner);
        }

        // ... (_handleCloseModal beze změny) ...

        init() {
            this._log('Starting ConsentBooster init sequence...');
            this.initDefaultConsent(); // Nastaví default, může použít localStorage a nastavit this.consentState
            this._queryElements();

            if (!this.elements.banner) {
                this._log('Banner element [data-cb-banner] not found. Consent UI will not be displayed.', 'warn');
            } else {
                this._bindEventListeners();
            }

            if (this.defaultStateWasUpdatedFromStorage) {
                // Default byl již nastaven z localStorage, this.consentState je aktuální.
                // Banner se skryje, skripty třetích stran se aktivují.
                // Neposíláme zde 'consent_state_updated', GTM se spoléhá na standardní triggery.
                this._log('Default consent was updated from storage. Hiding banner and activating scripts.');
                if (this.elements.banner) this._hideElement(this.elements.banner);
                
                if (this.shouldManagePlainScripts) {
                    this.config.managedConsentParams.forEach(googleParam => {
                        if (this.consentState[googleParam] === 'granted') {
                            this._activateScriptsForGoogleParam(googleParam);
                        }
                    });
                }
            } else {
                // Default byl nastaven na 'denied' (nebo updateDefaultStateFromStorage bylo false / souhlas nebyl nalezen).
                // Zkusíme načíst standardně z localStorage.
                const storedConsent = this.loadConsentFromStorage();
                if (storedConsent) {
                    this._log('Stored consent found (standard path). Applying consent state without pushing event from init.');
                    // Pouze nastavíme interní stav a odešleme 'update' do gtag, ale nepušujeme 'consent_state_updated' z init.
                    gtag('consent', 'update', storedConsent);
                    this.consentState = storedConsent;
                    // this.saveConsentToStorage(storedConsent); // Není potřeba, už je uložen
                    
                    if (this.elements.banner) this._hideElement(this.elements.banner);
                    if (this.shouldManagePlainScripts) {
                        this.config.managedConsentParams.forEach(googleParam => {
                            if (this.consentState[googleParam] === 'granted') {
                                this._activateScriptsForGoogleParam(googleParam);
                            }
                        });
                    }
                } else {
                    // Žádný souhlas, zobrazit banner
                    this._log('No stored consent found. Banner will be shown.');
                    if (this.elements.banner) {
                        this._showElement(this.elements.banner);
                    }
                }
            }

            this.loadGoogleScripts(); // Načte GTM/GA4
            this._log('ConsentBooster setup complete.');
        }
        // ... (_log, saveConsentToStorage, loadConsentFromStorage, _queryElements, _bindEventListeners, _showElement, _hideElement, _updateCheckboxesUI, _loadGtm, _loadGa4Direct, loadGoogleScripts, _activateScriptsForGoogleParam, _handleCloseModal - všechny tyto metody jsou stejné jako ve verzi 1.0.6 pro kompletnost, pokud nejsou přímo zmíněny výše)
    } // Konec třídy ConsentBooster

    // Zbytek skriptu pro inicializaci ConsentBooster instance (stejný jako v 1.0.6)
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