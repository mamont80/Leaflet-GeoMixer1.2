(function() {
    'use strict';
    var GmxHeatMap = L.gmx.ExternalLayer.extend({
        options: {
            minHeatMapZoom: 1,
            maxHeatMapZoom: 6,
            intensityField: '',
            intensityScale: 1,
            observerOptions: {
                type: 'resend'
            }
        },

        createExternalLayer: function () {
            return L.heatLayer([], L.extend({
                 // minOpacity: 0.05,
                 // maxZoom: 18,
                 // radius: 25,
                 // blur: 15,
                 // max: 1.0
            }, this.options));
        },

        isExternalVisible: function (zoom) {
            return !(zoom < this.options.minHeatMapZoom || zoom > this.options.maxHeatMapZoom);
        },

        updateData: function (data) {
            if (data.added) {
                var latlngs = [],
                    indexes = this.parentLayer.getTileAttributeIndexes(),
                    altIndex = null,
                    intensityField = this.options.intensityField || '',
                    intensityScale = this.options.intensityScale || 1;

                if (intensityField && intensityField in indexes) {
                    altIndex = indexes[intensityField];
                }
                for (var i = 0, len = data.added.length; i < len; i++) {
                    var it = data.added[i].properties,
                        alt = altIndex !== null ? it[altIndex] : 1,
                        geo = it[it.length - 1],
                        coord = geo.coordinates,
                        point = L.Projection.Mercator.unproject({x: coord[0], y: coord[1]});

                    latlngs.push([point.lat, point.lng, typeof intensityScale === 'function' ? intensityScale(alt) : intensityScale * alt]);
                }
                this.externalLayer.setLatLngs(latlngs);
            }
        }
    });


    L.gmx.VectorLayer.include({
        bindHeatMap: function (options) {
            if (L.heatLayer) {
                if (this._heatmap) {
                    this._heatmap.unbindLayer();
                }
                this._heatmap = new GmxHeatMap(options, this);
            }
            return this;
        },

        unbindHeatMap: function () {
            if (L.heatLayer) {
                if (this._heatmap) {
                    this._heatmap.unbindLayer();
                    this._heatmap = null;
                    this.enablePopup();
                }
            }
            return this;
        }
    });
})();
