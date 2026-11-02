/*global angular*/

function getFormName() {
    return 'form' + Math.round(Math.random() * 100000000);
}

STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
ARGUMENT_NAMES = /([^\s,]+)/g;

function callFunction(fn, data) {
    const fnStr = fn.toString().replace(STRIP_COMMENTS, '');
    const fnArgs = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES) || [];

    const args = [];
    for (const arg of fnArgs) {
        if (data?.[arg]) {
            args.push(data[arg]);
        } else if (data?.meta?.[arg]) {
            args.push(data.meta[arg]);
        } else {
            args.push(undefined);
        }
    }

    fn.apply(null, args);
}

function functionArgs(fn) {
    const fnStr = fn.toString().replace(STRIP_COMMENTS, '');
    const fnArgs = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES) || [];
}

angular.module('Cleep').component('configItemDesc', {
    template: `
        <div ng-if="$ctrl.showLoader || $ctrl.showIcon">
            <md-progress-circular
                ng-if="$ctrl.showLoader"
                md-diameter="24px"
                md-mode="indeterminate"
                style="margin: 10px;"
                flex="none"
            ></md-progress-circular>
            <cl-icon ng-if="$ctrl.showIcon" cl-icon="{{ $ctrl.icon }}" flex="none" style="margin: 10px;" cl-class="{{ $ctrl.clIconStyle }}"></cl-icon>
        </div>
        <div layout="column" layout-align="center start" style="min-height: 48px;">
            <div ng-bind-html="$ctrl.clTitle"></div>
            <div ng-if="$ctrl.clSubtitle" class="md-caption" style="margin-top: 5px;">{{ $ctrl.clSubtitle }}</div>
        </div>
    `,
    bindings: {
        clIcon: '<',
        clIconStyle: '<',
        clTitle: '<',
        clSubtitle: '<',
        clLoading: '<?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.showLoader = false;
        ctrl.showIcon = false;

        ctrl.$onInit = function () {
            ctrl.syncFromBindings();
        };

        ctrl.$onChanges = function (changes) {
            if (changes.clIcon || changes.clLoading) {
                ctrl.syncFromBindings();
            }
        };

        ctrl.syncFromBindings = function () {
            // undefined/null → default chevron; '' → hide icon (no placeholder)
            ctrl.icon = ctrl.clIcon == null ? 'chevron-right' : ctrl.clIcon;
            ctrl.showLoader = ctrl.clLoading ?? false;
            ctrl.showIcon = !ctrl.showLoader && !!ctrl.icon;
        };
    },
});

angular.module('Cleep').component('configItemSaveButton', {
    template: `
        <md-button
            ng-if="$ctrl.clBtnClick"
            ng-click="$ctrl.onClick($event)"
            class="{{ $ctrl.style }} cl-button-sm"
            ng-disabled="($ctrl.checkForm && !$ctrl.clFormRef.inputField.$valid) || $ctrl.clBtnDisabled === true"
        >
            <md-tooltip ng-if="$ctrl.clBtnTooltip">{{ $ctrl.clBtnTooltip }}</md-tooltip>
            <cl-icon cl-icon="{{ $ctrl.icon }}"></cl-icon>
        </md-button>
    `,
    bindings: {
        clBtnIcon: '<',
        clBtnStyle: '<',
        clBtnClick: '<',
        clBtnTooltip: '<',
        clBtnDisabled: '<',
        clModel: '<',
        clFormRef: '<',
        clMeta: '<',
    },
    controller: function () {
        const ctrl = this;
        ctrl.style = 'md-primary md-raised';
        ctrl.icon = 'content-save';
        ctrl.checkForm = false;

        ctrl.$onInit = function () {
            ctrl.syncFromBindings();
            ctrl.checkForm = !!ctrl.clFormRef;
        };

        ctrl.$onChanges = function () {
            ctrl.syncFromBindings();
        };

        ctrl.syncFromBindings = function () {
            ctrl.style = ctrl.clBtnStyle || 'md-primary md-raised';
            ctrl.icon = ctrl.clBtnIcon || 'content-save';
        };

        ctrl.onClick = ($event) => {
            if (ctrl.clBtnClick) {
                const data = {
                    value: ctrl.clModel,
                    meta: ctrl.clMeta,
                    $event,
                };
                ctrl.clBtnClick(data);
            }
        };
    },
});
angular.module('Cleep').component('configBasic', {
    transclude: true,
    template: function () {
        const formName = getFormName();
        return (`
        <div layout="column" layout-align="start stretch" layout-gt-xs="row" layout-align-gt-xs="start center" id="{{ $ctrl.clId }}" ng-class="$ctrl.style">
            <config-item-desc
                flex layout="row" layout-align="start-center"
                cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
                cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle"
                cl-loading="$ctrl.clLoading"
            ></config-item-desc>
            <div ng-if="!$ctrl.noForm" layout="row" layout-align="end center">
                <form name="` + formName + `" style="margin-bottom: 0px;">
                    <div flex="none" layout="row" layout-align="end center">
                        <ng-transclude flex layout="row" layout-align="end center"></ng-transclude>

                        <config-item-save-button
                            cl-btn-icon="$ctrl.clBtnIcon" cl-btn-style="$ctrl.clBtnStyle" cl-btn-click="$ctrl.clClick" cl-btn-tooltip="$ctrl.clBtnTooltip" cl-btn-disabled="$ctrl.clBtnDisabled"
                            cl-model="$ctrl.clModel" cl-meta="$ctrl.clMeta" cl-form-ref="` + formName + `">
                        </config-item-save-button>
                    </div>
                </form>
            </div>
            <div ng-if="$ctrl.noForm" layout="row" layout-align="end center" style="padding-right: 15px; flex: none;">
                <ng-transclude layout="row" layout-align="end center"></ng-transclude>

                <config-item-save-button
                    cl-btn-icon="$ctrl.clBtnIcon" cl-btn-style="$ctrl.clBtnStyle" cl-btn-click="$ctrl.clClick" cl-btn-tooltip="$ctrl.clBtnTooltip" cl-btn-disabled="$ctrl.clBtnDisabled"
                    cl-disabled="$ctrl.clDisabled" cl-model="$ctrl.clModel" cl-meta="$ctrl.clMeta" cl-form-ref="` + formName + `">
                </config-item-save-button>
            </div>
        </div>
        `);
    },
    bindings: {
        clId: '<',
        clTitle: '<',
        clSubtitle: '<',
        clIcon: '<',
        clIconStyle: '<',
        clModel: '<',
        clBtnStyle: '<',
        clBtnIcon: '<',
        clBtnTooltip: '<',
        clBtnDisabled: '<',
        clMeta: '<',
        clClick: '<',
        clNoForm: '<?',
        clStyle: '@?',
        clDisabled: '<',
        clLoading: '<?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.noForm = false;
        ctrl.style = 'config-item';

        ctrl.$onInit = function () {
            ctrl.noForm = !(!!ctrl.clClick) || !!ctrl.clNoForm;
            ctrl.style += ctrl.clStyle ? ' ' + ctrl.clStyle : '';
        };
    },
});

