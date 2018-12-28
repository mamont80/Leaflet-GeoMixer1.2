var styleCanvasKeys = ['strokeStyle', 'fillStyle', 'lineWidth'],
    styleCanvasKeysLen = styleCanvasKeys.length,
    utils = gmxAPIutils;

var setCanvasStyle = function(prop, indexes, ctx, style) {
    for (var i = 0; i < styleCanvasKeysLen; i++) {
        var key = styleCanvasKeys[i],
            valKey = style[key];
        if (valKey !== ctx[key]) {
            ctx[key] = valKey;
        }
    }
    if (style.dashArray) {
        var dashes = style.dashArray,
            dashOffset = style.dashOffset || 0;
        if ('setLineDash' in ctx) {
            ctx.setLineDash(dashes);
            if (ctx.lineDashOffset !== dashOffset) {
                ctx.lineDashOffset = dashOffset;
            }
        }
    } else if ('getLineDash' in ctx && ctx.getLineDash().length > 0) {
        ctx.setLineDash([]);
    }
    if (ctx.lineCap !== 'round') { ctx.lineCap = 'round'; }
    if (ctx.lineJoin !== 'round') { ctx.lineJoin = 'round'; }

    if (style.canvasPattern) {
        ctx.fillStyle = ctx.createPattern(style.canvasPattern.canvas, 'repeat');
    } else if (style.fillLinearGradient) {
        var rgr = style.fillLinearGradient,
            x1 = rgr.x1Function ? rgr.x1Function(prop, indexes) : rgr.x1,
            y1 = rgr.y1Function ? rgr.y1Function(prop, indexes) : rgr.y1,
            x2 = rgr.x2Function ? rgr.x2Function(prop, indexes) : rgr.x2,
            y2 = rgr.y2Function ? rgr.y2Function(prop, indexes) : rgr.y2,
            lineargrad = ctx.createLinearGradient(x1, y1, x2, y2);
        for (var j = 0, len = rgr.addColorStop.length; j < len; j++) {
            var arr1 = rgr.addColorStop[j],
                arrFunc = rgr.addColorStopFunctions[j],
                p0 = (arrFunc[0] ? arrFunc[0](prop, indexes) : arr1[0]),
                p2 = (arr1.length < 3 ? 100 : (arrFunc[2] ? arrFunc[2](prop, indexes) : arr1[2])),
                p1 = utils.dec2color(arrFunc[1] ? arrFunc[1](prop, indexes) : arr1[1], p2 > 1 ? p2 / 100 : p2);
            lineargrad.addColorStop(p0, p1);
        }
        ctx.fillStyle = style.fillStyle = lineargrad;
    }
};

