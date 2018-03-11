/**
 * Task panel displays a permanent panel centered on bottom page
 * Panel can display multiple lines
 * This panel can be closed by user if option enabled
 * This panel can display a progress linebar to display action in progress
 */

var tasksPanelService = function($mdPanel) {
    var self = this;
    self.mdPanelRef = null;
    self.items = [];
    self.panelSize = 500;

    //panel controller
    //used to close item and hide panel when items list is empty
    self.PanelCtl = function(mdPanelRef)
    {
        //set reference to current panel
        self.mdPanelRef = mdPanelRef;

        //click on item
        this.click = function(callback)
        {
            if( callback )
            {
                callback();
            }
        };

        //close action
        this.close = function(id)
        {
            //remove specified item
            if( self.items.length>1 )
            {
                for( i=0; i<self.items.length; i++ )
                {
                    if( self.items[i].id===id )
                    {
                        self.items.splice(i, 1);
                        break;
                    }
                }
            }
            else
            {
                //hide panel if no more item
                self.__hidePanel();
            }
        };
    };

    //clear all items properly 
    self.__clearItems = function()
    {
        while( self.items.length )
        {
            self.items.pop();
        }
    };

    //hide panel
    self.__hidePanel = function()
    {
        if( self.mdPanelRef )
        {
            self.mdPanelRef.close().then(function() {
                self.__clearItems();
            }, function() {
                self.__clearItems();
            });

            self.mdPanelRef = null;
        }
    };

    //show panel
    self.__showPanel = function()
    {
        //stop if panel already exists
        if( self.mdPanelRef )
        {
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
                      '            <md-icon md-svg-icon="magnify" class="md-secondary" ng-if="item.action" ng-click="ctl.click(item.action)">' +
                      '                <md-tooltip md-direction="top">See task</md-tooltip>' +
                      '            </md-icon>' +
                      '            <md-icon md-svg-icon="close" class="md-secondary" ng-if="item.id" ng-click="ctl.close(item.id)">' +
                      '                <md-tooltip md-direction="top">Close</md-tooltip>' +
                      '            </md-icon>' +
                      '            <md-divider ng-if="!$last"></md-divider>' +
                      '        </md-list-item>' +
                      '    </md-list>' +
                      '</md-content>'
        });
    };


    //add item to panel
    //panel will popup if it's the first item
    //@param label (string): item label (can be html)
    //@param action (callback): callback on label click
    //@param close (bool): display a close button
    //@param loader (bool): display a circular progress
    //@return item identifier to close it programmatically
    self.addItem = function(label, action, close, loader)
    {
        var item = {
            id: new Date().valueOf(),
            action: action,
            label: label,
            close: close,
            loader: loader
        };
        self.items.push(item);

        //show panel
        self.__showPanel();

        return item.id;
    };

    //remove item id
    //@param itemId: item identifier returned by addItem
    self.removeItem = function(itemId)
    {
        if( self.items.length>1 )
        {
            for( item in self.items )
            {
                if( item.id===itemId )
                {
                    break;
                }
            }
        }
        else
        {
            //hide panel if necessary
            self.__hidePanel();
        }
    };

};
    
var Cleep = angular.module('Cleep');
Cleep.service('tasksPanelService', ['$mdPanel', tasksPanelService]);

