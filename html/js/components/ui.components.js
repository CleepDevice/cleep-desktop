/*global angular*/

/**
 * Desktop POC fork of Cleep ui.components - clIcon only.
 * Uses md-svg-icon + fonts/mdi.svg (Desktop iconset) instead of MDI webfont.
 */
angular.module('Cleep').component('clIcon', {
    template: `
        <md-icon ng-if="$ctrl.clTooltip" md-svg-icon="{{ $ctrl.svgIcon }}" ng-class="$ctrl.clClass">
            <md-tooltip>{{ $ctrl.clTooltip }}</md-tooltip>
        </md-icon>
        <md-icon ng-if="!$ctrl.clTooltip" md-svg-icon="{{ $ctrl.svgIcon }}" ng-class="$ctrl.clClass">
        </md-icon>`,
    bindings: {
        clIcon: '@',
        clTooltip: '@?',
        clClass: '@?',
    },
    controller: function () {
        const ctrl = this;

        ctrl.resolveIcon = function (icon) {
            if (!icon) {
                return '';
            }
            if (icon.startsWith('brand-')) {
                return icon;
            }
            if (icon.indexOf('mdi mdi-') === 0) {
                return icon.replace(/^mdi mdi-/, '');
            }
            if (icon.indexOf('mdi-') === 0) {
                return icon.replace(/^mdi-/, '');
            }
            return icon;
        };

        ctrl.$onChanges = function (changes) {
            if (changes.clIcon) {
                ctrl.svgIcon = ctrl.resolveIcon(changes.clIcon.currentValue);
            }
        };
    },
});
