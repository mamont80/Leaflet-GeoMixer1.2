(function() {
    'use strict';
    var GmxGridCluster = L.Evented.extend({
        options: {
			skipItems: true,
            pixelDelta: 0,
			styleHook: function (ctx, it, maxCount) {
				ctx.setLineDash([2, 4]);
				// var zn = Math.floor(255 * (1 - it.count / maxCount));
				// ctx.fillStyle = 'rgb(' + zn + ',255, ' + zn + ', 0.2)';
			},
            // style: {
				// setLineDash: [5, 15]
			// },
            minZoom: 1,
            maxZoom: 6
        },
        _layer: null,
        _markers: null,
		initialize: function (options, layer) {
			this._layer = layer;
			options = L.Util.setOptions(this, options);
            this._markers = new L.FeatureGroup(options);
			this._layer.on('load', this.checkLoad, this);
        },

        checkLoad: function () {
			var tiles = this._layer._tiles,
				maxCount = 0,
				count = 0;
			for(var key in tiles) {
				var pt = tiles[key];
				if (pt.count) {
					count += pt.count;
				}
				if (pt._gridData) {
					pt._gridData.forEach(function(it) {
						if (it.count) {
							maxCount = Math.max(maxCount, it.count);
						}
					});
				}
			}
			if (count) {
				this._drawMe(maxCount, count);
			}
        },

        _drawMe: function (maxCount, allCount) {
			var tiles = this._layer._tiles,
				ts = this._layer.options.tileSize;
			for(var key in tiles) {
				var pt = tiles[key];
				if (!pt._drawDone && pt._gridData) {
					// pt._drawDone = true;
					if (pt.el.height != ts) { pt.el.width = pt.el.height = ts; }
					var ctx = pt.el.getContext('2d');
					pt._gridData.forEach(function(it) {
						if (it.count) {
							if (this.options.styleHook) {
								this.options.styleHook(ctx, it, maxCount);
							}
							var bbox = it.pixelBox;
							// if (ctx.fillStyle !== '#000000') {
								// ctx.fillRect(bbox[0], bbox[1], bbox[2], bbox[3]);
							// }
							
							ctx.strokeRect(bbox[0], bbox[1], bbox[2], bbox[3]);
						}
					}.bind(this));
				}
			}
        },

        _zoomClear: null,
        checkData: function (data) {
			// console.log('ssssssss', data);
			var zoom = this._layer._gmx.currentZoom;
			if (zoom < this.options.minZoom || zoom > this.options.maxZoom) {
				this._layer.enablePopup(true);
				return false;
			}
			this._layer.disablePopup(true);
			this._parseData(data)
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

        _parseData: function (data) {
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
				cnt = 2,
				delta = 256 / cnt - this.options.pixelDelta;

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
					var count = 0;
					for (var key in it.counts) {
						count += it.counts[key];
					}
					it.count = count;
					it.data = data;
					it.pixelBox = [128 * (i % 2) + this.options.pixelDelta, (i > 1 ? 128 : 0) + this.options.pixelDelta, delta, delta];
					it.marker = this.addMarker(it, count);
					it.marker.addTo(this._markers);
				}
			}.bind(this));
			tileElem._gridData = arr;
        },

        clearLayers: function () {
			if (this._markers) {
				this._markers.clearLayers();
				if (this._markers._map) { this._markers._map.removeLayer(this._markers); }
			}
        },

        addMarker: function (it, count) {
			var center = it.bounds.toLatLngBounds().getCenter(),
				marker = L.marker(L.latLng(center.lat, it.center.lng), L.extend({
					icon: L.divIcon({className: 'gmx-style-legend-icon', html: count})
				}, this.options))
				.bindPopup(Object.keys(it.counts).sort(function(a, b) {
						return  it.counts[b] - it.counts[a];
					}).map(function(key) {
						return this._layer.getStyleIcon(key, it.counts[key]);
					}.bind(this)).join(''), {
						minWidth: 150
					});

			return marker;
        }
    });

    L.gmx.VectorLayer.include({
        bindGridClusters: function (options) {
			if (this._gridClusters) {
				this._gridClusters.clearLayers();
			}
			this._gridClusters = new GmxGridCluster(options, this);
			this
				.redraw()
				.repaint();
            return this;
        },

        unbindGridClusters: function () {
			if (this._gridClusters) {
				this._gridClusters.clearLayers();
				this._gridClusters = null;
				this
					.redraw()
					.repaint();
			}
            return this;
        }
    });
})();
