(function() {
    'use strict';
    var GmxGridCluster = L.Evented.extend({
        options: {
            // observerOptions: {
				// delta: 256,
                // filters: ['clipFilter', 'styleFilter', 'userFilter', 'clipPointsFilter']
            // },
			skipItems: true,
            minZoom: 1,
            maxZoom: 6
        },
		initialize: function (options, layer) {
			this._layer = layer;
			options = L.Util.setOptions(this, options);
            this._markers = new L.FeatureGroup(options);
        },

        checkData: function (data) {
			// console.log('ssssssss', data);
			var zoom = this._layer._gmx.currentZoom;
			if (zoom < this.options.minZoom || zoom > this.options.maxZoom) {
				return false;
			}
			this._drawMe(data)
			if (this._layer._map && zoom === data.tileElem.coords.z) {
				this._layer._map.addLayer(this._markers);
				if (!this._zoomClear) {
					this._layer._map.on('zoomstart', function(ev) {
						this._markers.clearLayers()
					}, this);
					this._zoomClear = true;
				}
			}
			return this.options.skipItems && true;
        },

        _drawMe: function (data) {
					// this.tile.width = this.tile.height = ts;
			var tileElem = data.tileElem,
				tbounds = tileElem.screenTile.tbounds,
				center = tbounds.getCenter(),
				bp = this._layer._tileCoordsToNwSe(tileElem.coords),
				lbounds = L.latLngBounds(bp[0], bp[1]),
				lcenter = lbounds.getCenter(),
				arr = [
					{ bounds: L.gmxUtil.bounds([[tbounds.min.x, center[1]], 	[center[0], tbounds.max.y]]), 		center: L.latLngBounds(lbounds.getNorthWest(), lcenter).getCenter() },
					{ bounds: L.gmxUtil.bounds([center,							[tbounds.max.x, tbounds.max.y]]),	center: L.latLngBounds(lbounds.getNorthEast(), lcenter).getCenter() },
					{ bounds: L.gmxUtil.bounds([[tbounds.min.x, tbounds.min.y],	center]), 							center: L.latLngBounds(lbounds.getSouthWest(), lcenter).getCenter() },
					{ bounds: L.gmxUtil.bounds([[center[0], tbounds.min.y],		[tbounds.max.x, center[1]]]), 		center: L.latLngBounds(lbounds.getSouthEast(), lcenter).getCenter() }
				],
				ctx = tileElem.el.getContext('2d'),
				cnt = 2,
				delta = 256 / cnt - 1;

			data.geoItems.forEach(function(it) {
				var item = it.item,
					bbox = item.bounds;

				for(var i = 0; i < 4; i++) {
					var pt = arr[i];
					if (pt.bounds.intersects(bbox)) {
						var nm = item.currentFilter;
						if (!pt.counts) { pt.counts = {}; }
						if (!pt.counts[nm]) { pt.counts[nm] = 1; }
						else { pt.counts[nm]++; }
						break;
					}
				}
			});
			arr.forEach(function(it, i) {
				if (it.counts) {
					var bx = 128 * (i % 2),
						by = (i > 1 ? 128 : 0),
						count = 0;
					ctx.strokeRect(bx, by, delta, delta);
					
					for (var key in it.counts) {
						count += it.counts[key];
					}
					it.marker = this.addMarker(it, count);
					it.marker.addTo(this._markers);
					// ctx.strokeText( count + ' - ' + tileElem.key + ' - ' + i, bx + delta / 2, by + delta / 2);
				}
			}.bind(this));
			tileElem._gridData = arr;
			ctx.stroke();
        },

        addMarker: function (it, count) {
			var center = it.bounds.toLatLngBounds().getCenter();
			var legend = '';
			for (var key in it.counts) {
				legend += this._layer.getStyleIcon(key, it.counts[key]);
			}

			var myIcon = L.divIcon({className: 'gmx-style-legend-icon', html: count});

			var marker = L.marker(L.latLng(center.lat, it.center.lng), L.extend({
					icon: myIcon
				}, this.options))
				.bindPopup(legend);

			return marker;
        }
    });

    L.gmx.VectorLayer.include({
        bindGridClusters: function (options) {
			if (this._gridClusters) {
				this._gridClusters.unbindLayer();
			}
			this._gridClusters = new GmxGridCluster(options, this);
            return this;
        },

        unbindGridClusters: function () {
			if (this._gridClusters) {
				this._gridClusters.unbindLayer();
				this._gridClusters = null;
				// this.enablePopup();
			}
            return this;
        }
    });
})();
