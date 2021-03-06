/**
 * Process path and query params changes to defined pages
 *
 */
(function () {

    function getPathFromLocation() {
        return location.pathname + location.search;
    }

    /**
     * Some browsers pops state on load, we'll process popState only if location or state were changed before
     */
    BEM.decl('i-router', null, {
        /**
         * check if history state is supported
         */
        _historyStateSupported: function () {
            return Boolean(history && history.pushState);
        },

        /**
         * Init i-router
         */
        init: function () {
            var _this = this;

            this._state.set('path', getPathFromLocation());
            this._lastPath = this.getPath();
            this._lastHandler = this._prepareRoute(this._lastPath);
            if (this._historyStateSupported()) {
                jQuery(document).delegate('a', 'click', function (e) {
                    if (!e.metaKey && !e.ctrlKey && this.protocol === location.protocol
                        && this.host === location.host && !this.attributes.target) {
                        // skip prevent default for React Router Links (otherwise, it won't work),
                        // but still do setPath for synchronizing React Router and i-router states
                        if (_this.setPath(this.pathname + this.search + this.hash) && !this.attributes['data-react']) {
                            e.preventDefault();
                        }
                    }
                });

                jQuery(window).bind('popstate', function () {
                    _this._state.set('path', getPathFromLocation());
                    _this._onChange();
                });

                jQuery(window).bind('pageshow', function () {
                    _this._prepareRoute();
                });
            }
        },

        /**
         * Define handler or list of handlers
         *
         * @param [{String|Array} reqMethod request method: 'get', 'post', 'get,post', 'delete' etc. or list of arguments
         *  To assign more than one method list with comma]
         * @param {String|RegExp} reqPath request path matcher
         * @param {String} blockName block name
         */
        define: function () {
            this.__base.apply(this, arguments);
            this._lastPath = this.getPath();
            this._lastHandler = this._prepareRoute(this._lastPath);
        },

        /**
         * Get request's protocol (http/https)
         * @returns {String} (http: or https:. Warning there will be column ":" symbol)
         */
        getProtocol: function () {
            return window.document.location.protocol;
        },

        /**
         * Set path to url with history.pushState
         *
         * @param {String} path
         * @param {Boolean} [allowFallback = false] change path with page reload
         *
         * @returns {Boolean} False if history API not supported
         */
        setPath: function (path, allowFallback) {
            return this._changePath.call(this, 'push', path, allowFallback);
        },
        /**
         * Replace current path with history.replaceState
         *
         * @param {String} path
         * @param {Boolean}  [allowFallback = false] change path with page reload
         *
         * @returns {Boolean} False if history API not supported
         */
        replacePath: function (path, allowFallback) {
            return this._changePath.call(this, 'replace', path, allowFallback);
        },

        /**
         * Falback for changing location if browser not support history.pushState or then error was occur while pach is changed
         *
         * @param {Boolean} allowFallback
         * @param {String} path
         * @return {Boolean}
         */
        _fallback: function (allowFallback, path) {
            if (allowFallback) {
                window.location.href = path;
            }
            return false;
        },

        /**
         * Changing windlow.location
         * @override
         * @private
         *
         * @param {String} path
         * @param {Boolean} [allowFallback = false] change path with page reload
         *
         * @returns {Boolean} False if history API not supported
         */
        _changePath: function (method, path, allowFallback) {
            this._state.set('path', path);
            if (!this._historyStateSupported()) {
                return this._fallback(allowFallback, path);
            }

            history[method + 'State'](undefined, undefined, path);
            this._onChange();
            return true;
        },

        /**
         * Reloading page
         */
        reload: function (e) {
            if (e) {
                console.error(e instanceof Error ? e.stack : e);
            }
            setTimeout(function () {
                location.reload();
            });
        },

        immediateReload: function (path, e) {
            if (e) {
              console.error(e instanceof Error ? e.stack : e);
            }
            if (!this.stopImmediateReload) {
              this.stopImmediateReload = true;
              window.location = path;
            }
        },

        /**
         * Handles 404 page
         */
        missing: function () {
            return this.reload();
        },

        /**
         * Handle popstate event from window
         * Process handler for given path
         */
        _onChange: function () {
            var currentPath = this.getPath(),
                shouldTriggerUpdate = this._lastPath !== currentPath,
                handler;

            if (shouldTriggerUpdate) {
                handler = this._prepareRoute();
                this.trigger('update', {path: currentPath});
                if (handler) {
                    this._execHandler(handler)
                        .then(
                            function (lastPath, currentPath) {
                                if (shouldTriggerUpdate) {
                                    this.trigger('clientUpdate', {
                                        prevPath: lastPath,
                                        prevPathname: lastPath.split('?')[0],
                                        prevParams: this._parseParams(lastPath.split('?')[1] || ''),
                                        path: currentPath,
                                        pathname: currentPath.split('?')[0],
                                        params: this._parseParams(currentPath.split('?')[1] || '')
                                    });
                                }
                            }.bind(this, this._lastPath, currentPath),
                            function (path, e) {
                              this.immediateReload(path, e);
                            }.bind(this, currentPath)
                        )
                        .done();
                } else {
                    this.missing();
                }
                this._lastPath = currentPath;
            }
        },

        /**
         * Set path and matchers
         * Return handler by new path
         *
         * @param {String} [path] If omitted, then use path from location
         *
         * @return {Object} handler
         */
        _prepareRoute: function (path) {
            var routePath = path || (location.pathname + location.search),
                idx = routePath.indexOf('?'),
                pathName, search, routeInfo;


            if (idx > -1) {
                pathName = routePath.substr(0, idx);
                search = routePath.substr(idx + 1);
            } else {
                pathName = routePath;
                search = '';
            }

            routeInfo = this._getRoute(pathName);

            this._state.set('matchers', (routeInfo) ? routeInfo.matchers : []);
            this._state.set('path', routePath);
            this._readParams(search || '');

            return routeInfo && routeInfo.handler;
        },

        /**
         * Create route handler
         *
         * @override
         * @param {String} blockName
         * @return {Object} handler
         */
        _createHandler: function (blockName) {
            var _this = this;

            return {
                enter: function () {
                    return BEM.blocks[blockName].init(_this._state.get('matchers'));
                },
                update: function () {
                    return BEM.blocks[blockName].update(_this._state.get('matchers'), _this._lastPath, _this.getPath());
                },
                leave: function () {
                    return BEM.blocks[blockName].destruct();
                }
            };
        },

        /**
         * Execute route handler
         *
         * @param {Object} handler route handler
         */
        _execHandler: function (handler) {
            if (handler !== this._lastHandler) {
                var before = this._lastHandler ?
                    Vow.promise(this._lastHandler.leave()) :
                    Vow.fulfill();

                this._lastHandler = handler;
                return before.then(handler.enter);
            } else {
                return handler.update();
            }
        },

        /**
         *
         * Get current host name.
         * @returns {String}
         */
        getHost: function () {
            return location.host;
        },

        /**
         * Get current url params hash
         *
         * @copyright https://github.com/joyent/node/blob/master/lib/querystring.js#L152-L206
         *
         * @return {Object}
         */
        _readParams: function (search) {
            this._state.set(
                'params',
                this._parseParams(search)
            );
        },

        _parseParams: function (search) {
            return String(arguments.length === 1 ? search : location.search)
                .split('&')
                .map(function (part) {
                    var x = part.replace(/\+/g, '%20'),
                        idx = x.indexOf('='),
                        key, val;

                    if (idx > -1) {
                        key = x.substr(0, idx);
                        val = x.substr(idx + 1);
                    } else {
                        if (!x) {
                            return null;
                        }
                        key = x;
                        val = '';
                    }

                    try {
                        key = decodeURIComponent(key);
                        val = decodeURIComponent(val);
                    } catch (e) {}
                    return [key, val];
                })
                .reduce(function (p, sp) {
                    if (sp) {
                        p[sp[0]] = sp[1];
                    }
                    return p;
                }, {})
        },

        /**
         * Sets params to url with history.pushState
         * @param {Object} params
         * @param {Boolean} [allowFallback=false]
         * @param {Boolean} [extend=false] will extend current params
         */
        setParams: function (params, allowFallback, extend) {
            return this._changeParams.call(this, 'set', params, allowFallback, extend);
        },

        /**
         * Replace current params with history.replaceState
         * @param {Object} params
         * @param {Boolean} [allowFallback=false]
         * @param {Boolean} [extend=false] will extend current params
         */
        replaceParams: function (params, allowFallback, extend) {
            return this._changeParams.call(this, 'replace', params, allowFallback, extend);
        },

        /**
         * Change params
         * @param {Object} params
         * @param {Boolean} [allowFallback=false]
         * @param {Boolean} [extend=false] will extend current params
         * @private
         * @returns {*}
         */
        _changeParams: function (method, params, allowFallback, extend) {
            var search = '',
                newParams = params;

            if (extend) {
                newParams = jQuery.extend({}, this.getParams(), params);
            }
            search += jQuery.param(newParams);
            if (location.search === ('?' + search)) {
                return;
            }
            this._state.set('params', newParams);
            return this[method + 'Path'](location.pathname + (search ? '?' + search : ''), allowFallback);
        },

        /**
         * Return current i-router params as query string
         * @returns {String} something like "?bla=1&name=blabla"
         */
        encodedParams: function () {
            return location.search;
        }

    });
    BEM.blocks['i-router'].init();

}());
