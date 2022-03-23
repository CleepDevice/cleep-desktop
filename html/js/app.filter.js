/**
 * Datetime to human readable string
 */
angular.module('Cleep').filter('hrDatetime', function(settingsService) {
    return function(timestamp, shortYear) {
        if (!timestamp) {
            return '-';
        }
        
        // date format https://en.wikipedia.org/wiki/Date_format_by_country
        var locale = settingsService.locale;
        if (!shortYear) {
            if( locale=='en' )
                return moment.unix(timestamp).format('MM/DD/YYYY HH:mm:ss');
            else
                return moment.unix(timestamp).format('DD/MM/YYYY HH:mm:ss');
        } else {
            if( locale=='en' )
                return moment.unix(timestamp).format('MM/DD/YY HH:mm:ss');
            else
                return moment.unix(timestamp).format('DD/MM/YY HH:mm:ss');
        }
    };
});

/**
 * Seconds to human readable string
 */
angular.module('Cleep').filter('hrSeconds', function() {
    return function(secs) {
        const hours = Math.floor( ( secs %= 86400 ) / 3600 );
        const minutes = Math.floor( ( secs %= 3600 ) / 60 );
        const seconds = secs % 60;
    
        if ( hours || seconds || minutes ) {
            return ( hours ? hours + "h" : ""  ) +
                ( minutes ? minutes + "m" : "" ) +
                Number.parseFloat( seconds ).toFixed(0) + "s";
        }
    
        return "< 1s";
    };
});

/**
 * Timestamp to human readable string
 */
angular.module('Cleep').filter('hrTimestamp', function() {
    return function(timestamp, withSeconds) {
        if( angular.isUndefined(timestamp) || timestamp===null )
            return '-';
        else
        {
            if( angular.isUndefined(withSeconds) )
                return moment.unix(timestamp).format('HH:mm:ss');
            else
                return moment.unix(timestamp).format('HH:mm');
        }
    };
});

/**
 * Date to human readable string
 */
angular.module('Cleep').filter('hrDate', function() {
    return function(timestamp, shortYear) {
        if( angular.isUndefined(timestamp) || ts===null )
            return '-';
        else
        {
            if( angular.isUndefined(shortYear) )
                return moment.unix(timestamp).format('DD/MM/YYYY');
            else
                return moment.unix(timestamp).format('DD/MM/YY');
        }
    };
});

/**
 * Bytes to human readable
 * Code copied from https://gist.github.com/thomseddon/3511330
 */
 angular.module('Cleep').filter('hrBytes', function() {
    return function(bytes, precision) {
        if (isNaN(parseFloat(bytes)) || !isFinite(bytes)) return '-';
        if (typeof precision === 'undefined') precision = 1;
        if (bytes === 0) return '0 bytes';
        var units = ['bytes', 'kB', 'MB', 'GB', 'TB', 'PB'], number = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, Math.floor(number))).toFixed(precision) +  ' ' + units[number];
    }
});