angular.module('Cleep').component('configButton', {
    template: `
        <div layout="column" layout-align="start stretch" layout-gt-xs="row" layout-align-gt-xs="start center" id="{{ $ctrl.clId }}" class="config-item">
            <config-item-desc
                flex layout="row" layout-align="start-center"
                cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
                cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle">
            </config-item-desc>
            <div flex="none" layout="row" layout-align="end center">
                <md-button ng-click="$ctrl.onClick($event)" class="{{ $ctrl.buttonStyle }}" ng-disabled="$ctrl.clDisabled">
                    <md-tooltip ng-if="$ctrl.clBtnTooltip">{{ $ctrl.clBtnTooltip }}</md-tooltip>
                    <cl-icon ng-if="$ctrl.clBtnIcon" cl-icon="{{ $ctrl.clBtnIcon }}"></cl-icon>
                    {{ $ctrl.clBtnLabel }}
                </md-button>
            </div>
        </div>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clBtnStyle: '@',
        clBtnIcon: '@',
        clBtnLabel: '@',
        clBtnTooltip: '@',
        clMeta: '<',
        clClick: '&?',
        clDisabled: '<',
    },
    controller: function () {
        const ctrl = this;

        ctrl.$onInit = function () {
            ctrl.buttonStyle = ctrl.clBtnStyle ?? 'md-primary md-raised';
            if (!ctrl.btnLabel) {
                ctrl.buttonStyle += ' cl-button-sm';
            }
        };

        ctrl.onClick = ($event) => {
            const data = {
                meta: ctrl.clMeta,
                $event,
            };
            (ctrl.clClick || angular.noop)(data);
        };
    },
});

angular.module('Cleep').component('configButtons', {
    template: `
        <div layout="column" layout-align="start stretch" layout-gt-xs="row" layout-align-gt-xs="start center" id="{{ $ctrl.clId }}" class="config-item">
            <config-item-desc
                flex layout="row" layout-align="start-center"
                cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
                cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle">
            </config-item-desc>
            <div flex="none" layout="row" layout-align="end center">
                <div ng-if="$ctrl.buttons.length <= $ctrl.limit" ng-repeat="button in $ctrl.buttons track by $index">
                    <md-button ng-click="$ctrl.onClick($event, button)" class="{{ button.color }} {{ button.style }} cl-button-sm" ng-disabled="button.disabled">
                        <md-tooltip ng-if="button.tooltip">{{ button.tooltip }}</md-tooltip>
                        <cl-icon ng-if="button.icon" cl-icon="{{ button.icon }}"></cl-icon>
                        {{ button.label }}
                    </md-button>
                </div>

                <div ng-if="$ctrl.buttons.length > $ctrl.limit">
                    <md-menu>
                        <md-button class="md-raised md-primary cl-button-sm" ng-click="$ctrl.openMenu($mdMenu, $event)">
                            <md-tooltip>Choose action</md-tooltip>
                            <cl-icon cl-icon="dots-vertical"></cl-icon>
                        </md-button>
                        <md-menu-content>
                            <md-menu-item ng-repeat="button in $ctrl.buttons track by $index">
                                <md-button ng-click="$ctrl.onClick($event, button)" class="{{ button.style }}" ng-disabled="button.disabled">
                                    <cl-icon ng-if="button.icon" cl-icon="{{ button.icon }}"></cl-icon>
                                    {{ button.label }}
                                </md-button>
                            </md-menu-item>
                        </md-menu-content>
                    </md-menu>
                </div>
            </div>
        </div>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clButtons: '<',
        clLimit: '@?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.buttons = [];
        ctrl.limit = 2;

        ctrl.$onInit = function () {
            ctrl.limit = ctrl.clLimit ?? 2;
        };

        ctrl.$onChanges = function (changes) {
            if (changes.clButtons) {
                ctrl.prepareButtons(changes.clButtons.currentValue || []);
            }
        };

        ctrl.prepareButtons = function (buttons) {
            if (!angular.isArray(buttons)) {
                console.error(
                    "[cleep] ConfigButtons '" +
                        ctrl.clId +
                        "' cl-buttons options must be an array"
                );
                return;
            }

            ctrl.buttons.splice(0, ctrl.buttons.length);
            for (const button of buttons) {
                ctrl.buttons.push({
                    style: button.style ?? (ctrl.collapse ? '' : 'md-raised md-primary'),
                    icon: button.icon,
                    label: button.label,
                    click: button.click,
                    meta: button.meta,
                    tooltip: button.tooltip,
                    disabled: button.disabled,
                });
            }
        };

        ctrl.onClick = function ($event, button) {
            if (!button.click || !angular.isFunction(button.click)) {
                console.error(
                    "[cleep] ConfigButtons '" + ctrl.clId + "' button has no click binded"
                );
                return;
            }
            const data = {
                meta: button.meta,
                $event,
            };
            callFunction(button.click, data);
        };

        ctrl.openMenu = function ($mdMenu, ev) {
            originatorEv = ev;
            $mdMenu.open(ev);
        };
    },
});

angular.module('Cleep').component('configSection', {
    template: `
        <div layout="row" layout-align="start center" id="{{ $ctrl.clId }}" class="config-item config-item-section">
            <div>
                <cl-icon cl-icon="{{ $ctrl.icon }}"></cl-icon>
            </div>
            <span flex>{{ $ctrl.clTitle }}</span>
            <md-button
                ng-if="$ctrl.hasAction"
                ng-click="$ctrl.onClick($event)"
                class="md-primary md-raised cl-button-sm config-section-action"
            >
                <cl-icon ng-if="$ctrl.clBtnIcon" cl-icon="{{ $ctrl.clBtnIcon }}"></cl-icon>
                {{ $ctrl.clBtnLabel }}
            </md-button>
        </div>
    `,
    bindings: {
        clTitle: '@',
        clIcon: '@',
        clBtnLabel: '@',
        clBtnIcon: '@',
        clClick: '&?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.icon = undefined;
        ctrl.hasAction = false;

        ctrl.$onInit = function () {
            ctrl.syncFromBindings();
        };

        ctrl.$onChanges = function (changes) {
            if (changes.clIcon || changes.clBtnLabel || changes.clBtnIcon) {
                ctrl.syncFromBindings();
            }
        };

        ctrl.syncFromBindings = function () {
            ctrl.icon = ctrl.clIcon || 'bookmark-outline';
            ctrl.hasAction = !!(ctrl.clBtnLabel || ctrl.clBtnIcon);
        };

        ctrl.onClick = ($event) => {
            (ctrl.clClick || angular.noop)({ $event });
        };
    },
});

