L.gmx.VectorLayer = L.GridLayer.extend({
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
        showScreenTiles: false,
		updateWhenZooming: false,
		// bubblingMouseEvents: false,
        clickable: true
    },

	// extended from L.GridLayer
    initialize: function(options) {
        options = L.setOptions(this, options);

        this._initPromise = new Promise(function(resolve, reject) {
			this._resolve = resolve;
			this._reject = reject;
		}.bind(this));

        this.repaintObservers = {};    // external observers like screen

        this._gmx = {
            hostName: gmxAPIutils.normalizeHostname(options.hostName || 'maps.kosmosnimki.ru'),
            mapName: options.mapID,
			sessionKey: this.options.sessionKey,
			iconsUrlReplace: this.options.iconsUrlReplace,
			showScreenTiles: this.options.showScreenTiles,
            skipTiles: options.skipTiles,
            needBbox: options.skipTiles === 'All',
            useWebGL: options.useWebGL,
			srs: options.srs || '',
            layerID: options.layerID,
            beginDate: options.beginDate,
            endDate: options.endDate,
            sortItems: options.sortItems || null,
            styles: options.styles || [],
            rastersCache: {},
            shiftXlayer: 0,
            shiftYlayer: 0,
            renderHooks: [],
            preRenderHooks: [],
            _needPopups: {}
        };
        if (options.crossOrigin) {
            this._gmx.crossOrigin = options.crossOrigin;
        }

        this
			.on('load', function() {						// завершена загрузка тайлов (все тайлы имеют признак - loaded)
// console.log('load ', this._loading, this._tileZoom);
				// if (!this._loading) {
					// for (var z in this._levels) {
						// if (z != this._tileZoom) {
							// L.DomUtil.remove(this._levels[z].el);
							// this._removeTilesAtZoom(z);
							// this._onRemoveLevel(z);
							// delete this._levels[z];
						// }
					// }
				// }
			}, this)
			.on('dateIntervalChanged', function() {
// console.log('dateIntervalChanged ', this._loading, this._tileZoom, ev);
				setTimeout(L.bind(this._repaintNotLoaded, this), 25);
			}, this)
			// .on('loading', function(ev) {						// начата загрузка тайлов (если нет не отрисованных тайлов)
			// }, this)
			// .on('tileload', function(ev) {
// console.log('tileload ', this._loading, this._noTilesToLoad(), this._tileZoom);

			// }, this) 		// тайл (ev.coords) загружен
			// .on('tileerror', function(ev) {}, this) 		// тайл (ev.coords) с ошибкой
			// .on('tileunload', function(ev) {				// тайл (ev.coords) удален
				// if (this._gmx.dataManager) {
					// this._gmx.dataManager.removeObserver(this._tileCoordsToKey(ev.coords));
				// }
			// }, this)
			.on('tileloadstart', function(ev) {				// тайл (ev.coords) загружается
				var key = this._tileCoordsToKey(ev.coords),
					tLink = this._tiles[key];
				// console.log('tileloadstart ', this._loading, this._tileZoom, ev);

				tLink.loaded = 0;
				tLink.screenTile = new ScreenVectorTile(this, tLink);
				L.Util.requestAnimFrame(L.bind(this.__drawTile, this, ev));
			}, this);
	},

	_updateOpacity: function () {
		if (!this._map) { return; }

		// IE doesn't inherit filter opacity properly, so we're forced to set it on tiles
		if (L.Browser.ielt9) { return; }

		L.DomUtil.setOpacity(this._container, this.options.opacity);
		var now = +new Date(),
		    nextFrame = false,
		    willPrune = false;

		for (var key in this._tiles) {
			var tile = this._tiles[key];
			if (!tile.current || !tile.loaded) { continue; }

			var fade = Math.min(1, (now - tile.loaded) / 200);
fade = 1;
			L.DomUtil.setOpacity(tile.el, fade);
			if (fade < 1) {
				nextFrame = true;
			} else {
				if (tile.active) {
					willPrune = true;
				} else {
					this._onOpaqueTile(tile);
				}
				tile.active = true;
			}
		}

		if (willPrune && !this._noPrune) { this._pruneTiles(); }

		if (nextFrame) {
			 L.Util.cancelAnimFrame(this._fadeFrame);
			this._fadeFrame =  L.Util.requestAnimFrame(this._updateOpacity, this);
		}
	},

	_tileReady: function (coords, err, tile) {
		if (!this._map) { return; }

		if (err) {
			// @event tileerror: TileErrorEvent
			// Fired when there is an error loading a tile.
			this.fire('tileerror', {
				error: err,
				tile: tile,
				coords: coords
			});
		}

		var key = this._tileCoordsToKey(coords);

		tile = this._tiles[key];
		if (!tile) { return; }

		tile.loaded = +new Date();
		if (this._map._fadeAnimated) {
			L.DomUtil.setOpacity(tile.el, 1);
			L.Util.cancelAnimFrame(this._fadeFrame);
			this._fadeFrame = L.Util.requestAnimFrame(this._updateOpacity, this);
		} else {
			tile.active = true;
			// this._pruneTiles();
		}

		if (!err) {
			L.DomUtil.addClass(tile.el, 'leaflet-tile-loaded');

			// @event tileload: TileEvent
			// Fired when a tile loads.
			this.fire('tileload', {
				tile: tile.el,
				coords: coords
			});
		}

		if (this._noTilesToLoad()) {
			this._loading = false;
			// @event load: Event
			// Fired when the grid layer loaded all visible tiles.
			this.fire('load');

			if (L.Browser.ielt9 || !this._map._fadeAnimated) {
				L.Util.requestAnimFrame(this._pruneTiles, this);
			} else {
				// Wait a bit more than 0.2 secs (the duration of the tile fade-in)
				// to trigger a pruning.
				setTimeout(L.bind(this._pruneTiles, this), 250);
			}
		}
	},
/*
	_setView: function (center, zoom, noPrune, noUpdate) {
		var tileZoom = this._clampZoom(Math.round(zoom));
		if ((this.options.maxZoom !== undefined && tileZoom > this.options.maxZoom) ||
		    (this.options.minZoom !== undefined && tileZoom < this.options.minZoom)) {
			tileZoom = undefined;
		}
 console.log('_setView ', zoom, tileZoom, this._loading, this._noTilesToLoad(), this._tileZoom, this._map._zoom, this._map.getZoom());

		var tileZoomChanged = this.options.updateWhenZooming && (tileZoom !== this._tileZoom);

		if (!noUpdate || tileZoomChanged) {

			this._tileZoom = tileZoom;

			if (this._abortLoading) {
				this._abortLoading();
			}

			this._updateLevels();
			this._resetGrid();

			if (tileZoom !== undefined) {
				this._update(center);
			}

			if (!noPrune) {
				this._pruneTiles();
			}

			// Flag to prevent _updateOpacity from pruning tiles during
			// a zoom anim or a pinch gesture
			this._noPrune = !!noPrune;
		}

		this._setZoomTransforms(center, zoom);
	},

	_updateLevels: function () {

		var zoom = this._tileZoom,
		    maxZoom = this.options.maxZoom;

		if (zoom === undefined) { return undefined; }
		// if (zoom === undefined || this._loading) { return undefined; }
 console.log('_updateLevels ', this._loading, this._noTilesToLoad(), this._tileZoom, this._map._zoom, this._map.getZoom());

		for (var z in this._levels) {
			if (this._levels[z].el.children.length || z === zoom) {
				this._levels[z].el.style.zIndex = maxZoom - Math.abs(zoom - z);
				this._onUpdateLevel(z);
			} else {
				L.DomUtil.remove(this._levels[z].el);
				this._removeTilesAtZoom(z);
				this._onRemoveLevel(z);
				delete this._levels[z];
			}
		}

		var level = this._levels[zoom],
		    map = this._map;

		if (!level) {
			level = this._levels[zoom] = {};

			level.el = L.DomUtil.create('div', 'leaflet-tile-container leaflet-zoom-animated', this._container);
			level.el.style.zIndex = maxZoom;

			level.origin = map.project(map.unproject(map.getPixelOrigin()), zoom).round();
			level.zoom = zoom;

			this._setZoomTransform(level, map.getCenter(), map.getZoom());

			// force the browser to consider the newly added element for transition
			L.Util.falseFn(level.el.offsetWidth);

			this._onCreateLevel(level);
		}

		this._level = level;

		return level;
	},

	_pruneTiles: function () {
		if (!this._map) {
		// if (!this._map || this._loading) {
			return;
		}
 console.log('_pruneTiles ', this._loading, this._noTilesToLoad(), this._tileZoom, this._map._zoom, this._map.getZoom());

		var key, tile;

		var zoom = this._map.getZoom();
		if (zoom > this.options.maxZoom ||
			zoom < this.options.minZoom) {
			this._removeAllTiles();
			return;
		}

		for (key in this._tiles) {
			tile = this._tiles[key];
			tile.retain = tile.current;
		}

		for (key in this._tiles) {
			tile = this._tiles[key];
			if (tile.current && !tile.active) {
				var coords = tile.coords;
				if (!this._retainParent(coords.x, coords.y, coords.z, coords.z - 5)) {
					this._retainChildren(coords.x, coords.y, coords.z, coords.z + 2);
				}
			}
		}

		for (key in this._tiles) {
			if (!this._tiles[key].retain) {
				this._removeTile(key);
			}
		}
	},
*/
    _zoomStart: function() {
        this._gmx.zoomstart = true;
	},

    _zoomEnd: function() {
        this._gmx.zoomstart = false;
/*
// console.log('_zoomEnd ', this._loading, this._noTilesToLoad(), this._tileZoom, this._map._zoom, this._map.getZoom());
		if (!this._noTilesToLoad()) {
			setTimeout(L.bind(this._repaintNotLoaded, this), 25);

			//L.Util.requestAnimFrame(L.bind(this._repaintNotLoaded, this));
		}
*/
    },

    _moveEnd: function() {
        if ('dataManager' in this._gmx) {
            this._gmx.dataManager.fire('moveend');
        }
		L.Util.requestAnimFrame(L.bind(this._repaintNotLoaded, this));
    },

	_allLoaded: function () {
		// this._updateLevels();
		// this._pruneTiles();
    },

	_repaintNotLoaded: function () {
		if (!this._map) { return; }

		var arr = [], key, tile;
		for (key in this._tiles) {
			tile = this._tiles[key];
			if (!tile.loaded && tile.coords.z == this._tileZoom) {
// console.log('_repaintNotLoaded ', key, this._loading, this._tileZoom, this._map._zoom, this._map.getZoom());
				arr.push(key);
				// this.repaint(key);
				// L.Util.requestAnimFrame(L.bind(this._repaintNotLoaded, this));
				break;
			}
		}
		if (arr.length) {
			this.repaint(arr);
			L.Util.requestAnimFrame(L.bind(this._repaintNotLoaded, this));
		} else {
			this._gmx.rastersCache = {};
			setTimeout(L.bind(this._allLoaded, this), 250);
		}
		//this._pruneTiles();
		// this._updateOpacity();

    },
	// stops loading all tiles in the background layer
	// _abortLoading: function () {
// console.log('_abortLoading ', this._loading, this._tileZoom, this._map._zoom, this._map.getZoom());
		// var i, tile;
		// for (i in this._tiles) {
			// if (this._tiles[i].coords.z !== this._tileZoom) {
				// tile = this._tiles[i];
				// delete this._tiles[i];
			// }
		// }
	// },
    _onCreateLevel: function(level) {
		this._updateShiftY(level.zoom);
//console.log('_onCreateLevel ', level);
    },

    onAdd: function(map) {
		map = map || this._map;
        if (map.options.crs !== L.CRS.EPSG3857 && map.options.crs !== L.CRS.EPSG3395) {
            throw 'GeoMixer-Leaflet: map projection is incompatible with GeoMixer layer';
        }

        var gmx = this._gmx;

		this.options.tilesCRS = gmx.srs == 3857 ? L.CRS.EPSG3857 : L.CRS.EPSG3395;
        gmx.shiftY = 0;
        gmx.applyShift = map.options.crs === L.CRS.EPSG3857 && gmx.srs != 3857;
        gmx.currentZoom = map.getZoom();
		this._levels = {}; // need init before styles promise resolved
		this._tiles = {};

		gmx.styleManager.promise.then(function () {
			if (!this._heatmap && !this._clusters) {
				L.GridLayer.prototype.onAdd.call(this);
			}

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
			// this.redraw();
// console.log('sdsd', gmx.currentZoom, map.getZoom());
			// L.gmx.layersVersion.now();
		}.bind(this));
        gmx.styleManager.initStyles();
    },

    onRemove: function(map) {
        if (this._container && this._container.parentNode) {
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

	beforeAdd: function(map) {
		this._updateShiftY(map.getZoom());
        L.GridLayer.prototype.beforeAdd.call(this, map);
		this._map = map;
    },

    _updateZIndex: function () {
        if (this._container) {
            var options = this.options,
                zIndex = options.zIndex || 0,
                zIndexOffset = options.zIndexOffset || 0;

            this._container.style.zIndex = zIndexOffset + zIndex;
        }
    },

/*eslint-disable no-unused-vars */
	createTile: function(coords , done) {
		this._test = [coords, done];
		var tile = L.DomUtil.create('canvas', 'leaflet-tile');
		var size = this.getTileSize();
		tile.width = size.x;
		tile.height = size.y;
		tile.style.opacity = this.options.opacity;
		return tile;
    },
/*eslint-enable */

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
        // } else if (gmx.rawProperties.RasterSRS) {
			// ph.properties.srs = gmx.srs = Number(gmx.rawProperties.RasterSRS);
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
/*eslint-disable no-useless-escape */
            var func = L.gmx.Parsers.parseSQL(gmx.filter.replace(/[\[\]]/g, '"'));
/*eslint-enable */
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
				this._tiles[key].loaded = 0;
				observer = this._tiles[key].observer;
				if (observer) {
					observer.setDateInterval(beginDate, endDate);
				}
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

    _clearLoaded: function (zKey) {
		if (this._tiles[zKey]) {
			this._tiles[zKey].loaded = 0;
		}
    },

    repaint: function (zKeys) {
        if (this._map) {
            if (!zKeys) {
                zKeys = {};
                for (var key in this._tiles) { zKeys[key] = true; this._clearLoaded(key); }
                L.extend(zKeys, this.repaintObservers);
            } else if (L.Util.isArray(zKeys)) {
				var arr = zKeys;
				zKeys = {};
				arr.forEach(function (it) { zKeys[it] = true; this._clearLoaded(it); }.bind(this) );
            } else if (typeof zKeys === 'string') {
				var it = zKeys;
				this._clearLoaded(it);
				zKeys = {};
				zKeys[it] = true;
			}
            this._gmx.dataManager._triggerObservers(zKeys);
			// L.Util.requestAnimFrame(L.bind(this._repaintNotLoaded, this));
        }
    },

    redrawItem: function (id) {
        if (this._map) {
            var item = this._gmx.dataManager.getItem(id),
                gmxTiles = this._getTilesByBounds(item.bounds);

            this.repaint(gmxTiles);
        }
    },

    gmxGetCanvasTile: function (tilePoint) {
        var zKey = this._tileCoordsToKey(tilePoint);
        return this._tiles[zKey];
    },

    appendTileToContainer: function (tileLink) {
		if (this._tileZoom === tileLink.coords.z) {
			var tilePos = this._getTilePos(tileLink.coords),
				tile = tileLink.el,
				cont = this._level ? this._level.el : this._tileContainer;

			cont.appendChild(tile);
			L.DomUtil.setPosition(tile, tilePos, L.Browser.chrome || L.Browser.android23);
		}
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

    getPropItem: function (key, propArr) {
        return gmxAPIutils.getPropItem(key, propArr, this._gmx.tileAttributeIndexes);
    },

	// internal

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

    _getTilesByBounds: function (bounds) {    // Получить список gmxTiles по bounds
        var gmx = this._gmx,
            zoom = this._tileZoom || this._map._zoom,
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
                var zKey = this._tileCoordsToKey({x: x, y: y, z:zoom});
                gmxTiles[zKey] = true;
            }
        }
        return gmxTiles;
    },

    _updateProperties: function (prop) {
        var gmx = this._gmx;
            // apikeyRequestHost = this.options.apikeyRequestHost || gmx.hostName;

        // gmx.sessionKey = prop.sessionKey = this.options.sessionKey || gmxSessionManager.getSessionKey(apikeyRequestHost); //should be already received
        gmx.sessionKey = prop.sessionKey = this.options.sessionKey || ''; //should be already received

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
					if (L.gmx._sw && item.v) { url += '&sw=' + L.gmx._sw + '&v=' + item.v; }
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

    _updateShiftY: function(zoom) {
        var gmx = this._gmx;
		gmx.currentZoom = zoom;
// console.log('_updateShiftY ', gmx.currentZoom);

		gmx.tileSize = gmxAPIutils.tileSizes[zoom];
		gmx.mInPixel = 256 / gmx.tileSize;
		// gmx.rastersDeltaY = gmx.RasterSRS === 3857 ? 0 : this._getShiftY(gmx.currentZoom, L.CRS.EPSG3395);
        // if (gmx.applyShift && this._map) {
			// gmx.deltaY = this._getShiftY(gmx.currentZoom);
			// gmx.shiftX = Math.floor(gmx.mInPixel * (gmx.shiftXlayer || 0));
			// gmx.shiftY = Math.floor(gmx.deltaY + gmx.mInPixel * (gmx.shiftYlayer || 0));
			// gmx.shiftPoint = new L.Point(gmx.shiftX, -gmx.shiftY);     // Сдвиг слоя
        // }
    },

	_getShiftY: function(zoom, crs) {		// Layer shift
		var map = this._map,
			pos = map.getCenter(),
			shift = (map.options.crs.project(pos).y - (crs || this.options.tilesCRS).project(pos).y);

		return Math.floor(L.CRS.scale(zoom) * shift / 40075016.685578496);
	},

	// _clearOtherZoomLevels: function (zoom) {
		// zoom = zoom || this._tileZoom;
		// for (var z in this._levels) {
			// if (z != zoom) {
				// L.DomUtil.remove(this._levels[z].el);
				// this._onRemoveLevel(z);
				// delete this._levels[z];
			// }
		// }
	// },

    __drawTile: function (ev) {
		var coords = ev.coords,
			zKey = this._tileCoordsToKey(coords),
			tileElem = this._tiles[zKey];
if (!tileElem) {
	return;
}

        var myLayer = this,
			zoom = this._tileZoom,
            gmx = this._gmx;

        if (tileElem && !tileElem.promise) {
			tileElem.loaded = 0;
			tileElem.key = zKey;
			tileElem.promise = new Promise(function(resolve, reject) {
				tileElem.resolve = resolve;
				tileElem.reject = reject;
				var filters = gmx.dataManager.getViewFilters('screen', gmx.layerID);
                var done = function() {
					myLayer._tileReady(coords, null, tileElem.el);
                };
				tileElem.observer = gmx.dataManager.addObserver({
                    type: 'resend',
                    layerID: gmx.layerID,
                    needBbox: gmx.needBbox,
					topLeft: tileElem.screenTile.topLeft,
                    srs: gmx.srs,
                    target: 'screen',
					targetZoom: myLayer.options.isGeneralized ? zoom : null,
					dateInterval: gmx.layerType === 'VectorTemporal' ? [gmx.beginDate, gmx.endDate] : null,
                    active: true,
                    bbox: gmx.styleManager.getStyleBounds(coords),
                    filters: ['clipFilter', 'userFilter_' + gmx.layerID, 'styleFilter', 'userFilter'].concat(filters),
                    callback: function(data) {
// console.log('______', zKey, data);
                        if (myLayer._tiles[zKey]) {
							myLayer._tiles[zKey].loaded = 0;
							// new ScreenVectorTile(myLayer, tileElem).drawTile(data).then(function(res) {
							tileElem.screenTile.drawTile(data).then(function(res) {
								// console.log('resolve', zKey, res, data);
								if (res) { tileElem.count = res.count; }
								done(res);
							}, function(err) {
								// console.log('reject', zKey, err, data);
								done(err);
							});
						} else {
							// console.log('bad key', zKey);
							done();
						}
                    }
				}, zKey)
					.on('activate', function() {
						//if observer is deactivated before drawing,
						//we can consider corresponding tile as already drawn
						if (!this.isActive()) {
							// console.log('isActive', zKey)
							done();
						}
					});
					//.activate();
			}).catch(function(e) {
				console.warn('catch:', e);
			});
		} else {
			//tileElem.observer.deactivate();
			tileElem.resolve();
		}
    }
});
L.Map.addInitHook(function () {
    if (L.Mixin.ContextMenu) {
		L.gmx.VectorLayer.include(L.Mixin.ContextMenu);
	}
	this.options.ftc = this.options.ftc || 'osm';
	this.options.srs = this.options.srs || 3857;
	this.options.skipTiles = this.options.skipTiles || 'All';
});
