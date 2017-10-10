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

	loadMapProperties: function(options) {
        var maps = this._maps,
			serverHost = options.hostName || options.serverHost,
			mapName = options.mapName;

        if (!maps[serverHost] || !maps[serverHost][mapName]) {
			var opt = {
				WrapStyle: 'func',
				skipTiles: options.skipTiles || 'None', // All, NotVisible, None
				MapName: mapName,
				srs: options.srs || '',
				ModeKey: 'map'
			};
			if (options.srs === 3857) { opt.cs = 'wm'; }
            var def = new L.gmx.Deferred();
            maps[serverHost] = maps[serverHost] || {};
            maps[serverHost][mapName] = {promise: def};

            gmxSessionManager.requestSessionKey(serverHost, options.apiKey).then(function(sessionKey) {
				opt.key = sessionKey;

				gmxAPIutils.requestJSONP(L.gmxUtil.protocol + '//' + serverHost + '/TileSender.ashx', opt).then(function(json) {
                    if (json && json.Status === 'ok' && json.Result) {
                        json.Result.properties.hostName = serverHost;
                        def.resolve(json.Result);
                    } else {
                        def.reject(json);
                    }
                }, def.reject);
            }, def.reject);
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
        var hostMaps = this._maps[serverHost],
            mapInfo = hostMaps && hostMaps[mapID];

        if (!mapInfo) {
            return null;
        }

        if (mapInfo.layers) {
            return mapInfo.layers[layerID];
        }

        var serverData = mapInfo.promise.getFulfilledData();

        if (!serverData) {
            return null;
        }

        mapInfo.layers = {};

        //create index by layer name
        gmxMapManager.iterateLayers(serverData[0], function(layerInfo) {
            mapInfo.layers[layerInfo.properties.name] = layerInfo;
        });

        return mapInfo.layers[layerID];
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

L.gmx.gmxMapManager = gmxMapManager;
