//Single observer with vector data
var Observer = L.Class.extend({
    includes: L.Evented ? L.Evented.prototype : L.Mixin.Events,
    /* options : {
            type: 'resend | update',    // `resend` - send all data (like screen tile observer)
                                        // `update` - send only changed data
            callback: Func,             // will be called when layer's data for this observer is changed
            dateInterval: [dateBegin,dateEnd], // temporal interval
            bbox: bbox,                 // bbox to observe on Mercator
            filters: [String]           // filter keys array
            active: [Boolean=true]      // is this observer active
            layerID: String           	// ID слоя view
			target: String				// ключ назначения обсервера
			z: zoom						// zoom для 'screen' обсервера
            targetZoom: [Number]        // for zoom generalized type default(null)
			topLeft: {}					// для screen
            needBbox: [Boolean=false]   // режим запросов списка тайлов по BBOX
        }
    */
    initialize: function(options) {
        this.type = options.type || 'update';
        this._callback = options.callback;
        this.layerID = options.layerID;
        this.target = options.target;
        this.itemHook = options.itemHook;	// set hook for item (set empty data for callback function)
        this._items = null;
        this.bbox = options.bbox;      		// set bbox by Mercator bounds
        this.needBbox = options.needBbox;   // режим запросов списка тайлов по BBOX
        this.filters = options.filters || [];
        this.targetZoom = options.targetZoom || null;
        this.active = 'active' in options ? options.active : true;
        this.srs = options.srs || 3857;	// 3857, 3395

        if (options.bounds) {   // set bbox by LatLngBounds
            this.setBounds(options.bounds);
        }

		var w = gmxAPIutils.worldWidthMerc,
			dx;
        if (!this.bbox) {
            this.bbox = gmxAPIutils.bounds([[-w, -w], [w, w]]);
            this.world = true;
        } else if (this.bbox.max.x > w) {
			dx = this.bbox.max.x - w;
            this.bbox1 = gmxAPIutils.bounds([[dx - w, this.bbox.max.y], [-(dx + w), this.bbox.min.y]]);
        } else if (this.bbox.min.x < -w) {
			dx = this.bbox.min.x + w;
            this.bbox1 = gmxAPIutils.bounds([[dx + w, this.bbox.max.y], [w - dx, this.bbox.min.y]]);
        }

        if (options.dateInterval) {
            this._setDateInterval(options.dateInterval[0], options.dateInterval[1]);
        }
    },

    hasFilter: function(filterName) {
        for (var i = 0, len = this.filters.length; i < len; i++) {
            if (this.filters[i] === filterName) {
                return true;
            }
        }
        return false;
    },

    activate: function() {
        if (!this.active) {
            this.active = true;
            this.fire('activate');
        }
        return this;
    },

    deactivate: function() {
        if (this.active) {
            this.active = false;
            this.fire('activate');
        }
        return this;
    },

    toggleActive: function(isActive) {
        return isActive ? this.activate() : this.deactivate();
    },

    isActive: function() {
        return this.active;
    },

    updateData: function(data) {
        var len = data.length,
            out = {count: len};
// if (!this.layerID) {
// console.log('________', this.id, len)
// }
// console.log('updateData', this.id, this.layerID, len)
        if (this.type === 'update') {
            //calculate difference with previous data
            if (!this._items) { this._items = {}; }
            var prevItems = this._items,
                newItems = {},
                added = [],
                removed = [],
                key;

            for (var i = 0; i < len; i++) {
                var it = data[i];

                key = it.id + '_' + it.tileKey;

                newItems[key] = it;

                if (!prevItems[key]) {
                    added.push(it);
                }
            }

            for (key in prevItems) {
                if (!newItems[key]) {
                    removed.push(prevItems[key]);
                }
            }

            if (added.length) {
                out.added = added;
            }
            if (removed.length) {
                out.removed = removed;
            }

            this._items = newItems;

        } else {
            out.added = data;
        }
		this.fire('data', {data: this._callback(out)});
        out = null;
        data = null;

        return this;
    },

    removeData: function(keys) {
        if (this.type !== 'update' || !this._items) {
            return this;
        }

        var items = this._items,
            removed = [];

        for (var id in keys) {
            if (items[id]) {
                removed.push(items[id]);
                delete items[id];
            }
        }

        if (removed.length) {
            this._callback({removed: removed});
        }

        return this;
    },

    /*setFilter: function (func) {
        this._filters.userFilter = func;
        this.fire('update');
        return this;
    },

    removeFilter: function () {
        delete this._filters.userFilter;
        this.fire('update');
        return this;
    },*/

    setBounds: function(bounds, buffer) {
        var w;
        if (!bounds) {
            if (!this.world) {
                w = gmxAPIutils.worldWidthMerc;
                this.bbox = gmxAPIutils.bounds([[-w, -w], [w, w]]);
                this.bbox1 = null;
                this.world = true;
                this.fire('update');
            }
            return this;
        }

        var min = bounds.min,
            max = bounds.max;
        if (!min || !max) {
            var latLngBounds = L.latLngBounds(bounds),
                sw = latLngBounds.getSouthWest(),
                ne = latLngBounds.getNorthEast();
            min = {x: sw.lng, y: sw.lat};
            max = {x: ne.lng, y: ne.lat};
        }
        var minX = min.x, maxX = max.x,
            minY = min.y, maxY = max.y,
            minX1 = null,
            maxX1 = null;

        this.world = false;
        w = (maxX - minX) / 2;
        if (w >= 180) {
            minX = -180; maxX = 180;
            this.world = true;
        } else if (maxX > 180 || minX < -180) {
            var center = ((maxX + minX) / 2) % 360;
            if (center > 180) { center -= 360; }
            else if (center < -180) { center += 360; }
            minX = center - w; maxX = center + w;
            if (minX < -180) {
                minX1 = minX + 360; maxX1 = 180; minX = -180;
            } else if (maxX > 180) {
                minX1 = -180; maxX1 = maxX - 360; maxX = 180;
            }
        }
		var crs = this.srs == 3857 ? L.CRS.EPSG3857 : L.Projection.Mercator,
			m1 = crs.project(L.latLng(minY, minX)),
			m2 = crs.project(L.latLng(maxY, maxX));

		this.bbox = gmxAPIutils.bounds([[m1.x, m1.y], [m2.x, m2.y]]);
		if (buffer) { this.bbox.addBuffer(buffer); }
        this.bbox1 = null;
        if (minX1) {
            m1 = crs.project(L.latLng(minY, minX1));
            m2 = crs.project(L.latLng(maxY, maxX1));
            this.bbox1 = gmxAPIutils.bounds([[m1.x, m1.y], [m2.x, m2.y]]);
			if (buffer) { this.bbox1.addBuffer(buffer); }
        }

        this.fire('update');
        return this;
    },

    intersects: function(bounds) {
        return this.world || this.bbox.intersects(bounds) || !!(this.bbox1 && this.bbox1.intersects(bounds));
    },

    intersectsWithTile: function(tile) {
        if (this.targetZoom && !this.needBbox) {
            var z = this.targetZoom + (this.targetZoom % 2 ? 1 : 0);
            if ((tile.isGeneralized && tile.z !== z) || tile.z > z) { return false; }
        }
        var di = this.dateInterval;
        return this.intersects(tile.bounds) && (!tile.beginDate || (di && di.endDate >= tile.beginDate && di.beginDate <= tile.endDate));
    },

    intersectsWithGeometry: function(geometry) {
        var type = geometry.type.toUpperCase(),
			coords = geometry.coordinates;
		if (type === 'POINT') {
			return this.world || this.bbox.contains(coords) || !!(this.bbox1 && this.bbox1.contains(coords));
		} else if (type === 'POLYGON') {
			coords = [coords[0]];
		} else if (type === 'MULTIPOLYGON') {
			coords = coords.map(function(arr) { return arr[0]; });
        } else if (type === 'LINESTRING') {
			coords = [coords];
        // } else if (type === 'MULTILINESTRING') {
		}
		for (var i = 0, len = coords.length; i < len; i++) {
			if (this.bbox.clipPolygon(coords[i]).length || (this.bbox1 && this.bbox1.clipPolygon(coords[i]).length)) {
				return true;
			}
		}
		return false;
    },

    _setDateInterval: function(beginDate, endDate) {
        if (beginDate && endDate) {
            // var beginValue = beginDate.valueOf(),
                // endValue = endDate.valueOf();
            this.dateInterval = {
                beginDate: beginDate,
                endDate: endDate
            };
        } else {
            this.dateInterval = null;
        }
    },

    setDateInterval: function(beginDate, endDate) {
        var isValid = beginDate && endDate;

        if (!this.dateInterval !== !isValid ||
            isValid && (
                this.dateInterval.beginDate.valueOf() !== beginDate.valueOf() ||
                this.dateInterval.endDate.valueOf() !== endDate.valueOf()
            )
        ) {
            this._setDateInterval(beginDate, endDate);
            this.fire('update', {temporalFilter: true});
        }
        return this;
    }
});
L.gmx.observer = function(options) {
    return new Observer(options);
};
