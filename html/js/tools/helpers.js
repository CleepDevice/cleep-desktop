/**
 * This file contains javascript helpers
 */

String.prototype.parseBool = function() {
    return (/^true$/i).test(this);
};

/**
 * http://jamesroberts.name/blog/2010/02/22/string-functions-for-javascript-trim-to-camel-case-to-dashed-and-to-underscore/
 * String functions
 */
String.prototype.toCamel = function() {
    return this.replace(/(\-[a-z])/g, function($1){return $1.toUpperCase().replace('-','');});
};

String.prototype.toDash = function() {
    return this.replace(/([A-Z])/g, function($1){return "-"+$1.toLowerCase();});
};

String.prototype.toUnderscore = function() {
    return this.replace(/([A-Z])/g, function($1){return "_"+$1.toLowerCase();});
};

String.prototype.trim = function() {
    return this.replace(/^\s+|\s+$/g, "");
};

String.prototype.firstUpperCase = function() {
    return this.charAt(0).toUpperCase() + this.slice(1).toLowerCase();
};

