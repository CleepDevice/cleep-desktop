var net = require('net');
var log = require('electron-log');

var cleepService = function($http, $q, $rootScope, $location, toast, $interval) {

    var self = this;
    self.socket = null;
    self.buffer = '';
    self.delimiter = '#_#';
    self.response = null;

    //get port from url
    var urlValues = $location.search();
    self.port = 5611;
    if( urlValues && urlValues.port )
    {
        self.port = urlValues.port;
    }
    log.info('port='+ self.port);

    /**
     * Init service (socket)
     */
    self.init = function() {
        //create socket
        self.socket = new net.Socket()

        //handle socket events
        self.socket.on('data', self.handle_socket_data);
        self.socket.on('error', self.handle_socket_error);
        self.socket.on('timeout', self.handle_socket_timeout);

        //connect socket
        self.socket.connect(self.port, function() {
            log.info('Connected to CommServer');
            /*var data = {command:'coucou'};
            j = JSON.stringify(data) + '##';
            log.info('send json:' + j);
            for( i=0; i<10; i++)
                self.socket.write(j);*/
        });
    };

    /**
     * Process data receveid from socket
     * Python CommServer ends a full packet with a delimiter
     */
    self.processData = function(data) {
        //append new data to buffer
        self.buffer += data.toString();

        //get new delimiter
        var pos = self.buffer.indexOf(self.delimiter);
        while( pos>=0 )
        {
            //get chunk
            chunk = self.buffer.substring(0, pos);
            log.info('chunk=['+chunk+']');
            
            //convert to json
            try {
                j = JSON.parse(chunk);
                //self.command_received(j);
                log.info('Data received:', j);
                if( j.response )
                {
                    //it's command response, resolve it
                    if( self.response )
                    {
                        self.response.resolve(j);
                    }
                }
                else
                {
                    //it's data pushed by server, process it
                    //self.handle_data(j);
                }
            }
            catch(err) {
                log.error('Invalid json for chunk: '+chunk);
            }

            //remove chunk from buffer
            self.buffer = self.buffer.substring(pos + self.delimiter.length);
            //compute new delimiter position
            pos = self.buffer.indexOf(self.delimiter);
        }
    }

    /**
     * Handle received data from socket
     */
    self.handle_socket_data = function(data) {
        log.debug('received data ', data.toString());
        self.processData(data);
    };

    /**
     * Handle socket error
     */
    self.handle_socket_error = function(err) {
        log.debug('Socket error:', err);
    };

    /**
     * Handle socket timeout
     */
    self.handle_socket_timeout = function() {
        log.debug('Socket timeout');
    };

    /**
     * Base function to write data on socket
     */
    self.write = function(command, params, sent_callback) {
        var data = {
            command: command,
            params: params 
        };
        var cmd = JSON.stringify(data) + self.delimiter;
        log.info('Send command:', cmd);
        
        try {
            self.socket.write(cmd, 'utf-8', sent_callback);
        }
        catch(err) {
            log.error('Error occured sending command:', err);
            return false;
        }

        return true;
    };

    /**
     * Base function to send data to CommServer
     */
    self.send = function(command, params) {
        var d = $q.defer();

        //write data on socket
        self.write(command, params, function() {
            log.info('Command sent');

            //wait for response
            self.response = $q.defer();
            self.response.promise
                .then(function(resp) {
                    d.resolve(true);
                }, function(err) {
                    log.error('Error', err);
                    d.reject(err);
                });
            
        });

        return d.promise
    };

    /**
     * Base function to send data to rpcserver
     */
    /*self.send = function(url, command, params, method) {
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
            console.error('Request failed: '+err);
            d.reject(err.statusText);
        });

        return d.promise;
    };*/

    /**
     * Send command to rpcserver
     */
    self.sendCommand = function(command, params) {
        return self.send(self.uriCommand, command, params);
    };

    /**
     * Send command to ui
     */
    self.sendUi = function(command, params) {
        return self.send(self.uriUi, command, params);
    };

    /**
     * Get CleeDesktop config
     */
    self.getConfig = function() {
        return self.send(self.uriConfig);
    };

    /**
     * Set cleepDesktop config
     */
    self.setConfig = function(config) {
        return self.send(self.uriConfig, null, {config:config}, 'PUT');
    };

    /**
     * Go back in history. Works only once
     */
    self.back = function() {
        return self.send(self.uriBack);
    };

    /**
     * Get devices
     */
    self.getDevices = function() {
        return self.send(self.uriDevices);
    };

    /**
     * Start devices websocket
     */
    self.devicesWebSocket = function(receive_callback) {
        if( !self.devicesWs )
        {
            self.devicesWs = new WebSocket('ws://localhost:'+self.port+'/devicesws');
            //define receive callback
            self.devicesWs.onmessage = function(event) {
                if( event && typeof(event.data)==='string' )
                {
                    var data = JSON.parse(event.data);
                    receive_callback(data);
                }
            };
        }

    };

    self.init();

};

var Cleep = angular.module('Cleep');
Cleep.service('cleepService', ['$http', '$q', '$rootScope', '$location', 'toastService', '$interval', cleepService]);

