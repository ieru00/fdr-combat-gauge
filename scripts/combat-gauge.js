class CombatGaugeApp extends Application {
    static get defaultOptions() {
        const displayMode = game.settings.get('combat-gauge', 'displayMode');
        return mergeObject(super.defaultOptions, {
            id: 'combat-gauge',
            template: `modules/combat-gauge/templates/gauge.html`,
            title: 'Combat Gauge',
            width: 300,
            height: 'auto',
            popOut: displayMode === 'floating',
            classes: [`combat-gauge-${displayMode}`]
        });
    }

    getData() {
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

        const friendlyCombatants = combat.combatants.filter(c => !c.token?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE);
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
            'barbarian': { feature: 'rage', maxPath: 'system.resources.rage.max', valuePath: 'system.resources.rage.value' },
            'monk': { feature: 'ki', maxPath: 'system.resources.ki.max', valuePath: 'system.resources.ki.value' },
            'fighter': { feature: 'secondWind', maxPath: 'system.resources.secondwind.max', valuePath: 'system.resources.secondwind.value' }
        };

        const className = actor.items.find(i => i.type === 'class')?.name.toLowerCase();
        if (className && classFeatures[className]) {
            const feature = classFeatures[className];
            resourceTotals.totalResources += getProperty(actor, feature.maxPath) || 0;
            resourceTotals.currentResources += getProperty(actor, feature.valuePath) || 0;
        }
    }

    _calculateTotalPower(metrics) {
        const weights = {
            hp: 0.5,
            spellSlots: 0.3,
            resources: 0.2
        };

        return Math.round(
            (metrics.currentHP / metrics.totalHP * weights.hp +
            metrics.currentSpellSlots / metrics.totalSpellSlots * weights.spellSlots +
            metrics.currentResources / metrics.totalResources * weights.resources) * 100
        ) || 0;
    }

    _getEmptyData() {
        return {
            friendly: { total: 0, hp: 0, spellSlots: 0, resources: 0 },
            hostile: { total: 0, hp: 0, spellSlots: 0, resources: 0 }
        };
    }
}

const CombatGaugeModule = {
    ID: 'combat-gauge',
    
    initialize() {
        game.modules.get(this.ID).api = this;
    },

    registerSettings() {
        game.settings.register(this.ID, 'displayMode', {
            name: 'Display Mode',
            hint: 'Choose how the gauge is displayed',
            scope: 'client',
            config: true,
            type: String,
            choices: {
                'right': 'Right Side',
                'left': 'Left Side',
                'floating': 'Floating Window'
            },
            default: 'right'
        });
    },

    onReady() {
        Hooks.on('updateCombat', this._onUpdateCombat.bind(this));
        Hooks.on('deleteCombat', this._onDeleteCombat.bind(this));
    },

    _onUpdateCombat(combat, changed, options, userId) {
        if (!game.combat?.started) return;
        if (!this.gaugeApp) {
            this.gaugeApp = new CombatGaugeApp();
            this.gaugeApp.render(true);
        } else {
            this.gaugeApp.render();
        }
    },

    _onDeleteCombat(combat, options, userId) {
        if (this.gaugeApp) {
            this.gaugeApp.close();
            this.gaugeApp = null;
        }
    }
};

Hooks.once('init', () => CombatGaugeModule.initialize());
Hooks.once('ready', () => CombatGaugeModule.onReady());
Hooks.once('setup', () => CombatGaugeModule.registerSettings());