/**
 * Loading bar directive using angular material md-progress-linear
 *
 * Notes:
 *     Code copied and adapted from https://github.com/chieffancypants/angular-loading-bar
 *     Copyright chieffancypants
 *
 * Usage:
 *     <div loading-bar-directive></div>
 *     No parameter needed.
 *
 * Disable request:     
 *     To disable loading bar handling for specific request add this to $http config::
 *     $http({
 *          method: '...',
 *          ...,
 *          config: {
 *              ignoreLoadingBar: true
 *          }
 *     })...
 */
var loadingBarDirective = function(loadingBarService) {

    var loadingBarController = ['$scope', function($scope) {
        var self = this;
        self.status = 0;

        /**
         * Watch for status changes
         */
        $scope.$watch(function() {
            return loadingBarService ? loadingBarService.status : 0;
        }, function(newStatus) {
            self.status = newStatus * 100;
        });

    }];

    return {
        restrict: 'AE',
        templateUrl: 'js/tools/loadingBar/loadingBar.html',
        replace: true,
        controller: loadingBarController,
        controllerAs: 'loadingBarCtl'
    };

};

var RaspIot = angular.module('RaspIot');
RaspIot.directive('loadingBarDirective', ['loadingBarService', loadingBarDirective]);

/**
 * Loading bar service. Used to join $httpProvider and directive
 */
RaspIot.service('loadingBarService', ['$timeout', function($timeout) {
    var self = this;
    self.started = false;
    self.status = 0;
    self.completeTimeout = null;
    self.incTimeout = null;
    
    self.autoIncrement = true;

    self.start = function()
    {
        $timeout.cancel(self.completeTieout);

        // do not continually broadcast the started event:
        if( self.started )
        {
            return;
        }
        self.started = true;

        self.set(0);
    };

    self.set = function(n)
    {
        if( !self.started )
        {
            return;
        }

        self.status = n;

        // increment loadingbar to give the illusion that there is always
        // progress but make sure to cancel the previous timeouts so we don't
        // have multiple incs running at the same time.
        if (self.autoIncrement)
        {
            $timeout.cancel(self.incTimeout);
            self.incTimeout = $timeout(function() {
                self.inc();
            }, 250);
        }
    };

    self.inc = function()
    {
        if( self.status>=1 )
        {
            return;
        }

        var rnd = 0;
        var stat = self.status;
        if (stat >= 0 && stat < 0.25)
        {
            // Start out between 3 - 6% increments
            rnd = (Math.random() * (5 - 3 + 1) + 3) / 100;
        }
        else if( stat >= 0.25 && stat < 0.65 )
        {
            // increment between 0 - 3%
            rnd = (Math.random() * 3) / 100;
        }
        else if (stat >= 0.65 && stat < 0.9)
        {
            // increment between 0 - 2%
            rnd = (Math.random() * 2) / 100;
        }
        else if (stat >= 0.9 && stat < 0.99)
        {
            // finally, increment it .5 %
            rnd = 0.005;
        }
        else
        {
            // after 99%, don't increment:
            rnd = 0;
        }

        self.set(self.status  + rnd);
    };

    self.getStatus = function()
    {
        return self.status;
    };

    self.completeAnimation = function()
    {
        self.status = 0;
        self.started = false;
    };

    self.complete = function()
    {
        self.set(1);
    };
}]);

/**
 * Loading bar http interceptor
 */
RaspIot.config(['$httpProvider', function($httpProvider) {
    $httpProvider.interceptors.push(['$q', '$cacheFactory', '$timeout', '$rootScope', '$log', 'loadingBarService',
        function($q, $cacheFactory, $timeout, $rootScope, $log, loadingBarService) {

            /**
             * The total number of requests made
             */
            var reqsTotal = 0;

            /**
             * The number of requests completed (either successfully or not)
             */
            var reqsCompleted = 0;

            /**
             * The amount of time spent fetching before showing the loading bar
             */
            var latencyThreshold = 500; //TODOcfpLoadingBar.latencyThreshold;

            /**
             * $timeout handle for latencyThreshold
             */
            var startTimeout;

            /**
             * calls cfpLoadingBar.complete() which removes the
             * loading bar from the DOM.
             */
            function setComplete()
            {
                $timeout.cancel(startTimeout);
                loadingBarService.complete();
                reqsCompleted = 0;
                reqsTotal = 0;
            };

            /**
             * Determine if the response has already been cached
             * @param  {Object}  config the config option from the request
             * @return {Boolean} retrns true if cached, otherwise false
             */
            function isCached(config)
            {
                var cache;
                var defaultCache = $cacheFactory.get('$http');
                var defaults = $httpProvider.defaults;
        
                // Choose the proper cache source. Borrowed from angular: $http service
                if ((config.cache || defaults.cache) && config.cache !== false && (config.method === 'GET' || config.method === 'JSONP'))
                {
                    cache = angular.isObject(config.cache) ? config.cache : angular.isObject(defaults.cache) ? defaults.cache : defaultCache;
                }

                var cached = cache !== undefined ? cache.get(config.url) !== undefined : false;

                if (config.cached !== undefined && cached !== config.cached)
                {
                    return config.cached;
                }

                config.cached = cached;
                return cached;
            };


            return {
                'request': function(config) {
                    var disabled = false;
                    if( config.config )
                    {
                        disabled = config.config.ignoreLoadingBar;
                    }
                    if( !disabled && !isCached(config) )
                    {
                        if (reqsTotal === 0)
                        {
                            startTimeout = $timeout(function() {
                                loadingBarService.start();
                            }, 250);
                        }
                        reqsTotal++;
                        loadingBarService.set(reqsCompleted / reqsTotal);
                    }
                    return config;
                },
        
                'response': function(response) {
                    if (!response || !response.config)
                    {
                        return response;
                    }
    
                    var disabled = false;
                    if( response.config )
                    {
                        disabled = response.config.ignoreLoadingBar;
                    }
                    if( !disabled && !isCached(response.config) )
                    {
                        reqsCompleted++;
                        if (reqsCompleted >= reqsTotal)
                        {
                            setComplete();
                        }
                        else
                        {
                            loadingBarService.set(reqsCompleted / reqsTotal);
                        }
                    }
                    return response;
                },
        
                'responseError': function(rejection) {
                    if (!rejection || !rejection.config) 
                    {
                        return $q.reject(rejection);
                    }

                    var disabled = false;
                    if( rejection.config )
                    {
                        disabled = rejection.config.ignoreLoadingBar;
                    }
                    if( !disabled && !isCached(rejection.config) )
                    {
                        reqsCompleted++;
                        if (reqsCompleted >= reqsTotal)
                        {
                            setComplete();
                        }
                        else
                        {
                            loadingBarService.set(reqsCompleted / reqsTotal);
                        }
                    }

                    return $q.reject(rejection);
                }
            };
        }])
}]);


