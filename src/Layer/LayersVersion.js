(function() {
var delay = 20000,
    layers = {},
    dataManagersLinks = {},
    script = '/Layer/CheckVersion.ashx',
    intervalID = null,
    timeoutID = null,
    lastParams = {};
    // lastLayersStr = '';

var isExistsTiles = function(prop) {
    var tilesKey = prop.Temporal ? 'TemporalTiles' : 'tiles';
    return tilesKey in prop || prop.currentTiles;
};
var getParams = function(prop, dm, gmx) {
    var pt = {
        Name: prop.name,
        Version: isExistsTiles(prop) ? prop.LayerVersion : -1
    };
	if (dm && (prop.UseTiles === false || gmx.skipTiles === 'NotVisible' || gmx.needBbox)) {
		var maxDateInterval = dm.getMaxDateInterval(),
			beginDate = maxDateInterval.beginDate || gmx.beginDate,
			endDate = maxDateInterval.endDate || gmx.endDate;
        if (beginDate) { pt.dateBegin = Math.floor(beginDate.getTime() / 1000); }
        if (endDate) { pt.dateEnd = Math.floor(endDate.getTime() / 1000); }
    }
    return pt;
};
var getRequestParams = function(layer) {
    var hosts = {},
        prop, hostName, dm, gmx;
    if (layer) {
        if (layer.target instanceof L.gmx.DataManager) {
			layer = layer.target;
		}
        if (layer instanceof L.gmx.DataManager) {
			dm = layer;
			prop = dm.options;
		} else {
			prop = layer._gmx.properties;
			dm = layer._gmx.dataManager;
			gmx = layer._gmx;
		}
        hostName = prop.hostName || layer._gmx.hostName;
		hosts[hostName] = [getParams(prop, dm, gmx)];
    } else {
        var skipItems = {};
        for (var id in layers) {
            var obj = layers[id],
				isDataManager = obj instanceof L.gmx.DataManager;
            if (obj.options.chkUpdate || isDataManager) {
				dm = isDataManager ? obj : obj._gmx.dataManager;
                prop = isDataManager ? obj.options : obj._gmx.properties;
				gmx = isDataManager ? obj : obj._gmx;
                hostName = prop.hostName || obj._gmx.hostName;
                var pt = getParams(prop, dm, gmx),
                    key = pt.Name + pt.Version;
                if (!skipItems[key]) {
                    if (hosts[hostName]) { hosts[hostName].push(pt); }
                    else { hosts[hostName] = [pt]; }
                }
                skipItems[key] = true;
            }
        }
    }
    return hosts;
};

var chkVersion = function (layer, callback) {
	var map = layersVersion._map;
    var processResponse = function(res) {
        if (res && res.Status === 'ok' && res.Result) {
			var arr = res.Result,
				len = arr.length,
				count = 0,
				i, key, curLayer, id, item;

			if (layersVersion.needBbox) {
				for (i = 0; i < len; i++) {
					item = arr[i];
					id = item.name || item.properties.name;
					curLayer = null;
					if (layer && layer._gmx.properties.name === id) {
						curLayer = layer;
					} else {
						for (key in layers) {
							curLayer = layers[key];
							if (layer && layer === curLayer && 'updateVersion' in layer) { continue; }
							if (curLayer._gmx && curLayer._gmx.properties.name === id && 'updateVersion' in curLayer) {	// слои
								break;
							} else if (curLayer instanceof L.gmx.DataManager && curLayer.options.name === id) {	// источники данных
								break;
							}
						}
					}
					if (curLayer) {
						count += (curLayer.getDataManager ? curLayer.getDataManager() : curLayer).getNotLoadedVectorTiles(item);
					}
				}
				map.fire('needLoadTiles', {count: count});
				if (L.gmx.skipLoadTiles) {
					console.log('Skiped tiles: ', L.gmx.needLoadTiles);
					return;
				}
			}

            for (i = 0; i < len; i++) {
                item = arr[i];
				id = item.name || item.properties.name;

				if (layer && layer._gmx.properties.name === id && 'updateVersion' in layer) { layer.updateVersion(item); }
                for (key in layers) {
                    curLayer = layers[key];
					if (layer && layer === curLayer) { continue; }
                    if (curLayer._gmx && curLayer._gmx.properties.name === id && 'updateVersion' in curLayer) {	// слои
						curLayer.updateVersion(item);
					} else if (curLayer instanceof L.gmx.DataManager && curLayer.options.name === id) {	// источники данных
						curLayer.updateVersion(item.properties, item.tiles);
					}
                }
            }
        }
        // lastLayersStr = '';
        if (callback) { callback(res); }
    };

    if (document.body && !L.gmxUtil.isPageHidden()) {
        var hosts = getRequestParams(layer),
            chkHost = function(hostName) {
				var url = L.gmxUtil.protocol + '//' + hostName + script,
                    layersStr = JSON.stringify(hosts[hostName]);
				var params = 'WrapStyle=None&ftc=osm';
				if (layersVersion.needBbox) {
					var crs = L.Projection.Mercator;
					if (map.options.srs == 3857) {
						params += '&srs=3857';
						crs = L.CRS.EPSG3857;
					}
					var zoom = map.getZoom(),
						bbox = map.getBounds(),
						min = crs.project(bbox.getSouthWest()),
						max = crs.project(bbox.getNorthEast()),
						bboxStr = [min.x, min.y, max.x, max.y].join(',');
					params += '&zoom=' + zoom;
					params += '&bbox=[' + bboxStr + ']';
				}
				params += '&layers=' + encodeURIComponent(layersStr);

                if (layer || !lastParams[hostName] || lastParams[hostName] !== params) {
                    // lastLayersStr = layersStr;
                    if ('FormData' in window) {
                        L.gmxUtil.request({
                            url: url,
                            async: true,
                            headers: {
                                'Content-type': 'application/x-www-form-urlencoded'
                            },
                            type: 'POST',
                            params: params,
                            withCredentials: true,
                            callback: function(response) {
								lastParams[hostName] = params;
                                processResponse(JSON.parse(response));
                            },
                            onError: function(response) {
                                console.log('Error: LayerVersion ', response);
                            }
                        });
                    // } else {
                        // L.gmxUtil.sendCrossDomainPostRequest(url, {
                            // WrapStyle: 'message',
                            // layers: layersStr
                        // }, processResponse);
                    }
                    var timeStamp = Date.now();
                    for (var key in layers) {
                        var it = layers[key];
                        var options = it._gmx || it.options;
                        if (options.hostName === hostName) { options._stampVersionRequest = timeStamp; }
                    }
                }
            };
        for (var hostName in hosts) {
            chkHost(hostName);
        }
    }
};

var layersVersion = {
    needBbox: false,

    addDataManager: function(dataManager) {
        var options = dataManager.options,
			id = options.name;
        if (id in layers) {
            return;
		}
		if (options.needBbox && !layersVersion.needBbox) {
			layersVersion.needBbox = options.needBbox;
		}
		dataManager.on('chkLayerUpdate', chkVersion.bind(dataManager));
		layers[id] = dataManager;
    },

    removeDataManager: function(dataManager) {
        var id = dataManager.options.name;
        if (id in layers) {
			dataManager.off('chkLayerUpdate', chkVersion.bind(dataManager));
			delete layers[id];
		}
    },

    remove: function(layer) {
        delete layers[layer._gmx.layerID];
        var _gmx = layer._gmx,
			pOptions = layer.options.parentOptions;
		if (pOptions) {
			var pId = pOptions.name;
			if (dataManagersLinks[pId]) {
				delete dataManagersLinks[pId][_gmx.properties.name];
				if (!Object.keys(dataManagersLinks[pId]).length) {
					layersVersion.removeDataManager(_gmx.dataManager);
					delete dataManagersLinks[pId];
				}
			}
		} else {
			_gmx.dataManager.off('chkLayerUpdate', _gmx._chkVersion);
		}
    },

    add: function(layer) {
        var id = layer._gmx.layerID;
        if (id in layers) {
            return;
		}

        var _gmx = layer._gmx,
            prop = _gmx.properties;
        if ('LayerVersion' in prop) {
            layers[id] = layer;
            _gmx._chkVersion = function () {
                chkVersion(layer);
            };
            _gmx.dataManager.on('chkLayerUpdate', _gmx._chkVersion);
			var pOptions = layer.options.parentOptions;
			if (pOptions) {
				var pId = pOptions.name;
				layersVersion.addDataManager(_gmx.dataManager);
				if (!dataManagersLinks[pId]) { dataManagersLinks[pId] = {}; }
				dataManagersLinks[pId][prop.name] = layer;
			}

            if (_gmx.needBbox && !layersVersion.needBbox) {
				layersVersion.needBbox = _gmx.needBbox;
			}
			layersVersion.start();
            // if (!_gmx._stampVersionRequest || _gmx._stampVersionRequest < Date.now() - 19000 || !isExistsTiles(prop)) {
				layersVersion.now();
            // }
        }
    },

    chkVersion: chkVersion,

    now: function() {
		if (timeoutID) { cancelIdleCallback(timeoutID); }
		timeoutID = requestIdleCallback(function() {
			chkVersion();
		}, {timeout: 25});
		// if (timeoutID) { clearTimeout(timeoutID); }
		// timeoutID = setTimeout(chkVersion, 0);
    },

    stop: function() {
        if (intervalID) { clearInterval(intervalID); }
        intervalID = null;
    },

    start: function(msec) {
        if (msec) { delay = msec; }
        layersVersion.stop();
        intervalID = setInterval(chkVersion, delay);
    }
};

if (!L.gmx) { L.gmx = {}; }
L.gmx.layersVersion = layersVersion;

L.gmx.VectorLayer.include({
    updateVersion: function (layerDescription) {
        if (layerDescription) {
            var gmx = this._gmx;
            if (layerDescription.geometry) {
                gmx.geometry = layerDescription.geometry;
            }
            if (layerDescription.properties) {
                L.extend(gmx.properties, layerDescription.properties);
                gmx.properties.currentTiles = layerDescription.tiles;
                gmx.properties.GeoProcessing = layerDescription.properties.GeoProcessing;
                gmx.rawProperties = gmx.properties;
                this.fire('versionchange');
            }
			if (!gmx.dataSource && gmx.dataManager) {
				gmx.dataManager.updateVersion(gmx.rawProperties, layerDescription.tiles);
			}
        }
    }
});
L.Map.addInitHook(function () {
	layersVersion._map = this;
	var map = this,
		prev = {};
	this.on('moveend', function () {
		var z = map.getZoom(),
			center = map.getPixelBounds().getCenter();
		if (z !== prev.z || prev.center.distanceTo(center) > 128) {
			chkVersion();
			prev.z = z;
			prev.center = center;
		}
	});
});

})();
