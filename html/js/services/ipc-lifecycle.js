/**
 * Shared IPC subscription lifecycle for Angular services (init once / destroy unsubs).
 */
angular.module('Cleep').factory('ipcLifecycle', function() {
    return {
        /**
         * @param {object} service service `self`
         * @param {function(): void} registerIpcs pushes unsubscribers onto service._unsubscribers
         * @param {function(): void} [afterInit] optional hook after first successful init
         */
        attach: function(service, registerIpcs, afterInit) {
            service._ipcReady = false;
            service._unsubscribers = [];

            service.init = function() {
                if (service._ipcReady) {
                    return;
                }
                registerIpcs();
                service._ipcReady = true;
                if (typeof afterInit === 'function') {
                    afterInit();
                }
            };

            service.destroy = function() {
                service._unsubscribers.forEach(function(unsubscribe) {
                    unsubscribe();
                });
                service._unsubscribers = [];
                service._ipcReady = false;
            };
        },
    };
});