angular.module('Cleep').component('configComment', {
    template: `
        <div layout="column" layout-align="start stretch" layout-gt-xs="row" layout-align-gt-xs="start center" id="{{ $ctrl.clId }}" class="config-item">
            <config-item-desc
                flex layout="row" layout-align="start-center"
                cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
                cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle">
            </config-item-desc>
            <div flex="none" layout="row" layout-align="end center">
                <span
                    ng-if="$ctrl.mode === 'markdown'"
                    marked="$ctrl.clComment"
                    md-colors="::{ background: 'primary-100-0.4'}" style="padding: 10px;"
                ></span>
                <span
                    ng-if="$ctrl.mode === 'html'" ng-bind-html="$ctrl.clComment"
                ></span>
                <span ng-if="$ctrl.mode === ''">
                    {{ $ctrl.clComment }}
                </span>
            </div>
        </div>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clComment: '<',
        clMode: '@',
    },
    controller: function () {
        const ctrl = this;
        ctrl.mode = '';

        ctrl.$onInit = function () {
            // Comments are plain status lines: no chevron unless cl-icon is set.
            // Pass cl-icon="" explicitly from parents that use '<' bindings, or omit to get ''.
            if (ctrl.clIcon == null) {
                ctrl.clIcon = '';
            }
            const mode = ctrl.clMode?.toLowerCase();
            if (mode === 'html') {
                ctrl.mode = 'html';
            } else if (mode === 'markdown') {
                ctrl.mode = 'markdown';
            } else {
                ctrl.mode = '';
            }
        };
    },
});

angular.module('Cleep').component('configNumber', {
    template: `
        <config-basic
            cl-id="$ctrl.clId" cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle"
            cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
            cl-model="$ctrl.clModel" cl-meta="$ctrl.clMeta" cl-click="$ctrl.clClick" cl-btn-disabled="$ctrl.clDisabled"
            cl-btn-style="$ctrl.clBtnStyle" cl-btn-icon="$ctrl.clBtnIcon" cl-btn-tooltip="$ctrl.clBtnTooltip"
        >
            <md-input-container ng-if="!$ctrl.doNotDisplay" class="config-input-container-no-margin">
                <input
                    ng-required="$ctrl.clRequired" ng-model="$ctrl.clModel" ng-disabled="$ctrl.clDisabled"
                    min="{{ $ctrl.clMin }}" max="{{ $ctrl.clMax }}" name="inputField"
                    type="number" style="width: 80px;" autocomplete="off"
                >
            </md-input-container>
        </config-basic>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clModel: '=',
        clMax: '<',
        clMin: '<',
        clRequired: '<',
        clBtnStyle: '@',
        clBtnIcon: '@',
        clBtnTooltip: '@',
        clMeta: '<',
        clClick: '&?',
        clDisabled: '<?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.doNotDisplay = false;

        ctrl.$onInit = function () {
            if (isNaN(ctrl.clModel)) {
                console.error(
                    "[cleep] ConfigNumber '" + ctrl.clId + "' cl-model must a number"
                );
                ctrl.doNotDisplay = true;
            }
        };
    },
});

angular.module('Cleep').component('configText', {
    template: `
        <config-basic
            cl-id="$ctrl.clId" cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle"
            cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
            cl-model="$ctrl.clModel" cl-meta="$ctrl.clMeta" cl-click="$ctrl.clClick" cl-btn-disabled="$ctrl.clDisabled"
            cl-btn-style="$ctrl.clBtnStyle" cl-btn-icon="$ctrl.clBtnIcon" cl-btn-tooltip="$ctrl.clBtnTooltip"
        >
            <md-input-container class="config-input-container-no-margin">
                <input
                    name="inputField" type="{{ $ctrl.inputType }}"
                    ng-required="$ctrl.clRequired" ng-minlength="$ctrl.clMin" ng-maxlength="$ctrl.clMax" ng-disabled="$ctrl.clDisabled"
                    ng-readonly="$ctrl.clReadonly"
                    ng-model="$ctrl.clModel" autocomplete="off" placeholder="{{ $ctrl.clPlaceholder }}"
                    ng-keydown="$ctrl.onKeydown($event)"
                >
            </md-input-container>
        </config-basic>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clModel: '=',
        clMax: '<',
        clMin: '<',
        clRequired: '<',
        clPassword: '<',
        clReadonly: '<?',
        clBtnStyle: '@',
        clBtnIcon: '@',
        clBtnTooltip: '@',
        clMeta: '<',
        clClick: '&?',
        clDisabled: '<?',
        clPlaceholder: '@?',
    },
    controller: function () {
        const ctrl = this;

        ctrl.$onInit = function () {
            ctrl.inputType = ctrl.clPassword ?? false ? 'password' : 'text';
        };

        ctrl.onKeydown = function ($event) {
            if (($event.key === 'Enter' || $event.keyCode === 13) && ctrl.clClick) {
                $event.preventDefault();
                ctrl.clClick({ value: ctrl.clModel, meta: ctrl.clMeta, $event: $event });
            }
        };
    },
});

angular.module('Cleep').component('configSlider', {
    template: `
        <config-basic
            cl-id="$ctrl.clId" cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle"
            cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
            cl-model="$ctrl.clModel" cl-meta="$ctrl.clMeta" cl-click="$ctrl.clClick" cl-btn-disabled="$ctrl.clDisabled"
            cl-btn-style="$ctrl.clBtnStyle" cl-btn-icon="$ctrl.clBtnIcon" cl-btn-tooltip="$ctrl.clBtnTooltip"
        >
            <md-slider-container style="padding-right: 8px;">
                <span>{{ $ctrl.clModel }}</span>
                <md-slider
                    name="inputField" md-discrete class="{{ $ctrl.sliderStyle }}"
                    min="{{ $ctrl.clMin }}" max="{{ $ctrl.clMax }}" step="{{ $ctrl.inputStep }}"
                    ng-model="$ctrl.clModel" ng-disabled="$ctrl.clDisabled" ng-change="$ctrl.onChange()">
                </md-slider>
            </md-slider-container>
        </config-basic>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clModel: '=',
        clMax: '<',
        clMin: '<',
        clStep: '<',
        clSliderStyle: '@',
        clBtnStyle: '@',
        clBtnIcon: '@',
        clBtnTooltip: '@',
        clMeta: '<',
        clClick: '&?',
        clDisabled: '<?',
        clOnChange: '&?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.inputStep = 1;
        ctrl.sliderStyle = '';

        ctrl.$onInit = function () {
            ctrl.inputStep = ctrl.clStep ?? 1;
            ctrl.sliderStyle = ctrl.clSliderStyle ?? 'md-primary';
        };

        ctrl.onChange = function () {
            const data = {
                value: ctrl.clModel,
                meta: ctrl.clMeta
            };
            (ctrl.clOnChange || angular.noop)(data);
        };
    },
});

angular.module('Cleep').component('configCheckbox', {
    template: `
        <config-basic
            cl-id="$ctrl.clId" cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle"
            cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
            cl-model="$ctrl.clModel" cl-meta="$ctrl.clMeta" cl-btn-disabled="$ctrl.clDisabled"
            cl-btn-style="$ctrl.clBtnStyle" cl-btn-icon="$ctrl.clBtnIcon" cl-btn-tooltip="$ctrl.clBtnTooltip"
        >
            <div layout="row" layout-align="end center" class="config-checkbox-control">
                <span
                    ng-if="$ctrl.front && $ctrl.clCaption"
                    class="config-checkbox-caption config-checkbox-caption-front"
                >{{ $ctrl.clCaption }}</span>
                <md-checkbox
                    aria-label="{{ $ctrl.clCaption || $ctrl.clTitle || 'checkbox' }}"
                    ng-change="$ctrl.onClick($event)"
                    ng-model="$ctrl.clModel"
                    ng-disabled="$ctrl.clDisabled"
                >
                    <span ng-if="!$ctrl.front">{{ $ctrl.clCaption }}</span>
                </md-checkbox>
            </div>
        </config-basic>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clModel: '=',
        clCaption: '@',
        /** When true, render cl-caption before the checkbox instead of after. */
        clFront: '<?',
        clSelectedValue: '@',
        clUnselectedValue: '@',
        clMeta: '<',
        clClick: '&?',
        clDisabled: '<?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.front = false;

        ctrl.$onInit = function() {
            ctrl.noForm = ctrl.clNoForm ?? false;
            ctrl.front = !!ctrl.clFront;
        };

        ctrl.$onChanges = function (changes) {
            if (changes.clFront) {
                ctrl.front = !!changes.clFront.currentValue;
            }
        };

        ctrl.onClick = ($event) => {
            const data = {
                value: ctrl.clModel ? (ctrl.clSelectedValue || true) : (ctrl.clUnselectedValue || false),
                meta: ctrl.clMeta,
                $event,
            };
            (ctrl.clClick || angular.noop)(data);
        };
    },
});

angular.module('Cleep').component('configSwitch', {
    template: `
        <config-basic
            cl-id="$ctrl.clId" cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle"
            cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
            cl-model="$ctrl.clModel" cl-meta="$ctrl.clMeta" cl-btn-disabled="$ctrl.clDisabled"
            cl-btn-style="$ctrl.clBtnStyle" cl-btn-icon="$ctrl.clBtnIcon" cl-btn-tooltip="$ctrl.clBtnTooltip"
        >
            <md-switch ng-change="$ctrl.onClick($event)" ng-model="$ctrl.clModel" ng-disabled="$ctrl.clDisabled" style="margin: 8px 0px;">
                {{ $ctrl.clCaption }}
            </md-switch>
        </config-basic>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clModel: '=',
        clCaption: '@',
        clOnValue: '@',
        clOffValue: '@',
        clMeta: '<',
        clClick: '&?',
        clDisabled: '<?',
    },
    controller: function () {
        const ctrl = this;

        ctrl.onClick = ($event) => {
            const data = {
                value: ctrl.clModel ? (ctrl.clOnValue || true) : (ctrl.clOffValue || false),
                meta: ctrl.clMeta,
                $event,
            };
            (ctrl.clClick || angular.noop)(data);
        };
    },
});

