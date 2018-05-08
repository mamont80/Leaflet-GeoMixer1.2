/** Asynchronously request information about map given server host and map name
*/
var gmxMapManager = {
    //serverHost should be host only string like 'maps.kosmosnimki.ru' without any slashes or 'http://' prefixes
    getMap: function(serverHost, apiKey, mapName, skipTiles, srs) {
		return gmxMapManager.loadMapProperties({
			srs: srs,
			hostName: serverHost,
			apiKey: apiKey,
			mapName: mapName,
			skipTiles: skipTiles
		});
    },

	_addMapProperties: function(res, serverHost, mapName) {
		L.gmx._maps[serverHost] = L.gmx._maps[serverHost] || {};
		L.gmx._maps[serverHost][mapName] = {
			_rawTree: res,
			_nodes: {}
		};
		gmxMapManager.iterateNode(res, function(it) {	// TODO: удалить после переделки стилей на сервере
			if (it.type === 'layer') {
				var props = it.content.properties;
				if (props.styles && !props.gmxStyles) {
					it.content.properties.gmxStyles = L.gmx.StyleManager.decodeOldStyles(props);
				}
			}
		});

		if (L.gmx.mapPropertiesHook) {
			L.gmx.mapPropertiesHook(res);
		}
    },

	loadMapProperties: function(options) {
        var maps = this._maps,
			serverHost = options.hostName || options.serverHost || 'maps.kosmosnimki.ru',
			mapName = options.mapName;

        if (!maps[serverHost] || !maps[serverHost][mapName]) {
			var opt = {
				WrapStyle: 'func',
				skipTiles: options.skipTiles || 'None', // All, NotVisible, None
				MapName: mapName,
				srs: options.srs || 3857,
				ftc: options.ftc || 'osm',
				ModeKey: 'map'
			};
			var promise = new Promise(function(resolve, reject) {
				if (L.gmx.sendCmd) {
					L.gmx.sendCmd('mapProperties', {
						serverHost: serverHost,
						apiKey: options.apiKey,
						WrapStyle: 'func',
						skipTiles: options.skipTiles || 'None', // All, NotVisible, None
						MapName: mapName,
						srs: options.srs || 3857,
						ftc: options.ftc || 'osm',
						ModeKey: 'map'
					}).then(function(json) {
						if (json && json.load && json.res) {
							gmxMapManager._addMapProperties(json.res, serverHost, mapName);
							resolve(json.res);
						} else {
							reject(json);
						}
					}).catch(reject);
				} else {
					gmxSessionManager.requestSessionKey(serverHost, options.apiKey).then(function(sessionKey) {
						opt.key = sessionKey;
						gmxAPIutils.requestJSONP(L.gmxUtil.protocol + '//' + serverHost + '/TileSender.ashx', opt).then(function(json) {
							if (json && json.Status === 'ok' && json.Result) {
								json.Result.properties.hostName = serverHost;
								json.Result.properties.sessionKey = sessionKey;
								gmxMapManager._addMapProperties(json.Result, serverHost, mapName);
								resolve(json.Result);
							} else {
								reject(json);
							}
						}, reject);
					}, reject);
				}
			});
            maps[serverHost] = maps[serverHost] || {};
            maps[serverHost][mapName] = {promise: promise};
        }
        return maps[serverHost][mapName].promise;
    },

	syncParams: {},
    // установка дополнительных параметров для серверных запросов
    setSyncParams: function(hash) {
		this.syncParams = hash;
    },
    getSyncParams: function(stringFlag) {
		var res = this.syncParams;
		if (stringFlag) {
			var arr = [];
			for (var key in res) {
				arr.push(key + '=' + res[key]);
			}
			res = arr.join('&');
		}
		return res;
    },

    //we will (lazy) create index by layer name to speed up multiple function calls
    findLayerInfo: function(serverHost, mapID, layerID) {
		var hostMaps = L.gmx._maps[serverHost],
			layerInfo = null;

		if (hostMaps && hostMaps[mapID]) {
			var mapInfo = hostMaps[mapID];
			if (!mapInfo._nodes[layerID]) {
				gmxMapManager.iterateNode(mapInfo._rawTree, function(it) {
					mapInfo._nodes[it.content.properties.name] = it;
				});
			}
			layerInfo = mapInfo._nodes[layerID];
		}
		return layerInfo ? layerInfo.content : null;
    },
    iterateLayers: function(treeInfo, callback) {
        var iterate = function(arr) {
            for (var i = 0, len = arr.length; i < len; i++) {
                var layer = arr[i];

                if (layer.type === 'group') {
                    iterate(layer.content.children);
                } else if (layer.type === 'layer') {
                    callback(layer.content);
                }
            }
        };

        treeInfo && iterate(treeInfo.children);
    },
    iterateNode: function(treeInfo, callback) {
        var iterate = function(node) {
			var arr = node.children;
            for (var i = 0, len = arr.length; i < len; i++) {
                var layer = arr[i];

				callback(layer);
                if (layer.type === 'group') {
                    iterate(layer.content);
                }
            }
        };

        treeInfo && iterate(treeInfo);
    },
    _maps: {} //Promise for each map. Structure: maps[serverHost][mapID]: {promise:, layers:}
};

L.gmx = L.gmx || {};
L.gmx._maps = {};			// свойства слоев по картам
L.gmx._clientLayers = {};	// свойства слоев без карт (клиентские слои)

if (/\bsw=1\b/.test(location.search)) {
	L.gmx._sw = 1;	// признак загрузки данных через Service Worker
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.register('./gmx-sw1.js')
		  .then(function(registration) {
			console.log('ServiceWorker registration successful with scope: ', registration.scope);
		  })
		  .catch(function(err) {
			console.log('ServiceWorker registration failed: ', err);
		  });
	} else {
		console.error('Your browser does not support Service Workers.');
	}
}

L.gmx.gmxMapManager = gmxMapManager;
