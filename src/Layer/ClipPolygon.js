(function() {
var isBoundsIntersects = function (bounds, clipPolygons) {
    for (var key in clipPolygons) {
        var arr = clipPolygons[key];
        for (var i = 0, len = arr.length; i < len; i++) {
            var it = arr[i],
                type = it.geometry.type,
                boundsArr = it.boundsArr;
            for (var j = 0, len1 = boundsArr.length; j < len1; j++) {
                var bbox = boundsArr[j];
                if (type === 'Polygon') { bbox = [bbox]; }
                for (var j1 = 0, len2 = bbox.length; j1 < len2; j1++) {
                    if (bbox[j1].intersects(bounds)) { return true; }
                }
            }
        }
    }
    return false;
};
var isObserverIntersects = function (observer, clipPolygons) {
    for (var key in clipPolygons) {
        var arr = clipPolygons[key];
        for (var i = 0, len = arr.length; i < len; i++) {
            var it = arr[i],
                type = it.geometry.type,
                boundsArr = it.boundsArr;
            for (var j = 0, len1 = boundsArr.length; j < len1; j++) {
                var bbox = boundsArr[j];
                if (type === 'Polygon') { bbox = [bbox]; }
                for (var j1 = 0, len2 = bbox.length; j1 < len2; j1++) {
                    if (observer.intersects(bbox[j1])) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
};

var isPointInClipPolygons = function (chkPoint, clipPolygons) {
    if (!clipPolygons || Object.keys(clipPolygons).length === 0) { return true; }
    for (var key in clipPolygons) {
        var arr = clipPolygons[key];
        for (var i = 0, len = arr.length; i < len; i++) {
            var it = arr[i],
                type = it.geometry.type,
                boundsArr = it.boundsArr;
            for (var j = 0, len1 = boundsArr.length; j < len1; j++) {
                var bbox = boundsArr[j];
                if (type === 'Polygon') { bbox = [bbox]; }
                for (var j1 = 0, len2 = bbox.length; j1 < len2; j1++) {
                    if (bbox[j1].contains(chkPoint)) {
                        var coords = it.geometry.coordinates,
                            isIn = false;
                        if (type === 'Polygon') { coords = [coords]; }
                        for (var j2 = 0, len3 = coords.length; j2 < len3; j2++) {
                            if (gmxAPIutils.isPointInPolygonWithHoles(chkPoint, coords[j2])) {
                                isIn = true;
                                break;
                            }
                        }
                        if (isIn) { return true; }
                    }
                }
            }
        }
    }
    return false;
};

var getClipPolygonItem = function (geo) {
    var geometry = gmxAPIutils.convertGeometry(geo, false, true),		// все в 3857
        bboxArr = gmxAPIutils.geoItemBounds(geometry);
    bboxArr.geometry = geometry;
    return bboxArr;
};

var clipTileByPolygon = function (dattr) {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    var ctx = canvas.getContext('2d'),
        clipPolygons = dattr.clipPolygons;

    dattr.ctx = ctx;
    ctx.fillStyle = ctx.createPattern(dattr.tile, 'no-repeat');

    for (var key in clipPolygons) {
        var arr = clipPolygons[key];
        for (var i = 0, len = arr.length; i < len; i++) {
            var geo = arr[i].geometry,
                coords = geo.coordinates;
            if (geo.type === 'Polygon') { coords = [coords]; }
            for (var i1 = 0, len1 = coords.length; i1 < len1; i1++) {
                var coords1 = coords[i1];
                ctx.beginPath();
                for (var j1 = 0, len2 = coords1.length; j1 < len2; j1++) {
                    dattr.coords = coords1[j1];
                    var pixels = gmxAPIutils.getRingPixels(dattr);
                    dattr.coords = pixels.coords;
                    gmxAPIutils.polygonToCanvasFill(dattr);
                }
                ctx.closePath();
                ctx.fill();
            }
        }
    }
    ctx = dattr.tile.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.drawImage(canvas, 0, 0);
};

L.gmx.VectorLayer.include({

    isPointInClipPolygons: function (point) { // point [x, y] in Mercator
        return isPointInClipPolygons(point, this._gmx._clipPolygons);
    },

    addClipPolygon: function (polygon) { // (L.Polygon) or (L.GeoJSON with Polygons)
        var item = [],
            i, len;

        if ('coordinates' in polygon && 'type' in polygon) {
            item.push(getClipPolygonItem(polygon));
        } else if (polygon instanceof L.Polygon) {
            item.push(getClipPolygonItem(polygon.toGeoJSON().geometry));
        } else if (polygon instanceof L.GeoJSON) {
            var layers = polygon.getLayers();
            for (i = 0, len = layers.length; i < len; i++) {
                var layer = layers[i];
                if (layer instanceof L.Polygon && layer.feature) {
                    item.push(getClipPolygonItem(layer.feature.geometry));
                } else if (layer instanceof L.MultiPolygon && layer.feature) {
                    item.push(getClipPolygonItem(layer.feature.geometry));
                }
            }
        }
        if (item.length) {
            var gmx = this._gmx,
                dataManager = gmx.dataManager,
                _this = this,
                id = L.stamp(polygon);

            if (!this._gmx._clipPolygons) { this._gmx._clipPolygons = {}; }
            this._gmx._clipPolygons[id] = item;
            dataManager.setTileFilteringHook(function (tile) {
                return isBoundsIntersects(tile.bounds, _this._gmx._clipPolygons);
            });

            dataManager.addFilter('clipFilter', function (item, tile, observer) {
                return isObserverIntersects(observer, _this._gmx._clipPolygons);
            });

            dataManager.addFilter('clipPointsFilter', function (item) {
                if (item.type === 'POINT') {
                    var propArr = item.properties,
                        geom = propArr[propArr.length - 1];
                    return isPointInClipPolygons(geom.coordinates, _this._gmx._clipPolygons);
                }
                return true;
            });
            if (Object.keys(this._gmx._clipPolygons).length === 1) {
                gmx.renderHooks.unshift(function (tile, hookInfo) {
                    if (tile && Object.keys(_this._gmx._clipPolygons).length > 0) {
                        clipTileByPolygon({
                            tile: tile,
							topLeft: hookInfo.topLeft,
							tpx: hookInfo.tpx,
                            tpy: hookInfo.tpy,
                            gmx: {mInPixel: gmx.mInPixel},
                            clipPolygons: _this._gmx._clipPolygons
                        });
                    }
                });
            }
        }
        return this;
    },

    removeClipPolygon: function (polygon) {
        var id = L.stamp(polygon);
        if (this._gmx._clipPolygons) {
            delete this._gmx._clipPolygons[id];
            if (Object.keys(this._gmx._clipPolygons).length === 0) {
                this._gmx.dataManager.removeTileFilteringHook();
                this._gmx.dataManager.removeFilter('clipFilter');
            }
        }
        return this;
    }
});
})();