angular.module('Cleep').component('configSelect', {
    template: `
        <config-basic
            cl-id="$ctrl.clId" cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle"
            cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
            cl-model="$ctrl.clModel" cl-meta="$ctrl.clMeta" cl-click="$ctrl.clClick" cl-btn-disabled="$ctrl.clDisabled"
            cl-btn-style="$ctrl.clBtnStyle" cl-btn-icon="$ctrl.clBtnIcon" cl-btn-tooltip="$ctrl.clBtnTooltip"
        >
            <md-input-container class="config-input-container-no-margin">
                <md-select ng-if="$ctrl.isMultiple" name="inputField" multiple ng-required="$ctrl.clRequired" ng-model="$ctrl.clModel" ng-disabled="$ctrl.clDisabled" ng-change="$ctrl.onChange()" md-on-open="$ctrl.clampSelectMenu()" md-container-class="config-select-menu">
                    <md-option ng-repeat="option in $ctrl.options track by $index" ng-value="option.value" ng-disabled="option.disabled">
                        {{ option.label }}
                    </md-option>
                </md-select>
                <md-select ng-if="!$ctrl.isMultiple" name="inputField" ng-required="$ctrl.clRequired" ng-model="$ctrl.clModel" ng-disabled="$ctrl.clDisabled" ng-change="$ctrl.onChange()" md-on-open="$ctrl.clampSelectMenu()" md-container-class="config-select-menu">
                    <!-- ng-value="''" (not value="") so Material shows the label when model is empty string -->
                    <md-option ng-if="$ctrl.displayEmpty" ng-value="''">
                        <em>{{ $ctrl.empty }}</em>
                    </md-option>
                    <md-option ng-repeat="option in $ctrl.options track by $index" ng-value="option.value" ng-disabled="option.disabled">
                        {{ option.label }}
                    </md-option>
                </md-select>
            </md-input-container>
            <md-button ng-if="$ctrl.showSelectAll" class="md-icon-button" ng-click="$ctrl.selectAll()" ng-disabled="$ctrl.clDisabled">
                <cl-icon cl-icon="check-all"></cl-icon>
                <md-tooltip>Select all</md-tooltip>
            </md-button>
        </config-basic>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clModel: '=',
        clRequired: '<',
        clOptions: '<',
        clBtnStyle: '@',
        clBtnIcon: '@',
        clBtnTooltip: '@',
        clMeta: '<',
        clClick: '&?',
        clDisabled: '<?',
        clNoSelectAll: '<',
        clEmpty: '@?',
        clChange: '&?',
    },
    controller: ['$timeout', function ($timeout) {
        const ctrl = this;
        ctrl.options = [];
        ctrl.isMultiple = false;
        ctrl.showSelectAll = false;
        ctrl.displayEmpty = false;
        ctrl.empty = '';

        ctrl.$onInit = function () {
            ctrl.isMultiple = angular.isArray(ctrl.clModel);
            ctrl.showSelectAll = ctrl.isMultiple && !(ctrl.clNoSelectAll ?? false);
        };

        ctrl.$onChanges = function (changes) {
            if (changes.clOptions) {
                ctrl.setOptions(changes.clOptions.currentValue || []);
            }
            if (changes.clEmpty) {
                ctrl.setDisplayEmpty();
            }
        };

        ctrl.setOptions = function (options) {
            ctrl.options.splice(0, ctrl.options.length);
            if (!options?.length) {
                ctrl.setDisplayEmpty();
                return;
            }

            const firstOption = options[0];

            if (!angular.isObject(firstOption)) {
                // array of simple values
                for (const option of options) {
                    ctrl.options.push({
                        label: option,
                        value: option,
                        disabled: false,
                    });
                }
            } else {
                // array of object. Assume that it respects awaited format
                for (const option of options) {
                    ctrl.options.push({
                        label: option.label ?? 'No label',
                        value: option.value ?? 'No value',
                        disabled: !!option.disabled,
                    });
                }
            }
            ctrl.setDisplayEmpty();
        };

        ctrl.setDisplayEmpty = function () {
            // Explicit cl-empty → always offer a blank value (Automatic / None), even
            // when the list has entries. Otherwise only show a placeholder if empty.
            if (ctrl.clEmpty !== undefined && ctrl.clEmpty !== null) {
                ctrl.empty = ctrl.clEmpty;
                ctrl.displayEmpty = true;
            } else {
                ctrl.empty = 'No item in list';
                ctrl.displayEmpty = ctrl.options.length === 0;
            }
        };

        ctrl.selectAll = function () {
            const selectableOptions = ctrl.options.filter((option) => !option.disabled);
            const fill = ctrl.clModel?.length !== selectableOptions.length;
            ctrl.clModel?.splice(0, ctrl.clModel.length);
            if (fill) {
                selectableOptions.forEach((option) => ctrl.clModel?.push(option.value));
            }
        };

        // AngularJS Material often anchors the menu on the trigger and does not
        // flip horizontally when the select sits on the right of a config row.
        ctrl.clampSelectMenu = function () {
            $timeout(function () {
                const el = document.querySelector('.md-select-menu-container.config-select-menu.md-active');
                if (!el) {
                    return;
                }
                const margin = 8;
                const rect = el.getBoundingClientRect();
                const overflowRight = rect.right - (window.innerWidth - margin);
                if (overflowRight > 0) {
                    el.style.left = Math.max(margin, rect.left - overflowRight) + 'px';
                }
            }, 50);
        };

        ctrl.onChange = function() {
            const data = {
                ...(ctrl.isMultiple && { values: ctrl.clModel }),
                ...(!ctrl.isMultiple && { value: ctrl.clModel }),
                meta: ctrl.clMeta || {},
            };
            (ctrl.clChange || angular.noop)(data);
        };
    }],
});

angular.module('Cleep').component('configDate', {
    template: `
        <config-basic
            cl-id="$ctrl.clId" cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle"
            cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
            cl-model="$ctrl.clModel" cl-meta="$ctrl.clMeta" cl-click="$ctrl.clClick" cl-btn-disabled="$ctrl.clDisabled"
            cl-btn-style="$ctrl.clBtnStyle" cl-btn-icon="$ctrl.clBtnIcon" cl-btn-tooltip="$ctrl.clBtnTooltip"
        >
            <div>
            <md-datepicker
                name="inputField"
                ng-model="$ctrl.clModel" ng-required="$ctrl.clRequired" md-min-date="$ctrl.clMin" md-max-date="$ctrl.clMax"
                md-mode="$ctrl.inMode" md-hide-icons="calendar" ng-disabled="$ctrl.clDisabled">
            </md-datepicker>
            </div>
        </config-basic>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clModel: '=',
        clMax: '<',
        clMin: '<',
        clRequired: '<',
        clBtnStyle: '@',
        clBtnIcon: '@',
        clBtnTooltip: '@',
        clMeta: '<',
        clClick: '&?',
        clDisabled: '<?'
    },
});

