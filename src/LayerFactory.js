L.gmx = L.gmx || {};

var DEFAULT_HOSTNAME = 'maps.kosmosnimki.ru';
var DEFAULT_VECTOR_LAYER_ZINDEXOFFSET = 2000000;

//Build in layer classes
L.gmx._layerClasses = {
    'Raster': L.gmx.RasterLayer,
    'Vector': L.gmx.VectorLayer,
    'VectorView': L.gmx.DummyLayer
};

L.gmx._loadingLayerClasses = {};

L.gmx.addLayerClass = function(type, layerClass) {
    L.gmx._layerClasses[type] = layerClass;
};

L.gmx._layerClassLoaders = [];

L.gmx.addLayerClassLoader = function(layerClassLoader) {
    L.gmx._layerClassLoaders.push(layerClassLoader);

    //delete all loading promises to ensure that new loader will be invoked
    L.gmx._loadingLayerClasses = {};
};

L.gmx._loadLayerClass = function(type) {
    if (!L.gmx._loadingLayerClasses[type]) {
		// var promise = new Promise(function(resolve, reject) {
		// }).

		var promise = new L.gmx.Deferred();
        promise.resolve();

        L.gmx._layerClassLoaders.forEach(function(loader) {
            promise = promise.then(function(layerClass) {
                if (layerClass) {
                    L.gmx._layerClasses[type] = layerClass;
                    return layerClass;
                }

                return loader(type);
            },
            function(){
                //just skip loader errors
            });
        });

        promise = promise.then(function(layerClass) {
            if (layerClass) {
                L.gmx._layerClasses[type] = layerClass;
                return layerClass;
            }
        }, function(){
            //just skip loader errors
        });

        L.gmx._loadingLayerClasses[type] = promise;
    }

    return L.gmx._loadingLayerClasses[type];
};

L.gmx.loadLayer = function(mapID, layerID, options) {
    return new Promise(function(resolve, reject) {
        var layerParams = {
            mapID: mapID,
            layerID: layerID
        };

		options = options || {};
		if (!options.skipTiles) { options.skipTiles = 'All'; }

		for (var p in options) {
			layerParams[p] = options[p];
		}

		var hostName = gmxAPIutils.normalizeHostname(options.hostName || DEFAULT_HOSTNAME);
		layerParams.hostName = hostName;

		gmxMapManager.loadMapProperties({
				srs: options.srs,
				hostName: hostName,
				apiKey: options.apiKey,
				mapName: mapID,
				skipTiles: options.skipTiles
			}).then(function() {
				var layerInfo = gmxMapManager.findLayerInfo(hostName, mapID, layerID);

				if (!layerInfo) {
					reject('There is no layer ' + layerID + ' in map ' + mapID);
					return;
				}

				//to know from what host the layer was loaded
				layerInfo.properties.hostName = hostName;

				var type = layerInfo.properties.ContentID || layerInfo.properties.type;

				var doCreateLayer = function() {
					var layer = L.gmx.createLayer(layerInfo, layerParams);
					if (layer) {
						resolve(layer);
					} else {
						reject('Unknown type of layer ' + layerID);
					}
				};

				if (type in L.gmx._layerClasses) {
					doCreateLayer();
				} else {
					L.gmx._loadLayerClass(type).then(doCreateLayer);
				}
			},
			function(response) {
				reject('Can\'t load layer ' + layerID + ' from map ' + mapID + ': ' + response.error);
			}
		);
	});
};

L.gmx.loadLayers = function(layers, globalOptions) {
	return new Promise(function(resolve) {
		Promise.all(layers.map(function(layerInfo) {
			var options = L.extend({}, globalOptions, layerInfo.options);
			return L.gmx.loadLayer(layerInfo.mapID, layerInfo.layerID, options);
		}))
		.then(function(res) {
			resolve(res);
		})
	});
};

L.gmx.loadMap = function(mapID, options) {
    options = L.extend({}, options);
    options.hostName = gmxAPIutils.normalizeHostname(options.hostName || DEFAULT_HOSTNAME);
    options.mapName = mapID;

	if (!options.skipTiles) { options.skipTiles = 'All'; }

    return new Promise(function(resolve, reject) {
		gmxMapManager.loadMapProperties(options).then(function(mapInfo) {
			var loadedMap = new L.gmx.gmxMap(mapInfo, options);

			loadedMap.layersCreated.then(function() {
				if (options.leafletMap || options.setZIndex) {
					var curZIndex = 0,
						layer, rawProperties;

					for (var l = loadedMap.layers.length - 1; l >= 0; l--) {
						layer = loadedMap.layers[l];
						rawProperties = layer.getGmxProperties();
						if (mapInfo.properties.LayerOrder === 'VectorOnTop' && layer.setZIndexOffset && rawProperties.type !== 'Raster') {
							layer.setZIndexOffset(DEFAULT_VECTOR_LAYER_ZINDEXOFFSET);
						}
						if (options.setZIndex && layer.setZIndex) {
							layer.setZIndex(++curZIndex);
						}

						if (options.leafletMap && rawProperties.visible) {
							layer.addTo(options.leafletMap);
						}
					}
				}
				resolve(loadedMap);
			});
		},
		function(response) {
			var errorMessage = (response && response.ErrorInfo && response.ErrorInfo.ErrorMessage) || 'Server error';
			reject('Can\'t load map ' + mapID + ' from ' + options.hostName + ': ' + errorMessage);
		});
    });
};

L.gmx.DummyLayer = function(props) {
    this.onAdd = this.onRemove = function() {};
    this.getGmxProperties = function() { return props; };
};

L.gmx.createLayer = function(layerInfo, options) {
    if (!layerInfo) { layerInfo = {}; }
    if (!layerInfo.properties) { layerInfo.properties = {type: 'Vector'}; }

    var type = layerInfo.properties.ContentID || layerInfo.properties.type || 'Vector',
        layer;

		if (type in L.gmx._layerClasses) {
        try {
            layer = new L.gmx._layerClasses[type](options);
            layer = layer.initFromDescription(layerInfo);
        } catch (e) {
            layer = new L.gmx.DummyLayer(layerInfo.properties);
        }
    } else {
        layer = new L.gmx.DummyLayer(layerInfo.properties);
    }

    return layer;
};
