var ObserverTileLoader = L.Class.extend({
    includes: L.Evented ? L.Evented.prototype : L.Mixin.Events,
    initialize: function(dataManager) {
        this._dataManager = dataManager;
        this._observerData = {};
        this._tileData = {};
    },

    addObserver: function(observer) {
		this._observerData[observer.id] = {
            observer: observer,
            tiles: {},
            leftToLoad: 0,
            loadingState: false //are we loading any tiles for this observer?
        };

        observer.on('update', this._updateObserver.bind(this, observer));

        this._updateObserver(observer);

        return this;
    },

    removeObserver: function(id) {
        var obsTiles = this._observerData[id].tiles;

        for (var tileId in obsTiles) {
            delete this._tileData[tileId].observers[id];
        }

        delete this._observerData[id];

        return this;
    },

    addTile: function(tile) {
        var leftToLoadDelta = tile.state === 'loaded' ? 0 : 1;
        tile.loadDef.then(this._tileLoadedCallback.bind(this, tile));

        var tileObservers = {};

        for (var key in this._observerData) {
            var obsInfo = this._observerData[key];

            if (obsInfo.observer.intersectsWithTile(tile)) {
                obsInfo.tiles[tile.vectorTileKey] = true;
                obsInfo.leftToLoad += leftToLoadDelta;
                tileObservers[key] = true;
            }
        }

        this._tileData[tile.vectorTileKey] = {
            observers: tileObservers,
            tile: tile
        };

        return this;
    },

    removeTile: function(tileId) {
        var tileData = this._tileData[tileId],
            leftToLoadDelta = tileData.tile.state === 'loaded' ? 0 : 1;

        for (var id in tileData.observers) {
            var observerData = this._observerData[id];
            observerData.leftToLoad -= leftToLoadDelta;
            delete observerData.tiles[tileId];
        }

        delete this._tileData[tileId];

        return this;
    },

    _isLeftToLoad: function(obsData) {
		var cnt = 0;
		for (var tileId in obsData.tiles) {
			if (this._tileData[tileId].tile.state !== 'loaded') {cnt++;}
		}
		return cnt;
    },

    startLoadTiles: function(observer) {
        //force active tile list update
        this._dataManager._getActiveTileKeys();

        var obsData = this._observerData[observer.id];
        if (obsData) {
			obsData.leftToLoad = this._isLeftToLoad(obsData);
			if (obsData.leftToLoad < 1) {
				this.fire('observertileload', {observer: observer});
				return this;
			}

			if (!obsData.loadingState) {
				obsData.loadingState = true;
				observer.fire('startLoadingTiles');
			}

			for (var tileId in obsData.tiles) {
				this._tileData[tileId].tile.load();
			}
        }

        return this;
    },

    getTileObservers: function(tileId) {
        return this._tileData[tileId].observers;
    },

    getObserverLoadingState: function(observer) {
        return this._observerData[observer.id].loadingState;
    },

    getObserverLeftToLoad: function(observer) {
        return this._observerData[observer.id].leftToLoad;
    },

    _updateObserver: function(observer) {
        if (this._observerData[observer.id]) {
			var obsData = this._observerData[observer.id],
				newObserverTiles = {},
				leftToLoad = 0,
				key;

			for (key in this._tileData) {
				var tile = this._tileData[key].tile;
				if (observer.intersectsWithTile(tile)) {
					newObserverTiles[key] = true;
					if (tile.state !== 'loaded') {
						leftToLoad++;
					}
					this._tileData[key].observers[observer.id] = true;
				}
			}

			for (key in obsData.tiles) {
				if (!(key in newObserverTiles)) {
					delete this._tileData[key].observers[observer.id];
				}
			}

			obsData.tiles = newObserverTiles;
			obsData.leftToLoad = leftToLoad;
		}
    },

    _tileLoadedCallback: function(tile) {
        this.fire('tileload', {tile: tile});

        if (!(tile.vectorTileKey in this._tileData)) {		// TODO: проверка загружаемого тайла
			//console.log('tileload', tile, this._tileData)
            return;
        }

        var tileObservers = this._tileData[tile.vectorTileKey].observers;
        for (var id in tileObservers) {
            var obsData = this._observerData[id];
            obsData.leftToLoad--;

            if (obsData.leftToLoad < 1) {
                if (obsData.loadingState) {
                    obsData.loadingState = false;
                    obsData.observer.fire('stopLoadingTiles');
                }
                this.fire('observertileload', {observer: obsData.observer});
            }
        }
    }
});