angular.module('Cleep').component('configTime', {
    template: `
        <config-basic
            cl-id="$ctrl.clId" cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle"
            cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
            cl-model="$ctrl.clModel" cl-meta="$ctrl.clMeta" cl-click="$ctrl.clClick" cl-btn-disabled="$ctrl.clDisabled"
            cl-btn-style="$ctrl.clBtnStyle" cl-btn-icon="$ctrl.clBtnIcon" cl-btn-tooltip="$ctrl.clBtnTooltip"
        >
            <md-input-container class="config-input-container-no-margin">
                <input
                    ng-required="$ctrl.clRequired" ng-model="$ctrl.clModel"
                    ng-min="$ctrl.clMin" ng-max="$ctrl.clMax" name="inputField"
                    type="time" ng-disabled="$ctrl.clDisabled"
                >
            </md-input-container>
        </config-basic>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clModel: '=',
        clMax: '<',
        clMin: '<',
        clRequired: '<',
        clShowSeconds: '<',
        clShowMilliseconds: '<',
        clBtnStyle: '@',
        clBtnIcon: '@',
        clBtnTooltip: '@',
        clMeta: '<',
        clClick: '&?',
        clDisabled: '<?',
    },
    controller: function () {
        const ctrl = this;

        ctrl.$onInit = function () {
            if (!(ctrl.clModel instanceof Date)) {
                console.error(
                    "[cleep] ConfigTime '" +
                        ctrl.clId +
                        "' cl-model must be a Date instance"
                );
            } else {
                // apply date options
                ctrl.clModel.setMilliseconds(ctrl.clShowMilliseconds ?? false);
                ctrl.clModel.setSeconds(
                    (ctrl.clShowSeconds || ctrl.clShowMilliseconds) ?? false
                );
            }
        };
    },
});

angular.module('Cleep').component('configNote', {
    template: `
        <div layout="row" layout-align="start center" id="{{ $ctrl.clId }}" ng-class="$ctrl.class">
            <cl-icon ng-if="$ctrl.clIcon" cl-icon="{{ $ctrl.clIcon }}" flex="none" style="margin:10px 20px 10px 10px;" cl-class="icon-md {{ $ctrl.clIconStyle }}"></cl-icon>
            <img
                ng-if="$ctrl.clImgSrc"
                ng-src="{{ $ctrl.clImgSrc }}"
                width="{{ $ctrl.clImgWidth || 64 }}"
                alt=""
                flex="none"
                style="margin:10px 20px 10px 10px;"
            />
            <div flex layout="column" layout-align="start stretch"><span ng-bind-html="$ctrl.clNote"></span></div>
        </div>
    `,
    bindings: {
        clId: '@',
        clIcon: '@?',
        clIconStyle: '@?',
        clImgSrc: '@?',
        clImgWidth: '@?',
        clNote: '@',
        clType: '@?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.types = {
            none: 'config-item config-item-note-none',
            note: 'config-item config-item-note-note',
            info: 'config-item config-item-note-info',
            success: 'config-item config-item-note-success',
            warning: 'config-item config-item-note-warning',
            error: 'config-item config-item-note-error',
        };
        ctrl.class = ctrl.types[0];

        ctrl.$onInit = function () {
            const type = Object.keys(ctrl.types).includes(ctrl.clType)
                ? ctrl.clType
                : 'note';
            ctrl.class = ctrl.types[type];
        };
    },
});

angular.module('Cleep').component('configProgress', {
    template: `
        <config-basic
            cl-id="$ctrl.clId" cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle"
            cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
            cl-model="$ctrl.clModel" cl-meta="$ctrl.clMeta" cl-click="$ctrl.clCancel" cl-no-form="true"
            cl-btn-style="$ctrl.buttonStyle" cl-btn-icon="$ctrl.buttonIcon" cl-btn-tooltip="$ctrl.buttonTooltip"
            cl-btn-disabled="$ctrl.disabled"
        >
            <span ng-if="$ctrl.showPercent" class="config-progress-percent">{{ $ctrl.percentLabel }}</span>
            <md-progress-linear
                class="config-progress-bar {{ $ctrl.style }}"
                md-mode="{{ $ctrl.mode }}"
                value="{{ $ctrl.clModel }}"
            ></md-progress-linear>
        </config-basic>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clModel: '<',
        clInfinite: '<?',
        clShowPercent: '<?',
        clBtnStyle: '@',
        clBtnIcon: '@',
        clBtnTooltip: '@',
        clBtnDisabled: '<?',
        clMeta: '<',
        clCancel: '&?',
        clStyle: '@?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.disabled = true;
        ctrl.showPercent = false;
        ctrl.percentLabel = '0%';

        ctrl.$onInit = function () {
            ctrl.buttonStyle = ctrl.clBtnStyle || 'md-primary md-raised';
            ctrl.buttonIcon = ctrl.clBtnIcon || 'cancel';
            ctrl.buttonTooltip = ctrl.clBtnTooltip || 'Cancel';
            ctrl.mode = ctrl.clInfinite ? 'indeterminate' : 'determinate';
            ctrl.style = ctrl.clStyle || 'md-primary';
            ctrl.refreshUi();
        };

        ctrl.$onChanges = function () {
            ctrl.mode = ctrl.clInfinite ? 'indeterminate' : 'determinate';
            if (ctrl.clBtnTooltip) {
                ctrl.buttonTooltip = ctrl.clBtnTooltip;
            }
            ctrl.refreshUi();
        };

        ctrl.refreshUi = function () {
            ctrl.showPercent = !!ctrl.clShowPercent && !ctrl.clInfinite;
            const value = Number(ctrl.clModel);
            const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
            ctrl.percentLabel = percent + '%';

            // Explicit cl-btn-disabled wins (e.g. install: only during download).
            if (ctrl.clBtnDisabled === true) {
                ctrl.disabled = true;
                return;
            }
            if (ctrl.clBtnDisabled === false) {
                ctrl.disabled = false;
                return;
            }
            ctrl.disabled = !(percent > 0 && percent < 100);
        };
    },
});

