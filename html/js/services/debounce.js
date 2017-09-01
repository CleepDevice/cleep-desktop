/**
 * Debounce service
 * Used to execute callback after an amount of time. If debounce is called before callback is executed, the call is delayed.
 * Useful to save automatically user preferences
 */
var debounceService = function($timeout, $q) {
    var self = this;
    self.promise = null;
    self.timeoutPromise = null;
    self.debounces = {};

    /**
     * Debounce main function
     * @param id: callback identifier. Used to execute multiple debounce on different callback
     * @param callback: function to execute after timeout
     * @param timeout: timeout (milliseconds)
     * @param params: callback parameters (optionnal)
     * @return promise
     */
    self.exec = function(id, callback, timeout, params) {
        //init internal structure
        if( !self.debounces[id] )
        {
            self.debounces[id] = {
                promise: null,
                promiseTimeout: null
            };
        }

        //check debounce for current callback
        if( self.debounces[id].promise===null )
        {
            //init promise
            self.debounces[id].promise = $q.defer();
        }
        else
        {
            //reject previous promise
            self.debounces[id].promise.reject('debounced');
            self.debounces[id].promise = $q.defer();
        }

        //check if timeout is not already running
        if( self.debounces[id].timeoutPromise )
        {
            $timeout.cancel(self.debounces[id].timeoutPromise);
            self.debounces[id].timeoutPromise = null;
        }

        //launch timeout
        self.debounces[id].timeoutPromise = $timeout(function() {
            var res = callback(params);
            self.debounces[id].promise.resolve();
        }, timeout, true, params);

        return self.debounces[id].promise.promise;
    };
};
    
var Cleep = angular.module('Cleep');
Cleep.service('debounceService', ['$timeout', '$q', debounceService]);

