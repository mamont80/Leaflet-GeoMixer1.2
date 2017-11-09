L.gmx.ExternalLayer = L.Class.extend({
    createExternalLayer: function () {          // extend: must return <ILayer> or null = this.externalLayer
        return null;
    },

    isExternalVisible: function (/*zoom*/) {    // extend: return true view this.externalLayer, return false view this.parentLayer
        return true;
    },

    updateData: function (/*data*/) {           // extend: for data update in this.externalLayer
    },

    setDateInterval: function () {
        if (this._observer) {
            var gmx = this.parentLayer._gmx;
            this._observer.setDateInterval(gmx.beginDate, gmx.endDate);
        }
    },

    options: {
        useDataManager: true,
        observerOptions: {
			delta: 0,
            filters: ['clipFilter', 'userFilter', 'clipPointsFilter']
        }
    },

    initialize: function (options, layer) {
        L.setOptions(this, options);
        this.parentLayer = layer;

        layer
            .on('add', this._addEvent, this)
            .on('dateIntervalChanged', this.setDateInterval, this);

        if (this.options.useDataManager) {
            this._addObserver(this.options.observerOptions);
        }

        this.externalLayer = this.createExternalLayer();

        if (layer._map) {
            this._addEvent({target:{_map: layer._map}});
            this._updateBbox();
        }
    },

    _addObserver: function (opt) {
        this._items = {};
        this._observer = this.parentLayer.addObserver(
            L.extend({
                bbox: gmxAPIutils.bounds([[Number.MAX_VALUE, Number.MAX_VALUE]]),
                callback: L.bind(this.updateData, this)
            }, opt)
        ).deactivate();
    },

    unbindLayer: function () {
        this.parentLayer
            .off('add', this._addEvent, this)
            .off('dateIntervalChanged', this.setDateInterval, this);

        if (this._observer) { delete this.parentLayer.repaintObservers[this._observer.id]; }
        var map = this._map || this.parentLayer._map;
        this._onRemove(!map);
        this._removeMapHandlers();
    },

    _addMapHandlers: function (map) {
        if (map) {
			this._map = map;
			this._map.on({
				moveend: this._updateBbox,
				zoomend: this._chkZoom,
				layeradd: this._layeradd,
				layerremove: this._layerremove
			}, this);
		}
    },

    _removeMapHandlers: function () {
        if (this._map) {
            this._map.off({
                moveend: this._updateBbox,
                zoomend: this._chkZoom,
                layeradd: this._layeradd,
                layerremove: this._layerremove
            }, this);
        }
        this._map = null;
    },

    _addEvent: function (ev) {
		this._addMapHandlers(ev.target._map);
        this._updateBbox();
        this._chkZoom();
    },

    _isParentLayer: function (ev) {
        var layer = ev.layer;
        return layer._gmx && layer._gmx.layerID === this.parentLayer.options.layerID;
    },

    _layeradd: function (ev) {
        if (this._isParentLayer(ev)) {
            this._chkZoom();
        }
    },

    _layerremove: function (ev) {
        if (this._isParentLayer(ev)) {
            this._onRemove(true);
            this._removeMapHandlers();
        }
    },

    _onRemove: function (fromMapFlag) {    // remove external layer from parent layer
        if (this._observer) {
            this._observer.deactivate();
        }
        var map = this._map;
        if (map) {
            if (map.hasLayer(this.externalLayer)) {
                this._chkZoom();
                map.removeLayer(this.externalLayer);
            }
            if (!fromMapFlag) {
                this.parentLayer.onAdd(map);
            }
        }
    },

    _chkZoom: function () {
        if (!this._map) { return; }

        var layer = this.parentLayer,
            observer = this._observer,
            map = this._map,
            isExtLayerOnMap = map.hasLayer(this.externalLayer);

        if (layer.setCurrentZoom) { layer.setCurrentZoom(map); }
        if (!this.isExternalVisible(map.getZoom())) {
            if (observer) { observer.deactivate(); }
            if (!layer._map) {
                if (isExtLayerOnMap) {
                    map.removeLayer(this.externalLayer);
                }
                layer.onAdd(map);
            }
            layer.enablePopup();
        } else if (layer._map) {
            layer.onRemove(map);
            if (!isExtLayerOnMap) {
                map.addLayer(this.externalLayer);
            }
            this.setDateInterval();
            if (observer) {
                layer.getIcons(function () {
                    observer.activate();
                }.bind(this));
            }
            layer.disablePopup();
        }
    },


    _updateBbox: function () {
        if (!this._map || !this._observer) { return; }

        var map = this._map,
			screenBounds = map.getBounds(),
            p1 = screenBounds.getNorthWest(),
            p2 = screenBounds.getSouthEast(),
            bbox = L.gmxUtil.bounds([[p1.lng, p1.lat], [p2.lng, p2.lat]]),
			delta = this.options.observerOptions.delta,
			buffer = delta ? delta * L.gmxUtil.tileSizes[map.getZoom()] / 256 : 0;
        this._observer.setBounds(bbox, buffer);
    }
});