angular.module('Cleep').component('configChips', {
    template: `
        <config-basic
            cl-id="$ctrl.clId" cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle"
            cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
            cl-model="$ctrl.clModel" cl-meta="$ctrl.clMeta" cl-click="$ctrl.clClick" cl-no-form="true"
            cl-btn-style="$ctrl.clBtnStyle" cl-btn-icon="$ctrl.clBtnIcon"
            cl-btn-tooltip="$ctrl.clBtnTooltip"
        >
            <md-chips
                ng-model="$ctrl.clModel" placeholder="{{ $ctrl.placeholder }}"
                readonly="$ctrl.readonly" md-removable="$ctrl.removable">
            </md-chips>
        </config-basic>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clModel: '=',
        clReadonly: '<',
        clRemovable: '<',
        clRequired: '<',
        clPlaceholder: '@',
        clBtnStyle: '@',
        clBtnIcon: '@',
        clBtnTooltip: '@',
        clMeta: '<',
        clClick: '&?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.removable = false;
        ctrl.readonly = true;

        ctrl.$onInit = function () {
            ctrl.required = ctrl.clRequired ?? false;
            ctrl.readonly = ctrl.clReadonly ?? true;
            ctrl.removable = ctrl.clRemovable ?? false;
            ctrl.placeholder = ctrl.clPlaceholder ?? 'Type new entry';
        };
    },
});

angular.module('Cleep').component('configList', {
    template: `
        <config-basic
            ng-if="$ctrl.displayEmpty"
            cl-title="$ctrl.empty" cl-icon="$ctrl.emptyIcon"
        ></config-basic>
        <config-basic ng-repeat="item in $ctrl.items track by $index"
            cl-title="item.title" cl-subtitle="item.subtitle"
            cl-icon="item.icon" cl-icon-style="item.iconStyle"
            cl-style="config-list-item" cl-loading="item.loading"
        >
            <md-button
                ng-if="item.clicks.length>0"
                ng-repeat="click in item.clicks track by $index"
                ng-disabled="click.disabled"
                ng-click="$ctrl.onClick($event, click, item, $index)"
                class="md-secondary md-icon-button {{ click.style }}"
            >
                <md-tooltip ng-if="click.tooltip">{{ click.tooltip }}</md-tooltip>
                <cl-icon cl-icon="{{ click.icon }}"></cl-icon>
            </md-button>
            <md-checkbox ng-if="$ctrl.clSelectable" class="md-secondary" ng-model="$ctrl.selected[$index]" ng-change="$ctrl.onSelect($index)">
                {{ item.label }}
            </md-checkbox>
        </config-basic>
    `,
    bindings: {
        clId: '@',
        clItems: '<',
        clSelectable: '<',
        clOnSelect: '&?',
        clEmpty: '@?',
        clEmptyIcon: '@?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.selected = [];
        ctrl.items = [];
        ctrl.displayEmpty = false;
        ctrl.emptyIcon = 'playlist-remove';
        ctrl.empty = '';

        ctrl.$onInit = function () {
            ctrl.prepareSelected(ctrl.clItems);
        };

        ctrl.$onChanges = function (changes) {
            if (changes.clItems) {
                ctrl.setItems(changes.clItems.currentValue || []);
                ctrl.prepareSelected(changes.clItems.currentValue || []);
            }
            if (changes.clEmpty) {
                ctrl.setDisplayEmpty();
            }
            if (changes.clEmptyIcon) {
                ctrl.emptyIcon = ctrl.clEmptyIcon;
            }
        };

        ctrl.setItems = function (items) {
            // for non object items list, bind value to title field
            ctrl.items.splice(0, ctrl.items.length);
            for (const item of items) {
                if (angular.isObject(item)) {
                    ctrl.items.push(item);
                } else {
                    ctrl.items.push({
                        title: item.toString(),
                    });
                }
            }
            ctrl.setDisplayEmpty();
        };

        ctrl.setDisplayEmpty = function () {
            ctrl.empty = ctrl.clEmpty ?? 'No item in list';
            ctrl.displayEmpty = ctrl.empty.length !== 0 && ctrl.items.length === 0;
        };

        ctrl.prepareSelected = function (items) {
            if (ctrl.clSelectable) {
                ctrl.selected.splice(0, ctrl.selected.length);
                items.forEach((item) => ctrl.selected.push(!!item.selected));
            }
        };

        ctrl.onSelect = function (index) {
            const data = {
                value: ctrl.selected[index],
                current: ctrl.clItems[index],
                selections: ctrl.selected,
                index,
            };
            (ctrl.clOnSelect || angular.noop)(data);
        };

        ctrl.onClick = function ($event, click, item, index) {
            const data = {
                item,
                index,
                meta: click.meta || item.meta || undefined,
                $event,
            };
            callFunction(click.click || angular.noop, data);
        };
    },
});

angular.module('Cleep').component('configBaseViewer', {
    transclude: true,
    template: `
    <md-content layout-fill>
        <md-toolbar class="md-hue-3">
            <div class="md-toolbar-tools">
                <h2 flex md-truncate>{{ $ctrl.clTitle }}</h2>
                <md-button
                    ng-repeat="btn in $ctrl.btns"
                    ng-class="btn.style"
                    ng-click="$ctrl.onClick($event, btn)"
                >
                    <cl-icon ng-if="btn.icon" class="icon-white" cl-icon="{{ btn.icon }}"></cl-icon>
                    {{ btn.label }}
                </md-button>
            </div>
        </md-toolbar>
        <ng-transclude layout-fill>Please inject your editor</ng-transclude>
    </md-content>
    `,
    bindings: {
        clTitle: '<?',
        clButtons: '<?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.btns = [];

        ctrl.$onChanges = function (changes) {
            if (changes.clButtons) {
                ctrl.prepareButtons(changes.clButtons.currentValue || []);
            }
        };

        ctrl.prepareButtons = function (buttons) {
            ctrl.btns.splice(0, ctrl.btns.length);
            if (!angular.isArray(buttons)) {
                return;
            }
            for (const btn of buttons) {
                ctrl.btns.push({
                    label: btn.label ?? '',
                    style: btn.style ?? 'md-primary md-raised',
                    icon: btn.icon,
                    click: btn.click,
                });
            }
        };

        ctrl.onClick = ($event, button) => {
            callFunction(button.click || angular.noop, button.meta);
        };
    },
});

angular.module('Cleep').component('configHtmlViewer', {
    template: `
    <config-base-viewer cl-buttons="$ctrl.clButtons" cl-title="$ctrl.clTitle">
        <div layout-fill md-colors="::{ background: 'primary-100-0.4'}">
        </div>
    </config-base-viewer>
    `,
    bindings: {
        clTitle: '@?',
        clButtons: '<?',
        clHtml: '@',
        clEmpty: '@?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.html = 'No html';

        ctrl.$onChanges = function (changes) {
            if (changes.clHtml?.currentValue.length) {
                ctrl.html = changes.clHtml?.currentValue;
            } else {
                ctrl.html = ctrl.clEmpty ?? 'No html';
            }
        };
    },
});

angular.module('Cleep').component('configTextViewer', {
    template: `
    <config-base-viewer cl-buttons="$ctrl.clButtons" cl-title="$ctrl.clTitle">
        <div layout-fill md-colors="::{ background: 'primary-100-0.4'}">
            <div ng-if="!$ctrl.isHtml" ng-class="$ctrl.clStyle" style="white-space: pre;" layout-padding>{{ $ctrl.text }}</div>
            <div ng-if="$ctrl.isHtml" layout-padding style="display: inline-block;" ng-bind-html="$ctrl.text"></div>
        </div>
    </config-base-viewer>
    `,
    bindings: {
        clTitle: '@?',
        clButtons: '<?',
        clText: '@',
        clEmpty: '@?',
        clStyle: '@?',
        clIsHtml: '<?',
    },
    controller: function () {
        const ctrl = this;
        ctrl.text = 'No text';
        ctrl.isHtml = false;

        ctrl.$onChanges = function (changes) {
            if (changes.clIsHtml?.currentValue !== undefined) {
                ctrl.isHtml = !!changes.clIsHtml.currentValue;
            }
            if (changes.clText?.currentValue?.length) {
                ctrl.text = changes.clText.currentValue;
            } else {
                ctrl.text = ctrl.clEmpty ?? 'No text';
            }
        };
    },
});

angular.module('Cleep').component('configFile', {
    template: `
        <config-basic
            cl-id="$ctrl.clId" cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle"
            cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle" cl-no-form="true"
        >
            <cl-app-upload
                cl-on-select="$ctrl.onClick(file)" cl-disabled="$clDisabled"
                cl-btn-label="{{ $ctrl.clBtnLabel }}" cl-btn-style="{{ $ctrl.clBtnStyle }}" cl-btn-icon="{{ $ctrl.clBtnIcon }}"
            ></cl-app-upload>
        </config-basic>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clBtnStyle: '@',
        clBtnIcon: '@',
        clBtnLabel: '@',
        clMeta: '<',
        clClick: '&?',
        clDisabled: '<',
    },
    controller: function () {
        const ctrl = this;
        ctrl.text = 'No text';
        ctrl.isHtml = false;

        ctrl.$onChanges = function (changes) {
            if (changes.clIsHtml?.currentValue !== undefined) {
                ctrl.isHtml = !!changes.clIsHtml.currentValue;
            }
            if (changes.clText?.currentValue?.length) {
                ctrl.text = changes.clText.currentValue;
            } else {
                ctrl.text = ctrl.clEmpty ?? 'No text';
            }
        };

        ctrl.onClick = function (file) {
            const data = {
                ...ctrl.clMeta,
                file,
            }
            ctrl.clClick(data);
        };
    },
});

