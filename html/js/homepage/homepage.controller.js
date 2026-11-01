angular.module('Cleep').controller('homepageController', [
    'newsService',
    'toastService',
    'contentTabsService',
    function (newsService, toastService, contentTabs) {
        const self = this;

        self.newsService = newsService;
        self.loading = false;

        self.refreshNews = function () {
            const hadContent = newsService.articles.length > 0;
            self.loading = !hadContent;
            contentTabs.loading = self.loading;
            // Start the hourly clock at first homepage visit (08:36 → 09:36…).
            newsService.ensureAutoRefresh();

            return newsService
                .sync()
                .catch(function () {
                    if (!newsService.articles.length) {
                        toastService.error('Unable to load news');
                    }
                })
                .finally(function () {
                    self.loading = false;
                    contentTabs.loading = false;
                });
        };

        self.refreshNews();
    },
]);
