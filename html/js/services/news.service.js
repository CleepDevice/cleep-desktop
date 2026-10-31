/**
 * Loads public Cleep news from the cleep-news GitHub Pages feed,
 * with a local disk cache (JSON + covers) for offline continuity.
 */
angular.module('Cleep').service('newsService', [
    '$http',
    '$q',
    '$interval',
    'loggerService',
    'electronService',
    function ($http, $q, $interval, logger, electron) {
        const self = this;

        /** GitHub Pages root (no trailing slash). */
        self.FEED_BASE = 'https://cleepdevice.github.io/cleep-news';
        /** Auto-refresh period after app/session start (1 hour). */
        self.AUTO_REFRESH_MS = 60 * 60 * 1000;

        self.articles = [];
        self.loading = false;
        self.syncing = false;
        self.error = null;
        self.fromCache = false;
        self.fingerprint = '';
        self._autoRefreshPromise = null;

        /**
         * Start a recurring sync every hour from the first call
         * (e.g. open at 08:36 → next sync at 09:36, 10:36, …).
         * Idempotent for the lifetime of the renderer.
         */
        self.ensureAutoRefresh = function () {
            if (self._autoRefreshPromise) {
                return;
            }
            self._autoRefreshPromise = $interval(function () {
                self.sync().catch(angular.noop);
            }, self.AUTO_REFRESH_MS);
        };

        /**
         * Stable content key — ignore data: cover URLs so cache vs remote compare cleanly.
         * @param {Array} articles
         * @returns {string}
         */
        self.contentFingerprint = function (articles) {
            return (articles || [])
                .map(function (article) {
                    const cover =
                        article.coverSourceUrl ||
                        (article.coverUrl && String(article.coverUrl).indexOf('http') === 0
                            ? article.coverUrl
                            : '');
                    return [
                        article.slug || '',
                        article.publishedAt || '',
                        article.title || '',
                        article.bodyHtml || '',
                        cover,
                    ].join('\x1e');
                })
                .join('\x1f');
        };

        /**
         * Hydrate from disk cache then refresh from the network.
         * Keeps current articles on network failure when a cache exists.
         * Skips UI replacement when remote content matches the fingerprint.
         * @returns {angular.IPromise<Array>}
         */
        self.sync = function () {
            self.syncing = true;
            self.error = null;

            return self
                .loadCache()
                .then(function (cached) {
                    if (cached && cached.length) {
                        self.articles = cached;
                        self.fromCache = true;
                        self.fingerprint = self.contentFingerprint(cached);
                    }
                    return self.fetchRemote();
                })
                .then(function (remote) {
                    const remoteFp = self.contentFingerprint(remote);
                    if (remoteFp === self.fingerprint && self.articles.length) {
                        self.fromCache = false;
                        self.error = null;
                        return self.articles;
                    }
                    return self.saveCache(remote).then(function (saved) {
                        self.articles = saved;
                        self.fromCache = false;
                        self.fingerprint = self.contentFingerprint(saved);
                        self.error = null;
                        return saved;
                    });
                })
                .catch(function (err) {
                    if (self.articles.length) {
                        // Offline / Pages down — keep last good snapshot.
                        self.fromCache = true;
                        self.error = null;
                        logger.warn('newsService.sync: using cache after remote failure', err);
                        return self.articles;
                    }
                    self.error = 'Unable to load news';
                    logger.error('newsService.sync failed', err);
                    return $q.reject(err);
                })
                .finally(function () {
                    self.syncing = false;
                    self.loading = false;
                });
        };

        self.loadCache = function () {
            if (!electron.news || typeof electron.news.getCache !== 'function') {
                return $q.resolve([]);
            }
            return electron.news
                .getCache()
                .then(function (payload) {
                    if (!payload || !angular.isArray(payload.articles)) {
                        return [];
                    }
                    return payload.articles;
                })
                .catch(function (err) {
                    logger.warn('newsService.loadCache failed', err);
                    return [];
                });
        };

        self.saveCache = function (articles) {
            const incoming = (articles || []).map(function (article) {
                return {
                    id: article.id,
                    title: article.title || '',
                    slug: article.slug || '',
                    excerpt: article.excerpt || '',
                    bodyHtml: article.bodyHtml || '',
                    publishedAt: article.publishedAt || null,
                    coverUrl:
                        article.coverSourceUrl ||
                        (article.coverUrl && String(article.coverUrl).indexOf('http') === 0
                            ? article.coverUrl
                            : null),
                };
            });

            if (!electron.news || typeof electron.news.saveCache !== 'function') {
                return $q.resolve(articles || []);
            }

            return electron.news.saveCache(incoming).then(function (payload) {
                return payload && angular.isArray(payload.articles) ? payload.articles : articles;
            });
        };

        /**
         * Fetch index + full articles from GitHub Pages.
         * @returns {angular.IPromise<Array>}
         */
        self.fetchRemote = function () {
            self.loading = !self.articles.length;
            return $http
                .get(self.FEED_BASE + '/index.json', { cache: false })
                .then(function (response) {
                    const raw = angular.isArray(response.data) ? response.data : [];
                    if (!raw.length) {
                        return [];
                    }
                    return $q.all(
                        raw.map(function (item) {
                            const coverUrl = item.coverUrl
                                ? self.FEED_BASE + '/' + String(item.coverUrl).replace(/^\//, '')
                                : null;
                            return self.loadArticle(item.slug).then(
                                function (article) {
                                    return {
                                        id: article.id,
                                        title: article.title,
                                        slug: article.slug,
                                        excerpt: article.excerpt,
                                        bodyHtml: article.bodyHtml,
                                        publishedAt: article.publishedAt,
                                        coverSourceUrl: article.coverUrl || coverUrl,
                                        coverUrl: article.coverUrl || coverUrl,
                                    };
                                },
                                function () {
                                    return {
                                        id: item.id,
                                        title: item.title || '',
                                        slug: item.slug || '',
                                        excerpt: item.excerpt || '',
                                        bodyHtml: '',
                                        publishedAt: item.publishedAt || null,
                                        coverSourceUrl: coverUrl,
                                        coverUrl: coverUrl,
                                    };
                                },
                            );
                        }),
                    );
                });
        };

        self.loadArticle = function (slug) {
            if (!slug) {
                return $q.reject(new Error('Missing slug'));
            }
            return $http
                .get(self.FEED_BASE + '/articles/' + encodeURIComponent(slug) + '.json', { cache: false })
                .then(function (response) {
                    const item = response.data || {};
                    return {
                        id: item.id,
                        title: item.title || '',
                        slug: item.slug || slug,
                        excerpt: item.excerpt || '',
                        bodyHtml: item.bodyHtml || '',
                        publishedAt: item.publishedAt || null,
                        coverUrl: item.coverUrl
                            ? self.FEED_BASE + '/' + String(item.coverUrl).replace(/^\//, '')
                            : null,
                    };
                });
        };
    },
]);