/**
 * Tab group rendered with Angular Material md-tabs.
 *
 * config-tab is a marker element. Its markup is moved into md-tab so Material
 * can compile the panels itself. cl-selected is the id of the active tab.
 * The tab opened on load is the query parameter "tab" when it matches a
 * config-tab id. Otherwise the first tab is shown. Changing tab updates
 * that query parameter so the URL stays shareable / reloadable.
 *
 *   <config-tabs cl-selected="$ctrl.tab">
 *       <config-tab cl-id="general" cl-label="General" cl-icon="cog">
 *           <config-text cl-title="Name" cl-model="$ctrl.name"></config-text>
 *       </config-tab>
 *   </config-tabs>
 */
angular.module('Cleep').directive('configTabs', ['$compile', '$interpolate', '$location', '$timeout', '$rootScope',
function ($compile, $interpolate, $location, $timeout, $rootScope) {
    return {
        restrict: 'E',
        terminal: true,
        priority: 1000,
        scope: {
            clSelected: '=?',
        },
        link: function (scope, element) {
            const pageScope = scope.$parent;
            const tabs = [];

            angular.forEach(element.children(), function (node) {
                const el = angular.element(node);
                if (el[0].tagName.toLowerCase() !== 'config-tab') {
                    return;
                }
                const id = $interpolate(el.attr('cl-id') || '')(pageScope) || String(tabs.length);
                tabs.push({
                    id: id,
                    label: $interpolate(el.attr('cl-label') || '')(pageScope) || id,
                    icon: $interpolate(el.attr('cl-icon') || '')(pageScope),
                    html: el.html(),
                });
            });

            element.empty();
            element.addClass('config-tabs');
            if (!tabs.length) {
                return;
            }

            const viewScope = pageScope.$new();
            // Prefer bound cl-selected (e.g. preferences modal { tab: 'vault' }),
            // then ?tab= URL, then first tab.
            const fromBinding = typeof scope.clSelected === 'string'
                ? tabs.findIndex((tab) => tab.id === scope.clSelected)
                : -1;
            const requested = $location.search().tab;
            const requestedIndex = typeof requested === 'string'
                ? tabs.findIndex((tab) => tab.id === requested)
                : -1;
            const initialIndex = fromBinding >= 0
                ? fromBinding
                : (requestedIndex >= 0 ? requestedIndex : 0);
            viewScope.selectedIndex = initialIndex;
            scope.clSelected = tabs[initialIndex].id;

            // Leaflet and similar widgets init while the panel is hidden; tell them
            // when a tab is actually shown so they can recalculate their size.
            const notifyTabShown = function (tabId) {
                $timeout(function () {
                    $rootScope.$broadcast('config-tabs:shown', tabId);
                }, 50);
            };

            const syncTabInUrl = function (tabId) {
                if (!tabId || $location.search().tab === tabId) {
                    return;
                }
                $location.search('tab', tabId).replace();
            };

            const tabsEl = angular.element(
                '<md-tabs md-dynamic-height md-border-bottom md-selected="selectedIndex"></md-tabs>'
            );
            tabs.forEach(function (tab) {
                const mdTab = angular.element('<md-tab></md-tab>');
                const label = angular.element('<md-tab-label></md-tab-label>');
                if (tab.icon) {
                    const icon = angular.element('<cl-icon></cl-icon>');
                    icon.attr('cl-icon', tab.icon);
                    label.append(icon);
                }
                label.append(angular.element('<span></span>').text(tab.label));
                const body = angular.element('<md-tab-body></md-tab-body>');
                body.html(tab.html);
                mdTab.append(label).append(body);
                tabsEl.append(mdTab);
            });

            element.append($compile(tabsEl)(viewScope));
            notifyTabShown(tabs[initialIndex].id);
            syncTabInUrl(tabs[initialIndex].id);

            scope.$watch('clSelected', function (id) {
                const index = tabs.findIndex((tab) => tab.id === id);
                if (index >= 0 && viewScope.selectedIndex !== index) {
                    viewScope.selectedIndex = index;
                }
            });
            viewScope.$watch('selectedIndex', function (index, previous) {
                const tab = tabs[index];
                if (tab && scope.clSelected !== tab.id) {
                    scope.clSelected = tab.id;
                }
                if (tab && index !== previous) {
                    notifyTabShown(tab.id);
                    syncTabInUrl(tab.id);
                }
            });
            scope.$on('$destroy', function () {
                viewScope.$destroy();
            });
        },
    };
}]);

/**
 * Collapsible panel for grouping config items.
 *
 * Usage:
 *   <config-collapse cl-title="Advanced" cl-subtitle="Optional" cl-icon="cog" cl-opened="$ctrl.open">
 *       <config-text ...></config-text>
 *   </config-collapse>
 */
