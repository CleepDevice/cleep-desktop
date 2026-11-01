angular
.module('Cleep')
.controller('websiteLoginController', ['closeModal', 'modalData', 'electronService', 'toastService',
function(closeModal, modalData, electron, toast) {
    var self = this;
    self.busy = false;
    self.email = (modalData && modalData.email) || '';
    self.password = (modalData && modalData.password) || '';
    self.fromVault = Boolean(modalData && modalData.fromVault);

    self.cancel = function() {
        closeModal();
    };

    self.onKeydown = function($event) {
        if ($event.key === 'Enter' || $event.keyCode === 13) {
            $event.preventDefault();
            self.login();
        }
    };

    self.login = function() {
        if (self.busy || !self.email || !self.password) {
            return;
        }
        self.busy = true;
        electron.website.login(self.email, self.password)
            .then(function(session) {
                self.password = '';
                if (session.persisted || session.storedInVault) {
                    toast.info('Signed in. Session saved on this device.');
                } else {
                    toast.info('Signed in. Session is memory-only (OS encryption unavailable).');
                }
                closeModal(session);
            })
            .catch(function(error) {
                toast.error((error && error.message) || 'Sign-in failed');
            })
            .finally(function() {
                self.busy = false;
            });
    };
}]);
