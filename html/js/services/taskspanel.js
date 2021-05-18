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
    self.items = [];
    self.panelSize = 500;

    // panel controller
    // used to close item and hide panel when items list is empty
    self.PanelCtl = function(mdPanelRef) {
        // set reference to current panel
        self.mdPanelRef = mdPanelRef;

        // click on item
        this.click = function(callback) {
            if( callback ) {
                callback();
            }
        };

        // close action
        this.close = function(id) {
            // remove specified item
            if( self.items.length>1 ) {
                // search for item to remove it
                for( i=0; i<self.items.length; i++ ) {
                    if( self.items[i].id===id ) {
                        // close callback
                        if( self.items[i].close.onClose ) {
                            self.items[i].close.onClose(self.items[i].id);
                        }

                        // remove item
                        self.items.splice(i, 1);
                        break;
                    }
                }

            } else {
                // close callback
                if( self.items[0].close.onClose ) {
                    self.items[0].close.onClose(self.items[0].id);
                }
                
                // hide panel
                self.__hidePanel();
            }
        };
    };

    // clear all items properly 
    self.__clearItems = function() {
        while( self.items.length ) {
            self.items.pop();
        }
    };

    // hide panel
    self.__hidePanel = function() {
        if( self.mdPanelRef ) {
            self.mdPanelRef.close().then(function() {
                self.__clearItems();
            }, function() {
                self.__clearItems();
            });

            self.mdPanelRef = null;
        }
    };

    // show panel
    self.__showPanel = function() {
        // stop if panel already exists
        if( self.mdPanelRef ) {
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
            locals: {
                items: self.items
            },
            template: '<md-content md-theme="alt">' +
                      '    <md-list>' +
                      '        <md-list-item ng-repeat="item in ctl.items">' +
                      '            <div style="overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">' +
                      '                <md-progress-circular md-mode="indeterminate" md-diameter="20px" class="progress-circular-white" style="float:left; padding-right:10px;" ng-if="item.loader"></md-progress-circular>' +
                      '                {{item.label}}' +
                      '            </div>' +
                      '            <md-icon md-svg-icon="{{item.action.icon}}" class="md-secondary" ng-if="item.action" ng-click="ctl.click(item.action.onAction)" aria-label="Action">' +
                      '                <md-tooltip md-direction="top">{{item.action.tooltip}}</md-tooltip>' +
                      '            </md-icon>' +
                      '            <md-icon md-svg-icon="close" class="md-secondary" ng-if="!item.close.disabled" ng-click="ctl.close(item.id)" aria-label="Close">' +
                      '                <md-tooltip md-direction="top">Close</md-tooltip>' +
                      '            </md-icon>' +
                      '            <md-divider ng-if="!$last"></md-divider>' +
                      '        </md-list-item>' +
                      '    </md-list>' +
                      '</md-content>'
        });
    };

    /**
     * add item to panel
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
     * @param loader (bool): display a circular progress
     * @return item identifier to close it programmatically
     */
    self.addItem = function(label, action, close, loader) {
        var defaultClose = {
            onClose: null,
            disabled: false
        };

        var item = {
            id: new Date().valueOf(),
            action: action,
            label: label,
            close: close || defaultClose,
            loader: loader || false
        };
        self.items.push(item);

        // show panel
        self.__showPanel();

        return item.id;
    };

    /**
     * remove item id
     * @param itemId: item identifier returned by addItem
     */
    self.removeItem = function(itemId) {
        if( self.items.length>1 ) {
            for( i=0; i<self.items.length; i++ ) {
                if( self.items[i].id===itemId ) {
                    // remove item
                    self.items.splice(i, 1);
                    break;
                }
            }
        } else {
            // hide panel if necessary
            self.__hidePanel();
        }
    };

}]);
