/**
 * Cleep service handles connection with python rpc server
 *
 * It connects and watch for stable websocket connection.
 * Message received on websocket is broadcasted to angular rootScope
 *
 * It implements command sending with response (send() function)
 * Some commands shortcuts are also available (getConfig, setConfig...)
 */
var cleepService = function($http, $q, $rootScope, toast, $websocket, logger, settings) {

    var self = this;

    //set members
    self.__ws = null;
    self.port = settings.get('remote.rpcport');
    self.urlCommand = 'http://localhost:' + self.port + '/command';

    /**
     * Connect websocket to python server
     */
    self.connectWebSocket = function()
    {
        if( !self.__ws )
        {
            self.__ws = $websocket('ws://localhost:'+self.port+'/cleepws', null, {reconnectIfNotNormalClose: true});
            self.__ws.onMessage(self.__receive);
            self.__ws.onClose(function() {
                logger.debug('Websocket closed');
            });
            self.__ws.onOpen(function() {
                logger.debug('Websocket opened');
            });
        }
    };

    /**
     * Callback when message is received on websocket
     */
    self.__receive = function(event)
    {
        if( event && event.data && typeof(event.data)==='string' )
        {
            //broadcast received data
            var data = JSON.parse(event.data);
            $rootScope.$broadcast(data.module, data.data);
        }
    };

    /**
     * Base function to send data to rpcserver
     */
    self.send = function(url, command, params, method)
    {
        var d = $q.defer();

        //prepare method
        if( !method )
        {
            method = 'POST';
        }

        //prepare data
        if( params===undefined || params===null )
        {
            params = {};
        }
        var data = {
            command: command,
            params: params
        };

		$http({
            method: method,
            url: url,
            data: data,
            responseType:'json'
        })
        .then(function(resp) {
            if( resp && resp.data && resp.data.error!==undefined && resp.data.error!==null && resp.data.error==true )
            {
                toast.error(resp.data.message);
                d.reject(resp.data.message);
            }
            else
            {
                d.resolve(resp.data);
            }
        }, function(err) {
            //console.error('Request failed: '+err);
            d.reject(err.statusText);
        });

        return d.promise;
    };

    /**
     * Send command to rpcserver
     */
    self.sendCommand = function(command, params)
    {
        return self.send(self.urlCommand, command, params, 'POST');
    };

    /**
     * Get CleepDesktop config
     */
    self.getConfig = function()
    {
        return self.send(self.urlCommand, 'getconfig');
    };

    /**
     * Set CleepDesktop config
     */
    self.setConfig = function(config)
    {
        return self.send(self.urlCommand, 'setconfig', {config:config});
    };

};

var Cleep = angular.module('Cleep');
Cleep.service('cleepService', ['$http', '$q', '$rootScope', 'toastService', '$websocket', 'logger', 'settings', cleepService]);

