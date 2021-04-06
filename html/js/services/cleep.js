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
    self.port = settings.getSync('remote.rpcport');
    self.urlCommand = 'http://localhost:' + self.port + '/command';
    self.urlWebsocket = 'ws://127.0.0.1:'+self.port+'/cleepws'

    /**
     * Connect websocket to python server
     */
    self.connectWebSocket = function()
    {
        var defer = $q.defer();

        if( !self.__ws ) {
            self.__ws = $websocket(self.urlWebsocket, null, {reconnectIfNotNormalClose: true});
            self.__ws.onMessage(self.__websocketReceive);
            self.__ws.onClose(function() {
                logger.debug('Websocket closed');
            });
            self.__ws.onOpen(function() {
                logger.debug('Websocket opened');
                defer.resolve('connected');
            });
        } else {
            //websocket is already created
            defer.resolve('already created');
        }

        return defer.promise;
    };

    /**
     * Callback when message is received on websocket
     */
    self.__websocketReceive = function(event) {
        if( event && event.data && typeof(event.data)==='string' ) {
            //broadcast received data
            var data = JSON.parse(event.data);
            $rootScope.$broadcast(data.event, data.data);
        }
    };

    /**
     * Base function to send data to rpcserver
     */
    self.send = function(url, command, to, params, method)
    {
        var d = $q.defer();

        //prepare method
        if( !method ) {
            method = 'POST';
        }

        //prepare data
        if( params===undefined || params===null ) {
            params = {};
        }
        var data = {
            command: command,
            to: to,
            params: params,
        };

		$http({
            method: method,
            url: url,
            data: data,
            responseType:'json'
        })
        .then(function(resp) {
            if( resp && resp.data && resp.data.error!==undefined && resp.data.error!==null && resp.data.error==true ) {
                toast.error(resp.data.message);
                d.reject(resp.data.message);

            } else {
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
    self.sendCommand = function(command, to, params) {
        return self.send(self.urlCommand, command, to, params, 'POST');
    };

    /**
     * Get CleepDesktop config
     */
    self.getConfig = function() {
        return self.send(self.urlCommand, 'get_config', 'config');
    };

    /**
     * Set CleepDesktop config
     */
    self.setConfig = function(config) {
        return self.send(self.urlCommand, 'set_config', 'config', {config:config});
    };

};

var Cleep = angular.module('Cleep');
Cleep.service('cleepService', ['$http', '$q', '$rootScope', 'toastService', '$websocket', 'logger', 'settings', cleepService]);