var DataManager = L.Class.extend({
    includes: L.Evented ? L.Evented.prototype : L.Mixin.Events,

    options: {
        name: null,                         // layer ID
		srs: '',							// geometry projection (3395 or 3857)
        identityField: '',                  // attribute name for identity items
        attributes: [],                     // attributes names
        attrTypes: [],                      // attributes types
        tiles: null,                        // tiles array for nontemporal data
        tilesVers: null,                    // tiles version array for nontemporal data
        LayerVersion: -1,                   // layer version
        GeoProcessing: null,                // processing data
        Temporal: false,                    // only for temporal data
        TemporalColumnName: '',             // temporal attribute name
        ZeroDate: '01.01.2008',             // 0 date string
        TemporalPeriods: [],                // temporal periods
        TemporalTiles: [],                  // temporal tiles array
        TemporalVers: [],                   // temporal version array
        hostName: 'maps.kosmosnimki.ru',    // default hostName
        sessionKey: '',                     // session key
        isGeneralized: false,               // flag for use generalized tiles
		needBbox: false,               		// flag for get tiles list by BBOX
        isFlatten: false                    // flag for flatten geometry
    },

    setOptions: function(options) {
        this._clearProcessing();
        if (options.GeoProcessing) {
            this.processingTile = this.addData([]);
            this._chkProcessing(options.GeoProcessing);
        }
        L.setOptions(this, options);
        this.optionsLink = options;
        this._isTemporalLayer = this.options.Temporal;

        var tileAttributes = L.gmxUtil.getTileAttributes(this.options);
        this.tileAttributeIndexes = tileAttributes.tileAttributeIndexes;
        this.temporalColumnType = tileAttributes.tileAttributeTypes[this.options.TemporalColumnName];

        var hostName = this.options.hostName,
            sessionKey = this.options.sessionKey || '';

        // if (!sessionKey) {
            // sessionKey = L.gmx.gmxSessionManager.getSessionKeyRes(hostName);
        // }
        this.tileSenderPrefix = L.gmxUtil.protocol + '//' + hostName + '/' +
            'TileSender.ashx?WrapStyle=None' +
            '&key=' + encodeURIComponent(sessionKey);

        this._needCheckActiveTiles = true;
    },

    _vectorTileDataProviderLoad: function(x, y, z, v, s, d, callback) {
        var _this = this;
        gmxVectorTileLoader.load(
            _this.tileSenderPrefix,
            {x: x, y: y, z: z, v: v, s: s, d: d, srs: this.options.srs, layerID: _this.options.name}
        ).then(callback, function() {
            console.log('Error loading vector tile');
            callback({values:[]});
            _this.fire('chkLayerUpdate', {dataProvider: _this}); //TODO: do we really need event here?
        });
    },

    initialize: function(options, clearVersion) {
        this._tilesTree = null;
        this._activeTileKeys = {};
        this._endDate = null;
        this._beginDate = null;

        this._tiles = {};
        this._filters = {};
        this._filtersView = {};
        this._freeSubscrID = 0;
        this._items = {};
        this._observers = {};

        this._needCheckDateInterval = false;
        this._needCheckActiveTiles = true;

        var _this = this;
        this._vectorTileDataProvider = {
            load: this._vectorTileDataProviderLoad.bind(this)
        };

        this._observerTileLoader = new ObserverTileLoader(this);
        this._observerTileLoader.on('tileload', function(event) {
            var tile = event.tile;
            _this._updateItemsFromTile(tile);

            if (_this._tilesTree) {
                var treeNode = _this._tilesTree.getNode(tile.d, tile.s);
                treeNode && treeNode.count--; //decrease number of tiles to load inside this node
            }
        });

        this._observerTileLoader.on('observertileload', function(event) {
            var observer = event.observer;
            if (observer.isActive()) {
                observer.needRefresh = false;
                observer.updateData(_this.getItems(observer.id));
            }
        });
        this.setOptions(options);
        if (clearVersion) {
			this.options.LayerVersion = -1;
		}
        if (this._isTemporalLayer) {
            this.addFilter('TemporalFilter', function(item, tile, observer) {
                var unixTimeStamp = item.options.unixTimeStamp,
                    dates = observer.dateInterval;
                return dates && unixTimeStamp >= dates.beginDate.valueOf() && unixTimeStamp < dates.endDate.valueOf();
            });
        }
    },

    _getActiveTileKeys: function() {

        this._chkMaxDateInterval();
        if (this.options.needBbox || !this._needCheckActiveTiles) {
            return this._activeTileKeys;
        }

        // только для режима с полными списками тайлов
		this._needCheckActiveTiles = false;

		if (this._isTemporalLayer) {
			var newTileKeys = {};
			if (this._beginDate && this._endDate) {
				if (!this._tilesTree) {
					this.initTilesTree();
				}
				newTileKeys = this._tilesTree.selectTiles(this._beginDate, this._endDate).tiles;
			}
			this._updateActiveTilesList(newTileKeys);
		} else {
			this.initTilesList();
		}

        return this._activeTileKeys;
    },

    getViewFilters: function(name, layerID) {
        var out = [];
		name = (name || 'screen');
		for (var key in this._filtersView[layerID]) {
			if (key.indexOf(name) === 0) {
				out.push(key);
			}
		}
        return out;
    },

    _getObserversByFilterName: function(filterName, target) {
        var oKeys = {};
        for (var id in this._observers) {
			var observer = this._observers[id];
			if (observer.hasFilter(filterName)) {
				oKeys[id] = true;
			} else if (target && target === observer.target) {
				observer.filters.push(filterName);
                oKeys[id] = true;
			}
        }
        return oKeys;
    },

    addLayerFilter: function(filterFunc, options) {
        if (options && options.layerID) {
			var	layerID = options.layerID,
				target = options.target || 'screen',
				name = target;

			if (!this._filtersView[layerID]) { this._filtersView[layerID] = {}; }
			if (options.id) { name += '_' + options.id; }

			this._filtersView[layerID][name] = filterFunc;
			this._triggerObservers(this._getObserversByFilterName(name, target));
		}
		return this;
    },

    removeLayerFilter: function(options) {
        if (this._filtersView[options.layerID]) {
			var	layerID = options.layerID,
				target = options.target || 'screen',
				name = target;
			if (options.id) { name += '_' + options.id; }

            if (this._filtersView[layerID][name]) {
				var oKeys = this._getObserversByFilterName(name, target);
				delete this._filtersView[layerID][name];
				this._triggerObservers(oKeys);
			}
        }
		return this;
    },

    addFilter: function(filterName, filterFunc) {
        this._filters[filterName] = filterFunc;
        this._triggerObservers(this._getObserversByFilterName(filterName));
		return this;
    },

    removeFilter: function(filterName) {
        if (this._filters[filterName]) {
            var oKeys = this._getObserversByFilterName(filterName);
            delete this._filters[filterName];
            this._triggerObservers(oKeys);
        }
		return this;
    },

    getItems: function(oId) {
        var resArr = [],
            observer = this._observers[oId];
// console.log('getItems', oId, this.options.name);

        // if (!observer || !observer.isActive()) {
        if (!observer) {
            return [];
        }
        if (!observer.isActive() && observer.id !== 'hover') {
            return [];
        }

        //add internal filters
        var layerID = observer.layerID,
			_filtersView = this._filtersView[layerID] || {},
			filters = observer.filters.concat('processingFilter');
        this._isTemporalLayer && filters.push('TemporalFilter');

        filters = filters.filter(function(filter) {
            return (filter in this._filters) || (filter in _filtersView);
        }.bind(this));

        var _this = this,
            putData = function(tile) {
                var data = tile.data,
					lastIndex = resArr.length,
					len = data.length;

				resArr.length = lastIndex + len;
                for (var i = 0; i < len; i++) {
                    var dataOption = tile.dataOptions[i];
                    if (!observer.intersects(dataOption.bounds)) { continue; }

                    var it = data[i],
						geom = it[it.length - 1];
                    if (!observer.intersectsWithGeometry(geom)) { continue; }

                    var id = it[0],
                        item = _this.getItem(id),
                        isFiltered = false;

                    for (var f = 0; f < filters.length; f++) {
                        var name = filters[f],
							filterFunc = _this._filters[name] || _filtersView[name];
                        if (filterFunc && !filterFunc(item, tile, observer, geom, dataOption)) {
                            isFiltered = true;
                            break;
                        }
                    }

                    if (!isFiltered) {
						var rItem = {
                            id: id,
                            properties: it,
                            item: item,
                            dataOption: dataOption,
                            v: tile.v,
                            tileKey: tile.vectorTileKey
                        };
						if (observer.itemHook) {
							observer.itemHook(rItem);
						} else {
							resArr[lastIndex++] = rItem;
						}
                    }
                }
				resArr.length = lastIndex;
            };
        var activeTileKeys =  this._getActiveTileKeys();
        for (var tkey in activeTileKeys) {
            var tile = _this._tiles[tkey].tile;
            if (tile.data && tile.data.length > 0 && (tile.z === 0 || observer.intersectsWithTile(tile))) {
                putData(tile);
            }
        }

       return resArr;
    },

    _updateItemsFromTile: function(tile) {
        var vectorTileKey = tile.vectorTileKey,
            data = tile.data || [],
            len = data.length,
            geomIndex = data[0] && (data[0].length - 1);

        for (var i = 0; i < len; i++) {
            var it = data[i],
                geom = it[geomIndex],
                id = it[0],
                item = this._items[id];
            if (item) {
                if (!item.processing) {
                    item.properties = it;
                    if (item.type.indexOf('MULTI') === -1) {
                        item.type = 'MULTI' + item.type;
                    }
                } else {
                    tile.data[i] = item.properties;
                }
                delete item.bounds;
                item.currentFilter = null;
            } else {
                item = {
                    id: id,
                    type: geom.type,
                    properties: it,
                    options: {
                        fromTiles: {}
                    }
                };
                this._items[id] = item;
            }
            item.options.fromTiles[vectorTileKey] = i;
            if (tile.isGeneralized) {
                item.options.isGeneralized = true;
            }

            if (this.options.TemporalColumnName) {
                var zn = it[this.tileAttributeIndexes[this.options.TemporalColumnName]];
                item.options.unixTimeStamp = zn * 1000;
            }
        }
        return len;
    },

    getMaxDateInterval: function() {
        this._chkMaxDateInterval();
		return {
			beginDate: this._beginDate,
			endDate: this._endDate
		};
    },

    _chkMaxDateInterval: function() {
        if (this._isTemporalLayer && this._needCheckDateInterval) {
            this._needCheckDateInterval = false;
            var observers = this._observers,
                newBeginDate = null,
                newEndDate = null;
            for (var oId in observers) {
                var observer = observers[oId],
                    dateInterval = observer.dateInterval;

                if (!dateInterval) {
                    continue;
                }

                if (!newBeginDate || dateInterval.beginDate < newBeginDate) {
                    newBeginDate = dateInterval.beginDate;
                }

                if (!newEndDate || dateInterval.endDate > newEndDate) {
                    newEndDate = dateInterval.endDate;
                }
            }
            if (newBeginDate && newEndDate && (this._beginDate !== newBeginDate || this._endDate !== newEndDate)) {
                this._beginDate = newBeginDate;
                this._endDate = newEndDate;
                this._needCheckActiveTiles = true;
            }
        }
    },

    addObserver: function(options, id) {
        id = id || 's' + (++this._freeSubscrID);
        var _this = this,
            observer = new Observer(options);

        observer.id = id;
        observer.needRefresh = true;
        this._observerTileLoader.addObserver(observer);

        observer
            .on('update', function(ev) {
                observer.needRefresh = true;
                if (ev.temporalFilter) {
                    _this._needCheckDateInterval = true;
                }

				L.gmx.layersVersion.now();
                _this._waitCheckObservers();
            })
            .on('activate', function() {
                _this.fire('observeractivate');
                _this.checkObserver(observer);
            });

        _this._needCheckDateInterval = true;
        this._observers[id] = observer;
        this._waitCheckObservers();

        if (observer.isActive()) {
            this.fire('observeractivate');
        }

        return observer;
    },

    getActiveObserversCount: function() {
        var count = 0;
        for (var k in this._observers) {
            if (this._observers[k].isActive()) { count++; }
        }
        return count;
    },

    getObserver: function(id) {
        return this._observers[id];
    },

    // removeScreenObservers: function(z) {
        // for (var k in this._observers) {
            // var observer = this._observers[k];
            // if (observer.target === 'screen') {
				// if (z && observer.z === z) {
					// continue;
				// }
				// observer.deactivate(true);
				// this.removeObserver(k);
			// }
        // }
    // },

    // toggleScreenObservers: function(flag, z) {
        // for (var k in this._observers) {
            // var observer = this._observers[k];
            // if (observer.target === 'screen' && observer.z === z) {
				// if (flag) {
					// observer.activate();
				// } else {
					// observer.deactivate();
				// }
			// }
        // }
    // },

    removeObserver: function(id) {
        if (this._observers[id]) {
            this._observerTileLoader.removeObserver(id);
            var isActive = this._observers[id].isActive();

            delete this._observers[id];

            if (isActive) {
                this.fire('observeractivate');
            }
        }
    },

    getObserverLoadingState: function(observer) {
        return this._observerTileLoader.getObserverLoadingState(observer);
    },

    getObserverLeftToLoad: function(observer) {
        return this._observerTileLoader.getObserverLeftToLoad(observer);
    },

    getTileKeysToLoad: function(beginDate, endDate) {
		var newTileKeys = this._tilesTree.selectTiles(beginDate, endDate).tiles;
        return newTileKeys;
    },

    getItemsBounds: function() {
        if (!this._itemsBounds) {
            this._itemsBounds = gmxAPIutils.bounds();
            for (var id in this._items) {
                var item = this.getItem(id);
                this._itemsBounds.extendBounds(item.bounds);
            }
        }
        return this._itemsBounds;
    },

    //combine and return all parts of geometry
    getItem: function(id) {
        var item = this._items[id];
        if (item && !item.bounds) {
            var fromTiles = item.options.fromTiles,
                arr = [];
            for (var key in fromTiles) {    // get full object bounds
                if (this._tiles[key]) {
                    var num = fromTiles[key],
                        tile = this._tiles[key].tile;
                    if (tile.state === 'loaded' && tile.dataOptions[num]) {
                        arr.push(tile.dataOptions[num].bounds);
                    } else {
                        delete fromTiles[key];
                    }
                }
            }
            if (arr.length === 1) {
                item.bounds = arr[0];
            } else {
                item.bounds = gmxAPIutils.bounds();
                var w = gmxAPIutils.worldWidthMerc;
                for (var i = 0, len = arr.length; i < len; i++) {
                    var it = arr[i];
                    if (item.bounds.max.x - it.min.x > w) {
                        it = gmxAPIutils.bounds([
                            [it.min.x + 2 * w, it.min.y],
                            [it.max.x + 2 * w, it.max.y]
                        ]);
                    }
                    item.bounds.extendBounds(it);
                }
            }
        }
        return item;
    },

    getItemMembers: function(id) {
        var fromTiles = this._items[id].options.fromTiles,
            members = [];
        for (var key in fromTiles) {
            if (this._tiles[key]) {
                var tile = this._tiles[key].tile;
                if (tile.data) {
                    var objIndex = fromTiles[key],
                        props = tile.data[objIndex],
                        dataOption = tile.dataOptions[objIndex],
                        bbox = dataOption.bounds;

                    members.push({
                        geo: props[props.length - 1],
                        width: bbox.max.x - bbox.min.x,
                        dataOption: dataOption
                    });
                }

            }
        }
        return members.sort(function(a, b) {
            return b.width - a.width;
        });
    },

    getItemGeometries: function(id) {
        var fromTiles = this._items[id] ? this._items[id].options.fromTiles : {},
            geomItems = [];
        for (var key in fromTiles) {
            if (this._tiles[key] && this._tiles[key].tile.data) {
                var tileData = this._tiles[key].tile.data,
                    props = tileData[fromTiles[key]];

                geomItems.push(gmxAPIutils.getUnFlattenGeo(props[props.length - 1]));
            }
        }
        return geomItems;
    },

    addTile: function(tile) {
        this._tiles[tile.vectorTileKey] = {tile: tile};
        this._getActiveTileKeys()[tile.vectorTileKey] = true;
        this._observerTileLoader.addTile(tile);
        this.checkObservers();
    },

    checkObserver: function(observer) {
        if (observer.needRefresh && observer.isActive()) {
            this._observerTileLoader.startLoadTiles(observer);
        }
    },

    checkObservers: function() {
        var observers = this._observers;
        for (var id in this._observers) {
            this.checkObserver(observers[id]);
        }
    },

    _waitCheckObservers: function() {
        //TODO: refactor
        if (this._checkObserversTimer) { clearTimeout(this._checkObserversTimer); }
        this._checkObserversTimer = setTimeout(L.bind(this.checkObservers, this), 25);
		// if (this._checkObserversTimer) { cancelIdleCallback(this._checkObserversTimer); }
		// this._checkObserversTimer = requestIdleCallback(L.bind(this.checkObservers, this), {timeout: 25});
    },

    _triggerObservers: function(oKeys) {
        var keys = oKeys || this._observers;

        for (var id in keys) {
            if (this._observers[id]) {
                this._observers[id].needRefresh = true;
            }
        }
        this._waitCheckObservers();
    },

    _removeDataFromObservers: function(data) {
        var keys = this._observers;
        for (var id in keys) {
            this._observers[id].removeData(data);
        }
        this._waitCheckObservers();
    },

    preloadTiles: function(dateBegin, dateEnd, bounds) {
        var tileKeys = {};
        if (this._isTemporalLayer) {
            if (!this._tilesTree) {
                this.initTilesTree();
            }
            tileKeys = this._tilesTree.selectTiles(dateBegin, dateEnd).tiles;
        } else {
            this._needCheckActiveTiles = true;
            tileKeys = this._getActiveTileKeys();
        }

        var loadingDefs = [];
        for (var key in tileKeys) {
            var tile = this._getVectorTile(key, true).tile;

            if (tile.state !== 'notLoaded') {
                continue;
            }

            if (bounds && !bounds.intersects(tile.bounds)) {
                continue;
            }

            var loadDef = tile.load();
            loadingDefs.push(loadDef);
        }

        return Deferred.all.apply(null, loadingDefs);
    },

    _updateActiveTilesList: function(newTilesList) {

        if (this._tileFilteringHook) {
            var filteredTilesList = {};
            for (var tk in newTilesList) {
                if (this._tileFilteringHook(this._getVectorTile(tk, true).tile)) {
                    filteredTilesList[tk] = true;
                }
            }
            newTilesList = filteredTilesList;
        }

        var oldTilesList = this._activeTileKeys || {};

        var observersToUpdate = {},
            _this = this,
            key;

        if (this.processingTile) {
            newTilesList[this.processingTile.vectorTileKey] = true;
        }
        if (this._rasterVectorTile) {
			key = this._rasterVectorTile.vectorTileKey;
            newTilesList[key] = true;
			this._tiles[key] = {tile: this._rasterVectorTile};
		}

        var checkSubscription = function(vKey) {
            var observerIds = _this._observerTileLoader.getTileObservers(vKey);
            for (var sid in observerIds) {
                observersToUpdate[sid] = true;
            }
        };

        for (key in newTilesList) {
            if (!oldTilesList[key]) {
                this._observerTileLoader.addTile(this._getVectorTile(key, true).tile);
                checkSubscription(key);
            }
        }

        for (key in oldTilesList) {
            if (!newTilesList[key]) {
                checkSubscription(key);
                this._observerTileLoader.removeTile(key);
            }
        }

        this._activeTileKeys = newTilesList;

        this._triggerObservers(observersToUpdate);
    },

    _propertiesToArray: function(it) {
        var prop = it.properties,
            indexes = this.tileAttributeIndexes,
            arr = [];

        for (var key in indexes)
            arr[indexes[key]] = prop[key];

        arr[arr.length] = it.geometry;
        arr[0] = it.id;
        return arr;
    },

    _clearProcessing: function() {
        if (this.processingTile) {
            var _items = this._items,
                tile = this.processingTile,
                vKey = tile.vectorTileKey,
                data = tile.data || [];
            for (var i = 0, len = data.length; i < len; i++) {
                var id = data[i][0];
                if (_items[id]) {
                    var item = _items[id];
                    item.processing = null;
                    item.currentFilter = null;
                    delete item.options.fromTiles[vKey];
                    delete item.fromServerProps;
                    delete item.geometry;
               }
            }
            tile.clear();
        }
    },

    _chkProcessing: function(processing) {
        var _items = this._items,
            needProcessingFilter = false,
            skip = {},
            id, i, len, it, data;

        if (processing) {
            if (processing.Deleted) {
                for (i = 0, len = processing.Deleted.length; i < len; i++) {
                    id = processing.Deleted[i];
                    skip[id] = true;
                    if (_items[id]) {
                        _items[id].processing = true;
                        _items[id].currentFilter = null;
                    }
                    if (len > 0) { needProcessingFilter = true; }
                }
            }

            var out = {};
            if (processing.Inserted) {
                for (i = 0, len = processing.Inserted.length; i < len; i++) {
                    it = processing.Inserted[i];
                    if (!skip[it[0]]) { out[it[0]] = it; }
                }
            }

            if (processing.Updated) {
                for (i = 0, len = processing.Updated.length; i < len; i++) {
                    it = processing.Updated[i];
                    if (!skip[it[0]]) { out[it[0]] = it; }
                }
                if (!needProcessingFilter && len > 0) { needProcessingFilter = true; }
            }

            data = [];
            for (id in out) {
                if (this._items[id]) {
                    this._items[id].properties = out[id];
                    this._items[id].processing = true;
                    this._items[id].currentFilter = null;
                }
                data.push(out[id]);
            }

            if (data.length > 0) {
                this.processingTile = this.addData(data);
            }
        }
        if (needProcessingFilter) {
            this.addFilter('processingFilter', function(item, tile) {
                return tile.z === 0 || !item.processing;
            });
        } else {
            this.removeFilter('processingFilter');
        }
    },

    enableGeneralization: function() {
        if (!this.options.isGeneralized) {
            this.options.isGeneralized = true;
            this._resetTilesTree();
        }
    },

    disableGeneralization: function() {
        if (this.options.isGeneralized) {
            this.options.isGeneralized = false;
            this._resetTilesTree();
        }
    },

    _resetTilesTree: function() {
        this._tilesTree = null;
		this._reCheckActiveTileKeys();
        // this._needCheckActiveTiles = true;
        // this._getActiveTileKeys(); //force list update
    },

    updateVersion: function(options, tiles) {
		if (!L.gmx.skipLoadTiles) {
			if (options) {
				this.setOptions(options);
			}
			if (tiles) {	// есть списки тайлов по BBOX
				this._needCheckActiveTiles = false;
				var tKey, newTiles = {}, newActiveTileKeys = {};
				for (var i = 0, cnt = 0, len = tiles.length; i < len; i += 6, cnt++) {
					tKey = VectorTile.createTileKey({z: Number(tiles[i]), x: Number(tiles[i + 1]), y: Number(tiles[i + 2]), v: Number(tiles[i + 3]), d: Number(tiles[i + 4]), s: Number(tiles[i + 5])});
					newTiles[tKey] = this._getVectorTile(tKey, true);
					newActiveTileKeys[tKey] = true;
				}
				this._tiles = newTiles;
				if (this.processingTile) {
					this._tiles[this.processingTile.vectorTileKey] = {
						tile: this.processingTile
					};
				}
				this._updateActiveTilesList(newActiveTileKeys);
			} else {
				this._resetTilesTree();
			}
		}
    },

    getNotLoadedVectorTiles: function(options) {
		var count = 0;

        if (options.tiles) {
				// options.tilesOrder = ["Z", "X", "Y", "V", "Level", "Span"]
            var arr = options.tiles || [];

            for (var i = 0, cnt = 0, len = arr.length; i < len; i += 6, cnt++) {
                if (!this._tiles[VectorTile.createTileKey({z: Number(arr[i]), x: Number(arr[i + 1]), y: Number(arr[i + 2]), v: Number(arr[i + 3]), d: Number(arr[i + 4]), s: Number(arr[i + 5])})]) {
					count++;
				}
			}
		}
		return count;
    },

    _getDataKeys: function(data) {
        var chkKeys = {};
        for (var i = 0, len = data.length; i < len; i++) {
            chkKeys[data[i][0]] = true;
        }
        return chkKeys;
    },

    _getProcessingTile: function() {
        if (!this.processingTile) {
        var x = -0.5, y = -0.5, z = 0, v = 0, s = -1, d = -1, isFlatten = this.options.isFlatten;

            this.processingTile = new VectorTile({load: function(x, y, z, v, s, d, callback) {
                            callback({values: []});
            }}, {x: x, y: y, z: z, v: v, s: s, d: d, isFlatten: isFlatten});

            this.addTile(this.processingTile);
        }
        return this.processingTile;
    },

    addData: function(data) {
        if (!data) {
            data = [];
        }
        var vTile = this._getProcessingTile(),
            chkKeys = this._getDataKeys(data),
            dataBounds = vTile.addData(data, chkKeys);

        if (this._itemsBounds) {
            this._itemsBounds.extendBounds(dataBounds);
        }
        this._updateItemsFromTile(vTile);
        this._triggerObservers();
        return vTile;
    },

    removeData: function(data) {
        this._itemsBounds = null;
        var vTile = this.processingTile;
        if (vTile) {
			var chkKeys = (data || vTile.data).reduce(function(a,item) {
				var id = item[0];
				a[id] = true;
				delete this._items[id];
				return a;
			}.bind(this), {});
            this._removeDataFromObservers(chkKeys);
            vTile.removeData(chkKeys, true);
            this._updateItemsFromTile(vTile);

            this._triggerObservers();
        }

        return vTile;
    },

    initTilesTree: function() {
        this._tilesTree = L.gmx.tilesTree(this.options);
        this.options.TemporalTiles = this.options.TemporalVers = null;

        if ('TemporalTiles' in this.optionsLink) {
            this.optionsLink.TemporalVers = this.optionsLink.TemporalTiles = null;
        }
        this.dateZero = this._tilesTree.dateZero;
        if (this.processingTile) {
            this._tiles[this.processingTile.vectorTileKey] = {
                tile: this.processingTile
            };
        }
    },

    _getVectorTile: function(vKey, createFlag) {
        if (!this._tiles[vKey] && createFlag) {
            var info = VectorTile.parseTileKey(vKey);
            info.dateZero = this.dateZero;
            this._addVectorTile(info);
        }
        return this._tiles[vKey];
    },

    _addVectorTile: function(info) {
        info.isFlatten = this.options.isFlatten;
        info.needBbox = this.options.needBbox;
        info.attributes = this.options.attributes;
        var tile = new VectorTile(this._vectorTileDataProvider, info),
            vKey = tile.vectorTileKey;

        this._tiles[vKey] = {tile: tile};
        return vKey;
    },

    _getGeneralizedTileKeys: function(vTilePoint) {
        var dz = vTilePoint.z % 2 ? 1 : 2,
            pz = Math.pow(2, dz),
            z = vTilePoint.z - dz,
            x = Math.floor(vTilePoint.x / pz),
            y = Math.floor(vTilePoint.y / pz),
            temp = {v: vTilePoint.v, s: -1, d: -1, isGeneralized: true},
            keys = {};

        while (z > 1) {
            var gKey = [z, x, y].join('_');
            keys[gKey] = L.extend({}, temp, {x: x, y: y, z: z});
            z -= 2;
            x = Math.floor(x / 4);
            y = Math.floor(y / 4);
        }
        return keys;
    },

    initTilesList: function() {         // For non temporal layers we create all Vector tiles
        var newActiveTileKeys = {};
        if (this.options.tiles) {
            var arr = this.options.tiles || [],
                vers = this.options.tilesVers,
                generalizedKeys = this.options.isGeneralized ? {} : null,
                newTiles = {},
                gKey, tKey, info, tHash;

            for (var i = 0, cnt = 0, len = arr.length; i < len; i += 3, cnt++) {
                info = {
                    x: Number(arr[i]),
                    y: Number(arr[i + 1]),
                    z: Number(arr[i + 2]),
                    v: Number(vers[cnt]),
                    s: -1,
                    d: -1
                };

                tHash = this._getVectorTile(VectorTile.createTileKey(info), true);
                tKey = tHash.tile.vectorTileKey;
                newTiles[tKey] = tHash;
                newActiveTileKeys[tKey] = true;
                if (generalizedKeys) {
                    var gKeys = this._getGeneralizedTileKeys(info);
                    for (gKey in gKeys) {
                        var gPoint = gKeys[gKey];
                        if (generalizedKeys[gKey]) {
                            generalizedKeys[gKey].v = Math.max(gPoint.v, generalizedKeys[gKey].v);
                        } else {
                            generalizedKeys[gKey] = gPoint;
                        }
                    }
                }
            }
            if (generalizedKeys) {
                for (gKey in generalizedKeys) {
                    info = generalizedKeys[gKey];
                    tKey = VectorTile.createTileKey(info);
                    if (!newTiles[tKey]) {
                        if (!this._tiles[tKey]) { this._addVectorTile(info); }
                        newTiles[tKey] = this._tiles[tKey];
                        newActiveTileKeys[tKey] = true;
                    }
                }
            }
            this._tiles = newTiles;
            if (this.processingTile) {
                this._tiles[this.processingTile.vectorTileKey] = {
                    tile: this.processingTile
                };
            }
        }
        this._updateActiveTilesList(newActiveTileKeys);
    },

    //Tile filtering hook filters out active vector tiles.
    //Can be used to prevent loading data from some spatial-temporal region
    setTileFilteringHook: function(filteringHook) {
        this._tileFilteringHook = filteringHook;
		this._reCheckActiveTileKeys();
        // this._needCheckActiveTiles = true;
        // this._getActiveTileKeys(); //force list update
    },

    removeTileFilteringHook: function() {
        this._tileFilteringHook = null;
		this._reCheckActiveTileKeys();
        // this._needCheckActiveTiles = true;
        // this._getActiveTileKeys(); //force list update
    },

    _reCheckActiveTileKeys: function() {
        this._needCheckActiveTiles = true;
        this._getActiveTileKeys(); //force list update
    }

});
L.gmx = L.gmx || {};
L.gmx.DataManager = DataManager;
