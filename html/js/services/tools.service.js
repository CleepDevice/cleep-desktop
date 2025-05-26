/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.service('toolsService', ['$mdToast', function() {
    this.clearObject = function(obj) {
        for (var key in obj) {
            delete obj[key];
        }
    }

    this.updateObject = function(ref, obj, clearObsoleteKeys = false) {
        if (ref === undefined || ref === null) {
            ref = obj;
            return;
        }

        for (const [key, value] of Object.entries(obj)) {
            ref[key] = value;
        }

        if (clearObsoleteKeys) {
            const objKeys = Object.keys(obj);
            for (const refKeys of Object.keys(ref)) {
                if (!objKeys.includes(refKeys)) {
                    delete objKeys[key];
                }
            }
        }
    }
}]);