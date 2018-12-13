L.gmx.VectorLayer.include({
    _gmxFirstObjectsByPoint: function (geoItems, mercPoint, bounds) {    // Получить верхний объект по координатам mouseClick
        var gmx = this._gmx,
            mInPixel = gmx.mInPixel,
            j,
            len;

        for (var i = geoItems.length - 1; i >= 0; i--) {
            var geoItem = geoItems[i].properties,
                idr = geoItem[0],
                dataOption = geoItems[i].dataOption || {},
                item = geoItems[i],

                // item = gmx.dataManager.getItem(idr),
                currentStyle = item.currentStyle || item.parsedStyleKeys || {},
                iconScale = currentStyle.iconScale || 1,
                iconCenter = currentStyle.iconCenter,
                iconAnchor = !iconCenter && currentStyle.iconAnchor ? currentStyle.iconAnchor : null,
                parsedStyle = gmx.styleManager.getObjStyle(item),
                lineWidth = currentStyle.lineWidth || parsedStyle.lineWidth || parsedStyle.weight || 0,
                sx = lineWidth + (parsedStyle.sx || currentStyle.sx || parsedStyle.iconSize || 0),
                sy = lineWidth + (parsedStyle.sy || currentStyle.sy || parsedStyle.iconSize || 0),
                offset = [
                    iconScale * sx / 2,
                    iconScale * sy / 2
                ],
                point = mercPoint,
                geom = geoItem[geoItem.length - 1],
                type = geom.type;

            if (type === 'POINT' && parsedStyle.type === 'circle') {
                offset[0] *= 2;
                offset[1] *= 2;
            }
            var radius = offset[0],
                objBounds = gmxAPIutils.bounds()
                    .extendBounds(dataOption.bounds)
                    .addBuffer(offset[0] / mInPixel, offset[1] / mInPixel);
            if (iconAnchor) {
                offset = [
                    iconAnchor[0] - offset[0],
                    iconAnchor[1] - offset[1]
                ];
                point = [
                    mercPoint[0] + offset[0] / mInPixel,
                    mercPoint[1] - offset[1] / mInPixel
                ];
            }
            if (!objBounds.contains(point)) { continue; }

            var fill = currentStyle.fillStyle || currentStyle.canvasPattern || parsedStyle.bgImage || parsedStyle.fillColor,
                marker = parsedStyle && parsedStyle.image ? parsedStyle.image : null,
                chktype = type,
                hiddenLines = dataOption.hiddenLines || [],
                boundsArr = dataOption.boundsArr,
                coords = geom.coordinates,
                nodePoint = null,
                ph = {
                    point: mercPoint,
                    bounds: bounds,
                    coords: coords,
                    boundsArr: boundsArr
                };

            if (type === 'MULTIPOLYGON' || type === 'POLYGON') {
                if (marker) {
                    chktype = 'POINT';
                } else if (!fill) {
                    if (type === 'POLYGON') {
                        chktype = 'MULTILINESTRING';
                        hiddenLines = hiddenLines[0];
                    } else {
                        chktype = 'LIKEMULTILINESTRING';
                    }
                    ph.hidden = hiddenLines;
                }
            }

            if (chktype === 'LINESTRING') {
                if (!gmxAPIutils.isPointInPolyLine(mercPoint, lineWidth / mInPixel, coords)) {
                    nodePoint = gmxAPIutils.bounds([point]).addBuffer(offset[0] / mInPixel, offset[1] / mInPixel).isNodeIntersect(coords);
                    if (nodePoint === null) { continue; }
                }
            } else if (chktype === 'LIKEMULTILINESTRING') {
                ph.delta = lineWidth / mInPixel;
                var flag = false;
                for (j = 0, len = coords.length; j < len; j++) {
                    ph.coords = coords[j];
                    ph.hidden = hiddenLines ? hiddenLines[j] : null;
                    ph.boundsArr = boundsArr[j];
                    if (gmxAPIutils.isPointInLines(ph)) {
                        flag = true;
                        break;
                    }
                }
                if (!flag) { continue; }
            } else if (chktype === 'MULTILINESTRING') {
                ph.delta = lineWidth / mInPixel;
                ph.hidden = hiddenLines;
                if (!gmxAPIutils.isPointInLines(ph)) {
                    var pBounds = gmxAPIutils.bounds([point]).addBuffer(offset[0] / mInPixel, offset[1] / mInPixel);
                    for (j = 0, len = coords.length; j < len; j++) {
                        nodePoint = pBounds.isNodeIntersect(coords[j]);
                        if (nodePoint !== null) {
                            nodePoint.ring = j;
                            break;
                        }
                    }
                    if (nodePoint === null) { continue; }
                }
            } else if (chktype === 'MULTIPOLYGON' || chktype === 'POLYGON') {
                var chkPoint = mercPoint;
                flag = false;
                if (chktype === 'POLYGON') {
                    coords = [geom.coordinates];
                    boundsArr = [dataOption.boundsArr];
                }
                for (j = 0, len = coords.length; j < len; j++) {
                    var arr = coords[j],
                        bbox = boundsArr[j];
                    for (var j1 = 0, len1 = arr.length; j1 < len1; j1++) {
                        var b = bbox[j1];
                        if (b.intersects(bounds)) {
                            if (gmxAPIutils.isPointInPolygonWithHoles(chkPoint, arr)) {
                                flag = j1 === 0 ? true : false;
                                break;
                            }
                        }
                    }
                }
                if (!flag) { continue; }
            } else if (chktype === 'POINT') {
                if (parsedStyle.type === 'circle') {
                    var x = (coords[0] - point[0]) * mInPixel,
                        y = (coords[1] - point[1]) * mInPixel;
                    if (x * x + y * y > radius * radius) { continue; }
                }
            }
            if (!this.isPointInClipPolygons(mercPoint)) {
                continue;
            }

            return {
                id: idr,
                item: item,
                properties: item.properties,
                geometry: geom,
                bounds: item.bounds,
                nodePoint: nodePoint,
                offset: iconAnchor ? offset : null,
                parsedStyle: parsedStyle
            };
        }
        return null;
    },

    gmxEventCheck: function (ev, skipOver) {
        if (!this._map) {
            return 0;
        }
        var layer = this,
            gmx = layer._gmx,
            type = ev.type,
            lastHover = gmx.lastHover,
            chkHover = function (evType) {
                if (lastHover && type === 'mousemove') {
                    if (evType && layer.hasEventListeners(evType)) {
                        ev.gmx = lastHover;
                        layer.fire(evType, ev);
                    }
                    if (lastHover.hoverDiff) { layer.redrawItem(lastHover.id); }
                }
            };

        var zoom = this._map.getZoom();
        if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
            skipOver = true;
        }
        if (skipOver) {
            if (lastHover) { lastHover.prevId = null; }
            chkHover('mouseout');
            gmx.lastHover = null;
        } else if (
            this.hasEventListeners('mouseover') ||
            this.hasEventListeners('mouseout') ||
            this.hasEventListeners(type) ||
            (type === 'mousemove' && gmx.properties.fromType !== 'Raster')
            ) {

            var lng = ev.latlng.lng % 360,
                latlng = new L.LatLng(ev.latlng.lat, lng + (lng < -180 ? 360 : (lng > 180 ? -360 : 0))),
				crs = gmx.srs == 3857 ? L.CRS.EPSG3857 : L.Projection.Mercator,
                point = crs.project(latlng)._subtract(
                    {x: gmx.shiftXlayer || 0, y: gmx.shiftYlayer || 0}
                ),
                delta = Math.max(5, gmx.styleManager._getMaxStyleSize(zoom)) / gmx.mInPixel,
                mercatorPoint = [point.x, point.y],
				filters = gmx.dataManager.getViewFilters('screen', gmx.layerID);

            //создаём observer только для того, чтобы сделать выборку данных вокруг курсора
            var observerOptions = {
                type: 'resend',
				layerID: gmx.layerID,
				needBbox: gmx.needBbox,
                bbox: gmxAPIutils.bounds([mercatorPoint]).addBuffer(delta),
                dateInterval: gmx.layerType === 'VectorTemporal' ? [gmx.beginDate, gmx.endDate] : null,
                filters: ['clipFilter', 'userFilter_' + gmx.layerID, 'styleFilter', 'userFilter'].concat(filters),
                active: false //делаем его неактивным, так как потом будем явно выбирать данные
            };
            if (this.options.isGeneralized) {
                observerOptions.targetZoom = zoom;
            }

            gmx.dataManager.addObserver(observerOptions, 'hover');

            var geoItems = gmx.dataManager.getItems('hover');

            gmx.dataManager.removeObserver('hover');

            if (geoItems && geoItems.length) {
                if (geoItems.length > 1 && gmx.sortItems) { geoItems = this.getSortedItems(geoItems); }

                var target = this._gmxFirstObjectsByPoint(geoItems, mercatorPoint, observerOptions.bbox);
                if (target) {
                    var idr = target.id,
						item = target.item,
                        // item = gmx.dataManager.getItem(idr),
                        prevId = lastHover ? lastHover.id : null,
                        changed = !lastHover || lastHover.id !== idr;
                    if (type === 'mousemove' && lastHover) {
                        if (!changed) {
                            ev.gmx = lastHover;
                            this.fire(type, ev);
                            return idr;
                        } else {
							ev.gmx = lastHover;
							this.fire('mouseout', ev);
                        }
                        chkHover(item.currentFilter !== lastHover.currentFilter ? 'mouseout' : '');
                        gmx.lastHover = null;
                    }

                    ev.gmx = L.extend(this.getHoverOption(item), {
                        targets: geoItems,
                        nodePoint: target.nodePoint,
                        prevId: prevId,
                        hoverDiff: item.hoverDiff
                    });
                    if (this.hasEventListeners(type)) { this.fire(type, ev); }
                    if (type === 'mousemove' && changed) {
                        lastHover = gmx.lastHover = ev.gmx;
                        chkHover('mouseover');
                        gmx.lastMouseover = gmx.lastHover;
                    }
                    this._map.doubleClickZoom.disable();
                    return idr;
				}
            }
        }
		if (!this._map.doubleClickZoom.enabled()) {
			this._map.doubleClickZoom.enable();
		}
        return 0;
    },

    getHoverOption: function (item) {
        return {
            layer: this,
            target: item,
            balloonData: this._gmx.styleManager.getItemBalloon(item),
            properties: this.getItemProperties(item.properties),
            currentFilter: item.currentFilter || 0,
            id: item.id
        };
    }
});
