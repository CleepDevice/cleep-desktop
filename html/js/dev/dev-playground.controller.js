angular
.module('Cleep')
.controller('devPlaygroundController', ['$scope', '$interval', 'toolbarTaskService',
function($scope, $interval, toolbarTask) {
    var self = this;
    var TASK_ID = 'dev-playground';
    var tick = null;

    self.percent = 0;
    self.infinite = false;
    self.progressTitle = 'No simulated task';
    self.note = '';
    self.noteType = 'note';

    self.stopTick = function() {
        if (tick) {
            $interval.cancel(tick);
            tick = null;
        }
    };

    self.resetLocal = function() {
        self.stopTick();
        self.percent = 0;
        self.infinite = false;
        self.progressTitle = 'No simulated task';
        self.note = '';
        self.noteType = 'note';
    };

    self.reset = function() {
        self.resetLocal();
        toolbarTask.clear(TASK_ID);
    };

    // page: null so the toolbar indicator stays visible while testing on this page
    self.syncToolbar = function(status, label, title) {
        toolbarTask.set(TASK_ID, {
            page: null,
            label: label,
            title: title || label,
            status: status,
            percent: self.percent,
            onClick: function() {
                // Keep indicator visible for inspection; Reset clears it.
            },
        });
    };

    self.runOk = function() {
        self.resetLocal();
        self.progressTitle = 'Simulated success run';
        self.note = 'Running... will end on success. Watch the toolbar icon above Vault.';
        self.noteType = 'info';
        self.percent = 0;
        self.syncToolbar('running', 'Dev OK...', 'Dev playground - success scenario');

        tick = $interval(function() {
            self.percent = Math.min(100, self.percent + 10);
            self.syncToolbar('running', 'Dev OK...', 'Dev playground - ' + self.percent + '%');
            if (self.percent >= 100) {
                self.stopTick();
                self.progressTitle = 'Simulated task succeeded';
                self.note = 'Success - toolbar shows a check. Use Reset to clear.';
                self.noteType = 'success';
                self.syncToolbar('success', 'Dev done', 'Dev playground - success');
            }
        }, 250);
    };

    self.runKo = function() {
        self.resetLocal();
        self.progressTitle = 'Simulated failure run';
        self.note = 'Running... will end on error. Watch the toolbar icon above Vault.';
        self.noteType = 'warning';
        self.percent = 0;
        self.syncToolbar('running', 'Dev KO...', 'Dev playground - failure scenario');

        tick = $interval(function() {
            self.percent = Math.min(70, self.percent + 14);
            self.syncToolbar('running', 'Dev KO...', 'Dev playground - ' + self.percent + '%');
            if (self.percent >= 70) {
                self.stopTick();
                self.progressTitle = 'Simulated task failed';
                self.note = 'Error - toolbar shows an alert. Use Reset to clear.';
                self.noteType = 'error';
                self.syncToolbar('error', 'Dev failed', 'Dev playground - failure');
            }
        }, 250);
    };

    self.runOngoing = function() {
        self.resetLocal();
        self.progressTitle = 'Simulated ongoing task';
        self.note = 'Stays running at ~45%. Toolbar donut should stay visible above Vault.';
        self.noteType = 'info';
        self.percent = 45;
        self.infinite = false;
        self.syncToolbar('running', 'Dev running...', 'Dev playground - ongoing');
    };

    self.triggerButtons = [
        { label: 'Case OK', style: 'md-raised md-primary', click: function() { self.runOk(); } },
        { label: 'Case KO', style: 'md-raised md-warn', click: function() { self.runKo(); } },
        { label: 'Case ongoing', style: 'md-raised', click: function() { self.runOngoing(); } },
        { label: 'Reset', style: 'md-raised', click: function() { self.reset(); } },
    ];

    $scope.$on('$destroy', function() {
        self.stopTick();
    });
}]);
