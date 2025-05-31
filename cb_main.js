// Soubor: consent-booster.js
// Verze: 1.0.1 (odstraněno dynamické nastavování privacy policy URL)
(function(window, document) {
    'use strict';

    const SCRIPT_TAG = document.currentScript;
    const CONFIG = {
        gtmId: SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-gtm-id') : null,
        ga4Id: SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-ga4-id') : null,
        // privacyPolicyUrl: Již není potřeba, uživatel nastaví v HTML
        waitForUpdate: parseInt(SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-wait-for-update') : '500', 10),
        devMode: (SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-cb-dev-mode') : 'false') === 'true',
        localStorageKey: 'consentBooster_userConsent_v1.0.1', // Mírná úprava klíče pro odlišení verze
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
            this.shouldManagePlainScripts = !this.config.gtmId;

            this._log('ConsentBooster initialized with config (v1.0.1):', this.config);
            this._log('Should manage text/plain scripts:', this.shouldManagePlainScripts);
        }

        initDefaultConsent() {
            window.dataLayer = window.dataLayer || [];
            window.gtag = window.gtag || function() { dataLayer.push(arguments); };

            const defaultConsent = {};
            this.config.managedConsentParams.forEach(param => {
                defaultConsent[param] = 'denied';
            });
            defaultConsent.wait_for_update = this.config.waitForUpdate;

            this._log('Setting default consent:', defaultConsent);
            gtag('consent', 'default', defaultConsent);
        }

        updateConsent(newGoogleConsentState) {
            const fullConsentState = {};
            this.config.managedConsentParams.forEach(param => {
                fullConsentState[param] = newGoogleConsentState[param] || 'denied';
            });

            this._log('Updating consent:', fullConsentState);
            gtag('consent', 'update', fullConsentState);
            this.consentState = fullConsentState;
            this.saveConsentToStorage(fullConsentState);

            if (this.shouldManagePlainScripts) {
                this._log('Activating scripts based on updated consent.');
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
            this.elements.privacyLink = document.querySelector('[data-cb-link="privacy-policy"]'); // Stále můžeme najít, ale neměníme href
        }

        _bindEventListeners() {
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
            if (element) element.style.display = 'block'; // Uživatel si může přepsat třídou
        }

        _hideElement(element) {
            if (element) element.style.display = 'none'; // Uživatel si může přepsat třídou
        }

        _updateCheckboxesUI(googleConsentState) {
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

        loadGoogleScripts() {
            if (this.config.gtmId) {
                this._loadScript(`https://www.googletagmanager.com/gtm.js?id=${this.config.gtmId}`, () => this._log('GTM script loaded.'));
            } else if (this.config.ga4Id) {
                this._loadScript(`https://www.googletagmanager.com/gtag/js?id=${this.config.ga4Id}`, () => {
                    this._log('GA4 script loaded. Configuring GA4.');
                    gtag('js', new Date());
                    gtag('config', this.config.ga4Id);
                });
            }
        }

        _loadScript(src, callback) {
            const script = document.createElement('script');
            script.async = true;
            script.src = src;
            if (callback) script.onload = callback;
            // Vložit před první existující skript pro jistotu (hlavně pro GTM)
            const firstScript = document.getElementsByTagName('script')[0];
            if (firstScript && firstScript.parentNode) {
                firstScript.parentNode.insertBefore(script, firstScript);
            } else {
                document.head.appendChild(script); // Fallback, pokud nejsou jiné skripty
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
                    if (originalScript.src) {
                        // Externí
                    } else {
                        newScript.textContent = originalScript.textContent; // Inline
                    }
                    // Vložit nový skript a případně odstranit starý placeholder
                    originalScript.parentNode.insertBefore(newScript, originalScript.nextSibling);
                    originalScript.dataset.cbActivated = 'true';
                    // originalScript.remove(); // Volitelně, pokud chcete placeholder odstranit
                    this._log(`Activated script (user category: ${alias}):`, newScript.src || 'inline');
                });
            });
        }

        _handleAcceptAll() {
            const consentState = {};
            this.config.managedConsentParams.forEach(param => consentState[param] = 'granted');
            this.updateConsent(consentState);
            this._hideElement(this.elements.banner);
            this._hideElement(this.elements.settingsModal);
        }

        _handleRejectAll() {
            const consentState = {};
            this.config.managedConsentParams.forEach(param => consentState[param] = 'denied');
            this.updateConsent(consentState);
            this._hideElement(this.elements.banner);
            this._hideElement(this.elements.settingsModal);
        }

        _handleOpenSettings() {
            const currentOrInitialConsent = this.consentState && Object.keys(this.consentState).length > 0
                ? this.consentState
                : this.loadConsentFromStorage() || {};
            
            const displayConsent = {};
            this.config.managedConsentParams.forEach(param => {
                displayConsent[param] = currentOrInitialConsent[param] || 'denied';
            });

            this._updateCheckboxesUI(displayConsent);
            this._showElement(this.elements.settingsModal);
        }

        _handleSaveSettings() {
            const userChoices = {};
            this.elements.categoryCheckboxes.forEach(checkbox => {
                const userCategoryAlias = checkbox.getAttribute('data-cb-category');
                if (userCategoryAlias) userChoices[userCategoryAlias] = checkbox.checked;
            });

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
            this.updateConsent(newGoogleConsentState);
            this._hideElement(this.elements.settingsModal);
            this._hideElement(this.elements.banner);
        }

        _handleCloseModal(modalName) {
            const modalToClose = document.querySelector(`[data-cb-modal="${modalName}"]`);
            this._hideElement(modalToClose);
        }

        init() {
            this._log('Starting ConsentBooster...');
            this.initDefaultConsent();
            this._queryElements();

            if (!this.elements.banner) {
                this._log('Banner element [data-cb-banner] not found. Consent UI will not be displayed.', 'warn');
            } else {
                this._bindEventListeners();
            }

            const storedConsent = this.loadConsentFromStorage();
            if (storedConsent) {
                this.updateConsent(storedConsent);
                if (this.elements.banner) this._hideElement(this.elements.banner);
            } else {
                if (this.elements.banner) this._showElement(this.elements.banner);
            }
            this.loadGoogleScripts();
            this._log('ConsentBooster setup complete.');
        }

        _log(message, data = '', type = 'info') {
            if (this.config.devMode || type === 'error' || type === 'warn') {
                const logFn = console[type] || console.log;
                // Bezpečnější logování objektů bez cyklických referencí
                let dataToLog = data;
                if (data && typeof data === 'object') {
                    try {
                        dataToLog = JSON.parse(JSON.stringify(data));
                    } catch (e) {
                        // Pokud JSON.stringify selže (např. cyklická struktura), logujeme objekt přímo
                        // (v konzoli to může být méně přehledné, ale je to bezpečnější)
                    }
                }

                if (data !== '') { // Kontrola na prázdný řetězec jako původní default
                     logFn(`[ConsentBooster] ${message}`, dataToLog);
                } else {
                    logFn(`[ConsentBooster] ${message}`);
                }
            }
        }
    }

    if (!SCRIPT_TAG) {
        console.error('[ConsentBooster] CRITICAL: Script tag not identified. Configuration may be missing. Ensure this script is loaded directly via a <script src="..."></script> tag.');
        return;
    }

    const consentManager = new ConsentBooster(CONFIG);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => consentManager.init());
    } else {
        consentManager.init();
    }

})(window, document);