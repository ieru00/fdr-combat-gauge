class CombatGaugeApp extends Application {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "combat-gauge",
            template: "modules/combat-gauge/templates/gauge.hbs",
            popOut: false,
            _element: null
        });
    }
    
    async render(force = false, options = {}) {
        const data = await this.getData();
        const html = await renderTemplate(this.options.template, data);
    
        if (!this.options._element) {
            const element = $('<div>').addClass('combat-gauge');
            element.css({
                position: 'absolute',
                left: '100px',
                top: '100px',
                zIndex: 1000
            });
            $('#ui-top').append(element);
            this.options._element = element;
        }
    
        this.options._element.html(html);
        this.activateListeners(this.options._element);
        return this;
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('.window-header').mousedown(ev => {
            ev.preventDefault();
            let pos = html.position();
            let x = ev.pageX - pos.left;
            let y = ev.pageY - pos.top;
            
            $('body').mousemove(e => {
                html.css({
                    left: e.pageX - x,
                    top: e.pageY - y
                });
            });
            
            $('body').mouseup(() => {
                $('body').off('mousemove');
                $('body').off('mouseup');
            });
        });
        
        html.find('.collapse-button').click(() => {
            const container = html.find('.combat-gauge-container');
            const icon = html.find('.collapse-button i');
            const fullView = html.find('.full-view');
            const compactView = html.find('.compact-view');
            
            if (fullView.is(':visible')) {
                fullView.hide();
                compactView.show();
                icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
            } else {
                fullView.show();
                compactView.hide();
                icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
            }
        });
    }

    async getData() {
        const combatData = this._calculateCombatData();
        return {
            isGM: game.user.isGM,
            friendly: combatData.friendly,
            hostile: combatData.hostile
        };
    }

    _calculateCombatData() {
        const combat = game.combat;
        if (!combat) return this._getEmptyData();
    
        const friendlyCombatants = combat.combatants.filter(c => c.token?.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE);
        const hostileCombatants = combat.combatants.filter(c => c.token?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE);

        return {
            friendly: this._calculateForceMetrics(friendlyCombatants),
            hostile: this._calculateForceMetrics(hostileCombatants)
        };
    }

    _calculateForceMetrics(combatants) {
        let totalHP = 0;
        let currentHP = 0;
        let totalSpellSlots = 0;
        let currentSpellSlots = 0;
        let totalResources = 0;
        let currentResources = 0;

        for (const combatant of combatants) {
            const actor = combatant.actor;
            if (!actor) continue;

            // HP Calculations
            const hp = actor.system.attributes.hp;
            totalHP += hp.max;
            currentHP += hp.value;

            // Spell Slot Calculations
            if (actor.system.spells) {
                for (let level = 1; level <= 9; level++) {
                    const spellLvl = actor.system.spells[`spell${level}`];
                    if (spellLvl) {
                        totalSpellSlots += spellLvl.max;
                        currentSpellSlots += spellLvl.value;
                    }
                }
            }

            // Resource Calculations
            this._calculateClassResources(actor, { totalResources, currentResources });
        }

        return {
            total: this._calculateTotalPower({currentHP, totalHP, currentSpellSlots, totalSpellSlots, currentResources, totalResources}),
            hp: Math.round((currentHP / totalHP) * 100) || 0,
            spellSlots: Math.round((currentSpellSlots / totalSpellSlots) * 100) || 0,
            resources: Math.round((currentResources / totalResources) * 100) || 0
        };
    }

    _calculateClassResources(actor, resourceTotals) {
        const classFeatures = {
            'barbarian': { 
                feature: 'rage', 
                maxPath: 'system.resources.rage.max', 
                valuePath: 'system.resources.rage.value' 
            },
            'monk': { 
                feature: 'ki', 
                maxPath: 'system.resources.ki.max', 
                valuePath: 'system.resources.ki.value' 
            },
            'fighter': { 
                feature: 'secondWind', 
                maxPath: 'system.resources.secondwind.max', 
                valuePath: 'system.resources.secondwind.value' 
            },
            'cleric': {
                feature: 'channelDivinity',
                maxPath: 'system.resources.channelDivinity.max',
                valuePath: 'system.resources.channelDivinity.value'
            },
            'druid': {
                feature: 'wildShape',
                maxPath: 'system.resources.wildShape.max',
                valuePath: 'system.resources.wildShape.value'
            },
            'paladin': {
                feature: 'layOnHands',
                maxPath: 'system.resources.layOnHands.max',
                valuePath: 'system.resources.layOnHands.value'
            }
        };
    
        const className = actor.items.find(i => i.type === 'class')?.name.toLowerCase();
        if (className && classFeatures[className]) {
            const feature = classFeatures[className];
            const max = getProperty(actor, feature.maxPath) || 0;
            const value = getProperty(actor, feature.valuePath) || 0;
            resourceTotals.totalResources += max;
            resourceTotals.currentResources += value;
        }
    
        // Add check for and handle any spellcasting resources
        if (actor.system.spells) {
            for (let level = 1; level <= 9; level++) {
                const spellLvl = actor.system.spells[`spell${level}`];
                if (spellLvl) {
                    resourceTotals.totalSpellSlots += spellLvl.max || 0;
                    resourceTotals.currentSpellSlots += spellLvl.value || 0;
                }
            }
        }
    }

    _calculateTotalPower(metrics) {
        const weights = {
            hp: 0.5,
            spellSlots: 0.3,
            resources: 0.2
        };
    
        // Calculate each component, using 0 if values are missing or invalid
        const hpComponent = metrics.totalHP ? (metrics.currentHP / metrics.totalHP) * weights.hp : 0;
        const spellComponent = metrics.totalSpellSlots ? (metrics.currentSpellSlots / metrics.totalSpellSlots) * weights.spellSlots : 0;
        const resourceComponent = metrics.totalResources ? (metrics.currentResources / metrics.totalResources) * weights.resources : 0;
    
        // Sum all components and multiply by 100 for percentage
        const total = (hpComponent + spellComponent + resourceComponent) * 100;
    
        return Math.round(total);
    }

    _getEmptyData() {
        return {
            friendly: { total: 0, hp: 0, spellSlots: 0, resources: 0 },
            hostile: { total: 0, hp: 0, spellSlots: 0, resources: 0 }
        };
    }

    close() {
        this.options._element?.remove();
        this.options._element = null;
        return super.close();
    }
}

