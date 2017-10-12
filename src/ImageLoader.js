(function() {

var ImageRequest = function(id, url, options) {
    this._id = id;
    // this.def = new L.gmx.Deferred(L.gmx.imageLoader._cancelRequest.bind(L.gmx.imageLoader, this));
    this.remove = L.gmx.imageLoader._removeRequestFromCache.bind(L.gmx.imageLoader, this);
    this.url = url;
    this.options = options || {};
    this.promise = this.def = new Promise(function(resolve, reject) {
		this.resolve = resolve;
		this.reject = function() {
			reject();
			L.gmx.imageLoader._cancelRequest(this);
		};
	}.bind(this));
};

var GmxImageLoader = L.Class.extend({
    includes: L.Evented ? L.Evented.prototype : L.Mixin.Events,
    statics: {
        MAX_COUNT: 20 // max number of parallel requests
    },

    initialize: function() {
        this.curCount = 0;        // number of currently processing requests (number of items in "inProgress")
        this.requests = [];       // not yet processed image requests
        this.inProgress = {};     // hash of in progress image loadings
        this.requestsCache = {};  // for requests cache by uniqueID
        this.uniqueID = 0;
    },

    _checkIE11bugFix: function(request, image) {
		if (!this.divIE11bugFix) {
			var div = document.createElement('div');
			this.divIE11bugFix = div;
			div.style.visibility = 'hidden';
			div.style.position = 'absolute';
			document.body.insertBefore(div, document.body.childNodes[0]);
		}
		var ieResolve = function() {
			request.resolve(image);
			// if (image.parentNode) {
				// image.parentNode.removeChild(image);
			// }
		};
		this.divIE11bugFix.appendChild(image);
		setTimeout(ieResolve, 0);
    },

    _resolveRequest: function(request, image, canceled) {
        if (image) {
            if (!canceled && request.options.cache) {
                var url = request.url,
                    cacheItem = this.requestsCache[url],
                    cacheKey = request._id;
                if (!cacheItem) { cacheItem = this.requestsCache[url] = {image: image, requests:{}}; }
                if (!cacheItem.requests[cacheKey]) { cacheItem.requests[cacheKey] = request; }
            }
			if (L.gmxUtil.isIE11 && /\.svg[\?$]/.test(request.url)) {   // skip bug in IE11
				this._checkIE11bugFix(request, image);
			} else {
				request.resolve(image);
			}
        } else if (!canceled) {
            request.reject();
        }
        this.fire('requestdone', {request: request});
    },

    _imageLoaded: function(url, image, canceled) {
        if (url in this.inProgress) {
            var resolveRequest = function(it) {
                this._resolveRequest(it, image, canceled);
            };
            this.inProgress[url].requests.forEach(resolveRequest.bind(this));
            --this.curCount;
            delete this.inProgress[url];
        }
        L.gmxUtil.loaderStatus(url, true);
        this.fire('imageloaded', {url: url});
        this._nextLoad();
    },

    _nextLoad: function() {  // загрузка следующего
        if (this.curCount >= GmxImageLoader.MAX_COUNT || !this.requests.length) {
            return;
        }

        var request = this.requests.shift(),
            url = request.url;

        if (url in this.inProgress) {
            this.inProgress[url].requests.push(request);
        } else {
            var requests = [request];
            this.inProgress[url] = {requests: requests};
            ++this.curCount;

            for (var k = this.requests.length - 1; k >= 0; k--) {
                if (this.requests[k].url === url) {
                    requests.push(this.requests[k]);
                    this.requests.splice(k, 1);
                }
            }

            var image = this._loadImage(request);
            if (!image.width) {
                L.gmxUtil.loaderStatus(url);
            }

            //theoretically image loading can be synchronous operation
            if (this.inProgress[url]) {
                this.inProgress[url].image = image;
            }
        }
    },

    _loadImage: function(request) {
        var imageObj = new Image(),
            url = request.url,
            _this = this;

        if (request.options.crossOrigin) {
            imageObj.crossOrigin = request.options.crossOrigin;
        }

        imageObj.onload = this._imageLoaded.bind(this, url, imageObj, false);
        imageObj.onerror = function() {
            _this._imageLoaded(url);
        };
		if (L.gmxUtil.isIEOrEdge) {
			setTimeout(function() { imageObj.src = url; }, 0);
		} else {
            imageObj.src = url;
		}

        this.fire('imageloadstart', {url: url});

        return imageObj;
    },

    _cancelRequest: function(request) {
        var id = request._id,
            url = request.url,
            i = 0, len;
        if (url in this.inProgress) {
            var loadingImg = this.inProgress[url],
                requests = loadingImg.requests;

            len = requests.length;
            if (len === 1 && requests[0]._id === id) {
                loadingImg.image.onload = L.Util.falseFn;
                loadingImg.image.onerror = L.Util.falseFn;
                loadingImg.image.src = L.Util.emptyImageUrl;
                this._imageLoaded(url, null, true);
            } else {
                for (i = 0; i < len; i++) {
                    if (requests[i]._id === id) {
                        requests.splice(i, 1);
                        break;
                    }
                }
            }
        } else {
            for (i = 0, len = this.requests.length; i < len; i++) {
                if (this.requests[i]._id === id) {
                    this.requests.splice(i, 1);
                    break;
                }
            }
        }

        this.fire('requestdone', {request: request});
    },

    _removeRequestFromCache: function(request) {    // remove request from cache
        this._cancelRequest(request);
        this._clearCacheItem(request.url, request._id);
    },

    _clearCacheItem: function(url, cacheKey) {    // remove cache item
        if (this.requestsCache[url]) {
            var cacheItem = this.requestsCache[url];
            delete cacheItem.requests[cacheKey];
            if (Object.keys(cacheItem.requests).length === 0) {
                delete this.requestsCache[url];
            }
        }
    },
    _add: function(atBegin, url, options) {
		url = url.replace(/^http:/, L.gmxUtil.protocol);

		var id = 'id' + (++this.uniqueID),
            request = new ImageRequest(id, url, options);

        if (url in this.inProgress) {
            this.inProgress[url].requests.push(request);
        } else {
            atBegin ? this.requests.unshift(request) : this.requests.push(request);
            this._nextLoad();
        }

        this.fire('request', {request: request});

        return request;
    },

    push: function(url, options) {  // добавить запрос в конец очереди
        return this._add(false, url, options);
    },

    unshift: function(url, options) {   // добавить запрос в начало очереди
        return this._add(true, url, options);
    }
});

L.gmx.imageLoader = new GmxImageLoader();

})();
