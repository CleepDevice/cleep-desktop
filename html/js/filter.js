/**
 * Timestamp to human readable string
 **/
 Cleep.filter('hrDatetime', function($filter, settingsService) {
    return function(ts, shortYear) {
        if( angular.isUndefined(ts) || ts===null )
            return '-';
        else
        {
            // date format https://en.wikipedia.org/wiki/Date_format_by_country
            // TODO var locale = settingsService.get('cleep.locale');
            var locale = 'en';
            if( angular.isUndefined(shortYear) )
            {
                if( locale=='en' )
                    return moment.unix(ts).format('MM/DD/YYYY HH:mm:ss');
                else
                    return moment.unix(ts).format('DD/MM/YYYY HH:mm:ss');
            }
            else
            {
                if( locale=='en' )
                    return moment.unix(ts).format('MM/DD/YY HH:mm:ss');
                else
                    return moment.unix(ts).format('DD/MM/YY HH:mm:ss');
            }
        }
    };
});

Cleep.filter('hrTime', function($filter) {
    return function(ts, withSeconds) {
        if( angular.isUndefined(ts) || ts===null )
            return '-';
        else
        {
            if( angular.isUndefined(withSeconds) )
                return moment.unix(ts).format('HH:mm:ss');
            else
                return moment.unix(ts).format('HH:mm');
        }
    };
});

Cleep.filter('hrDate', function($filter) {
    return function(ts, shortYear) {
        if( angular.isUndefined(ts) || ts===null )
            return '-';
        else
        {
            if( angular.isUndefined(shortYear) )
                return moment.unix(ts).format('DD/MM/YYYY');
            else
                return moment.unix(ts).format('DD/MM/YY');
        }
    };
});

/**
 * Bytes to human readable
 * Code copied from https://gist.github.com/thomseddon/3511330
 */
Cleep.filter('hrBytes', function($filter) {
    return function(bytes, precision) {
        if (isNaN(parseFloat(bytes)) || !isFinite(bytes)) return '-';
        if (typeof precision === 'undefined') precision = 1;
        var units = ['bytes', 'kB', 'MB', 'GB', 'TB', 'PB'], number = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, Math.floor(number))).toFixed(precision) +  ' ' + units[number];
    }
});