/*
geoItem
     properties: объект (в формате векторного тайла)
     dataOption: дополнительные свойства объекта
item
     skipRasters: скрыть растр
     currentStyle: текущий canvas стиль объекта
     parsedStyleKeys: стиль прошедший парсинг
options
     ctx: canvas context
     tbounds: tile bounds
     tpx: X смещение тайла
     tpy: Y смещение тайла
     gmx: ссылка на layer._gmx
        //gmx.currentZoom
        gmx.lastHover
        gmx.tileAttributeIndexes
     bgImage: растр для background
     rasters: растры по объектам для background
currentStyle
    текущий стиль
style
    стиль в новом формате
    style.image - для type='image' (`<HTMLCanvasElement || HTMLImageElement>`)
*/
L.gmxUtil.drawGeoItem = function(geoItem, item, options, currentStyle, style) {
    var propsArr = geoItem.properties,
        idr = propsArr[0],
        i, len, j, len1,
        gmx = options.gmx,
        ctx = options.ctx,
        geom = propsArr[propsArr.length - 1],
        coords = null,
        dataOption = geoItem.dataOption,
        rasters = options.rasters || {},
        tbounds = options.tbounds;

    item.currentStyle = L.extend({}, currentStyle);
    if (style) {
        if (gmx.styleHook) {
            if (!geoItem.styleExtend) {
				item.ctx = ctx;
                geoItem.styleExtend = gmx.styleHook(item, gmx.lastHover && idr === gmx.lastHover.id);
            }
            if (geoItem.styleExtend) {
				if (typeof(geoItem.styleExtend.strokeStyle) === 'number') {
					geoItem.styleExtend.strokeStyle = gmxAPIutils.dec2color(geoItem.styleExtend.strokeStyle, 1);
				}
				if (typeof(geoItem.styleExtend.fillStyle) === 'number') {
					geoItem.styleExtend.fillStyle = gmxAPIutils.dec2color(geoItem.styleExtend.fillStyle, 1);
				}
                item.currentStyle = L.extend(item.currentStyle, geoItem.styleExtend);
            } else {
                return false;
            }
        }
        setCanvasStyle(propsArr, gmx.tileAttributeIndexes, ctx, item.currentStyle);
    } else {
        style = {};
    }

    var geoType = geom.type.toUpperCase(),
        dattr = {
            gmx: gmx,
            item: item,
            style: style,
            styleExtend: geoItem.styleExtend || {},
            ctx: ctx,
			topLeft: options.topLeft,
            tpx: options.tpx,
            tpy: options.tpy
        };

    if (geoType === 'POINT') {
        dattr.pointAttr = utils.getPixelPoint(dattr, geom.coordinates);
        if (!dattr.pointAttr) { return false; }   // point not in canvas tile
    }
    if (geoType === 'POINT' || geoType === 'MULTIPOINT') { // Отрисовка геометрии точек
        coords = geom.coordinates;
        if ('iconColor' in style && style.image && !L.gmxUtil.isIE11) {
            if (style.lastImage !== style.image) {
                style.lastImage = style.image;
                style.lastImageData = utils.getImageData(style.image);
            }
            dattr.imageData = style.lastImageData;
        }

        if (geoType === 'MULTIPOINT') {
            for (i = 0, len = coords.length; i < len; i++) {
                dattr.coords = coords[i];
                utils.pointToCanvas(dattr);
            }
        } else {
            dattr.coords = coords;
            utils.pointToCanvas(dattr);
        }
    } else if (geoType === 'POLYGON' || geoType === 'MULTIPOLYGON') {
        if (style.image) { // set MULTIPOLYGON as marker
            dattr.coords = [(dataOption.bounds.min.x + dataOption.bounds.max.x) / 2, (dataOption.bounds.min.y + dataOption.bounds.max.y) / 2];
            dattr.pointAttr = utils.getPixelPoint(dattr, dattr.coords);
            if (dattr.pointAttr) {
                utils.pointToCanvas(dattr);
            }
        } else {
            coords = geom.coordinates;
            if (geoType === 'POLYGON') { coords = [coords]; }

            var hiddenLines = dataOption.hiddenLines || [],
                pixelsMap = dataOption.pixels,
                flagPixels = true;

// console.log('pixelsMap', gmx.currentZoom, pixelsMap);
            if (!pixelsMap || pixelsMap.z !== options.topLeft.tilePoint.z) {
                pixelsMap = dataOption.pixels = utils.getCoordsPixels({
                    gmx: gmx,
                    coords: coords,
					topLeft: options.topLeft,
                    tpx: options.tpx,
                    tpy: options.tpy,
                    hiddenLines: hiddenLines
                });
            }

            var coordsToCanvas = function(func, flagFill) {
                coords = pixelsMap.coords;
                hiddenLines = pixelsMap.hidden || [];
                dattr.flagPixels = flagPixels;
                for (i = 0, len = coords.length; i < len; i++) {
                    var coords1 = coords[i];
                    var hiddenLines1 = hiddenLines[i] || [];
                    ctx.beginPath();
                    for (j = 0, len1 = coords1.length; j < len1; j++) {
                        dattr.coords = coords1[j];
                        dattr.hiddenLines = hiddenLines1[j] || [];
                        func(dattr);
                    }
                    ctx.closePath();
                    if (flagFill) { ctx.fill(); }
                }
            };
            var strokeStyle = item.currentStyle.strokeStyle || style.strokeStyle,
                lineWidth = item.currentStyle.lineWidth || style.lineWidth;
            if (strokeStyle && lineWidth) {
                coordsToCanvas(utils.polygonToCanvas);
            }
            if (options.bgImage) {
                dattr.bgImage = options.bgImage;
            } else if (rasters[idr]) {
                dattr.bgImage = rasters[idr];
            }
            if (dattr.styleExtend.skipRasters || item.skipRasters) {
                delete dattr.bgImage;
            }
            if (style.imagePattern) {
                item.currentStyle.fillStyle = ctx.createPattern(style.imagePattern, 'repeat');
            } else if (dattr.bgImage && tbounds.intersectsWithDelta(dataOption.bounds, -1, -1)) {
                if (utils.isPatternNode(dattr.bgImage)) {
                    if ('rasterOpacity' in gmx) { ctx.globalAlpha = gmx.rasterOpacity; }
                    ctx.fillStyle = ctx.createPattern(dattr.bgImage, 'no-repeat');
                    style.bgImage = true;
                }
                coordsToCanvas(utils.polygonToCanvasFill, true);
                ctx.globalAlpha = 1;
            }
            if (item.currentStyle.fillStyle || item.currentStyle.canvasPattern) {
                ctx.fillStyle = item.currentStyle.canvasPattern || item.currentStyle.fillStyle;
                coordsToCanvas(utils.polygonToCanvasFill, true);
            }
        }
    } else if (geoType === 'LINESTRING' || geoType === 'MULTILINESTRING') {
        coords = geom.coordinates;
        if (geoType === 'LINESTRING') { coords = [coords]; }
        var st = item.currentStyle || item.parsedStyleKeys;
        var isIconPath = st.iconPath || st.iconPath;
        var size = (item.currentStyle.maxSize || item.currentStyle.lineWidth) / options.topLeft.mInPixel;
        for (i = 0, len = coords.length; i < len; i++) {
			if (isIconPath) {
				var arr = tbounds.clipPolyLine(coords[i], true, size);
				for (j = 0, len1 = arr.length; j < len1; j++) {
					dattr.coords = arr[j];
					var pixels = utils.lineToCanvas(dattr);
					if (pixels) {
						ctx.save();
						utils.lineToCanvasAsIcon(pixels, dattr);
						ctx.restore();
					}
				}
			} else {
				dattr.coords = coords[i];
				utils.lineToCanvas(dattr);
			}
        }
    }
    return true;
};
