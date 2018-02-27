/*
 * gmxEventsManager - handlers manager
 */
var GmxEventsManager = L.Handler.extend({
    options: {
    },

    initialize: function (map) {
        this._map = map;
        this._layers = {};
        this._lastLayer = null;
        this._lastId = null;
        this._drawstart = null;
        this._lastCursor = '';

        map.on({
            zoomend: function () {
                if (map._gmxMouseLatLng) {
					this._onmousemove({type: 'mousemove', latlng: map._gmxMouseLatLng});
                    // setTimeout(function () {
                        // eventCheck({type: 'mousemove', latlng: map._gmxMouseLatLng});
                    // }, 0);
                }
            },
            click: this._eventCheck,
            dblclick: this._eventCheck,
            mousedown: this._eventCheck,
            mouseup: this._eventCheck,
            mousemove: this._onmousemove,
            contextmenu: this._onmousemove,
            layeradd: function (ev) {
                var layer = ev.layer;
                if ('gmxEventCheck' in layer && layer.options.clickable) {
					var i = 0;
					if (layer._container) {
						var container = layer._container,
							arr = container.parentNode.childNodes,
							len;
						for (i = 0, len = arr.length; i < len; i++) {
							if (container === arr[i]) { break; }
						}
					}
                    this._layers[layer._leaflet_id] = i;
                }
            },
            layerremove: function (ev) {
                var id = ev.layer._leaflet_id;
                delete this._layers[id];
                if (this._lastLayer && this._lastLayer._leaflet_id === id) {
                    this._lastLayer = null;
                    this._lastId = 0;
                }
            }
        }, this);
    },

    _onmousemove: function (ev) {
		if (!this._map._animatingZoom) {
			// if (this._onmousemoveTimer) { clearTimeout(this._onmousemoveTimer); }
			// this._onmousemoveTimer = setTimeout(this._eventCheck.bind(this, ev), 50);
			if (this._onmousemoveTimer) { cancelIdleCallback(this._onmousemoveTimer); }
			this._onmousemoveTimer = requestIdleCallback(this._eventCheck.bind(this, ev), {timeout: 50});
		}
	},
	_isDrawing: function () {
		var map = this._map;
		if (this._drawstart) {
			return true;
		} else if (this._drawstart === null) {
			if (map.gmxControlsManager) {
				var drawingControl = map.gmxControlsManager.get('drawing');
				if (drawingControl) {
					drawingControl.on('activechange', function (ev) {
						this._drawstart = ev.activeIcon;
						map._container.style.cursor = this._drawstart ? 'pointer' : '';
					});
				}
			}
			this._drawstart = false;
		}
		return false;
	},

	_clearLastHover: function () {
		if (this._lastLayer) {
			this._lastLayer.gmxEventCheck({type: 'mousemove'}, true);
			this._lastLayer = null;
		}
    },

	_eventCheck: function (ev) {
		var type = ev.type,
			map = this._map;

		if (ev.originalEvent) {
			map.gmxMouseDown = L.Browser.webkit && !L.gmxUtil.isIEOrEdge ? ev.originalEvent.which : ev.originalEvent.buttons;
		}
		if (map._animatingZoom ||
			!ev.latlng ||
			this._isDrawing() ||
			(type === 'click' &&  map._skipClick) ||        // from drawing
			(type === 'mousemove' &&  map.gmxMouseDown)
			) {
			this._clearLastHover();
			map._skipClick = false;
			return;
		}
		if (ev.layerPoint) {
			map._gmxMouseLatLng = ev.latlng;
			map.gmxMousePos = map.getPixelOrigin().add(ev.layerPoint);
		}

		var arr = Object.keys(this._layers).sort(function(a, b) {
			var la = map._layers[a],
				lb = map._layers[b];
			if (la && lb) {
				var oa = la.options, ob = lb.options,
					za = (oa.zIndexOffset || 0) + (oa.zIndex || 0),
					zb = (ob.zIndexOffset || 0) + (ob.zIndex || 0),
					delta = zb - za;
				return delta ? delta : this._layers[b] - this._layers[a];
			}
			return 0;
		});

		var layer,
			foundLayer = null,
			cursor = '';

		for (var i = 0, len = arr.length; i < len; i++) {
			var id = arr[i];
			layer = map._layers[id];
			if (layer && layer._map && !layer._animating && layer.options.clickable) {
				if (layer.gmxEventCheck(ev)) {
					if (layer.hasEventListeners('mouseover')) { cursor = 'pointer'; }
					foundLayer = layer;
					break;
				}
			}
		}
		if (this._lastCursor !== cursor && !this._isDrawing()) {
			map._container.style.cursor = cursor;
		}
		this._lastCursor = cursor;

		if (type !== 'zoomend') {
			if (foundLayer) {
				if (this._lastLayer !== foundLayer) {
					this._clearLastHover();
				}
				this._lastLayer = foundLayer;
			} else {
				this._clearLastHover();
			}
		}
	}

});

L.Map.addInitHook(function () {
    // Check to see if handler has already been initialized.
    if (!this._gmxEventsManager) {
        this._gmxEventsManager = new GmxEventsManager(this);
		this.isGmxDrawing = function () {
			return this._gmxEventsManager._drawstart;
		};

        this.on('remove', function () {
            if (this._gmxEventsManager) {
                this._gmxEventsManager.removeHooks();
            }
        });
    }
});