const CombatGaugeModule = {
    ID: 'combat-gauge',
    
    initialize() {
        game.modules.get(this.ID).api = this;
    },

    registerSettings() {

        game.settings.register(this.ID, 'gmOnly', {
            name: 'GM Only',
            hint: 'Only show the gauge to GM users',
            scope: 'world',
            config: true,
            type: Boolean,
            default: false
        });
    },

    onReady() {
        if (!game.user.isGM && game.settings.get(this.ID, 'gmOnly')) return;
        
        Hooks.on('updateCombat', this._onUpdateCombat.bind(this));
        Hooks.on('deleteCombat', this._onDeleteCombat.bind(this));
        Hooks.on('updateActor', (actor, changes) => {
            if (game.combat?.started && this.gaugeApp) {
                this.gaugeApp.render();
            }
        });
    },

    _onUpdateCombat(combat, changed, options, userId) {
        if (!game.user.isGM && game.settings.get(this.ID, 'gmOnly')) return;
    
        if (!game.combat?.started) {
            if (this.gaugeApp) {
                this.gaugeApp.close();
                this.gaugeApp = null;
            }
            return;
        }
    
        if (!this.gaugeApp) {
            this.gaugeApp = new CombatGaugeApp();
            this.gaugeApp.render(true);
        }
    },

    _onDeleteCombat(combat, options, userId) {
        if (this.gaugeApp) {
            this.gaugeApp.close();
            this.gaugeApp = null;
        }
    }


};

Hooks.once('init', () => {
    CombatGaugeModule.initialize();
});
Hooks.once('ready', () => CombatGaugeModule.onReady());
Hooks.once('setup', () => CombatGaugeModule.registerSettings());