/** Asynchronously request session keys from GeoMixer servers (given apiKey and server host)
*/
var gmxSessionManager = {
    APIKEY_PARAM: 'key',
    SCRIPT_REGEXP: [
		/\bleaflet-geomixer(-\w*)?\.js\b/,
		/\bgeomixer(-\w*)?\.js\b/
	],
    _scriptSearched: false,
    _scriptAPIKey: null,
    _searchScriptAPIKey: function() {
        var _this = this;
        if (this._scriptSearched) {
            return this._scriptAPIKey;
        }

        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].getAttribute('src'),
				arr = this.SCRIPT_REGEXP;
			for (var j = 0, len = arr.length; j < len; j++) {
				if (arr[j].exec(src)) {
					var query = src.split('?')[1];

					if (query) {
						var params = query.split('&');
						for (var p = 0; p < params.length; p++) {
							var parsedParam = params[p].split('=');
							if (parsedParam[0] === _this.APIKEY_PARAM) {
								_this._scriptAPIKey = parsedParam[1];
								break;
							}
						}
					}
					break;
				}
            }
			if (_this._scriptAPIKey) {
				break;
			}
        }
        this._scriptSearched = true;
        return this._scriptAPIKey;
    },

    //we will search apiKey in script tags iff apiKey parameter is undefined.
    //if it is defined as falsy (null, '', etc), we won't send any requests to server
    requestSessionKey: function(serverHost, apiKey) {
        var keys = this._sessionKeys;

        if (!(serverHost in keys)) {
            apiKey = typeof apiKey === 'undefined' ? this._searchScriptAPIKey() : apiKey;
            keys[serverHost] = new L.gmx.Deferred();
            if (apiKey) {
                gmxAPIutils.requestJSONP(
                    L.gmxUtil.protocol + '//' + serverHost + '/ApiKey.ashx',
                    {
                        WrapStyle: 'func',
                        Key: apiKey
                    }
                ).then(function(response) {
                    if (response && response.Status === 'ok') {
                        keys[serverHost].resolve(response.Result.Key);
                    } else {
                        keys[serverHost].reject();
                    }
                }, keys[serverHost].reject);
            } else {
                keys[serverHost].resolve('');
            }
        }
        return keys[serverHost];
    },

    //get already received session key
    getSessionKey: function(serverHost) {
        var keyPromise = this._sessionKeys[serverHost];

        return keyPromise && keyPromise.getFulfilledData() && keyPromise.getFulfilledData()[0];
    },
    _sessionKeys: {} //deferred for each host
};
L.gmx = L.gmx || {};
L.gmx.gmxSessionManager = gmxSessionManager;