angular.module('Cleep').component('configCollapse', {
    transclude: true,
    template: `
        <div id="{{ $ctrl.clId }}" class="config-collapse" ng-class="{ 'config-collapse-opened': $ctrl.clOpened, 'config-collapse-disabled': $ctrl.clDisabled }">
            <div
                class="config-item config-collapse-header"
                layout="row" layout-align="start center"
                ng-click="$ctrl.toggle()"
                role="button"
                aria-expanded="{{ !!$ctrl.clOpened }}"
            >
                <config-item-desc
                    flex layout="row" layout-align="start center"
                    cl-icon="$ctrl.clIcon" cl-icon-style="$ctrl.clIconStyle"
                    cl-title="$ctrl.clTitle" cl-subtitle="$ctrl.clSubtitle">
                </config-item-desc>
                <cl-icon
                    flex="none"
                    cl-icon="{{ $ctrl.clOpened ? 'chevron-up' : 'chevron-down' }}"
                    cl-class="config-collapse-chevron"
                ></cl-icon>
            </div>
            <div class="config-collapse-body" ng-show="$ctrl.clOpened" ng-transclude></div>
        </div>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clOpened: '=?',
        clDisabled: '<?',
    },
    controller: function () {
        const ctrl = this;

        ctrl.$onInit = function () {
            if (ctrl.clOpened === undefined || ctrl.clOpened === null) {
                ctrl.clOpened = false;
            }
        };

        ctrl.toggle = function () {
            if (ctrl.clDisabled) {
                return;
            }
            ctrl.clOpened = !ctrl.clOpened;
        };
    },
});

/**
 * Data table for config pages (same left title/icon layout as other config items).
 *
 * Columns (cl-columns), any of:
 *   - [{id: 'name', label: 'Name'}, ...]
 *   - {name: 'Name', age: 'Age'}
 *   - omitted / empty → no header row
 *
 * Rows (cl-rows), any of:
 *   - [{name: 'Alice', age: 30}, ...]
 *   - {name: 'Alice', age: 30}  (single row)
 *   - [['Alice', 30], ...]     (order matches columns)
 *   - [{colId: 'name', value: 'Alice'}, ...]  (single row as cells)
 *   - [[{colId: 'name', value: 'Alice'}, ...], ...]
 *
 *   <config-table
 *       cl-title="Devices"
 *       cl-subtitle="Online peers"
 *       cl-icon="table"
 *       cl-columns="$ctrl.columns"
 *       cl-rows="$ctrl.rows"
 *       cl-border="true"
 *       cl-header-color="#EEEEEE">
 *   </config-table>
 */
angular.module('Cleep').component('configTable', {
    template: `
        <div
            id="{{ $ctrl.clId }}"
            class="config-item config-table-item"
            layout="column"
            layout-align="start stretch"
            layout-gt-xs="row"
            layout-align-gt-xs="start start"
        >
            <config-item-desc
                flex="none"
                layout="row"
                layout-align="start center"
                cl-icon="$ctrl.clIcon"
                cl-icon-style="$ctrl.clIconStyle"
                cl-title="$ctrl.clTitle"
                cl-subtitle="$ctrl.clSubtitle"
            ></config-item-desc>
            <div
                flex
                class="config-table"
                ng-class="{ 'config-table-bordered': $ctrl.border }"
                ng-if="$ctrl.hasRows"
            >
                <table>
                    <thead ng-if="$ctrl.showHeader">
                        <tr>
                            <th
                                ng-repeat="col in $ctrl.columns track by col.id"
                                ng-style="{ 'background-color': $ctrl.headerColor }"
                            >{{ col.label }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr ng-repeat="row in $ctrl.rows track by $index">
                            <td ng-repeat="col in $ctrl.columns track by col.id">{{ row[col.id] }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `,
    bindings: {
        clId: '@',
        clTitle: '@',
        clSubtitle: '@',
        clIcon: '@',
        clIconStyle: '@',
        clColumns: '<?',
        clRows: '<?',
        clBorder: '<?',
        clHeaderColor: '@?',
    },
    controller: function () {
        const ctrl = this;
        // Same light grey as .widget-bg-color in cleep.css
        ctrl.DEFAULT_HEADER_COLOR = '#EEEEEE';
        ctrl.columns = [];
        ctrl.rows = [];
        ctrl.showHeader = false;
        ctrl.hasRows = false;
        ctrl.border = true;
        ctrl.headerColor = ctrl.DEFAULT_HEADER_COLOR;

        ctrl.$onInit = function () {
            ctrl.refresh();
        };

        ctrl.$onChanges = function () {
            ctrl.refresh();
        };

        ctrl.refresh = function () {
            const columns = ctrl.normalizeColumns(ctrl.clColumns);
            const rows = ctrl.normalizeRows(ctrl.clRows, columns);
            ctrl.showHeader = columns.length > 0 && ctrl.hasExplicitColumns(ctrl.clColumns);
            ctrl.columns = columns.length
                ? columns
                : ctrl.inferColumnsFromRows(rows);
            ctrl.rows = rows;
            ctrl.hasRows = rows.length > 0;
            ctrl.border = ctrl.parseBorder(ctrl.clBorder);
            ctrl.headerColor = ctrl.clHeaderColor || ctrl.DEFAULT_HEADER_COLOR;
        };

        ctrl.parseBorder = function (value) {
            if (value === undefined || value === null || value === '') {
                return true;
            }
            if (value === false || value === 0 || value === 'false' || value === '0') {
                return false;
            }
            return true;
        };

        ctrl.hasExplicitColumns = function (raw) {
            if (raw === undefined || raw === null) {
                return false;
            }
            if (angular.isArray(raw)) {
                return raw.length > 0;
            }
            if (angular.isObject(raw)) {
                return Object.keys(raw).length > 0;
            }
            return false;
        };

        ctrl.normalizeColumns = function (raw) {
            if (!ctrl.hasExplicitColumns(raw)) {
                return [];
            }
            if (angular.isArray(raw)) {
                return raw
                    .map(function (col, index) {
                        if (angular.isString(col)) {
                            return { id: col, label: col };
                        }
                        if (!angular.isObject(col)) {
                            return null;
                        }
                        const id = col.id != null ? String(col.id) : String(index);
                        return {
                            id: id,
                            label: col.label != null ? String(col.label) : id,
                        };
                    })
                    .filter(Boolean);
            }
            return Object.keys(raw).map(function (id) {
                return { id: id, label: String(raw[id]) };
            });
        };

        ctrl.inferColumnsFromRows = function (rows) {
            if (!rows.length) {
                return [];
            }
            return Object.keys(rows[0]).map(function (id) {
                return { id: id, label: id };
            });
        };

        ctrl.formatCell = function (value) {
            if (value === undefined || value === null) {
                return '';
            }
            if (angular.isObject(value)) {
                try {
                    return JSON.stringify(value);
                } catch (e) {
                    return String(value);
                }
            }
            return value;
        };

        ctrl.rowFromCells = function (cells) {
            const row = {};
            if (!angular.isArray(cells)) {
                return row;
            }
            cells.forEach(function (cell) {
                if (!angular.isObject(cell) || cell.colId === undefined) {
                    return;
                }
                row[String(cell.colId)] = ctrl.formatCell(cell.value);
            });
            return row;
        };

        ctrl.isCellDescriptorList = function (value) {
            return (
                angular.isArray(value) &&
                value.length > 0 &&
                angular.isObject(value[0]) &&
                value[0].colId !== undefined
            );
        };

        ctrl.normalizeRows = function (raw, columns) {
            if (raw === undefined || raw === null) {
                return [];
            }

            // Single row as cell descriptors: [{colId, value}, ...]
            if (ctrl.isCellDescriptorList(raw)) {
                return [ctrl.rowFromCells(raw)];
            }

            // Single row object: {colId: value, ...}
            if (angular.isObject(raw) && !angular.isArray(raw)) {
                const row = {};
                Object.keys(raw).forEach(function (key) {
                    row[key] = ctrl.formatCell(raw[key]);
                });
                return [row];
            }

            if (!angular.isArray(raw)) {
                return [];
            }

            return raw
                .map(function (entry) {
                    if (ctrl.isCellDescriptorList(entry)) {
                        return ctrl.rowFromCells(entry);
                    }
                    if (angular.isArray(entry)) {
                        const row = {};
                        entry.forEach(function (value, index) {
                            const id = columns[index]
                                ? columns[index].id
                                : String(index);
                            row[id] = ctrl.formatCell(value);
                        });
                        return row;
                    }
                    if (angular.isObject(entry)) {
                        const row = {};
                        Object.keys(entry).forEach(function (key) {
                            row[key] = ctrl.formatCell(entry[key]);
                        });
                        return row;
                    }
                    return null;
                })
                .filter(Boolean);
        };
    },
});
