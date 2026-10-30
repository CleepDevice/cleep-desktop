/**
 * Single toolbar slot for background tasks (install, update, download...).
 * Multiple tasks can be registered; only one is displayed (running > error > action > success).
 * Opening the related page dismisses that task. Click focuses the page (or runs onClick).
 */
angular
.module('Cleep')
.service('toolbarTaskService', ['$rootScope', '$state', function($rootScope, $state) {
    var self = this;
    self.tasks = {};
    self.display = null;

    self._notify = function() {
        self.display = self._pickDisplay();
        if (!$rootScope.$$phase) {
            $rootScope.$applyAsync(angular.noop);
        }
    };

    self._mostRecent = function(list) {
        return list.slice().sort(function(a, b) {
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        })[0] || null;
    };

    self._pickDisplay = function() {
        var currentPage = ($state.current && $state.current.name) || '';
        // Always show in-flight work (even on its page). Hide terminal states while
        // already viewing that page - they are cleared when entering the page.
        var list = Object.keys(self.tasks).map(function(id) {
            return self.tasks[id];
        }).filter(function(t) {
            if (t.status === 'running') {
                return true;
            }
            return !(t.page && t.page === currentPage);
        });
        if (!list.length) {
            return null;
        }
        var running = list.filter(function(t) { return t.status === 'running'; });
        if (running.length) {
            return self._mostRecent(running);
        }
        var errors = list.filter(function(t) { return t.status === 'error'; });
        if (errors.length) {
            return self._mostRecent(errors);
        }
        var actions = list.filter(function(t) { return t.status === 'action'; });
        if (actions.length) {
            return self._mostRecent(actions);
        }
        return self._mostRecent(list.filter(function(t) { return t.status === 'success'; }));
    };

    /**
     * @param {string} id stable id (install, update, download-<id>, restart)
     * @param {object} spec
     * @param {string} [spec.page] ui-router state that dismisses this task when entered
     * @param {string} spec.label short label (expanded toolbar)
     * @param {'running'|'success'|'error'|'action'} spec.status
     * @param {number} [spec.percent]
     * @param {string} [spec.title] tooltip (defaults to label)
     * @param {Function} [spec.onClick] optional click override (else navigate to page)
     */
    self.set = function(id, spec) {
        if (!id || !spec) {
            return;
        }
        var previous = self.tasks[id] || {};
        self.tasks[id] = {
            id: id,
            page: spec.page !== undefined ? spec.page : previous.page,
            label: spec.label || previous.label || 'Task',
            title: spec.title || spec.label || previous.title || previous.label || 'Task',
            status: spec.status || previous.status || 'running',
            percent: typeof spec.percent === 'number' ? spec.percent : (previous.percent || 0),
            onClick: spec.onClick !== undefined ? spec.onClick : previous.onClick,
            updatedAt: Date.now(),
        };
        self._notify();
    };

    self.clear = function(id) {
        if (!id || !self.tasks[id]) {
            return;
        }
        delete self.tasks[id];
        self._notify();
    };

    self.clearForPage = function(page) {
        if (!page) {
            return;
        }
        var changed = false;
        Object.keys(self.tasks).forEach(function(id) {
            var task = self.tasks[id];
            // Keep in-flight work so the indicator returns when leaving the page.
            if (task.page === page && task.status !== 'running') {
                delete self.tasks[id];
                changed = true;
            }
        });
        self._notify();
    };

    self.hasTasks = function() {
        return Object.keys(self.tasks).length > 0;
    };

    self.activate = function() {
        var task = self.display;
        if (!task) {
            return;
        }
        if (typeof task.onClick === 'function') {
            task.onClick(task);
            return;
        }
        if (task.page) {
            $rootScope.$broadcast('open-page', { page: task.page });
        }
    };
}]);
