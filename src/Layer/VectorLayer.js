L.gmx.VectorLayer = L.TileLayer.extend({
    options: {
		tilesCRS: L.CRS.EPSG3395,
        openPopups: [],
        minZoom: 1,
        zIndexOffset: 0,
        isGeneralized: true,
        isFlatten: false,
        useWebGL: false,
		skipTiles: 'All', // All, NotVisible, None
        iconsUrlReplace: [],
        clickable: true
    },

    initialize: function(options) {
        options = L.setOptions(this, options);

        this._initPromise = new Promise(function(resolve, reject) {
			this._resolve = resolve;
			this._reject = reject;
		}.bind(this));

        this._drawQueue = [];
        this._drawQueueHash = {};

        this._drawInProgress = {};

        this._anyDrawings = false; //are we drawing something?
        this.repaintObservers = {};    // external observers like screen

        // var _this = this;

        this._gmx = {
            hostName: gmxAPIutils.normalizeHostname(options.hostName || 'maps.kosmosnimki.ru'),
            mapName: options.mapID,
			sessionKey: this.options.sessionKey,
			iconsUrlReplace: this.options.iconsUrlReplace,
            skipTiles: options.skipTiles,
            needBbox: options.skipTiles === 'All',
            useWebGL: options.useWebGL,
			srs: options.srs || '',
            layerID: options.layerID,
            beginDate: options.beginDate,
            endDate: options.endDate,
            sortItems: options.sortItems || null,
            styles: options.styles || [],
            tileSubscriptions: {},
            _tilesToLoad: 0,
            shiftXlayer: 0,
            shiftYlayer: 0,
            renderHooks: [],
            preRenderHooks: [],
            _needPopups: {}
        };
        if (options.crossOrigin) {
            this._gmx.crossOrigin = options.crossOrigin;
        }

        // this.on('tileunload', function(e) {
            // this._clearTiles([e.tile.zKey]);
        // }.bind(this));
    },

    // extended from L.TileLayer.Canvas
    _removeTile: function (zKey) {
        var tileLink = this._tiles[zKey];
        if (tileLink) {
            var tile = tileLink.el;
            if (tile && tile.parentNode) {
                tile.parentNode.removeChild(tile);
            }

            delete this._tiles[zKey];
        }
    },

    onAdd: function(map) {
        if (map.options.crs !== L.CRS.EPSG3857 && map.options.crs !== L.CRS.EPSG3395) {
            throw 'GeoMixer-Leaflet: map projection is incompatible with GeoMixer layer';
        }

        var gmx = this._gmx;

		this.options.tilesCRS = gmx.srs == 3857 ? L.CRS.EPSG3857 : L.CRS.EPSG3395;
        gmx.shiftY = 0;
        gmx.applyShift = map.options.crs === L.CRS.EPSG3857 && gmx.srs != 3857;
        gmx.currentZoom = map.getZoom();
// console.log('onAdd', gmx.applyShift, gmx.srs);

        gmx.styleManager.initStyles();

        L.TileLayer.prototype.onAdd.call(this, map);

        map.on('zoomstart', this._zoomStart, this);
        map.on('zoomend', this._zoomEnd, this);
        if (gmx.properties.type === 'Vector') {
            map.on('moveend', this._moveEnd, this);
        }
        if (this.options.clickable === false) {
            this._container.style.pointerEvents = 'none';
        }
        if (gmx.balloonEnable && !this._popup) { this.bindPopup(''); }
        this.on('stylechange', this._onStyleChange, this);
        this.on('versionchange', this._onVersionChange, this);

        // this._zIndexOffsetCheck();
        L.gmx.layersVersion.add(this);
        this.fire('add');
    },

    onRemove: function(map) {
        if (this._container) {
            this._container.parentNode.removeChild(this._container);
        }

        map.off({
            'viewreset': this._reset,
            'moveend': this._update
        }, this);

        if (this._animated) {
            map.off({
                'zoomanim': this._animateZoom,
                'zoomend': this._endZoomAnim
            }, this);
        }

        if (!this.options.updateWhenIdle) {
            map.off('move', this._limitedUpdate, this);
        }
        this._clearTiles();
        var gmx = this._gmx;
		if (gmx.labelsLayer) {	// удалить из labelsLayer
			map._labelsLayer.remove(this);
		}

        this._container = null;
        this._map = null;

        map.off('zoomstart', this._zoomStart, this);
        map.off('zoomend', this._zoomEnd, this);
        this.off('stylechange', this._onStyleChange, this);

        delete gmx.map;
        if (gmx.properties.type === 'Vector') {
            map.off('moveend', this._moveEnd, this);
        }
        if (gmx.dataManager && !gmx.dataManager.getActiveObserversCount()) {
            L.gmx.layersVersion.remove(this);
        }
        this.fire('remove');
    },

    _initContainer: function () {
        L.TileLayer.prototype._initContainer.call(this);
        this._prpZoomData();
        this.setZIndexOffset();
    },

    _updateZIndex: function () {
        if (this._container) {
            var options = this.options,
                zIndex = options.zIndex || 0,
                zIndexOffset = options.zIndexOffset || 0;

            this._container.style.zIndex = zIndexOffset + zIndex;
        }
    },

    _addTile: function (coords) {
        var zoom = this._tileZoom || this._map._zoom,
            gmx = this._gmx;
// console.log('_addTile', zoom, this._tileZoom, this._map._zoom, coords);

        if (!gmx.layerType || !gmx.styleManager.isVisibleAtZoom(zoom)) {
            this._tileLoaded();
            return;
        }
        var myLayer = this,
		    zKey = this._tileCoordsToKey(coords),
			gmxTilePoint = gmxAPIutils.getTileNumFromLeaflet(coords, zoom),
		    // tileElem = this._tiles[zKey];
		    tileElem = this.gmxGetCanvasTile(coords);

        if (!tileElem.promise) {
            gmx._tilesToLoad++;
			tileElem.key = zKey;
			tileElem.promise = new Promise(function(resolve, reject) {
				tileElem.resolve = resolve;
				tileElem.reject = reject;
				var filters = gmx.dataManager.getViewFilters('screen', gmx.layerID);
				var isDrawnFirstTime = false;
                var done = function() {
                    if (!isDrawnFirstTime) {
                        gmx._tilesToLoad--;
                        myLayer._tileLoaded();
                        isDrawnFirstTime = true;
                    }
                };
				tileElem.observer = gmx.dataManager.addObserver({
                    type: 'resend',
                    layerID: gmx.layerID,
                    needBbox: gmx.needBbox,
                    srs: gmx.srs,
                    target: 'screen',
					targetZoom: myLayer.options.isGeneralized ? zoom : null,
					dateInterval: gmx.layerType === 'VectorTemporal' ? [gmx.beginDate, gmx.endDate] : null,
                    active: false,
                    bbox: gmx.styleManager.getStyleBounds(gmxTilePoint),
                    filters: ['clipFilter', 'userFilter_' + gmx.layerID, 'styleFilter', 'userFilter'].concat(filters),
                    callback: function(data) {
                        // myLayer._drawTileAsync(coords, zoom, data).always(done);
                        myLayer._drawTileAsync(tileElem, data).then(done);
                    }
				}, zKey)
					.on('activate', function() {
						//if observer is deactivated before drawing,
						//we can consider corresponding tile as already drawn
						if (!this.isActive()) {
							done();
						}
					})
					// .on('startLoadingTiles', myLayer._chkDrawingState, myLayer)
					.activate();
			});
		}
    },

    _getLoadedTilesPercentage: function (container) {
        if (!container) { return 0; }
        var len = 0, count = 0;
        var arr = ['img', 'canvas'];
        for (var key in arr) {
            var tiles = container.getElementsByTagName(arr[key]);
            if (tiles && tiles.length > 0) {
                len += tiles.length;
                for (var i = 0, len1 = tiles.length; i < len1; i++) {
                    if (tiles[i]._tileComplete) {
                        count++;
                    }
                }
            }
        }
        if (len < 1) { return 0; }
        return count / len;
    },

    _tileLoaded: function () {
        if (this._animated) {
			var cont = this._level ? this._level.el : this._tileContainer;
            L.DomUtil.addClass(cont, 'leaflet-zoom-animated');
        }
        if (this._gmx._tilesToLoad === 0) {
            this.fire('load');
            this.fire('doneDraw');

            if (this._animated) {
                // clear scaled tiles after all new tiles are loaded (for performance)
                // this._setClearBgBuffer(0);
            }
        }
    },

    _tileOnLoad: function (tile) {
        if (tile) { L.DomUtil.addClass(tile, 'leaflet-tile-loaded'); }
        this._tileLoaded();
    },

    _tileOnError: function () {
    },

    tileDrawn: function (tile) {
        this._tileOnLoad(tile);
    },

    // prepare for Leaflet 1.0 - this methods exists in L.GridLayer
    // converts tile coordinates to key for the tile cache
    _tileCoordsToKey: function (coords, zoom) {
        return coords.x + ':' + coords.y + ':' + (coords.z || zoom);
    },


    _pxBoundsToTileRange: function (bounds) {
        var tileSize = this.options.tileSize;
        return new L.Bounds(
            bounds.min.divideBy(tileSize)._floor(),
            bounds.max.divideBy(tileSize)._round());
    },

    // original for L.gmx.VectorLayer

    //public interface
    initFromDescription: function(ph) {
        var gmx = this._gmx;

        gmx.properties = ph.properties;
        gmx.geometry = ph.geometry;

        if (gmx.properties._initDone) {    // need delete tiles key
            delete gmx.properties[gmx.properties.Temporal ? 'TemporalTiles' : 'tiles'];
        }
        gmx.properties._initDone = true;

        if (!gmx.geometry) {
            var worldSize = gmxAPIutils.tileSizes[1];
            gmx.geometry = {
                type: 'POLYGON',
                coordinates: [[[-worldSize, -worldSize], [-worldSize, worldSize], [worldSize, worldSize], [worldSize, -worldSize], [-worldSize, -worldSize]]]
            };
        }

        // Original properties from the server.
        // Descendant classes can override this property
        // Not so good solution, but it works
        gmx.rawProperties = ph.rawProperties || ph.properties;

        this._updateProperties(ph.properties);
        if (gmx.rawProperties.type === 'Vector') {
			ph.properties.srs = gmx.srs = 3857;
			gmx.RasterSRS = Number(gmx.rawProperties.RasterSRS) || 3857;
        } else if (gmx.rawProperties.RasterSRS) {
			ph.properties.srs = gmx.srs = Number(gmx.rawProperties.RasterSRS);
		}

        ph.properties.needBbox = gmx.needBbox;
        ph.properties.isGeneralized = this.options.isGeneralized;
        ph.properties.isFlatten = this.options.isFlatten;

        gmx.dataManager = this.options.dataManager || new DataManager(ph.properties);

        if (this.options.parentOptions) {
			if (!ph.properties.styles) { ph.properties.styles = this.options.parentOptions.styles; }
			gmx.dataManager.on('versionchange', this._onVersionChange, this);
		}

		gmx.styleManager = new StyleManager(gmx);
        this.options.minZoom = gmx.styleManager.minZoom;
        this.options.maxZoom = gmx.styleManager.maxZoom;

        gmx.dataManager.on('observeractivate', function() {
            if (gmx.dataManager.getActiveObserversCount()) {
                L.gmx.layersVersion.add(this);
            } else {
                L.gmx.layersVersion.remove(this);
            }
        }, this);

        if (gmx.properties.type === 'Vector' && !('chkUpdate' in this.options)) {
            this.options.chkUpdate = true; //Check updates for vector layers by default
        }
        if (gmx.rawProperties.type !== 'Raster' && this._objectsReorderInit) {
            this._objectsReorderInit(this);
        }

        if (gmx.clusters) {
            this.bindClusters(JSON.parse(gmx.clusters));
        }
        if (gmx.filter) {
            var func = L.gmx.Parsers.parseSQL(gmx.filter.replace(/[\[\]]/g, '"'));
            if (func) {
				gmx.dataManager.addFilter('userFilter_' + gmx.layerID, function(item) {
					return gmx.layerID !== this._gmx.layerID || !func || func(item.properties, gmx.tileAttributeIndexes, gmx.tileAttributeTypes) ? item.properties : null;
				}.bind(this));
            }
        }
        if (gmx.dateBegin && gmx.dateEnd) {
            this.setDateInterval(gmx.dateBegin, gmx.dateEnd);
        }

        this._resolve();
        return this;
    },

    getDataManager: function () {
		return this._gmx.dataManager;
    },

    enableGeneralization: function () {
        if (!this.options.isGeneralized) {
            this.options.isGeneralized = true;
            if (this._gmx.dataManager) {
                // this._clearAllSubscriptions();
                this._gmx.dataManager.enableGeneralization();
                this.redraw();
            }
        }
    },

    disableGeneralization: function () {
        if (this.options.isGeneralized) {
            this.options.isGeneralized = false;
            if (this._gmx.dataManager) {
                // this._clearAllSubscriptions();
                this._gmx.dataManager.disableGeneralization();
                this.redraw();
            }
        }
    },

    setRasterOpacity: function (opacity) {
        if (this._gmx.rasterOpacity !== opacity) {
            this._gmx.rasterOpacity = opacity;
            this._initPromise.then(this.repaint.bind(this));
        }
        return this;
    },

    getStyles: function () {
        return this._gmx.styleManager.getStyles();
    },

    getIcons: function (callback) {
        this._gmx.styleManager.getIcons(callback);
        return this;
    },

    setStyles: function (styles) {
        this._initPromise.then(function() {
            this._gmx.styleManager.clearStyles();
            if (styles) {
                styles.forEach(function(it, i) {
                    this.setStyle(it, i, true);
                }.bind(this));
            } else {
                this.fire('stylechange');
            }
        }.bind(this));
        return this;
    },

    getStyle: function (num) {
        return this.getStyles()[num];
    },

    setStyle: function (style, num, createFlag) {
        this._initPromise.then(function() {
            this._gmx.styleManager.setStyle(style, num, createFlag).then(function () {
                this.fire('stylechange', {num: num || 0});
            }.bind(this));
        }.bind(this));
        return this;
    },

    setStyleHook: function (func) {
        this._gmx.styleHook = func;
        this.repaint();
        return this;
    },

    removeStyleHook: function () {
        this._gmx.styleHook = null;
        return this;
    },

    setRasterHook: function (func) {
        this._gmx.rasterProcessingHook = func;
        this.repaint();
        return this;
    },

    removeRasterHook: function () {
        this._gmx.rasterProcessingHook = null;
        this.repaint();
        return this;
    },

    setFilter: function (func) {
        var gmx = this._gmx;
        gmx.dataManager.addFilter('userFilter', function(item) {
            return gmx.layerID !== this._gmx.layerID || !func || func(item) ? item.properties : null;
        }.bind(this));
        return this;
    },

    removeFilter: function () {
        this._gmx.dataManager.removeFilter('userFilter');
        return this;
    },

    addLayerFilter: function (func, options) {
        var gmx = this._gmx;

		options = options || {};
		options.layerID = gmx.layerID;

        gmx.dataManager.addLayerFilter(function(item) {
            return !func || func(item) ? item.properties : null;
        }.bind(this), options);

        return this;
    },

    removeLayerFilter: function (options) {
		options = options || {};
		options.layerID = this._gmx.layerID;
        this._gmx.dataManager.removeLayerFilter(options);
        return this;
    },

    setDateInterval: function (beginDate, endDate) {
        var gmx = this._gmx;

        if (gmx.dateBegin && gmx.dateEnd) {
			beginDate = gmx.dateBegin;
			endDate = gmx.dateEnd;
		}

        //check that something changed
        if (!gmx.beginDate !== !beginDate ||
            !gmx.endDate !== !endDate ||
            beginDate && (gmx.beginDate.valueOf() !== beginDate.valueOf()) ||
            endDate && (gmx.endDate.valueOf() !== endDate.valueOf())
        ) {
            if (gmx.rawProperties.maxShownPeriod && beginDate) {
                var msecPeriod = gmx.rawProperties.maxShownPeriod * 24 * 3600 * 1000;
                beginDate = new Date(Math.max(beginDate.valueOf(), endDate.valueOf() - msecPeriod));
            }

            gmx.beginDate = beginDate;
            gmx.endDate = endDate;

            var observer = null,
				dataManager = gmx.dataManager;
            for (var key in this._tiles) {
                observer = dataManager.getObserver(key);
                observer.setDateInterval(beginDate, endDate);
            }
            observer = dataManager.getObserver('_Labels');
            if (observer) {
                observer.setDateInterval(beginDate, endDate);
            }
			if (gmx.skipTiles === 'NotVisible' || gmx.needBbox || gmx.properties.UseTiles === false) {
				if (!gmx.needBbox) {
					gmx.properties.LayerVersion = -1;
					dataManager.setOptions({LayerVersion: -1});
				}
				if (this._map) {
					L.gmx.layersVersion.now();
				}
			}
            this.fire('dateIntervalChanged');
        }

        return this;
    },

    getDateInterval: function() {
        return {
            beginDate: this._gmx.beginDate,
            endDate: this._gmx.endDate
        };
    },

    _clearTiles: function(keys) {
        keys = keys || Object.keys(this._tiles);

		keys.forEach(function(zKey) {
			var it = this._tiles[zKey];
			it.observer.deactivate();
            this.removeObserver(it.observer);
            delete this._tiles[zKey];
		}.bind(this));
        this._gmx._tilesToLoad = 0;
    },

    addObserver: function (options) {
        return this._gmx.dataManager.addObserver(options);
    },

    removeObserver: function(observer) {
        return this._gmx.dataManager.removeObserver(observer.id);
    },

    setPositionOffset: function(dx, dy) {
        var gmx = this._gmx;
        gmx.shiftXlayer = dx;
        gmx.shiftYlayer = dy;
        this._update();
        return this;
    },

    getPositionOffset: function() {
        var gmx = this._gmx;
        return {shiftX: gmx.shiftXlayer, shiftY: gmx.shiftYlayer};
    },

    setZIndexOffset: function (offset) {
        if (arguments.length) {
            this.options.zIndexOffset = offset;
        }
        this._updateZIndex();
        return this;
    },

    repaint: function (zKeys) {
        if (this._map) {
            if (!zKeys) {
                zKeys = {};
                for (var key in this._tiles) { zKeys[key] = true; }
                L.extend(zKeys, this.repaintObservers);
            } else if (L.Util.isArray(zKeys)) {
				var arr = zKeys;
				zKeys = {};
				arr.forEach(function (it) { zKeys[it] = true; } );
            } else if (typeof zKeys === 'string') {
				var it = zKeys;
				zKeys = {};
				zKeys[it] = true;
			}
            this._gmx.dataManager._triggerObservers(zKeys);
        }
    },

    redrawItem: function (id) {
        if (this._map) {
            var item = this._gmx.dataManager.getItem(id),
                gmxTiles = this._getTilesByBounds(item.bounds);

            this.repaint(gmxTiles);
        }
    },

	_createTile: function () {
		var tile = L.DomUtil.create('canvas', 'leaflet-tile');
		tile.width = tile.height = this.options.tileSize;
		tile.onselectstart = tile.onmousemove = L.Util.falseFn;

		return tile;
	},

    gmxGetCanvasTile: function (tilePoint) {
        var zKey = this._tileCoordsToKey(tilePoint);

        if (zKey in this._tiles) {
            return this._tiles[zKey];
        }
        // save tile in cache
        var tile = this._createTile();
        this._tiles[zKey] = {
            el: tile,
            coords: tilePoint,
            current: true
        };

        // tile._zKey = zKey;
        tile._zoom = this._map._zoom;
        tile._tileComplete = true;
        tile._tilePoint = tilePoint;
        this.tileDrawn(tile);
        return this._tiles[zKey];
    },

    appendTileToContainer: function (tileLink) {
        var tilePos = this._getTilePos(tileLink.coords),
			tile = tileLink.el,
			cont = this._level ? this._level.el : this._tileContainer;

		cont.appendChild(tile);
        L.DomUtil.setPosition(tile, tilePos, L.Browser.chrome || L.Browser.android23);
		// tile.style.left = tilePos.x + 'px';
		// tile.style.top = tilePos.y + 'px';
    },

    addData: function(data, options) {
        if (!this._gmx.mapName) {     // client side layer
            this._gmx.dataManager.addData(data, options);
            this.repaint();
        }
        return this;
    },

    removeData: function(data, options) {
        if (!this._gmx.mapName) {     // client side layer
            this._gmx.dataManager.removeData(data, options);
            this.repaint();
        }
        return this;
    },

    getStylesByProperties: function(propArray, zoom) {
        return this._gmx.styleManager.getCurrentFilters(propArray, zoom);
    },

    getItemStyle: function(id) {
        var gmx = this._gmx,
            item = gmx.dataManager.getItem(id);
        return gmx.styleManager.getObjStyle(item);
    },

    getTileAttributeTypes: function() {
        return this._gmx.tileAttributeTypes;
    },

    getTileAttributeIndexes: function() {
        return this._gmx.tileAttributeIndexes;
    },

    getItemBalloon: function(id) {
        var gmx = this._gmx,
            item = gmx.dataManager.getItem(id),
            styles = this.getStyles(),
            out = '';

        if (item && styles[item.currentFilter]) {
            var propsArr = item.properties;
            out = L.gmxUtil.parseBalloonTemplate(styles[item.currentFilter].Balloon, {
                properties: this.getItemProperties(propsArr),
                geometries: [propsArr[propsArr.length - 1]],
                tileAttributeTypes: gmx.tileAttributeTypes,
                unitOptions: this._map ? this._map.options : {}
            });
        }
        return out;
    },

    getItemProperties: function(propArray) {
        var properties = {},
            indexes = this._gmx.tileAttributeIndexes;
        for (var key in indexes) {
            properties[key] = propArray[indexes[key]];
        }
        return properties;
    },

    addPreRenderHook: function(renderHook) {
        this._gmx.preRenderHooks.push(renderHook);
        this.repaint();
    },

    removePreRenderHook: function(hook) {
        var arr = this._gmx.preRenderHooks;
        for (var i = 0, len = arr.length; i < len; i++) {
            if (arr[i] === hook) {
                arr.splice(i, 1);
                this.repaint();
                break;
            }
        }
    },

    addRenderHook: function(renderHook) {
        this._gmx.renderHooks.push(renderHook);
        this.repaint();
    },

    removeRenderHook: function(hook) {
        var arr = this._gmx.renderHooks;
        for (var i = 0, len = arr.length; i < len; i++) {
            if (arr[i] === hook) {
                arr.splice(i, 1);
                this.repaint();
                break;
            }
        }
    },

    //get original properties from the server
    getGmxProperties: function() {
        return this._gmx.rawProperties;
    },

    //returns L.LatLngBounds
    getBounds: function() {
        var gmxBounds = this._gmx.layerID ? gmxAPIutils.geoItemBounds(this._gmx.geometry).bounds : this._gmx.dataManager.getItemsBounds();

        if (gmxBounds) {
			return gmxBounds.toLatLngBounds(this._gmx.srs == 3857);
        } else {
            return new L.LatLngBounds();
        }
    },

    getGeometry: function() {
        if (!this._gmx.latLngGeometry) {
            this._gmx.latLngGeometry = L.gmxUtil.geometryToGeoJSON(this._gmx.geometry, true, this._gmx.srs == 3857);
        }

        return this._gmx.latLngGeometry;
    },

    // internal methods

    _zoomStart: function() {
        this._gmx.zoomstart = true;
		delete this._tileZoom;
    },

    _zoomEnd: function() {
        this._gmx.zoomstart = false;
        this._updateShiftY(this._map);
        // this._zIndexOffsetCheck();
    },

    _moveEnd: function() {
        if ('dataManager' in this._gmx) {
            this._gmx.dataManager.fire('moveend');
        }
    },

    _onStyleChange: function() {
        var gmx = this._gmx;
        if (!gmx.balloonEnable && this._popup) {
            this.unbindPopup();
        } else if (gmx.balloonEnable && !this._popup) {
            this.bindPopup('');
        }
        if (this._map) {
            if (this.options.minZoom !== gmx.styleManager.minZoom || this.options.maxZoom !== gmx.styleManager.maxZoom) {
                this.options.minZoom = gmx.styleManager.minZoom;
                this.options.maxZoom = gmx.styleManager.maxZoom;
                this._map._updateZoomLevels();
            }
            if (gmx.labelsLayer) {
                this._map._labelsLayer.add(this);
            } else if (!gmx.labelsLayer) {
                this._map._labelsLayer.remove(this);
            }
			this.redraw();
        }
    },

    _drawTileAsync: function (tileElem, data) {
        var gmx = this._gmx,
			_this = this;
		return new Promise(function(resolve, reject) {
			gmx.styleManager.promise.then(function () {
				new ScreenVectorTile(_this, tileElem).drawTile(data).then(resolve, reject);
				// new ScreenVectorTile(_this, tileElem.coords, tileElem.coords.z).drawTile(data).then(resolve, reject);
				// var screenTile = new ScreenVectorTile(_this, tileElem.coords, tileElem.coords.z);
					// var screenTileDrawPromise = screenTile.drawTile(data);
					// screenTileDrawPromise.then(resolve, reject);
				// }
			});
		});
	},

    _prpZoomData: function() {
        this._updateShiftY(this._map);
        // this.repaint();
    },

    // _setClearBgBuffer: function (zd) {
        // if (this._clearBgBufferTimer) { clearTimeout(this._clearBgBufferTimer); }
        // var _this = this;
        // this._clearBgBufferTimer = setTimeout(function () {
            // if (_this._bgBuffer) {
                // _this._clearBgBuffer();
            // }
        // }, zd || 0);
    // },

    _getNeedPopups: function () {
        var out = {},
            openPopups = this.options.openPopups;
        for (var i = 0, len = openPopups.length; i < len; i++) {
            out[openPopups[i]] = false;
        }
        return out;
    },

	_getWrapTileNum: function () {
		var crs = this._map.options.crs,
		    scale = crs.scale(this._map.getZoom()),
		    size = L.point([scale, scale]),
			tileSize = this.getTileSize ? this.getTileSize().x : this._getTileSize();

		return size.divideBy(tileSize)._floor();
	},

    _update: function () {
		/*
        if (!this._map ||
            this.isExternalVisible && this.isExternalVisible(this._map._zoom) // External layer enabled on this.zoom
            ) {
            this._clearAllSubscriptions();
            return;
        }
		*/
        this._gmx.styleManager.promise.then(this.__update.bind(this));
    },

    __update: function () {
        var map = this._map;
        if (!map) { return; }
        var zoom = this._tileZoom || map.getZoom(),
            center = map.getCenter();

        // if (this._gmx.applyShift) {
            this._updateShiftY();
        // }
        this._tileZoom = zoom;
        if (this.options.openPopups.length) {
            this._gmx._needPopups = this._getNeedPopups();
            this.options.openPopups = [];
        }

        var pixelBounds = this._getTiledPixelBounds(center),
            tileRange = this._pxBoundsToTileRange(pixelBounds),
		    margin = this.options.keepBuffer || 2,
		    noPruneRange = new L.Bounds(tileRange.getBottomLeft().subtract([margin, -margin]),
		                              tileRange.getTopRight().add([margin, -margin])),
            limit = this._getWrapTileNum();

        if (tileRange.min.y < 0) { tileRange.min.y = 0; }
        if (tileRange.max.y >= limit.y) { tileRange.max.y = limit.y - 1; }

        // this._chkTileSubscriptions(zoom, tileRange);
		for (var key in this._tiles) {
			var tileLink = this._tiles[key],
				c = tileLink.coords;
			if (c.z !== this._tileZoom || !noPruneRange.contains(new L.Point(c.x, c.y))) {
				tileLink.current = false;
				if (tileLink.observer) {
					tileLink.observer.deactivate();
					this.removeObserver(tileLink.observer);
				}
			}
			L.DomUtil.setPosition(tileLink.el, this._getTilePos(c), L.Browser.chrome || L.Browser.android23);
		}

        if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
            // this._setClearBgBuffer(500);
            return;
        }

        // create a queue of coordinates to load tiles from
        for (var j = tileRange.min.y, lenj = tileRange.max.y; j <= lenj; j++) {
            for (var i = tileRange.min.x, leni = tileRange.max.x; i <= leni; i++) {
                var coords = new L.Point(i, j);
                coords.z = this._tileZoom;
                var zKey = this._tileCoordsToKey(coords);

//console.log('_addTile', zKey, this._tiles[zKey]);
                if (!this._tiles[zKey]) {
                    this._addTile(coords);
                    // this._addTile(zKey, coords);
                }
            }
        }
		//if (!map.gmxMouseDown) { L.gmx.layersVersion.now(); }
    },
    _getTilesByBounds: function (bounds) {    // Получить список gmxTiles по bounds
        var gmx = this._gmx,
            zoom = this._map._zoom,
            shiftX = gmx.shiftX || 0,   // Сдвиг слоя
            shiftY = gmx.shiftY || 0,   // Сдвиг слоя + OSM
			latLngBounds = bounds.toLatLngBounds(gmx.srs == 3857),
            minLatLng = latLngBounds.getSouthWest(),
            maxLatLng = latLngBounds.getNorthEast(),
            screenBounds = this._map.getBounds(),
            sw = screenBounds.getSouthWest(),
            ne = screenBounds.getNorthEast(),
            dx = 0;

        if (ne.lng - sw.lng < 360) {
            if (maxLatLng.lng < sw.lng) {
                dx = 360 * (1 + Math.floor((sw.lng - maxLatLng.lng) / 360));
            } else if (minLatLng.lng > ne.lng) {
                dx = 360 * Math.floor((ne.lng - minLatLng.lng) / 360);
            }
        }
        minLatLng.lng += dx;
        maxLatLng.lng += dx;

        var pixelBounds = this._map.getPixelBounds(),
            minPoint = this._map.project(minLatLng),
            maxPoint = this._map.project(maxLatLng);

        var minY, maxY, minX, maxX;
        if (pixelBounds) {
            minY = Math.floor((Math.max(maxPoint.y, pixelBounds.min.y) + shiftY) / 256);
            maxY = Math.floor((Math.min(minPoint.y, pixelBounds.max.y) + shiftY) / 256);
            minX = minLatLng.lng <= -180 ? pixelBounds.min.x : Math.max(minPoint.x, pixelBounds.min.x);
            minX = Math.floor((minX + shiftX) / 256);
            maxX = maxLatLng.lng >= 180 ? pixelBounds.max.x : Math.min(maxPoint.x, pixelBounds.max.x);
            maxX = Math.floor((maxX + shiftX) / 256);
        } else {
            minY = Math.floor((maxPoint.y + shiftY) / 256);
            maxY = Math.floor((minPoint.y + shiftY) / 256);
            minX = Math.floor((minPoint.x + shiftX) / 256);
            maxX = Math.floor((maxPoint.x + shiftX) / 256);
        }
        var gmxTiles = {};
        for (var x = minX; x <= maxX; x++) {
            for (var y = minY; y <= maxY; y++) {
                var zKey = this._tileCoordsToKey({x: x, y: y}, zoom);
                gmxTiles[zKey] = true;
            }
        }
        return gmxTiles;
    },

    _updateProperties: function (prop) {
        var gmx = this._gmx;
            // apikeyRequestHost = this.options.apikeyRequestHost || gmx.hostName;

        //gmx.sessionKey = prop.sessionKey = this.options.sessionKey || gmxSessionManager.getSessionKey(apikeyRequestHost); //should be already received

        if (this.options.parentOptions) {
			prop = this.options.parentOptions;
		}

        gmx.identityField = prop.identityField; // ogc_fid
        gmx.GeometryType = (prop.GeometryType || '').toLowerCase();   // тип геометрий обьектов в слое
        gmx.minZoomRasters = prop.RCMinZoomForRasters || 1;// мин. zoom для растров
        gmx.minZoomQuicklooks = gmx.minZoomRasters; // по умолчанию minZoom для квиклуков и КР равны

        var type = prop.type || 'Vector';
        if (prop.Temporal) { type += 'Temporal'; }
        gmx.layerType = type;   // VectorTemporal Vector
        gmx.items = {};

        L.extend(gmx, L.gmxUtil.getTileAttributes(prop));
        if (gmx.dataManager) {
            gmx.dataManager.setOptions(prop);
        }
        if ('ZIndexField' in prop) {
            if (prop.ZIndexField in gmx.tileAttributeIndexes) {
                gmx.zIndexField = gmx.tileAttributeIndexes[prop.ZIndexField];   // sort field index
            }
        }
        if (this._objectsReorder) {
            this._objectsReorder.initialize();
        }

        // if ('clusters' in prop) {
            // gmx.clusters = prop.clusters;
        // }

        gmx.filter = prop.filter; 	// for dataSource attr
        gmx.dateBegin = prop.dateBegin;
        gmx.dateEnd = prop.dateEnd;
        gmx.dataSource = prop.dataSource;
        if ('MetaProperties' in gmx.rawProperties) {
            var meta = gmx.rawProperties.MetaProperties;
            if ('srs' in meta) {  		// проекция слоя
                gmx.srs = meta.srs.Value || '';
            }
            if ('parentLayer' in meta) {  // фильтр слоя		// todo удалить после изменений вов вьювере
                gmx.dataSource = meta.parentLayer.Value || '';
            }
            if ('filter' in meta) {  // фильтр слоя
                gmx.filter = meta.filter.Value || '';
            }
            if ('dateBegin' in meta) {  // фильтр для мультивременного слоя
                gmx.dateBegin = L.gmxUtil.getDateFromStr(meta.dateBegin.Value || '01.01.1980');
            }
            if ('dateEnd' in meta) {  // фильтр для мультивременного слоя
                gmx.dateEnd = L.gmxUtil.getDateFromStr(meta.dateEnd.Value || '01.01.1980');
            }
            if ('shiftX' in meta || 'shiftY' in meta) {  // сдвиг всего слоя
                gmx.shiftXlayer = meta.shiftX ? Number(meta.shiftX.Value) : 0;
                gmx.shiftYlayer = meta.shiftY ? Number(meta.shiftY.Value) : 0;
            }
            if ('shiftXfield' in meta || 'shiftYfield' in meta) {    // поля сдвига растров объектов слоя
                if (meta.shiftXfield) { gmx.shiftXfield = meta.shiftXfield.Value; }
                if (meta.shiftYfield) { gmx.shiftYfield = meta.shiftYfield.Value; }
            }
            if ('quicklookPlatform' in meta) {    // тип спутника
                gmx.quicklookPlatform = meta.quicklookPlatform.Value;
                if (gmx.quicklookPlatform === 'image') { delete gmx.quicklookPlatform; }
            }
            if ('quicklookX1' in meta) { gmx.quicklookX1 = meta.quicklookX1.Value; }
            if ('quicklookY1' in meta) { gmx.quicklookY1 = meta.quicklookY1.Value; }
            if ('quicklookX2' in meta) { gmx.quicklookX2 = meta.quicklookX2.Value; }
            if ('quicklookY2' in meta) { gmx.quicklookY2 = meta.quicklookY2.Value; }
            if ('quicklookX3' in meta) { gmx.quicklookX3 = meta.quicklookX3.Value; }
            if ('quicklookY3' in meta) { gmx.quicklookY3 = meta.quicklookY3.Value; }
            if ('quicklookX4' in meta) { gmx.quicklookX4 = meta.quicklookX4.Value; }
            if ('quicklookY4' in meta) { gmx.quicklookY4 = meta.quicklookY4.Value; }

            if ('multiFilters' in meta) {    // проверка всех фильтров для обьектов слоя
                gmx.multiFilters = meta.multiFilters.Value === '1' ? true : false;
            }
            if ('isGeneralized' in meta) {    // Set generalization
                this.options.isGeneralized = meta.isGeneralized.Value !== 'false';
            }
            if ('isFlatten' in meta) {        // Set flatten geometry
                this.options.isFlatten = meta.isFlatten.Value !== 'false';
            }
        }
        if (prop.Temporal) {    // Clear generalization flag for Temporal layers
            this.options.isGeneralized = false;
        }

        if (prop.IsRasterCatalog) {
            gmx.IsRasterCatalog = prop.IsRasterCatalog;
            var layerLink = gmx.tileAttributeIndexes.GMX_RasterCatalogID;
            if (layerLink) {
                gmx.rasterBGfunc = function(x, y, z, item, srs) {
                    var properties = item.properties,
						url = L.gmxUtil.protocol + '//' + gmx.hostName
							+ '/TileSender.ashx?ModeKey=tile&ftc=osm'
							+ '&x=' + x
							+ '&y=' + y
							+ '&z=' + z;
					if (srs || gmx.srs) { url += '&srs=' + (srs || gmx.srs); }
					if (gmx.crossOrigin) { url += '&cross=' + gmx.crossOrigin; }
					url += '&LayerName=' + properties[layerLink];
					if (gmx.sessionKey) { url += '&key=' + encodeURIComponent(gmx.sessionKey); }
                    return url;
                };
            }
        }
        if (prop.Quicklook) {
            var quicklookParams;

            //раньше это была просто строка с шаблоном квиклука, а теперь стало JSON'ом
            if (prop.Quicklook[0] === '{') {
                quicklookParams = JSON.parse(prop.Quicklook);
            } else {
                quicklookParams = {
                    minZoom: gmx.minZoomRasters,
                    template: prop.Quicklook
                };
            }

            if ('X1' in quicklookParams) { gmx.quicklookX1 = quicklookParams.X1; }
            if ('Y1' in quicklookParams) { gmx.quicklookY1 = quicklookParams.Y1; }
            if ('X2' in quicklookParams) { gmx.quicklookX2 = quicklookParams.X2; }
            if ('Y2' in quicklookParams) { gmx.quicklookY2 = quicklookParams.Y2; }
            if ('X3' in quicklookParams) { gmx.quicklookX3 = quicklookParams.X3; }
            if ('Y3' in quicklookParams) { gmx.quicklookY3 = quicklookParams.Y3; }
            if ('X4' in quicklookParams) { gmx.quicklookX4 = quicklookParams.X4; }
            if ('Y4' in quicklookParams) { gmx.quicklookY4 = quicklookParams.Y4; }

            var template = gmx.Quicklook = quicklookParams.template;
            if ('minZoom' in quicklookParams) { gmx.minZoomQuicklooks = quicklookParams.minZoom; }
            gmx.quicklookBGfunc = function(item) {
                var url = template,
                    reg = /\[([^\]]+)\]/,
                    matches = reg.exec(url);
                while (matches && matches.length > 1) {
                    url = url.replace(matches[0], item.properties[gmx.tileAttributeIndexes[matches[1]]]);
                    matches = reg.exec(url);
                }
				if (gmx.srs) { url += (url.indexOf('?') === -1 ? '?' : '&') + 'srs=' + gmx.srs; }
                return url;
            };
            gmx.imageQuicklookProcessingHook = L.gmx.gmxImageTransform;
        }
        this.options.attribution = prop.Copyright || '';
    },

    _onVersionChange: function () {
        this._updateProperties(this._gmx.rawProperties);
    },

    // getViewRasters: function() {
        // var gmx = this._gmx,
			// hash = {},
			// out = [];

        // for (var zKey in gmx.tileSubscriptions) {
            // var subscription = gmx.tileSubscriptions[zKey],
				// screenTile = subscription.screenTile;
            // if (screenTile) {
                // screenTile.itemsView.forEach(function(it) {
					// hash[it.id] = true;
				// });
            // }
        // }
        // for (var id in hash) {
			// out.push(id);
		// }

        // return out;
    // },

    getPropItem: function (key, propArr) {
        return gmxAPIutils.getPropItem(key, propArr, this._gmx.tileAttributeIndexes);
    },
	_getTiledPixelBounds: function (center) {
		var pixelBounds = L.TileLayer.prototype._getTiledPixelBounds.call(this, center);
        if (this._gmx.applyShift) {
			pixelBounds.min.y += this._gmx.deltaY;
			pixelBounds.max.y += this._gmx.deltaY;
		}
		return pixelBounds;
	},

	_getTilePos: function (coords) {
		var tilePos = L.TileLayer.prototype._getTilePos.call(this, coords);
        if (this._gmx.applyShift) {
			tilePos.y -= this._gmx.deltaY;
		}
// console.log('_getTilePos', coords, this._shiftY, this._level.origin);
		return tilePos;
	},
    _updateShiftY: function() {
        var gmx = this._gmx;
		gmx.currentZoom = this._tileZoom;
		gmx.tileSize = gmxAPIutils.tileSizes[gmx.currentZoom];
		gmx.mInPixel = 256 / gmx.tileSize;
		gmx.rastersDeltaY = gmx.RasterSRS === 3857 ? 0 : this._getShiftY(gmx.currentZoom, L.CRS.EPSG3395);
        if (gmx.applyShift && this._map) {
			gmx.deltaY = this._getShiftY(gmx.currentZoom);
			gmx.shiftX = Math.floor(gmx.mInPixel * (gmx.shiftXlayer || 0));
			gmx.shiftY = Math.floor(gmx.deltaY + gmx.mInPixel * (gmx.shiftYlayer || 0));
			gmx.shiftPoint = new L.Point(gmx.shiftX, -gmx.shiftY);     // Сдвиг слоя
        }
    },

	_getShiftY: function(zoom, crs) {		// Layer shift
		var map = this._map,
			pos = map.getCenter(),
			shift = (map.options.crs.project(pos).y - (crs || this.options.tilesCRS).project(pos).y);

		return Math.floor(L.CRS.scale(zoom) * shift / 40075016.685578496);
	}
});
L.Map.addInitHook(function () {
    if (L.Mixin.ContextMenu) {
		L.gmx.VectorLayer.include(L.Mixin.ContextMenu);
	}
});
