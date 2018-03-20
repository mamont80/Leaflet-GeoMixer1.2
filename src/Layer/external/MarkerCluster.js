(function() {
    'use strict';
    var _DEFAULTS = {
        radiusFunc: function (count) {
            var r = Math.floor(count / 15);
            if (r > 40) {
                r = 40;
            } else if (r < 20) {
                r = 20;
            }
            return r;
        },
        text: {
            stroke: 'black',
            'stroke-width': 1,
            'text-anchor': 'middle',
            fill: 'white'
        }
    };
    var GmxMarkerCluster = L.gmx.ExternalLayer.extend({
        options: {
            observerOptions: {
				delta: 256,
                filters: ['clipFilter', 'styleFilter', 'userFilter', 'clipPointsFilter']
            },
            spiderfyOnMaxZoom: true,
			animate: false,
            minZoom: 1,
            maxZoom: 6
        },

        createExternalLayer: function () {
            var mOptions = L.extend({
                showCoverageOnHover: false,
                disableClusteringAtZoom: 1 + Number(this.options.maxZoom)
            }, this.options);

            if ('clusterIconOptions' in this.options) {
                var opt = this.options.clusterIconOptions;
                if ('radialGradient' in opt) {
                    var radialGradient = opt.radialGradient,
                        text = opt.text || _DEFAULTS.text;
                    mOptions.iconCreateFunction = function (cluster) {
                        var childCount = cluster.getChildCount();

                        text.count = childCount;
                        return  L.gmxUtil.getSVGIcon({
                            type: 'circle',
                            iconSize: 2 * (radialGradient.radiusFunc || _DEFAULTS.radiusFunc)(childCount),
                            text: text,
                            fillRadialGradient: radialGradient
                        });
                    };
                }
            }

            if (this.options.clusterclick) {
                mOptions.clusterclick = this.options.clusterclick;
                if (mOptions.clusterclick === true) { mOptions.zoomToBoundsOnClick = false; }
            }

            this._popup = new L.Popup({maxWidth: 10000, className: 'gmxPopup'});
            var markers = new L.MarkerClusterGroup(mOptions);

            // текущий развёрнутый кластер
            var currentSpiderfiedCluster = null;

            markers
                .on('click', function (ev) {
                    var propsArr = ev.layer.options.properties,
                        properties = this.parentLayer.getItemProperties(propsArr),
                        geometry = [propsArr[propsArr.length - 1]],
                        id = propsArr[0];

                    if (currentSpiderfiedCluster && !(currentSpiderfiedCluster.getAllChildMarkers().indexOf(ev.layer) + 1)) {
                        currentSpiderfiedCluster.unspiderfy();
                        markers.once('unspiderfied', function () {
                            this._openPopup(propsArr, ev.latlng);
                        }, this);
                    } else {
                        this._openPopup(propsArr, ev.latlng);
                    }

                    this.parentLayer.fire('click', L.extend(ev, {
                        eventFrom: 'markerClusters',
                        originalEventType: 'click',
                        gmx: {
                            id: id,
                            layer: this.parentLayer,
                            properties: properties,
                            target: {
                                id: id,
                                properties: propsArr,
                                geometry: geometry
                            }
                        }
                    }));
                }, this)
                .on('animationend', function () {
                    if (this._popup && this._popup._map) {
                        this._popup._map.removeLayer(this._popup);
                    }
                }, this)
                .on('clusterclick', function (ev) {
                    this.parentLayer.fire('clusterclick', L.extend(ev, {
                        eventFrom: 'markerClusters',
                        originalEventType: 'clusterclick'
                    }));
                }, this)
                .on('spiderfied', function (ev) {
                    currentSpiderfiedCluster = ev.cluster;
                }, this)
                .on('unspiderfied', function () {
                    currentSpiderfiedCluster = null;
                }, this);

            if (mOptions.clusterclick) {
                markers.on('clusterclick', mOptions.clusterclick instanceof Function ? mOptions.clusterclick : function (a) {
                    a.layer.spiderfy();
                });
            }

            return markers;
        },

        isExternalVisible: function (zoom) {
            return !(zoom < this.options.minZoom || zoom > this.options.maxZoom);
        },

        updateData: function (data) {
            var arr = [],
                i, len, vectorTileItem, id, marker;
            if (data.removed) {
                for (i = 0, len = data.removed.length; i < len; i++) {
                    vectorTileItem = data.removed[i];
                    id = vectorTileItem.id;
                    marker = this._items[id];
                    if (marker) {
                        arr.push(marker);
                    }
                    delete this._items[id];
                }
                this.externalLayer.removeLayers(arr);
                arr = [];
            }
            if (data.added) {
				var tilesCRS = this.parentLayer.options.tilesCRS || L.Projection.Mercator;
                for (i = 0, len = data.added.length; i < len; i++) {
                    vectorTileItem = data.added[i];
                    id = vectorTileItem.id;
                    marker = this._items[id];
                    var item = vectorTileItem.properties;
                    if (marker && item.processing) {
                        this.externalLayer.removeLayer(marker);
                        marker = null;
                    }
                    if (!marker) {
                        if (!vectorTileItem.item.parsedStyleKeys) {
                            vectorTileItem.item.parsedStyleKeys = this.parentLayer.getItemStyle(id);
                        }
                        var geo = item[item.length - 1],
                            parsedStyle = vectorTileItem.item.parsedStyleKeys,
                            p = geo.coordinates,
                            latlng = tilesCRS.unproject({x: p[0], y: p[1]}),
                            opt = {
                                properties: vectorTileItem.properties,
                                mPoint: p
                            };

                        if (this.options.notClusteredIcon) {
                            var icon = this.options.notClusteredIcon;
                            if (icon instanceof L.Icon) {
                                opt.icon = icon;
                            } else {
                                opt.icon = L.icon(icon);
                            }
                        } else if (parsedStyle) {
                            if (parsedStyle.iconUrl) {
                                var iconAnchor = parsedStyle.iconAnchor;
                                if (!iconAnchor) {
                                    var style = this.parentLayer.getItemStyle(id);
                                    iconAnchor = style.image ? [style.sx / 2, style.sy / 2] : [8, 10];
                                }
                                opt.icon = L.icon({
                                    iconAnchor: iconAnchor,
                                    iconUrl: parsedStyle.iconUrl
                                });
                            } else {
                                opt.icon = L.gmxUtil.getSVGIcon(parsedStyle);
                            }
                        }
                        if (parsedStyle.rotate) {
                            marker = L.rotatedMarker(latlng, L.extend(opt, {
                                angle: parsedStyle.rotate
                            }));
                        } else {
                            marker = L.marker(latlng, L.extend(opt, {
                                angle: parsedStyle.rotate
                            }));
                        }
                        this._items[id] = marker;
                    }
                    arr.push(marker);
                }
                this.externalLayer.addLayers(arr);
            }
        },

        _openPopup: function (propsArr, latlng) {
            var gmx = this.parentLayer._gmx,
                id = propsArr[0],
                balloonData = gmx.styleManager.getItemBalloon(id),
                properties = this.parentLayer.getItemProperties(propsArr),
                geometry = [propsArr[propsArr.length - 1]];

            if (balloonData && !balloonData.DisableBalloonOnClick) {
                var style = this.parentLayer.getItemStyle(id);
                if (style && style.iconAnchor) {
                    var protoOffset = L.Popup.prototype.options.offset;
                    this._popup.options.offset = [-protoOffset[0] - style.iconAnchor[0] + style.sx / 2,
                        protoOffset[1] - style.iconAnchor[1] + style.sy / 2
                    ];
                }
                this._popup
                    .setLatLng(latlng)
                    .setContent(L.gmxUtil.parseBalloonTemplate(balloonData.templateBalloon, {
                        properties: properties,
                        tileAttributeTypes: gmx.tileAttributeTypes,
                        unitOptions: this._map.options || {},
                        geometries: geometry
                    }))
                    .openOn(this._map);
            }
        }
    });

    L.gmx.VectorLayer.include({
        bindClusters: function (options) {
            if (L.MarkerClusterGroup) {
                if (this._clusters) {
                    this._clusters.unbindLayer();
                }
                this._clusters = new GmxMarkerCluster(options, this);
            }
            return this;
        },

        unbindClusters: function () {
            if (L.MarkerClusterGroup) {
                if (this._clusters) {
                    this._clusters.unbindLayer();
                    this._clusters = null;
                    this.enablePopup();
                }
            }
            return this;
        }
    });
})();
