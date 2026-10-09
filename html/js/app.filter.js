
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

/**
 * Build a short human-readable summary of heterogeneous device message params.
 * Prefer scalars; skip URLs, nested objects/arrays, and noisy keys. Max N fields.
 */
angular.module('Cleep').filter('messageParamsSummary', function() {
    var MAX_FIELDS = 4;
    var MAX_STRING_LENGTH = 48;
    var NOISE_KEYS = new Set([
        'icon',
        'image',
        'img',
        'thumbnail',
        'thumb',
        'url',
        'href',
        'link',
        'uuid',
        'id',
        'device_id',
    ]);

    function isNoiseKey(key) {
        if (!key || typeof key !== 'string') {
            return true;
        }
        var lower = key.toLowerCase();
        if (NOISE_KEYS.has(lower)) {
            return true;
        }
        if (lower.indexOf('url') >= 0 || lower.indexOf('href') >= 0) {
            return true;
        }
        if (lower.charAt(0) === '_') {
            return true;
        }
        return false;
    }

    function looksLikeUrl(value) {
        return typeof value === 'string' && /^https?:\/\//i.test(value);
    }

    function formatValue(value) {
        if (typeof value === 'number') {
            if (!isFinite(value)) {
                return String(value);
            }
            if (Math.abs(value) >= 100 || Number.isInteger(value)) {
                return String(value);
            }
            return String(Math.round(value * 100) / 100);
        }
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }
        return String(value);
    }

    function normalizeParams(params) {
        if (params == null) {
            return null;
        }
        if (typeof params === 'string') {
            try {
                var parsed = JSON.parse(params);
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
            } catch (_error) {
                return null;
            }
        }
        if (typeof params === 'object' && !Array.isArray(params)) {
            return params;
        }
        return null;
    }

    return function(params, maxFields) {
        var source = normalizeParams(params);
        if (!source) {
            return [];
        }

        var limit = typeof maxFields === 'number' && maxFields > 0 ? maxFields : MAX_FIELDS;
        var summary = [];

        for (const [key, value] of Object.entries(source)) {
            if (summary.length >= limit) {
                break;
            }
            if (isNoiseKey(key)) {
                continue;
            }
            if (value == null) {
                continue;
            }
            if (typeof value === 'object') {
                continue;
            }
            if (typeof value === 'string') {
                if (!value.length || looksLikeUrl(value) || value.length > MAX_STRING_LENGTH) {
                    continue;
                }
            }
            if (typeof value === 'number' && !isFinite(value)) {
                continue;
            }

            summary.push({
                key: key,
                value: formatValue(value),
            });
        }

        return summary;
    };
});

/**
 * Pretty-print an object as syntax-highlighted JSON HTML for ng-bind-html.
 */
angular.module('Cleep').filter('prettyJsonHtml', ['$sce', function($sce) {
    var INDENT = '  ';

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function span(cls, text) {
        return '<span class="' + cls + '">' + text + '</span>';
    }

    /** Build highlighted JSON HTML without regex (avoids ReDoS findings). */
    function highlightValue(value, depth) {
        if (value === null) {
            return span('json-null', 'null');
        }
        if (typeof value === 'boolean') {
            return span('json-bool', value ? 'true' : 'false');
        }
        if (typeof value === 'number') {
            return span('json-number', String(value));
        }
        if (typeof value === 'string') {
            return span('json-string', escapeHtml(JSON.stringify(value)));
        }
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return '[]';
            }
            var arrayLines = value.map(function(item) {
                return INDENT.repeat(depth + 1) + highlightValue(item, depth + 1);
            });
            return '[\n' + arrayLines.join(',\n') + '\n' + INDENT.repeat(depth) + ']';
        }
        if (typeof value === 'object') {
            var entries = Object.entries(value);
            if (entries.length === 0) {
                return '{}';
            }
            var objectLines = entries.map(function(entry) {
                var keyHtml = span('json-key', escapeHtml(JSON.stringify(entry[0])) + ':');
                return INDENT.repeat(depth + 1) + keyHtml + ' ' + highlightValue(entry[1], depth + 1);
            });
            return '{\n' + objectLines.join(',\n') + '\n' + INDENT.repeat(depth) + '}';
        }
        return span('json-string', escapeHtml(JSON.stringify(String(value))));
    }

    return function(value) {
        if (value === undefined) {
            return $sce.trustAsHtml('<span class="json-empty">No data</span>');
        }
        try {
            return $sce.trustAsHtml(highlightValue(value, 0));
        } catch (_error) {
            return $sce.trustAsHtml('<span class="json-empty">Unable to render JSON</span>');
        }
    };
}]);
