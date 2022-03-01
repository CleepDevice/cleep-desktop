/**
 * Task panel displays a permanent panel centered on bottom page
 * Panel can display multiple lines
 * This panel can be closed by user if option enabled
 * This panel can display a progress linebar to display action in progress
 */
angular
.module('Cleep')
.service('tasksPanelService', ['$mdPanel', function($mdPanel) {
    var self = this;
    self.mdPanelRef = null;
    self.panels = {};
    self.panelSize = 500;

    // panel controller
    // used to close item and hide panel when items list is empty
    self.PanelCtl = function(mdPanelRef, $scope) {
        self.mdPanelRef = mdPanelRef;
        this.panels = [];
        $scope.$watchCollection(
            () => self.panels,
            (newValue) => {
                if (!newValue) return;
                this.panels = Object.values(newValue);
            }
        );
        this.click = function(callback) {
            if( callback ) {
                callback();
            }
        };

        this.close = function(panelId) {
            if (Object.keys(self.panels) > 1) {
                var panel = self.panels[panelId];
                if (panel && panel.close.onClose) {
                    panel.close.onClose(panelId);
                    delete self.panels[panelId];
                }
            }
            if (Object.keys(self.panels).length === 0) {
                self.__hidePanel();
            }
        };
    };

    self.__clearItems = function() {
        for (var panelId of Object.keys(self.panels)) {
            delete self.panels[panelId];
        }
    };

    self.__hidePanel = function() {
        if (self.mdPanelRef) {
            self.mdPanelRef.close().then(function() {
                self.__clearItems();
            }, function() {
                self.__clearItems();
            });

            self.mdPanelRef = null;
        }
    };

    self.__showPanel = function() {
        if (self.mdPanelRef) {
            return;
        }

        var position = $mdPanel.newPanelPosition()
            .absolute()
            .centerHorizontally()
            .bottom(0);

        var animation = $mdPanel.newPanelAnimation()
            .openFrom({
                top: document.documentElement.clientHeight,
                left: document.documentElement.clientWidth/2 - self.panelSize/2
            })
            .closeTo({
                top: document.documentElement.clientHeight,
                left: document.documentElement.clientWidth/2 - self.panelSize/2
            })
            .withAnimation($mdPanel.animation.SLIDE);

        $mdPanel.open({
            attachTo: angular.element(document.body),
            animation: animation,
            position: position,
            disableParentScroll: false,
            disableScrollMask: false,
            trapFocus: false,
            clickOutsideToClose: false,
            escapeToClose: false,
            focusOnOpen: false,
            propagateContainerEvents: true,
            zindex: 100,
            panelClass: 'update-panel',
            controller: self.PanelCtl,
            controllerAs: 'ctl',
            template: '<md-content md-theme="alt">' +
                      '    <md-list>' +
                      '        <md-list-item ng-repeat="panel in ctl.panels">' +
                      '            <div style="overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: white;">' +
                      '                <md-progress-circular md-mode="indeterminate" md-diameter="20px" class="progress-circular-white" style="float:left; padding-right:10px;" ng-if="panel.loader===true"></md-progress-circular>' +
                      '                <md-progress-circular md-mode="determinate" md-diameter="20px" class="progress-circular-white" style="float:left; padding-right:10px;" ng-if="panel.loader===\'percent\'" value="{{panel.percent}}"></md-progress-circular>' +
                      '                {{panel.label}}' +
                      '            </div>' +
                      '            <md-icon md-svg-icon="{{panel.action.icon}}" class="md-secondary white-icon" ng-if="panel.action" ng-click="ctl.click(panel.action.onAction)">' +
                      '                <md-tooltip md-direction="top">{{panel.action.tooltip}}</md-tooltip>' +
                      '            </md-icon>' +
                      '            <md-icon md-svg-icon="close" class="md-secondary white-icon" ng-if="!panel.close.disabled" ng-click="ctl.close(panel.id)">' +
                      '                <md-tooltip md-direction="top">Close</md-tooltip>' +
                      '            </md-icon>' +
                      '            <md-divider ng-if="!$last"></md-divider>' +
                      '        </md-list-item>' +
                      '    </md-list>' +
                      '</md-content>'
        });
    };

    /**
     * Add new panel
     * panel will popup if it's the first item
     * @param label (string): item label (can be html)
     * @param action (obj): action object describes available user action (null if no action)::
     *                       {
     *                           onAction (function): callback on button click,
     *                           tooltip (string): button tooltip,
     *                           icon (string): button icon (use mdi icon pack string format)
     *                       }
     * @param close (function): close object describes action when user click on close button::
     *                       {
     *                           onClose (function): callback on button click
     *                           disabled (bool): true to disable close button
     *                       }
     * @param loader (bool or 'percent'): display a circular progress with progress or infinite
     * @return item identifier to close it programmatically
     */
    self.addPanel = function(label, action, close, loader) {
        var defaultClose = {
            onClose: null,
            disabled: false
        };

        var panelId = new Date().valueOf();
        self.panels[panelId] = {
            id: panelId,
            action: action,
            label: label,
            close: close || defaultClose,
            loader: loader || false,
            percent: 0,
        };
        self.__showPanel();

        return panelId;
    };

    self.removePanel = function(panelId) {
        if (self.panels[panelId]) {
            delete self.panels[panelId];
        }
        if (Object.keys(self.panels).length === 0) {
            self.__hidePanel();
        }
    };

    self.setPercent = function(panelId, percent) {
        if (self.panels[panelId]) {
            self.panels[panelId].percent = percent;
        }
    }

}]);
