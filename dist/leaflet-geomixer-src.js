/*
 Leaflet-GeoMixer, Leaflet plugin for visualization data from GeoMixer server
 (c) 2013-2016, RDC ScanEx
*/
(function () {
"use strict";
var L;
if (typeof module !== 'undefined' && module.exports) {
    L = require('leaflet');
    L.gmx = {};
    module.exports = L.gmx;
} else {
    L = window.L;
}


/**
* @name L.gmxUtil
* @namespace
*/
var gmxAPIutils = {
    lastMapId: 0,
	debug: (function() { var arr = /\bdebug=(\d)\b/.exec(location.search); return arr ? Number(arr[1]) : false; })(),
	fromWebMercY: function(y) {
		return 90 * (4 * Math.atan(Math.exp(y / gmxAPIutils.rMajor)) / Math.PI - 1);
	},

    newId: function()
    {
        gmxAPIutils.lastMapId += 1;
        return '_' + gmxAPIutils.lastMapId;
    },

    uniqueGlobalName: function(thing) {
        var id = gmxAPIutils.newId();
        window[id] = thing;
        return id;
    },

    _apiLoadedFrom: null,
    apiLoadedFrom: function(scr) {
		if (gmxAPIutils._apiLoadedFrom === null) {
			var str = document.currentScript ? document.currentScript.src : gmxAPIutils._searchApiScriptUrl(scr);
			gmxAPIutils._apiLoadedFrom = str ? str.substring(0, str.lastIndexOf('/')) : '';
		}
		return gmxAPIutils._apiLoadedFrom;
	},
    _searchApiScriptUrl: function(scr) {
		var scriptRegexp = scr ? [
			new RegExp('\b'+ scr + '\b')
		] : [
			/\bleaflet-geomixer(-\w*)?\.js\b/,
			/\bgeomixer(-\w*)?\.js\b/
		];

        var scripts = document.getElementsByTagName('script');
        for (var i = 0, len = scripts.length; i < len; i++) {
            var src = scripts[i].getAttribute('src');
			for (var j = 0, len1 = scriptRegexp.length; j < len1; j++) {
				if (scriptRegexp[j].exec(src)) {
					gmxAPIutils._apiLoadedFrom = src.split('?')[0];
					break;
				}
            }
			if (gmxAPIutils._apiLoadedFrom) {
				break;
			}
        }
        return gmxAPIutils._apiLoadedFrom || '';
    },
    searchScriptAPIKey: function() {
		for (var i = 0, params = gmxAPIutils._searchApiScriptUrl(), len = params.length; i < len; i++) {
			var parsedParam = params[i].split('=');
			if (parsedParam[0] === 'key') {
				return parsedParam[1];
			}
		}
        return '';
    },

    createWorker: function(url)	{		// Создание Worker-а
        return new Promise(function(resolve, reject) {
			if ('createImageBitmap' in window && 'Worker' in window) {
				if (url.indexOf(location.origin) === 0) {
					resolve(new Worker(url));
				} else {
					fetch(url, {mode: 'cors'})
					.then(function(resp) { return resp.blob(); })
					.then(function(blob) {
						resolve(new Worker(window.URL.createObjectURL(blob, {type: 'application/javascript; charset=utf-8'})));
					});
				}
			} else {
				reject({error: 'Browser don`t support `createImageBitmap` or `Worker`'});
			}
		});
    },

    isPageHidden: function()	{		// Видимость окна браузера
        return document.hidden || document.msHidden || document.webkitHidden || document.mozHidden || false;
    },

    normalizeHostname: function(hostName) {
        var parsedHost = L.gmxUtil.parseUri((hostName.substr(0, 4) !== 'http' ? L.gmxUtil.protocol + '//' : '') + hostName); // Bug in gmxAPIutils.parseUri for 'localhost:8000'

        hostName = parsedHost.host + parsedHost.directory;

        if (hostName[hostName.length - 1] === '/') {
            hostName = hostName.substring(0, hostName.length - 1);
        }

        return hostName;
    },

	getLayerItemFromServer: function(options) {
        var query = options.query ? options.query : '[' + options.field + ']=' + options.value,
			kosmosnimkiURL = L.gmxUtil.protocol + '//maps.kosmosnimki.ru/',
            req = {
                WrapStyle: 'func',
                geometry: true,
                layer: options.layerID,
                query: query
            };
        if (options.border) { req.border = options.border; }
        return gmxAPIutils.requestJSONP(
            options.url || (window.serverBase || kosmosnimkiURL) + 'VectorLayer/Search.ashx',
            req,
            options
        );
    },

	getCadastreFeatures: function(options) {
		// example: L.gmxUtil.getCadastreFeatures({latlng: L.latLng(48.350039, 45.152757), callbackParamName: 'callback'});
        if (options.latlng) {
			var latlng = options.latlng,
				req = {
					WrapStyle: 'func',
					text: (latlng.lat + ' ' + latlng.lng).replace(/\./g, ','),
					tolerance: options.tolerance || 0
				};
			return gmxAPIutils.requestJSONP(
				options.url || 'http://pkk5.rosreestr.ru/api/features/',
				req,
				options
			);
		} else {
			return null;
		}
    },

	getFormData: function(json) {
		var arr = [];
		for (var key in json) {
			var val = json[key];
			arr.push(key + '=' + (typeof val === 'object' ? JSON.stringify(val) : val));
		}
		return arr.join('&');
    },

	requestLink: function(url, params, options) {
        options = options || {};
		return new Promise(function(resolve, reject) {
			var script = null;
			if (url.indexOf('.css') === -1) {
				script = document.createElement('script');
				script.setAttribute('charset', 'UTF-8');
				var urlParams = L.extend({}, params, L.gmx.gmxMapManager.syncParams),
					paramsStringItems = [];

				for (var p in urlParams) {
					paramsStringItems.push(p + '=' + encodeURIComponent(urlParams[p]));
				}
				var src = url + (url.indexOf('?') === -1 ? '?' : '&') + paramsStringItems.join('&'),
					clearTag = function(err) {
						L.gmxUtil.loaderStatus(src, true);
						script.parentNode.removeChild(script);
						if (err) {
							reject(url);
							console.warn('Not found script:', url);
						} else {
							resolve(url, params, options);
						}
					};

				script.onerror = clearTag;
				script.onload = function() {
					clearTag();
				};
				L.gmxUtil.loaderStatus(src, null, 'vector');
				script.setAttribute('src', src);
			} else {
				script = document.createElement('link');

				script.rel   = 'stylesheet';
				script.type  = 'text/css';
				//link.media = options.media || 'screen';
				script.href  = url;
				resolve(url, params, options);
			}
			document.getElementsByTagName('head').item(0).appendChild(script);
		});
    },

    /** Sends JSONP requests
     * @memberof L.gmxUtil
     * @param {String} url - request URL
     * @param {Object} params - request params
     * @param {Object} [options] - additional request options
     * @param {String} [options.callbackParamName=CallbackName] - Name of param, that will be used for callback id.
       If callbackParamName is set to null, no params will be added (StaticJSONP)
     * @return {Deferred} Promise with server JSON response or with error status
    */
	requestJSONP: function(url, params, options) {
        options = options || {};
        var def = new L.gmx.Deferred();

        var script = document.createElement('script');
        script.setAttribute('charset', 'UTF-8');
        var callbackParamName = 'callbackParamName' in options ? options.callbackParamName : 'CallbackName';
        var urlParams = L.extend({}, params, L.gmx.gmxMapManager.syncParams);

        if (callbackParamName) {
            var callbackName = gmxAPIutils.uniqueGlobalName(function(obj) {
                delete window[callbackName];
                def.resolve(obj, options);
            });

            urlParams[callbackParamName] = callbackName;
        }

        var paramsStringItems = [];

        for (var p in urlParams) {
            paramsStringItems.push(p + '=' + encodeURIComponent(urlParams[p]));
        }

        var src = url + (url.indexOf('?') === -1 ? '?' : '&') + paramsStringItems.join('&');

        script.onerror = function(e) {
            def.reject(e);
            L.gmxUtil.loaderStatus(src, true);
            script.parentNode.removeChild(script);
        };
        script.onload = function() {
            L.gmxUtil.loaderStatus(src, true);
            script.parentNode.removeChild(script);
        };
        L.gmxUtil.loaderStatus(src, null, 'vector');
        script.setAttribute('src', src);

        document.getElementsByTagName('head').item(0).appendChild(script);
        return def;
    },
    getXmlHttp: function() {
        var xmlhttp;
        if (typeof XMLHttpRequest !== 'undefined') {
            xmlhttp = new XMLHttpRequest();
        } else {
          try {
            xmlhttp = new ActiveXObject('Msxml2.XMLHTTP');
          } catch (e) {
            try {
              xmlhttp = new ActiveXObject('Microsoft.XMLHTTP');
            } catch (E) {
              xmlhttp = false;
            }
          }
        }
        return xmlhttp;
    },
    request: function(ph) { // {'type': 'GET|POST', 'url': 'string', 'callback': 'func'}
        var xhr = gmxAPIutils.getXmlHttp();
        if (xhr) {
            xhr.open((ph.type ? ph.type : 'GET'), ph.url, ph.async || false);
            if (ph.headers) {
                for (var key in ph.headers) {
                    xhr.setRequestHeader(key, ph.headers[key]);
                }
            }
            var reqId = L.gmxUtil.loaderStatus(ph.url);
            if (ph.async) {
                if (ph.withCredentials) {
                    xhr.withCredentials = true;
                }
                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        L.gmxUtil.loaderStatus(reqId, true);
                        if (xhr.status === 200) {
                            ph.callback(xhr.responseText);
                            xhr = null;
                        } else if (ph.onError) {
                            ph.onError(xhr);
                        }
                    }
                };
            }
			var params = null;
			if (ph.params) {
				params = ph.params;
				var syncParams = L.gmx.gmxMapManager.getSyncParams(true);
				if (syncParams) {
					params += '&' + syncParams;
				}
			}
            xhr.send(params);
            if (!ph.async && xhr.status === 200) {
                ph.callback(xhr.responseText);
                L.gmxUtil.loaderStatus(reqId, true);
                return xhr.status;
            }
            return true;
        }
        if (ph.onError) {
            ph.onError({Error: 'bad XMLHttpRequest!'});
        }
        return false;
    },

    tileSizes: [], // Размеры тайла по zoom
    getTileNumFromLeaflet: function (tilePoint, zoom) {
        if ('z' in tilePoint) {
            zoom = tilePoint.z;
        }
        var pz = Math.pow(2, zoom),
            tx = tilePoint.x % pz + (tilePoint.x < 0 ? pz : 0),
            ty = tilePoint.y % pz + (tilePoint.y < 0 ? pz : 0);
        return {
            z: zoom,
            x: tx % pz - pz / 2,
            y: pz / 2 - 1 - ty % pz
        };
    },

	getTilePosZoomDelta: function(tilePoint, zoomFrom, zoomTo) {		// получить смещение тайла на меньшем zoom
        var dz = Math.pow(2, zoomFrom - zoomTo),
            size = 256 / dz,
            dx = tilePoint.x % dz,
            dy = tilePoint.y % dz;
		return {
			size: size,
			zDelta: dz,
			x: size * dx,
			y: size * dy
		};
    },

    isItemIntersectBounds: function(geo, bounds) {
        var type = geo.type,
            coords = geo.coordinates;
        if (type === 'POLYGON' || type === 'Polygon') {
			coords = [coords];
		}

		for (var j = 0, len1 = coords.length; j < len1; j++) {
			for (var i = 0, len = coords[j].length; i < len; i++) {
				if (bounds.clipPolygon(coords[j][i]).length) {
					return true;
				}
			}
		}
		return false;
    },

    geoItemBounds: function(geo) {  // get item bounds array by geometry
        if (!geo) {
            return {
                bounds: null,
                boundsArr: []
            };
        }
        var type = geo.type,
            coords = geo.coordinates,
            b = null,
            i = 0,
            len = 0,
            bounds = null,
            boundsArr = [];
        if (type === 'MULTIPOLYGON' || type === 'MultiPolygon') {
            bounds = gmxAPIutils.bounds();
            for (i = 0, len = coords.length; i < len; i++) {
                var arr1 = [];
                for (var j = 0, len1 = coords[i].length; j < len1; j++) {
                    b = gmxAPIutils.bounds(coords[i][j]);
                    arr1.push(b);
                    if (j === 0) { bounds.extendBounds(b); }
                }
                boundsArr.push(arr1);
            }
        } else if (type === 'POLYGON' || type === 'Polygon') {
            bounds = gmxAPIutils.bounds();
            for (i = 0, len = coords.length; i < len; i++) {
                b = gmxAPIutils.bounds(coords[i]);
                boundsArr.push(b);
                if (i === 0) { bounds.extendBounds(b); }
            }
        } else if (type === 'POINT' || type === 'Point') {
            bounds = gmxAPIutils.bounds([coords]);
        } else if (type === 'MULTIPOINT' || type === 'MultiPoint') {
            bounds = gmxAPIutils.bounds();
            for (i = 0, len = coords.length; i < len; i++) {
                b = gmxAPIutils.bounds([coords[i]]);
                bounds.extendBounds(b);
            }
        } else if (type === 'LINESTRING' || type === 'LineString') {
            bounds = gmxAPIutils.bounds(coords);
            //boundsArr.push(bounds);
        } else if (type === 'MULTILINESTRING' || type === 'MultiLineString') {
            bounds = gmxAPIutils.bounds();
            for (i = 0, len = coords.length; i < len; i++) {
                b = gmxAPIutils.bounds(coords[i]);
                bounds.extendBounds(b);
                //boundsArr.push(b);
            }
        }
        return {
            bounds: bounds,
            boundsArr: boundsArr
        };
    },

    getUnFlattenGeo: function(geo) {  // get unFlatten geometry
        var type = geo.type,
            isLikePolygon = type.indexOf('POLYGON') !== -1 || type.indexOf('Polygon') !== -1,
            coords = geo.coordinates,
            coordsOut = coords;

        if (isLikePolygon) {
            coordsOut = [];
            var isPolygon = type === 'POLYGON' || type === 'Polygon';
            if (isPolygon) { coords = [coords]; }
            for (var i = 0, len = coords.length; i < len; i++) {
                var ring = [];
                for (var j = 0, len1 = coords[i].length; j < len1; j++) {
                    ring[j] = gmxAPIutils.unFlattenRing(coords[i][j]);
                }
                coordsOut.push(ring);
            }
            if (isPolygon) { coordsOut = coordsOut[0]; }
        }
        return {type: type, coordinates: coordsOut};
    },

    unFlattenRing: function(arr) {
        if (typeof arr[0] !== 'number') {
            return arr;
        }
        var len = arr.length,
            cnt = 0,
            res = new Array(len / 2);

        for (var i = 0; i < len; i += 2) {
            res[cnt++] = [arr[i], arr[i + 1]];
        }
        return res;
    },

    geoFlatten: function(geo) {  // get flatten geometry
        var type = geo.type,
            isLikePolygon = type.indexOf('POLYGON') !== -1 || type.indexOf('Polygon') !== -1,
            isPolygon = type === 'POLYGON' || type === 'Polygon',
            coords = geo.coordinates;

        if (isLikePolygon) {
            if (isPolygon) { coords = [coords]; }
            for (var i = 0, len = coords.length; i < len; i++) {
                for (var j = 0, len1 = coords[i].length; j < len1; j++) {
                    coords[i][j] = gmxAPIutils.flattenRing(coords[i][j]);
                }
            }
        }
    },

    flattenRing: function(arr) {
        var len = arr.length,
            cnt = 0,
            CurArray = typeof Float64Array === 'function' ? Float64Array : Array,
            res = new CurArray(2 * len);

        for (var i = 0; i < len; i++) {
            res[cnt++] = arr[i][0];
            res[cnt++] = arr[i][1];
        }
        return res;
    },

    /** Check rectangle type by coordinates
     * @memberof L.gmxUtil
     * @param {coordinates} coordinates - geoJSON coordinates data format
     * @return {Boolean}
    */
    isRectangle: function(coords) {
        return (coords && coords[0] && (coords[0].length === 5 || coords[0].length === 4)
            && ((coords[0][0][0] === coords[0][1][0]) || (coords[0][0][1] === coords[0][1][1]))
            && ((coords[0][1][0] === coords[0][2][0]) || (coords[0][1][1] === coords[0][2][1]))
            && ((coords[0][2][0] === coords[0][3][0]) || (coords[0][2][1] === coords[0][3][1]))
            && ((coords[0][3][0] === coords[0][0][0]) || (coords[0][3][1] === coords[0][0][1]))
        );
    },

    /** Get bounds from geometry
     * @memberof L.gmxUtil
     * @param {geometry} geometry - Geomixer or geoJSON data format
     * @return {Object} bounds
    */
    getGeometryBounds: function(geo) {
        var pt = gmxAPIutils.geoItemBounds(geo);
        return pt.bounds;
    },

    getMarkerPolygon: function(bounds, dx, dy) {
        var x = (bounds.min.x + bounds.max.x) / 2,
            y = (bounds.min.y + bounds.max.y) / 2;
        return [
            [x - dx, y - dy],
            [x - dx, y + dy],
            [x + dx, y + dy],
            [x + dx, y - dy],
            [x - dx, y - dy]
        ];
    },

    getQuicklookPointsFromProperties: function(pArr, gmx) {
        var indexes = gmx.tileAttributeIndexes;
        var points = {
                x1: gmxAPIutils.getPropItem(gmx.quicklookX1 || ('x1' in indexes ? 'x1' : 'X1'), pArr, indexes) || 0,
                y1: gmxAPIutils.getPropItem(gmx.quicklookY1 || ('y1' in indexes ? 'y1' : 'Y1'), pArr, indexes) || 0,
                x2: gmxAPIutils.getPropItem(gmx.quicklookX2 || ('x2' in indexes ? 'x2' : 'X2'), pArr, indexes) || 0,
                y2: gmxAPIutils.getPropItem(gmx.quicklookY2 || ('y2' in indexes ? 'y2' : 'Y2'), pArr, indexes) || 0,
                x3: gmxAPIutils.getPropItem(gmx.quicklookX3 || ('x3' in indexes ? 'x3' : 'X3'), pArr, indexes) || 0,
                y3: gmxAPIutils.getPropItem(gmx.quicklookY3 || ('y3' in indexes ? 'y3' : 'Y3'), pArr, indexes) || 0,
                x4: gmxAPIutils.getPropItem(gmx.quicklookX4 || ('x4' in indexes ? 'x4' : 'X4'), pArr, indexes) || 0,
                y4: gmxAPIutils.getPropItem(gmx.quicklookY4 || ('y4' in indexes ? 'y4' : 'Y4'), pArr, indexes) || 0
            },
            bounds = gmxAPIutils.bounds([
                [points.x1, points.y1],
                [points.x2, points.y2],
                [points.x3, points.y3],
                [points.x4, points.y4]
            ]);

        if (bounds.max.x === bounds.min.x || bounds.max.y === bounds.min.y) {
            return null;
        }

        if (!gmx.quicklookPlatform) {
			var crs = gmx.srs == 3857 ? L.CRS.EPSG3857 : L.Projection.Mercator;
            var merc = crs.project(L.latLng(points.y1, points.x1));
            points.x1 = merc.x; points.y1 = merc.y;
            merc = crs.project(L.latLng(points.y2, points.x2));
            points.x2 = merc.x; points.y2 = merc.y;
            merc = crs.project(L.latLng(points.y3, points.x3));
            points.x3 = merc.x; points.y3 = merc.y;
            merc = crs.project(L.latLng(points.y4, points.x4));
            points.x4 = merc.x; points.y4 = merc.y;
        }

        return points;
    },

    /** Get hash properties from array properties
     * @memberof L.gmxUtil
     * @param {Array} properties in Array format
     * @param {Object} keys indexes
     * @return {Object} properties in Hash format
    */
    getPropertiesHash: function(arr, indexes) {
        var properties = {};
        for (var key in indexes) {
            properties[key] = arr[indexes[key]];
        }
        return properties;
    },

    getPropItem: function(key, arr, indexes) {
        return key in indexes ? arr[indexes[key]] : '';
    },

    dec2rgba: function(i, a)	{				// convert decimal to rgb
        var r = (i >> 16) & 255,
            g = (i >> 8) & 255,
            b = i & 255;
		return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
	},

    dec2hex: function(i) {					// convert decimal to hex
        return (i + 0x1000000).toString(16).substr(-6);
    },

    dec2color: function(i, a)   {   // convert decimal to canvas color
        return a < 1 ? this.dec2rgba(i, a) : '#' + this.dec2hex(i);
    },

    oneDay: 60 * 60 * 24,			// один день

    isTileKeysIntersects: function(tk1, tk2) { // пересечение по номерам двух тайлов
        if (tk1.z < tk2.z) {
            var t = tk1; tk1 = tk2; tk2 = t;
        }

        var dz = tk1.z - tk2.z;
        return tk1.x >> dz === tk2.x && tk1.y >> dz === tk2.y;
	},

    rotatePoints: function(arr, angle, iconScale, center) {			// rotate - массива точек
        var out = [];
        angle *= Math.PI / 180.0;
        var sin = Math.sin(angle);
        var cos = Math.cos(angle);
        if (!iconScale) { iconScale = 1; }
        for (var i = 0; i < arr.length; i++) {
            var x = iconScale * arr[i].x - center.x;
            var y = iconScale * arr[i].y - center.y;
            out.push({
                'x': cos * x - sin * y + center.x,
                'y': sin * x + cos * y + center.y
            });
        }
        return out;
    },
    getPatternIcon: function(item, style, indexes) { // получить bitmap стиля pattern
        if (!style.fillPattern) { return null; }

        var notFunc = true,
            pattern = style.fillPattern,
            prop = item ? item.properties : null,
            step = pattern.step > 0 ? pattern.step : 0,
            patternDefaults = {
                minWidth: 1,
                maxWidth: 1000,
                minStep: 0,
                maxStep: 1000
            };
        if (pattern.patternStepFunction && prop !== null) {
            step = pattern.patternStepFunction(prop, indexes);
            notFunc = false;
        }
        if (step > patternDefaults.maxStep) {
            step = patternDefaults.maxStep;
        }
        else if (step < patternDefaults.minStep) {
            step = patternDefaults.minStep;
        }

        var size = pattern.width > 0 ? pattern.width : 8;
        if (pattern.patternWidthFunction && prop !== null) {
            size = pattern.patternWidthFunction(prop, indexes);
            notFunc = false;
        }
        if (size > patternDefaults.maxWidth) {
            size = patternDefaults.maxWidth;
        } else if (size < patternDefaults.minWidth) {
            size = patternDefaults.minWidth;
        }

        var op = style.fillOpacity;
        if (style.opacityFunction && prop !== null) {
            op = style.opacityFunction(prop, indexes) / 100;
            notFunc = false;
        }

        var rgb = [0xff0000, 0x00ff00, 0x0000ff],
            arr = (pattern.colors != null ? pattern.colors : rgb),
            count = arr.length,
            resColors = [],
            i = 0;

        for (i = 0; i < count; i++) {
            var col = arr[i];
            if (pattern.patternColorsFunction && pattern.patternColorsFunction[i] !== null) {
                col = (prop !== null ? pattern.patternColorsFunction[i](prop, indexes) : rgb[i % 3]);
                notFunc = false;
            }
            resColors.push(col);
        }
        if (count === 0) { resColors = [0]; op = 0; count = 1; }   // pattern without colors

        var delta = size + step,
            allSize = delta * count,
            center = 0,
            //radius,
            rad = 0,
            hh = allSize,				// высота битмапа
            ww = allSize,				// ширина битмапа
            type = pattern.style || 'horizontal',
            flagRotate = false;

        if (type === 'diagonal1' || type === 'diagonal2' || type === 'cross' || type === 'cross1') {
            flagRotate = true;
        } else if (type === 'circle') {
            ww = hh = 2 * delta;
            center = Math.floor(ww / 2);	// центр круга
            //radius = Math.floor(size / 2);	// радиус
            rad = 2 * Math.PI / count;		// угол в рад.
        } else if (type === 'vertical') {
            hh = 1;
        } else if (type === 'horizontal') {
            ww = 1;
        }
        if (ww * hh > patternDefaults.maxWidth) {
            console.log({'func': 'getPatternIcon', 'Error': 'MAX_PATTERN_SIZE', 'alert': 'Bitmap from pattern is too big'});
            return null;
        }

        var canvas = document.createElement('canvas');
        canvas.width = ww; canvas.height = hh;
        var ptx = canvas.getContext('2d');
        ptx.clearRect(0, 0, canvas.width, canvas.height);
        if (type === 'diagonal2' || type === 'vertical') {
            ptx.translate(ww, 0);
            ptx.rotate(Math.PI / 2);
        }

        for (i = 0; i < count; i++) {
            ptx.beginPath();
            var fillStyle = gmxAPIutils.dec2color(resColors[i], op);
            ptx.fillStyle = fillStyle;

            if (flagRotate) {
                var x1 = i * delta; var xx1 = x1 + size;
                ptx.moveTo(x1, 0); ptx.lineTo(xx1, 0); ptx.lineTo(0, xx1); ptx.lineTo(0, x1); ptx.lineTo(x1, 0);

                x1 += allSize; xx1 = x1 + size;
                ptx.moveTo(x1, 0); ptx.lineTo(xx1, 0); ptx.lineTo(0, xx1); ptx.lineTo(0, x1); ptx.lineTo(x1, 0);
                if (type === 'cross' || type === 'cross1') {
                    x1 = i * delta; xx1 = x1 + size;
                    ptx.moveTo(ww, x1); ptx.lineTo(ww, xx1); ptx.lineTo(ww - xx1, 0); ptx.lineTo(ww - x1, 0); ptx.lineTo(ww, x1);

                    x1 += allSize; xx1 = x1 + size;
                    ptx.moveTo(ww, x1); ptx.lineTo(ww, xx1); ptx.lineTo(ww - xx1, 0); ptx.lineTo(ww - x1, 0); ptx.lineTo(ww, x1);
                }
            } else if (type === 'circle') {
                ptx.arc(center, center, size, i * rad, (i + 1) * rad);
                ptx.lineTo(center, center);
            } else {
                ptx.fillRect(0, i * delta, ww, size);
            }
            ptx.closePath();
            ptx.fill();
        }
        var canvas1 = document.createElement('canvas');
        canvas1.width = ww;
        canvas1.height = hh;
        var ptx1 = canvas1.getContext('2d');
        ptx1.drawImage(canvas, 0, 0, ww, hh);
        return {'notFunc': notFunc, 'canvas': canvas1};
    },
    setSVGIcon: function(id) {
		return '<svg role="img" class="svgIcon"><use xlink:href="#' + id + '" href="#' + id + '"></use></svg>';
    },

    getSVGIcon: function (options) {
        var svg = '<svg xmlns="' + L.Path.SVG_NS + '" xmlns:xlink="http://www.w3.org/1999/xlink"',
            type = options.type,
            fill = options.fillStyle || 'rgba(255, 255, 255, 0.5)',
            stroke = options.strokeStyle || '#0000ff',
            strokeWidth = options.lineWidth || 2,
            iconOptions = {
                className: 'gmx-svg-icon'
            };

        if (options.className) {
            iconOptions.className = options.className;
        }
        var size = options.iconSize;
        iconOptions.iconSize = [size, size];
        svg += ' height = "' + size + 'px"  width = "' + size + 'px">';

        if (type === 'circle') {
            if (options.fillRadialGradient) {
                svg += '<defs><radialGradient id="myRadialGradient4" spreadMethod="pad">';
                var stopColor = options.fillRadialGradient.colorStop || options.fillRadialGradient.addColorStop
                    || [     // [%, color, opacity]
                        [0, '#ffff00', 0.8],
                        [1, '#ff0000', 0.8]
                    ];

                for (var i = 0, len = stopColor.length; i < len; i++) {
                    var it = stopColor[i];
                    svg += '<stop offset="' + (100 * it[0]) + '%"   stop-color="' + it[1] + '" stop-opacity="' + it[2] + '"/>';
                }
                svg += '</radialGradient></defs>';
                fill = 'url(#myRadialGradient4)';
                stroke = strokeWidth = null;
            }
            size /= 2;
            svg += '<g><circle cx="' + size + '" cy="' + size + '" r="' + size + '" style="';
            if (fill) { svg += ' fill:' + fill + ';'; }
            if (stroke) { svg += ' stroke:"' + stroke + ';'; }
            if (strokeWidth) { svg += ' stroke-width:"' + strokeWidth + ';'; }
            svg += ';" />';
        } else if (type === 'square') {
            svg += '<g><rect width="' + size + '" height="' + size + '" style="';
            if (fill) { svg += ' fill:' + fill + ';'; }
            if (stroke) { svg += ' stroke:' + stroke + ';'; }
            if (strokeWidth) { svg += ' stroke-width:' + 2 * strokeWidth + ';'; }
            svg += '" />';
        }
        if (options.text) {
            var text = options.text;
            svg += '<text x="50%" y="50%" dy="0.4em"';
            for (var key in text) {
                if (key !== 'count') { svg += ' ' + key + '="' + text[key] + '"'; }
            }
            svg += '>' + text.count + '</text>';
        }
        svg += '</g></svg>';
        iconOptions.html = svg;

        return new L.DivIcon(iconOptions);
    },

    toPixels: function(p, tpx, tpy, mInPixel) { // get pixel point	, topLeft
        var px1 = p[0] * mInPixel; 	px1 = (0.5 + px1) << 0;
        var py1 = p[1] * mInPixel;	py1 = (0.5 + py1) << 0;
        return [px1 - tpx, tpy - py1].concat(p.slice(2));
    },

    getPixelPoint: function(attr, coords) {
        var topLeft = attr.topLeft,
            mInPixel = topLeft.mInPixel,
            item = attr.item,
            currentStyle = item.currentStyle || item.parsedStyleKeys || {},
            style = attr.style || {},
            iconScale = currentStyle.iconScale || 1,
            iconCenter = currentStyle.iconCenter || false,
            sx = currentStyle.sx || style.sx || 4,
            sy = currentStyle.sy || style.sy || 4,
            weight = currentStyle.weight || style.weight || 0,
            iconAnchor = currentStyle.iconAnchor || style.iconAnchor || null,
			px = attr.tpx,
            py = attr.tpy;

        if (!iconCenter && iconAnchor) {
            px1 -= iconAnchor[0];
            py1 -= iconAnchor[1];
        }
        sx *= iconScale;
        sy *= iconScale;
        sx += weight;
        sy += weight;

        var py1 = py - coords[1] * mInPixel,
			px1 = coords[0] * mInPixel - px;

		if (px1 - sx > 256) {
			px1 = (coords[0] - 2 * gmxAPIutils.worldWidthMerc) * mInPixel - px;
		} else if (px1 < -sx) {
			px1 = (coords[0] + 2 * gmxAPIutils.worldWidthMerc) * mInPixel - px;
		}

        return py1 - sy > 256 || px1 - sx > 256 || px1 + sx < 0 || py1 + sy < 0
			? null :
            {
                sx: sx,
                sy: sy,
                px1: (0.5 + px1) << 0,
                py1: (0.5 + py1) << 0
            }
        ;
    },
    getImageData: function(img) {
        if (L.gmxUtil.isIE9 || L.gmxUtil.isIE10) { return null; }
        var canvas = document.createElement('canvas'),
            ww = img.width,
            hh = img.height;

        canvas.width = ww; canvas.height = hh;
        var ptx = canvas.getContext('2d');
        ptx.drawImage(img, 0, 0);
        return ptx.getImageData(0, 0, ww, hh).data;
    },
    DEFAULT_REPLACEMENT_COLOR: 0xff00ff,
    isIE: function(v) {
        return v === gmxAPIutils.getIEversion();
    },
    gtIE: function(v) {
        return v < gmxAPIutils.getIEversion();
    },

    getIEversion: function() {
        var ua = navigator.userAgent || '',
            msie = ua.indexOf('MSIE ');
        if (msie > 0) {
            // IE 10 or older => return version number
            return parseInt(ua.substring(msie + 5, ua.indexOf('.', msie)), 10);
        }

        var trident = ua.indexOf('Trident/');
        if (trident > 0) {
            // IE 11 => return version number
            var rv = ua.indexOf('rv:');
            return parseInt(ua.substring(rv + 3, ua.indexOf('.', rv)), 10);
        }

        var edge = ua.indexOf('Edge/');
        if (edge > 0) {
            // Edge (IE 12+) => return version number
            return parseInt(ua.substring(edge + 5, ua.indexOf('.', edge)), 10);
        }

        // other browser
        return -1;
    },

    replaceColor: function(img, color, fromData) {
        if (L.gmxUtil.isIE9 || L.gmxUtil.isIE10) { return img; }
        var canvas = document.createElement('canvas'),
            ww = img.width,
            hh = img.height;

        canvas.width = ww; canvas.height = hh;
        var flag = false,
            imageData,
            ptx = canvas.getContext('2d');

        if (typeof color === 'string') {
            color = parseInt('0x' + color.replace(/#/, ''));
        }
        if (color !== this.DEFAULT_REPLACEMENT_COLOR) {
            var r = (color >> 16) & 255,
                g = (color >> 8) & 255,
                b = color & 255;

            if (fromData) {
                imageData = ptx.createImageData(ww, hh);
            } else {
                ptx.drawImage(img, 0, 0);
                imageData = ptx.getImageData(0, 0, ww, hh);
                fromData = imageData.data;
            }
            var toData = imageData.data;
            for (var i = 0, len = fromData.length; i < len; i += 4) {
                if ((fromData[i] === 0xff || fromData[i] === 238)
                    && fromData[i + 1] === 0
                    && fromData[i + 2] === 0xff
                    ) {
                    toData[i] = r;
                    toData[i + 1] = g;
                    toData[i + 2] = b;
                    toData[i + 3] = fromData[i + 3];
                    flag = true;
                }
            }
        }
        if (flag) {
            ptx.putImageData(imageData, 0, 0);
        } else {
            ptx.drawImage(img, 0, 0);
        }
        return canvas;
    },

    drawIconPath: function(path, attr) { // draw iconPath in canvas
        if (!L.Util.isArray(path) || path.length < 3 || !attr.ctx) { return; }
        var trFlag = false,
            ctx = attr.ctx,
            rad = attr.radian;

        if (attr.px || attr.py) { ctx.translate(attr.px || 0, attr.py || 0); trFlag = true; }
        if (!rad && attr.rotateRes) { rad = Math.PI + gmxAPIutils.degRad(attr.rotateRes); }
        if (rad) { ctx.rotate(rad); trFlag = true; }
        ctx.moveTo(path[0], path[1]);
        for (var i = 2, len = path.length; i < len; i += 2) {
            ctx.lineTo(path[i], path[i + 1]);
        }
        if (trFlag) { ctx.setTransform(1, 0, 0, 1, 0, 0); }
    },

    pointToCanvas: function(attr) { // Точку в canvas
        var gmx = attr.gmx,
			topLeft = attr.topLeft,
            mInPixel = topLeft.mInPixel,
            pointAttr = attr.pointAttr,
            style = attr.style || {},
            item = attr.item,
            currentStyle = item.currentStyle || item.parsedStyleKeys,
            iconScale = currentStyle.iconScale || 1,
            image = currentStyle.image,
            sx = pointAttr.sx,
            sy = pointAttr.sy,
            px1 = pointAttr.px1,
            py1 = pointAttr.py1,
            px1sx = px1,
            py1sy = py1,
            ctx = attr.ctx;

        if (currentStyle.type === 'image') {
            sx = style.sx;
            sy = style.sy;
            image = style.image;
        }
        if (currentStyle.iconCenter) {
            px1sx -= sx / 2;
            py1sy -= sy / 2;
        } else if (style.type === 'circle') {
            px1 += sx / 2;
            py1 += sy / 2;
        }
        if (currentStyle.iconPath) {
            attr.px = px1;
            attr.py = py1;
            attr.rotateRes = currentStyle.rotate || 0;
        }
        if (image) {
            if ('iconColor' in currentStyle && !L.gmxUtil.isIE11) {
                image = this.replaceColor(image, currentStyle.iconColor, attr.imageData);
            }
            style.rotateRes = currentStyle.rotate || 0;
            if ('opacity' in style) { ctx.globalAlpha = currentStyle.opacity || style.opacity; }
            if (gmx.transformFlag) {
//						topLeft = attr.topLeft,
				ctx.setTransform(mInPixel, 0, 0, mInPixel, -attr.tpx, attr.tpy);
                ctx.drawImage(image, px1, -py1, sx, sy);
                ctx.setTransform(mInPixel, 0, 0, -mInPixel, -attr.tpx, attr.tpy);
            } else {
				if (iconScale !== 1) {
					sx *= iconScale;
					sy *= iconScale;
					px1 = pointAttr.px1;
					py1 = pointAttr.py1;
					px1sx = px1;
					py1sy = py1;
					if (currentStyle.iconCenter) {
						px1sx -= sx / 2;
						py1sy -= sy / 2;
					}
				}
				if (style.rotateRes) {
					ctx.translate(px1, py1);
					ctx.rotate(gmxAPIutils.degRad(style.rotateRes));
					ctx.translate(-px1, -py1);
					ctx.drawImage(image, px1sx, py1sy, sx, sy);
					ctx.setTransform(1, 0, 0, 1, 0, 0);
				} else {
					ctx.drawImage(image, px1sx, py1sy, sx, sy);
				}
            }
            if ('opacity' in style) { ctx.globalAlpha = 1; }
        } else if (style.fillColor || currentStyle.fillRadialGradient) {
            ctx.beginPath();
            if (currentStyle.iconPath) {
                gmxAPIutils.drawIconPath(currentStyle.iconPath, attr);
            } else if (style.type === 'circle' || currentStyle.fillRadialGradient) {
                var circle = style.iconSize / 2;
                if (currentStyle.fillRadialGradient) {
                    var rgr = currentStyle.fillRadialGradient;
                    circle = rgr.r2 * iconScale;
                    var radgrad = ctx.createRadialGradient(px1 + rgr.x1, py1 + rgr.y1, rgr.r1 * iconScale, px1 + rgr.x2, py1 + rgr.y2, circle);
                    for (var i = 0, len = rgr.addColorStop.length; i < len; i++) {
                        var arr = rgr.addColorStop[i];
                        radgrad.addColorStop(arr[0], arr[1]);
                    }
                    ctx.fillStyle = radgrad;
                }
                ctx.arc(px1, py1, circle, 0, 2 * Math.PI);
            } else {
                ctx.fillRect(px1sx, py1sy, sx, sy);
            }
            ctx.fill();
        }
        if (currentStyle.strokeStyle) {
            ctx.beginPath();
            if (currentStyle.iconPath) {
                gmxAPIutils.drawIconPath(currentStyle.iconPath, attr);
            } else if (style.type === 'circle') {
                ctx.arc(px1, py1, style.iconSize / 2, 0, 2 * Math.PI);
            } else {
                ctx.strokeRect(px1sx, py1sy, sx, sy);
            }
            ctx.stroke();
        }
    },
    lineToCanvasAsIcon: function(pixels, attr) {  // add line(as icon) to canvas
        var len = pixels.length,
            ctx = attr.ctx,
            item = attr.item,
            currentStyle = item.currentStyle || item.parsedStyleKeys,
            iconPath = currentStyle.iconPath;

        if (len > 0) {
            if ('getLineDash' in ctx && ctx.getLineDash().length > 0) {
                ctx.setLineDash([]);
            }
            ctx.beginPath();
            for (var i = 0, p; i < len; i++) {
                p = pixels[i];
                gmxAPIutils.drawIconPath(iconPath, {ctx: ctx, px: p.x, py: p.y, radian: p.radian});
            }
            if (currentStyle.strokeStyle) {
                ctx.stroke();
            }
            if (currentStyle.fillStyle) {
                ctx.fill();
            }
        }
    },
    lineToCanvas: function(attr) {  // Lines in canvas
        var topLeft = attr.topLeft,
            mInPixel = topLeft.mInPixel,
            coords = attr.coords,
            ctx = attr.ctx,
            item = attr.item,
            currentStyle = item.currentStyle || item.parsedStyleKeys,
            pixels = currentStyle.iconPath ? [] : null;

        var lastX = null, lastY = null;
        ctx.beginPath();
        for (var i = 0, len = coords.length; i < len; i++) {
            var p = gmxAPIutils.toPixels(coords[i], attr.tpx, attr.tpy, mInPixel, attr.topLeft),
                x = p[0],
                y = p[1];
            if (lastX !== x || lastY !== y) {
                if (pixels) { pixels.push({x: x, y: y, radian: p[2]}); }
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
                lastX = x; lastY = y;
            }
        }
        ctx.stroke();
        return pixels;
    },

    getCoordsPixels: function(attr) {
        var gmx = attr.gmx,
            coords = attr.coords,
            hiddenLines = attr.hiddenLines || [],
            pixels = [],
            hidden = [],
            hiddenFlag = false,
            hash = {
                gmx: gmx,
				topLeft: attr.topLeft,
                tpx: attr.tpx,
                tpy: attr.tpy,
                coords: null,
                hiddenLines: null
            };
        for (var j = 0, len = coords.length; j < len; j++) {
            var coords1 = coords[j],
                hiddenLines1 = hiddenLines[j] || [],
                pixels1 = [], hidden1 = [];
            for (var j1 = 0, len1 = coords1.length; j1 < len1; j1++) {
                hash.coords = coords1[j1];
                hash.hiddenLines = hiddenLines1[j1] || [];
                var res = gmxAPIutils.getRingPixels(hash);
                pixels1.push(res.coords);
                hidden1.push(res.hidden);
                if (res.hidden) {
                    hiddenFlag = true;
                }
            }
            pixels.push(pixels1);
            hidden.push(hidden1);
        }
        return {coords: pixels, hidden: hiddenFlag ? hidden : null, z: attr.topLeft.tilePoint.z};
    },

    getRingPixels: function(attr) {
        if (attr.coords.length === 0) { return null; }
        var topLeft = attr.topLeft,
            mInPixel = topLeft.mInPixel,
            coords = attr.coords,
            hiddenLines = attr.hiddenLines || null,
			// topLeft = attr.topLeft,
            px = attr.tpx,
            py = attr.tpy,
            cnt = 0, cntHide = 0,
            lastX = null, lastY = null,
            vectorSize = typeof coords[0] === 'number' ? 2 : 1,
            pixels = [], hidden = [];
        for (var i = 0, len = coords.length; i < len; i += vectorSize) {
            var lineIsOnEdge = false;
            if (hiddenLines && i === hiddenLines[cntHide]) {
                lineIsOnEdge = true;
                cntHide++;
            }
            var c = vectorSize === 1 ? coords[i] : [coords[i], coords[i + 1]],
                x1 = Math.round(c[0] * mInPixel), y1 = Math.round(c[1] * mInPixel),
                x2 = Math.round(x1 - px), y2 = Math.round(py - y1);

            if (lastX !== x2 || lastY !== y2) {
                lastX = x2; lastY = y2;
                if (lineIsOnEdge) {
                    hidden.push(cnt);
                }
                pixels[cnt++] = x1;
                pixels[cnt++] = y1;
            }
        }
        return {coords: pixels, hidden: hidden.length ? hidden : null};
    },

    polygonToCanvas: function(attr) {       // Polygons in canvas
        if (attr.coords.length === 0) { return null; }
        var hiddenLines = attr.hiddenLines || null,
            coords = attr.coords,
            ctx = attr.ctx,
			// topLeft = attr.topLeft,
            px = attr.tpx,
            py = attr.tpy,
            cnt = 0, cntHide = 0,
            vectorSize = typeof coords[0] === 'number' ? 2 : 1,
            lastX = null, lastY = null;

        ctx.beginPath();
        for (var i = 0, len = coords.length; i < len; i += vectorSize) {
            var c = vectorSize === 1 ? coords[i] : [coords[i], coords[i + 1]],
                x = Math.round(c[0] - px),
                y = Math.round(py - c[1]),
                lineIsOnEdge = false,
				lineCap = 'round';
// console.log('px', x, y, px, py, attr);
            if (hiddenLines && i === hiddenLines[cntHide]) {
                lineIsOnEdge = true;
				lineCap = 'butt';
                cntHide++;
            }
			if (ctx.lineCap !== lineCap) { ctx.lineCap = lineCap; }

            if (lastX !== x || lastY !== y) {
                ctx[(lineIsOnEdge ? 'moveTo' : 'lineTo')](x, y);
                lastX = x; lastY = y;
                cnt++;
            }
        }
        if (cnt === 1) { ctx.lineTo(lastX + 1, lastY); }
        ctx.stroke();
    },

    polygonToCanvasFill: function(attr) {     // Polygon fill
        if (attr.coords.length < 3) { return; }
        var coords = attr.coords,
			// topLeft = attr.topLeft,
            px = attr.tpx,
            py = attr.tpy,
            vectorSize = 1,
            ctx = attr.ctx;

        ctx.lineWidth = 0;
        if (typeof coords[0] === 'number') {
            vectorSize = 2;
            ctx.moveTo(Math.round(coords[0] - px), Math.round(py - coords[1]));
        } else {
            ctx.moveTo(Math.round(coords[0][0] - px), Math.round(py - coords[0][1]));
        }
        for (var i = vectorSize, len = coords.length; i < len; i += vectorSize) {
            var c = vectorSize === 1 ? coords[i] : [coords[i], coords[i + 1]];
            ctx.lineTo(Math.round(c[0] - px), Math.round(py - c[1]));
        }
    },

    isPatternNode: function(it) {
        return it instanceof HTMLCanvasElement || it instanceof HTMLImageElement;
    },
    labelCanvasContext: null,    // 2dContext canvas for Label size
    getLabelWidth: function(txt, style) {   // Get label size Label
        if (style) {
            if (!gmxAPIutils.labelCanvasContext) {
                var canvas = document.createElement('canvas');
                canvas.width = canvas.height = 512;
                gmxAPIutils.labelCanvasContext = canvas.getContext('2d');
            }
            var ptx = gmxAPIutils.labelCanvasContext;
            ptx.clearRect(0, 0, 512, 512);

            if (ptx.font !== style.font) { ptx.font = style.font; }
            //if (ptx.strokeStyle !== style.strokeStyle) { ptx.strokeStyle = style.strokeStyle; }
            if (ptx.fillStyle !== style.fillStyle) { ptx.fillStyle = style.fillStyle; }
			var arr = txt.split('\n');
            return arr.map(function(it) {
				ptx.fillText(it, 0, 0);
				return [it, ptx.measureText(it).width];
			});
        }
        return 0;
    },
    setLabel: function(ctx, txt, coord, style) {
        var x = coord[0],
            y = coord[1];

        if (ctx.shadowColor !== style.strokeStyle) { ctx.shadowColor = style.strokeStyle; }
        if (ctx.shadowBlur !== style.shadowBlur) { ctx.shadowBlur = style.shadowBlur; }
        if (ctx.font !== style.font) { ctx.font = style.font; }
		if (L.Browser.gecko) {	// Bug with perfomance in FireFox
			if (ctx.strokeStyle !== style.fillStyle) { ctx.strokeStyle = style.fillStyle; }
		} else {
			if (ctx.strokeStyle !== style.strokeStyle) { ctx.strokeStyle = style.strokeStyle; }
			if (ctx.fillStyle !== style.fillStyle) { ctx.fillStyle = style.fillStyle; }
		}
        ctx.strokeText(txt, x, y);
		if (!L.Browser.gecko) {
			ctx.fillText(txt, x, y);
		}
    },
    worldWidthFull: 40075016.685578496,
    // worldWidthMerc: gmxAPIutils.worldWidthFull / 2,
    rMajor: 6378137.000,
    degRad: function(ang) {
        return ang * (Math.PI / 180.0);
    },

    distVincenty: function(lon1, lat1, lon2, lat2) {
        var p1 = {
            lon: gmxAPIutils.degRad(lon1),
            lat: gmxAPIutils.degRad(lat1)
        },
            p2 = {
            lon: gmxAPIutils.degRad(lon2),
            lat: gmxAPIutils.degRad(lat2)
        },
            a = gmxAPIutils.rMajor,
            b = 6356752.3142,
            f = 1 / 298.257223563;  // WGS-84 ellipsiod

        var L1 = p2.lon - p1.lon,
            U1 = Math.atan((1 - f) * Math.tan(p1.lat)),
            U2 = Math.atan((1 - f) * Math.tan(p2.lat)),
            sinU1 = Math.sin(U1), cosU1 = Math.cos(U1),
            sinU2 = Math.sin(U2), cosU2 = Math.cos(U2),
            lambda = L1,
            lambdaP = 2 * Math.PI,
            iterLimit = 20;
        while (Math.abs(lambda - lambdaP) > 1e-12 && --iterLimit > 0) {
                var sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda),
                    sinSigma = Math.sqrt((cosU2 * sinLambda) * (cosU2 * sinLambda) +
                    (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) * (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda));
                if (sinSigma === 0) { return 0; }
                var cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda,
                    sigma = Math.atan2(sinSigma, cosSigma),
                    sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma,
                    cosSqAlpha = 1 - sinAlpha * sinAlpha,
                    cos2SigmaM = cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha;
                if (isNaN(cos2SigmaM)) { cos2SigmaM = 0; }
                var C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
                lambdaP = lambda;
                lambda = L1 + (1 - C) * f * sinAlpha *
                    (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
        }
        if (iterLimit === 0) { return NaN; }

        var uSq = cosSqAlpha * ((a * a) / (b * b) - 1),
        //var uSq = cosSqAlpha * (a * a - b * b) / (b*b),
            A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq))),
            B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq))),
            deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
                B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM))),
            s = b * A * (sigma - deltaSigma);

        //s = s.toFixed(3);
        return s;
    },

    _vfi: function(fi, a, b) {
        return [
            -Math.cos(fi) * Math.sin(a) + Math.sin(fi) * Math.sin(b) * Math.cos(a),
            Math.cos(fi) * Math.cos(a) + Math.sin(fi) * Math.sin(b) * Math.sin(a),
            -Math.sin(fi) * Math.cos(b)
        ];
    },

    getCircleLatLngs: function(latlng, r) {   // Get latlngs for circle
        var x = 0, y = 0;
        if (latlng instanceof L.LatLng) {
            x = latlng.lng;
            y = latlng.lat;
        } else if (L.Util.isArray(latlng)) {
            x = latlng[1];
            y = latlng[0];
        } else {
            return null;
        }

        var rad = Math.PI / 180,
            a = x * rad,  //долгота центра окружности в радианах
            b = y * rad,  //широта центра окружности в радианах
            R = gmxAPIutils.rMajor,
            d = R * Math.sin(r / R),
            Rd = R * Math.cos(r / R),
            VR = [
                Rd * Math.cos(b) * Math.cos(a),
                Rd * Math.cos(b) * Math.sin(a),
                Rd * Math.sin(b)
            ],
            latlngs = [];

        for (var fi = 0, limit = 2 * Math.PI + 0.000001; fi < limit; fi += rad) {
            var v = gmxAPIutils._vfi(fi, a, b),
                circle = [];
            for (var i = 0; i < 3; i++) { circle[i] = VR[i] + d * v[i]; }

            var t2 = Math.acos(circle[0] / Math.sqrt(circle[0] * circle[0] + circle[1] * circle[1])) / rad;
            if (circle[1] < 0) { t2 = -t2; }

            if (t2 < x - 180) {
                t2 += 360;
            } else if (t2 > x + 180) {
                t2 -= 360;
            }
            latlngs.push([Math.asin(circle[2] / R) / rad, t2]);
        }
        return latlngs;
    },

    /** Get point coordinates from string
     * @memberof L.gmxUtil
     * @param {String} text - point coordinates in following formats:
         <br/><i>55.74312, 37.61558</i>
         <br/><i>55°44'35" N, 37°36'56" E</i>
         <br/><i>4187347, 7472103</i>
         <br/><i>4219783, 7407468 (EPSG:3395)</i>
         <br/><i>4219783, 7442673 (EPSG:3857)</i>
     * @return {Array} [lat, lng] or null
    */
    parseCoordinates: function(text) {
        var crs = null,
            regex = /\(EPSG:(\d+)\)/g,
            t = regex.exec(text);

        if (t) {
            crs = t[1];
            text = text.replace(regex, '');
        }

        if (text.match(/[йцукенгшщзхъфывапролджэячсмитьбюЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮqrtyuiopadfghjklzxcvbmQRTYUIOPADFGHJKLZXCVBM_:]/)) {
            return null;
        }

        //there should be a separator in the string (exclude strings like "11E11")
        if (text.indexOf(' ') === -1 && text.indexOf(',') === -1) {
            return null;
        }

        if (text.indexOf(' ') !== -1) {
            text = text.replace(/,/g, '.');
        }
        var results = [];
/*eslint-disable no-useless-escape */
        regex = /(-?\d+(\.\d+)?)([^\d\-]*)/g;
/*eslint-enable */
        t = regex.exec(text);
        while (t) {
            results.push(t[1]);
            t = regex.exec(text);
        }
        if (results.length < 2) {
            return null;
        }
        var ii = Math.floor(results.length / 2),
            y = 0,
            mul = 1,
            i;
        for (i = 0; i < ii; i++) {
            y += parseFloat(results[i]) * mul;
            mul /= 60;
        }
        var x = 0;
        mul = 1;
        for (i = ii; i < results.length; i++) {
            x += parseFloat(results[i]) * mul;
            mul /= 60;
        }

        if (Math.max(text.indexOf('N'), text.indexOf('S')) > Math.max(text.indexOf('E'), text.indexOf('W'))) {
            t = x;
            x = y;
            y = t;
        }

        var pos;
        if (crs == 3857) {
            pos = L.Projection.SphericalMercator.unproject(new L.Point(y, x));
            x = pos.lng;
            y = pos.lat;
        }
        if (Math.abs(x) > 180 || Math.abs(y) > 180) {
            pos = L.Projection.Mercator.unproject(new L.Point(y, x));
            x = pos.lng;
            y = pos.lat;
        }

        if (text.indexOf('W') !== -1) {
            x = -x;
        }

        if (text.indexOf('S') !== -1) {
            y = -y;
        }
        return [y, x];
    },

	pad2: function(t) {
		return (t >= 0 && t < 10) ? ('0' + t) : ('' + t);
	},

	trunc: function(x) {
		return ('' + (Math.round(10000000 * x) / 10000000 + 0.00000001)).substring(0, 9);
	},

	formatDegrees: function(angle, format) {
		angle = Math.round(10000000 * angle) / 10000000 + 0.00000001;
		var a1 = Math.floor(angle),
			a2 = Math.floor(60 * (angle - a1)),
			a3 = gmxAPIutils.toPrecision(3600 * (angle - a1 - a2 / 60), 2),
			st = gmxAPIutils.pad2(a1) + '°';

		if (format ===  undefined ) { format = 2; }
		if (format > 0) {
			st += gmxAPIutils.pad2(a2) + '\'';
		}
		if (format > 1) {
			st += gmxAPIutils.pad2(a3) + '"';
		}
		return st;
	},

    /** Get point coordinates in string format with degrees
     * @memberof L.gmxUtil
     * @param {Number} lng - point longitude
     * @param {Number} lat - point latitude
     * @return {String} point coordinates in string format with degrees
    */
	latLonFormatCoordinates: function(x, y) {
        x %= 360;
        if (x > 180) { x -= 360; }
        else if (x < -180) { x += 360; }
		return  gmxAPIutils.formatDegrees(Math.abs(y)) + (y > 0 ? ' N, ' : ' S, ') +
			gmxAPIutils.formatDegrees(Math.abs(x)) + (x > 0 ? ' E' : ' W');
	},
	latLonToString: function(x, y, prec) {
        x %= 360;
        if (x > 180) { x -= 360; }
        else if (x < -180) { x += 360; }
		if (prec) {
			x = gmxAPIutils.toPrecision(x, prec);
			y = gmxAPIutils.toPrecision(y, prec);
		}
		return  y + (y > 0 ? ' N, ' : ' S, ') +
			x + (x > 0 ? ' E' : ' W');
	},

	formatCoordinates: function(x, y) {
		return  gmxAPIutils.latLonFormatCoordinates(x, y);
	},

    /** Get point coordinates in string format
     * @memberof L.gmxUtil
     * @param {Number} lng - point longitude
     * @param {Number} lat - point latitude
     * @return {String} point coordinates in string format
    */
	latLonFormatCoordinates2: function(x, y) {
		return  gmxAPIutils.trunc(Math.abs(y)) + (y > 0 ? ' N, ' : ' S, ') +
			gmxAPIutils.trunc(Math.abs(x)) + (x > 0 ? ' E' : ' W');
	},
	formatCoordinates2: function(x, y) {
		return  gmxAPIutils.latLonFormatCoordinates2(x, y);
	},

    getPixelScale: function(zoom) {
        return 256 / gmxAPIutils.tileSizes[zoom];
    },

    forEachPoint: function(coords, callback) {
        if (!coords || coords.length === 0) { return []; }
        var i, len, ret = [];
        if (!coords[0].length) {
            if (coords.length === 2) {
                return callback(coords);
            } else {
                for (i = 0, len = coords.length / 2; i < len; i++) {
                    ret.push(callback([coords[i * 2], coords[i * 2 + 1]]));
                }
            }
        } else {
            for (i = 0, len = coords.length; i < len; i++) {
                if (typeof coords[i] !== 'string') {
                    ret.push(gmxAPIutils.forEachPoint(coords[i], callback));
                }
            }
        }
        return ret;
    },
/*
	getQuicklookPoints: function(coord) { // получить 4 точки привязки снимка
		var d1 = Number.MAX_VALUE;
		var d2 = Number.MAX_VALUE;
		var d3 = Number.MAX_VALUE;
		var d4 = Number.MAX_VALUE;
		var x1, y1, x2, y2, x3, y3, x4, y4;
		this.forEachPoint(coord, function(p) {
			var x = p[0];
			var y = p[1];
			if ((x - y) < d1) {
				d1 = x - y;
				x1 = p[0];
				y1 = p[1];
			}
			if ((-x - y) < d2) {
				d2 = -x - y;
				x2 = p[0];
				y2 = p[1];
			}
			if ((-x + y) < d3) {
				d3 = -x + y;
				x3 = p[0];
				y3 = p[1];
			}
			if ((x + y) < d4) {
				d4 = x + y;
				x4 = p[0];
				y4 = p[1];
			}
		});
		return {x1: x1, y1: y1, x2: x2, y2: y2, x3: x3, y3: y3, x4: x4, y4: y4};
	},
*/
    getItemCenter: function(item, geoItems) {
        var bounds = item.bounds,
            min = bounds.min, max = bounds.max,
            type = item.type,
            isPoint = type === 'POINT' || type === 'MULTIPOINT',
            center = isPoint ? [min.x, min.y] : [(min.x + max.x) / 2, (min.y + max.y) / 2];

        if (type === 'MULTIPOLYGON') {
			return center;
		} else if (type === 'POLYGON') {
            for (var i = 0, len = geoItems.length; i < len; i++) {
                var it = geoItems[i],
                    geom = it.geo,
                    coords = geom.coordinates,
                    dataOption = it.dataOption,
                    bbox = dataOption.bounds;

                if (bbox.contains(center)) {
                    if (geom.type === 'POLYGON') { coords = [coords]; }
                    for (var j = 0, len1 = coords.length; j < len1; j++) {
                        for (var j1 = 0, coords1 = coords[j], len2 = coords1.length; j1 < len2; j1++) {
                            var pt = gmxAPIutils.getHSegmentsInPolygon(center[1], coords1[j1]);
                            if (pt) {
                                return pt.max.center;
                            }
                        }
                    }
                }
            }
        } else if (type === 'POINT' || type === 'MULTIPOINT') {
            return center;
        } else if (type === 'LINESTRING' || type === 'MULTILINESTRING') {
            return center;
        }
        return null;
    },

    getHSegmentsInPolygon: function(y, poly) {
        var s = [], i, len, out,
            vectorSize = 1,
            p1 = poly[0];

        if (typeof poly[0] === 'number') {
            vectorSize = 2;
            p1 = [poly[0], poly[1]];
        }
        var isGt1 = y > p1[1];
        for (i = vectorSize, len = poly.length; i < len; i += vectorSize) {
            var p2 = vectorSize === 1 ? poly[i] : [poly[i], poly[i + 1]],
                isGt2 = y > p2[1];
            if (isGt1 !== isGt2) {
                s.push(p1[0] - (p1[0] - p2[0]) * (p1[1] - y) / (p1[1] - p2[1]));
            }
            p1 = p2;
            isGt1 = isGt2;
        }
        len = s.length;
        if (len) {
            s = s.sort();
            var max = 0,
                index = -1;
            for (i = 1; i < len; i += 2) {
                var j = i - 1,
                    d = Math.abs(s[i] - s[j]);
                if (d > max) {
                    max = d;
                    index = j;
                }
            }
            out = {
                y: y,
                segArr: s,
                max: {
                    width: max,
                    center: [(s[index] + s[index + 1]) / 2, y]
                }
            };
        }
        return out;
    },

    isPointInPolygonArr: function(chkPoint, coords) { // Проверка точки на принадлежность полигону в виде массива
        var isIn = false,
            x = chkPoint[0],
            y = chkPoint[1],
            vectorSize = 1,
            p1 = coords[0];

        if (typeof coords[0] === 'number') {
            vectorSize = 2;
            p1 = [coords[0], coords[1]];
        }

        for (var i = vectorSize, len = coords.length; i < len; i += vectorSize) {
            var p2 = vectorSize === 1 ? coords[i] : [coords[i], coords[i + 1]],
                xmin = Math.min(p1[0], p2[0]),
                xmax = Math.max(p1[0], p2[0]),
                ymax = Math.max(p1[1], p2[1]);
            if (x > xmin && x <= xmax && y <= ymax && p1[0] !== p2[0]) {
                var xinters = (x - p1[0]) * (p2[1] - p1[1]) / (p2[0] - p1[0]) + p1[1];
                if (p1[1] === p2[1] || y <= xinters) { isIn = !isIn; }
            }
            p1 = p2;
        }
        return isIn;
    },

    /** Is point in polygon with holes
     * @memberof L.gmxUtil
     * @param {chkPoint} chkPoint - point in [x, y] format
     * @param {coords} coords - polygon from geoJSON coordinates data format
     * @return {Boolean} true if polygon contain chkPoint
    */
    isPointInPolygonWithHoles: function(chkPoint, coords) {
        if (!gmxAPIutils.isPointInPolygonArr(chkPoint, coords[0])) { return false; }
        for (var j = 1, len = coords.length; j < len; j++) {
            if (gmxAPIutils.isPointInPolygonArr(chkPoint, coords[j])) { return false; }
        }
        return true;
    },

    /** Is polygon clockwise
     * @memberof L.gmxUtil
     * @param {ring} ring - ring from geoJSON coordinates data format
     * @return {Boolean} true if ring is clockwise
    */
    isClockwise: function(ring) {
        var area = 0;
        for (var i = 0, j, len = ring.length; i < len; i++) {
            j = (i + 1) % len;
            area += ring[i][0] * ring[j][1];
            area -= ring[j][0] * ring[i][1];
        }
        return (area < 0);
    },

    isPointInPolyLine: function(chkPoint, lineHeight, coords, hiddenLines) {
        // Проверка точки(с учетом размеров) на принадлежность линии
        var dx = chkPoint[0], dy = chkPoint[1],
            nullPoint = {x: dx, y: dy},
            minx = dx - lineHeight, maxx = dx + lineHeight,
            miny = dy - lineHeight, maxy = dy + lineHeight,
            cntHide = 0;

        lineHeight *= lineHeight;
        for (var i = 1, len = coords.length; i < len; i++) {
            if (hiddenLines && i === hiddenLines[cntHide]) {
                cntHide++;
            } else {
                var p1 = coords[i - 1], p2 = coords[i],
                    x1 = p1[0], y1 = p1[1],
                    x2 = p2[0], y2 = p2[1];

                if (!(Math.max(x1, x2) < minx
                    || Math.min(x1, x2) > maxx
                    || Math.max(y1, y2) < miny
                    || Math.min(y1, y2) > maxy)) {
                    var sqDist = L.LineUtil._sqClosestPointOnSegment(nullPoint, {x: x1, y: y1}, {x: x2, y: y2}, true);
                    if (sqDist < lineHeight) {
                        return true;
                    }
                }
            }
        }
        return false;
    },

    isPointInLines: function (attr) {
        var arr = attr.coords,
            point = attr.point,
            delta = attr.delta,
            boundsArr = attr.boundsArr,
            hidden = attr.hidden;
        for (var j = 0, len = arr.length, flag = false; j < len; j++) {
            flag = boundsArr[j] ? boundsArr[j].contains(point) : true;
            if (flag
                && gmxAPIutils.isPointInPolyLine(point, delta, arr[j], hidden ? hidden[j] : null)
            ) {
               return true;
            }
        }
        return false;
    },

    /** Get length
     * @memberof L.gmxUtil
     * @param {Array} latlngs array
     * @param {Boolean} isMerc - true if coordinates in Mercator
     * @param {Boolean} isWebMerc - true if coordinates in WebMercator	- TODO
     * @return {Number} length
    */
    getLength: function(latlngs, isMerc) {
        var length = 0;
        if (latlngs && latlngs.length) {
            var lng = false,
                lat = false;

            isMerc = isMerc === undefined || isMerc;
            latlngs.forEach(function(latlng) {
                if (L.Util.isArray(latlng)) {
                    if (L.Util.isArray(latlng[0])) {
                        length += gmxAPIutils.getLength(latlng, isMerc);
                        return length;
                    } else if (isMerc) {   // From Mercator array
                        latlng = L.Projection.Mercator.unproject({x: latlng[0], y: latlng[1]});
                    }
                }
                if (lng !== false && lat !== false) {
                    length += parseFloat(gmxAPIutils.distVincenty(lng, lat, latlng.lng, latlng.lat));
                }
                lng = latlng.lng;
                lat = latlng.lat;
            });
        }
        return length;
    },
    getText: function(str) {
		str = str || '';
        if (L.gmxLocale) { return L.gmxLocale.getText(str); }
		return str.split('.').pop();
	},

    /** Get prettify length
     * @memberof L.gmxUtil
     * @param {Number} area
     * @param {String} type: ('km', 'm', 'nm')
     * @return {String} prettify length
    */
    prettifyDistance: function(length, type) {
        var km = ' ' + gmxAPIutils.getText('units.km');
        if (type === 'nm') {
            return (Math.round(0.539956803 * length) / 1000) + ' ' + gmxAPIutils.getText('units.nm');
        } else if (type === 'km') {
            return (Math.round(length) / 1000) + km;
        } else if (length < 2000 || type === 'm') {
            return Math.round(length) + ' ' + gmxAPIutils.getText('units.m');
        } else if (length < 200000) {
            return (Math.round(length / 10) / 100) + km;
        }
        return Math.round(length / 1000) + km;
    },

    /** Get geoJSON length
     * @memberof L.gmxUtil
     * @param {Object} geoJSON - object in <a href="http://geojson.org/geojson-spec.html">GeoJSON format</a>
     * @return {Number} length
    */
    geoJSONGetLength: function(geoJSON) {
        var out = 0,
            i, j, len, len1, coords;

        if (geoJSON.type === 'GeometryCollection') {
            out += geoJSON.geometries.forEach(gmxAPIutils.geoJSONGetLength);
        } else if (geoJSON.type === 'Feature') {
            out += gmxAPIutils.geoJSONGetLength(geoJSON.geometry);
        } else if (geoJSON.type === 'FeatureCollection') {
            out += geoJSON.features.forEach(gmxAPIutils.geoJSONGetLength);
        } if (geoJSON.type === 'LineString' || geoJSON.type === 'MultiLineString') {
            coords = geoJSON.coordinates;
            if (geoJSON.type === 'LineString') { coords = [coords]; }
            for (i = 0, len = coords.length; i < len; i++) {
                out += gmxAPIutils.getRingLength(coords[i]);
            }
        } if (geoJSON.type === 'Polygon' || geoJSON.type === 'MultiPolygon') {
            coords = geoJSON.coordinates;
            if (geoJSON.type === 'Polygon') { coords = [coords]; }
            for (i = 0, len = coords.length; i < len; i++) {
                for (j = 0, len1 = coords[i].length; j < len1; j++) {
                    out += gmxAPIutils.getRingLength(coords[i][j]);
                }
            }
        }
        return out;
    },

    getRingLength: function(coords) {
        var length = 0;
        if (coords && coords.length) {
            var lng = false, lat = false;
            coords.forEach(function(lnglat) {
                if (L.Util.isArray(lnglat)) {
                    if (lnglat.length > 2) {
                        length += gmxAPIutils.getRingLength(lnglat);
                        return length;
                    }
                }
                if (lng !== false && lat !== false) {
                    length += parseFloat(gmxAPIutils.distVincenty(lng, lat, lnglat[0], lnglat[1]));
                }
                lng = lnglat[0];
                lat = lnglat[1];
            });
        }
        return length;
    },

    /** Get geoJSON area
     * @memberof L.gmxUtil
     * @param {Object} geojson - object in <a href="http://geojson.org/geojson-spec.html">GeoJSON format</a>
     * @return {Number} area in square meters
    */
    geoJSONGetArea: function(geoJSON) {
        var out = 0;

        if (geoJSON.type === 'GeometryCollection') {
            out += geoJSON.geometries.forEach(gmxAPIutils.geoJSONGetArea);
        } else if (geoJSON.type === 'Feature') {
            out += gmxAPIutils.geoJSONGetArea(geoJSON.geometry);
        } else if (geoJSON.type === 'FeatureCollection') {
            out += geoJSON.features.forEach(gmxAPIutils.geoJSONGetArea);
        } if (geoJSON.type === 'Polygon' || geoJSON.type === 'MultiPolygon') {
            var coords = geoJSON.coordinates;
            if (geoJSON.type === 'Polygon') { coords = [coords]; }
            for (var i = 0, len = coords.length; i < len; i++) {
                out += gmxAPIutils.getRingArea(coords[i][0]);
                for (var j = 1, len1 = coords[i].length; j < len1; j++) {
                    out -= gmxAPIutils.getRingArea(coords[i][j]);
                }
            }
        }
        return out;
    },

    geoJSONGetLatLng: function(geoJSON) {
        if (geoJSON.type === 'Feature') {
            return gmxAPIutils.geoJSONGetLatLng(geoJSON.geometry);
        } else if (geoJSON.type === 'Point') {
            return L.latLng(geoJSON.coordinates[1], geoJSON.coordinates[0]);
        } else {
            throw new Error('cannot get ' + geoJSON.type + ' latLng');
        }
    },

    getRingArea: function(coords) {
        var area = 0;
        for (var i = 0, len = coords.length; i < len; i++) {
            var ipp = (i === (len - 1) ? 0 : i + 1),
                p1 = coords[i], p2 = coords[ipp];
            area += p1[0] * Math.sin(gmxAPIutils.degRad(p2[1])) - p2[0] * Math.sin(gmxAPIutils.degRad(p1[1]));
        }
        var out = Math.abs(area * gmxAPIutils.lambertCoefX * gmxAPIutils.lambertCoefY / 2);
        return out;
    },

    /** Get area
     * @memberof L.gmxUtil
     * @param {Array} L.latLng array
     * @return {Number} area in square meters
    */
    getArea: function(arr) {
        var area = 0;
        for (var i = 0, len = arr.length; i < len; i++) {
            var ipp = (i === (len - 1) ? 0 : i + 1),
                p1 = arr[i], p2 = arr[ipp];
            area += p1.lng * Math.sin(gmxAPIutils.degRad(p2.lat)) - p2.lng * Math.sin(gmxAPIutils.degRad(p1.lat));
        }
        return Math.abs(area * gmxAPIutils.lambertCoefX * gmxAPIutils.lambertCoefY / 2);
    },

    /** Get prettified size of area
     * @memberof L.gmxUtil
     * @param {Number} area in square meters
     * @param {String} type: ('km2', 'ha', 'm2')
     * @return {String} prettified area
    */
    prettifyArea: function(area, type) {
        var km2 = ' ' + gmxAPIutils.getText('units.km2');

        if (type === 'km2') {
            return ('' + (Math.round(area / 100) / 10000)) + km2;
        } else if (type === 'ha') {
            return ('' + (Math.round(area / 100) / 100)) + ' ' + gmxAPIutils.getText('units.ha');
        } else if (area < 100000 || type === 'm2') {
            return Math.round(area) + ' ' + gmxAPIutils.getText('units.m2');
        } else if (area < 3000000) {
            return ('' + (Math.round(area / 1000) / 1000)).replace('.', ',') + km2;
        } else if (area < 30000000) {
            return ('' + (Math.round(area / 10000) / 100)).replace('.', ',') + km2;
        } else if (area < 300000000) {
            return ('' + (Math.round(area / 100000) / 10)).replace('.', ',') + km2;
        }
        return (Math.round(area / 1000000)) + km2;
    },

    geoLength: function(geom) {
        var ret = 0,
            type = geom.type;
        if (type === 'MULTILINESTRING' || type === 'MultiLineString') {
            for (var i = 0, len = geom.coordinates.length; i < len; i++) {
                ret += gmxAPIutils.geoLength({type: 'LINESTRING', coordinates: geom.coordinates[i]});
            }
            return ret;
        } else if (type === 'LINESTRING' || type === 'LineString') {
            ret = gmxAPIutils.getLength(geom.coordinates);
        }
        return ret;
    },

    /** Converts Geomixer geometry to geoJSON geometry
     * @memberof L.gmxUtil
     * @param {Object} geometry - Geomixer geometry
     * @param {Boolean} mercFlag - true if coordinates in Mercator
     * @param {Boolean} webmercFlag - true if coordinates in WebMercator
     * @return {Object} geoJSON geometry
    */
    geometryToGeoJSON: function (geom, mercFlag, webmercFlag) {
        if (!geom) {
            return null;
        }

        var type = geom.type === 'MULTIPOLYGON' ? 'MultiPolygon'
                : geom.type === 'POLYGON' ? 'Polygon'
                : geom.type === 'MULTILINESTRING' ? 'MultiLineString'
                : geom.type === 'LINESTRING' ? 'LineString'
                : geom.type === 'MULTIPOINT' ? 'MultiPoint'
                : geom.type === 'POINT' ? 'Point'
                : geom.type,
            coords = geom.coordinates;
        if (mercFlag) {
            coords = gmxAPIutils.coordsFromMercator(type, coords, webmercFlag);
        }
        return {
            type: type,
            coordinates: coords
        };
    },

    convertGeometry: function (geom, fromMerc, webmercFlag) {
        var type = geom.type === 'MULTIPOLYGON' ? 'MultiPolygon'
                : geom.type === 'POLYGON' ? 'Polygon'
                : geom.type === 'MULTILINESTRING' ? 'MultiLineString'
                : geom.type === 'LINESTRING' ? 'LineString'
                : geom.type === 'MULTIPOINT' ? 'MultiPoint'
                : geom.type === 'POINT' ? 'Point'
                : geom.type,
            coords = geom.coordinates;
        if (fromMerc) {
            coords = gmxAPIutils.coordsFromMercator(type, coords, webmercFlag);
        } else {
            coords = gmxAPIutils.coordsToMercator(type, coords, webmercFlag);
        }
        return {
            type: geom.type,
            coordinates: coords
        };
    },

    /** Converts GeoJSON object into GeoMixer format
     * @memberof L.gmxUtil
     * @param {Object} geometry - GeoJSON object
     * @param {Boolean} mercFlag - true if resulting Geomixer object should has coordinates in Mercator projection
     * @return {Object} Geometry in GeoMixer format
    */
    geoJSONtoGeometry: function (geoJSON, mercFlag) {
        if (geoJSON.type === 'FeatureCollection') {
            return gmxAPIutils.geoJSONtoGeometry(geoJSON.features[0], mercFlag);
        } else if (geoJSON.type === 'Feature') {
            return gmxAPIutils.geoJSONtoGeometry(geoJSON.geometry, mercFlag);
        } else if (geoJSON.type === 'FeatureCollection') {
            return gmxAPIutils.geoJSONtoGeometry(geoJSON.features[0], mercFlag);
        }

        var type = geoJSON.type === 'MultiPolygon' ? 'MULTIPOLYGON'
                : geoJSON.type === 'Polygon' ? 'POLYGON'
                : geoJSON.type === 'MultiLineString' ? 'MULTILINESTRING'
                : geoJSON.type === 'LineString' ? 'LINESTRING'
                : geoJSON.type === 'MultiPoint' ? 'MULTIPOINT'
                : geoJSON.type === 'Point' ? 'POINT'
                : geoJSON.type,
            coords = geoJSON.coordinates;
        if (mercFlag) {
            coords = gmxAPIutils.coordsToMercator(geoJSON.type, coords);
        }
        return {
            type: type,
            coordinates: coords
        };
    },

    _coordsConvert: function(type, coords, toMerc, webmercFlag) {
        var i, len, p,
            resCoords = [];
        if (type === 'Point') {
            if (toMerc) {
                p = (webmercFlag ? L.CRS.EPSG3857 : L.Projection.Mercator).project({lat: coords[1], lng: coords[0]});
                resCoords = [p.x, p.y];
            } else {
                p = L.Projection.Mercator.unproject({y: coords[1], x: coords[0]});
                resCoords = [p.lng, p.lat];
				if (webmercFlag) {
					resCoords[1] = gmxAPIutils.fromWebMercY(coords[1]);
				}
            }
        } else if (type === 'LineString' || type === 'MultiPoint') {
            for (i = 0, len = coords.length; i < len; i++) {
                resCoords.push(gmxAPIutils._coordsConvert('Point', coords[i], toMerc, webmercFlag));
            }
        } else if (type === 'Polygon' || type === 'MultiLineString') {
            for (i = 0, len = coords.length; i < len; i++) {
                resCoords.push(gmxAPIutils._coordsConvert('MultiPoint', coords[i], toMerc, webmercFlag));
            }
        } else if (type === 'MultiPolygon') {
            for (i = 0, len = coords.length; i < len; i++) {
                resCoords.push(gmxAPIutils._coordsConvert('Polygon', coords[i], toMerc, webmercFlag));
            }
        }
        return resCoords;
    },

    coordsFromMercator: function(type, coords, webmercFlag) {
        return gmxAPIutils._coordsConvert(type, coords, false, webmercFlag);
    },

    coordsToMercator: function(type, coords, webmercFlag) {
        return gmxAPIutils._coordsConvert(type, coords, true, webmercFlag);
    },

    transformGeometry: function(geom, callback) {
        return !geom ? geom : {
            type: geom.type,
            coordinates: gmxAPIutils.forEachPoint(geom.coordinates, function(p) {
                return callback(p);
            })
        };
    },

    /** Get area for geometry
     * @memberof L.gmxUtil
     * @param {Object} geometry
     * @param {Boolean} [isMerc=true] - true if coordinates in Mercator
     * @param {Boolean} isWebMerc - true if coordinates in WebMercator	- TODO
     * @return {Number} area in square meters
    */
    geoArea: function(geom, isMerc) {
        var i, len, ret = 0,
            type = geom.type || '';
        isMerc = isMerc === undefined || isMerc;
        if (type === 'MULTIPOLYGON' || type === 'MultiPolygon') {
            for (i = 0, len = geom.coordinates.length; i < len; i++) {
                ret += gmxAPIutils.geoArea({type: 'POLYGON', coordinates: geom.coordinates[i]}, isMerc);
            }
            return ret;
        } else if (type === 'POLYGON' || type === 'Polygon') {
            ret = gmxAPIutils.geoArea(geom.coordinates[0], isMerc);
            for (i = 1, len = geom.coordinates.length; i < len; i++) {
                ret -= gmxAPIutils.geoArea(geom.coordinates[i], isMerc);
            }
            return ret;
        } else if (geom.length) {
            var latlngs = [],
                vectorSize = typeof geom[0] === 'number' ? 2 : 1;

            for (i = 0, len = geom.length; i < len; i += vectorSize) {
                var p = vectorSize === 1 ? geom[i] : [geom[i], geom[i + 1]];
                latlngs.push(
                    isMerc ?
                    L.Projection.Mercator.unproject({y: p[1], x: p[0]}) :
                    {lat: p[1], lng: p[0]}
                );
            }
            return gmxAPIutils.getArea(latlngs);
        }
        return 0;
    },

    /** Get summary for geoJSON geometry
     * @memberof L.gmxUtil
     * @param {Object} geoJSON geometry
     * @param {Object} unitOptions {
     *                  distanceUnit: '',   // m - meters, km - kilometers, nm - nautilus miles, auto - default
     *                  squareUnit: ''      // m2 - square meters, km2 - square kilometers, ha - hectares, auto - default
     *               }
     * @return {String} Summary string for geometry
    */
    getGeoJSONSummary: function(geom, unitOptions) {
        var type = geom.type,
            units = unitOptions || {},
            out = 0,
            i, len, coords;
        if (type === 'Point') {
            coords = geom.coordinates;
            out = gmxAPIutils.formatCoordinates(coords[0], coords[1]);
        } else if (type === 'Polygon') {
            out = gmxAPIutils.prettifyArea(gmxAPIutils.geoArea(geom, false), units.squareUnit);
        } else if (type === 'MultiPolygon') {
            coords = geom.coordinates;
            for (i = 0, len = coords.length; i < len; i++) {
                out += gmxAPIutils.geoArea({type: 'Polygon', coordinates: coords[i]}, false);
            }
            out = gmxAPIutils.prettifyArea(out, units.squareUnit);
        } else if (type === 'LineString') {
            out = gmxAPIutils.prettifyDistance(gmxAPIutils.geoJSONGetLength(geom), units.distanceUnit);
        } else if (type === 'MultiLineString') {
            coords = geom.coordinates;
            for (i = 0, len = coords.length; i < len; i++) {
                out += gmxAPIutils.geoJSONGetLength({type: 'LineString', coordinates: coords[i]});
            }
            out = gmxAPIutils.prettifyDistance(out, units.distanceUnit);
        }
        return out;
    },

    /** Get summary for point
     * @memberof L.gmxUtil
     * @param {latlng} point
     * @param {num} format number:
     *         0: 62°52'30.68" N, 22°48'27.42" E
     *         1: 62.875188 N, 22.807617 E
     *         2: 2538932, 9031643 (EPSG:3395)
     *         3: 2538932, 9069712 (EPSG:3857)
     * @return {String} Summary string for LatLng point
    */
    getCoordinatesString: function(latlng, num) {
        var x = latlng.lng,
            y = latlng.lat,
            formats = [
                '',
                '',
                ' (EPSG:3395)',
                ' (EPSG:3857)'
            ],
            len = formats.length,
            merc,
            out = '';
        num = num || 0;
        if (x > 180) { x -= 360; }
        if (x < -180) { x += 360; }
        if (num % len === 0) {
            out = gmxAPIutils.formatCoordinates2(x, y);
        } else if (num % len === 1) {
            out = gmxAPIutils.formatCoordinates(x, y);
        } else if (num % len === 2) {
            merc = L.Projection.Mercator.project(new L.LatLng(y, x));
            out = '' + Math.round(merc.x) + ', ' + Math.round(merc.y) + formats[2];
        } else {
            merc = L.CRS.EPSG3857.project(new L.LatLng(y, x));
            out = '' + Math.round(merc.x) + ', ' + Math.round(merc.y) + formats[3];
        }
        return out;
    },

    /** Get summary for geometries array
     * @memberof L.gmxUtil
     * @param {Array} geometries array in Geomixer format
     * @param {Object} units Options for length and area
     * @return {String} Summary string for geometries array
    */
    getGeometriesSummary: function(arr, unitOptions) {
        var out = '',
            type = '',
            res = 0;
        if (!unitOptions) { unitOptions = {}; }
        if (arr) {
            arr.forEach(function(geom) {
                if (geom) {
                    type = geom.type.toUpperCase();
					var latLngGeometry = L.gmxUtil.geometryToGeoJSON(geom, true, unitOptions.srs == 3857);
                    if (type.indexOf('POINT') !== -1) {
                        var latlng = L.latLng(latLngGeometry.coordinates.reverse());
                        out = '<b>' + gmxAPIutils.getText('Coordinates') + '</b>: '
                            + gmxAPIutils.getCoordinatesString(latlng, unitOptions.coordinatesFormat);
                    } else if (type.indexOf('LINESTRING') !== -1) {
                        res += gmxAPIutils.geoJSONGetLength(latLngGeometry);
                    } else if (type.indexOf('POLYGON') !== -1) {
                        res += gmxAPIutils.geoJSONGetArea(latLngGeometry);
                    }
                }
            });
        }
        if (!out) {
            if (type.indexOf('LINESTRING') !== -1) {
                out = '<b>' + gmxAPIutils.getText('Length') + '</b>: '
                    + gmxAPIutils.prettifyDistance(res, unitOptions.distanceUnit);
            } else if (type.indexOf('POLYGON') !== -1) {
                out = '<b>' + gmxAPIutils.getText('Area') + '</b>: '
                    + gmxAPIutils.prettifyArea(res, unitOptions.squareUnit);
            }
        }
        return out;
    },

    getGeometrySummary: function(geom, unitOptions) {
        return gmxAPIutils.getGeometriesSummary([geom], unitOptions || {});
    },

    chkOnEdge: function(p1, p2, ext) { // отрезок на границе
        if ((p1[0] < ext.min.x && p2[0] < ext.min.x) || (p1[0] > ext.max.x && p2[0] > ext.max.x)) { return true; }
        if ((p1[1] < ext.min.y && p2[1] < ext.min.y) || (p1[1] > ext.max.y && p2[1] > ext.max.y)) { return true; }
        return false;
    },

    getHidden: function(coords, tb) {  // массив точек на границах тайлов
        var hiddenLines = [],
            vectorSize = typeof coords[0] === 'number' ? 2 : 1,
            prev = null;
        for (var i = 0, len = coords.length; i < len; i += vectorSize) {
            var p = vectorSize === 1 ? coords[i] : [coords[i], coords[i + 1]];
            if (prev && gmxAPIutils.chkOnEdge(p, prev, tb)) {
                hiddenLines.push(i);
            }
            prev = p;
        }
        return hiddenLines;
    },

    getNormalizeBounds: function (screenBounds, mercDeltaY) { // get bounds array from -180 180 lng
        var northWest = screenBounds.getNorthWest(),
            southEast = screenBounds.getSouthEast(),
            minX = northWest.lng,
            maxX = southEast.lng,
            w = (maxX - minX) / 2,
            minX1 = null,
            maxX1 = null,
            out = [];

        if (w >= 180) {
            minX = -180; maxX = 180;
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
        var m1 = {x: minX, y: southEast.lat},
            m2 = {x: maxX, y: northWest.lat};

        if (mercDeltaY !== undefined) {
            m1 = L.Projection.Mercator.project(new L.LatLng([southEast.lat, minX]));
            m2 = L.Projection.Mercator.project(new L.LatLng([northWest.lat, maxX]));
            m1.y -= mercDeltaY;
            m2.y -= mercDeltaY;
        }
        out.push(gmxAPIutils.bounds([[m1.x, m1.y], [m2.x, m2.y]]));

        if (minX1) {
            var m11 = {x: minX1, y: southEast.lat},
                m12 = {x: maxX1, y: northWest.lat};
            if (mercDeltaY !== undefined) {
                m11 = L.Projection.Mercator.project(new L.LatLng([southEast.lat, minX1]));
                m12 = L.Projection.Mercator.project(new L.LatLng([northWest.lat, maxX1]));
                m11.y -= mercDeltaY;
                m12.y -= mercDeltaY;
            }
            out.push(gmxAPIutils.bounds([[m11.x, m11.y], [m12.x, m12.y]]));
        }
        return out;
    },

    toPrecision: function(x, prec) {
        var zn = Math.pow(10, prec ? prec : 4);
        return Math.round(zn * x) / zn;
    },
	getBoundsByTilePoint: function(tPoint) {  //tPoint - OSM tile point
		var gmt = gmxAPIutils.getTileNumFromLeaflet(tPoint);
		return gmxAPIutils.getTileBounds(gmt.x, gmt.y, gmt.z);
	},
    getTileBounds: function(x, y, z) {  //x, y, z - GeoMixer tile coordinates
        var tileSize = gmxAPIutils.tileSizes[z],
            minx = x * tileSize,
            miny = y * tileSize;
        return gmxAPIutils.bounds([[minx, miny], [minx + tileSize, miny + tileSize]]);
    },

    parseTemplate: function(str, properties) {
        var matches = str.match(/\[([^\]]+)\]/ig);
        if (matches) {
            for (var i = 0, len = matches.length; i < len; i++) {
                var key1 = matches[i],
                    key = key1.substr(1, key1.length - 2),
                    res = key in properties ? properties[key] : '';

                str = str.replace(key1, res);
            }
        }
        return str;
    },

    getDefaultBalloonTemplate: function(properties, tileAttributeTypes) {
        var str = '';
        for (var key in properties) {
            if (!tileAttributeTypes || (key in tileAttributeTypes)) {
				str += '<b>' + key + ':</b> [' +  key + ']<br />';
			}
        }
        str += '<br />[SUMMARY]<br />';
        return str;
    },

    parseBalloonTemplate: function(str, options) {
        var properties = options.properties;

        if (!str) {
            str = gmxAPIutils.getDefaultBalloonTemplate(properties, options.tileAttributeTypes);
        }
        var matches = str.match(/\[([^\]]+)\]/ig);
        if (matches) {
            var tileAttributeTypes = options.tileAttributeTypes,
                unitOptions = options.unitOptions,
                geometries = options.geometries;
            for (var i = 0, len = matches.length; i < len; i++) {
                var key1 = matches[i],
                    key = key1.substr(1, key1.length - 2),
                    res = '';

                if (key in properties) {
                    res = L.gmxUtil.attrToString(tileAttributeTypes[key], properties[key]);
                } else if (key === 'SUMMARY') {
                    res = options.summary || L.gmxUtil.getGeometriesSummary(geometries, unitOptions);
                }
                str = str.replace(key1, res);
            }
        }
        return str;
    },

    styleKeys: {
        marker: {
            server: ['image',   'angle',     'scale',     'minScale',     'maxScale',     'size',         'circle',     'center',     'color'],
            client: ['iconUrl', 'iconAngle', 'iconScale', 'iconMinScale', 'iconMaxScale', 'iconSize', 'iconCircle', 'iconCenter', 'iconColor']
        },
        outline: {
            server: ['color',  'opacity',   'thickness', 'dashes'],
            client: ['color',  'opacity',   'weight',    'dashArray']
        },
        fill: {
            server: ['color',     'opacity',   'image',       'pattern',     'radialGradient',     'linearGradient'],
            client: ['fillColor', 'fillOpacity', 'fillIconUrl', 'fillPattern', 'fillRadialGradient', 'fillLinearGradient']
        },
        label: {
            server: ['text',      'field',      'template',      'color',      'haloColor',      'size',          'spacing',      'align'],
            client: ['labelText', 'labelField', 'labelTemplate', 'labelColor', 'labelHaloColor', 'labelFontSize', 'labelSpacing', 'labelAlign']
        }
    },
    styleFuncKeys: {
        iconSize: 'iconSizeFunction',
        iconAngle: 'rotateFunction',
        iconScale: 'scaleFunction',
        iconColor: 'iconColorFunction',
        opacity: 'opacityFunction',
        fillOpacity: 'fillOpacityFunction',
        color: 'colorFunction',
        fillColor: 'fillColorFunction'
    },
    styleFuncError: {
        iconSize: function() { return 8; },
        iconAngle: function() { return 0; },
        iconScale: function() { return 1; },
        iconColor: function() { return 0xFF; },
        opacity: function() { return 1; },
        fillOpacity: function() { return 0.5; },
        color: function() { return 0xFF; },
        fillColor: function() { return 0xFF; }
    },
    defaultStyles: {
       MinZoom: 1,
       MaxZoom: 21,
       Filter: '',
       Balloon: '',
       DisableBalloonOnMouseMove: true,
       DisableBalloonOnClick: false,
       RenderStyle: {
            point: {    // old = {outline: {color: 255, thickness: 1}, marker:{size: 8}},
                color: 0xFF,
                weight: 1,
                iconSize: 8
            },
            linestring: {    // old = {outline: {color: 255, thickness: 1}},
                color: 0xFF,
                weight: 1
            },
            polygon: {    // old = {outline: {color: 255, thickness: 1}},
                color: 0xFF,
                weight: 1
            }
        }
    },

    getDefaultStyle: function(type) {
        var from = gmxAPIutils.defaultStyles,
            out = L.extend({}, from);
        out.RenderStyle = from.RenderStyle[type];
        return out;
    },

    toServerStyle: function(style) {   // Style leaflet->Scanex
        var out = {};

        for (var key in gmxAPIutils.styleKeys) {
            var keys = gmxAPIutils.styleKeys[key];
            for (var i = 0, len = keys.client.length; i < len; i++) {
                var key1 = keys.client[i];
                if (key1 in style) {
                    if (!out[key]) { out[key] = {}; }
                    var zn = style[key1];
                    if (key1 === 'opacity' || key1 === 'fillOpacity') {
                        zn *= 100;
                    }
                    out[key][keys.server[i]] = zn;
                }
            }
        }
        if ('iconAnchor' in style) {
            if (!out.marker) { out.marker = {}; }
            out.marker.dx = -style.iconAnchor[0];
            out.marker.dy = -style.iconAnchor[1];
        }
        return out;
    },

    fromServerStyle: function(style) {   // Style Scanex->leaflet
        var st, i, len, key, key1,
            out = {
                type: ''    // 'polygon', 'line', 'circle', 'square', 'image'
            };

        for (key in gmxAPIutils.styleKeys) {
            var keys = gmxAPIutils.styleKeys[key];
            for (i = 0, len = keys.client.length; i < len; i++) {
                key1 = keys.client[i];
                if (key1 in style) {
                    out[key1] = style[key1];
                }
            }
            st = style[key];
            if (st && typeof (st) === 'object') {
                for (i = 0, len = keys.server.length; i < len; i++) {
                    key1 = keys.server[i];
                    if (key1 in st) {
                        var newKey = keys.client[i],
                            zn = st[key1];
                        if (typeof (zn) === 'string') {
                            if (gmxAPIutils.styleFuncKeys[newKey]) {
/*eslint-disable no-useless-escape */
                                if (zn.match(/[^\d\.]/) === null) {
/*eslint-enable */
                                    zn = Number(zn);
                                } else {
                                    var func = L.gmx.Parsers.parseExpression(zn);
                                    if (func === null) {
                                        zn = gmxAPIutils.styleFuncError[newKey]();
                                    } else {
                                        out[gmxAPIutils.styleFuncKeys[newKey]] = func;
                                    }
                                }
                            }
                        } else if (key1 === 'opacity') {
                            zn /= 100;
                        }
                        out[newKey] = zn;
                    }
                }
            }
        }
        if (style.marker) {
            st = style.marker;
            if ('dx' in st || 'dy' in st) {
                var dx = st.dx || 0,
                    dy = st.dy || 0;
                out.iconAnchor = [-dx, -dy];    // For leaflet type iconAnchor
            }
        }
        for (key in style) {
			if (!gmxAPIutils.styleKeys[key]) {
				out[key] = style[key];
			}
        }
        return out;
    },

    getUnixTimeFromStr: function(st) {
		var arr1 = L.Util.trim(st).split(' '),
			arr = arr1[0].split('.'),
			tm = arr1[1] ? arr1[1].split(':') : [0, 0, 0];

        if (arr[2].length === 4) {
			arr = arr.reverse();
		}
		return Date.UTC(arr[0], arr[1] - 1, arr[2], tm[0] || 0, tm[1] || 0, tm[2] || 0) / 1000;
    },

    getDateFromStr: function(st) {
		var arr = L.Util.trim(st).split(' ');
		arr = arr[0].split('.');

        if (arr[2].length === 4) {
			arr = arr.reverse();
		}
		var dt = new Date(arr[0], arr[1] - 1, arr[2]);
        return dt;
    },

    getUTCdate: function(utime) {
        var dt = new Date(utime * 1000);

        return [
            dt.getUTCFullYear(),
            gmxAPIutils.pad2(dt.getUTCMonth() + 1),
            gmxAPIutils.pad2(dt.getUTCDate())
        ].join('.');
    },

    getUTCtime: function(utime) {
        var h = Math.floor(utime / 3600),
            m = Math.floor((utime - h * 3600) / 60),
            s = Math.floor(utime - h * 3600 - m * 60);

        return [
            //gmxAPIutils.pad2(h - new Date().getTimezoneOffset() / 60),
            gmxAPIutils.pad2(h),
            gmxAPIutils.pad2(m),
            gmxAPIutils.pad2(s)
        ].join(':');
    },

    getUTCdateTime: function(utime) {
        var time = utime % (3600 * 24);

        if (time) {
            return [
                gmxAPIutils.getUTCdate(utime),
                gmxAPIutils.getUTCtime(utime % (3600 * 24))
            ].join(' ');
        } else {
            return gmxAPIutils.getUTCdate(utime);
        }
    },

    attrToString: function(type, value) {
        if (type === 'date') {
            return value ? L.gmxUtil.getUTCdate(value) : value;
        } else if (type === 'time') {
            return value ? L.gmxUtil.getUTCtime(value) : value;
        } else if (type === 'datetime') {
            return value ? L.gmxUtil.getUTCdateTime(value) : value;
        } else {
            return value;
        }
    },

    getTileAttributes: function(prop) {
        var tileAttributeIndexes = {},
            tileAttributeTypes = {};
        if (prop.attributes) {
            var attrs = prop.attributes,
                attrTypes = prop.attrTypes || null;
            if (prop.identityField) { tileAttributeIndexes[prop.identityField] = 0; }
            for (var a = 0; a < attrs.length; a++) {
                var key = attrs[a];
                tileAttributeIndexes[key] = a + 1;
                tileAttributeTypes[key] = attrTypes ? attrTypes[a] : 'string';
            }
        }
        return {
            tileAttributeTypes: tileAttributeTypes,
            tileAttributeIndexes: tileAttributeIndexes
        };
	}
};

gmxAPIutils.lambertCoefX = 100 * gmxAPIutils.distVincenty(0, 0, 0.01, 0);				// 111319.5;
gmxAPIutils.lambertCoefY = 100 * gmxAPIutils.distVincenty(0, 0, 0, 0.01) * 180 / Math.PI;	// 6335440.712613423;

(function() {
    //pre-calculate tile sizes
    for (var z = 0; z < 30; z++) {
        gmxAPIutils.tileSizes[z] = gmxAPIutils.worldWidthFull / Math.pow(2, z);
    }
})();
gmxAPIutils.worldWidthMerc = gmxAPIutils.worldWidthFull / 2;

gmxAPIutils.Bounds = function(arr) {
    this.min = {
        x: Number.MAX_VALUE,
        y: Number.MAX_VALUE
    };
    this.max = {
        x: -Number.MAX_VALUE,
        y: -Number.MAX_VALUE
    };
    this.extendArray(arr);
};
gmxAPIutils.Bounds.prototype = {
    extend: function(x, y) {
        if (x < this.min.x) { this.min.x = x; }
        if (x > this.max.x) { this.max.x = x; }
        if (y < this.min.y) { this.min.y = y; }
        if (y > this.max.y) { this.max.y = y; }
        return this;
    },
    extendBounds: function(bounds) {
        return this.extendArray([[bounds.min.x, bounds.min.y], [bounds.max.x, bounds.max.y]]);
    },
    extendArray: function(arr) {
        if (!arr || !arr.length) { return this; }
        var i, len;
        if (typeof arr[0] === 'number') {
            for (i = 0, len = arr.length; i < len; i += 2) {
                this.extend(arr[i], arr[i + 1]);
            }
        } else {
            for (i = 0, len = arr.length; i < len; i++) {
                this.extend(arr[i][0], arr[i][1]);
            }
        }
        return this;
    },
    addBuffer: function(dxmin, dymin, dxmax, dymax) {
        this.min.x -= dxmin;
        this.min.y -= dymin || dxmin;
        this.max.x += dxmax || dxmin;
        this.max.y += dymax || dymin || dxmin;
        return this;
    },
    contains: function (point) { // ([x, y]) -> Boolean
        var min = this.min, max = this.max,
            x = point[0], y = point[1];
        return x >= min.x && x <= max.x && y >= min.y && y <= max.y;
    },
    getCenter: function () {
        var min = this.min, max = this.max;
        return [(min.x + max.x) / 2, (min.y + max.y) / 2];
    },
    addOffset: function (offset) {
        this.min.x += offset[0]; this.max.x += offset[0];
        this.min.y += offset[1]; this.max.y += offset[1];
        return this;
    },
    intersects: function (bounds) { // (Bounds) -> Boolean
        var min = this.min,
            max = this.max,
            min2 = bounds.min,
            max2 = bounds.max;
        return max2.x > min.x && min2.x < max.x && max2.y > min.y && min2.y < max.y;
    },
    intersectsWithDelta: function (bounds, dx, dy) { // (Bounds, dx, dy) -> Boolean
        var min = this.min,
            max = this.max,
            x = dx || 0,
            y = dy || 0,
            min2 = bounds.min,
            max2 = bounds.max;
        return max2.x + x > min.x && min2.x - x < max.x && max2.y + y > min.y && min2.y - y < max.y;
    },
    isEqual: function (bounds) { // (Bounds) -> Boolean
        var min = this.min,
            max = this.max,
            min2 = bounds.min,
            max2 = bounds.max;
        return max2.x === max.x && min2.x === min.x && max2.y === max.y && min2.y === min.y;
    },
    isNodeIntersect: function (coords) {
        for (var i = 0, len = coords.length; i < len; i++) {
            if (this.contains(coords[i])) {
                return {
                    num: i,
                    point: coords[i]
                };
            }
        }
        return null;
    },

	clipPolygon: function (points, round) {
		if (points.length) {
			var clippedPoints,
				edges = [1, 4, 2, 8],
				i, j, k,
				a, b,
				len, edge, p;

			if (L.LineUtil.isFlat(points)) {
				var coords = points;
				points = coords.map(function(it) {
					return new L.Point(it[0], it[1], round);
				});
			}
			for (i = 0, len = points.length; i < len; i++) {
				points[i]._code = this._getBitCode(points[i]);
			}

			// for each edge (left, bottom, right, top)
			for (k = 0; k < 4; k++) {
				edge = edges[k];
				clippedPoints = [];

				for (i = 0, len = points.length, j = len - 1; i < len; j = i++) {
					a = points[i];
					b = points[j];

					// if a is inside the clip window
					if (!(a._code & edge)) {
						// if b is outside the clip window (a->b goes out of screen)
						if (b._code & edge) {
							p = this._getEdgeIntersection(b, a, edge, round);
							p._code = this._getBitCode(p);
							clippedPoints.push(p);
						}
						clippedPoints.push(a);

					// else if b is inside the clip window (a->b enters the screen)
					} else if (!(b._code & edge)) {
						p = this._getEdgeIntersection(b, a, edge, round);
						p._code = this._getBitCode(p);
						clippedPoints.push(p);
					}
				}
				points = clippedPoints;
			}
		}

		return points.map(function(it) {
			return [it.x, it.y];
		});
	},

	_getBitCode: function (p) {
		var code = 0;

		if (p.x < this.min.x) { // left
			code |= 1;
		} else if (p.x > this.max.x) { // right
			code |= 2;
		}

		if (p.y < this.min.y) { // bottom
			code |= 4;
		} else if (p.y > this.max.y) { // top
			code |= 8;
		}

		return code;
	},

	_getEdgeIntersection: function (a, b, code, round) {
		var dx = b.x - a.x,
			dy = b.y - a.y,
			min = this.min,
			max = this.max,
			x, y;

		if (code & 8) { // top
			x = a.x + dx * (max.y - a.y) / dy;
			y = max.y;

		} else if (code & 4) { // bottom
			x = a.x + dx * (min.y - a.y) / dy;
			y = min.y;

		} else if (code & 2) { // right
			x = max.x;
			y = a.y + dy * (max.x - a.x) / dx;

		} else if (code & 1) { // left
			x = min.x;
			y = a.y + dy * (min.x - a.x) / dx;
		}

		return new L.Point(x, y, round);
	},

    clipPolyLine: function (coords, angleFlag, delta) { // (coords) -> clip coords
        delta = delta || 0;
        var min = this.min,
            max = this.max,
            bbox = [min.x - delta, min.y - delta, max.x + delta, max.y + delta],
            bitCode = function (p) {
                var code = 0;

                if (p[0] < bbox[0]) code |= 1; // left
                else if (p[0] > bbox[2]) code |= 2; // right

                if (p[1] < bbox[1]) code |= 4; // bottom
                else if (p[1] > bbox[3]) code |= 8; // top

                return code;
            },
            getAngle = function (a, b) {
                return Math.PI / 2 + Math.atan2(b[1] - a[1], a[0] - b[0]);
            },
            intersect = function (a, b, edge) {
                return edge & 8 ? [a[0] + (b[0] - a[0]) * (bbox[3] - a[1]) / (b[1] - a[1]), bbox[3]] : // top
                       edge & 4 ? [a[0] + (b[0] - a[0]) * (bbox[1] - a[1]) / (b[1] - a[1]), bbox[1]] : // bottom
                       edge & 2 ? [bbox[2], a[1] + (b[1] - a[1]) * (bbox[2] - a[0]) / (b[0] - a[0])] : // right
                       edge & 1 ? [bbox[0], a[1] + (b[1] - a[1]) * (bbox[0] - a[0]) / (b[0] - a[0])] : // left
                       null;
            },
            result = [],
            len = coords.length,
            codeA = bitCode(coords[0], bbox),
            part = [],
            i, a, b, c, codeB, lastCode;

        for (i = 1; i < len; i++) {
            a = coords[i - 1];
            b = coords[i];
            if (a[0] === b[0] && a[1] === b[1]) { continue; }
            codeB = lastCode = bitCode(b, bbox);

            while (true) {

                if (!(codeA | codeB)) { // accept
                    if (angleFlag) {
                        a[2] = getAngle(a, b);
                        c = coords[i + 1];
                        b[2] = c ? getAngle(b, c) : a[2];
                    }
                    part.push(a);

                    if (codeB !== lastCode) { // segment went outside
                        part.push(b);

                        if (i < len - 1) { // start a new line
                            result.push(part);
                            part = [];
                        }
                    } else if (i === len - 1) {
                        part.push(b);
                    }
                    break;

                } else if (codeA & codeB) { // trivial reject
                    break;

                } else if (codeA) { // a outside, intersect with clip edge
                    a = intersect(a, b, codeA, bbox);
                    codeA = bitCode(a, bbox);

                } else { // b outside
                    b = intersect(a, b, codeB, bbox);
                    codeB = bitCode(b, bbox);
                }
            }

            codeA = lastCode;
        }

        if (part.length) result.push(part);

        return result;
    },
    toLatLngBounds: function(isWebMerc) {
		var proj = L.Projection.Mercator,
			min = proj.unproject(this.min),
			max = proj.unproject(this.max),
			arr = [[min.lat, min.lng], [max.lat, max.lng]];

		if (isWebMerc) {
			arr[0][0] = gmxAPIutils.fromWebMercY(this.min.y);
			arr[1][0] = gmxAPIutils.fromWebMercY(this.max.y);
		}
		return L.latLngBounds(arr);
    }
};

gmxAPIutils.bounds = function(arr) {
    return new gmxAPIutils.Bounds(arr);
};

//скопирована из API для обеспечения независимости от него
gmxAPIutils.parseUri = function (str) {
    var	o   = gmxAPIutils.parseUri.options,
        m   = o.parser[o.strictMode ? 'strict' : 'loose'].exec(str),
        uri = {},
        i   = 14;

    while (i--) {
        uri[o.key[i]] = m[i] || '';
    }

    uri[o.q.name] = {};
    uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
        if ($1) { uri[o.q.name][$1] = $2; }
    });

    uri.hostOnly = uri.host;
    uri.host = uri.authority; // HACK

    return uri;
};

gmxAPIutils.parseUri.options = {
    strictMode: false,
    key: ['source', 'protocol', 'authority', 'userInfo', 'user', 'password', 'host', 'port', 'relative', 'path', 'directory', 'file', 'query', 'anchor'],
    q:   {
        name:   'queryKey',
        parser: /(?:^|&)([^&=]*)=?([^&]*)/g
    },
/*eslint-disable no-useless-escape */
    parser: {
        strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
        loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
    }
/*eslint-enable */
};

gmxAPIutils.layerHelper = {
	/**
	 *  Модифицирует объекты внутри векторного слоя, отправляя изменения на сервер и информируя об этом API
	 *
	 * @memberOf _mapHelper
	 * @name modifyObjectLayer
	 * @function
	 * @param {String} layerName Имя слоя
	 * @param {Object[]} objs Массив описания объектов. Каждое описание представляет из себя объект:
	 *
	 *  * id {String} ID объекта слоя, над которым производятся изменения (только для модификации и удаления)
	 *  * geometry Описание геометрии (вставка и изменение). GeoJSON
	 *  * source: {rc: <name КР-источника>, rcobj: <id объекта внутри КР>}
	 *  * properties Свойства объекта (вставка и изменение)
	 *  * action {'delete'|'insert'|'update'} Производимое действие. Если не указано, то вычисляется следующим образом:
	 *    * Если не указан id, то вставка
	 *    * Если указан id, то модифицируем
	 *    * Для удаления объекта нужно явно прописать параметр
	 * @param {String} [crs='EPSG:3395'] Название системы координат геометрии объектов. Поддерживаются 3395, 4326, 3857
	 * @return {jQuery.Deferred} Ресолвится в соответствии с ответом сервера
	*/
	modifyObject: function(url, layerName, objs, crs) {
		return new Promise(function(resolve, reject) {
			objs.forEach(function(obj) {
				obj.action = obj.action || (obj.id ? 'update' : 'insert');
			});
			var params = {
				WrapStyle: 'None',
				LayerName: layerName,
				objects: JSON.stringify(objs)
			};
			params['geometry_cs'] = crs ? crs : 'EPSG:4326';

			L.gmxUtil.sendCrossDomainPostRequest(url,
				params
				,
				function(res) {
					if (res && res.Status === 'ok') {
						L.gmx.layersVersion.chkVersion(layerName);
						resolve(res.Result);
					} else {
						reject();
					}
				}
			)
		}).catch(console.log);
    }
};

if (!L.gmxUtil) { L.gmxUtil = {}; }

//public interface
L.extend(L.gmxUtil, {
	debug: gmxAPIutils.debug,
	createWorker: gmxAPIutils.createWorker,
	apiLoadedFrom: gmxAPIutils.apiLoadedFrom,
    newId: gmxAPIutils.newId,
	isPageHidden: gmxAPIutils.isPageHidden,
    protocol: location.protocol !== 'https:' ? 'http:' : location.protocol,
	prefixURL: location.href.substr(0, location.href.lastIndexOf('/') + 1),
    loaderStatus: function () {},
    isIE9: gmxAPIutils.isIE(9),
    isIE10: gmxAPIutils.isIE(10),
    isIE11: gmxAPIutils.isIE(11),
    gtIE11: gmxAPIutils.gtIE(11),
	getText: gmxAPIutils.getText,
    getFormData: gmxAPIutils.getFormData,
    requestJSONP: gmxAPIutils.requestJSONP,
    requestLink: gmxAPIutils.requestLink,
    getCadastreFeatures: gmxAPIutils.getCadastreFeatures,
    request: gmxAPIutils.request,
    getLayerItemFromServer: gmxAPIutils.getLayerItemFromServer,
    fromServerStyle: gmxAPIutils.fromServerStyle,
    toServerStyle: gmxAPIutils.toServerStyle,
    getDefaultStyle: gmxAPIutils.getDefaultStyle,
    bounds: gmxAPIutils.bounds,
    getNormalizeBounds: gmxAPIutils.getNormalizeBounds,
    getGeometryBounds: gmxAPIutils.getGeometryBounds,
    tileSizes: gmxAPIutils.tileSizes,
    getDateFromStr: gmxAPIutils.getDateFromStr,
    getUnixTimeFromStr: gmxAPIutils.getUnixTimeFromStr,
    getUTCdate: gmxAPIutils.getUTCdate,
    getUTCtime: gmxAPIutils.getUTCtime,
    getUTCdateTime: gmxAPIutils.getUTCdateTime,
    attrToString: gmxAPIutils.attrToString,
    getTileAttributes: gmxAPIutils.getTileAttributes,
    formatCoordinates: function (latlng, type) {
        return gmxAPIutils['formatCoordinates' + (type ? '2' : '')](latlng.lng, latlng.lat);
    },
    formatDegrees: gmxAPIutils.formatDegrees,
    pad2: gmxAPIutils.pad2,
    dec2hex: gmxAPIutils.dec2hex,
	dec2rgba: gmxAPIutils.dec2rgba,
    trunc: gmxAPIutils.trunc,
    latLonFormatCoordinates: gmxAPIutils.latLonFormatCoordinates,
    latLonFormatCoordinates2: gmxAPIutils.latLonFormatCoordinates2,
    latLonToString: gmxAPIutils.latLonToString,
    toPrecision: gmxAPIutils.toPrecision,
    getLength: gmxAPIutils.getLength,
    geoLength: gmxAPIutils.geoLength,
    prettifyDistance: gmxAPIutils.prettifyDistance,
    getArea: gmxAPIutils.getArea,
    prettifyArea: gmxAPIutils.prettifyArea,
    geoArea: gmxAPIutils.geoArea,
    parseBalloonTemplate: gmxAPIutils.parseBalloonTemplate,
    setSVGIcon: gmxAPIutils.setSVGIcon,
    getSVGIcon: gmxAPIutils.getSVGIcon,
    getCoordinatesString: gmxAPIutils.getCoordinatesString,
    getGeometriesSummary: gmxAPIutils.getGeometriesSummary,
    getGeometrySummary: gmxAPIutils.getGeometrySummary,
    getGeoJSONSummary: gmxAPIutils.getGeoJSONSummary,
    getPropertiesHash: gmxAPIutils.getPropertiesHash,
    distVincenty: gmxAPIutils.distVincenty,
    parseCoordinates: gmxAPIutils.parseCoordinates,
    geometryToGeoJSON: gmxAPIutils.geometryToGeoJSON,
    coordsFromMercator: gmxAPIutils.coordsFromMercator,
    convertGeometry: gmxAPIutils.convertGeometry,
    transformGeometry: gmxAPIutils.transformGeometry,
    geoJSONtoGeometry: gmxAPIutils.geoJSONtoGeometry,
    geoJSONGetArea: gmxAPIutils.geoJSONGetArea,
    geoJSONGetLength: gmxAPIutils.geoJSONGetLength,
    geoJSONGetLatLng: gmxAPIutils.geoJSONGetLatLng,
	fromWebMercY: gmxAPIutils.fromWebMercY,
    parseUri: gmxAPIutils.parseUri,
    isRectangle: gmxAPIutils.isRectangle,
    isClockwise: gmxAPIutils.isClockwise,
    isPointInPolygonWithHoles: gmxAPIutils.isPointInPolygonWithHoles,
    getPatternIcon: gmxAPIutils.getPatternIcon,
    getCircleLatLngs: gmxAPIutils.getCircleLatLngs,
    normalizeHostname: gmxAPIutils.normalizeHostname,
    getTileBounds: gmxAPIutils.getTileBounds,
	getBoundsByTilePoint: gmxAPIutils.getBoundsByTilePoint,
    parseTemplate: gmxAPIutils.parseTemplate
});

L.gmxUtil.layerHelper = gmxAPIutils.layerHelper;

L.gmxUtil.isOldVersion = L.version.substr(0, 3) === '0.7';
L.gmxUtil.isIEOrEdge = L.gmxUtil.gtIE11 || L.gmxUtil.isIE11 || L.gmxUtil.isIE10 || L.gmxUtil.isIE9;
if (!('requestIdleCallback' in window)) {
	window.requestIdleCallback = function(func, opt) {
		var timeout = opt ? opt.timeout : 0;
		return window.setTimeout(func, timeout);
	}
	window.cancelIdleCallback = window.clearTimeout;
}

if (!String.prototype.eval) {	// ES6-like template strings in ES5 - example: 'Hello, ${nested["greeting"]}!'.eval(data);
/*eslint-disable */
	String.prototype.eval = function(data) {
	  return this.replace(/\${(.*?)}/g, function(_, code) {
		var scoped = code.replace(/(["'\.\w\$]+)/g, function(match) {
		  return /["']/.test(match[0]) ? match : 'scope.' + match;
		});
		try {
		  return new Function('scope', 'return '+ scoped)(data);
		} catch (e) { return ''; }
	  });
	}
/*eslint-enable */
}

L.gmx = L.gmx || {};
L.gmx.gmxProxy = '//maps.kosmosnimki.ru/ApiSave.ashx';

(function() {
    var requests = {};
    var lastRequestId = 0;

    var processMessage = function(e) {

        if (!(e.origin in requests)) {
            return;
        }

        var dataStr = decodeURIComponent(e.data.replace(/\n/g, '\n\\'));
        try {
            var dataObj = JSON.parse(dataStr);
        } catch (ev) {
            console.log({Status:'error', ErrorInfo: {ErrorMessage: 'JSON.parse exeption', ExceptionType: 'JSON.parse', StackTrace: dataStr}});
        }
        var request = requests[e.origin][dataObj.CallbackName];
        if (!request) {
            return;    // message от других запросов
        }

        delete requests[e.origin][dataObj.CallbackName];
        delete dataObj.CallbackName;

        if (request.iframe.parentNode) {
            request.iframe.parentNode.removeChild(request.iframe);
        }
        if ('callback' in request) { request.callback(dataObj); }
    };

    L.DomEvent.on(window, 'message', processMessage);

    function createPostIframe2(id, callback, url) {
        var uniqueId = 'gmxAPIutils_id' + (lastRequestId++),
            iframe = L.DomUtil.create('iframe');

        iframe.style.display = 'none';
        iframe.setAttribute('id', id);
        iframe.setAttribute('name', id);    /*eslint-disable no-script-url */
        iframe.src = 'javascript:true';     /*eslint-enable */
        iframe.callbackName = uniqueId;

        var parsedURL = gmxAPIutils.parseUri(url);
        var origin = (parsedURL.protocol ? (parsedURL.protocol + ':') : L.gmxUtil.protocol) + '//' + (parsedURL.host || window.location.host);

        requests[origin] = requests[origin] || {};
        requests[origin][uniqueId] = {callback: callback, iframe: iframe};

        return iframe;
    }

	//расширяем namespace
    gmxAPIutils.createPostIframe2 = createPostIframe2;

})();

// кроссдоменный POST запрос
(function()
{
	/** Посылает кроссдоменный POST запрос
	* @namespace L.gmxUtil
    * @ignore
	* @function
	*
	* @param url {string} - URL запроса
	* @param params {object} - хэш параметров-запросов
	* @param callback {function} - callback, который вызывается при приходе ответа с сервера. Единственный параметр ф-ции - собственно данные
	* @param baseForm {DOMElement} - базовая форма запроса. Используется, когда нужно отправить на сервер файл.
	*                                В функции эта форма будет модифицироваться, но после отправления запроса будет приведена к исходному виду.
	*/
	function sendCrossDomainPostRequest(url, params, callback, baseForm) {
        var form,
            id = '$$iframe_' + gmxAPIutils.newId();

        var iframe = gmxAPIutils.createPostIframe2(id, callback, url),
            originalFormAction;

        if (baseForm) {
            form = baseForm;
            originalFormAction = form.getAttribute('action');
            form.setAttribute('action', url);
            form.target = id;
        } else if (L.Browser.ielt9) {
            var str = '<form id=' + id + '" enctype="multipart/form-data" style="display:none" target="' + id + '" action="' + url + '" method="post"></form>';
            form = document.createElement(str);
        } else {
            form = document.createElement('form');
            form.style.display = 'none';
            form.setAttribute('enctype', 'multipart/form-data');
            form.target = id;
            form.setAttribute('method', 'POST');
            form.setAttribute('action', url);
            form.id = id;
        }

        var hiddenParamsDiv = document.createElement('div');
        hiddenParamsDiv.style.display = 'none';

        if (params.WrapStyle === 'window') {
            params.WrapStyle = 'message';
        }

        if (params.WrapStyle === 'message') {
            params.CallbackName = iframe.callbackName;
        }

        for (var paramName in params) {
            var input = document.createElement('input');
            var value = typeof params[paramName] !== 'undefined' ? params[paramName] : '';
            input.setAttribute('type', 'hidden');
            input.setAttribute('name', paramName);
            input.setAttribute('value', value);
            hiddenParamsDiv.appendChild(input);
        }

        form.appendChild(hiddenParamsDiv);

        if (!baseForm) {
            document.body.appendChild(form);
        }
        document.body.appendChild(iframe);

        form.submit();

        if (baseForm) {
            form.removeChild(hiddenParamsDiv);
            if (originalFormAction !== null) {
                form.setAttribute('action', originalFormAction);
            } else {
                form.removeAttribute('action');
            }
        } else {
            form.parentNode.removeChild(form);
        }
    }
    //расширяем namespace
    L.gmxUtil.sendCrossDomainPostRequest = gmxAPIutils.sendCrossDomainPostRequest = sendCrossDomainPostRequest;
})();


/*
   Single-pass recursive descent PEG parser library:
      http://en.wikipedia.org/wiki/Parsing_expression_grammar
   Inspired by Chris Double's parser combinator library in JavaScript:
      http://www.bluishcoder.co.nz/2007/10/javascript-packrat-parser.html
	+ Добавлены функции: Math.floor
*/
(function() {
    var regexExpression = /\[(.+?)\]/g,
        regexMath = /(floor\()/g;
	var Parsers = {						// Парсеры
        functionFromExpression: function(s) {
/*eslint-disable no-new-func*/
            return new Function(
/*eslint-enable */
                'props',
                'indexes',
                'return ' +
                    s
                     .replace(regexExpression, 'props[indexes["$1"]]')
                     .replace(regexMath, 'Math.$1')
                    + ';'
            );
        }
    };

	var makePair = function(t1, t2) {
		return {head: t1, tail: t2};
	};

// C-style linked list via recursive typedef.
//   Used purely functionally to get shareable sublists.
//typedef LinkedList = Pair<Dynamic, LinkedList>;
	var LinkedList = function(t1, t2) {
		return makePair(t1, t2);
	};

// Parser state contains position in string and some accumulated data.
//typedef ParserState = Pair<Int, LinkedList>;
	var ParserState = function(t1, t2) {
		return makePair(t1, t2);
	};

// Parser accepts string and state, returns another state.
//typedef Parser = String->ParserState->ParserState;

	// A parser state that indicates failure.
	var fail = new ParserState(-1, null);

	// Check for failure.
	var failed = function(state) {
		return (state.head === -1);
	};

	// Advance a parser state by n characters.
	var advance = function(state, n) {
		return new ParserState(state.head + n, state.tail);
	};

	// Match a specified string.
	var token = function(tok) {
		var len = tok.length;
		return function(s, state) {
			return (s.substr(state.head, len) === tok) ? advance(state, len) : fail;
		};
	};

	// Match a string without regard to case.
	var caseInsensitiveToken = function(tok) {
		var len = tok.length;
		tok = tok.toLowerCase();
		return function(s, state) {
			return (s.substr(state.head, len).toLowerCase() === tok) ? advance(state, len) : fail;
		};
	};

	// Match a single character in a specified range.
	var range = function(startChar, endChar) {
		var startCode = startChar.charCodeAt(0);
		var endCode = endChar.charCodeAt(0);
		return function(s, state) {
			var code = s.charCodeAt(state.head);
			return ((code >= startCode) && (code <= endCode)) ? advance(state, 1) : fail;
		};
	};

	// Match any character outside a certain set.
	//   This combinator is intended only for single character parsers.
	var anythingExcept = function(parser) {
		return function(s, state) {
			return ((s.length > state.head) && failed(parser(s, state))) ? advance(state, 1) : fail;
		};
	};

	// Match thing1, then thing2, ..., then thingN.
	var sequence = function(parsers) {
		return function(s, state) {
			for (var i = 0; i < parsers.length; i++) {
				state = parsers[i](s, state);
				if (failed(state)) {
					return fail;
                }
			}
			return state;
		};
	};

	// Match thing1, or thing2, ..., or thingN.
	var choice = function(parsers) {
		return function(s, state) {
			for (var i = 0; i < parsers.length; i++) {
				var newState = parsers[i](s, state);
				if (!failed(newState)) {
					return newState;
                }
			}
			return fail;
		};
	};

	// Match immediately, without regard to what's in the string.
	var nothing = function(s, state) {
		return state;
	};

	// Match this thing or nothing.
	var maybe = function(parser) {
		return choice([parser, nothing]);
	};

	// Match minCount or more repetitions of this thing.
	var repeat = function(minCount, parser) {
		return function(s, state) {
			var count = 0;
			while (true) {
				var newState = parser(s, state);
				if (failed(newState)) {
					return (count >= minCount) ? state : fail;
				} else {
					count += 1;
					state = newState;
				}
			}
			// return fail;
		};
	};

	// Match a list of minCount or more instances of thing1, separated by thing2.
	var separatedList = function(minCount, parser, separator) {
		var parser1 = sequence([parser, repeat(minCount - 1, sequence([separator, parser]))]);
		return (minCount > 0) ? parser1 : choice([parser1, nothing]);
	};

	var whitespace = repeat(0, choice([
		token(' '),
		token('\t'),
		token('\n')
	]));

	// Same as separatedList, but can have whitespace between items and separators.
	var whitespaceSeparatedList = function(minCount, parser, separator) {
		return separatedList(minCount, parser, sequence([whitespace, separator, whitespace]));
	};

	// Same as sequence, but can have whitespace between items.
	var whitespaceSeparatedSequence = function(parsers) {
		var newParsers = [];
		for (var i = 0; i < parsers.length; i++) {
			if (newParsers.length > 0) { newParsers.push(whitespace); }
			newParsers.push(parsers[i]);
		}
		return sequence(newParsers);
	};

	// This combinator captures the string that the parser matched
	//   and adds it to the current parser state, consing a new state.
	var capture = function(parser) {
		return function(s, state) {
			var newState = parser(s, state);
			return failed(newState) ? fail : new ParserState(newState.head, new LinkedList(s.substr(state.head, newState.head - state.head), newState.tail));
		};
	};

	// This combinator passes the accumulated parser state to a given
	//  function for processing. The result goes into the new state.
	var action = function(parser, func) {
		return function(s, state) {
			var oldState = state;
			var newState = parser(s, new ParserState(oldState.head, null));
			return failed(newState) ? fail : new ParserState(newState.head, new LinkedList(func(newState.tail), oldState.tail));
		};
	};

	// Define a syntactic subset of SQL WHERE clauses.
	var fieldName = capture(repeat(1, choice([
		range('a', 'z'),
		range('A', 'Z'),
		range('а', 'я'),
		range('А', 'Я'),
		range('0', '9'),
		token('_')
	])));

	var fieldNameWithSpaces = capture(repeat(1, choice([
		range('a', 'z'),
		range('A', 'Z'),
		range('а', 'я'),
		range('А', 'Я'),
		range('0', '9'),
		token('_'),
		token(' ')
	])));

	var quotedFieldName = choice([
		fieldName,
		sequence([token('"'), fieldNameWithSpaces, token('"')]),
		sequence([token('`'), fieldNameWithSpaces, token('`')])
	]);

	var stringLiteral = sequence([
		token('\''),
		capture(repeat(0, anythingExcept(token('\'')))),
		token('\'')
	]);

	var digits = repeat(1, range('0', '9'));

	var numberLiteral = capture(sequence([
		maybe(token('-')),
		digits,
		maybe(sequence([token('.'), digits]))
	]));

	var literal = choice([numberLiteral, stringLiteral]);

	var applyParser = function(s, parser) {
		return parser(s, new ParserState(0, null));
	};

	// Order is important here: longer ops should be tried first.
	var opTerm = action(
		whitespaceSeparatedSequence([
			quotedFieldName,
			capture(choice([
				token('=='),
				token('!='),
				token('<>'),
				token('<='),
				token('>='),
				token('='),
				token('<'),
				token('>'),
				caseInsensitiveToken('LIKE')
			])),
            choice([literal, quotedFieldName])
		]),
		function(state) {
			// Linked list contains fieldname, operation, value
			// (in reverse order).

			var fieldName = state.tail.tail.head;
			var op = state.tail.head;
			var referenceValue = state.head;

			var matchPattern = null;
			if (op.toUpperCase() === 'LIKE') {
				matchPattern = function(fieldValue) {
					var matchFrom = null;
					matchFrom = function(referenceIdx, fieldIdx) {
						var referenceChar = referenceValue.charAt(referenceIdx);
						var fieldChar = fieldValue.charAt(fieldIdx);
						if (referenceChar === '') {
							return (fieldChar === '');
						} else if (referenceChar === '%') {
							return matchFrom(referenceIdx + 1, fieldIdx) || ((fieldChar !== '') && matchFrom(referenceIdx, fieldIdx + 1));
						} else {
							return (referenceChar === fieldChar) && matchFrom(referenceIdx + 1, fieldIdx + 1);
                        }
					};
					return matchFrom(0, 0);
				};
			}

			return function(props, indexes, types) {
				var fieldValue = props[indexes[fieldName]],
                    rValue = referenceValue;
                if (referenceValue in indexes) { rValue = props[indexes[rValue]]; }
                if ((types[fieldName] === 'date' || types[fieldName] === 'datetime') && typeof rValue === 'string') { rValue = L.gmxUtil.getUnixTimeFromStr(rValue); }
                if (typeof fieldValue === 'boolean' && typeof rValue === 'string') {
                    fieldValue = fieldValue ? 'True' : 'False';
                }
				if (fieldValue === null) { return false; }
				if (matchPattern !== null) { return matchPattern(fieldValue);
/*eslint-disable eqeqeq */
                } else if ((op === '=') || (op === '==')) { return (fieldValue == rValue);
				} else if ((op === '!=') || (op === '<>')) { return (fieldValue != rValue);
/*eslint-enable */
                } else {
                    var f1, f2;
					if (!(referenceValue in indexes) && typeof rValue === 'string' && applyParser(rValue, numberLiteral).head === rValue.length) {
						f1 = parseFloat(fieldValue);
						f2 = parseFloat(rValue);
						if (op === '<') { return (f1 < f2);
						} else if (op === '>') { return (f1 > f2);
						} else if (op === '<=') { return (f1 <= f2);
						} else if (op === '>=') { return (f1 >= f2);
						} else { return false;
                        }
					} else {
						f1 = fieldValue;
						f2 = rValue;
						if (op === '<') { return (f1 < f2);
						} else if (op === '>') { return (f1 > f2);
						} else if (op === '<=') { return (f1 <= f2);
						} else if (op === '>=') { return (f1 >= f2);
						} else { return false;
                        }
					}
				}
			};
		}
	);

	var inTerm = action(
		whitespaceSeparatedSequence([
			quotedFieldName,
			caseInsensitiveToken('IN'),
			token('('),
			whitespaceSeparatedList(0, literal, token(',')),
			token(')')
		]),
		function(state) {
			// Linked list contains fieldname and multiple values
			//   (in reverse order).

			var node = state;
			while (node.tail != null) {
				node = node.tail;
			}
            var fieldName = node.head;

			return function(props, indexes) {
				var value = props[indexes[fieldName]];
				if (value == null) { return false; }
				var node = state;
				while (node.tail !== null) {
					if (node.head === value) { return true; }
					node = node.tail;
				}
				return false;
			};
		}
	);

	// Forward declarations to allow mutually recursive grammar definitions.
	var term = function(s, state) { return term(s, state); };
	var expression = function(s, state) { return expression(s, state); };

	var notTerm = action(
		whitespaceSeparatedSequence([caseInsensitiveToken('NOT'), term]),
		function(state) {
			// Linked list contains only processed inner term.
			var innerTerm = state.head;
			return function(props, indexes, types) {
				return !innerTerm(props, indexes, types);
			};
		}
	);

	term = choice([
		notTerm,
		opTerm,
		inTerm,
		whitespaceSeparatedSequence([token('('), expression, token(')')])
	]);

	// AND and OR expressions must have at least 2 terms,
	//   to disambiguate them from a single term.

	var andExpression = action(
		whitespaceSeparatedList(2, term, caseInsensitiveToken('AND')),
		function(state) {
			// Linked list contains multiple processed inner terms
			//   (in reverse order).
			return function(props, indexes, types) {
				var flag = true;
				var node = state;
				while (node != null) {
					flag = flag && node.head(props, indexes, types);
					node = node.tail;
				}
				return flag;
			};
		}
	);

	var orExpression = action(
		whitespaceSeparatedList(2, term, caseInsensitiveToken('OR')),
		function(state) {
			// Linked list contains multiple processed inner terms
			//   (in reverse order).
			return function(props, indexes, types) {
				var flag = false;
				var node = state;
				while (node != null) {
					flag = flag || node.head(props, indexes, types);
					node = node.tail;
				}
				return flag;
			};
		}
	);

	// Order is important here: term should be tried last,
	//   because andExpression and orExpression start with it.
	expression = choice([
		andExpression,
		orExpression,
		term
	]);

	var whereClause = sequence([whitespace, expression, whitespace]);

	Parsers.parseSQL = function(str) {
		var result = applyParser(str, whereClause);
		return result.head === str.length ?
			result.tail.head :
            (applyParser(str, whitespace).head === str.length) ?
				function(/*props*/) { return true; } :
				null;
	};

	var additiveExpression = function(s, state) { return additiveExpression(s, state); };
	var multiplicativeExpression = function(s, state) { return multiplicativeExpression(s, state); };
	additiveExpression = action(
		whitespaceSeparatedList(
			1,
			multiplicativeExpression,
			capture(choice([token('+'), token('-')]))
		),
		function(state)
		{
			return function(props, indexes, types)
			{
				var pos = state;
				var term = 0.0;
				while (pos !== null) {
					term += pos.head(props, indexes, types);
					if (pos.tail === null) {
						return term;
					} else {
						if (pos.tail.head === '-') { term = -term; }
						pos = pos.tail.tail;
					}
				}
				return term;
			};
		}
	);

	var multiplicativeTerm = choice([
		action(
			numberLiteral,
			function(state) {
				return function(/*props, indexes, types*/) {
					return parseFloat(state.head);
				};
			}
		),
		action(
			sequence([token('floor('), additiveExpression, token(')')]),
			function(state) {
				return function(props, indexes, types) {
					var res = state.head(props, indexes, types);
					return Math.floor(res);
				};
			}
		),
		action(
			sequence([token('['), fieldName, token(']')]),
			function(state) {
				return function(props, indexes) {
					return parseFloat(props[indexes[state.head]]);
				};
			}
		),
		whitespaceSeparatedSequence([
			token('('),
			additiveExpression,
			token(')')
		])
	]);
	multiplicativeTerm = choice([
		multiplicativeTerm,
		action(
			whitespaceSeparatedSequence([token('-'), multiplicativeTerm]),
			function(state) {
				return function(props, indexes, types) {
					return -state.head(props, indexes, types);
				};
			}
		)
	]);
	multiplicativeExpression = action(
		whitespaceSeparatedList(
			1,
			multiplicativeTerm,
			capture(choice([token('*'), token('/')]))
		),
		function(state)
		{
			return function(props, indexes, types) {
				var pos = state;
				var term = 1.0;
				while (pos !== null) {
					term *= pos.head(props, indexes, types);
					if (pos.tail === null) {
						return term;
					} else {
						if (pos.tail.head === '/') { term = 1.0 / term; }
						pos = pos.tail.tail;
					}
				}
				return term;
			};
		}
	);

	multiplicativeTerm = choice([
		multiplicativeTerm,
		action(
			whitespaceSeparatedSequence([token('-'), multiplicativeTerm]),
			function(state) {
				return function(props, indexes, types) {
					return -state.head(props, indexes, types);
				};
			}
		)
	]);

	var arithmeticExpression = sequence([whitespace, additiveExpression, whitespace]);
	Parsers.parseExpression = function(s) {
		var result = applyParser(s, arithmeticExpression);
        return result.head === s.length ? result.tail.head : null;
        // return result.head === s.length ? Parsers.functionFromExpression(s) : null;
	};

	var svgPath = action(
		repeat(0, choice([
			numberLiteral,
			token(','),
			token('M'),
			token('C'),
			repeat(1, choice([
				token(' '),
				token('\t'),
				token('\r'),
				token('\n')
			]))
		])),
		function(state) {
			var coords = [];
			while (state !== null) {
				coords.push(parseFloat(state.head));
				state = state.tail;
			}
			coords.reverse();
			return coords;
		}
	);

	Parsers.parseSVGPath = function(s) {
		var result = applyParser(s, svgPath);
		if (result.head === s.length) {
			return result.tail.head;
		} else {
			return [];
        }
	};

	//extend L.gmx namespace
    L.gmx = L.gmx || {};
	L.gmx.Parsers = Parsers;
})();


//all the methods can be called without instance itself
//For example:
//
// var def = new Deferred();
// doSomething(def.resolve) (instead of doSomething(def.resolve.bind(def))
var Deferred = function(cancelFunc) {
    var resolveCallbacks = [],
        rejectCallbacks = [],
        isFulfilled = false,
        isResolved = false,
        fulfilledData,
        onceAdded = false,
        isCancelled = false;

    var fulfill = this._fulfill = function(resolved /*, data*/) {
        if (isFulfilled) {
            return;
        }
        var callbacks = resolved ? resolveCallbacks : rejectCallbacks;
        fulfilledData = [].slice.call(arguments, 1);
        isFulfilled = true;
        isResolved = resolved;

        callbacks.forEach(function(callback) { callback.apply(null, fulfilledData); });
        resolveCallbacks = rejectCallbacks = [];
    };

    this.resolve = function(/*data*/) {
        isCancelled || fulfill.apply(null, [true].concat([].slice.call(arguments)));
    };

    this.reject = function(/*data*/) {
        isCancelled || fulfill.apply(null, [false].concat([].slice.call(arguments)));
    };

    var cancel = this.cancel = function() {
        if (!isCancelled && !isFulfilled) {
            isCancelled = true;
            cancelFunc && cancelFunc();
        }
    };

    var then = this.then = function(resolveCallback, rejectCallback) {
        if (isCancelled) {
            return null;
        }

        var userFuncDef = null;
        var def = new Deferred(function() {
            cancel();
            userFuncDef && userFuncDef.cancel();
        });

        var fulfillFunc = function(func, resolved) {
            return function(/*data*/) {
                if (!func) {
                    def._fulfill.apply(null, [resolved].concat([].slice.call(arguments)));
                } else {
                    var res = func.apply(null, arguments);
                    if (res instanceof Deferred) {
                        userFuncDef = res;
                        res.then(def.resolve, def.reject);
                    } else {
                        def.resolve(res);
                    }
                }
            };
        };

        if (isFulfilled) {
            fulfillFunc(isResolved ? resolveCallback : rejectCallback, isResolved).apply(null, fulfilledData);
        } else {
            resolveCallbacks.push(fulfillFunc(resolveCallback, true));
            rejectCallbacks.push(fulfillFunc(rejectCallback, false));
        }
        return def;
    };

    this.once = function(onceResolveCallback) {
        if (!onceAdded) {
            onceAdded = true;
            then(onceResolveCallback);
        }
    };

    this.always = function(callback) {
        then(callback, callback);
    };

    this.getFulfilledData = function() {
        return fulfilledData;
    };
};

Deferred.all = function() {
    var defArray = [].slice.apply(arguments);
    var resdef = new Deferred();
    var left = defArray.length;
    var results = new Array(defArray.length);

    if (left) {
        defArray.forEach(function(def, i) {
            def.then(function(res) {
                results[i] = res;
                left--;
                if (left === 0) {
                    resdef.resolve.apply(resdef, results);
                }
            }, function() {
                resdef.reject();
            });
        });
    } else {
        resdef.resolve();
    }

    return resdef;
};

L.gmx = L.gmx || {};
L.gmx.Deferred = Deferred;


(function() {
'use strict';
L.gmx = L.gmx || {};
L.gmx.workerPromise = L.gmxUtil.createWorker(L.gmxUtil.apiLoadedFrom() + '/ImageBitmapLoader-worker.js')
.then(function(worker) {
	var ImageBitmapLoader = function() {
		this.jobs = {};
		this.worker = worker;
		this.worker.onmessage = this.chkMessage.bind(this);
	}

	ImageBitmapLoader.prototype = {
		chkMessage: function(evt) {
			var message = evt.data,
				url = message.url;
			// console.log('ImageBitmapLoader ', message, evt);

			for (var i = 0, it, arr = this.jobs[url] || [], len = arr.length; i < len; i++) {
				it = arr[i];
				if (message.load) { it.resolve(message); }
				else { it.reject(message); }
			}
			delete this.jobs[url];
			L.gmxUtil.loaderStatus(url, true);
		},

		push: function(url, options) {	// добавить запрос в worker
			if (url && url[0] === '.' && url.indexOf(L.gmxUtil.prefixURL) !== 0) {
				url = L.gmxUtil.prefixURL + url;
			}
			var attr = {
					options: options
				},
				src = url || L.gmxUtil.newId();		// Ensure the URL is absolute.
			if (typeof this.jobs[src] === 'undefined') { this.jobs[src] = []; }

			this.jobs[src].push(attr);
			this.worker.postMessage({src: src, options: options});
			L.gmxUtil.loaderStatus(src);
			return new Promise(function(resolve, reject) {
				attr.resolve = resolve;
				attr.reject = reject;
			}).catch(L.Util.falseFn);
		}
	};

	var imageBitmapLoader = new ImageBitmapLoader();
	L.gmx.getBitmap = imageBitmapLoader.push.bind(imageBitmapLoader);
	L.gmx.getJSON = imageBitmapLoader.push.bind(imageBitmapLoader);
	if (L.gmxUtil.debug === 2) {
		L.gmx.sendCmd = function(cmd, options) {
			options.cmd = cmd;
			options.syncParams = L.gmx.gmxMapManager.syncParams;
			return imageBitmapLoader.push(null, options);
		};
	}
	worker.onerror = function(ev) {
		console.warn('Error: Worker init: ImageBitmapLoader-worker.js', ev);
		ev.target.terminate();
		delete L.gmx.getBitmap;
		delete L.gmx.getJSON;
		delete L.gmx.sendCmd;
	};
});
})();


(function() {

var ImageRequest = function(id, url, options) {
    this._id = id;
    this.def = new L.gmx.Deferred(L.gmx.imageLoader._cancelRequest.bind(L.gmx.imageLoader, this));
    this.remove = L.gmx.imageLoader._removeRequestFromCache.bind(L.gmx.imageLoader, this);
    this.url = url;
    this.options = options || {};
};

var GmxImageLoader = L.Class.extend({
    includes: L.Evented ? L.Evented.prototype : L.Mixin.Events,
    statics: {
        MAX_COUNT: 20 // max number of parallel requests
    },

    initialize: function() {
        this.curCount = 0;        // number of currently processing requests (number of items in "inProgress")
        this.requests = [];       // not yet processed image requests
        this.inProgress = {};     // hash of in progress image loadings
        this.requestsCache = {};  // for requests cache by uniqueID
        this.uniqueID = 0;
    },

    _checkIE11bugFix: function(def, image) {
		if (!this.divIE11bugFix) {
			var div = document.createElement('div');
			this.divIE11bugFix = div;
			div.style.visibility = 'hidden';
			div.style.position = 'absolute';
			document.body.insertBefore(div, document.body.childNodes[0]);
		}
		var ieResolve = function() {
			def.resolve(image);
			// if (image.parentNode) {
				// image.parentNode.removeChild(image);
			// }
		};
		this.divIE11bugFix.appendChild(image);
		setTimeout(ieResolve, 0);
    },

    _resolveRequest: function(request, image, canceled) {
        var def = request.def;
        if (image) {
            if (!canceled && request.options.cache) {
                var url = request.url,
                    cacheItem = this.requestsCache[url],
                    cacheKey = request._id;
                if (!cacheItem) { cacheItem = this.requestsCache[url] = {image: image, requests:{}}; }
                if (!cacheItem.requests[cacheKey]) { cacheItem.requests[cacheKey] = request; }
            }
			if (L.gmxUtil.isIE11 && /\.svg/.test(request.url)) {   // skip bug in IE11
				this._checkIE11bugFix(def, image);
			} else {
				def.resolve(image);
			}
        } else if (!canceled) {
            def.reject();
        }
        this.fire('requestdone', {request: request});
    },

    _imageLoaded: function(url, image, canceled) {
        if (url in this.inProgress) {
            var resolveRequest = function(it) {
                this._resolveRequest(it, image, canceled);
            };
            this.inProgress[url].requests.forEach(resolveRequest.bind(this));
            --this.curCount;
            delete this.inProgress[url];
        }
        L.gmxUtil.loaderStatus(url, true);
        this.fire('imageloaded', {url: url});
        this._nextLoad();
    },

    _nextLoad: function() {  // загрузка следующего
        if (this.curCount >= GmxImageLoader.MAX_COUNT || !this.requests.length) {
            return;
        }

        var request = this.requests.shift(),
            url = request.url;

        if (url in this.inProgress) {
            this.inProgress[url].requests.push(request);
        } else {
            var requests = [request];
            this.inProgress[url] = {requests: requests};
            ++this.curCount;

            for (var k = this.requests.length - 1; k >= 0; k--) {
                if (this.requests[k].url === url) {
                    requests.push(this.requests[k]);
                    this.requests.splice(k, 1);
                }
            }

            var image = this._loadImage(request);
            if (!image.width) {
                L.gmxUtil.loaderStatus(url);
            }

            //theoretically image loading can be synchronous operation
            if (this.inProgress[url]) {
                this.inProgress[url].image = image;
            }
        }
    },

    _loadImage: function(request) {
        var imageObj = new Image(),
            url = request.url,
            _this = this;

        if (request.options.crossOrigin) {
            imageObj.crossOrigin = request.options.crossOrigin;
        }

        imageObj.onload = this._imageLoaded.bind(this, url, imageObj, false);
        imageObj.onerror = function() {
            _this._imageLoaded(url);
        };
		if (L.gmxUtil.isIEOrEdge) {
			setTimeout(function() { imageObj.src = url; }, 0);
		} else {
            imageObj.src = url;
		}

        this.fire('imageloadstart', {url: url});

        return imageObj;
    },

    _cancelRequest: function(request) {
        var id = request._id,
            url = request.url,
            i = 0, len;
        if (url in this.inProgress) {
            var loadingImg = this.inProgress[url],
                requests = loadingImg.requests;

            len = requests.length;
            if (len === 1 && requests[0]._id === id) {
                loadingImg.image.onload = L.Util.falseFn;
                loadingImg.image.onerror = L.Util.falseFn;
                loadingImg.image.src = L.Util.emptyImageUrl;
                this._imageLoaded(url, null, true);
            } else {
                for (i = 0; i < len; i++) {
                    if (requests[i]._id === id) {
                        requests.splice(i, 1);
                        break;
                    }
                }
            }
        } else {
            for (i = 0, len = this.requests.length; i < len; i++) {
                if (this.requests[i]._id === id) {
                    this.requests.splice(i, 1);
                    break;
                }
            }
        }

        this.fire('requestdone', {request: request});
    },

    _removeRequestFromCache: function(request) {    // remove request from cache
        this._cancelRequest(request);
        this._clearCacheItem(request.url, request._id);
    },

    _clearCacheItem: function(url, cacheKey) {    // remove cache item
        if (this.requestsCache[url]) {
            var cacheItem = this.requestsCache[url];
            delete cacheItem.requests[cacheKey];
            if (Object.keys(cacheItem.requests).length === 0) {
                delete this.requestsCache[url];
            }
        }
    },
    _add: function(atBegin, url, options) {
		url = url.replace(/^http:/, L.gmxUtil.protocol);

		var id = 'id' + (++this.uniqueID),
            request = new ImageRequest(id, url, options);

        if (url in this.inProgress) {
            this.inProgress[url].requests.push(request);
        } else {
            atBegin ? this.requests.unshift(request) : this.requests.push(request);
            this._nextLoad();
        }

        this.fire('request', {request: request});

        return request;
    },

    push: function(url, options) {  // добавить запрос в конец очереди
        return this._add(false, url, options);
    },

    unshift: function(url, options) {   // добавить запрос в начало очереди
        return this._add(true, url, options);
    }
});

L.gmx.imageLoader = new GmxImageLoader();

})();


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


/** Asynchronously request session keys from GeoMixer servers (given apiKey and server host)
*/
var gmxSessionManager = {
    APIKEY_PARAM: 'key',
    SCRIPT_REGEXP: [
		/\bleaflet-geomixer(-\w*)?\.js\b/,
		/\bgeomixer(-\w*)?\.js\b/
	],
    _scriptSearched: false,
    _scriptAPIKey: null,
    _searchScriptAPIKey: function() {
        var _this = this;
        if (this._scriptSearched) {
            return this._scriptAPIKey;
        }

        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].getAttribute('src'),
				arr = this.SCRIPT_REGEXP;
			for (var j = 0, len = arr.length; j < len; j++) {
				if (arr[j].exec(src)) {
					var query = src.split('?')[1];

					if (query) {
						var params = query.split('&');
						for (var p = 0; p < params.length; p++) {
							var parsedParam = params[p].split('=');
							if (parsedParam[0] === _this.APIKEY_PARAM) {
								_this._scriptAPIKey = parsedParam[1];
								break;
							}
						}
					}
					break;
				}
            }
			if (_this._scriptAPIKey) {
				break;
			}
        }
        this._scriptSearched = true;
        return this._scriptAPIKey;
    },

    //we will search apiKey in script tags iff apiKey parameter is undefined.
    //if it is defined as falsy (null, '', etc), we won't send any requests to server
    requestSessionKey: function(serverHost, apiKey) {
        var keys = this._sessionKeys;

        if (!(serverHost in keys)) {
            apiKey = typeof apiKey === 'undefined' ? this._searchScriptAPIKey() : apiKey;
            keys[serverHost] = new Promise(function(resolve, reject) {
				if (apiKey) {
					var url = L.gmxUtil.protocol + '//' + serverHost + '/ApiKey.ashx?WrapStyle=None&Key=' + apiKey,
						storeKey = function(json) {
							if (json && json.Status === 'ok') {
								var key = gmxSessionManager._sessionKeysRes[serverHost] = json.Result.Key;
								resolve(key);
							} else {
								reject();
							}
						};
					fetch(url, {mode: 'cors'})
					.then(function(resp) { return resp.json(); })
					.then(storeKey);
					// gmxAPIutils.requestJSONP(L.gmxUtil.protocol + '//' + serverHost + '/ApiKey.ashx',
						// {
							// WrapStyle: 'func',
							// Key: apiKey
						// }
					// ).then(function(response) {
						// if (response && response.Status === 'ok') {
							// resolve(response.Result.Key);
						// } else {
							// reject();
						// }
					// }, reject);
				} else {
					resolve('');
				}
			});
        }
        return keys[serverHost];
    },

    //get already received session key
    getSessionKey: function(serverHost) {
		return this._sessionKeys[serverHost];
    },
    getSessionKeyRes: function(serverHost) {
		return this._sessionKeysRes[serverHost];
    },
    _sessionKeysRes: {}, 	//key for each host
    _sessionKeys: {} 		//promise for each host
};
L.gmx = L.gmx || {};
L.gmx.gmxSessionManager = gmxSessionManager;


/** Asynchronously request information about map given server host and map name
*/
var gmxMapManager = {
    //serverHost should be host only string like 'maps.kosmosnimki.ru' without any slashes or 'http://' prefixes
    getMap: function(serverHost, apiKey, mapName, skipTiles, srs) {
		return gmxMapManager.loadMapProperties({
			srs: srs,
			hostName: serverHost,
			apiKey: apiKey,
			mapName: mapName,
			skipTiles: skipTiles
		});
    },

	_addMapProperties: function(res, serverHost, mapName) {
		L.gmx._maps[serverHost] = L.gmx._maps[serverHost] || {};
		L.gmx._maps[serverHost][mapName] = {
			_rawTree: res,
			_nodes: {}
		};
		gmxMapManager.iterateNode(res, function(it) {	// TODO: удалить после переделки стилей на сервере
			if (it.type === 'layer') {
				var props = it.content.properties;
				if (props.styles && !props.gmxStyles) {
					it.content.properties.gmxStyles = L.gmx.StyleManager.decodeOldStyles(props);
				}
			}
		});

		if (L.gmx.mapPropertiesHook) {
			L.gmx.mapPropertiesHook(res);
		}
    },

	getMapFolder: function(options) {
        var serverHost = options.hostName || options.serverHost || 'maps.kosmosnimki.ru',
			mapId = options.mapId,
			folderId = options.folderId;

		var opt = {
			folderId: folderId || '',
			mapId: mapId,
			skipTiles: options.skipTiles || 'All', // All, NotVisible, None
			srs: options.srs || 3857
		};
		return new Promise(function(resolve, reject) {
			if (L.gmx.sendCmd) {
				console.log('TODO: L.gmx.sendCmd');
			} else {
				gmxSessionManager.requestSessionKey(serverHost, options.apiKey).then(function(sessionKey) {
					opt.key = sessionKey;
					gmxAPIutils.requestJSONP(L.gmxUtil.protocol + '//' + serverHost + '/Map/GetMapFolder', opt).then(function(json) {
						if (json && json.Status === 'ok' && json.Result) {
							var mapInfo = L.gmx._maps[serverHost][mapId],
								gmxMap = mapInfo.loaded,
								res = json.Result.content,
								outInfo = {
									children: res.children,
									properties: gmxMap.properties
								};
							gmxMapManager.iterateNode(mapInfo._rawTree, function(it) {
								if (folderId === it.content.properties.GroupID) {
									L.extend(it, json.Result);
								}
							}, true);
							gmxMap.layersCreated.then(function() {
								gmxMap.layersCreatePromise(outInfo).then(function() {
									resolve(json.Result);
								});
							});
						} else {
							reject(json);
						}
					}, reject);
				}, reject);
			}
		});
    },

	loadMapProperties: function(options) {
        var maps = this._maps,
			serverHost = options.hostName || options.serverHost || 'maps.kosmosnimki.ru',
			mapName = options.mapName;

        if (!maps[serverHost] || !maps[serverHost][mapName]) {
			var opt = {
				WrapStyle: 'func',
				skipTiles: options.skipTiles || 'All', // All, NotVisible, None
				MapName: mapName,
				srs: options.srs || 3857,
				ftc: options.ftc || 'osm',
				ModeKey: 'map'
			};
			if (options.visibleItemOnly) { opt.visibleItemOnly = true; }
			var promise = new Promise(function(resolve, reject) {
				if (L.gmx.sendCmd) {
					L.gmx.sendCmd('mapProperties', {
						serverHost: serverHost,
						apiKey: options.apiKey,
						WrapStyle: 'func',
						skipTiles: options.skipTiles || 'All', // All, NotVisible, None
						MapName: mapName,
						visibleItemOnly: opt.visibleItemOnly|| false,
						srs: options.srs || 3857,
						ftc: options.ftc || 'osm',
						ModeKey: 'map'
					}).then(function(json) {
						if (json && json.load && json.res) {
							gmxMapManager._addMapProperties(json.res, serverHost, mapName);
							resolve(json.res);
						} else {
							reject(json);
						}
					}).catch(reject);
				} else {
					gmxSessionManager.requestSessionKey(serverHost, options.apiKey).then(function(sessionKey) {
						opt.key = sessionKey;
						gmxAPIutils.requestJSONP(L.gmxUtil.protocol + '//' + serverHost + '/TileSender.ashx', opt).then(function(json) {
							if (json && json.Status === 'ok' && json.Result) {
								json.Result.properties.hostName = serverHost;
								json.Result.properties.sessionKey = sessionKey;
								gmxMapManager._addMapProperties(json.Result, serverHost, mapName);
								resolve(json.Result);
							} else {
								reject(json);
							}
						}, reject);
					}, reject);
				}
			});
            maps[serverHost] = maps[serverHost] || {};
            maps[serverHost][mapName] = {promise: promise};
        }
        return maps[serverHost][mapName].promise;
    },

	syncParams: {},
    // установка дополнительных параметров для серверных запросов
    setSyncParams: function(hash) {
		this.syncParams = hash;
    },
    getSyncParams: function(stringFlag) {
		var res = this.syncParams;
		if (stringFlag) {
			var arr = [];
			for (var key in res) {
				arr.push(key + '=' + res[key]);
			}
			res = arr.join('&');
		}
		return res;
    },

    //we will (lazy) create index by layer name to speed up multiple function calls
    findLayerInfo: function(serverHost, mapID, layerID) {
		var hostMaps = L.gmx._maps[serverHost],
			layerInfo = null;

		if (hostMaps && hostMaps[mapID]) {
			var mapInfo = hostMaps[mapID];
			if (!mapInfo._nodes[layerID]) {
				gmxMapManager.iterateNode(mapInfo._rawTree, function(it) {
					mapInfo._nodes[it.content.properties.name] = it;
				});
			}
			layerInfo = mapInfo._nodes[layerID];
		}
		return layerInfo ? layerInfo.content : null;
    },
    iterateLayers: function(treeInfo, callback) {
        var iterate = function(arr) {
            for (var i = 0, len = arr.length; i < len; i++) {
                var layer = arr[i];

                if (layer.type === 'layer') {
                    callback(layer.content);
                } else if (layer.type === 'group') {
                    iterate(layer.content.children || []);
                }
            }
        };

        treeInfo && iterate(treeInfo.children);
    },
    iterateNode: function(treeInfo, callback, onceFlag) {
        var iterate = function(node) {
			var arr = node.children || [];
            for (var i = 0, len = arr.length; i < len; i++) {
                var layer = arr[i];

				if (callback(layer) && onceFlag) { break; }
                if (layer.type === 'group') {
                    iterate(layer.content);
                }
            }
        };

        treeInfo && iterate(treeInfo);
    },
    _maps: {} //Promise for each map. Structure: maps[serverHost][mapID]: {promise:, layers:}
};

L.gmx = L.gmx || {};
L.gmx._maps = {};			// свойства слоев по картам
L.gmx._clientLayers = {};	// свойства слоев без карт (клиентские слои)

if (/\bsw=1\b/.test(location.search)) {
	L.gmx._sw = 1;	// признак загрузки данных через Service Worker
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.register('./gmx-sw1.js')
		  .then(function(registration) {
			console.log('ServiceWorker registration successful with scope: ', registration.scope);
		  })
		  .catch(function(err) {
			console.log('ServiceWorker registration failed: ', err);
		  });
	} else {
		console.error('Your browser does not support Service Workers.');
	}
}

L.gmx.gmxMapManager = gmxMapManager;


//Helper class, that represents layers of single Geomixer's map
//Creates layers from given map description
var gmxMap = L.Class.extend({
    includes: L.Evented ? L.Evented.prototype : L.Mixin.Events,

    initialize: function(mapInfo, commonLayerOptions) {
		this.layers = [];
		this.layersByTitle = {};
		this.layersByID = {};
		this.dataManagers = {};
		this.options = commonLayerOptions;

		this.properties = L.extend({}, mapInfo.properties);
		this.properties.BaseLayers = this.properties.BaseLayers ? JSON.parse(this.properties.BaseLayers) : [];
		this.rawTree = mapInfo;
		this.layersCreated = this.layersCreatePromise(mapInfo);
	},

	layersCreatePromise: function(mapInfo) {
		return new Promise(function(resolve) {
			var mapID = mapInfo.properties.name,
				_this = this,
				commonOptions = this.options,
				_skipTiles = this.options.skipTiles || 'All',
				_ftc = this.options.ftc || 'osm',
				_srs = this.options.srs || 3857,
				missingLayerTypes = {},
				dataSources = {};

			gmxMapManager.iterateLayers(mapInfo, function(layerInfo) {
				var props = layerInfo.properties,
					options = {
						mapID: mapID,
						sessionKey: mapInfo.properties.sessionKey,
						layerID: props.name
					};

				props.hostName = mapInfo.properties.hostName;
				if (mapInfo.srs) {
					props.srs = mapInfo.srs;
				}

				var type = props.ContentID || props.type,
					meta = props.MetaProperties || {},
					layerOptions = L.extend(options, commonOptions);

				if (props.styles && !props.gmxStyles) {
					props.gmxStyles = L.gmx.StyleManager.decodeOldStyles(props);
				}
				if (props.dataSource || 'parentLayer' in meta) {      	// Set dataSource layer
					layerOptions.parentLayer = props.dataSource || '';
					if ('parentLayer' in meta) {      	// todo удалить после изменений вов вьювере
						layerOptions.parentLayer = meta.parentLayer.Value || '';
					}
					dataSources[options.layerID] = {
						info: layerInfo,
						options: layerOptions
					};
				} else if (type in L.gmx._layerClasses) {
					_this.addLayer(L.gmx.createLayer(layerInfo, layerOptions));
				} else {
					missingLayerTypes[type] = missingLayerTypes[type] || [];
					missingLayerTypes[type].push({
						info: layerInfo,
						options: layerOptions
					});
				}
			});

			//load missing layer types
			var loaders = [];
			for (var type in missingLayerTypes) {
				loaders.push(L.gmx._loadLayerClass(type).then(/*eslint-disable no-loop-func */function (type) {/*eslint-enable */
					var it = missingLayerTypes[type];
					for (var i = 0, len = it.length; i < len; i++) {
						_this.addLayer(L.gmx.createLayer(it[i].info, it[i].options));
					}
				}.bind(null, type)));
			}
			var hosts = {}, host, id, it;
			for (id in dataSources) {
				it = dataSources[id];
				var opt = it.options,
					pId = opt.parentLayer,
					pLayer = this.layersByID[pId];
				if (pLayer) {
					it.options.parentOptions = pLayer.getGmxProperties();
					it.options.dataManager = this.dataManagers[pId] || new DataManager(it.options.parentOptions, true);
					this.dataManagers[pId] = it.options.dataManager;
					this.addLayer(L.gmx.createLayer(it.info, it.options));
				} else {
					host = opt.hostName;
					if (!hosts[host]) { hosts[host] = {}; }
					if (!hosts[host][pId]) { hosts[host][pId] = []; }
					hosts[host][pId].push(id);
				}
			}
			for (host in hosts) {
				var arr = [],
					prefix = L.gmxUtil.protocol + '//' + host;
				for (id in hosts[host]) {
					arr.push({Layer: id});
				}
				loaders.push(L.gmxUtil.requestJSONP(prefix + '/Layer/GetLayerJson.ashx',
					{
						WrapStyle: 'func',
						skipTiles: _skipTiles,
						srs: _srs,
						ftc: _ftc,
						Layers: JSON.stringify(arr)
					},
					{
						ids: hosts[host]
					}
				).then(function(json, opt) {
					if (json && json.Status === 'ok' && json.Result) {
						json.Result.forEach(function(it) {
							var props = it.properties,
								pId = props.name;

							props.tiles = [];
							props.srs = _srs;
							props.ftc = _ftc;
							var dataManager = _this.addDataManager(it);
							if (opt && opt.ids && opt.ids[pId]) {
								opt.ids[pId].forEach(function(id) {
									var pt = dataSources[id];
									pt.options.parentOptions = it.properties;
									pt.options.dataManager = dataManager;
									pt.info.properties.tiles = [];	// Шумилов должен убрать
									pt.info.properties.srs = _srs;
									pt.info.properties.ftc = _ftc;
									_this.addLayer(L.gmx.createLayer(pt.info, pt.options));
								});
							}
						});
					} else {
						console.info('Error: loading ', prefix + '/Layer/GetLayerJson.ashx', json.ErrorInfo);
						if (opt && opt.ids) {
							for (var pId in opt.ids) {
								opt.ids[pId].forEach(function(id) {
									_this.addLayer(new L.gmx.DummyLayer(dataSources[id].info.properties));
								});
							}
						}
					}
				}));
			}
			Promise.all(loaders).then(resolve);
		}.bind(this));
	},

	addDataManager: function(it) {
		var pid = it.properties.name;
		if (!this.dataManagers[pid]) {
			this.dataManagers[pid] = new DataManager(it.properties);
		}
		return this.dataManagers[pid];
	},
	getDataManager: function(id) {
		return this.dataManagers[id];
	},

	addLayer: function(layer) {
		var props = layer.getGmxProperties();

		this.layers.push(layer);
		this.layersByTitle[props.title] = layer;
		this.layersByID[props.name] = layer;
		this.fire('layeradd', {layer: layer});

		return this;
	},

	removeLayer: function(layer) {
		var props = layer.getGmxProperties();

		for (var i = 0; i < this.layers.length; i++) {
			if (this.layers[i].getGmxProperties().name === props.name) {
				this.layers.splice(i, 1);
				break;
			}
		}

		delete this.layersByTitle[props.title];
		delete this.layersByID[props.name];
		this.fire('layerremove', {layer: layer});

		return this;
	},

	addLayersToMap: function(leafletMap) {
		for (var l = this.layers.length - 1; l >= 0; l--) {
			var layer = this.layers[l];
			if (layer.getGmxProperties().visible) {
				leafletMap.addLayer(layer);
			}
		}

		return this;
	}
});
L.gmx = L.gmx || {};
L.gmx.gmxMap = gmxMap;


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
			if (this._onmousemoveTimer) { clearTimeout(this._onmousemoveTimer); }
			this._onmousemoveTimer = setTimeout(this._eventCheck.bind(this, ev), 50);
			// if (this._onmousemoveTimer) { cancelIdleCallback(this._onmousemoveTimer); }
			// this._onmousemoveTimer = requestIdleCallback(this._eventCheck.bind(this, ev), {timeout: 50});
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
					}.bind(this));
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
			var target = ev.originalEvent.target;
			var tagName = target.tagName.toLowerCase();
			if (tagName !== 'svg' && target !== map._container) { return; }
			if (tagName === 'path') { return; }
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
		}.bind(this));

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
		}.bind(this);

        this.on('remove', function () {
            if (this._gmxEventsManager) {
                this._gmxEventsManager.removeHooks();
            }
        }, this);
    }
});


(function() {
    var DEFAULT_LANGUAGE = 'rus',
        _setKeyText = function(lang, key, item, hash) {
            if (!hash[lang]) { hash[lang] = {}; }
            hash[lang][key] = item;
        };
    L.gmxLocale = {

        setLanguage: function(lang) {
            this._language = lang;
        },

        getLanguage: function() {
            return window.language || this._language || DEFAULT_LANGUAGE;
        }
    };

    L.gmxLocaleMixin = {
        addText: function() {
            var lang = arguments[0],
                newHash = arguments[1];
            if (arguments.length === 1) {
                newHash = lang;
                lang = null;
            }
            for (var k in newHash) {
                if (lang === null) {
                    for (var k1 in newHash[k]) {
                        _setKeyText(k, k1, newHash[k][k1], this);
                    }
                } else {
                    _setKeyText(lang, k, newHash[k], this);
                }
            }
            return this;
        },

        getText: function(key) {
            var lang = L.gmxLocale.getLanguage(),
                locale = this[lang] || {};

            var keyArr = key ? key.split(/\./) : [];
            for (var i = 0, len = keyArr.length; i < len; i++) {
                if (!locale) { break; }
                locale = locale[keyArr[i]];
            }
            return locale;
        }
    };
    L.extend(L.gmxLocale, L.gmxLocaleMixin);
})();


L.extend(L.gmxLocale, {
    rus: {
        Coordinates : 'Координаты',
        Length : 'Длина',
        nodeLength : 'Длина от начала',
        edgeLength : 'Длина сегмента',
        Area : 'Площадь',
        Perimeter : 'Периметр',
        units: {
            m: 'м',
            nm: 'м.мили',
            km: 'км',
            m2: 'кв. м',
            km2: 'кв. км',
            ha: 'га',
            m2html: 'м<sup>2',
            km2html: 'км<sup>2'
        }
    }
});


L.extend(L.gmxLocale, {
    eng: {
        Coordinates : 'Coordinates',
        Length : 'Length',
        nodeLength : 'From start point',
        edgeLength : 'Segment length',
        Area : 'Area',
        Perimeter : 'Perimeter',
        units: {
            m: 'm',
            nm: 'nmi',
            km: 'km',
            m2: 'sq. m',
            km2: 'sq. km',
            ha: 'ha',
            m2html: 'm<sup>2',
            km2html: 'km<sup>2'
        }
    }
});


var gmxVectorTileLoader = {
    _loadedTiles: {},
    _getKey: function(ti) {
        return [ti.layerID, ti.x, ti.y, ti.z, typeof ti.d === 'undefined' ? -1 : ti.d, typeof ti.s === 'undefined' ? -1 : ti.s, ti.v].join(':');
    },
    load: function(tileSenderPrefix, tileInfo) {
        var key = gmxVectorTileLoader._getKey(tileInfo);

        if (!this._loadedTiles[key]) {
            var requestParams = {
                ModeKey: 'tile',
                ftc: 'osm',
                r: 'j',
                LayerName: tileInfo.layerID,
                z: tileInfo.z,
                x: tileInfo.x,
                y: tileInfo.y,
                v: tileInfo.v
            };

            if (tileInfo.srs) {
                requestParams.srs = tileInfo.srs;
            }
            if (tileInfo.d !== -1) {
                requestParams.Level = tileInfo.d;
                requestParams.Span = tileInfo.s;
            }
            if (L.gmx._sw) {
                requestParams.sw = L.gmx._sw;
            }

			var promise = new Promise(function(resolve) {
				var query = tileSenderPrefix + '&' + Object.keys(requestParams).map(function(name) {
					return name + '=' + requestParams[name];
				}).join('&');
				fetch(query, {
					mode: 'cors',
					credentials: 'include'
				})
					.then(function(response) { return response.text(); })
					.then(function(txt) {
						var pref = 'gmxAPI._vectorTileReceiver(';
						if (txt.substr(0, pref.length) === pref) {
							txt = txt.replace(pref, '');
							txt = txt.substr(0, txt.length -1);
						}
						resolve(JSON.parse(txt));
					});
			});
            this._loadedTiles[key] = promise;
        }
        return this._loadedTiles[key];
    }
};

window.gmxAPI = window.gmxAPI || {};
window.gmxAPI._vectorTileReceiver = window.gmxAPI._vectorTileReceiver || function(data) {
    var key = gmxVectorTileLoader._getKey({
        layerID: data.LayerName,
        x: data.x,
        y: data.y,
        z: data.z,
        d: data.level,
        s: data.span,
        v: data.v
    });

    gmxVectorTileLoader._loadedTiles[key] && gmxVectorTileLoader._loadedTiles[key].resolve({
		bbox: data.bbox,
		srs: data.srs,
		isGeneralized: data.isGeneralized,
		values: data.values
	});
};


//Single vector tile, received from GeoMixer server
//  dataProvider: has single method "load": function(x, y, z, v, s, d, callback), which calls "callback" with the following parameters:
//      - {Object[]} data - information about vector objects in tile
//      - {Number[4]} [bbox] - optional bbox of objects in tile
//  options:
//      x, y, z, v, s, d: GeoMixer vector tile point
//      dateZero: zero Date for temporal layers
//      isGeneralized: flag for generalized tile
var VectorTile = function(dataProvider, options) {
    this.dataProvider = dataProvider;
    this.x = options.x;
    this.y = options.y;
    this.z = options.z;
    this.v = options.v;
    this.s = options.s || -1;
    this.d = options.d || -1;
    // this._itemsArr = options._itemsArr;
    this.attributes = options.attributes;
    this.isGeneralized = options.isGeneralized;
    this.isFlatten = options.isFlatten;
    this.bounds = gmxAPIutils.getBoundsByTilePoint(this.z ? options : {z:0, x:0, y:0});
    this.gmxTilePoint = {x: this.x, y: this.y, z: this.z, s: this.s, d: this.d};
    this.vectorTileKey = VectorTile.makeTileKey(this.x, this.y, this.z, this.v, this.s, this.d);

    if (this.s >= 0 && options.dateZero) {
        this.beginDate = new Date(options.dateZero.valueOf() + this.s * this.d * gmxAPIutils.oneDay * 1000);
        this.endDate = new Date(options.dateZero.valueOf() + (this.s + 1) * this.d * gmxAPIutils.oneDay * 1000);
    }
	this.clear();
};

VectorTile.prototype = {
    addData: function(data, keys) {

        if (keys) {
            this.removeData(keys, true);
        }

        var len = data.length,
            dataOptions = new Array(len),
            dataBounds = gmxAPIutils.bounds();
        for (var i = 0; i < len; i++) {
            var dataOption = this._parseItem(data[i]);
            dataOptions[i] = dataOption;
            dataBounds.extendBounds(dataOption.bounds);
        }

        if (!this.data) {
            this.data = data;
            this.dataOptions = dataOptions;
        } else {
            this.data = this.data.concat(data);
            this.dataOptions = this.dataOptions.concat(dataOptions);
        }

        this.loaded(data);
        return dataBounds;
    },

    removeData: function(keys) {
        for (var arr = this.data || [], i = arr.length - 1; i >= 0; i--) {
            if (keys[arr[i][0]]) {
                arr.splice(i, 1);
                if (this.dataOptions) { this.dataOptions.splice(i, 1); }
            }
        }
    },

    loaded: function(data) {
        this.state = 'loaded';
        this._resolve(data);
    },

    load: function() {
        if (this.state === 'notLoaded') {
            this.state = 'loading';
            var _this = this;
            this.dataProvider.load(_this.x, _this.y, _this.z, _this.v, _this.s, _this.d, function(data) {
                _this.bbox = data.bbox;
                _this.srs = data.srs;
                _this.isGeneralized = data.isGeneralized;
                _this.addData(data.values);
            });
        }

        return this.loadDef;
    },

    clear: function() {
        this.state = 'notLoaded';	 //notLoaded, loading, loaded
        this.data = null;
        this.dataOptions = null;

		this.loadDef = new Promise(function(resolve, reject) {
			this._resolve = resolve;
			this._reject = reject;
        }.bind(this));
    },

    // TODO: Для упаковки атрибутов
	// _getLinkProp: function(nm, val) {
		// var attr = this.attributes,
			// name = attr[nm - 1],
			// arr = this._itemsArr[name],
			// len = arr.length,
			// i = 0;

		// for (; i < len; i++) {
			// if (val === arr[i]) { return i; }
		// }
		// arr[i] = val;
		// return i;
    // },

    _parseItem: function(it) {
        var len = it.length - 1,
			// props = new Uint32Array(len),
			i;

        // props[0] = it[0];
		// TODO: old properties null = ''
        for (i = 1; i < len; i++) {
            if (it[i] === null) { it[i] = ''; }
			// props[i] = this._getLinkProp(i, it[i]);
        }

        var geo = it[len],
            needFlatten = this.isFlatten,
            type = geo.type,
            isLikePolygon = type.indexOf('POLYGON') !== -1 || type.indexOf('Polygon') !== -1,
            isPolygon = type === 'POLYGON' || type === 'Polygon',
            coords = geo.coordinates,
            hiddenLines = [],
            bounds = null,
            boundsArr = [];

        if (isLikePolygon) {
            if (isPolygon) { coords = [coords]; }
            bounds = gmxAPIutils.bounds();
            var edgeBounds = gmxAPIutils.bounds().extendBounds(this.bounds).addBuffer(-0.05),
                hiddenFlag = false;
            for (i = 0, len = coords.length; i < len; i++) {
                var arr = [],
                    hiddenLines1 = [];

                for (var j = 0, len1 = coords[i].length; j < len1; j++) {
                    if (needFlatten && typeof coords[i][j][0] !== 'number') {
                        coords[i][j] = gmxAPIutils.flattenRing(coords[i][j]);
                    }
                    var b = gmxAPIutils.bounds(coords[i][j]);
                    arr.push(b);
                    if (j === 0) { bounds.extendBounds(b); }
                    // EdgeLines calc
                    var edgeArr = gmxAPIutils.getHidden(coords[i][j], edgeBounds);
                    hiddenLines1.push(edgeArr);
                    if (edgeArr.length) {
                        hiddenFlag = true;
                    }
                }
                boundsArr.push(arr);
                hiddenLines.push(hiddenLines1);
            }
            if (!hiddenFlag) { hiddenLines = null; }
            if (isPolygon) { boundsArr = boundsArr[0]; }
        } else if (type === 'POINT' || type === 'Point') {
            bounds = gmxAPIutils.bounds([coords]);
        } else if (type === 'MULTIPOINT' || type === 'MultiPoint') {
            bounds = gmxAPIutils.bounds();
            for (i = 0, len = coords.length; i < len; i++) {
                bounds.extendBounds(gmxAPIutils.bounds([coords[i]]));
            }
        } else if (type === 'LINESTRING' || type === 'LineString') {
            bounds = gmxAPIutils.bounds(coords);
        } else if (type === 'MULTILINESTRING' || type === 'MultiLineString') {
            bounds = gmxAPIutils.bounds();
            for (i = 0, len = coords.length; i < len; i++) {
                bounds.extendBounds(gmxAPIutils.bounds(coords[i]));
            }
        }
        var dataOption = {
            // props: props,
            bounds: bounds,
            boundsArr: boundsArr
        };
        if (hiddenLines) {
            dataOption.hiddenLines = hiddenLines;
        }
        return dataOption;
    }
};
//class methods

VectorTile.makeTileKey = function(x, y, z, v, s, d) {
    return z + '_' + x + '_' + y + '_' + v + '_' + s + '_' + d;
};

VectorTile.createTileKey = function(opt) {
    return [opt.z, opt.x, opt.y, opt.v, opt.s, opt.d].join('_');
};

VectorTile.parseTileKey = function(gmxTileKey) {
    var p = gmxTileKey.split('_').map(function(it) { return Number(it); });
    return {z: p[0], x: p[1], y: p[2], v: p[3], s: p[4], d: p[5]};
};

VectorTile.boundsFromTileKey = function(gmxTileKey) {
    var p = VectorTile.parseTileKey(gmxTileKey);
    return gmxAPIutils.getTileBounds(p.x, p.y, p.z);
};


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
        this.z = options.z;
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

    activate: function(withoutActivate) {
        if (!this.active) {
            this.active = true;
            if (!withoutActivate) { this.fire('activate'); }
        }
        return this;
    },

    deactivate: function(withoutActivate) {
        if (this.active) {
            this.active = false;
            if (!withoutActivate) { this.fire('activate'); }
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


(function() {
//tree for fast tiles selection inside temporal interval
//  options:
//      TemporalTiles: tilePoints array
//      TemporalVers: tiles version array
//      TemporalPeriods: periods
//      ZeroDate: start Date
var TilesTree = function(options) {
    var _rootNodes = [],
        tiles = options.TemporalTiles || [],
        vers = options.TemporalVers || [],
        periods = options.TemporalPeriods || [],
        maxPeriod = periods[periods.length - 1],
        smin = Number.MAX_VALUE,
        arr = options.ZeroDate.split('.'),
        zn = new Date(
            (arr.length > 2 ? arr[2] : 2008),
            (arr.length > 1 ? arr[1] - 1 : 0),
            (arr.length > 0 ? arr[0] : 1)
        ),
        dateZero = new Date(zn.getTime()  - zn.getTimezoneOffset() * 60000),
        zeroUT = dateZero.getTime() / 1000;

    this.dateZero = dateZero;

    var addTile = function (node, tile, key) {
        var d = node.d;
        if (tile.d === periods[d]) {
            node.count++;
            node.tiles.push(key);
            return;
        }

        var pd = periods[d - 1],
            childrenCount = periods[d] / pd;

        if (!('children' in node)) {
            node.children = new Array(childrenCount);
        }

        var sChild = Math.floor(tile.s * tile.d / pd),
            ds = sChild - node.s * childrenCount;

        if (!node.children[ds]) {
            var pdOneDay = pd * gmxAPIutils.oneDay,
                t1 = sChild * pdOneDay + zeroUT;
            node.children[ds] = {
                d: d - 1,
                s: sChild,
                t1: t1,
                t2: t1 + pdOneDay,
                count: 0,
                children: [],
                tiles: []
            };
        }

        addTile(node.children[ds], tile, key);
    };

    var dmax = periods.length - 1,
        dmaxOneDay = periods[dmax] * gmxAPIutils.oneDay,
        i, len;

    for (i = 0, len = tiles.length; i < len; i++) {
        arr = tiles[i];
        var s = Number(arr[1]),
            d = Number(arr[0]);

        if (d === maxPeriod) {
            smin = Math.min(smin, s);
        }
    }
    for (i = 0, len = tiles.length; i < len; i++) {
        arr = tiles[i];
        var t = {
            x: Number(arr[2]),
            y: Number(arr[3]),
            z: Number(arr[4]),
            v: Number(vers[i]),
            s: Number(arr[1]),
            d: Number(arr[0])
        };
        if (t.d < 0) {
            continue;
        }

        var ds = Math.floor(t.s * t.d / periods[dmax]) - smin,
            cs = ds + smin;

        _rootNodes[ds] = _rootNodes[ds] || {
            d: dmax,
            s: cs,
            t1: cs * dmaxOneDay + zeroUT,
            t2: (cs + 1) * dmaxOneDay + zeroUT,
            count: 0,
            tiles: []
        };
        var key = VectorTile.createTileKey(t);

        addTile(_rootNodes[ds], t, key);
    }
    tiles = vers = null;

    //options: bounds (in mercator projection)
    this.selectTiles = function(t1, t2, options) {

        options = options || {};

        var t1Val = t1.valueOf() / 1000,
            t2Val = t2.valueOf() / 1000;

        // We will restrict tile levels by the nearest two levels to target date interval length
        // For example, if date interval length is 3 days, we wll search tiles among 1-day and 4-day tiles
        var minLevel = 0,
            dateIntervalLength = (t2Val - t1Val) / 3600 / 24;

        for (var i = 0; i < periods.length; i++) {
            if (periods[i] > dateIntervalLength) {
                minLevel = Math.max(0, i - 1);
                break;
            }
        }

        if (periods[periods.length - 1] <= dateIntervalLength) {
            minLevel = periods.length - 1;
        }

        var maxLevel = Math.min(periods.length - 1, minLevel + Number(dateIntervalLength > periods[minLevel]));

        var getCountOfIntersected = function(tileBounds, bounds) {
            var count = 0;
            for (var t = 0; t < tileBounds.length; t++) {
                if (tileBounds[t].intersects(bounds)) {
                    count++;
                }
            }

            return count;
        };

        // --------------------
        var selectTilesForNode = function(node, t1, t2) {
            if (t1 >= node.t2 || t2 <= node.t1) {
                return {count: 0, tiles: [], nodes: []};
            }

            if (options.bounds && !node.tileBounds) {
                node.tileBounds = node.tiles.map(function(it) {
                    return VectorTile.boundsFromTileKey(it);
                });
            }

            if (node.d === minLevel) {
                var count = options.bounds ? getCountOfIntersected(node.tileBounds, options.bounds) : node.count;
                return {
                    tiles: node.tiles,
                    count: count,
                    nodes: [node]
                };
            }

            var childrenCount = 0, //number of tiles if we use shorter intervals
                childrenRes = [],
				len = node.children ? node.children.length : 0,
                ds;

            for (ds = 0; ds < len; ds++) {
                if (node.children[ds]) {
                    childrenRes[ds] = selectTilesForNode(node.children[ds], Math.max(t1, node.t1), Math.min(t2, node.t2));
                } else {
                    childrenRes[ds] = {count: 0, tiles: [], nodes: []};
                }
                childrenCount += childrenRes[ds].count;
            }

            var intersectCount = options.bounds ? getCountOfIntersected(node.tileBounds, options.bounds) : node.count;

            if (node.d > maxLevel || childrenCount < intersectCount) {
                var resTilesArr = [],
                    resNodesArr = [];
                for (ds = 0; ds < childrenRes.length; ds++) {
                    resNodesArr.push(childrenRes[ds].nodes);
                    resTilesArr.push(childrenRes[ds].tiles);
                }

                return {
                    tiles: [].concat.apply([], resTilesArr),
                    count: childrenCount,
                    nodes: [].concat.apply([], resNodesArr)
                };
            } else {
                return {
                    tiles: node.tiles,
                    count: intersectCount,
                    nodes: [node]
                };
            }
        };

        var resTiles = [];
        for (var ds = 0; ds < _rootNodes.length; ds++) {
            if (_rootNodes[ds]) {
                var nodeSelection = selectTilesForNode(_rootNodes[ds], t1Val, t2Val);
                if (nodeSelection.tiles.length) {
                    resTiles = resTiles.concat(nodeSelection.tiles);
                }
            }
        }

        var resTilesHash = {};
        for (var t = 0; t < resTiles.length; t++) {
            resTilesHash[resTiles[t]] = true;
        }

        return {tiles: resTilesHash};
    };

    this.getNode = function(d, s) {
        if (d < 0 || s < 0) {
            return null;
        }

        var findNode = function(node, d, s) {
            if (!node) { return null; }

            if (periods[node.d] === d) {
                return node.s === s ? node : null;
            }

            var childrenCount = periods[node.d] / periods[node.d - 1];
            var sChild = Math.floor(s * d / periods[node.d - 1]);
            var ds = sChild - node.s * childrenCount;

            return node.children[ds] ? findNode(node.children[ds], d, s) : null;
        };

        for (var ds = 0; ds < _rootNodes.length; ds++) {
            var node = findNode(_rootNodes[ds], d, s);
            if (node) {
                return node;
            }
        }

        return null;
    };
};
L.gmx.tilesTree = function(options) {
    return new TilesTree(options);
};
})();


var ObserverTileLoader = L.Class.extend({
    includes: L.Evented ? L.Evented.prototype : L.Mixin.Events,
    initialize: function(dataManager) {
        this._dataManager = dataManager;
        this._observerData = {};
        this._tileData = {};
    },

    addObserver: function(observer) {
		this._observerData[observer.id] = {
            observer: observer,
            tiles: {},
            leftToLoad: 0,
            loadingState: false //are we loading any tiles for this observer?
        };

        observer.on('update', this._updateObserver.bind(this, observer));

        this._updateObserver(observer);

        return this;
    },

    removeObserver: function(id) {
        var obsTiles = this._observerData[id].tiles;

        for (var tileId in obsTiles) {
            delete this._tileData[tileId].observers[id];
        }

        delete this._observerData[id];

        return this;
    },

    addTile: function(tile) {
        var leftToLoadDelta = tile.state === 'loaded' ? 0 : 1;

        var tileObservers = {};

        for (var key in this._observerData) {
            var obsInfo = this._observerData[key];

            if (obsInfo.observer.intersectsWithTile(tile)) {
                obsInfo.tiles[tile.vectorTileKey] = true;
                obsInfo.leftToLoad += leftToLoadDelta;
                tileObservers[key] = true;
            }
        }

        this._tileData[tile.vectorTileKey] = {
            observers: tileObservers,
            tile: tile
        };

        tile.loadDef.then(this._tileLoadedCallback.bind(this, tile));
        return this;
    },

    removeTile: function(tileId) {
        var tileData = this._tileData[tileId],
            leftToLoadDelta = tileData.tile.state === 'loaded' ? 0 : 1;

        for (var id in tileData.observers) {
            var observerData = this._observerData[id];
            observerData.leftToLoad -= leftToLoadDelta;
            delete observerData.tiles[tileId];
        }

        delete this._tileData[tileId];

        return this;
    },

    _isLeftToLoad: function(obsData) {
		var cnt = 0,
			processingTile = this._dataManager.processingTile;
		for (var tileId in obsData.tiles) {
			var vtile = this._tileData[tileId].tile;
			if (vtile !== processingTile && vtile.state !== 'loaded') {cnt++;}
		}
		return cnt;
    },

    startLoadTiles: function(observer) {
        //force active tile list update
        this._dataManager._getActiveTileKeys();

        var obsData = this._observerData[observer.id];
        if (obsData) {
			obsData.leftToLoad = this._isLeftToLoad(obsData);
			if (obsData.leftToLoad < 1) {
				this.fire('observertileload', {observer: observer});
				return this;
			}

			if (!obsData.loadingState) {
				obsData.loadingState = true;
				observer.fire('startLoadingTiles');
			}

			for (var tileId in obsData.tiles) {
				this._tileData[tileId].tile.load();
			}
        }

        return this;
    },

    getTileObservers: function(tileId) {
        return this._tileData[tileId].observers;
    },

    getObserverLoadingState: function(observer) {
        return this._observerData[observer.id].loadingState;
    },

    getObserverLeftToLoad: function(observer) {
        return this._observerData[observer.id].leftToLoad;
    },

    _updateObserver: function(observer) {
        if (this._observerData[observer.id]) {
			var obsData = this._observerData[observer.id],
				newObserverTiles = {},
				leftToLoad = 0,
				key;

			for (key in this._tileData) {
				var tile = this._tileData[key].tile;
				if (observer.intersectsWithTile(tile)) {
					newObserverTiles[key] = true;
					if (tile.state !== 'loaded') {
						leftToLoad++;
					}
					this._tileData[key].observers[observer.id] = true;
				}
			}

			for (key in obsData.tiles) {
				if (!(key in newObserverTiles)) {
					delete this._tileData[key].observers[observer.id];
				}
			}

			obsData.tiles = newObserverTiles;
			obsData.leftToLoad = leftToLoad;
		}
    },

    _tileLoadedCallback: function(tile) {
        this.fire('tileload', {tile: tile});

        var vtk = tile.vectorTileKey;
        if (!(vtk in this._tileData)) {		// TODO: проверка загружаемого тайла
			//console.log('tileload', tile, this._tileData)
            return;
        }

        var tileObservers = this._tileData[vtk].observers;
        for (var id in tileObservers) {
            var obsData = this._observerData[id],
				leftToLoad = obsData.leftToLoad;

			obsData.leftToLoad = this._isLeftToLoad(obsData);

            if (obsData.leftToLoad < 1) {
                if (obsData.loadingState) {
                    obsData.loadingState = false;
                }
				if (leftToLoad) {
					this.fire('observertileload', {observer: obsData.observer});
				}
            }
        }
    }
});

var DataManager = L.Class.extend({
    includes: L.Evented ? L.Evented.prototype : L.Mixin.Events,

    options: {
        name: null,                         // layer ID
		srs: '',							// geometry projection (3395 or 3857)
        identityField: '',                  // attribute name for identity items
        attributes: [],                     // attributes names
        attrTypes: [],                      // attributes types
        tiles: null,                        // tiles array for nontemporal data
        tilesVers: null,                    // tiles version array for nontemporal data
        LayerVersion: -1,                   // layer version
        GeoProcessing: null,                // processing data
        Temporal: false,                    // only for temporal data
        TemporalColumnName: '',             // temporal attribute name
        ZeroDate: '01.01.2008',             // 0 date string
        TemporalPeriods: [],                // temporal periods
        TemporalTiles: [],                  // temporal tiles array
        TemporalVers: [],                   // temporal version array
        hostName: 'maps.kosmosnimki.ru',    // default hostName
        sessionKey: '',                     // session key
        isGeneralized: false,               // flag for use generalized tiles
		needBbox: false,               		// flag for get tiles list by BBOX
        isFlatten: false                    // flag for flatten geometry
    },

    setOptions: function(options) {
        if (options.GeoProcessing) {
            if (this.options.LayerVersion === options.LayerVersion) {
				return;	// не было изменения версии слоя - но сервер почему то присылает новое properties слоя
			}
			this._chkProcessing(options.GeoProcessing);
        } else {
			this._clearProcessing();
		}
        L.setOptions(this, options);
        this.optionsLink = options;
        this._isTemporalLayer = this.options.Temporal;

        var tileAttributes = L.gmxUtil.getTileAttributes(this.options);
        this.tileAttributeIndexes = tileAttributes.tileAttributeIndexes;
        this.temporalColumnType = tileAttributes.tileAttributeTypes[this.options.TemporalColumnName];

        var hostName = this.options.hostName,
            sessionKey = this.options.sessionKey || '';

        // if (!sessionKey) {
            // sessionKey = L.gmx.gmxSessionManager.getSessionKeyRes(hostName);
        // }
        this.tileSenderPrefix = L.gmxUtil.protocol + '//' + hostName + '/' +
            'TileSender.ashx?WrapStyle=None' +
            '&key=' + encodeURIComponent(sessionKey);

        this._needCheckActiveTiles = true;
    },

    _vectorTileDataProviderLoad: function(x, y, z, v, s, d, callback) {
        var _this = this;
        gmxVectorTileLoader.load(
            _this.tileSenderPrefix,
            {x: x, y: y, z: z, v: v, s: s, d: d, srs: this.options.srs, layerID: _this.options.name}
        ).then(callback, function() {
            console.log('Error loading vector tile');
            callback({values:[]});
            _this.fire('chkLayerUpdate', {dataProvider: _this}); //TODO: do we really need event here?
        });
    },

    initialize: function(options, clearVersion) {
        this._tilesTree = null;
        this._activeTileKeys = {};
        this._endDate = null;
        this._beginDate = null;

        this._tiles = {};
        this._filters = {};
        this._filtersView = {};
        this._freeSubscrID = 0;
        this._items = {};
        this._observers = {};

        this._needCheckDateInterval = false;
        this._needCheckActiveTiles = true;

        var _this = this;
        this._vectorTileDataProvider = {
            load: this._vectorTileDataProviderLoad.bind(this)
        };

        this._observerTileLoader = new ObserverTileLoader(this);
        this._observerTileLoader.on('tileload', function(event) {
            var tile = event.tile;
            _this._updateItemsFromTile(tile);

            if (_this._tilesTree) {
                var treeNode = _this._tilesTree.getNode(tile.d, tile.s);
                treeNode && treeNode.count--; //decrease number of tiles to load inside this node
            }
        });

        this._observerTileLoader.on('observertileload', function(event) {
            var observer = event.observer;
            if (observer.isActive()) {
                observer.needRefresh = false;
                observer.updateData(_this.getItems(observer.id));
            }
        });
        this.setOptions(options);
        if (clearVersion) {
			this.options.LayerVersion = -1;
		}
        if (this._isTemporalLayer) {
            this.addFilter('TemporalFilter', function(item, tile, observer) {
                var unixTimeStamp = item.options.unixTimeStamp,
                    dates = observer.dateInterval;
                return dates && unixTimeStamp >= dates.beginDate.valueOf() && unixTimeStamp < dates.endDate.valueOf();
            });
        }
    },

    _getActiveTileKeys: function() {

        this._chkMaxDateInterval();
        if (this.options.needBbox || !this._needCheckActiveTiles) {
            return this._activeTileKeys;
        }

        // только для режима с полными списками тайлов
		this._needCheckActiveTiles = false;

		if (this._isTemporalLayer) {
			var newTileKeys = {};
			if (this._beginDate && this._endDate) {
				if (!this._tilesTree) {
					this.initTilesTree();
				}
				newTileKeys = this._tilesTree.selectTiles(this._beginDate, this._endDate).tiles;
			}
			this._updateActiveTilesList(newTileKeys);
		} else {
			this.initTilesList();
		}

        return this._activeTileKeys;
    },

    getViewFilters: function(name, layerID) {
        var out = [];
		name = (name || 'screen');
		for (var key in this._filtersView[layerID]) {
			if (key.indexOf(name) === 0) {
				out.push(key);
			}
		}
        return out;
    },

    _getObserversByFilterName: function(filterName, target) {
        var oKeys = {};
        for (var id in this._observers) {
			var observer = this._observers[id];
			if (observer.hasFilter(filterName)) {
				oKeys[id] = true;
			} else if (target && target === observer.target) {
				observer.filters.push(filterName);
                oKeys[id] = true;
			}
        }
        return oKeys;
    },

    addLayerFilter: function(filterFunc, options) {
        if (options && options.layerID) {
			var	layerID = options.layerID,
				target = options.target || 'screen',
				name = target;

			if (!this._filtersView[layerID]) { this._filtersView[layerID] = {}; }
			if (options.id) { name += '_' + options.id; }

			this._filtersView[layerID][name] = filterFunc;
			this._triggerObservers(this._getObserversByFilterName(name, target));
		}
		return this;
    },

    removeLayerFilter: function(options) {
        if (this._filtersView[options.layerID]) {
			var	layerID = options.layerID,
				target = options.target || 'screen',
				name = target;
			if (options.id) { name += '_' + options.id; }

            if (this._filtersView[layerID][name]) {
				var oKeys = this._getObserversByFilterName(name, target);
				delete this._filtersView[layerID][name];
				this._triggerObservers(oKeys);
			}
        }
		return this;
    },

    addFilter: function(filterName, filterFunc) {
        this._filters[filterName] = filterFunc;
        this._triggerObservers(this._getObserversByFilterName(filterName));
		return this;
    },

    removeFilter: function(filterName) {
        if (this._filters[filterName]) {
            var oKeys = this._getObserversByFilterName(filterName);
            delete this._filters[filterName];
            this._triggerObservers(oKeys);
        }
		return this;
    },

    getItems: function(oId) {
        var resArr = [],
            observer = this._observers[oId];
// console.log('getItems', oId, this.options.name);

        // if (!observer || !observer.isActive()) {
        if (!observer) {
            return [];
        }
        if (!observer.isActive() && observer.id !== 'hover') {
            return [];
        }

        //add internal filters
        var layerID = observer.layerID,
			_filtersView = this._filtersView[layerID] || {},
			filters = observer.filters.concat('processingFilter');
        this._isTemporalLayer && filters.push('TemporalFilter');

        filters = filters.filter(function(filter) {
            return (filter in this._filters) || (filter in _filtersView);
        }.bind(this));

        var _this = this,
            putData = function(tile) {
                var data = tile.data,
					lastIndex = resArr.length,
					len = data.length;

				resArr.length = lastIndex + len;
                for (var i = 0; i < len; i++) {
                    var dataOption = tile.dataOptions[i];
                    if (!observer.intersects(dataOption.bounds)) { continue; }

                    var it = data[i],
						geom = it[it.length - 1];
                    if (!observer.intersectsWithGeometry(geom)) { continue; }

                    var id = it[0],
                        item = _this.getItem(id),
                        isFiltered = false;

                    for (var f = 0; f < filters.length; f++) {
                        var name = filters[f],
							filterFunc = _this._filters[name] || _filtersView[name];
                        if (filterFunc && !filterFunc(item, tile, observer, geom, dataOption)) {
                            isFiltered = true;
                            break;
                        }
                    }

                    if (!isFiltered) {
						var rItem = {
                            id: id,
                            properties: it,
                            item: item,
                            dataOption: dataOption,
                            v: tile.v,
                            tileKey: tile.vectorTileKey
                        };
						if (observer.itemHook) {
							observer.itemHook(rItem);
						} else {
							resArr[lastIndex++] = rItem;
						}
                    }
                }
				resArr.length = lastIndex;
            };
        var activeTileKeys =  this._getActiveTileKeys();
        for (var tkey in activeTileKeys) {
            var tile = _this._tiles[tkey].tile;
            if (tile.data && tile.data.length > 0 && (tile.z === 0 || observer.intersectsWithTile(tile))) {
                putData(tile);
            }
        }

       return resArr;
    },

    _updateItemsFromTile: function(tile) {
        var vectorTileKey = tile.vectorTileKey,
            data = tile.data || [],
            len = data.length,
            geomIndex = data[0] && (data[0].length - 1);

        for (var i = 0; i < len; i++) {
            var it = data[i],
                geom = it[geomIndex],
                id = it[0],
                item = this._items[id];
            if (item) {
                if (!item.processing) {
                    item.properties = it;
                    if (item.type.indexOf('MULTI') === -1) {
                        item.type = 'MULTI' + item.type;
                    }
                } else {
                    tile.data[i] = item.properties;
                }
                delete item.bounds;
                item.currentFilter = null;
            } else {
                item = {
                    id: id,
                    type: geom.type,
                    properties: it,
                    options: {
                        fromTiles: {}
                    }
                };
                this._items[id] = item;
            }
            item.options.fromTiles[vectorTileKey] = i;
            if (tile.isGeneralized) {
                item.options.isGeneralized = true;
            }

            if (this.options.TemporalColumnName) {
                var zn = it[this.tileAttributeIndexes[this.options.TemporalColumnName]];
                item.options.unixTimeStamp = zn * 1000;
            }
        }
        return len;
    },

    getMaxDateInterval: function() {
        this._chkMaxDateInterval();
		return {
			beginDate: this._beginDate,
			endDate: this._endDate
		};
    },

    _chkMaxDateInterval: function() {
        if (this._isTemporalLayer && this._needCheckDateInterval) {
            this._needCheckDateInterval = false;
            var observers = this._observers,
                newBeginDate = null,
                newEndDate = null;
            for (var oId in observers) {
                var observer = observers[oId],
                    dateInterval = observer.dateInterval;

                if (!dateInterval) {
                    continue;
                }

                if (!newBeginDate || dateInterval.beginDate < newBeginDate) {
                    newBeginDate = dateInterval.beginDate;
                }

                if (!newEndDate || dateInterval.endDate > newEndDate) {
                    newEndDate = dateInterval.endDate;
                }
            }
            if (newBeginDate && newEndDate && (this._beginDate !== newBeginDate || this._endDate !== newEndDate)) {
                this._beginDate = newBeginDate;
                this._endDate = newEndDate;
                this._needCheckActiveTiles = true;
            }
        }
    },

    addObserver: function(options, id) {
        id = id || 's' + (++this._freeSubscrID);
        var _this = this,
            observer = new Observer(options);

        observer.id = id;
        observer.needRefresh = true;
        this._observerTileLoader.addObserver(observer);

        observer
            .on('update', function(ev) {
                observer.needRefresh = true;
                if (ev.temporalFilter) {
                    _this._needCheckDateInterval = true;
                }

				L.gmx.layersVersion.now();
                _this._waitCheckObservers();
            })
            .on('activate', function() {
                _this.fire('observeractivate');
                _this.checkObserver(observer);
            });

        _this._needCheckDateInterval = true;
        this._observers[id] = observer;
        this._waitCheckObservers();

        if (observer.isActive()) {
            this.fire('observeractivate');
        }

        return observer;
    },

    getActiveObserversCount: function() {
        var count = 0;
        for (var k in this._observers) {
            if (this._observers[k].isActive()) { count++; }
        }
        return count;
    },

    getObserver: function(id) {
        return this._observers[id];
    },

    // removeScreenObservers: function(z) {
        // for (var k in this._observers) {
            // var observer = this._observers[k];
            // if (observer.target === 'screen') {
				// if (z && observer.z === z) {
					// continue;
				// }
				// observer.deactivate(true);
				// this.removeObserver(k);
			// }
        // }
    // },

    // toggleScreenObservers: function(flag, z) {
        // for (var k in this._observers) {
            // var observer = this._observers[k];
            // if (observer.target === 'screen' && observer.z === z) {
				// if (flag) {
					// observer.activate();
				// } else {
					// observer.deactivate();
				// }
			// }
        // }
    // },

    removeObserver: function(id) {
        if (this._observers[id]) {
            this._observerTileLoader.removeObserver(id);
            var isActive = this._observers[id].isActive();

            delete this._observers[id];

            if (isActive) {
                this.fire('observeractivate');
            }
        }
    },

    getObserverLoadingState: function(observer) {
        return this._observerTileLoader.getObserverLoadingState(observer);
    },

    getObserverLeftToLoad: function(observer) {
        return this._observerTileLoader.getObserverLeftToLoad(observer);
    },

    getTileKeysToLoad: function(beginDate, endDate) {
		var newTileKeys = this._tilesTree.selectTiles(beginDate, endDate).tiles;
        return newTileKeys;
    },

    getItemsBounds: function() {
        if (!this._itemsBounds) {
            this._itemsBounds = gmxAPIutils.bounds();
            for (var id in this._items) {
                var item = this.getItem(id);
                this._itemsBounds.extendBounds(item.bounds);
            }
        }
        return this._itemsBounds;
    },

    //combine and return all parts of geometry
    getItem: function(id) {
        var item = this._items[id];
        if (item && !item.bounds) {
            var fromTiles = item.options.fromTiles,
                arr = [];
            for (var key in fromTiles) {    // get full object bounds
                if (this._tiles[key]) {
                    var num = fromTiles[key],
                        tile = this._tiles[key].tile;
                    if (tile.state === 'loaded' && tile.dataOptions[num]) {
                        arr.push(tile.dataOptions[num].bounds);
                    } else {
                        delete fromTiles[key];
                    }
                }
            }
            if (arr.length === 1) {
                item.bounds = arr[0];
            } else {
                item.bounds = gmxAPIutils.bounds();
                var w = gmxAPIutils.worldWidthMerc;
                for (var i = 0, len = arr.length; i < len; i++) {
                    var it = arr[i];
                    if (item.bounds.max.x - it.min.x > w) {
                        it = gmxAPIutils.bounds([
                            [it.min.x + 2 * w, it.min.y],
                            [it.max.x + 2 * w, it.max.y]
                        ]);
                    }
                    item.bounds.extendBounds(it);
                }
            }
        }
        return item;
    },

    getItemMembers: function(id) {
        var fromTiles = this._items[id].options.fromTiles,
            members = [];
        for (var key in fromTiles) {
            if (this._tiles[key]) {
                var tile = this._tiles[key].tile;
                if (tile.data) {
                    var objIndex = fromTiles[key],
                        props = tile.data[objIndex],
                        dataOption = tile.dataOptions[objIndex],
                        bbox = dataOption.bounds;

                    members.push({
                        geo: props[props.length - 1],
                        width: bbox.max.x - bbox.min.x,
                        dataOption: dataOption
                    });
                }

            }
        }
        return members.sort(function(a, b) {
            return b.width - a.width;
        });
    },

    getItemGeometries: function(id) {
        var fromTiles = this._items[id] ? this._items[id].options.fromTiles : {},
            geomItems = [];
        for (var key in fromTiles) {
            if (this._tiles[key] && this._tiles[key].tile.data) {
                var tileData = this._tiles[key].tile.data,
                    props = tileData[fromTiles[key]];

                geomItems.push(gmxAPIutils.getUnFlattenGeo(props[props.length - 1]));
            }
        }
        return geomItems;
    },

    addTile: function(tile) {
        this._tiles[tile.vectorTileKey] = {tile: tile};
        this._getActiveTileKeys()[tile.vectorTileKey] = true;
        this._observerTileLoader.addTile(tile);
        this.checkObservers();
    },

    checkObserver: function(observer) {
        if (observer.needRefresh && observer.isActive()) {
            this._observerTileLoader.startLoadTiles(observer);
        }
    },

    checkObservers: function() {
        var observers = this._observers;
        for (var id in this._observers) {
            this.checkObserver(observers[id]);
        }
    },

    _waitCheckObservers: function() {
        //TODO: refactor
        if (this._checkObserversTimer) { clearTimeout(this._checkObserversTimer); }
        this._checkObserversTimer = setTimeout(L.bind(this.checkObservers, this), 25);
		// if (this._checkObserversTimer) { cancelIdleCallback(this._checkObserversTimer); }
		// this._checkObserversTimer = requestIdleCallback(L.bind(this.checkObservers, this), {timeout: 25});
    },

    _triggerObservers: function(oKeys) {
        var keys = oKeys || this._observers;

        for (var id in keys) {
            if (this._observers[id]) {
                this._observers[id].needRefresh = true;
            }
        }
        this._waitCheckObservers();
    },

    _removeDataFromObservers: function(data) {
        var keys = this._observers;
        for (var id in keys) {
            this._observers[id].removeData(data);
        }
        this._waitCheckObservers();
    },
/*
    preloadTiles: function(dateBegin, dateEnd, bounds) {
        var tileKeys = {};
        if (this._isTemporalLayer) {
            if (!this._tilesTree) {
                this.initTilesTree();
            }
            tileKeys = this._tilesTree.selectTiles(dateBegin, dateEnd).tiles;
        } else {
            this._needCheckActiveTiles = true;
            tileKeys = this._getActiveTileKeys();
        }

        var loadingDefs = [];
        for (var key in tileKeys) {
            var tile = this._getVectorTile(key, true).tile;

            if (tile.state !== 'notLoaded') {
                continue;
            }

            if (bounds && !bounds.intersects(tile.bounds)) {
                continue;
            }

            var loadDef = tile.load();
            loadingDefs.push(loadDef);
        }

        return Deferred.all.apply(null, loadingDefs);
    },
*/
    _updateActiveTilesList: function(newTilesList) {

        if (this._tileFilteringHook) {
            var filteredTilesList = {};
            for (var tk in newTilesList) {
                if (this._tileFilteringHook(this._getVectorTile(tk, true).tile)) {
                    filteredTilesList[tk] = true;
                }
            }
            newTilesList = filteredTilesList;
        }

        var oldTilesList = this._activeTileKeys || {};

        var observersToUpdate = {},
            _this = this,
            key;

        if (this.processingTile) {
            newTilesList[this.processingTile.vectorTileKey] = true;
        }
        if (this._rasterVectorTile) {
			key = this._rasterVectorTile.vectorTileKey;
            newTilesList[key] = true;
			this._tiles[key] = {tile: this._rasterVectorTile};
		}

        var checkSubscription = function(vKey) {
            var observerIds = _this._observerTileLoader.getTileObservers(vKey);
            for (var sid in observerIds) {
                observersToUpdate[sid] = true;
            }
        };

        for (key in newTilesList) {
            if (!oldTilesList[key]) {
                this._observerTileLoader.addTile(this._getVectorTile(key, true).tile);
                checkSubscription(key);
            }
        }

        for (key in oldTilesList) {
            if (!newTilesList[key]) {
                checkSubscription(key);
                this._observerTileLoader.removeTile(key);
            }
        }

        this._activeTileKeys = newTilesList;

        this._triggerObservers(observersToUpdate);
    },

    _propertiesToArray: function(it) {
        var prop = it.properties,
            indexes = this.tileAttributeIndexes,
            arr = [];

        for (var key in indexes)
            arr[indexes[key]] = prop[key];

        arr[arr.length] = it.geometry;
        arr[0] = it.id;
        return arr;
    },

    _clearProcessing: function() {
        if (this.processingTile) {
            var _items = this._items,
                tile = this.processingTile,
                vKey = tile.vectorTileKey,
                data = tile.data || [];
            for (var i = 0, len = data.length; i < len; i++) {
                var id = data[i][0];
                if (_items[id]) {
                    var item = _items[id];
                    item.processing = null;
                    item.currentFilter = null;
                    delete item.options.fromTiles[vKey];
                    delete item.fromServerProps;
                    delete item.geometry;
               }
            }
            tile.clear();
        }
    },

    _chkProcessing: function(processing) {
		this.processingTile = this.processingTile || this.addData([]);
        var _items = this._items,
            needProcessingFilter = false,
            skip = {},
			tile = this.processingTile,
			vtk = tile.vectorTileKey,
			tdata = tile.data || [],
            id, i, len, it, data, oldIt;

        if (processing) {
            if (processing.Deleted) {
                for (i = 0, len = processing.Deleted.length; i < len; i++) {
                    id = processing.Deleted[i];
                    skip[id] = true;
                    if (_items[id]) {
                        _items[id].processing = true;
                        _items[id].currentFilter = null;
                    }
                }
				if (len > 0) { needProcessingFilter = true; }
            }

            var out = {};
            if (processing.Inserted) {
                for (i = 0, len = processing.Inserted.length; i < len; i++) {
                    it = processing.Inserted[i];
                    id = it[0];
					oldIt = _items[id];
					if (oldIt && oldIt.processing && this._isUpdateded(it, oldIt.properties) !== it.length - 1) {
						tdata[oldIt.options.fromTiles[vtk]] = it;
						continue;
					}
                    if (!skip[id]) { out[id] = it; }
                }
            }

            if (processing.Updated) {
                for (i = 0, len = processing.Updated.length; i < len; i++) {
                    it = processing.Updated[i];
                    id = it[0];
					oldIt = _items[id];
					if (oldIt && oldIt.processing && this._isUpdateded(it, oldIt.properties) !== it.length - 1) {
						tdata[oldIt.options.fromTiles[vtk]] = it;
						continue;
					}
                    if (!skip[id]) { out[id] = it; }
					if (!needProcessingFilter) { needProcessingFilter = true; }
                }
            }

            data = [];
            for (id in out) {
                if (this._items[id]) {
                    this._items[id].properties = out[id];
                    this._items[id].processing = true;
                    this._items[id].currentFilter = null;
                }
                data.push(out[id]);
            }

            if (data.length > 0) {
                this.processingTile = this.addData(data);
            }
        }

        if (needProcessingFilter) {
            this.addFilter('processingFilter', function(item, tile) {
                return tile.z === 0 || !item.processing;
            });
        } else if (this._filters['processingFilter']) {
            this.removeFilter('processingFilter');
        }
    },

	_isUpdateded: function(a, b) {
		if (a.length === b.length) {
			for (var i = 0, len = a.length; i < len; i++) {
				if ((typeof(a[i]) === 'object' && JSON.stringify(a[i]) !== JSON.stringify(b[i])) && a[i] !== b[i]) {
					return i;
				}
			}
			return false;
		} else {
			return true;
		}
	},

    enableGeneralization: function() {
        if (!this.options.isGeneralized) {
            this.options.isGeneralized = true;
            this._resetTilesTree();
        }
    },

    disableGeneralization: function() {
        if (this.options.isGeneralized) {
            this.options.isGeneralized = false;
            this._resetTilesTree();
        }
    },

    _resetTilesTree: function() {
        this._tilesTree = null;
		this._reCheckActiveTileKeys();
        // this._needCheckActiveTiles = true;
        // this._getActiveTileKeys(); //force list update
    },

    updateVersion: function(options, tiles) {
		if (!L.gmx.skipLoadTiles) {
			if (options) {
				this.setOptions(options);
			}
			if (tiles) {	// есть списки тайлов по BBOX
				this._needCheckActiveTiles = false;
				var tKey, newTiles = {}, newActiveTileKeys = {};
				for (var i = 0, cnt = 0, len = tiles.length; i < len; i += 6, cnt++) {
					tKey = VectorTile.createTileKey({z: Number(tiles[i]), x: Number(tiles[i + 1]), y: Number(tiles[i + 2]), v: Number(tiles[i + 3]), d: Number(tiles[i + 4]), s: Number(tiles[i + 5])});
					newTiles[tKey] = this._getVectorTile(tKey, true);
					newActiveTileKeys[tKey] = true;
				}
				this._tiles = newTiles;
				if (this.processingTile) {
					this._tiles[this.processingTile.vectorTileKey] = {
						tile: this.processingTile
					};
				}
				this._updateActiveTilesList(newActiveTileKeys);
			} else {
				this._resetTilesTree();
			}
		}
    },

    getNotLoadedVectorTiles: function(options) {
		var count = 0;

        if (options.tiles) {
				// options.tilesOrder = ["Z", "X", "Y", "V", "Level", "Span"]
            var arr = options.tiles || [];

            for (var i = 0, cnt = 0, len = arr.length; i < len; i += 6, cnt++) {
                if (!this._tiles[VectorTile.createTileKey({z: Number(arr[i]), x: Number(arr[i + 1]), y: Number(arr[i + 2]), v: Number(arr[i + 3]), d: Number(arr[i + 4]), s: Number(arr[i + 5])})]) {
					count++;
				}
			}
		}
		return count;
    },

    _getDataKeys: function(data) {
        var chkKeys = {};
        for (var i = 0, len = data.length; i < len; i++) {
            chkKeys[data[i][0]] = true;
        }
        return chkKeys;
    },

    _getProcessingTile: function() {
        if (!this.processingTile) {
			var x = -0.5, y = -0.5, z = 0, v = 0, s = -1, d = -1, isFlatten = this.options.isFlatten;

            this.processingTile = new VectorTile({load: function(x, y, z, v, s, d, callback) {
                            callback({values: []});
            }}, {x: x, y: y, z: z, v: v, s: s, d: d, isFlatten: isFlatten});

            this.addTile(this.processingTile);
        }
        return this.processingTile;
    },

    addData: function(data) {
        if (!data) {
            data = [];
        }
        var vTile = this._getProcessingTile(),
            chkKeys = this._getDataKeys(data),
            dataBounds = vTile.addData(data, chkKeys);

        if (this._itemsBounds) {
            this._itemsBounds.extendBounds(dataBounds);
        }
        this._updateItemsFromTile(vTile);
        this._triggerObservers();
        return vTile;
    },

    removeData: function(data) {
        this._itemsBounds = null;
        var vTile = this.processingTile;
        if (vTile) {
			var chkKeys = (data || vTile.data).reduce(function(a,item) {
				var id = typeof(item) === 'string' ? item : item[0];
				a[id] = true;
				delete this._items[id];
				return a;
			}.bind(this), {});
            this._removeDataFromObservers(chkKeys);
            vTile.removeData(chkKeys, true);
            this._updateItemsFromTile(vTile);

            this._triggerObservers();
        }

        return vTile;
    },

    initTilesTree: function() {
        this._tilesTree = L.gmx.tilesTree(this.options);
        this.options.TemporalTiles = this.options.TemporalVers = null;

        if ('TemporalTiles' in this.optionsLink) {
            this.optionsLink.TemporalVers = this.optionsLink.TemporalTiles = null;
        }
        this.dateZero = this._tilesTree.dateZero;
        if (this.processingTile) {
            this._tiles[this.processingTile.vectorTileKey] = {
                tile: this.processingTile
            };
        }
    },

    _getVectorTile: function(vKey, createFlag) {
        if (!this._tiles[vKey] && createFlag) {
            var info = VectorTile.parseTileKey(vKey);
            info.dateZero = this.dateZero;
            this._addVectorTile(info);
        }
        return this._tiles[vKey];
    },

    _addVectorTile: function(info) {
        info.isFlatten = this.options.isFlatten;
        info.needBbox = this.options.needBbox;
        info.attributes = this.options.attributes;
        var tile = new VectorTile(this._vectorTileDataProvider, info),
            vKey = tile.vectorTileKey;

        this._tiles[vKey] = {tile: tile};
        return vKey;
    },

    _getGeneralizedTileKeys: function(vTilePoint) {
        var dz = vTilePoint.z % 2 ? 1 : 2,
            pz = Math.pow(2, dz),
            z = vTilePoint.z - dz,
            x = Math.floor(vTilePoint.x / pz),
            y = Math.floor(vTilePoint.y / pz),
            temp = {v: vTilePoint.v, s: -1, d: -1, isGeneralized: true},
            keys = {};

        while (z > 1) {
            var gKey = [z, x, y].join('_');
            keys[gKey] = L.extend({}, temp, {x: x, y: y, z: z});
            z -= 2;
            x = Math.floor(x / 4);
            y = Math.floor(y / 4);
        }
        return keys;
    },

    initTilesList: function() {         // For non temporal layers we create all Vector tiles
        var newActiveTileKeys = {};
        if (this.options.tiles) {
            var arr = this.options.tiles || [],
                vers = this.options.tilesVers,
                generalizedKeys = this.options.isGeneralized ? {} : null,
                newTiles = {},
                gKey, tKey, info, tHash;

            for (var i = 0, cnt = 0, len = arr.length; i < len; i += 3, cnt++) {
                info = {
                    x: Number(arr[i]),
                    y: Number(arr[i + 1]),
                    z: Number(arr[i + 2]),
                    v: Number(vers[cnt]),
                    s: -1,
                    d: -1
                };

                tHash = this._getVectorTile(VectorTile.createTileKey(info), true);
                tKey = tHash.tile.vectorTileKey;
                newTiles[tKey] = tHash;
                newActiveTileKeys[tKey] = true;
                if (generalizedKeys) {
                    var gKeys = this._getGeneralizedTileKeys(info);
                    for (gKey in gKeys) {
                        var gPoint = gKeys[gKey];
                        if (generalizedKeys[gKey]) {
                            generalizedKeys[gKey].v = Math.max(gPoint.v, generalizedKeys[gKey].v);
                        } else {
                            generalizedKeys[gKey] = gPoint;
                        }
                    }
                }
            }
            if (generalizedKeys) {
                for (gKey in generalizedKeys) {
                    info = generalizedKeys[gKey];
                    tKey = VectorTile.createTileKey(info);
                    if (!newTiles[tKey]) {
                        if (!this._tiles[tKey]) { this._addVectorTile(info); }
                        newTiles[tKey] = this._tiles[tKey];
                        newActiveTileKeys[tKey] = true;
                    }
                }
            }
            this._tiles = newTiles;
            if (this.processingTile) {
                this._tiles[this.processingTile.vectorTileKey] = {
                    tile: this.processingTile
                };
            }
        }
        this._updateActiveTilesList(newActiveTileKeys);
    },

    //Tile filtering hook filters out active vector tiles.
    //Can be used to prevent loading data from some spatial-temporal region
    setTileFilteringHook: function(filteringHook) {
        this._tileFilteringHook = filteringHook;
		this._reCheckActiveTileKeys();
        // this._needCheckActiveTiles = true;
        // this._getActiveTileKeys(); //force list update
    },

    removeTileFilteringHook: function() {
        this._tileFilteringHook = null;
		this._reCheckActiveTileKeys();
        // this._needCheckActiveTiles = true;
        // this._getActiveTileKeys(); //force list update
    },

    _reCheckActiveTileKeys: function() {
        this._needCheckActiveTiles = true;
        this._getActiveTileKeys(); //force list update
    }

});
L.gmx = L.gmx || {};
L.gmx.DataManager = DataManager;


var VectorGridLayer = L.GridLayer.extend({
	_animateZoom: function (e) {
		this.options.updateWhenZooming = false;
		this._setView(e.center, e.zoom, true, true);
	},

	_setZoomTransform: function (level, center, zoom) {	// Add by Geomixer (for cache levels transform)
		var key = level.zoom + '_' + zoom + '_' + level.origin.x + '_' + level.origin.y,
			cache = L.gmx._zoomLevelsCache[key] || {},
			translate = cache.translate,
			scale = cache.scale;
		if (!translate) {
			scale = this._map.getZoomScale(zoom, level.zoom);
			translate = level.origin.multiplyBy(scale).subtract(this._map._getNewPixelOrigin(center, zoom))._round();
			L.gmx._zoomLevelsCache[key] = {translate: translate, scale: scale};
		}
		if (L.Browser.any3d) {
			L.DomUtil.setTransform(level.el, translate, scale);
		} else {
			L.DomUtil.setPosition(level.el, translate);
		}
	},
	_clearOldLevels: function (z) {
		if (this._map) {
			z = z || this._map.getZoom();
			for (var key in this._levels) {
				var el = this._levels[key].el,
					zz = Number(key);
				if (zz !== z) {
					L.DomUtil.remove(el);
					this._removeTilesAtZoom(zz);
					this._onRemoveLevel(zz);
					delete this._levels[key];
				}
			}
		}
	},
	_noTilesToLoad: function () {
		var zoom = this._tileZoom || this._map.getZoom();
		for (var key in this._tiles) {
			if (this._tiles[key].coords.z === zoom && !this._tiles[key].loaded) { return false; }
		}
		return true;
	},

	_tileReady: function (coords, err, tile) {
		if (!this._map) { return; }				// Add by Geomixer (нет возможности отключения fade-anim)

		if (err) {
			// @event tileerror: TileErrorEvent
			// Fired when there is an error loading a tile.
			this.fire('tileerror', {
				error: err,
				tile: tile,
				coords: coords
			});
		}

		var key = this._tileCoordsToKey(coords);

		tile = this._tiles[key];
		if (!tile) { return; }

		tile.loaded = +new Date();

		if (!err) {
			L.DomUtil.addClass(tile.el, 'leaflet-tile-loaded');
			this.fire('tileload', {		// @event tileload: TileEvent // Fired when a tile loads.
				tile: tile.el,
				coords: coords
			});
		}

		if (this._noTilesToLoad()) {
			this._loading = false;
			this._clearOldLevels(this._tileZoom);
			this.fire('load');			// @event load: Event // Fired when the grid layer loaded all visible tiles.
		}
	},
	//////////////////
	_updateLevels: function () {		// Add by Geomixer (coords.z is Number however _levels keys is String)

		var zoom = this._tileZoom,
			map = this._map;
			// ,
		    // maxZoom = this.options.maxZoom;

		if (zoom === undefined) { return undefined; }

		for (var z in this._levels) {
			var delta = zoom - z;
			if (delta === 0) {
				this._levels[z].origin = map.project(map.unproject(map.getPixelOrigin()), zoom).round();
				this._onUpdateLevel(zoom);
			}
		}

		var level = this._levels[zoom];

		if (!level) {
			level = this._levels[zoom] = {};

			level.el = L.DomUtil.create('div', 'leaflet-tile-container leaflet-zoom-animated', this._container);

			level.origin = map.project(map.unproject(map.getPixelOrigin()), zoom).round();
			level.zoom = zoom;

			this._setZoomTransform(level, map.getCenter(), map.getZoom());

			// force the browser to consider the newly added element for transition
			// L.Util.falseFn(level.el.offsetWidth);

			this._onCreateLevel(level);
		}

		this._level = level;

		return level;
	},

	_update: function (center) {				// Add by Geomixer (для события update _tiles + не добавлять пустые тайлы)
		var map = this._map;
		if (!map) { return; }
		var zoom = this._clampZoom(map.getZoom());

		if (center === undefined) { center = map.getCenter(); }
		if (this._tileZoom === undefined) { return; }	// if out of minzoom/maxzoom

		var pixelBounds = this._getTiledPixelBounds(center),
		    tileRange = this._pxBoundsToTileRange(pixelBounds),
		    tileCenter = tileRange.getCenter(),
		    queue = [],
		    margin = this.options.keepBuffer,
		    noPruneRange = new L.Bounds(tileRange.getBottomLeft().subtract([margin, -margin]),
		                              tileRange.getTopRight().add([margin, -margin]));

		// Sanity check: panic if the tile range contains Infinity somewhere.
		if (!(isFinite(tileRange.min.x) &&
		      isFinite(tileRange.min.y) &&
		      isFinite(tileRange.max.x) &&
		      isFinite(tileRange.max.y))) { throw new Error('Attempted to load an infinite number of tiles'); }

		for (var key in this._tiles) {
			var c = this._tiles[key].coords;
			if (c.z !== this._tileZoom || !noPruneRange.contains(new L.Point(c.x, c.y))) {
				this._tiles[key].current = false;
			}
		}

		// _update just loads more tiles. If the tile zoom level differs too much
		// from the map's, let _setView reset levels and prune old tiles.
		if (Math.abs(zoom - this._tileZoom) > 1) { this._setView(center, zoom); return; }

		// create a queue of coordinates to load tiles from
		for (var j = tileRange.min.y; j <= tileRange.max.y; j++) {
			for (var i = tileRange.min.x; i <= tileRange.max.x; i++) {
				var coords = new L.Point(i, j);
				coords.z = this._tileZoom;

				if (!this._isValidTile(coords)) { continue; }

				var tile = this._tiles[this._tileCoordsToKey(coords)];
				if (tile) {
					tile.current = true;
					// if (tile.el.parentNode !== this._level.el) {
						// this._level.el.appendChild(tile.el);
					// }
				} else {
					queue.push(coords);
				}
			}
		}

		// sort tile queue to load tiles in order of their distance to center
		queue.sort(function (a, b) {
			return a.distanceTo(tileCenter) - b.distanceTo(tileCenter);
		});

		if (queue.length !== 0) {
			// if it's the first batch of tiles to load
			if (!this._loading) {
				this._loading = true;
				// @event loading: Event
				// Fired when the grid layer starts loading tiles.
				this.fire('loading');
			}

			// create DOM fragment to append tiles in one batch
			var fragment = document.createDocumentFragment();

			for (i = 0; i < queue.length; i++) {
				this._addTile(queue[i], fragment);
			}

			// if (!(this instanceof L.gmx.VectorLayer)) {
				// this._level.el.appendChild(fragment);
			// }
		}
		this.fire('update');
	}
});

L.gmx.VectorLayer = VectorGridLayer.extend({
    options: {
		tilesCRS: L.CRS.EPSG3395,
        openPopups: [],
		className: 'vector-tiles',
        minZoom: 1,
        zIndexOffset: 0,
        isGeneralized: true,
        isFlatten: false,
        useWebGL: false,
		skipTiles: 'All', // All, NotVisible, None
        iconsUrlReplace: [],
        cacheRasters: true,
        cacheQuicklooks: true,
        clearCacheOnLoad: true,
        showScreenTiles: false,
		updateWhenZooming: false,
		// bubblingMouseEvents: false,
		keepBuffer: 0,
        clickable: true
    },

	// extended from L.GridLayer
    initialize: function(options) {
        // options = L.setOptions(this, L.extend(this.options, options));
        options = L.setOptions(this, options);

        this._initPromise = new Promise(function(resolve, reject) {
			this._resolve = resolve;
			this._reject = reject;
		}.bind(this));

        this.repaintObservers = {};    // external observers like screen

        this._gmx = {
            hostName: gmxAPIutils.normalizeHostname(options.hostName || 'maps.kosmosnimki.ru'),
            mapName: options.mapID,
			sessionKey: this.options.sessionKey,
			iconsUrlReplace: this.options.iconsUrlReplace,
			showScreenTiles: this.options.showScreenTiles,
            skipTiles: options.skipTiles,
            needBbox: options.skipTiles === 'All',
            useWebGL: options.useWebGL,
			srs: options.srs || '',
            layerID: options.layerID,
            beginDate: options.beginDate,
            endDate: options.endDate,
            sortItems: options.sortItems || null,
            styles: options.styles || [],
            shiftXlayer: 0,
            shiftYlayer: 0,
            renderHooks: [],
            preRenderHooks: [],
            _needPopups: {}
        };
		if (/\buseWebGL=1\b/.test(location.search)) {
			this._gmx.useWebGL = true;
		}
        if (options.cacheQuicklooks) {			// cache quicklooks for CR
            this._gmx.quicklooksCache = {};
        }
        if (options.cacheRasters) {				// cache rasters for CR
            this._gmx.rastersCache = {};
        }
        if (options.crossOrigin) {
            this._gmx.crossOrigin = options.crossOrigin;
        }
	},

    _onCreateLevel: function(level) {
		this._updateShiftY(level.zoom);
		//console.log('_onCreateLevel ', level);
    },

	_initContainer: function () {
		if (this._container) { return; }

		var classNames = ['leaflet-layer'];
		if (this.options.className) { classNames.push(this.options.className); }

		this._container = L.DomUtil.create('div', classNames.join(' '));
		if (this.options.clickable === false) {
			this._container.style.pointerEvents = 'none';
		}
		this._updateZIndex();

		this.getPane(this.options.pane).appendChild(this._container);
	},

    _onVersionChange: function () {
        this._updateProperties(this._gmx.rawProperties);
		//this._chkTiles();
    },

	_waitCheckOldLevels: function () {
		if (this._oldLevelsTimer) { clearTimeout(this._oldLevelsTimer); }
		this._oldLevelsTimer = setTimeout(this._chkOldLevels.bind(this), 250);
    },

	_chkOldLevels: function () {
		if (!this._map) {return;}
		var zoom = this._map._zoom,
			key, tile;

		for (key in this._tiles) {
			tile = this._tiles[key];
			if (tile.coords.z === zoom && !tile.loaded) {
				return;
			}
		}
		this._loading = false;
		this._clearOldLevels(zoom);
		this.fire('load');			// @event load: Event // Fired when the grid layer loaded all visible tiles.
	},

	_waitOnMoveEnd: function () {
		if (this._onmoveendTimer) { clearTimeout(this._onmoveendTimer); }
		this._onmoveendTimer = setTimeout(this._chkTiles.bind(this), 250);
    },

	_chkCurrentTiles: function () {
		if (!this._map) {return;}
		// console.log('_onmoveend ', this._tileZoom, this._loading, this._noTilesToLoad(), this._tileZoom, Date.now());
		var zoom = this._tileZoom || this._map._zoom,
			key, tile;

		for (key in this._tiles) {
			tile = this._tiles[key];
			if (tile.coords.z === zoom) {
				L.DomUtil.setPosition(tile.el, this._getTilePos(tile.coords));	// позиции тайлов
				if (!tile.promise) {							// данный тайл еще не рисовался
					this.__drawTile(tile);
				}
			}
		}
    },

	_chkTiles: function () {
		this._chkCurrentTiles();
		this.repaint();
		this._waitCheckOldLevels();
	},

	// _removeScreenObservers: function (z, flag) {
        // if (this._gmx && this._gmx.dataManager) {
			// var dm = this._gmx.dataManager;
			// dm.removeScreenObservers(z);
			// if (flag) {
				// dm.fire('moveend');
			// }
		// }
	// },

	// _onMoveEnd: function () {
		// if (!this._map || this._map._animatingZoom) { return; }
//console.log('_onMoveEnd', arguments)
		// requestIdleCallback(function () {
			// this._update();
		// }.bind(this), {timeout: 0});
		//this._update();
	// },

	_getEvents: function () {
		var events = L.GridLayer.prototype.getEvents.call(this);
		L.extend(events, {
			// zoomanim: function(ev) {
				//this._setZoomTransforms(ev.center, ev.zoom);
			// }
			// beforezoomanim: function(ev) {
				// this._setZoomTransforms(ev.center, ev.zoom);
			// }

			// zoomstart: function() {
				// console.log('zoomstart', this._map._zoom, this._gmx.layerID, arguments);
				// this._gmx.zoomstart = true;
				// this._removeScreenObservers();
			// }
			//,
			// zoomanim: function(ev) {
				// this._setZoomTransforms(ev.center, ev.zoom);
				// this._gmx.zoomstart = true;
			// },
			// zoomend: function() {
				//this._gmx.zoomstart = false;
				// this._drawDoneObjectsCount = this._drawnObjectsCount;
				// this._drawnObjectsCount = 0;
			// }
		});
        var gmx = this._gmx;
        var owner = {
			dateIntervalChanged: function() {
				this._chkTiles();
				if (L.gmx.sendCmd) {
					var interval = gmx.dataManager.getMaxDateInterval();
					L.gmx.sendCmd('dateIntervalChanged', {
						layerID: gmx.layerID,
						mapID: gmx.mapName,
						hostName: gmx.hostName,
						dInterval: [Math.floor(interval.beginDate.getTime() / 1000), Math.floor(interval.endDate.getTime() / 1000)]
					});
				}
			},
			// load: function() {				// Fired when the grid layer starts loading tiles.
				// console.log('load layer ', this._tileZoom, this._map._zoom, Date.now() - window.startTest)
				// this._clearOldLevels(this._tileZoom);
				// if (this._onloadTimer) { clearTimeout(this._onloadTimer); }
				// this._onloadTimer = setTimeout(L.bind(this.repaint, this), 150);
			// },

			tileloadstart: function(ev) {				// тайл (ev.coords) загружается
				var key = ev.key || this._tileCoordsToKey(ev.coords),
					tLink = this._tiles[key];

				tLink.loaded = 0;
			},
			stylechange: function() {
				// var gmx = this._gmx;
				if (!gmx.balloonEnable && this._popup) {
					this.unbindPopup();
				} else if (gmx.balloonEnable && !this._popup) {
					this.bindPopup('');
				}
				if (this._map) {
					if (this.options.minZoom !== gmx.styleManager.minZoom || this.options.maxZoom !== gmx.styleManager.maxZoom) {
						this.options.minZoom = gmx.styleManager.minZoom;
						this.options.maxZoom = gmx.styleManager.maxZoom;
						this._map._updateZoomLevels();
					}
					if (gmx.labelsLayer) {
						this._map._labelsLayer.add(this);
					} else if (!gmx.labelsLayer) {
						this._map._labelsLayer.remove(this);
					}
					// this.redraw();
					this.repaint();
					this._chkTiles();
				}
			},
			versionchange: this._onVersionChange
		};
		events.moveend = this._waitOnMoveEnd.bind(this);
		events.zoomend = this._waitOnMoveEnd.bind(this);

		return {
			map: events,
			owner: owner
		};
	},

	beforeAdd: function(map) {
		this._updateShiftY(map.getZoom());
        L.GridLayer.prototype.beforeAdd.call(this, map);
		this._map = map;
		this._drawnObjectsCount = 0;
    },

    onAdd: function(map) {
		map = map || this._map;
        if (map.options.crs !== L.CRS.EPSG3857 && map.options.crs !== L.CRS.EPSG3395) {
            throw 'GeoMixer-Leaflet: map projection is incompatible with GeoMixer layer';
        }
		this.beforeAdd(map);

        var gmx = this._gmx;

		this.options.tilesCRS = gmx.srs == 3857 ? L.CRS.EPSG3857 : L.CRS.EPSG3395;
        gmx.shiftY = 0;
        gmx.applyShift = map.options.crs === L.CRS.EPSG3857 && gmx.srs != 3857;
        gmx.currentZoom = map.getZoom();
		this._levels = {}; // need init before styles promise resolved
		this._tiles = {};
		this._initContainer();

		gmx.styleManager.initStyles().then(function () {
			if (gmx.balloonEnable && !this._popup) { this.bindPopup(''); }

			if (this._map) {
				var events = this._getEvents();
				map.on(events.map, this);
				this.on(events.owner, this);
				this.once('remove', function () {
					map.off(events.map, this);
					this.off(events.owner, this);
				}, this);

				L.gmx._zoomLevelsCache = {};
				this._invalidateAll();
				this._resetView();
				gmx.dataManager.fire('moveend');

				this._chkTiles();
				L.gmx.layersVersion.add(this);
			}
			// this._addLayerVersion();
			this.fire('add');
		}.bind(this));
   },

    onRemove: function(map) {
        var gmx = this._gmx,
			dm = gmx.dataManager;
        // if (dm) {
			// dm.removeScreenObservers();
		// }

		if (gmx.labelsLayer) {	// удалить из labelsLayer
			map._labelsLayer.remove(this);
		}

		//gmx.badTiles = {};
        gmx.quicklooksCache = {};
        gmx.rastersCache = {};
        delete gmx.map;
        if (dm && !dm.getActiveObserversCount()) {
			L.gmx.layersVersion.remove(this);
        }
        if (this._map) {
			L.GridLayer.prototype.onRemove.call(this, map);
		}
        this._map = null;
        this.fire('remove');
    },
	_removeTile: function (key) {
		if (!this._map || this._map._animatingZoom) { return; }
        if (this._gmx && this._gmx.dataManager) {
			this._gmx.dataManager.removeObserver(key);		// TODO: про active
		}
        L.GridLayer.prototype._removeTile.call(this, key);
	},

    _updateZIndex: function () {
        if (this._container) {
            var options = this.options,
                zIndex = options.zIndex || 0,
                zIndexOffset = options.zIndexOffset || 0;

           this._container.style.zIndex = zIndexOffset + zIndex;
        }
	   this.fire('zindexupdated')
	},

/*eslint-disable no-unused-vars */
	createTile: function(coords , done) {
		//this._test = [coords, done];
		var tile = L.DomUtil.create('canvas', 'leaflet-tile');
		var size = this.getTileSize();
		tile.width = tile.height = 0;
		tile.style.width = size.x + 'px';
		tile.style.height = size.y + 'px';
		tile.onselectstart = L.Util.falseFn;
		tile.onmousemove = L.Util.falseFn;

		// without this hack, tiles disappear after zoom on Chrome for Android
		// https://github.com/Leaflet/Leaflet/issues/2078
		if (L.Browser.android && !L.Browser.android23) {
			tile.style.WebkitBackfaceVisibility = 'hidden';
		}
		// tile.setAttribute('role', 'presentation');

		// tile.style.opacity = this.options.opacity;
		return tile;
    },
/*eslint-enable */

    //block: public interface
    initFromDescription: function(ph) {
        var gmx = this._gmx;

        gmx.properties = ph.properties;
        gmx.geometry = ph.geometry;

        if (gmx.properties._initDone) {    // need delete tiles key
            delete gmx.properties[gmx.properties.Temporal ? 'TemporalTiles' : 'tiles'];
        }
        gmx.properties._initDone = true;

        if (!gmx.geometry) {
            var worldSize = gmxAPIutils.tileSizes[1];
            gmx.geometry = {
                type: 'POLYGON',
                coordinates: [[[-worldSize, -worldSize], [-worldSize, worldSize], [worldSize, worldSize], [worldSize, -worldSize], [-worldSize, -worldSize]]]
            };
        }

        // Original properties from the server.
        // Descendant classes can override this property
        // Not so good solution, but it works
        gmx.rawProperties = ph.rawProperties || ph.properties;

        this._updateProperties(ph.properties);
        if (gmx.rawProperties.type === 'Vector') {
			ph.properties.srs = gmx.srs = 3857;
			gmx.RasterSRS = Number(gmx.rawProperties.RasterSRS) || 3857;
        // } else if (gmx.rawProperties.RasterSRS) {
			// ph.properties.srs = gmx.srs = Number(gmx.rawProperties.RasterSRS);
		}

        ph.properties.sessionKey = ph.properties.sessionKey || gmx.sessionKey || '';
        ph.properties.needBbox = gmx.needBbox;
        ph.properties.isGeneralized = this.options.isGeneralized;
        ph.properties.isFlatten = this.options.isFlatten;

        gmx.dataManager = this.options.dataManager || new DataManager(ph.properties);

        if (this.options.parentOptions) {
			if (!ph.properties.styles) { ph.properties.styles = this.options.parentOptions.styles; }
			gmx.dataManager.on('versionchange', this._onVersionChange, this);
		}

		gmx.styleManager = new StyleManager(gmx);
        this.options.minZoom = gmx.styleManager.minZoom;
        this.options.maxZoom = gmx.styleManager.maxZoom;

        gmx.dataManager.on('observeractivate', this._chkNeedLayerVersion, this);

        if (gmx.properties.type === 'Vector' && !('chkUpdate' in this.options)) {
            this.options.chkUpdate = true; //Check updates for vector layers by default
        }
        if (gmx.rawProperties.type !== 'Raster' && this._objectsReorderInit) {
            this._objectsReorderInit(this);
        }

        if (gmx.clusters) {
            this.bindClusters(JSON.parse(gmx.clusters));
        }
        if (gmx.filter) {
/*eslint-disable no-useless-escape */
            var func = L.gmx.Parsers.parseSQL(gmx.filter.replace(/[\[\]]/g, '"'));
/*eslint-enable */
            if (func) {
				gmx.dataManager.addFilter('userFilter_' + gmx.layerID, function(item) {
					return gmx.layerID !== this._gmx.layerID || !func || func(item.properties, gmx.tileAttributeIndexes, gmx.tileAttributeTypes) ? item.properties : null;
				}.bind(this));
            }
        }
        if (gmx.dateBegin && gmx.dateEnd) {
            this.setDateInterval(gmx.dateBegin, gmx.dateEnd);
        }

        this._resolve();
        return this;
    },

    getStyleIcon: function (nm, txt) {
		return this._gmx.styleManager.getStyleIcon(nm, txt);
    },

    _chkNeedLayerVersion: function () {
		if (this._chkNeedLayerVersionTimer) { clearTimeout(this._chkNeedLayerVersionTimer); }
		this._chkNeedLayerVersionTimer = setTimeout(function() {
				if (this._gmx.dataManager.getActiveObserversCount()) {
					L.gmx.layersVersion.add(this);
				} else {
					L.gmx.layersVersion.remove(this);
				}
			}.bind(this)
		, 100);
    },
/*
    _addLayerVersion: function () {
		// if (this._onVersionTimer) { cancelIdleCallback(this._onVersionTimer); }
		// this._onVersionTimer = requestIdleCallback(L.gmx.layersVersion.add.bind(L.gmx.layersVersion, this), {timeout: 0});
		if (this._onVersionTimer) { clearTimeout(this._onVersionTimer); }
		this._onVersionTimer = setTimeout(L.gmx.layersVersion.add.bind(L.gmx.layersVersion, this), 0);
    },
*/
    getDataManager: function () {
		return this._gmx.dataManager;
    },

    enableGeneralization: function () {
        if (!this.options.isGeneralized) {
            this.options.isGeneralized = true;
            if (this._gmx.dataManager) {
                // this._clearAllSubscriptions();
                this._gmx.dataManager.enableGeneralization();
                this.redraw();
				this._chkTiles();
            }
        }
    },

    disableGeneralization: function () {
        if (this.options.isGeneralized) {
            this.options.isGeneralized = false;
            if (this._gmx.dataManager) {
                // this._clearAllSubscriptions();
                this._gmx.dataManager.disableGeneralization();
                this.redraw();
				this._chkTiles();
            }
        }
    },

    setRasterOpacity: function (opacity) {
        if (this._gmx.rasterOpacity !== opacity) {
            this._gmx.rasterOpacity = opacity;
            this._initPromise.then(this.repaint.bind(this));
        }
        return this;
    },

    getStyles: function () {
        return this._gmx.styleManager.getStyles();
    },

    getIcons: function (callback) {
        this._gmx.styleManager.getIcons(callback);
        return this;
    },

    setStyles: function (styles) {
        this._initPromise.then(function() {
            this._gmx.styleManager.clearStyles();
            if (styles) {
                styles.forEach(function(it, i) {
                    this.setStyle(it, i, true);
                }.bind(this));
            } else {
                this.fire('stylechange');
            }
        }.bind(this));
        return this;
    },

    getStyle: function (num) {
        return this.getStyles()[num];
    },

    setStyle: function (style, num, createFlag) {
        this._initPromise.then(function() {
            this._gmx.styleManager.setStyle(style, num, createFlag).then(function () {
                this.fire('stylechange', {num: num || 0});
                this.repaint();
            }.bind(this));
        }.bind(this));
        return this;
    },

    setStyleHook: function (func) {
        this._gmx.styleHook = func;
        this.repaint();
        return this;
    },

    removeStyleHook: function () {
        this._gmx.styleHook = null;
        return this;
    },

    setRasterHook: function (func) {
        this._gmx.rasterProcessingHook = func;
        this.repaint();
        return this;
    },

    removeRasterHook: function () {
        this._gmx.rasterProcessingHook = null;
        this.repaint();
        return this;
    },

    setFilter: function (func) {
        var gmx = this._gmx;
        gmx.dataManager.addFilter('userFilter', function(item) {
            return gmx.layerID !== this._gmx.layerID || !func || func(item) ? item.properties : null;
        }.bind(this));
        return this;
    },

    removeFilter: function () {
        this._gmx.dataManager.removeFilter('userFilter');
        return this;
    },

    addLayerFilter: function (func, options) {
        var gmx = this._gmx;

		options = options || {};
		options.layerID = gmx.layerID;

        gmx.dataManager.addLayerFilter(function(item) {
            return !func || func(item) ? item.properties : null;
        }.bind(this), options);

        return this;
    },

    removeLayerFilter: function (options) {
		options = options || {};
		options.layerID = this._gmx.layerID;
        this._gmx.dataManager.removeLayerFilter(options);
        return this;
    },

    setDateInterval: function (beginDate, endDate) {
        var gmx = this._gmx;

        if (gmx.dateBegin && gmx.dateEnd) {
			beginDate = gmx.dateBegin;
			endDate = gmx.dateEnd;
		}

        //check that something changed
        if (!gmx.beginDate !== !beginDate ||
            !gmx.endDate !== !endDate ||
            beginDate && (gmx.beginDate.valueOf() !== beginDate.valueOf()) ||
            endDate && (gmx.endDate.valueOf() !== endDate.valueOf())
        ) {
            if (gmx.rawProperties.maxShownPeriod && beginDate) {
                var msecPeriod = gmx.rawProperties.maxShownPeriod * 24 * 3600 * 1000;
                beginDate = new Date(Math.max(beginDate.valueOf(), endDate.valueOf() - msecPeriod));
            }

            gmx.beginDate = beginDate;
            gmx.endDate = endDate;

            var observer = null,
				dataManager = gmx.dataManager;
            for (var key in this._tiles) {
				this._tiles[key].loaded = 0;
				observer = this._tiles[key].observer;
				if (observer) {
					observer.setDateInterval(beginDate, endDate);
				}
            }
            observer = dataManager.getObserver('_Labels');
            if (observer) {
                observer.setDateInterval(beginDate, endDate);
            }
			if (gmx.skipTiles === 'NotVisible' || gmx.needBbox || gmx.properties.UseTiles === false) {
				if (!gmx.needBbox) {
					gmx.properties.LayerVersion = -1;
					dataManager.setOptions({LayerVersion: -1});
				}
				if (this._map) {
					L.gmx.layersVersion.now();
				}
			}
            this.fire('dateIntervalChanged');
        }

        return this;
    },

    getDateInterval: function() {
        return {
            beginDate: this._gmx.beginDate,
            endDate: this._gmx.endDate
        };
    },

    addObserver: function (options) {
        return this._gmx.dataManager.addObserver(options);
    },

    removeObserver: function(observer) {
        return this._gmx.dataManager.removeObserver(observer.id);
    },

    setPositionOffset: function(dx, dy) {
        var gmx = this._gmx;
        gmx.shiftXlayer = dx;
        gmx.shiftYlayer = dy;
        this._update();
        return this;
    },

    getPositionOffset: function() {
        var gmx = this._gmx;
        return {shiftX: gmx.shiftXlayer, shiftY: gmx.shiftYlayer};
    },

    setZIndexOffset: function (offset) {
        if (arguments.length) {
            this.options.zIndexOffset = offset;
        }
        this._updateZIndex();
        return this;
    },

    _clearLoaded: function (zKey) {
		if (this._tiles[zKey]) {
			this._tiles[zKey].loaded = 0;
		}
    },

    repaint: function (zKeys) {
        if (this._map) {
			this._chkCurrentTiles();
            if (!zKeys) {
				var zoom = L.gmx._zoomStart || this._tileZoom || this._map._zoom,
					key, tile;
				// console.log('_____',  L.gmx._zoomStart, this._tileZoom, this._map._zoom)
                zKeys = {};
                for (key in this._tiles) {
					tile = this._tiles[key];
					if (tile.coords.z === zoom) {
						zKeys[key] = true;
						this._clearLoaded(key);
						if (tile.observer) { tile.observer.activate(true); }
					} else if (tile.observer) {
						tile.observer.deactivate(true);
					}
				}
                L.extend(zKeys, this.repaintObservers);
            } else if (L.Util.isArray(zKeys)) {
				var arr = zKeys;
				zKeys = {};
				arr.forEach(function (it) { zKeys[it] = true; this._clearLoaded(it); }.bind(this) );
            } else if (typeof zKeys === 'string') {
				var it = zKeys;
				this._clearLoaded(it);
				zKeys = {};
				zKeys[it] = true;
			}
            this._gmx.dataManager._triggerObservers(zKeys);
			//this._onmoveend();
       }
    },

    redrawItem: function (id) {
        if (this._map) {
            var item = this._gmx.dataManager.getItem(id),
                gmxTiles = this._getTilesByBounds(item.bounds);

            this.repaint(gmxTiles);
        }
    },

    appendTileToContainer: function (tileLink) {		// call from screenTile
		//createTi
		if (this._level && this._level.zoom === tileLink.coords.z && this._level.el !== tileLink.el.parentNode) {
			this._level.el.appendChild(tileLink.el);
		}
    },

    addData: function(data, options) {
        if (!this._gmx.mapName) {     // client side layer
            this._gmx.dataManager.addData(data, options);
            this.repaint();
        }
        return this;
    },

    removeData: function(data, options) {
        if (!this._gmx.mapName) {     // client side layer
            this._gmx.dataManager.removeData(data, options);
            this.repaint();
        }
        return this;
    },

    getStylesByProperties: function(propArray, zoom) {
        return this._gmx.styleManager.getCurrentFilters(propArray, zoom);
    },

    getItemStyle: function(id) {
        var gmx = this._gmx,
            item = gmx.dataManager.getItem(id);
        return gmx.styleManager.getObjStyle(item);
    },

    getTileAttributeTypes: function() {
        return this._gmx.tileAttributeTypes;
    },

    getTileAttributeIndexes: function() {
        return this._gmx.tileAttributeIndexes;
    },

    getItemBalloon: function(id) {
        var gmx = this._gmx,
            item = gmx.dataManager.getItem(id),
            styles = this.getStyles(),
            out = '';

        if (item && styles[item.currentFilter]) {
            var propsArr = item.properties;
            out = L.gmxUtil.parseBalloonTemplate(styles[item.currentFilter].Balloon, {
                properties: this.getItemProperties(propsArr),
                geometries: [propsArr[propsArr.length - 1]],
                tileAttributeTypes: gmx.tileAttributeTypes,
                unitOptions: this._map ? this._map.options : {}
            });
        }
        return out;
    },

    getItemProperties: function(propArray) {
        var properties = {},
            indexes = this._gmx.tileAttributeIndexes;
        for (var key in indexes) {
            properties[key] = propArray[indexes[key]];
        }
        return properties;
    },

    addPreRenderHook: function(renderHook) {
        this._gmx.preRenderHooks.push(renderHook);
        this.repaint();
    },

    removePreRenderHook: function(hook) {
        var arr = this._gmx.preRenderHooks;
        for (var i = 0, len = arr.length; i < len; i++) {
            if (arr[i] === hook) {
                arr.splice(i, 1);
                this.repaint();
                break;
            }
        }
    },

    addRenderHook: function(renderHook) {
        this._gmx.renderHooks.push(renderHook);
        this.repaint();
    },

    removeRenderHook: function(hook) {
        var arr = this._gmx.renderHooks;
        for (var i = 0, len = arr.length; i < len; i++) {
            if (arr[i] === hook) {
                arr.splice(i, 1);
                this.repaint();
                break;
            }
        }
    },
    getGmxProperties: function() {
        return this._gmx.rawProperties;
	},

    //returns L.LatLngBounds
    getBounds: function() {
        var gmxBounds = this._gmx.layerID ? gmxAPIutils.geoItemBounds(this._gmx.geometry).bounds : this._gmx.dataManager.getItemsBounds();

        if (gmxBounds) {
			return gmxBounds.toLatLngBounds(this._gmx.srs == 3857);
        } else {
            return new L.LatLngBounds();
        }
    },

    getGeometry: function() {
        if (!this._gmx.latLngGeometry) {
            this._gmx.latLngGeometry = L.gmxUtil.geometryToGeoJSON(this._gmx.geometry, true, this._gmx.srs == 3857);
        }

        return this._gmx.latLngGeometry;
    },

    getPropItem: function (key, propArr) {
        return gmxAPIutils.getPropItem(key, propArr, this._gmx.tileAttributeIndexes);
    },

	//block: internal

    _getTilesByBounds: function (bounds) {    // Получить список gmxTiles по bounds
        var gmx = this._gmx,
            zoom = this._tileZoom || this._map._zoom,
            shiftX = gmx.shiftX || 0,   // Сдвиг слоя
            shiftY = gmx.shiftY || 0,   // Сдвиг слоя + OSM
			latLngBounds = bounds.toLatLngBounds(gmx.srs == 3857),
            minLatLng = latLngBounds.getSouthWest(),
            maxLatLng = latLngBounds.getNorthEast(),
            screenBounds = this._map.getBounds(),
            sw = screenBounds.getSouthWest(),
            ne = screenBounds.getNorthEast(),
            dx = 0;


        if (ne.lng - sw.lng < 360) {
            if (maxLatLng.lng < sw.lng) {
                dx = 360 * (1 + Math.floor((sw.lng - maxLatLng.lng) / 360));
            } else if (minLatLng.lng > ne.lng) {
                dx = 360 * Math.floor((ne.lng - minLatLng.lng) / 360);
            }
        }
        minLatLng.lng += dx;
        maxLatLng.lng += dx;

        var pixelBounds = this._map.getPixelBounds(),
            minPoint = this._map.project(minLatLng),
            maxPoint = this._map.project(maxLatLng),
			ts = this.options.tileSize;

        var minY, maxY, minX, maxX;
        if (pixelBounds) {
            minY = Math.floor((Math.max(maxPoint.y, pixelBounds.min.y) + shiftY) / ts);
            maxY = Math.floor((Math.min(minPoint.y, pixelBounds.max.y) + shiftY) / ts);
            minX = minLatLng.lng <= -180 ? pixelBounds.min.x : Math.max(minPoint.x, pixelBounds.min.x);
            minX = Math.floor((minX + shiftX) / ts);
            maxX = maxLatLng.lng >= 180 ? pixelBounds.max.x : Math.min(maxPoint.x, pixelBounds.max.x);
            maxX = Math.floor((maxX + shiftX) / ts);
        } else {
            minY = Math.floor((maxPoint.y + shiftY) / ts);
            maxY = Math.floor((minPoint.y + shiftY) / ts);
            minX = Math.floor((minPoint.x + shiftX) / ts);
            maxX = Math.floor((maxPoint.x + shiftX) / ts);
        }
        var gmxTiles = {};
        for (var x = minX; x <= maxX; x++) {
            for (var y = minY; y <= maxY; y++) {
                var zKey = this._tileCoordsToKey({x: x, y: y, z:zoom});
                gmxTiles[zKey] = true;
            }
        }
      return gmxTiles;
    },

    _updateProperties: function (prop) {
        var gmx = this._gmx;
        if (!gmx.sessionKey) {
			gmx.sessionKey = prop.sessionKey = this.options.sessionKey || ''; //should be already received
		}

        if (this.options.parentOptions) {
			prop = this.options.parentOptions;
		}

        gmx.identityField = prop.identityField; // ogc_fid
        gmx.GeometryType = (prop.GeometryType || '').toLowerCase();   // тип геометрий обьектов в слое
        gmx.minZoomRasters = prop.RCMinZoomForRasters || 1;// мин. zoom для растров
        gmx.minZoomQuicklooks = gmx.minZoomRasters; // по умолчанию minZoom для квиклуков и КР равны

        var type = prop.type || 'Vector';
        if (prop.Temporal) { type += 'Temporal'; }
        gmx.layerType = type;   // VectorTemporal Vector
        gmx.items = {};

        L.extend(gmx, L.gmxUtil.getTileAttributes(prop));
        if (gmx.dataManager) {
            gmx.dataManager.setOptions(prop);
        }
        if ('ZIndexField' in prop) {
            if (prop.ZIndexField in gmx.tileAttributeIndexes) {
                gmx.zIndexField = gmx.tileAttributeIndexes[prop.ZIndexField];   // sort field index
            }
        }
        if (this._objectsReorder) {
            this._objectsReorder.initialize();
        }

        // if ('clusters' in prop) {
            // gmx.clusters = prop.clusters;
        // }

        gmx.filter = prop.filter; 	// for dataSource attr
        gmx.dateBegin = prop.dateBegin;
        gmx.dateEnd = prop.dateEnd;
        gmx.dataSource = prop.dataSource;
        if ('MetaProperties' in gmx.rawProperties) {
            var meta = gmx.rawProperties.MetaProperties;
            if ('srs' in meta) {  		// проекция слоя
                gmx.srs = meta.srs.Value || '';
            }
            if ('parentLayer' in meta) {  // фильтр слоя		// todo удалить после изменений вов вьювере
                gmx.dataSource = meta.parentLayer.Value || '';
            }
            if ('filter' in meta) {  // фильтр слоя
                gmx.filter = meta.filter.Value || '';
            }
            if ('dateBegin' in meta) {  // фильтр для мультивременного слоя
                gmx.dateBegin = L.gmxUtil.getDateFromStr(meta.dateBegin.Value || '01.01.1980');
            }
            if ('dateEnd' in meta) {  // фильтр для мультивременного слоя
                gmx.dateEnd = L.gmxUtil.getDateFromStr(meta.dateEnd.Value || '01.01.1980');
            }
            if ('shiftX' in meta || 'shiftY' in meta) {  // сдвиг всего слоя
                gmx.shiftXlayer = meta.shiftX ? Number(meta.shiftX.Value) : 0;
                gmx.shiftYlayer = meta.shiftY ? Number(meta.shiftY.Value) : 0;
            }
            if ('shiftXfield' in meta || 'shiftYfield' in meta) {    // поля сдвига растров объектов слоя
                if (meta.shiftXfield) { gmx.shiftXfield = meta.shiftXfield.Value; }
                if (meta.shiftYfield) { gmx.shiftYfield = meta.shiftYfield.Value; }
            }
            if ('quicklookPlatform' in meta) {    // тип спутника
                gmx.quicklookPlatform = meta.quicklookPlatform.Value;
                if (gmx.quicklookPlatform === 'image') { delete gmx.quicklookPlatform; }
            }
            if ('quicklookX1' in meta) { gmx.quicklookX1 = meta.quicklookX1.Value; }
            if ('quicklookY1' in meta) { gmx.quicklookY1 = meta.quicklookY1.Value; }
            if ('quicklookX2' in meta) { gmx.quicklookX2 = meta.quicklookX2.Value; }
            if ('quicklookY2' in meta) { gmx.quicklookY2 = meta.quicklookY2.Value; }
            if ('quicklookX3' in meta) { gmx.quicklookX3 = meta.quicklookX3.Value; }
            if ('quicklookY3' in meta) { gmx.quicklookY3 = meta.quicklookY3.Value; }
            if ('quicklookX4' in meta) { gmx.quicklookX4 = meta.quicklookX4.Value; }
            if ('quicklookY4' in meta) { gmx.quicklookY4 = meta.quicklookY4.Value; }

            if ('gmxProxy' in meta) {    // Установка прокачивалки
                gmx.gmxProxy = meta.gmxProxy.Value.toLowerCase() === 'true' ? L.gmx.gmxProxy : meta.gmxProxy.Value;
            }
            if ('multiFilters' in meta) {    // проверка всех фильтров для обьектов слоя
                gmx.multiFilters = meta.multiFilters.Value === '1' ? true : false;
            }
            if ('isGeneralized' in meta) {    // Set generalization
                this.options.isGeneralized = meta.isGeneralized.Value !== 'false';
            }
            if ('isFlatten' in meta) {        // Set flatten geometry
                this.options.isFlatten = meta.isFlatten.Value !== 'false';
            }
        }
        if (prop.Temporal) {    // Clear generalization flag for Temporal layers
            this.options.isGeneralized = false;
        }

        if (prop.IsRasterCatalog) {
            gmx.IsRasterCatalog = prop.IsRasterCatalog;
            var layerLink = gmx.tileAttributeIndexes.GMX_RasterCatalogID;
            if (layerLink) {
                gmx.rasterBGfunc = function(x, y, z, item, srs) {
                    var properties = item.properties,
						url = L.gmxUtil.protocol + '//' + gmx.hostName
							+ '/TileSender.ashx?ModeKey=tile&ftc=osm'
							+ '&x=' + x
							+ '&y=' + y
							+ '&z=' + z;
					if (srs || gmx.srs) { url += '&srs=' + (srs || gmx.srs); }
					if (gmx.crossOrigin) { url += '&cross=' + gmx.crossOrigin; }
					url += '&LayerName=' + properties[layerLink];
					if (gmx.sessionKey) { url += '&key=' + encodeURIComponent(gmx.sessionKey); }
					if (L.gmx._sw && item.v) { url += '&sw=' + L.gmx._sw + '&v=' + item.v; }
                    return url;
                };
            }
        }
        if (prop.Quicklook) {
            var quicklookParams;

            //раньше это была просто строка с шаблоном квиклука, а теперь стало JSON'ом
            if (prop.Quicklook[0] === '{') {
                quicklookParams = JSON.parse(prop.Quicklook);
            } else {
                quicklookParams = {
                    minZoom: gmx.minZoomRasters,
                    template: prop.Quicklook
                };
            }

            if ('X1' in quicklookParams) { gmx.quicklookX1 = quicklookParams.X1; }
            if ('Y1' in quicklookParams) { gmx.quicklookY1 = quicklookParams.Y1; }
            if ('X2' in quicklookParams) { gmx.quicklookX2 = quicklookParams.X2; }
            if ('Y2' in quicklookParams) { gmx.quicklookY2 = quicklookParams.Y2; }
            if ('X3' in quicklookParams) { gmx.quicklookX3 = quicklookParams.X3; }
            if ('Y3' in quicklookParams) { gmx.quicklookY3 = quicklookParams.Y3; }
            if ('X4' in quicklookParams) { gmx.quicklookX4 = quicklookParams.X4; }
            if ('Y4' in quicklookParams) { gmx.quicklookY4 = quicklookParams.Y4; }

            var template = gmx.Quicklook = quicklookParams.template;
            if ('minZoom' in quicklookParams) { gmx.minZoomQuicklooks = quicklookParams.minZoom; }
            gmx.quicklookBGfunc = function(item) {
                var url = template,
                    reg = /\[([^\]]+)\]/,
                    matches = reg.exec(url);
                while (matches && matches.length > 1) {
                    url = url.replace(matches[0], item.properties[gmx.tileAttributeIndexes[matches[1]]]);
                    matches = reg.exec(url);
                }
				//if (gmx.srs) { url += (url.indexOf('?') === -1 ? '?' : '&') + 'srs=' + gmx.srs; }
                return url;
            };
            gmx.imageQuicklookProcessingHook = L.gmx.gmxImageTransform;
        }
        this.options.attribution = prop.Copyright || '';
    },

    _updateShiftY: function(zoom) {
        var gmx = this._gmx;
		gmx.currentZoom = zoom;
		gmx.tileSize = gmxAPIutils.tileSizes[zoom];
		gmx.mInPixel = this.options.tileSize / gmx.tileSize;
    },

    __drawTile: function (ev) {
		var coords = ev.coords,
			zKey = this._tileCoordsToKey(coords),
			tileElem = this._tiles[zKey];
		if (!tileElem) {
			return;
		}

        var myLayer = this,
			zoom = this._tileZoom,
            gmx = this._gmx;

        // if (tileElem.observer) {
			// gmx.dataManager.removeObserver(tileElem.observer.id);
			// tileElem.reject();
			//this._tileReady(coords, null, tileElem.el);
		// }

        if (!tileElem.promise) {
			tileElem.loaded = 0;
			tileElem.key = zKey;
			tileElem.screenTile = new ScreenVectorTile(myLayer, tileElem);
			tileElem.promise = new Promise(function(resolve, reject) {
				tileElem.resolve = resolve;
				tileElem.reject = reject;
				var filters = gmx.dataManager.getViewFilters('screen', gmx.layerID);
                var done = function() {
					if (tileElem.count) {
						myLayer._drawnObjectsCount += tileElem.count;
						myLayer.appendTileToContainer(tileElem);
					}
					myLayer._tileReady(coords, null, tileElem.el);
                };
				tileElem.observer = gmx.dataManager.addObserver({
                    type: 'resend',
                    layerID: gmx.layerID,
                    needBbox: gmx.needBbox,
					//topLeft: tileElem.screenTile.topLeft,
                    srs: gmx.srs,
                    target: 'screen',
                    z: zoom,
					targetZoom: myLayer.options.isGeneralized ? zoom : null,
					dateInterval: gmx.layerType === 'VectorTemporal' ? [gmx.beginDate, gmx.endDate] : null,
                    active: true,
                    bbox: gmx.styleManager.getStyleBounds(coords),
                    filters: ['clipFilter', 'userFilter_' + gmx.layerID, 'styleFilter', 'userFilter'].concat(filters),
                    callback: function(data) {
                        // if (myLayer._tiles[zKey] && !myLayer._map._animatingZoom) {
                        if (myLayer._tiles[zKey]) {
							myLayer._tiles[zKey].loaded = 0;

							// if (!tileElem.screenTile) {
								// tileElem.screenTile = new ScreenVectorTile(myLayer, tileElem);
							// }

							tileElem.screenTile.drawTile(data).then(function(res) {
								// console.log('resolve', zKey, res, data);
								if (res) { tileElem.count = res.count; }
								done(res);
							}, function(err) {
								// console.log('reject', zKey, err, data);
								done(err);
							});
						} else {
							// console.log('bad key', zKey);
							done();
						}
                    }
				}, zKey)
			}).catch(function(e) {
				console.warn('catch:', e);
			});
		} else {
			tileElem.resolve();
		}
    // },

	// _abortLoading: function () {	// stops loading all tiles in the background layer
		// this._removeScreenObservers();
	}
});
L.Map.addInitHook(function () {
    if (L.Mixin.ContextMenu) {
		L.gmx.VectorLayer.include(L.Mixin.ContextMenu);
	}
	this.options.ftc = this.options.ftc || 'osm';
	this.options.srs = this.options.srs || 3857;
	this.options.skipTiles = this.options.skipTiles || 'All';

	L.gmx.leafletMap = this;
	L.gmx._zoomLevelsCache = {};
	// L.gmx._zoomAnimCache = {};

	// this.on('zoomend', function(ev) {
			// console.log('zoomend ', ev);
	// }, this);
	this.on('zoomstart', function(ev) {
			// console.log('zoomstart ', ev);
		L.gmx._zoomStart = ev.zoom;
		L.gmx._zoomLevelsCache = {};
		L.gmx._zoomLevelsCount = 0;
		var cnt = 0,
			maxZoomAnimGmxLayers = this.options.maxZoomAnimGmxLayers || 5;
		for (var key in this._layers) {
			var it = this._layers[key];
			if (it._map && it instanceof L.gmx.VectorLayer) {
				var func = L.DomUtil.removeClass;
				if (ev.zoom > this._zoom && (it._drawnObjectsCount === 0 || (cnt > maxZoomAnimGmxLayers))) {func = L.DomUtil.addClass;}
				else {cnt++;}
				func(it._container, 'leaflet-zoom-hide');
				it._drawnObjectsCount = 0;
			}
		}
	}, this);
});


// Single tile on screen with vector data
var fetchOptions = {
	//mode: 'cors',
	credentials: 'include'
};

function ScreenVectorTile(layer, tileElem) {
    this.layer = layer;
	this.ts = layer.options.tileSize;
	this.tileElem = tileElem;
	this.tile = tileElem.el;
	var tilePoint = tileElem.coords,
		zoom = tilePoint.z,
		pz = Math.pow(2, zoom),
		x = tilePoint.x % pz,
		y = tilePoint.y % pz,
		utils = gmxAPIutils;

    if (x < 0) { x += pz; }
    if (y < 0) { y += pz; }
    this.ntp = {z: zoom, x: x, y: y};

	this.tilePoint = tilePoint;
    this.zoom = zoom;
    this.gmx = layer._gmx;
    this.zKey = this.layer._tileCoordsToKey(tilePoint, zoom);
    this.worldWidthMerc = utils.worldWidthMerc;

    var gmxTilePoint = utils.getTileNumFromLeaflet(tilePoint, zoom);
    this.tpx = this.ts * gmxTilePoint.x;
    this.tpy = this.ts * (1 + gmxTilePoint.y);

	var tileSize = utils.tileSizes[tilePoint.z] * this.ts / 256;

    this.tbounds = utils.getBoundsByTilePoint(this.ntp, tileSize);
    this.topLeft = {
		tilePoint: tilePoint,
		tileSize: tileSize,
		mInPixel: this.ts / tileSize,
		pix: {
			px: this.ts * tilePoint.x,
			py: this.ts * tilePoint.y
		},
		wm: {
			x: tileSize * tilePoint.x - this.worldWidthMerc,
			y: this.worldWidthMerc - tileSize * tilePoint.y
		},
		bounds: utils.getBoundsByTilePoint(tilePoint, tileSize)
	};

    this.gmxTilePoint = gmxTilePoint;

    this.showRaster =
        (zoom >= this.gmx.minZoomRasters && 'rasterBGfunc' in this.gmx) ||
        (zoom >= this.gmx.minZoomQuicklooks && 'quicklookBGfunc' in this.gmx);
    this.rasters = {}; //combined and processed canvases for each vector item in tile
    this.rasterRequests = {};   // all cached raster requests
    this.itemsView = [];   		// items on screen tile + todo: without not visible
    this._uniqueID = 0;         // draw attempt id
    this.gmx.badTiles = this.gmx.badTiles || {};
}

ScreenVectorTile.prototype = {
    _getUrlFunction: function (gtp, item) {
		return this.gmx.rasterBGfunc(gtp.x, gtp.y, gtp.z, item);
    },
    _chkZoom: function (zoom) {
		return	(zoom >= this.gmx.minZoomRasters && 'rasterBGfunc' in this.gmx) ||
				(zoom >= this.gmx.minZoomQuicklooks && 'quicklookBGfunc' in this.gmx);
    },

    _loadTileRecursive: function (tilePoint, item) {    //return promise, which resolves with object {gtp, image}
        var gmx = this.gmx,
			gtp = {z: tilePoint.z, x: this.ntp.x, y: this.ntp.y},
            _this = this;

		// for (var key in this.rasterRequests) {
			// this.rasterRequests[key].reject();
		// }
		this.rasterRequests = {};

		return new Promise(function(resolve) {
			var tryLoad = function(gtp, crossOrigin) {
				var rUrl = _this._getUrlFunction(gtp, item);
				if (gmx.rastersCache && gmx.rastersCache[rUrl]) {
					resolve({gtp: gtp, image: gmx.rastersCache[rUrl]});
				} else {
					var tryHigherLevelTile = function(url) {
						if (url) {
							gmx.badTiles[url] = true;
						}

						var nextZoom = gtp.z - 1;
						if (nextZoom && _this._chkZoom(nextZoom)) {
							tryLoad({
								x: Math.floor(gtp.x / 2),
								y: Math.floor(gtp.y / 2),
								z: nextZoom
							}, ''); // 'anonymous' 'use-credentials'
						} else {
							resolve({gtp: gtp});
						}
					},
					skipUrl = function(res) {
						_this.layer.fire('bitmap', {id: item.id, loaded: false, url: rUrl, result: res});
						tryHigherLevelTile(rUrl);
					};

					if (gmx.badTiles[rUrl] || (gmx.maxNativeZoom && gmx.maxNativeZoom < gtp.z)) {
						tryHigherLevelTile();
						return;
					}

					if (L.gmx.getBitmap) {
						L.gmx.getBitmap(rUrl, fetchOptions).then(
							function(res) {
								if (res) {
									var imageObj = res.imageBitmap,
										canvas_ = document.createElement('canvas');
									canvas_.width = imageObj.width;
									canvas_.height = imageObj.height;
									canvas_.getContext('2d').drawImage(imageObj, 0, 0, canvas_.width, canvas_.width);
									if (gmx.rastersCache) {
										gmx.rastersCache[rUrl] = canvas_;
									}
									resolve({gtp: gtp, image: canvas_});
									_this.layer.fire('bitmap', {id: item.id, loaded: true, url: rUrl, result: res});
								} else {
									skipUrl();
								}
							},
							skipUrl
							// function(res) {
								// _this.layer.fire('bitmap', {id: item.id, loaded: false, url: rUrl, result: res});
								// tryHigherLevelTile(rUrl);
							// }
						)
						.catch(L.Util.falseFn);
					} else {
						var request = _this.rasterRequests[rUrl];
						if (!request) {
							if (gmx.rasterProcessingHook) {
								crossOrigin = 'anonymous';
							}
							request = L.gmx.imageLoader.push(rUrl, {
								tileRastersId: _this._uniqueID,
								zoom: _this.zoom,
								cache: true,
								crossOrigin: gmx.crossOrigin || crossOrigin || ''
							});
							_this.rasterRequests[rUrl] = request;
						} else {
							request.options.tileRastersId = _this._uniqueID;
						}
						request.def.then(
							function(imageObj) {
								if (imageObj) {
									if (gmx.rastersCache) {
										gmx.rastersCache[rUrl] = imageObj;
									}
									resolve({gtp: gtp, image: imageObj});
								} else {
									tryHigherLevelTile(rUrl);
								}
							},
							function() {
								// console.log('tryHigherLevelTile111 ', rUrl);
								tryHigherLevelTile(rUrl);
							}
						);
					}
				}
			};

			tryLoad(gtp);
		});
    },

    _rasterHook: function (attr) {
        var source = attr.sourceTilePoint || attr.destinationTilePoint,
            info = {
                geoItem: attr.geoItem,
				zKey: attr.zKey,
                destination: {
                    z: attr.destinationTilePoint.z,
                    x: attr.destinationTilePoint.x,
                    y: attr.destinationTilePoint.y
                },
                source: {
                    z: source.z,
                    x: source.x,
                    y: source.y
                }
            };
        if (attr.url) { info.quicklook = attr.url; }
        return (this.gmx.rasterProcessingHook || this._defaultRasterHook)(
            attr.res, attr.image,
            attr.sx || 0, attr.sy || 0, attr.sw || 256, attr.sh || 256,
            attr.dx || 0, attr.dy || 0, attr.dw || 256, attr.dh || 256,
            info
        );
    },

    // default rasterHook: res - result canvas other parameters as http://www.w3schools.com/tags/canvas_drawimage.asp
    _defaultRasterHook: function (res, image, sx, sy, sw, sh, dx, dy, dw, dh) {
		if (image) {
			var ptx = res.getContext('2d');
			ptx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
		}
		return res;
    },

    // get pixels parameters for shifted object
    _getShiftPixels: function (it) {
        var w = it.dx + (it.dx < 0 ? 256 : 0),
            h = it.dy + (it.dy < 0 ? 256 : 0),
            sx = 0, sw = 256 - w, dx = w, dw = sw;
        if (it.tx > it.x) {
            sx = sw; sw = w; dx = 0; dw = sw;
        }
        if (sx === 256 || sw < 1) { return null; }

        var sy = h, sh = 256 - h, dy = 0, dh = sh;
        if (it.ty > it.y) {
            sy = 0; dy = sh; sh = h; dh = sh;
        }
        if (sy === 256 || sh < 1) { return null; }

        return {
            sx: sx, sy: sy, sw: sw, sh: sh,
            dx: dx, dy: dy, dw: dw, dh: dh
        };
    },

    // get tiles parameters for shifted object
    _getShiftTilesArray: function (bounds, shiftX, shiftY) {
        var mInPixel = this.topLeft.mInPixel,
            gmxTilePoint = this.gmxTilePoint,
            px = shiftX * mInPixel,
            py = shiftY * mInPixel,
            deltaX = Math.floor(0.5 + px % this.ts),            // shift on tile in pixel
            deltaY = Math.floor(0.5 + py % this.ts),
            tileSize = this.ts / mInPixel,
            tminX = gmxTilePoint.x - shiftX / tileSize,     // by screen tile
            tminY = gmxTilePoint.y - shiftY / tileSize,
            rminX = Math.floor(tminX),
            rmaxX = rminX + (tminX === rminX ? 0 : 1),
            rminY = Math.floor(tminY),
            rmaxY = rminY + (tminY === rminY ? 0 : 1),
            minX = Math.floor((bounds.min.x - shiftX) / tileSize),  // by geometry bounds
            maxX = Math.floor((bounds.max.x - shiftX) / tileSize),
            minY = Math.floor((bounds.min.y - shiftY) / tileSize),
            maxY = Math.floor((bounds.max.y - shiftY) / tileSize);

        if (rminX < minX) { rminX = minX; }
        if (rmaxX > maxX) { rmaxX = maxX; }
        if (rminY < minY) { rminY = minY; }
        if (rmaxY > maxY) { rmaxY = maxY; }

        var arr = [];
        for (var j = rminY; j <= rmaxY; j++) {
            for (var i = rminX; i <= rmaxX; i++) {
                arr.push({
                    z: gmxTilePoint.z,
                    x: i,
                    y: j,
                    dx: deltaX,
                    dy: deltaY,
                    tx: tminX,
                    ty: tminY
                });
            }
        }
        return arr;
    },

    _chkRastersByItemIntersect: function (arr, item) {
		var geo = item.properties[item.properties.length - 1],
			out = [];
		arr.forEach(function(it) {
			var bounds = gmxAPIutils.getBoundsByTilePoint(it);
			if (gmxAPIutils.isItemIntersectBounds(geo, bounds)) {
				out.push(it);
			}
		});
		return out;
    },

	getTilePosZoomDelta: function(tilePoint, zoomFrom, zoomTo) {		// получить смещение тайла на меньшем zoom
        var dz = Math.pow(2, zoomFrom - zoomTo),
            size = this.ts / dz,
            dx = tilePoint.x % dz,
            dy = tilePoint.y % dz;
		return {
			size: size,
			zDelta: dz,
			x: size * dx,
			y: size * dy
		};
    },

    // Loads missing rasters for single item and combines them in canvas.
    // Stores resulting canvas in this.rasters
    _getItemRasters: function (geo) {
        var properties = geo.properties,
            idr = properties[0],
            _this = this,
            gmx = this.gmx,
            indexes = gmx.tileAttributeIndexes,
            rasters = this.rasters,
            shiftX = Number(gmx.shiftXfield ? gmxAPIutils.getPropItem(gmx.shiftXfield, properties, indexes) : 0) % this.worldWidthMerc,
            shiftY = Number(gmx.shiftYfield ? gmxAPIutils.getPropItem(gmx.shiftYfield, properties, indexes) : 0),
            isShift = shiftX || shiftY,
            urlBG = gmxAPIutils.getPropItem('urlBG', properties, indexes),
            url = '',
            itemImageProcessingHook = null,
            isTiles = false,
            item = gmx.dataManager.getItem(idr),
            gmxTilePoint = this.gmxTilePoint,
            tilePoint = this.tilePoint,
            ntp = this.ntp,
            resCanvas = null;

		item.v = geo.v;
		if (gmx.IsRasterCatalog && (gmx.rawProperties.type === 'Raster' || gmxAPIutils.getPropItem('GMX_RasterCatalogID', properties, indexes))) {
			isTiles = true;                     // Raster Layer
		} else if (gmx.quicklookBGfunc) {
			url = gmx.quicklookBGfunc(item);    // Quicklook
			itemImageProcessingHook = gmx.imageQuicklookProcessingHook;
		} else if (urlBG) {
			url = urlBG;                        // Image urlBG from properties
			itemImageProcessingHook = gmx.imageQuicklookProcessingHook;
		}
		if (isTiles) {
			return new Promise(function(resolve1) {
				var dataOption = geo.dataOption || {},
					tileToLoadPoints = this._chkRastersByItemIntersect(isShift ? this._getShiftTilesArray(dataOption.bounds, shiftX, shiftY) : [ntp], geo);

				var cnt = tileToLoadPoints.length,
					chkReadyRasters = function() {
						if (cnt < 1) { resolve1(); }
					},
					skipRasterFunc = function() {
						cnt--;
						chkReadyRasters();
					},
					onLoadFunction = function(gtp, p, img) {
						item.skipRasters = false;
						var isImage = true;

						if (itemImageProcessingHook) {
							img = itemImageProcessingHook(img, {
								gmx: gmx,
								geoItem: geo,
								item: item,
								gmxTilePoint: gtp
							});
							isImage = false;
						}

						var info = {
								geoItem: geo,
								image: img,
								zKey: _this.zKey,
								destinationTilePoint: tilePoint,
								sourceTilePoint: gtp,
								sx: 0, sy: 0, sw: _this.ts, sh: _this.ts,
								dx: 0, dy: 0, dw: _this.ts, dh: _this.ts
							};

						if (isShift) {
							var pos = _this._getShiftPixels(p);
							if (pos === null) {
								skipRasterFunc();
								return;
							}
							L.extend(info, pos);
							isImage = false;
						}

						if (gtp.z !== ntp.z) {
							var posInfo = _this.getTilePosZoomDelta(ntp, ntp.z, gtp.z);
							if (posInfo.size < 1 / 256) {// меньше 1px
								chkReadyRasters();
								return;
							}
							isImage = false;
							info.sx = Math.floor(posInfo.x);
							info.sy = Math.floor(posInfo.y);
							info.sw = info.sh = posInfo.size;
							if (isShift) {
								var sw = Math.floor(info.dw / posInfo.zDelta);
								info.sx = (info.dx === 0 ? info.sw : _this.ts) - sw;
								info.sw = sw;

								var sh = Math.floor(info.dh / posInfo.zDelta);
								info.sy = (info.dy === 0 ? info.sh : _this.ts) - sh;
								info.sh = sh;
							}
						}
						if (isImage && !gmx.rasterProcessingHook) {
							cnt--;
							resCanvas = img;
							rasters[idr] = resCanvas;
							chkReadyRasters();
						} else {
							if (!resCanvas) {
								resCanvas = document.createElement('canvas');
								resCanvas.width = resCanvas.height = _this.ts;
							}
							info.res = resCanvas;
							var hookResult = _this._rasterHook(info),
								then = function() {
									cnt--;
									//p.resImage = resCanvas;
									rasters[idr] = resCanvas;
									chkReadyRasters();
								};

							if (hookResult) {
								if (hookResult.then) {
									hookResult.then(then);
								} else {
									resCanvas = hookResult;
									then();
								}
							} else if (hookResult === null) {
								item.skipRasters = true;
								skipRasterFunc();
							} else {
								resCanvas = img;
								then();
							}
						}
					};
				if (cnt) {
					tileToLoadPoints.map(function(it) {
						var loader = _this._loadTileRecursive(it, item);
						loader.then(function(loadResult) {
							onLoadFunction(loadResult.gtp, it, loadResult.image);
						}, skipRasterFunc);
						return loader;
					});
				} else {
					item.skipRasters = true;
					skipRasterFunc();
				}
			}.bind(this));
		}

		if (gmx.sessionKey) { url += (url.indexOf('?') === -1 ? '?' : '&') + 'key=' + encodeURIComponent(gmx.sessionKey); }

		return new Promise(function(resolve1) {
			var skipRaster = function(res) {
				_this.layer.fire('bitmap', {id: idr, loaded: false, url: url, result: res});
				item.skipRasters = true;
				resolve1();
			};

// console.log('____3_____', this.zKey, url)
			if (!url) { skipRaster(); return; }

			var done = function(resCanvas) {
				gmx.quicklooksCache[url] = resCanvas;
				var res = resCanvas;
				if (this.gmx.rasterProcessingHook) {
					//console.warn('rasterProcessingHook for quicklooks did`t work!');
				}
				if (itemImageProcessingHook) {	// требуется transform
					var imgAttr = {
						gmx: gmx,
						topLeft: this.topLeft,
						geoItem: geo,
						item: item,
						gmxTilePoint: gmxTilePoint
					};
					res = itemImageProcessingHook(resCanvas, imgAttr);
				}
				if (res) {
					resolve1(res);
					item.skipRasters = false;
					rasters[idr] = res;
				} else {
					skipRaster();
				}
			}.bind(this);

			if (gmx.quicklooksCache && gmx.quicklooksCache[url]) {
				done(gmx.quicklooksCache[url]);
			} else if (L.gmx.getBitmap) {
				var urlProxy = url;
				if (gmx.gmxProxy) {
					urlProxy = gmx.gmxProxy + '?WrapStyle=none&get=' + encodeURIComponent(url);
				}
				L.gmx.getBitmap(urlProxy, fetchOptions).then(
					function(res) {
						var imageObj = res.imageBitmap,
							canvas_ = document.createElement('canvas');
						canvas_.width = imageObj.width;
						canvas_.height = imageObj.height;
						canvas_.getContext('2d').drawImage(imageObj, 0, 0, canvas_.width, canvas_.height);
						done(canvas_);
						_this.layer.fire('bitmap', {id: idr, loaded: true, url: url, result: res});
					}, skipRaster)
				.catch(skipRaster);
			} else {
				var request = this.rasterRequests[url];
				if (!request) {
					request = L.gmx.imageLoader.push(url, {
						tileRastersId: _this._uniqueID,
						crossOrigin: gmx.crossOrigin || 'anonymous'
					});
					this.rasterRequests[url] = request;
				} else {
					request.options.tileRastersId = this._uniqueID;
				}

				// in fact, we want to return request.def, but need to do additional action during cancellation.
				// so, we consctruct new promise and add pipe it with request.def
				request.def.then(done, skipRaster);
			}
		}.bind(this));
    },

    _getVisibleItems: function (geoItems) {
        if (geoItems.length < 2) {
			this.itemsView = geoItems;
            return geoItems;
        }
        if (!gmxAPIutils._tileCanvas) {
            gmxAPIutils._tileCanvas = document.createElement('canvas');
            gmxAPIutils._tileCanvas.width = gmxAPIutils._tileCanvas.height = this.ts;
        }
        var i, len,
            gmx = this.gmx,
            dm = gmx.dataManager,
            canvas = gmxAPIutils._tileCanvas,
            ctx = canvas.getContext('2d'),
            dattr = {
                tbounds: this.tbounds,
                gmx: gmx,
				topLeft: this.topLeft,
                tpx: this.tpx,
                tpy: this.tpy,
                ctx: ctx
            };
        ctx.clearRect(0, 0, this.ts, this.ts);
        ctx.imageSmoothingEnabled = false;
        for (i = 0, len = geoItems.length; i < len; i++) {
            ctx.fillStyle = gmxAPIutils.dec2rgba(i + 1, 1);
            var geoItem = geoItems[i];
            L.gmxUtil.drawGeoItem(
                geoItem,
                dm.getItem(geoItem.properties[0]),
                dattr,
                {fillStyle: ctx.fillStyle}
            );
        }
        var items = {},
            data = ctx.getImageData(0, 0, this.ts, this.ts).data;

        for (i = 0, len = data.length; i < len; i += 4) {
            if (data[i + 3] === 255) {
                var color = data[i + 2];
                if (data[i + 1]) { color += (data[i + 1] << 8); }
                if (data[i]) { color += (data[i] << 16); }
                if (color) { items[color] = true; }
            }
        }
        var out = [];
        for (var num in items) {
            var it = geoItems[Number(num) - 1];
            if (it) { out.push(it); }
        }
		this.itemsView = out;
        return out;
    },

    _getNeedRasterItems: function (geoItems) {
        var gmx = this.gmx,
            indexes = gmx.tileAttributeIndexes,
            tbounds = this.tbounds,
            out = [];
        for (var i = 0, len = geoItems.length; i < len; i++) {
            var geo = geoItems[i],
                properties = geo.properties,
                idr = properties[0],
                dataOption = geo.dataOption || {},
                skipRasters = false;

            if (gmx.quicklookBGfunc && !gmxAPIutils.getPropItem('GMX_RasterCatalogID', properties, indexes)) {
                if (gmx.minZoomQuicklooks && this.zoom < gmx.minZoomQuicklooks) { continue; }
                var platform = gmxAPIutils.getPropItem(gmx.quicklookPlatform, properties, indexes) || gmx.quicklookPlatform || '';
                if ((!platform || platform === 'imageMercator') &&
                    !gmxAPIutils.getQuicklookPointsFromProperties(properties, gmx)
                ) {
                    continue;
                }
            }

            if (gmx.styleHook) {
                geo.styleExtend = gmx.styleHook(
                    gmx.dataManager.getItem(idr),
                    gmx.lastHover && idr === gmx.lastHover.id
                );
                skipRasters = geo.styleExtend && geo.styleExtend.skipRasters;
            }
            if (!skipRasters && tbounds.intersectsWithDelta(dataOption.bounds, -1, -1)) {
                out.push(geo);
            }
        }
        return this._getVisibleItems(out);
    },

    _getTileRasters: function (geoItems) {   //load all missing rasters for items we are going to render
		return new Promise(function(resolve) {
			var arr = this._getNeedRasterItems(geoItems).map(this._getItemRasters.bind(this));
// console.log('_getTileRasters___', arr)
			Promise.all(arr)
				.then(resolve, function() {
// console.log('_getTileRasters', ev)
				});
		}.bind(this));
    },

    _chkItems: function (data) {
        var layer = this.layer;
        if (!layer._map) {
            return null;
        }
        var items = data && data.added && data.added.length ? data.added : null;

        if (!items) {
            var tLink = layer._tiles[this.zKey];
            if (tLink && tLink.el) {
                tLink.el.getContext('2d').clearRect(0, 0, this.ts, this.ts);
            }
            return null;
        }
        return this.gmx.sortItems ? layer.getSortedItems(items) : items;
    },

    destructor: function () {
		// if (this.drawReject) {
			// this.drawReject('отмена');
			// this.drawReject = null;
		// }
		if (this._preRenderPromise) {
			this._preRenderPromise.reject();        // cancel preRenderHooks chain if exists
		}
		if (this._renderPromise) {
			this._renderPromise.reject();           // cancel renderHooks chain if exists
		}
        this._cancelRastersPromise();
        this._clearCache();
    },

    _cancelRastersPromise: function () {
        if (this.rastersPromise) {
			if (this.rastersPromise.reject) {
				this.rastersPromise.reject();
			}
            this.rastersPromise = null;
        }
    },

    _clearCache: function () {
        for (var url in this.rasterRequests) {
            this.rasterRequests[url].remove();
        }
        this.rasterRequests = {};
    },

    drawTile: function (data) {
		this.destructor();
		return new Promise(function(resolve, reject) {
			if (L.gmx._zoomStart && L.gmx._zoomStart !== this.zoom) {
				resolve();
				return;
			}

			// this.drawReject = reject;
			var geoItems = this._chkItems(data);
			var result = function() {
				resolve({count: geoItems.length});
			}.bind(this);
			var _this = this;

			this._uniqueID++;       // count draw attempt

			if (geoItems) {
				var tile = _this.tile,
					ctx = tile.getContext('2d');
				if (this.layer._gridClusters && this.layer._gridClusters.checkData({
						geoItems: geoItems,
						tileElem: this.tileElem,
						layer: this.layer
					})) {
					result();
					return;
				}
				var ts = this.layer.options.tileSize;
				this.tile.width = this.tile.height = ts;
				var doDraw = function() {
					var gmx = _this.gmx,
						dattr = {
							//tileLink: tileLink,
							tbounds: _this.tbounds,
							rasters: _this.rasters,
							gmx: gmx,
							topLeft: _this.topLeft,
							tpx: _this.tpx,
							tpy: _this.tpy,
							ctx: ctx
						},
						tinfo = 'zKey:' + _this.zKey + ' count: ' + geoItems.length;
					L.DomUtil.addClass(tile, tinfo);

					if (!_this.layer._gridClusters) {
						ctx.clearRect(0, 0, ts, ts);
						if (gmx.showScreenTiles) {
							ctx.strokeRect(0, 0, ts - 1, ts - 1);
							ctx.strokeText( _this.zKey + ' ' + geoItems.length, 50, 50);
						}
					}
					var hookInfo = {
							zKey: _this.zKey,
							topLeft: _this.topLeft,
							tpx: _this.tpx,
							tpy: _this.tpy,
							x: _this.tilePoint.x,
							y: _this.tilePoint.y,
							z: _this.zoom
						},
						bgImage;

					var fArr = [];
					gmx.preRenderHooks.forEach(function (f) {
						if (!bgImage) {
							bgImage = document.createElement('canvas');
							bgImage.width = bgImage.height = ts || 256;
						}
						var res = f(bgImage, hookInfo);
						if (res && res.then) {
							fArr.push(res);
						}
					});
					Promise.all(fArr).then(function() {
						if (bgImage) { dattr.bgImage = bgImage; }

						//ctx.save();
						for (var i = 0, len = geoItems.length; i < len; i++) {
							var geoItem = geoItems[i],
								id = geoItem.id,
								item = gmx.dataManager.getItem(id);
							if (item) {     // skip removed items   (bug with screen tile screenTileDrawPromise.cancel on hover repaint)
								var style = gmx.styleManager.getObjStyle(item, _this.zoom),
									hover = gmx.lastHover && gmx.lastHover.id === geoItem.id && style;

								if (gmx.multiFilters) {
									for (var j = 0, len1 = item.multiFilters.length; j < len1; j++) {
										var it = item.multiFilters[j];
										L.gmxUtil.drawGeoItem(geoItem, item, dattr, hover ? it.parsedStyleHover : it.parsedStyle, it.style);
									}
								} else {
// if(!dattr.rasters[item.id]) {
// console.log('___bg', _this.ntp, item.skipRasters, item.id, dattr.rasters[item.id]);
// }
									L.gmxUtil.drawGeoItem(geoItem, item, dattr, hover ? item.parsedStyleHover : item.parsedStyleKeys, style);
								}
								if (id in gmx._needPopups && !gmx._needPopups[id]) {
									gmx._needPopups[id] = true;
								}
							}
						}
						//ctx.restore();
						//_this.rasters = {}; // clear rasters		TODO: растры пропадают из-за быстрых перерисовок permalink=C2YMI
						Promise.all(_this._getHooksPromises(gmx.renderHooks, tile, hookInfo)).then(result, reject);
					}, reject);
					// _this.layer.appendTileToContainer(_this.tileElem);
				};

				if (this.showRaster) {
					this.rastersPromise = this._getTileRasters(geoItems);
					this.rastersPromise.then(doDraw, reject); //first load all raster images, then render all of them at once
				} else {
					doDraw();
				}
			} else {
				resolve();
			}
		}.bind(this)).catch(function() {
			// console.warn('catch1:', arguments);
		});
    },

    _getHooksPromises: function (hooks, obj, options) {
		var arr = [];
		hooks.forEach(function (f) {
			var res = f(obj, options);
			if (res && res.then) {
				arr.push(res);
			}
		});
		return arr;
    }
};


/*
 * ObjectsReorder  - Reorder objects in Gemixer layer
 */
(function() {

var MAX = 1000000,
    ObjectsReorder = function (layer) {
        this.all = {};
        this.userSetSortFunc = false;     // user sort func flag
        this.sortFunc = null;
        this.count = 0;
        this.disabled = false;
        this.layer = layer;
        layer.on('add', this.onAdd, this);
        layer.on('remove', this.onRemove, this);
    };
    ObjectsReorder.prototype = {
        addToReorder: function (id, bottomFlag) {
            ++this.count;
            this.all[id] = bottomFlag ? -this.count : this.count;
        },
        clickFunc: function (ev) {
            if (!this.disabled) {
                var id = ev.gmx.id;
                this.addToReorder(id, ev.originalEvent.ctrlKey);
                this.layer.redrawItem(id);
            }
        },
        sortItems: function(a, b) {     // layer context
            var reorder = this._objectsReorder;
            if (reorder.count > 0) {
                var ap = reorder.all[a.id],
                    bp = reorder.all[b.id];

                if (ap || bp) {
                    ap = ap ? ap + (ap > 0 ? MAX : -MAX) : 0;
                    bp = bp ? bp + (bp > 0 ? MAX : -MAX) : 0;
                    return ap - bp;
                }
            }
            return reorder.sortFunc ? reorder.sortFunc.call(this, a, b) : 0;
        },
        resetSortFunc: function () {
            var layer = this.layer,
                gmx = layer._gmx,
                zIndexField = gmx.zIndexField;
            gmx.sortItems = this.sortItems;
            this.sortFunc = (zIndexField && !this.userSetSortFunc ?
                function(a, b) {    // layer context
                    var res = Number(a.properties[zIndexField]) - Number(b.properties[zIndexField]);
                    return res ? res : a.id - b.id;
                }
                :
                function(a, b) {
                    return a.id - b.id;
                }
            );
        },
        initialize: function () {
            var gmx = this.layer._gmx;
            if (!this.userSetSortFunc && (gmx.GeometryType === 'polygon' || gmx.GeometryType === 'linestring')) {
                this.resetSortFunc();
            }
        },
        onAdd: function () {
            this.initialize();
            this.layer.on('click', this.clickFunc, this);
        },
        onRemove: function () {
            this.layer.off('click', this.clickFunc, this);
        }
    };

L.gmx.VectorLayer.include({
    _objectsReorder: null,

    _objectsReorderInit: function () {
        if (!this._objectsReorder) {
            this._objectsReorder = new ObjectsReorder(this);
        }
    },

    getReorderArrays: function () {
        var out = {top: [], bottom: []};
        if (this._objectsReorder) {
            var reorder = this._objectsReorder,
                arr = Object.keys(reorder.all).sort(function(a, b) {
                    return reorder.all[a] - reorder.all[b];
                });

            for (var i = 0, len = arr.length; i < len; i++) {
                var id = arr[i];
                if (reorder.all[id] > 0) {
                    out.top.push(id);
                } else {
                    out.bottom.push(id);
                }
            }
        }
        return out;
    },

    bringToTopItem: function (id) {
        this._objectsReorderInit();
        this._objectsReorder.addToReorder(id);
        this.redrawItem(id);
        return this;
    },

    bringToBottomItem: function (id) {
        this._objectsReorderInit();
        this._objectsReorder.addToReorder(id, true);
        this.redrawItem(id);
        return this;
    },

    clearReorderArrays: function () {
        if (this._objectsReorder) {
            var reorder = this._objectsReorder;
            reorder.all = {};
            reorder.count = 0;
            this.repaint();
        }
        return this;
    },

    setReorderArrays: function (top, bottom) {
        this._objectsReorderInit();
        var reorder = this._objectsReorder;
        reorder.all = {};
        reorder.count = 0;
        if (bottom) {
			bottom.forEach(function (id) { reorder.addToReorder(id, true); });
		}
        if (top) {
			top.forEach(function (id) { reorder.addToReorder(id); });
		}
        this.repaint();
        return this;
    },

    getSortedItems: function (arr) {
        this._objectsReorderInit();
        return arr.sort(L.bind(this._objectsReorder.count > 0 ? this._gmx.sortItems : this._objectsReorder.sortFunc, this));
    },

    setSortFunc: function (func) {
        this._objectsReorderInit();
        var reorder = this._objectsReorder;
        reorder.sortFunc = func;
        reorder.userSetSortFunc = func ? true : false;
        this._gmx.sortItems = reorder.sortItems;
        this.repaint();
        return this;
    },
    disableFlip: function() {
        this._objectsReorderInit();
        this._objectsReorder.disabled = true;
        return this;
    },
    enableFlip: function() {
        this._objectsReorderInit();
        this._objectsReorder.disabled = false;
        return this;
    }
});
})();


var StyleManager = function(gmx) {
    this.gmx = gmx;
    this.promise = new Promise(function(resolve, reject) {
		this.resolve = resolve;
		this.reject = reject;
	}.bind(this));

    this._maxVersion = 0;
    this._maxStyleSize = 0;
    this._styles = [];
    this._deferredIcons = [];
    this._parserFunctions = {};
    this._serverStylesParsed = false;

    var minZoom = Infinity,
        maxZoom = -Infinity,
        arr = gmx.properties.styles || [];

    for (var i = 0, len = arr.length; i < len; i++) {
        var st = arr[i];
        minZoom = Math.min(minZoom, st.MinZoom);
        maxZoom = Math.max(maxZoom, st.MaxZoom);
    }
    this.minZoom = minZoom === Infinity ? 0 : minZoom;
    this.maxZoom = maxZoom === -Infinity ? 18 : maxZoom;
};
StyleManager.prototype = {
    getStyleIcon: function(nm, txt) {		// строка легенды стилей
		var st = this._styles[nm];
		if (!st) { return null; }

		txt = txt || '';
		var geometryType = this.gmx.GeometryType || 'polygon',
			renderStyle = st.RenderStyle,
			out = '<div class="gmx-style-legend"><span class="prefixWrapper"><span class="prefix' + (renderStyle.iconUrl ? '' : ' style') + '">' + txt + '</span></span>';

		out += '<span class="legend-block">';
		if (renderStyle.iconUrl) {
			out += '<span class="legendIconStyleImage"><img crossorigin="" src="' + renderStyle.iconUrl + '" /></span>';
		} else {
			var style = '';
			if (renderStyle.fillColor) {
				style = 'background-color: ' + L.gmxUtil.dec2rgba(renderStyle.fillColor, renderStyle.fillOpacity || 1);
			}
			if (renderStyle.color) {
				style += ' border-color: ' + L.gmxUtil.dec2rgba(renderStyle.color, renderStyle.opacity || 1);
			}
			out += '<span class="legendIconStyle ' + geometryType + '"' + (style ? ' style="' + style + '"': '') + '"></span>';
		}
		var title = st.Name || st.Filter || 'легенда';
		out += '<span class="legendIconCell"><span class="styleName"> ' + title + '</span>';
		out += '</span></div>';
		return out;
    },
    _getMaxStyleSize: function(zoom) {  // estimete style size for arbitrary object
        var maxSize = 0;
        for (var i = 0, len = this._styles.length; i < len; i++) {
            var style = this._styles[i];
            if (zoom > style.MaxZoom || zoom < style.MinZoom) { continue; }
            var RenderStyle = style.RenderStyle;
            // if (this._needLoadIcons || !RenderStyle || !RenderStyle.common || !('maxSize' in RenderStyle)) {
            if (this._needLoadIcons || !RenderStyle || !('maxSize' in RenderStyle)) {
                maxSize = StyleManager.MAX_STYLE_SIZE;
                break;
            }
            var maxShift = 0;
            if ('iconAnchor' in RenderStyle && !RenderStyle.iconCenter) {
                maxShift = Math.max(
                    Math.abs(RenderStyle.iconAnchor[0]),
                    Math.abs(RenderStyle.iconAnchor[1])
                );
            }
            maxSize = Math.max(RenderStyle.maxSize + maxShift, maxSize);
        }
        return maxSize;
    },

    getStyleBounds: function(ntp) {
        if (!ntp) {
            return gmxAPIutils.bounds();
        }

        this._maxStyleSize = this._getMaxStyleSize(ntp.z);

        var mercSize = 2 * this._maxStyleSize * gmxAPIutils.tileSizes[ntp.z] / 256; //TODO: check formula
        return gmxAPIutils.getBoundsByTilePoint(ntp).addBuffer(mercSize);
    },

    //is any style is visible at given zoom?
    isVisibleAtZoom: function(zoom) {
        for (var i = 0, len = this._styles.length; i < len; i++) {
            var style = this._styles[i];
            if (zoom >= style.MinZoom && zoom <= style.MaxZoom) {
                return true;
            }
        }
        return false;
    },

    getIcons: function(callback) {
        var _this = this;
        this.promise.then(function() {
            var out = [];
            for (var i = 0, len = _this._styles.length; i < len; i++) {
                var style = _this._styles[i],
                    pt = {};
                if (style.RenderStyle) {
                    pt.RenderStyle = {image: style.RenderStyle.image};
                }
                if (style.HoverStyle) {
                    pt.HoverStyle = {image: style.HoverStyle.image};
                }
                out.push(pt);
            }
            if (callback) {
                callback(out);
            }
        });
        this.initStyles();
    },

    _chkReady: function() {
        if (this._needLoadIcons < 1) {
            var _this = this;
			if (this.gmx.dataManager) {
				this.gmx.dataManager.addFilter('styleFilter', function(it) { return _this._chkStyleFilter(it); });
			}
            this.resolve();
        }
    },

    initStyles: function() {
        if (!this._serverStylesParsed) {
            this._parseServerStyles();
        }
        for (var i = 0, len = this._deferredIcons.length; i < len; i++) {
            this._getImageSize(this._deferredIcons[i]);
        }
        this._deferredIcons = [];
        this._chkReady();
        return this.promise;
    },

    getStyles: function () {
        if (!this._serverStylesParsed) {
            this._parseServerStyles();
        }
        var out = [];
        for (var i = 0, len = this._styles.length; i < len; i++) {
            var style = L.extend({}, this._styles[i]);
            style.RenderStyle = StyleManager.getStyleKeys(style.RenderStyle);
            if (style.HoverStyle) {
                style.HoverStyle = StyleManager.getStyleKeys(style.HoverStyle);
            }
            delete style.filterFunction;
            delete style.version;
            delete style.common;
            delete style.type;
            out.push(style);
        }
        return out;
    },

    clearStyles: function () {
        this._styles = [];
        this.gmx.balloonEnable = false;
        this.gmx.labelsLayer = false;
    },

    _changeStylesVersion: function () {
        var _this = this;
        this._styles.map(function(it) {
            it.version = ++_this._maxVersion;
        });
    },

    setStyle: function(st, num, createFlag) {
        num = num || 0;
        if (num < this._styles.length || createFlag) {
            var style = this._styles[num];
            if (!style) {
                style = this._prepareItem({});
                this._styles[num] = style;
            }
            style.version = ++this._maxVersion;
            if ('Filter' in st) {
                style.Filter = st.Filter;
                var type = typeof (st.Filter);
/*eslint-disable no-useless-escape */
                style.filterFunction = type === 'string' ? L.gmx.Parsers.parseSQL(style.Filter.replace(/[\[\]]/g, '"'))
                    : type === 'function' ? style.Filter : null;
/*eslint-enable */

                this._changeStylesVersion();
            }
            for (var i = 0, len = StyleManager.DEFAULT_KEYS.length; i < len; i++) {
                var key = StyleManager.DEFAULT_KEYS[i];
                if (key in st) { style[key] = st[key]; }
            }
            if (st.RenderStyle) {
                style.RenderStyle = this._parseStyle(st.RenderStyle);
            }
            if (st.HoverStyle) { style.HoverStyle = this._parseStyle(st.HoverStyle, style.RenderStyle); }
            this._checkStyles();
        }
        return this.initStyles();
    },

    getItemBalloon: function(id) {
        var item = this.gmx.dataManager.getItem(id),
            currentFilter = item ? item.currentFilter : 0,
            style = this._styles[currentFilter];
        return style ? {
                DisableBalloonOnMouseMove: style.DisableBalloonOnMouseMove || false,
                DisableBalloonOnClick: style.DisableBalloonOnClick || false,
                templateBalloon: style.Balloon || null,
                isSummary: /\[SUMMARY\]/.test(style.Balloon)
            }
            : null
        ;
    },

    // apply styleHook func
    // applyStyleHook: function(item, hoverFlag) {
        // return this._itemStyleParser(item, this.gmx.styleHook(item, hoverFlag));
    // },

    getObjStyle: function(item, zoom) {
        this._chkStyleFilter(item, zoom);
        var style = this._styles[item.currentFilter],
            version;

        if (!style) { return null; }
        if (style.hoverDiff && this.gmx.lastHover && item.id === this.gmx.lastHover.id) {
            if (style.HoverStyle) {
                version = style.HoverStyle.version || -1;
                if (version !== item.styleVersion) {
                    item.parsedStyleHover = this._itemStyleParser(item, style.HoverStyle);
                }
                return style.HoverStyle;
            } else {
                delete item.parsedStyleHover;
            }
            return null;
        }
        version = style.version || -1;
        if (version !== item.styleVersion) {
            item.parsedStyleKeys = this._itemStyleParser(item, style.RenderStyle);
        }
        return style.RenderStyle;
    },

    _needLoadIcons: 0,
    _getImageSize: function(pt) {     // check image size
        var url = pt.iconUrl || pt.fillIconUrl || '',
            opt = {crossOrigin: 'anonymous'},
			isIE11 = L.gmxUtil.isIE11 && /\.svg/.test(url),
            _this = this;

        if (self.location.protocol !== 'file:') {
            url = url.replace(/http(s*):/, '');	// remove protocol from icon URL
        }
        if (isIE11) {
			url += (url.indexOf('?') === -1 ? '?' : '&') + 'crossOrigin=' + opt.crossOrigin;
        }
        opt.layerID = this.gmx.layerID;
        ++this._needLoadIcons;
        L.gmx.imageLoader.unshift(url, opt).def.then(
            function(it) {
                pt.version = ++_this._maxVersion;
                if (pt.fillIconUrl) {
                    pt.imagePattern = it;
                } else {
                    pt.sx = it.width || it.offsetWidth;
                    pt.sy = it.height || it.offsetHeight;
                    pt.image = it;
                    var maxSize = pt.iconAngle ? Math.sqrt(pt.sx * pt.sx + pt.sy * pt.sy) : Math.max(pt.sx, pt.sy);
                    if (!pt.scaleFunction && !pt.rotateFunction) {
                        if (pt.iconScale || pt.iconScale === 1) { maxSize *= pt.iconScale; }
                        pt.common = true;
                    }
                    pt.maxSize = Number(maxSize.toFixed());
                }
                _this._needLoadIcons--;
                _this._chkReady();
            },
            function() {
                pt.version = ++_this._maxVersion;
                pt.sx = 1;
                pt.sy = 0;
                pt.image = null;
                _this._needLoadIcons--;
                _this._chkReady();
                console.log({url: url, func: '_getImageSize', Error: 'image not found'});
            }
        );
    },

    getCurrentFilters: function(propArray, zoom) {
        var gmx = this.gmx,
            indexes = gmx.tileAttributeIndexes,
            types = gmx.tileAttributeTypes,
            z = zoom || 1,
            out = [];

        if (!this._serverStylesParsed) {
            this._parseServerStyles();
        }
        for (var i = 0, len = this._styles.length; i < len; i++) {
            var st = this._styles[i];
            if (st.disabled || z > st.MaxZoom || z < st.MinZoom
                || (st.filterFunction && !st.filterFunction(propArray, indexes, types))) {
                continue;
            }
            out.push(i);
            if (!gmx.multiFilters) { break; }
        }
        return out;
    },

    _chkStyleFilter: function(item, zoom) {
        var gmx = this.gmx,
            fnum = gmx.multiFilters ? -1 : item.currentFilter,
            curr = this._styles[fnum],
            needParse = !curr || curr.version !== item.styleVersion;

		zoom = zoom || gmx.currentZoom;
        if (needParse || item._lastZoom !== zoom) {
            item.currentFilter = -1;
            item.multiFilters = [];
            var filters = this.getCurrentFilters(item.properties, zoom);
            for (var i = 0, len = filters.length; i < len; i++) {
                var num = filters[i],
                    st = this._styles[num];
                item.hoverDiff = st.hoverDiff;
                item.currentFilter = num;
                if (needParse || fnum !== num) {
                    var parsed = st.common && st.common.RenderStyle || this._itemStyleParser(item, st.RenderStyle),
                        parsedHover = null;

                    item.parsedStyleKeys = parsed;
                    if (st.HoverStyle) {
                        parsedHover = st.common && st.common.HoverStyle || this._itemStyleParser(item, st.HoverStyle);
                        item.parsedStyleHover = parsedHover;
                    }
                    if (gmx.multiFilters) {
                        item.multiFilters.push({
                            style: st.RenderStyle,
                            styleHover: st.HoverStyle,
                            parsedStyle: parsed,
                            parsedStyleHover: parsedHover
                        });
                    }
                }
                item.styleVersion = st.version;
                if (!gmx.multiFilters) { break; }
            }
            item._lastZoom = zoom;
        }
        if (this._styles[item.currentFilter]) {
            return true;
        } else {
            item.currentFilter = -1;
            return false;
        }
    },

    _parseServerStyles: function() {
        var gmx = this.gmx,
            props = gmx.properties,
            gmxStyles = props.gmxStyles ? props.gmxStyles.styles : null,
            arr = gmxStyles || props.styles || [{MinZoom: 1, MaxZoom: 21, RenderStyle: StyleManager.DEFAULT_STYLE}],
            len = Math.max(arr.length, gmx.styles.length),
			i, gmxStyle;

		if (gmxStyles) {
			for (i = 0; i < len; i++) {
				if (!this._styles[i]) {
					gmxStyle = gmx.styles[i] || arr[i];
					gmxStyle.RenderStyle = this._parseStyle(gmxStyle.RenderStyle);
					gmxStyle.HoverStyle = this._parseStyle(gmxStyle.HoverStyle);
					this._styles.push(gmxStyle);
					if (this._isLabel(gmxStyle.RenderStyle)) { gmx.labelsLayer = true; }
				}
			}
		} else {
			for (i = 0; i < len; i++) {
				if (!this._styles[i]) {
					gmxStyle = gmx.styles[i] || arr[i];
					if (!gmxStyle.RenderStyle) { gmxStyle.RenderStyle = StyleManager.DEFAULT_STYLE; }
					if (gmxStyle.HoverStyle === undefined) {
						var hoveredStyle = JSON.parse(JSON.stringify(gmxStyle.RenderStyle));
						if (hoveredStyle.outline) { hoveredStyle.outline.thickness += 1; }
						gmxStyle.HoverStyle = hoveredStyle;
					} else if (gmxStyle.HoverStyle === null) {
						delete gmxStyle.HoverStyle;
					}
					var pt = this._prepareItem(gmxStyle);
					this._styles.push(pt);
					if (this._isLabel(pt.RenderStyle)) { gmx.labelsLayer = true; }
				}
			}
		}
        this._checkStyles();
        this._serverStylesParsed = true;
    },

    _iconsUrlReplace: function(iconUrl) {
		var str = iconUrl || '';
		if (iconUrl && this.gmx.iconsUrlReplace) {
			this.gmx.iconsUrlReplace.forEach(function(it) {
				str = str.replace(it.from, it.to);
			});
		}
		return str;
    },

    _checkStyles: function() {
        var minZoom = Infinity,
            maxZoom = -Infinity,
            balloonEnable = false,
            labelsLayer = false;

        for (var i = 0, len = this._styles.length; i < len; i++) {
            var st = this._styles[i];

            st.DisableBalloonOnMouseMove = st.DisableBalloonOnMouseMove === false ? false : true;
            st.DisableBalloonOnClick = st.DisableBalloonOnClick || false;
            if (st.DisableBalloonOnMouseMove === false || st.DisableBalloonOnClick === false) {
                balloonEnable = true;
                st.BalloonEnable = true;
            }
            st.hoverDiff = null;
            st.common = {};
            if (st.RenderStyle) {
				if (st.RenderStyle.iconUrl) {
					st.RenderStyle.iconUrl = this._iconsUrlReplace(st.RenderStyle.iconUrl);
				}
				if (st.HoverStyle && st.HoverStyle.iconUrl) {
					st.HoverStyle.iconUrl = this._iconsUrlReplace(st.HoverStyle.iconUrl);
				}

				if (!labelsLayer) {
                    if (this._isLabel(st.RenderStyle)) {
                        labelsLayer = true;
                    }
                }
                if (st.RenderStyle.common) {
                    st.common.RenderStyle = this._itemStyleParser({}, st.RenderStyle);
                }
                if (st.HoverStyle) {
                    st.hoverDiff = StyleManager.checkDiff(st.RenderStyle, st.HoverStyle);
                }
            }
            if (st.HoverStyle && st.HoverStyle.common) {
                st.common.HoverStyle = this._itemStyleParser({}, st.HoverStyle);
            }
            minZoom = Math.min(minZoom, st.MinZoom);
            maxZoom = Math.max(maxZoom, st.MaxZoom);
        }
        if (this.minZoom !== Infinity) { this.minZoom = minZoom; }
        if (this.maxZoom !== -Infinity) { this.maxZoom = maxZoom; }
        this.gmx.balloonEnable = balloonEnable;
        this.gmx.labelsLayer = labelsLayer;
    },

    _parseStyle: function(st, renderStyle) {
        if (st) {
            st.common = true;
            for (var key in st) {
                if (gmxAPIutils.styleFuncKeys[key]) {
                    var fkey = gmxAPIutils.styleFuncKeys[key],
                        val = st[key];
                    if (typeof (val) === 'string') {
                        st.common = false;
                        if (renderStyle && renderStyle[key] === val) {
                            st[fkey] = renderStyle[fkey];
                        } else {
                            if (!this._parserFunctions[val]) {
                                this._parserFunctions[val] = L.gmx.Parsers.parseExpression(val);
                            }
                            st[fkey] = this._parserFunctions[val];
                        }
                    } else if (typeof (val) === 'function') {
                        st.common = false;
                        st[fkey] = val;
                    }
                }
            }

            var type = '';
            if ('iconUrl' in st) {
                type = 'image';
                if (st.iconUrl) {
                    st.maxSize = 256;
                    this._deferredIcons.push(st);
                }
            } else if (st.fillIconUrl) {
                type = 'square';
                this._deferredIcons.push(st);
            } else if (st.fillPattern) {
                type = 'square';
                st.common = StyleManager.parsePattern(st.fillPattern);
                st.canvasPattern = gmxAPIutils.getPatternIcon(null, st);
            } else if (st.iconCircle) {
                type = 'circle';
                if (!('iconSize' in st)) { st.iconSize = 4; }
            } else if (st.iconPath) {
                type = 'iconPath';
                var iconSize = 0,
                    arr = L.Util.isArray(st.iconPath) ? st.iconPath : StyleManager.DEFAULT_ICONPATH;
                st.iconPath = StyleManager.DEFAULT_ICONPATH.map(function(it, i) {
                    var z = arr[i] || it;
                    iconSize = Math.max(iconSize, z);
                    return z;
                });
                st.iconSize = 2 * iconSize;
            } else if (st.fillRadialGradient) {
                type = 'circle';
                if (!('iconCenter' in st)) { st.iconCenter = true; }
                var size = StyleManager.parseRadialGradient(st.fillRadialGradient);
                if (size === null) {
                    st.common = false;
                } else {
                    st.iconSize = size;
                }
            } else if (st.fillLinearGradient) {
                type = 'square';
                st.common = StyleManager.parseLinearGradient(st.fillLinearGradient);
            } else if (st.iconSize) {
                type = 'square';
                if (!('iconCenter' in st)) { st.iconCenter = true; }
            }
            st.type = type;
            if (st.common && !st.maxSize) {
                st.maxSize = st.iconSize || 0;
                st.maxSize += st.weight ? st.weight : 0;
                if ('iconScale' in st) { st.maxSize *= st.iconScale; }
            }
        }
        return st;
    },

    _prepareItem: function(style) { // Style Scanex->leaflet
        var pt = {
            MinZoom: style.MinZoom || 0,
            MaxZoom: style.MaxZoom || 18,
            Filter: style.Filter || null,
            Balloon: style.Balloon || '',
            RenderStyle: (style.RenderStyle ? this._parseStyle(L.gmxUtil.fromServerStyle(style.RenderStyle)) : {}),
            version: ++this._maxVersion
        };
        pt.DisableBalloonOnMouseMove = style.DisableBalloonOnMouseMove === false ? false : true;
        pt.DisableBalloonOnClick = style.DisableBalloonOnClick || false;

        if (style.HoverStyle) {
            pt.HoverStyle = this._parseStyle(L.gmxUtil.fromServerStyle(style.HoverStyle), pt.RenderStyle);
        }

        if ('Filter' in style) {
/*eslint-disable no-useless-escape */
            var ph = L.gmx.Parsers.parseSQL(style.Filter.replace(/[\[\]]/g, '"'));
/*eslint-enable */
            if (ph) { pt.filterFunction = ph; }
        }
        return pt;
    },

    _isLabel: function(st) {
        var indexes = this.gmx.tileAttributeIndexes;
        return (st && (st.labelTemplate || (st.labelField && st.labelField in indexes)));
    },

    _itemStyleParser: function(item, pt) {
        pt = pt || {};
        var out = {}, arr, i, len,
            indexes = this.gmx.tileAttributeIndexes,
            prop = item.properties || {},
            itemType = item.type,
            type = pt.type,
            color = 'color' in pt ? pt.color : 255,
            opacity = 'opacity' in pt ? pt.opacity : 1;

        out.sx = pt.sx;
        out.sy = pt.sy;
        if (pt.maxSize) {
            out.maxSize = pt.maxSize;
        }
        if (pt.iconAngle) {
            var rotateRes = pt.iconAngle || 0;
            if (rotateRes && typeof (rotateRes) === 'string') {
                rotateRes = (pt.rotateFunction ? pt.rotateFunction(prop, indexes) : 0);
            }
            out.rotate = rotateRes || 0;
        }
        if ('iconColor' in pt) {
            out.iconColor = pt.iconColorFunction ? pt.iconColorFunction(prop, indexes) : pt.iconColor;
        }
        if ('iconScale' in pt) {
            out.iconScale = pt.scaleFunction ? pt.scaleFunction(prop, indexes) : (pt.iconScale || 1);
        }
        if (type === 'image') {
            out.type = type;
            if (pt.iconUrl) { out.iconUrl = pt.iconUrl; }
            if (pt.image) { out.image = pt.image; }
        } else if (pt.fillRadialGradient) {
            var rgr = pt.fillRadialGradient,
                r1 = (rgr.r1Function ? rgr.r1Function(prop, indexes) : rgr.r1),
                r2 = (rgr.r2Function ? rgr.r2Function(prop, indexes) : rgr.r2),
                x1 = (rgr.x1Function ? rgr.x1Function(prop, indexes) : rgr.x1),
                y1 = (rgr.y1Function ? rgr.y1Function(prop, indexes) : rgr.y1),
                x2 = (rgr.x2Function ? rgr.x2Function(prop, indexes) : rgr.x2),
                y2 = (rgr.y2Function ? rgr.y2Function(prop, indexes) : rgr.y2);
            if (rgr.r2max) {
                r2 = Math.min(r2, rgr.r2max);
            }
            var colorStop = [];
            len = rgr.addColorStop.length;
            if (!rgr.addColorStopFunctions) {
                rgr.addColorStopFunctions = new Array(len);
            }
            for (i = 0; i < len; i++) {
                arr = rgr.addColorStop[i];
                var arrFunc = rgr.addColorStopFunctions[i] || [],
                    p0 = (arrFunc[0] ? arrFunc[0](prop, indexes) : arr[0]),
                    p3 = arr[3];
                if (arr.length < 4) {
                    var op = arr.length < 3 ? 1 : arrFunc[2] ? arrFunc[2](prop, indexes) : arr[2];
                    p3 = gmxAPIutils.dec2color(arrFunc[1] ? arrFunc[1](prop, indexes) : arr[1], op);
                 }
                colorStop.push([p0, p3]);
            }
            out.maxSize = out.sx = out.sy = out.iconSize = r2;
            out.fillRadialGradient = {
                x1:x1, y1:y1, r1:r1, x2:x2, y2:y2, r2:r2,
                addColorStop: colorStop
            };
            out._radialGradientParsed = {
                create: [x1, y1, r1, x2, y2, r2],
                colorStop: colorStop
            };
        } else if (pt.fillLinearGradient) {
            out.fillLinearGradient = pt.fillLinearGradient;
        } else {
            if (pt.fillPattern) {
                out.canvasPattern = (pt.canvasPattern ? pt.canvasPattern : gmxAPIutils.getPatternIcon(item, pt, indexes));
            }

            if (type === 'iconPath') {
                out.type = type;
                out.iconPath = pt.iconPath;
            }

            if (itemType === 'POLYGON' || itemType === 'MULTIPOLYGON' || this.gmx.GeometryType === 'polygon') {
                type = 'polygon';
            }
            if (pt.iconSize) {
                var iconSize = (pt.sizeFunction ? pt.sizeFunction(prop, indexes) : pt.iconSize);
                out.sx = out.sy = iconSize;
                // iconSize += pt.weight ? pt.weight : 0;
                out.iconSize = iconSize;
                if ('iconScale' in pt) {
                    out.iconSize *= pt.iconScale;
                }
                out.maxSize = iconSize;
            }
            out.stroke = true;
			color = pt.colorFunction ? pt.colorFunction(prop, indexes) : color;
			opacity = pt.opacityFunction ? pt.opacityFunction(prop, indexes) : opacity;
            out.strokeStyle = gmxAPIutils.dec2color(color, opacity);
            out.lineWidth = 'weight' in pt ? pt.weight : 1;
        }

        if ('iconScale' in pt) {
            out.iconScale = pt.scaleFunction ? (pt.scaleFunction(prop, indexes) || 1) : pt.iconScale;
        }
        if ('iconAnchor' in pt) {
            out.iconAnchor = pt.iconAnchor;
        }
        if ('iconCenter' in pt) {
            out.iconCenter = pt.iconCenter;
        }

        if (type === 'square' || type === 'polygon' || type === 'circle' || type === 'iconPath') {
            out.type = type;
            var fop = pt.fillOpacity,
                fc = pt.fillColor,
                fcDec = typeof (fc) === 'string' ? parseInt(fc.replace(/#/, ''), 16) : fc;

            if ('fillColor' in pt) {
                out.fillStyle = gmxAPIutils.dec2color(fcDec, 1);
            }
            if ('fillColorFunction' in pt || 'fillOpacityFunction' in pt) {
                color = pt.fillColorFunction ? pt.fillColorFunction(prop, indexes) : (fc || 255);
                opacity = pt.fillOpacityFunction ? pt.fillOpacityFunction(prop, indexes) : (fop || 1);
                out.fillStyle = gmxAPIutils.dec2color(color, opacity);
            } else if ('fillOpacity' in pt && 'fillColor' in pt) {
                out.fillStyle = gmxAPIutils.dec2color(fcDec, fop);
            }
        }

        if ('dashArray' in pt) { out.dashArray = pt.dashArray; }
        if ('dashOffset' in pt) { out.dashOffset = pt.dashOffset; }

        if (this.gmx.labelsLayer) {
            arr = gmxAPIutils.styleKeys.label.client;
            for (i = 0, len = arr.length; i < len; i++) {
                var it = arr[i];
                if (it in pt) {
                    if (it === 'labelField') {
                        if (!indexes[pt[it]]) {
                            continue;
                        }
                    } else if (it === 'labelTemplate') {
                        var properties = gmxAPIutils.getPropertiesHash(prop, indexes);
                        out.labelText = gmxAPIutils.parseTemplate(pt[it], properties);
                    }
                    out[it] = pt[it];
                }
            }
            if ('labelAnchor' in pt) {
                out.labelAnchor = pt.labelAnchor;
            }
        }
        return out;
    }
};
StyleManager.MAX_STYLE_SIZE = 256;
//StyleManager.DEFAULT_STYLE = {outline: {color: 255, thickness: 1}, marker: {size: 8, circle: true}};
StyleManager.DEFAULT_STYLE = {outline: {color: 255, thickness: 1}, marker: {size: 8}};
StyleManager.DEFAULT_KEYS = ['Name', 'MinZoom', 'MaxZoom', 'Balloon', 'BalloonEnable', 'DisableBalloonOnMouseMove', 'DisableBalloonOnClick', 'disabled'];
StyleManager.DEFAULT_ICONPATH = [0, 10, 5, -10, -5, -10, 0, 10];  // [TL.x, TL.y, BR.x, BR.y, BL.x, BL.y, TL.x, TL.y]
StyleManager.DEFAULT_STYLE_KEYS = [
	'iconUrl', 'iconAngle', 'iconSize', 'iconScale', 'iconMinScale', 'iconMaxScale', 'iconCircle', 'iconCenter', 'iconAnchor', 'iconColor',	// для иконок
	'stroke', 'color', 'weight', 'opacity', 'dashArray',	// для линии
	'fillColor', 'fillOpacity', 'fillIconUrl', 'fillPattern', 'fillRadialGradient', 'fillLinearGradient',	// для заполнения
	'labelTemplate', 'labelField', 'labelColor', 'labelHaloColor', 'labelFontSize', 'labelSpacing', 'labelAlign', 'labelAnchor', 'labelText'	// для надписей
];
StyleManager.HASH_KEYS = StyleManager.DEFAULT_KEYS.reduce(function(a, key) { a[key] = true; return a; }, {})
StyleManager.HASH_KEYS.RenderStyle = StyleManager.DEFAULT_STYLE_KEYS.reduce(function(a, key) { a[key] = true; return a; }, {});

StyleManager.parsePattern = function(pattern) {
    var common = true,
        parsers = L.gmx.Parsers;
    if ('step' in pattern && typeof (pattern.step) === 'string') {
        pattern.patternStepFunction = parsers.parseExpression(pattern.step);
        common = false;
    }
    if ('width' in pattern && typeof (pattern.width) === 'string') {
        pattern.patternWidthFunction = parsers.parseExpression(pattern.width);
        common = false;
    }
    if ('colors' in pattern) {
        var arr = [];
        for (var i = 0, len = pattern.colors.length; i < len; i++) {
            var rt = pattern.colors[i];
            if (typeof (rt) === 'string') {
                arr.push(parsers.parseExpression(rt));
                common = false;
            } else {
                arr.push(null);
            }
        }
        pattern.patternColorsFunction = arr;
    }
    return common;
};

StyleManager.getStyleKeys = function(style) {
    var out = {};
    for (var key in gmxAPIutils.styleKeys) {
        var keys = gmxAPIutils.styleKeys[key];
        for (var i = 0, len = keys.client.length; i < len; i++) {
            var key1 = keys.client[i];
            if (key1 in style) {
                if (style[key1] !== undefined) {
                    out[key1] = JSON.parse(JSON.stringify(style[key1]));
                }
                if (key1 === 'fillPattern') { delete out[key1].patternColorsFunction; }
                else if (key1 === 'fillLinearGradient') { delete out[key1].addColorStopFunctions; }
            }
        }
    }
    if ('iconAnchor' in style) {
        out.iconAnchor = style.iconAnchor;
    }
    if ('labelAnchor' in style) {
        out.labelAnchor = style.labelAnchor;
    }
    return out;
};

StyleManager.checkDiff = function(st, st1) {
    for (var key in st) {
        if (st[key] !== st1[key]) {
            return key;
        }
    }
    return null;
};

StyleManager.parseRadialGradient = function(rg) {
    //	x1,y1,r1 — координаты центра и радиус первой окружности;
    //	x2,y2,r2 — координаты центра и радиус второй окружности.
    //	addColorStop - стоп цвета объекта градиента [[position, color]...]
    //		position — положение цвета в градиенте. Значение должно быть в диапазоне 0.0 (начало) до 1.0 (конец);
    //		color — код цвета или формула.
    //		opacity — прозрачность
    //		canvasStyleColor — результрующий цвет в формате canvas
    var common = true,
        parsers = L.gmx.Parsers,
        i = 0,
        arr = ['r1', 'x1', 'y1', 'r2', 'x2', 'y2'],
        len = arr.length;
    for (i = 0; i < len; i++) {
        var it = arr[i];
        if (!rg[it]) { rg[it] = 0; }
        if (typeof (rg[it]) === 'string') {
            rg[it + 'Function'] = parsers.parseExpression(rg[it]);
            common = false;
        }
    }

    rg.addColorStop = rg.addColorStop || [[0, 0xFF0000, 0.5], [1, 0xFFFFFF, 0.5]];
    rg.addColorStopFunctions = [];
    for (i = 0, len = rg.addColorStop.length; i < len; i++) {
        arr = rg.addColorStop[i];
        var resFunc = [
                (typeof (arr[0]) === 'string' ? parsers.parseExpression(arr[0]) : null),
                (typeof (arr[1]) === 'string' ? parsers.parseExpression(arr[1]) : null),
                (typeof (arr[2]) === 'string' ? parsers.parseExpression(arr[2]) : null)
            ];
        rg.addColorStopFunctions.push(resFunc);
        if (resFunc[1] === null && resFunc[2] === null) {
            arr[3] = gmxAPIutils.dec2color(arr[1], arr[2] > 1 ? arr[2] / 100 : arr[2]);
        } else {
            common = false;
        }
    }
    if ('r2Function' in rg) { common = false; }
    return common ? Math.max(rg.r1, rg.r2) : null;
};

StyleManager.parseLinearGradient = function(lg) {
    var common = true;
    //	x1,y1 — координаты начальной точки
    //	x2,y2 — координаты конечной точки
    //	addColorStop - стоп цвета объекта градиента [[position, color]...]
    //		position — положение цвета в градиенте. Значение должно быть в диапазоне 0.0 (начало) до 1.0 (конец);
    //		color — код цвета или формула.
    //		opacity — прозрачность
    var i = 0,
        parsers = L.gmx.Parsers,
        arr = ['x1', 'y1', 'x2', 'y2'],
        def = [0, 0, 0, 256],
        len = arr.length;
    for (i = 0; i < len; i++) {
        var it = arr[i];
        if (it in lg) {
            if (typeof (lg[it]) === 'string') {
                lg[it + 'Function'] = parsers.parseExpression(lg[it]);
                common = false;
            }
        } else {
            lg[it] = def[i];
        }
    }

    lg.addColorStop = lg.addColorStop || [[0, 0xFF0000], [1, 0xFFFFFF]];
    lg.addColorStopFunctions = [];
    for (i = 0, len = lg.addColorStop.length; i < len; i++) {
        arr = lg.addColorStop[i];
        lg.addColorStopFunctions.push([
            (typeof (arr[0]) === 'string' ? parsers.parseExpression(arr[0]) : null),
            (typeof (arr[1]) === 'string' ? parsers.parseExpression(arr[1]) : null),
            (typeof (arr[2]) === 'string' ? parsers.parseExpression(arr[2]) : null)
        ]);
    }
    return common;
};

StyleManager.parReg = /\[([^\]]+)\]/g;
StyleManager.getKeysHash = function(str, type) {
	var out = {},
		arr = str.match(StyleManager.parReg);
	if (arr) {
		arr.forEach(function(it) {
			var key = it.replace(/[[\]""]/g, '');
			if (!out[key]) {out[key] = type || true; }
		});
	}
	return out;
};

StyleManager.decodeOldStyle = function(style) {   // Style Scanex->leaflet
	var st, i, len, key, key1,
		styleOut = {},
		attrKeys = {},
		type = '';

	for (key in gmxAPIutils.styleKeys) {
		var keys = gmxAPIutils.styleKeys[key];
		for (i = 0, len = keys.client.length; i < len; i++) {
			key1 = keys.client[i];
			if (key1 in style) {
				styleOut[key1] = style[key1];
			}
		}
		st = style[key];
		if (st && typeof (st) === 'object') {
			for (i = 0, len = keys.server.length; i < len; i++) {
				key1 = keys.server[i];
				if (key1 in st) {
					var newKey = keys.client[i],
						zn = st[key1];
					if (typeof (zn) === 'string') {
						var hash = StyleManager.getKeysHash(zn, newKey);
						if (Object.keys(hash).length) {
							styleOut.common = false;
							L.extend(attrKeys, hash);
						}
						if (gmxAPIutils.styleFuncKeys[newKey]) {
/*eslint-disable no-useless-escape */
							if (zn.match(/[^\d\.]/) === null) {
/*eslint-enable */
								zn = Number(zn);
							} else {
								var func = L.gmx.Parsers.parseExpression(zn);
								if (func === null) {
									zn = gmxAPIutils.styleFuncError[newKey]();
								} else {
									styleOut[gmxAPIutils.styleFuncKeys[newKey]] = func;
								}
							}
						}
					} else if (key1 === 'opacity') {
						zn /= 100;
					}
					styleOut[newKey] = zn;
				}
			}
		}
	}
	if (style.marker) {
		st = style.marker;
		if ('dx' in st || 'dy' in st) {
			var dx = st.dx || 0,
				dy = st.dy || 0;
			styleOut.iconAnchor = [-dx, -dy];    // For leaflet type iconAnchor
		}
	}
	for (key in style) {
		if (!gmxAPIutils.styleKeys[key]) {
			styleOut[key] = style[key];
		}
	}
	return {
		style: styleOut,			// стиль
		attrKeys: attrKeys,			// используемые поля атрибутов
		type: type					// 'polygon', 'line', 'circle', 'square', 'image'
	};
};

StyleManager.decodeOldStyles = function(props) {
    var styles = props.styles,
		arr = styles || [{MinZoom: 1, MaxZoom: 21, RenderStyle: StyleManager.DEFAULT_STYLE}],
		type = props.type.toLocaleLowerCase(),
		gmxStyles = {
			attrKeys: {},
			iconsUrl: {}
		};
	gmxStyles.styles = arr.map(function(it) {
        var pt = {
            Name: it.Name || '',
            type: type || '',
			//legend: false,
            MinZoom: it.MinZoom || 0,
            MaxZoom: it.MaxZoom || 18
        };

        if ('Balloon' in it) {
            pt.Balloon = it.Balloon;
			var hash = StyleManager.getKeysHash(it.Balloon, 'Balloon');
			if (Object.keys(hash).length) {
				L.extend(gmxStyles.attrKeys, hash);
			}
        }
        if (it.RenderStyle) {
            var rt = StyleManager.decodeOldStyle(it.RenderStyle);
			L.extend(gmxStyles.attrKeys, rt.attrKeys);
			if (rt.style.iconUrl) { gmxStyles.iconsUrl[rt.style.iconUrl] = true; }
            pt.RenderStyle = rt.style;
			if (it.HoverStyle === undefined) {
				var hoveredStyle = JSON.parse(JSON.stringify(pt.RenderStyle));
				if (hoveredStyle.outline) { hoveredStyle.outline.thickness += 1; }
				pt.HoverStyle = hoveredStyle;
			} else if (it.HoverStyle === null) {
				delete pt.HoverStyle;
			} else {
				var ht = StyleManager.decodeOldStyle(it.HoverStyle);
				pt.HoverStyle = ht.style;
			}
        } else if (type === 'vector ') {
            pt.RenderStyle = StyleManager.DEFAULT_STYLE;
		}

        if ('DisableBalloonOnMouseMove' in it) {
            pt.DisableBalloonOnMouseMove = it.DisableBalloonOnMouseMove === false ? false : true;
        }
        if ('DisableBalloonOnClick' in it) {
            pt.DisableBalloonOnClick = it.DisableBalloonOnClick || false;
        }
        if ('Filter' in it) {
/*eslint-disable no-useless-escape */
            pt.Filter = it.Filter;
            var ph = L.gmx.Parsers.parseSQL(it.Filter.replace(/[\[\]]/g, '"'));
/*eslint-enable */
			// TODO: need body for function ƒ (props, indexes, types)
            if (ph) { pt.filterFunction = ph; }
        }
		return pt;
	});
    return gmxStyles;
};

L.gmx = L.gmx || {};
L.gmx.StyleManager = StyleManager;

L.gmx.VectorLayer.include({
    bindPopup: function (content, options) {
        var popupOptions = L.extend({maxWidth: 10000, className: 'gmxPopup', layerId: this._gmx.layerID}, options);

        if (this._popup) { this.unbindPopup(); }
        if (content instanceof L.Popup) {
            this._popup = content;
        } else {
            if (!this._popup || options) {
                this._popup = new L.Popup(popupOptions);
            }
            this._popup.setContent(content);
        }
        this._popup._initContent = content;
        this._popup._state = '';

        if (!this._popupHandlersAdded) {
            this
                .on('click', this._openClickPopup, this)
                .on('mousemove', this._movePopup, this)
                .on('mouseover', this._overPopup, this)
                .on('mouseout', this._outPopup, this)
                .on('doneDraw', this._chkNeedOpenPopup, this);

            this._popupHandlersAdded = true;
        }
        if (popupOptions && popupOptions.popupopen) {
            this._popupopen = popupOptions.popupopen;
        }

        this._popup.updateLayout = this._popup._updateLayout;

        return this;
    },

	unbindPopup: function () {
		if (this._popup) {
			this._popup = null;
			this
			    .off('click', this._openClickPopup, this)
                .off('mousemove', this._movePopup, this)
			    .off('mouseover', this._overPopup, this)
                .off('mouseout', this._outPopup, this)
                .off('doneDraw', this._chkNeedOpenPopup, this);

            this._popupopen = null;
			this._popupHandlersAdded = false;
		}
        this._gmx.balloonEnable = false;
		return this;
	},

    _chkNeedOpenPopup: function () {
        for (var id in this._gmx._needPopups) {
            if (this._gmx._needPopups[id]) {
                this.addPopup(id);
                delete this._gmx._needPopups[id];
            }
        }
    },

    disablePopup: function (flagHover) {
        this._popupDisabled = true;

		if (flagHover) { this._cacheClickable = this.options.clickable; this.options.clickable = false; }
		return this;
    },

    enablePopup: function (flagHover) {
        this._popupDisabled = false;
		if (flagHover) { this.options.clickable = this._cacheClickable; }
		return this;
    },

	openPopup: function (latlng, options) {
		if (this._popup) {
			// open the popup from one of the path's points if not specified
			latlng = latlng || this._latlng ||
			         this._latlngs[Math.floor(this._latlngs.length / 2)];

			options = options || {};
            options.latlng = latlng;
            this._openPopup(options);
		}

		return this;
	},

	closePopup: function (type) {
		if (this._popup) {
			this._popup._close();
			if (type !== 'mouseout') {
			this.getPopups().forEach(this._clearPopup.bind(this));
			}
            this.fire('popupclose', {popup: this._popup});
		}
		return this;
	},

    _movePopup: function (options) {
        if (this._popup._state === 'mouseover') {
            var id = this._popup.options._gmxID || -1;
            if (id !== options.gmx.id) {
                this._setPopupContent(options);
            }
            this._popup.setLatLng(options.latlng);
        }
    },

    _overPopup: function (options) {
        var _popup = this._popup;
        if (!_popup._map) {
            this._openPopup(options);
        } else {
            this.fire('popupopen', {
                popup: _popup,
                gmx: this._setPopupContent(options, _popup)
            });
        }
        if (_popup._state === 'mouseover') {
            _popup.setLatLng(options.latlng);
        }
    },

    _outPopup: function (ev) {
        if (this._popup._state === 'mouseover' && !ev.gmx.prevId) {
            this.closePopup(ev.type);
        }
    },

    _callBalloonHook: function (props, div) {

        var spans = div.getElementsByTagName('span'),
            hooksCount = {},
            key, i, len;
        for (key in this._balloonHook) {    // collect hook counts
            var hookID = this._balloonHook[key].hookID;
            hooksCount[key] = 0;
            for (i = 0, len = spans.length; i < len; i++) {
                if (spans[i].id === hookID) {
                    hooksCount[key]++;
                }
            }
        }

        for (key in this._balloonHook) {
            var hook = this._balloonHook[key],
                fid = hook.hookID,
                notFound = true;

            for (i = 0, len = spans.length; i < len; i++) {
                var node = spans[i];
                if (node.id === fid) {
                    notFound = false;
                    node.id += '_' + i;
                    hook.callback(props, div, node, hooksCount);
                }
            }
            if (notFound) {
                hook.callback(props, div, null, hooksCount);
            }
        }
    },

    _setPopupContent: function (options, _popup) {
        if (!_popup) { _popup = this._popup; }
        var gmx = options.gmx || {},
            balloonData = gmx.balloonData || {},
            properties = L.extend({}, gmx.properties),
            target = gmx.target || {},
            geometry = target.geometry || {},
            offset = target.offset,
            templateBalloon = _popup._initContent || balloonData.templateBalloon || '',
            type = options.type,
            skipSummary = this.options.isGeneralized && (type === 'mouseover' || type === 'mousemove'),
            outItem = {
                id: gmx.id,
                type: type,
                nodePoint: gmx.nodePoint,
                latlng: options.latlng,
                properties: properties,
                templateBalloon: templateBalloon
            };

        if (geometry.type === 'POINT') {
			var geoJson = L.gmxUtil.geometryToGeoJSON(geometry, true, gmx.srs == 3857);
            outItem.latlng = L.latLng(geoJson.coordinates.reverse());
        }
        if (offset) {
            var protoOffset = L.Popup.prototype.options.offset;
            _popup.options.offset = [-protoOffset[0] - offset[0], protoOffset[1] - offset[1]];
        } else {
			_popup.options.offset[1] = type === 'mouseover' ? -7 : 7;
		}

        if (this._popupopen) {
            this._popupopen({
                popup: _popup,
                latlng: outItem.latlng,
                layerPoint: options.layerPoint,
                contentNode: _popup._contentNode,
                containerPoint: options.containerPoint,
                originalEvent: options.originalEvent,
                gmx: outItem
            });
        } else if (!(templateBalloon instanceof L.Popup)) {
            if (!(templateBalloon instanceof HTMLElement)) {
                var geometries,
                    summary = '',
                    unitOptions = this._map ? this._map.options : {};

                if (!skipSummary) {
                    geometries = target.geometry ? [target.geometry] : (gmx.geometries || this._gmx.dataManager.getItemGeometries(gmx.id) || []);
                    outItem.summary = summary = L.gmxUtil.getGeometriesSummary(geometries, unitOptions);
                }
                if (this._balloonHook) {
                    if (!templateBalloon) {
                        templateBalloon = gmxAPIutils.getDefaultBalloonTemplate(properties);
                    }
                    for (var key in this._balloonHook) {
                        properties[key] = gmxAPIutils.parseTemplate(this._balloonHook[key].resStr, properties);
                    }
                }
                templateBalloon = L.gmxUtil.parseBalloonTemplate(templateBalloon, {
                    properties: properties,
                    tileAttributeTypes: this._gmx.tileAttributeTypes,
                    unitOptions: unitOptions,
                    summary: summary,
                    geometries: geometries
                });
            }

            var contentDiv = L.DomUtil.create('div', '');
            contentDiv.innerHTML = templateBalloon;
            _popup.setContent(contentDiv);
            if (this._balloonHook) {
                this._callBalloonHook(gmx.properties, _popup.getContent());
            }
            //outItem.templateBalloon = templateBalloon;
        }
        _popup.options._gmxID = gmx.id;
        return outItem;
    },

    _openClickPopup: function (options) {
        var originalEvent = options.originalEvent || {},
            skip = !options.gmx || this._popupDisabled || originalEvent.ctrlKey || originalEvent.altKey || originalEvent.shiftKey;

        if (!skip) {
            var type = options.type,
                gmx = options.gmx,
                balloonData = gmx.balloonData,
                flag = type === 'click' && balloonData.isSummary && !balloonData.DisableBalloonOnClick,
                item = gmx.target;

            if (flag && item.options.isGeneralized && !item.geometry) {
                var layerProp = gmx.layer.getGmxProperties();
                gmxAPIutils.getLayerItemFromServer({
                    options: options,
                    layerID: layerProp.name,
                    value: item.id,
                    field: layerProp.identityField
                }).then(function(json, params) {
                    if (json && json.Status === 'ok' && json.Result) {
                        var pArr = json.Result.values[0];
                        params.options.gmx.target.fromServerProps = pArr;
                        params.options.gmx.target.geometry = pArr[pArr.length - 1];
                        this._openPopup(params.options);
                    }
                }.bind(this));
            } else {
				if (item.type.indexOf('POINT') !== -1) {
					options.latlng = L.latLng(L.gmxUtil.geometryToGeoJSON(item.properties[item.properties.length - 1], true, this._gmx.srs == 3857).coordinates.reverse());
                }
				this._openPopup(options);
            }
        }
    },

    _openPopup: function (options, notSkip) {
        var map = this._map,
            originalEvent = options.originalEvent || {},
            skip = notSkip ? !notSkip : this._popupDisabled || originalEvent.ctrlKey || originalEvent.altKey || originalEvent.shiftKey;

        if (!skip) {
            var type = options.type,
                _popup = this._popup,
                gmx = options.gmx || {},
                balloonData = gmx.balloonData || {};

            if (type === 'click') {
                if (!notSkip && balloonData.DisableBalloonOnClick && !this.hasEventListeners('popupopen')) { return; }

                if (!('_gmxPopups' in map)) {
                    map._gmxPopups = [];
                }
                if (!('maxPopupCount' in map.options)) { map.options.maxPopupCount = 1; }
                if (!this._gmx._gmxPopupsInit) {
                    this._gmx._gmxPopupsInit = true;
                    map.on({
                        layerremove: function (ev) {
                            if (ev.layer instanceof L.Popup) {
                                this._clearPopup(ev.layer);
                            } else if (ev.layer === this) {
                                if (map._gmxPopups) {
                                    var layerId = this._gmx.layerID;
                                    map._gmxPopups = map._gmxPopups.reduce(function(p, c) {
                                        if (c._map) {
                                            if (c.options.layerId === layerId) { c._map.removeLayer(c); }
                                            else { p.push(c); }
                                        }
                                        return p;
                                    }, []);
                                }
                                this.closePopup();
                            }
                        }
                    }, this);
                }

                this._clearPopup(gmx.id);
                var opt = this._popup ? this._popup.options : {maxWidth: 10000, className: 'gmxPopup', layerId: this._gmx.layerID};
                _popup = new L.Popup(L.extend({}, opt, {closeOnClick: map.options.maxPopupCount === 1, autoPan: true}));
            } else if (type === 'mouseover') {
                if (balloonData.DisableBalloonOnMouseMove) {
                    _popup._state = '';
                    return;
                }
                _popup.options.autoPan = false;
            } else {
                return;
            }
            _popup.options.objectId = gmx.id;
            _popup._state = type;
            var outItem = this._setPopupContent(options, _popup);
            _popup.setLatLng(outItem.latlng);

            this.fire('popupopen', {
                popup: _popup,
                gmx: outItem
            });
            if (type === 'click') {
                if (map._gmxPopups.length >= map.options.maxPopupCount) {
                    map.removeLayer(map._gmxPopups.shift());
                }
                map._gmxPopups.push(_popup);
            }
            _popup.addTo(map);    // this._map.openPopup(_popup);

            if (_popup._closeButton) {
                var closeStyle = _popup._closeButton.style;
                if (type === 'mouseover' && closeStyle !== 'hidden') {
                    closeStyle.visibility = 'hidden';
                    _popup._container.style.marginBottom = '7px';
                    _popup._container.style.pointerEvents = 'none';
                } else if (type === 'click' && closeStyle !== 'inherit') {
                    closeStyle.visibility = 'inherit';
                    _popup._container.style.marginBottom = '';
                    _popup._container.style.pointerEvents = '';
                }
            }
        }
    },

	_clearPopup: function (item /* <L.Popup> or objectId */) {
        var map = this._map;
        if (map && map._gmxPopups) {
            var layerId = this._gmx.layerID,
                flagPopup = item instanceof L.Popup;
            map._gmxPopups = map._gmxPopups.reduce(function(p, c) {
                if (c._map) {
                    if (flagPopup && c === item) { c._map.removeLayer(c); }
                    else if (c.options.layerId === layerId && c.options.objectId === item) { c._map.removeLayer(c); }
                    else { p.push(c); }
                }
                return p;
            }, []);
        }
    },

    getPopups: function (flag) {
        var map = this._map,
            out = [];
        if (map && map._gmxPopups) {
            var layerId = this._gmx.layerID;
            map._gmxPopups.reduce(function(p, c) {
                if (c.options.layerId === layerId) { p.push(flag ? c : c.options.objectId); }
                return p;
            }, out);
        }
        return out;
    },

    addPopup: function (id) {
        var gmx = this._gmx,
            item = gmx.dataManager.getItem(id);
        if (!item || !this._map) {
            gmx._needPopups[id] = false;
        } else {
            var center = item.bounds.getCenter(),
                latlng = L.latLng(L.gmxUtil.coordsFromMercator('Point', center, gmx.srs == 3857).reverse());
            this._openPopup({
                type: 'click',
                latlng: latlng,
                gmx: this.getHoverOption(item)
            }, true);
            delete gmx._needPopups[id];
        }
        return this;
    },

    addPopupHook: function (key, callback) {
        if (!this._balloonHook) { this._balloonHook = {}; }
        if (!this._balloonHook[key]) {
            var hookID = '_' + L.stamp({});
            this._balloonHook[key] = {
                key: key,
                hookID: hookID,
                resStr: '<span id="' + hookID + '"></span>',
                callback: callback
            };
        }
        return this;
    },

    removePopupHook: function(key) {
        if (this._balloonHook) { delete this._balloonHook[key]; }
        return this;
    }
});


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
                item = gmx.dataManager.getItem(idr),
                currentStyle = item.currentStyle || item.parsedStyleKeys || {},
                iconScale = currentStyle.iconScale || 1,
                iconCenter = currentStyle.iconCenter,
                iconAnchor = !iconCenter && currentStyle.iconAnchor ? currentStyle.iconAnchor : null,
                parsedStyle = gmx.styleManager.getObjStyle(item),
                lineWidth = currentStyle.lineWidth || parsedStyle.lineWidth || 0,
                sx = lineWidth + (parsedStyle.sx || currentStyle.sx || 0),
                sy = lineWidth + (parsedStyle.sy || currentStyle.sy || 0),
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
                        item = gmx.dataManager.getItem(idr),
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
                } else if (this._map) {
					this._map.doubleClickZoom.enable();
				}
            }
        }
        return 0;
    },

    getHoverOption: function (item) {
        return {
            layer: this,
            target: item,
            balloonData: this._gmx.styleManager.getItemBalloon(item.id),
            properties: this.getItemProperties(item.properties),
            currentFilter: item.currentFilter || 0,
            id: item.id
        };
    }
});


(function() {
var delay = 20000,
    layers = {},
    dataManagersLinks = {},
    script = '/Layer/CheckVersion.ashx',
    intervalID = null,
    timeoutID = null,
    hostBusy = {},
    needReq = {};

var isExistsTiles = function(prop) {
    var tilesKey = prop.Temporal ? 'TemporalTiles' : 'tiles';
    return tilesKey in prop || prop.currentTiles;
};
var getParams = function(prop, dm, gmx) {
    var pt = {
        Name: prop.name,
        Version: isExistsTiles(prop) ? prop.LayerVersion : -1
    };
	if (dm && (prop.UseTiles === false || gmx.skipTiles === 'NotVisible' || gmx.needBbox || gmx.options.needBbox)) {
		var maxDateInterval = dm.getMaxDateInterval(),
			beginDate = maxDateInterval.beginDate || gmx.beginDate,
			endDate = maxDateInterval.endDate || gmx.endDate;
        if (beginDate) { pt.dateBegin = Math.floor(beginDate.getTime() / 1000); }
        if (endDate) { pt.dateEnd = Math.floor(endDate.getTime() / 1000); }
    }
    return pt;
};
var getRequestParams = function(layer) {
    var hosts = {},
        prop, hostName, dm, gmx;
    if (layer && layer._gmx) {
        if (layer.target instanceof L.gmx.DataManager) {
			layer = layer.target;
		}
        if (layer instanceof L.gmx.DataManager) {
			dm = layer;
			prop = dm.options;
		} else {
			// if (!layer._gmx) {return hosts;}
			prop = layer._gmx.properties;
			dm = layer._gmx.dataManager;
			gmx = layer._gmx;
		}
        hostName = prop.hostName || layer._gmx.hostName;
		hosts[hostName] = [getParams(prop, dm, gmx)];
    } else {
        var skipItems = {};
        for (var id in layers) {
            var obj = layers[id],
				isDataManager = obj instanceof L.gmx.DataManager;
            if (obj.options.chkUpdate || isDataManager) {
				dm = isDataManager ? obj : obj._gmx.dataManager;
                prop = isDataManager ? obj.options : obj._gmx.properties;
				gmx = isDataManager ? obj : obj._gmx;
                hostName = prop.hostName || obj._gmx.hostName;
                var pt = getParams(prop, dm, gmx),
                    key = pt.Name + pt.Version,
					valid = !skipItems[key] && (!prop.Temporal || pt.dateBegin);
                if (valid) {
                    if (hosts[hostName]) { hosts[hostName].push(pt); }
                    else { hosts[hostName] = [pt]; }
                }
                skipItems[key] = true;
            }
        }
    }
    return hosts;
};

var chkVersion = function (layer, callback) {
	if (typeof(layer) === 'string') {
		layer = layers[layer];
	}

	var map = layersVersion._map;
    var processResponse = function(res) {
        if (res && res.Status === 'ok' && res.Result) {
			var arr = res.Result,
				len = arr.length,
				count = 0,
				i, key, curLayer, id, item;

			if (layersVersion.needBbox) {
				for (i = 0; i < len; i++) {
					item = arr[i];
					id = item.name || item.properties.name;
					curLayer = null;
					if (layer && layer._gmx.properties.name === id) {
						curLayer = layer;
					} else {
						for (key in layers) {
							curLayer = layers[key];
							if (layer && layer === curLayer && 'updateVersion' in layer) { continue; }
							if (curLayer._gmx && curLayer._gmx.properties.name === id && 'updateVersion' in curLayer) {	// слои
								break;
							} else if (curLayer instanceof L.gmx.DataManager && curLayer.options.name === id) {	// источники данных
								break;
							}
						}
					}
					if (curLayer) {
						count += (curLayer.getDataManager ? curLayer.getDataManager() : curLayer).getNotLoadedVectorTiles(item);
					}
				}
				map.fire('needLoadTiles', {count: count});
				if (L.gmx.skipLoadTiles) {
					console.log('Skiped tiles: ', L.gmx.needLoadTiles);
					return;
				}
			}

            for (i = 0; i < len; i++) {
                item = arr[i];
				id = item.name || item.properties.name;

				if (layer && layer._gmx.properties.name === id && 'updateVersion' in layer) { layer.updateVersion(item); }
                for (key in layers) {
                    curLayer = layers[key];
					if (layer && layer === curLayer) { continue; }
                    if (curLayer._gmx && curLayer._gmx.properties.name === id && 'updateVersion' in curLayer) {	// слои
						curLayer.updateVersion(item);
					} else if (curLayer instanceof L.gmx.DataManager && curLayer.options.name === id) {	// источники данных
						curLayer.updateVersion(item.properties, item.tiles);
					}
                }
            }
        }
        // lastLayersStr = '';
        if (callback) { callback(res); }
    };

    if (document.body && !L.gmxUtil.isPageHidden()) {
        var hosts = getRequestParams(layer),
			w = gmxAPIutils.worldWidthMerc,
			bboxStr = [-w, -w, w, w].join(','),
            chkHost = function(hostName, busyFlag) {
				var url = L.gmxUtil.protocol + '//' + hostName + script,
                    layersStr = JSON.stringify(hosts[hostName]);
				var params = 'WrapStyle=None&ftc=osm';
				if (layersVersion.needBbox) {
					var zoom = map.getZoom(),
						crs = L.Projection.Mercator;
					params += '&zoom=' + zoom;
					if (map.options.srs == 3857) {
						params += '&srs=3857';
						crs = L.CRS.EPSG3857;
					}
					if (map.options.generalized === false) {
						params += '&generalizedTiles=false';
					}
					if (!map.options.allWorld) {
						var bbox = map.getBounds(),
							min = crs.project(bbox.getSouthWest()),
							max = crs.project(bbox.getNorthEast());

						bboxStr = [min.x, min.y, max.x, max.y].join(',');
					}
					params += '&bbox=[' + bboxStr + ']';
				}
				params += '&layers=' + encodeURIComponent(layersStr);

				if ('FormData' in window) {
					hostBusy[hostName] = true;
					L.gmxUtil.request({
						url: url,
						async: true,
						headers: {
							'Content-type': 'application/x-www-form-urlencoded'
						},
						type: 'POST',
						params: params,
						withCredentials: true,
						callback: function(response) {
							delete hostBusy[hostName];
							if (needReq[hostName] && !busyFlag) {
								delete needReq[hostName];
								chkHost(hostName, true);
							} else {
								processResponse(JSON.parse(response));
							}
						},
						onError: function(response) {
							console.log('Error: LayerVersion ', response);
							delete hostBusy[hostName];
							if (needReq[hostName] && !busyFlag) {
								delete needReq[hostName];
								chkHost(hostName, true);
							}
						}
					});
                    // } else {
                        // L.gmxUtil.sendCrossDomainPostRequest(url, {
                            // WrapStyle: 'message',
                            // layers: layersStr
                        // }, processResponse);
                    // }
                    var timeStamp = Date.now();
                    for (var key in layers) {
                        var it = layers[key];
                        var options = it._gmx || it.options;
                        if (options.hostName === hostName) { options._stampVersionRequest = timeStamp; }
                    }
                }
            };
        for (var hostName in hosts) {
			if (!hostBusy[hostName]) {
				chkHost(hostName);
			} else {
				needReq[hostName] = true;
			}
        }
    }
};

var layersVersion = {
    needBbox: false,

    addDataManager: function(dataManager) {
        var options = dataManager.options,
			id = options.name;
        if (id in layers) {
            return;
		}
		if (options.needBbox && !layersVersion.needBbox) {
			layersVersion.needBbox = options.needBbox;
		}
		dataManager.on('chkLayerUpdate', chkVersion.bind(dataManager));
		layers[id] = dataManager;
    },

    removeDataManager: function(dataManager) {
        var id = dataManager.options.name;
        if (id in layers) {
			dataManager.off('chkLayerUpdate', chkVersion.bind(dataManager));
			delete layers[id];
		}
    },

    remove: function(layer) {
		if (L.gmx.sendCmd) {
			L.gmx.sendCmd('toggleDataSource', {
				active: false,		// включить/выключить контроль источников
				hostName: layer.options.hostName,
				mapID: layer.options.mapID,
				layerID: layer.options.layerID
			});
		}
        delete layers[layer._gmx.layerID];
        var _gmx = layer._gmx,
			pOptions = layer.options.parentOptions;
		if (pOptions) {
			var pId = pOptions.name;
			if (dataManagersLinks[pId]) {
				delete dataManagersLinks[pId][_gmx.properties.name];
				if (!Object.keys(dataManagersLinks[pId]).length) {
					layersVersion.removeDataManager(_gmx.dataManager);
					delete dataManagersLinks[pId];
				}
			}
		} else {
			_gmx.dataManager.off('chkLayerUpdate', _gmx._chkVersion);
		}
    },

    add: function(layer) {
        var id = layer._gmx.layerID;
		if (L.gmx.sendCmd) {
			var opt = {
				active: true,		// включить/выключить контроль источников
				hostName: layer.options.hostName,
				mapID: layer.options.mapID,
				layerID: layer.options.layerID
			};
			var interval = layer._gmx.dataManager.getMaxDateInterval();
			if (interval.beginDate && interval.endDate) {
				opt.dInterval = [Math.floor(interval.beginDate.getTime() / 1000), Math.floor(interval.endDate.getTime() / 1000)];
			}
			L.gmx.sendCmd('toggleDataSource', opt);
		}
        if (id in layers) {
            return;
		}

        var _gmx = layer._gmx,
            prop = _gmx.properties;
        if ('LayerVersion' in prop) {
            layers[id] = layer;
            _gmx._chkVersion = function () {
                chkVersion(layer);
            };
            _gmx.dataManager.on('chkLayerUpdate', _gmx._chkVersion);
			var pOptions = layer.options.parentOptions;
			if (pOptions) {
				var pId = pOptions.name;
				layersVersion.addDataManager(_gmx.dataManager);
				if (!dataManagersLinks[pId]) { dataManagersLinks[pId] = {}; }
				dataManagersLinks[pId][prop.name] = layer;
			}

            if (_gmx.needBbox && !layersVersion.needBbox) {
				layersVersion.needBbox = _gmx.needBbox;
			}
			layersVersion.start();
            // if (!_gmx._stampVersionRequest || _gmx._stampVersionRequest < Date.now() - 19000 || !isExistsTiles(prop)) {
				layersVersion.now();
            // }
        }
    },

    chkVersion: chkVersion,

    now: function() {
		// if (timeoutID) { cancelIdleCallback(timeoutID); }
		// timeoutID = requestIdleCallback(function() {
			// chkVersion();
		// }, {timeout: 25});
		if (timeoutID) { clearTimeout(timeoutID); }
		timeoutID = setTimeout(chkVersion, 0);
    },

    stop: function() {
        if (intervalID) { clearInterval(intervalID); }
        intervalID = null;
    },

    start: function(msec) {
        if (msec) { delay = msec; }
        layersVersion.stop();
        intervalID = setInterval(chkVersion, delay);
    }
};

if (!L.gmx) { L.gmx = {}; }
L.gmx.layersVersion = layersVersion;

L.gmx.VectorLayer.include({
    updateVersion: function (layerDescription) {
        if (layerDescription) {
            var gmx = this._gmx;
            if (layerDescription.geometry) {
                gmx.geometry = layerDescription.geometry;
            }
            if (layerDescription.properties) {
				var out = {versionChanged: layerDescription.properties.LayerVersion !== gmx.properties.LayerVersion};
                L.extend(gmx.properties, layerDescription.properties);
                gmx.properties.currentTiles = layerDescription.tiles;
                gmx.properties.GeoProcessing = layerDescription.properties.GeoProcessing;	// TODO: проверка изменения версии
                gmx.rawProperties = gmx.properties;
                this.fire('versionchange', out);
            }
			if (!gmx.dataSource && gmx.dataManager) {
				gmx.dataManager.updateVersion(gmx.rawProperties, layerDescription.tiles);
			}
        }
    }
});
L.Map.addInitHook(function () {
	layersVersion._map = this;
	var map = this,
		prev = {};
	this.on('moveend', function () {
		var z = map.getZoom(),
			center = map.getPixelBounds().getCenter();
		if (z !== prev.z || prev.center.distanceTo(center) > 128) {
			chkVersion();
			prev.z = z;
			prev.center = center;
			if (L.gmx.sendCmd) {
				var bbox = map.getBounds(),
					crs = L.CRS.EPSG3857,
					min = crs.project(bbox.getSouthWest()),
					max = crs.project(bbox.getNorthEast()),
					bboxArr = [min.x, min.y, max.x, max.y];

				L.gmx.sendCmd('onmoveend', {
					zoom: z,
					bbox: bboxArr
				});
			}
		}
	});
});

})();


//Raster layer is just vector layer with the single object and special background tiles
L.gmx.RasterLayer = L.gmx.VectorLayer.extend(
{
    options: {
        isGeneralized: false,
        zIndexOffset: 0
        //clickable: false
    },
    initFromDescription: function(ph) {
        this._gmx.srs = this._gmx.srs || 3857;
        var props = ph.properties,
            styles = props.styles[0] || {MinZoom: props.MinZoom || 0, MaxZoom: props.MaxZoom || 21},
            vectorProperties = {
                type: 'Vector',
                fromType: props.type,
                identityField: 'ogc_fid',
                GeometryType: 'POLYGON',
                IsRasterCatalog: true,
				RasterSRS: Number(props.RasterSRS) || 3857,
                Copyright: props.Copyright || '',
                RCMinZoomForRasters: styles.MinZoom,
                visible: props.visible,
                styles: [{
                    DisableBalloonOnClick: true,
                    MinZoom: styles.MinZoom,
                    MaxZoom: styles.MaxZoom,
                    RenderStyle: {outline: {thickness: 0}, fill: {opacity: 100}},
                    HoverStyle: null
                }]
            },
            gmx = this._gmx,
            worldSize = gmxAPIutils.tileSizes[1];

        if (props.MaxZoom) {
            gmx.maxNativeZoom = props.MaxZoom;
        }

        props.sessionKey = props.sessionKey || L.gmx.gmxSessionManager.getSessionKeyRes(props.hostName);
		if (props.sessionKey) {
            gmx.sessionKey = props.sessionKey;
        }
        if (!ph.geometry) {
            ph.geometry = {
                type: 'POLYGON',
                coordinates: [[[-worldSize, -worldSize], [-worldSize, worldSize], [worldSize, worldSize], [worldSize, -worldSize], [-worldSize, -worldSize]]]
            };
        } else if (gmx.srs == 3857 && gmx.srs != vectorProperties.RasterSRS) {
			ph.geometry = gmxAPIutils.convertGeometry(gmxAPIutils.convertGeometry(ph.geometry, true, true), false, true);
		}

		L.gmx.VectorLayer.prototype.initFromDescription.call(this, {geometry: ph.geometry, properties: vectorProperties, rawProperties: ph.properties});

        gmx.rasterBGfunc = function(x, y, z) {
			var url = L.gmxUtil.protocol + '//' + gmx.hostName + '/' +
					'TileSender.ashx?ModeKey=tile&ftc=osm' +
					'&z=' + z +
					'&x=' + x +
					'&y=' + y;
			if (gmx.srs) { url += '&srs=' + gmx.srs; }
			if (gmx.crossOrigin) { url += '&cross=' + gmx.crossOrigin; }
			url += '&LayerName=' + gmx.layerID;
			if (gmx.sessionKey) { url += '&key=' + encodeURIComponent(gmx.sessionKey); }
			return url;
		};

		gmx.dataManager._rasterVectorTile = new VectorTile({
			load: function(x, y, z, v, s, d, callback) {
					var objects = [[777, ph.geometry]],
						itemBounds = gmxAPIutils.geoItemBounds(ph.geometry),
						bounds = itemBounds.bounds;

					if (bounds.max.x > worldSize) {
						// for old layers geometry
						var ww2 = 2 * worldSize,
							id = 777,
							coords = ph.geometry.coordinates,
							bboxArr = itemBounds.boundsArr;

						objects = [];
						if (ph.geometry.type === 'POLYGON') {
							coords = [coords];
							bboxArr = [bboxArr];
						}

						for (var i = 0, len = coords.length; i < len; i++) {
							var it = coords[i],
								bbox = bboxArr[i][0],
								arr = it;
							objects.push([id++, {type: 'POLYGON', coordinates: arr}]);
							if (bbox.max.x > worldSize) {
								arr = [];
								for (var j = 0, len1 = it.length; j < len1; j++) {
									var it1 = it[j];
									for (var j1 = 0, arr1 = [], len2 = it1.length; j1 < len2; j1++) {
										var it2 = it1[j1];
										arr1.push([it2[0] - ww2, it2[1]]);
									}
									arr.push(arr1);
								}
								objects.push([id++, {type: 'POLYGON', coordinates: arr}]);
							}
						}
					}
					callback({
						bbox: [bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y],
						srs: gmx.srs,
						isGeneralized: false,
						changeState: true,
						values: objects
					});
					gmx.dataManager._updateItemsFromTile(gmx.dataManager._rasterVectorTile);
				}
			},
			{x: 0, y: 0, z: 0, v: 0, s: -2, d: -2}
		);
		gmx.dataManager.addTile(gmx.dataManager._rasterVectorTile);

        return this;
    },

    setZoomBounds: function(minZoom, maxZoom) {
        var styles = this.getStyles().slice(0);
        styles[0] = L.extend({}, styles[0]);
        styles[0].MinZoom = minZoom;
        styles[0].MaxZoom = maxZoom;
        this.setStyles(styles);
    }
});

L.Map.addInitHook(function () {
    if (this.options.multiRasterLayers) {		// All L.gmx.RasterLayer to one CR
		var map = this,
			visibleLayers = {},
			curId = 0,
			multiRasterLayer = L.gmx.createLayer({
				properties: {
					type: 'Vector',
					GeometryType: 'polygon',
					identityField: 'gmx_id',
					ZIndexField: '_zIndex',
					attributes: ['gmx_id', '_zIndex', 'MinZoom', 'MaxZoom', 'GMX_RasterCatalogID'],
					attrTypes: ['integer', 'integer', 'integer', 'integer', 'string'],
					IsRasterCatalog: true,
					RCMinZoomForRasters: 1
				}
			}, {_vectorType: 'multiRasterLayer'})
			.setFilter(function (it) {
				var zoom = map.getZoom(),
					pArr = it.properties;
				return visibleLayers[pArr[5]] && zoom >= pArr[3] && zoom <= pArr[4];
			})
			.setStyles([
				{
					MinZoom: 1, MaxZoom: 21,
					DisableBalloonOnClick: true,
					DisableBalloonOnMouseMove: true,
					RenderStyle: {weight: 0},
					HoverStyle: {weight: 0}
				}
			])
			.once('update', function () {
				requestIdleCallback(multiRasterLayer.repaint.bind(multiRasterLayer), {timeout: 0});
			}),
			setVisible = function (it, flag) {
				var rawProp = it.getGmxProperties(),
					layerId = rawProp.name,
					zindexupdated = function(ev) {
						var opt = ev.target.options,
							arr = visibleLayers[opt.layerID];
						if (arr) {
							arr[2] = (opt.zIndexOffset ? opt.zIndexOffset : 0) + (opt.zIndex ? opt.zIndex : 0);
						}
						multiRasterLayer.repaint();
					};

				if (flag) {
					curId++;
					var options = it.options,
						zIndex = (options.zIndexOffset ? options.zIndexOffset : 0) + (options.zIndex ? options.zIndex : 0),
						gmxId = curId,
						pArr = [
							gmxId,
							gmxId,
							zIndex,
							rawProp.styles[0].MinZoom || 1,
							rawProp.styles[0].MaxZoom || 21,
							layerId,
							it._gmx.geometry
						];
					multiRasterLayer.addData([pArr]);
					visibleLayers[layerId] = pArr;
					it.onRemove(map);
					it.on('zindexupdated', zindexupdated);
				} else {
					it.off('zindexupdated', zindexupdated);
					multiRasterLayer.removeData([visibleLayers[layerId]]);
					visibleLayers[layerId] = null;
				}
				multiRasterLayer.repaint();
			};

		map
			.on('layeradd', function (ev) {
				var it = ev.layer;
				if (it instanceof L.gmx.RasterLayer) {
					setVisible(it, true);
				}
			})
			.on('layerremove', function (ev) {
				var it = ev.layer;
				if (it instanceof L.gmx.RasterLayer) {
					setVisible(it, false);
				}
			})
			.addLayer(multiRasterLayer);
	}
});


/*
 (c) 2014, Sergey Alekseev
 Leaflet.LabelsLayer, plugin for Gemixer layers.
*/
L.LabelsLayer = (L.Layer || L.Class).extend({

    options: {
		animate: false,
		labels: 'default',
        pane: 'overlayPane'
    },

    initialize: function (map, options) {
        L.setOptions(this, L.extend(this.options, options));
        this._observers = {};
        this._styleManagers = {};
        this._labels = {};
        this._labelsIndex = {};
        var _this = this;

        this.bbox = gmxAPIutils.bounds();

        var chkData = function (data, layer) {
            if (!data.added && !data.removed) { return; }

            var opt = layer.options,
                added = map._zoom >= opt.minZoom && map._zoom <= opt.maxZoom ? data.added : [],
                layerId = '_' + layer._leaflet_id,
                gmx = layer._gmx,
                labels = {};

            for (var i = 0, len = added.length; i < len; i++) {
                var item = added[i].item,
                    isPoint = item.type === 'POINT' || item.type === 'MULTIPOINT',
                    currentStyle = item.parsedStyleKeys || item.currentStyle || {};

                if (gmx.styleHook) {
                    var styleExtend = gmx.styleHook(item, gmx.lastHover && item.id === gmx.lastHover.id);
                    if (styleExtend) {
                        currentStyle = L.extend({}, currentStyle, styleExtend);
                    } else {
                        continue;
                    }
                }
                if (item.multiFilters) {
                    for (var j = 0, len1 = item.multiFilters.length; j < len1; j++) {
                        var st = item.multiFilters[j].parsedStyle;
                        if ('labelField' in st || 'labelText' in st) {
                            currentStyle = st;
                            break;
                        }
                    }
                }
                var style = gmx.styleManager.getObjStyle(item) || {},
                    labelText = currentStyle.labelText || style.labelText,
                    labelField = currentStyle.labelField || style.labelField,
                    fieldType = gmx.tileAttributeTypes[labelField],
                    txt = String(labelText || L.gmxUtil.attrToString(fieldType, layer.getPropItem(labelField, item.properties)));

                if (style.labelTemplate) {
					var reg = /\[([^\]]*)\]/g,
						match;
					txt = style.labelTemplate;

					while ((match = reg.exec(style.labelTemplate))) {
						if (match.length === 2) {
							labelField = match[1];
							fieldType = gmx.tileAttributeTypes[labelField];
							var val = L.gmxUtil.attrToString(fieldType, layer.getPropItem(labelField, item.properties));
							txt = txt.replace(match[0], val);
						}
					}
                }
				if (txt || txt === 0) {
                    var fontSize = style.labelFontSize || currentStyle.labelFontSize || 12,
                        id = '_' + item.id,
                        changed = true,
                        width = 0,
						arrTxtWidth,
                        options = item.options,
                        labelStyle = {
                            font: fontSize + 'px "Arial"',
                            labelHaloColor: ('labelHaloColor' in currentStyle ? currentStyle.labelHaloColor : ('labelHaloColor' in style ? style.labelHaloColor : 0xffffff)),
                            labelColor: currentStyle.labelColor || style.labelColor,
                            labelAlign: currentStyle.labelAlign || style.labelAlign,
                            labelAnchor: currentStyle.labelAnchor || style.labelAnchor,
                            labelFontSize: fontSize
                        };
                    if (options) {
                        if (!('center' in options)) {
                            var center = gmxAPIutils.getItemCenter(item, gmx.dataManager.getItemMembers(item.id));
                            if (!center) { continue; }
                            options.center = center;
                        }
                        if (options.label) {
                            width = options.label.width;
                            arrTxtWidth = options.label.arrTxtWidth;
                            var pstyle = options.label.style;
                            changed = options.label.txt !== txt ||
                                pstyle.labelHaloColor !== labelStyle.labelHaloColor ||
                                pstyle.labelColor !== labelStyle.labelColor ||
                                pstyle.labelAlign !== labelStyle.labelAlign ||
                                pstyle.labelAnchor !== labelStyle.labelAnchor ||
                                pstyle.labelFontSize !== labelStyle.labelFontSize;
                        }
                    }
                    if (changed) {
						width = 0;
                        arrTxtWidth = gmxAPIutils.getLabelWidth(txt, labelStyle);
						if (arrTxtWidth) {
						    arrTxtWidth.forEach(function(it) {
								width = Math.max(width, it[1]);
							});
						}

                        if (!width) {
                            delete labels[id];
                            continue;
                        }
                        width += 4;
                        item.options.labelStyle = null;
                    }
                    options.label = {
                        isPoint: isPoint,
                        width: width,
                        sx: style.sx || 0,
                        txt: txt,
                        arrTxtWidth: arrTxtWidth,
                        style: labelStyle
                    };
                    labels[id] = item;
                }
            }
            _this._labelsIndex[layerId] = layer.options.zIndex;
            _this._labels[layerId] = labels;
        };

        var addObserver = function (layer, id) {
            var gmx = layer._gmx,
                filters = ['clipFilter', 'clipPointsFilter', 'styleFilter', 'userFilter'],
                options = {
                    type: 'resend',
                    bbox: _this.bbox,
                    filters: filters,
                    callback: function(data) {
                        chkData(data, layer);
                        _this.redraw();
                    }
                };
            if (gmx.beginDate && gmx.endDate) {
                options.dateInterval = [gmx.beginDate, gmx.endDate];
            }
            return gmx.dataManager.addObserver(options, '_Labels_' + id);
        };
        this.add = function (layer) {
            var id = layer._leaflet_id,
                gmx = layer._gmx;

            if (!_this._observers[id] && gmx && gmx.labelsLayer && id) {
                gmx.styleManager.promise.then(function () {
                    var observer = addObserver(layer, id),
						_zoom = _this._map._zoom;
                    if (layer.options.isGeneralized) {
                        observer.targetZoom = _zoom;	//need update to current zoom
                    }
                    if (observer.dateInterval) {
                        layer.on('dateIntervalChanged', function(ev) {
							var dInterval = ev.target.getDateInterval();
							this.setDateInterval(dInterval.beginDate, dInterval.endDate);
						}, observer);
                    }
                    if (!gmx.styleManager.isVisibleAtZoom(_zoom)) {
                        observer.deactivate();
                    }
                    _this._observers[id] = observer;
                    _this._styleManagers[id] = gmx.styleManager;

                    _this._labels['_' + id] = {};
					_this._labelsIndex['_' + id] = {};

                    _this._updateBbox();
                });
            }
        };
        this.remove = function (layer) {
            var id = layer._leaflet_id;
            if (_this._observers[id]) {
                var gmx = layer._gmx,
                    dataManager = gmx.dataManager;
                dataManager.removeObserver(_this._observers[id].id);
                delete _this._observers[id];
                delete _this._styleManagers[id];
                delete _this._labels['_' + id];
                delete _this._labelsIndex['_' + id];
                _this.redraw();
            }
        };
        this._layeradd = function (ev) {
            _this.add(ev.layer);
        };
        this._layerremove = function (ev) {
            _this.remove(ev.layer);
        };
    },

    redraw: function () {
        if (!this._frame && !this._map._animating) {
            this._frame = L.Util.requestAnimFrame(this._redraw, this);
        }
        return this;
    },

    _addToPane: function () {
        var pane = this._map.getPanes()[this.options.pane];
        if (pane) {
            pane.insertBefore(this._canvas, pane.firstChild);
        }
    },

    onAdd: function (map) {
        this._map = map;

        if (!this._canvas) {
            this._initCanvas();
        }
		var arr = window.location.search.match('labels=([^&]+)');
		if (arr) {
			this.options.labels = arr[1];
		}

        // this._addToPane();
        map.on({
            moveend: this._reset,
            zoomstart: this._hideMe,
            layeradd: this._layeradd,
            layerremove: this._layerremove
        }, this);

        this._reset();
    },

    _hideMe: function () {
		this._canvas.style.visibility = 'hidden';
    },

    onRemove: function (map) {
        if (this._canvas.parentNode) {
            this._canvas.parentNode.removeChild(this._canvas);
        }

        map.off({
            moveend: this._reset,
            zoomstart: this._hideMe,
            layeradd: this._layeradd,
            layerremove: this._layerremove
        }, this);
    },

    addTo: function (map) {
        map.addLayer(this);
        return this;
    },

    _initCanvas: function () {
        var canvas = L.DomUtil.create('canvas', 'leaflet-labels-layer leaflet-layer leaflet-zoom-hide'),
            size = this._map.getSize();
        canvas.width  = size.x; canvas.height = size.y;
        canvas.style.pointerEvents = 'none';
        this._canvas = canvas;
    },

    _updateBbox: function () {
        var _map = this._map,
            screenBounds = _map.getBounds(),
            southWest = screenBounds.getSouthWest(),
            northEast = screenBounds.getNorthEast(),
			crs = _map.options.srs == 3857 ? L.CRS.EPSG3857 : L.Projection.Mercator,
            m1 = crs.project(southWest),	// предполагаем что все слои в одной проекции
            m2 = crs.project(northEast),
			_zoom = _map.getZoom();

        this.mInPixel = gmxAPIutils.getPixelScale(_zoom);
        this._ctxShift = [m1.x * this.mInPixel, m2.y * this.mInPixel];
        for (var id in this._observers) {
			var observer = this._observers[id];
			if (observer.targetZoom) {
				observer.targetZoom = _zoom;
			}
            observer.setBounds({
                min: {x: southWest.lng, y: southWest.lat},
                max: {x: northEast.lng, y: northEast.lat}
            });
        }
    },

    _reset: function () {
        this._updateBbox();
        for (var id in this._observers) {
            var observer = this._observers[id];
            if (!observer.isActive() &&
                this._styleManagers[id].isVisibleAtZoom(this._map.getZoom())
            ) {
                observer.activate();
            }
            observer.fire('update');
        }
		setTimeout(function() {
			this._canvas.style.visibility = '';
		}.bind(this), 200);
    },

    _redraw: function () {
        var out = [],
            _map = this._map,
            mapSize = _map.getSize(),
            _canvas = this._canvas,
            chkIntersects = this.options.labels,
            offset = _map.latLngToContainerPoint(_map.getBounds().getNorthWest()),
            topLeft = _map.containerPointToLayerPoint(offset);

		_canvas.width = mapSize.x; _canvas.height = mapSize.y;
        L.DomUtil.setPosition(_canvas, topLeft);

        var w2 = 2 * this.mInPixel * gmxAPIutils.worldWidthMerc,
            start = w2 * Math.floor(_map.getPixelBounds().min.x / w2),
            ctx = _canvas.getContext('2d'),
			arr = Object.keys(this._labels).sort(function(a ,b) { return this._labelsIndex[b] - this._labelsIndex[a]; }.bind(this)),
            i, len, it;

        arr.forEach(function(layerId) {
            var labels = this._labels[layerId];
            for (var id in labels) {
                it = labels[id];
                var options = it.options,
                    label = options.label,
                    style = label.style,
					labelAlign = style.labelAlign || 'center',
                    arrTxtWidth = label.arrTxtWidth,
					count = arrTxtWidth.length || 1,
                    width = label.width,
                    width2 = width / 2,
                    labelFontFamily = style.labelFontFamily || 'Arial',
                    size = style.labelFontSize || 12,
                    size2 = size / 2,
                    center = options.center,
                    pos = [center[0] * this.mInPixel, center[1] * this.mInPixel],
                    isFiltered = false;

                if (label.isPoint) {
                    var delta = label.sx;
                    if (labelAlign === 'left') {
                        pos[0] += width2 + delta;
                    } else if (labelAlign === 'right') {
                        pos[0] -= width + delta;
                    }
                }
                pos[0] -= width2 + this._ctxShift[0];
                pos[1] = -size2 - pos[1] + this._ctxShift[1];
				size2 *= count;
                if (style.labelAnchor) {
                    pos[0] += style.labelAnchor[0];
                    pos[1] += style.labelAnchor[1];
                }

                for (var tx = pos[0] + start; tx < mapSize.x; tx += w2) {
                    var coord = [Math.floor(tx), Math.floor(pos[1])],
                        bbox = gmxAPIutils.bounds([
                            [coord[0], coord[1] - size2],
                            [coord[0] + width, coord[1] + size2]
                        ]);
					if (chkIntersects !== 'All') {
						for (i = 0, len = out.length; i < len; i++) {
							if (bbox.intersects(out[i].bbox)) {
								isFiltered = true;
								break;
							}
						}
						if (isFiltered) { continue; }
					}

                    if (!options.labelStyle) {
                        options.labelStyle = {
                            font: size + 'px "' + labelFontFamily + '"',
                            //font: size + 'px "Arial"',
                            fillStyle: gmxAPIutils.dec2color(style.labelColor || 0, 1),
                            shadowBlur: 4
                        };
                        if (style.labelHaloColor !== -1) {
                            options.labelStyle.strokeStyle =
                            options.labelStyle.shadowColor =
                                gmxAPIutils.dec2color(style.labelHaloColor, 1);
                        }
                    }
                    out.push({
                        arr: it.properties,
                        bbox: bbox,
                        arrTxtWidth: arrTxtWidth,
                        width2: labelAlign === 'center' ? width2 : 0,
                        txt: label.txt,
                        style: options.labelStyle,
                        size: size,
                        coord: coord
                    });
                }
            }
		}.bind(this));

        if (out.length) {
            ctx.clearRect(0, 0, _canvas.width, _canvas.height);
            for (i = 0, len = out.length; i < len; i++) {
                it = out[i];
				it.arrTxtWidth.forEach(function(pt, nm) {
					var coord = [it.coord[0], it.coord[1] + (nm + 1) * it.size];
					gmxAPIutils.setLabel(ctx, pt[0], coord, it.style);
				});
            }
            if (!_canvas.parentNode) { this._addToPane(); }
        } else if (_canvas.parentNode) {
            _canvas.parentNode.removeChild(_canvas);
        }

        this._frame = null;
    },
    _animateZoom: function (e) {
		var scale = this._map.getZoomScale(e.zoom),
		    offset = this._map._latLngBoundsToNewLayerBounds(this._map.getBounds(), e.zoom, e.center).min;
		L.DomUtil.setTransform(this._canvas, offset, scale);
    }
});

L.labelsLayer = function (map, options) {
    return new L.LabelsLayer(map, options);
};

L.Map.addInitHook(function () {
	// Check to see if Labels has already been initialized.
    if (!this._labelsLayer) {
        this._labelsLayer = new L.LabelsLayer(this, this.options);
        this._labelsLayer.addTo(this);
    }
});


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


L.gmx.gmxImageTransform = function(img, hash) {
    var gmx = hash.gmx,
        topLeft = hash.topLeft,
		mInPixel = topLeft.mInPixel,
        gmxTilePoint = hash.gmxTilePoint,
        geoItem = hash.geoItem,
        properties = geoItem.properties,
        dataOption = geoItem.dataOption || {},
        // geom = properties[properties.length - 1],
        // coord = geom.coordinates[0],
        indexes = gmx.tileAttributeIndexes,
        quicklookPlatform = properties[indexes[gmx.quicklookPlatform]] || gmx.quicklookPlatform || '',
        points = {};

    // if (geom.type === 'MULTIPOLYGON') { coord = coord[0]; }
    if (quicklookPlatform === 'LANDSAT8') {
        points.x1 = dataOption.bounds.min.x; points.y1 = dataOption.bounds.max.y;
        points.x2 = dataOption.bounds.max.x; points.y2 = dataOption.bounds.max.y;
        points.x3 = dataOption.bounds.max.x; points.y3 = dataOption.bounds.min.y;
        points.x4 = dataOption.bounds.min.x; points.y4 = dataOption.bounds.min.y;
    } else {
        points = gmxAPIutils.getQuicklookPointsFromProperties(properties, gmx);
    }

    var x1 = mInPixel * points.x1, y1 = mInPixel * points.y1,
        x2 = mInPixel * points.x2, y2 = mInPixel * points.y2,
        x3 = mInPixel * points.x3, y3 = mInPixel * points.y3,
        x4 = mInPixel * points.x4, y4 = mInPixel * points.y4,
        boundsP = gmxAPIutils.bounds([[x1, y1], [x2, y2], [x3, y3], [x4, y4]]),
        ww = Math.round(boundsP.max.x - boundsP.min.x),
        hh = Math.round(boundsP.max.y - boundsP.min.y),
        dy = 256 - boundsP.max.y + 256 * gmxTilePoint.y,
        itbounds = geoItem.item.bounds,
        wMerc = Number(gmxAPIutils.worldWidthMerc.toFixed(2)),
        tpx = gmxTilePoint.x;

    if (tpx < 0 && itbounds.max.x >= wMerc && itbounds.min.x <= -wMerc) {	// For points intersects 180 deg
		tpx += Math.round(wMerc * mInPixel / 128);
	}
	var dx = boundsP.min.x - 256 * tpx;

    x1 -= boundsP.min.x; y1 = boundsP.max.y - y1;
    x2 -= boundsP.min.x; y2 = boundsP.max.y - y2;
    x3 -= boundsP.min.x; y3 = boundsP.max.y - y3;
    x4 -= boundsP.min.x; y4 = boundsP.max.y - y4;

    var shiftPoints = [[x1, y1], [x2, y2], [x3, y3], [x4, y4]];

    if (!gmx.ProjectiveImage) {
        gmx.ProjectiveImage = (gmx.useWebGL ? L.gmx.projectiveImageWebGL() : null) || L.gmx.projectiveImage();
    }
    var pt = gmx.ProjectiveImage.getCanvas({
        imageObj: img,
        points: shiftPoints,
        wView: ww,
        hView: hh,
        deltaX: dx,
        deltaY: dy
    });
    return pt.canvas;
};


(function() {
var ProjectiveImageWebGL = L.Class.extend({
    options: {
        antialias: true,
        depth: false,
        preserveDrawingBuffer: true,
        shaderVS: 'attribute vec2 aVertCoord;\
            uniform mat4 uTransformMatrix;\
            varying vec2 vTextureCoord;\
            void main(void) {\
                vTextureCoord = aVertCoord;\
                gl_Position = uTransformMatrix * vec4(aVertCoord, 0.0, 1.0);\
            }\
        ',
        shaderFS: 'precision mediump float;\
            varying vec2 vTextureCoord;\
            uniform sampler2D uSampler;\
            void main(void) {\
                gl_FragColor = texture2D(uSampler, vTextureCoord);\
            }\
        '
    },

    setOptions: function(options) {
        L.setOptions(this, options);
    },

    initialize: function(options) {
        this.setOptions(options);

        var canvas = document.createElement('canvas'),
            glOpts = {
                antialias: this.options.antialias,
                depth: this.options.depth,
                preserveDrawingBuffer: this.options.preserveDrawingBuffer
            },
            gl = canvas.getContext('webgl', glOpts) || canvas.getContext('experimental-webgl', glOpts);
        if (!gl) { return; }
        var glResources = this._setupGlContext(gl);
        if (!glResources) { return; }

        canvas.width = canvas.height = 256;
        glResources.canvas = canvas;

        this.glResources = glResources;
        this.canvas = canvas;
        this.gl = gl;
    },

    _getShader: function (type, source, gl) {
        var shader = gl.createShader(type);

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    },

    _setupGlContext: function (gl) {
        // Store return values here
        var vertexShader = this._getShader(gl.VERTEX_SHADER, this.options.shaderVS, gl),
            fragmentShader = this._getShader(gl.FRAGMENT_SHADER, this.options.shaderFS, gl);

        if (vertexShader && fragmentShader) {
            // Compile the program
            var shaderProgram = gl.createProgram();
            gl.attachShader(shaderProgram, vertexShader);
            gl.attachShader(shaderProgram, fragmentShader);
            gl.linkProgram(shaderProgram);

            if (gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
                // Find and set up the uniforms and attributes
                gl.useProgram(shaderProgram);
                this.vertices = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
                var vertexBuffer = gl.createBuffer(),    // Create a buffer to hold the vertices
                    vertAttrib = gl.getAttribLocation(shaderProgram, 'aVertCoord');
                gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);

                // draw the triangles
                gl.enableVertexAttribArray(vertAttrib);
                gl.vertexAttribPointer(vertAttrib, 2, gl.FLOAT, false, 0, 0);
                return {
                    transMatUniform: gl.getUniformLocation(shaderProgram, 'uTransformMatrix'),
                    samplerUniform: gl.getUniformLocation(shaderProgram, 'uSampler'),
                    screenTexture: gl.createTexture() // Create a texture to use for the screen image
                };
            }
        }
        return null;
    },

    _bindTexture: function (gl, image, texture) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

        // gl.NEAREST is also allowed, instead of gl.LINEAR, as neither mipmap.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        // Prevents s-coordinate wrapping (repeating).
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        // Prevents t-coordinate wrapping (repeating).
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
    },

    getCanvas: function (attr) {
        var p = attr.points,
            deltaX = attr.deltaX,
            deltaY = attr.deltaY,
            dstPoints = new Float32Array([
                (p[0][0] + deltaX) / 128 - 1, 1 - (p[0][1] + deltaY) / 128,
                (p[1][0] + deltaX) / 128 - 1, 1 - (p[1][1] + deltaY) / 128,
                (p[3][0] + deltaX) / 128 - 1, 1 - (p[3][1] + deltaY) / 128,
                (p[2][0] + deltaX) / 128 - 1, 1 - (p[2][1] + deltaY) / 128
            ]);

        var v = ProjectiveImageWebGL.Utils.general2DProjection(this.vertices, dstPoints),
            gl = this.gl,
            glResources = this.glResources;

        this._bindTexture(gl, attr.imageObj, glResources.screenTexture);

        gl.viewport(0, 0, 256, 256);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);    // set background to full transparency

        gl.uniformMatrix4fv(
            glResources.transMatUniform,
            false, [
                v[0], v[3],    0, v[6],
                v[1], v[4],    0, v[7],
                   0,    0,    1,    0,
                v[2], v[5],    0,    1
            ]);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, glResources.screenTexture);
        gl.uniform1i(glResources.samplerUniform, 0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return this;
    }
});

function adj(m) { // Compute the adjugate of m
    return [
        m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
        m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
        m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]
    ];
}

function multmm(a, b) { // multiply two matrices
    var c = Array(9);
    for (var i = 0; i !== 3; ++i) {
        for (var j = 0; j !== 3; ++j) {
            var cij = 0;
            for (var k = 0; k !== 3; ++k) {
                cij += a[3 * i + k] * b[3 * k + j];
            }
            c[3 * i + j] = cij;
        }
    }
    return c;
}

function multmv(m, v) { // multiply matrix and vector
    return [
        m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
        m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
        m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
    ];
}

function basisToPoints(p) {
    var m = [
        p[0], p[2], p[4],
        p[1], p[3], p[5],
        1,  1,  1
    ];
    var v = multmv(adj(m), [p[6], p[7], 1]);
    return multmm(m, [
        v[0], 0, 0,
        0, v[1], 0,
        0, 0, v[2]
    ]);
}

ProjectiveImageWebGL.Utils = {
    general2DProjection: function(from, to) {
        var arr = multmm(basisToPoints(to), adj(basisToPoints(from)));
        if (arr[8]) {
            for (var i = 0; i !== 9; ++i) {
                arr[i] = arr[i] / arr[8];
            }
        }
        return arr;
    },

    getWebGlResources: function(options) {
        var obj = new ProjectiveImageWebGL(options);
        return obj.gl ? obj : null;
    }
};
L.gmx.projectiveImageWebGL = function(options) {
    var res = new ProjectiveImageWebGL(options);
    return res.gl ? res : null;
};
})();


(function() {
// ProjectiveImage - projective transform that maps [0,1]x[0,1] onto the given set of points.
var ProjectiveImage = function() {
	var cnt = 0,
        limit = 4,
        patchSize = 64,
        transform = null;

	var allocate = function (w, h) {
	  var values = [];
	  for (var i = 0; i < h; ++i) {
		values[i] = [];
		for (var j = 0; j < w; ++j) {
		  values[i][j] = 0;
		}
	  }
	  return values;
	};

	var Matrix = function (w, h, values) {
	  this.w = w;
	  this.h = h;
	  this.values = values || allocate(h);
	};

	var cloneValues = function (values) {
		var clone = [];
		for (var i = 0; i < values.length; ++i) {
			clone[i] = [].concat(values[i]);
		}
		return clone;
	};

	Matrix.prototype = {
		add : function (operand) {
			if (operand.w !== this.w || operand.h !== this.h) {
				throw new Error('Matrix add size mismatch');
			}

			var values = allocate(this.w, this.h);
			for (var y = 0; y < this.h; ++y) {
				for (var x = 0; x < this.w; ++x) {
				  values[y][x] = this.values[y][x] + operand.values[y][x];
				}
			}
			return new Matrix(this.w, this.h, values);
		},
		transformProjectiveVector : function (operand) {
			var out = [], x, y;
			for (y = 0; y < this.h; ++y) {
				out[y] = 0;
				for (x = 0; x < this.w; ++x) {
					out[y] += this.values[y][x] * operand[x];
				}
			}
			var zn = out[out.length - 1];
			if (zn) {
				var iz = 1 / (out[out.length - 1]);
				for (y = 0; y < this.h; ++y) {
					out[y] *= iz;
				}
			}
			return out;
		},
		multiply : function (operand) {
			var values, x, y;
			if (+operand !== operand) {
				// Matrix mult
				if (operand.h !== this.w) {
					throw new Error('Matrix mult size mismatch');
				}
				values = allocate(this.w, this.h);
				for (y = 0; y < this.h; ++y) {
					for (x = 0; x < operand.w; ++x) {
						var accum = 0;
						for (var s = 0; s < this.w; s++) {
							accum += this.values[y][s] * operand.values[s][x];
						}
						values[y][x] = accum;
					}
				}
				return new Matrix(operand.w, this.h, values);
			}
			else {
				// Scalar mult
				values = allocate(this.w, this.h);
				for (y = 0; y < this.h; ++y) {
					for (x = 0; x < this.w; ++x) {
						values[y][x] = this.values[y][x] * operand;
					}
				}
				return new Matrix(this.w, this.h, values);
			}
		},
		rowEchelon : function () {
			if (this.w <= this.h) {
				throw new Error('Matrix rowEchelon size mismatch');
			}

			var temp = cloneValues(this.values);

			// Do Gauss-Jordan algorithm.
			for (var yp = 0; yp < this.h; ++yp) {
				// Look up pivot value.
				var pivot = temp[yp][yp];
				while (pivot === 0) {
					// If pivot is zero, find non-zero pivot below.
					for (var ys = yp + 1; ys < this.h; ++ys) {
						if (temp[ys][yp] !== 0) {
							// Swap rows.
							var tmpRow = temp[ys];
							temp[ys] = temp[yp];
							temp[yp] = tmpRow;
							break;
						}
					}
					if (ys === this.h) {
						// No suitable pivot found. Abort.
						return new Matrix(this.w, this.h, temp);
					}
					else {
						pivot = temp[yp][yp];
					}
				}
				// Normalize this row.
				var scale = 1 / pivot;
				for (var x = yp; x < this.w; ++x) {
					temp[yp][x] *= scale;
				}
				// Subtract this row from all other rows (scaled).
				for (var y = 0; y < this.h; ++y) {
					if (y === yp) { continue; }
					var factor = temp[y][yp];
					temp[y][yp] = 0;
					for (x = yp + 1; x < this.w; ++x) {
						temp[y][x] -= factor * temp[yp][x];
					}
				}
			}

			return new Matrix(this.w, this.h, temp);
		},
		invert : function () {
			var x, y;

			if (this.w !== this.h) {
				throw new Error('Matrix invert size mismatch');
			}

			var temp = allocate(this.w * 2, this.h);

			// Initialize augmented matrix
			for (y = 0; y < this.h; ++y) {
				for (x = 0; x < this.w; ++x) {
					temp[y][x] = this.values[y][x];
					temp[y][x + this.w] = (x === y) ? 1 : 0;
				}
			}

			temp = new Matrix(this.w * 2, this.h, temp);
			temp = temp.rowEchelon();

			// Extract right block matrix.
			var values = allocate(this.w, this.h);
			for (y = 0; y < this.w; ++y) {
				// @todo check if "x < this.w;" is mistake
				for (x = 0; x < this.w; ++x) {
					values[y][x] = temp.values[y][x + this.w];
				}
			}
			return new Matrix(this.w, this.h, values);
		}
	};

	var getProjectiveTransform = function (points) {
	  var eqMatrix = new Matrix(9, 8, [
		[1, 1, 1,   0, 0, 0, -points[2][0], -points[2][0], -points[2][0]],
		[0, 1, 1,   0, 0, 0,  0, -points[3][0], -points[3][0]],
		[1, 0, 1,   0, 0, 0, -points[1][0], 0, -points[1][0]],
		[0, 0, 1,   0, 0, 0,  0, 0, -points[0][0]],

		[0, 0, 0,  -1, -1, -1,  points[2][1], points[2][1], points[2][1]],
		[0, 0, 0,   0, -1, -1,  0, points[3][1], points[3][1]],
		[0, 0, 0,  -1,  0, -1,  points[1][1], 0, points[1][1]],
		[0, 0, 0,   0,  0, -1,  0, 0, points[0][1]]

	  ]);

	  var kernel = eqMatrix.rowEchelon().values;
	  var transform = new Matrix(3, 3, [
		[-kernel[0][8], -kernel[1][8], -kernel[2][8]],
		[-kernel[3][8], -kernel[4][8], -kernel[5][8]],
		[-kernel[6][8], -kernel[7][8],             1]
	  ]);
	  return transform;
	};

	var divide = function (u1, v1, u4, v4, p1, p2, p3, p4, limit, attr) {
		if (limit) {
			// Measure patch non-affinity.
			var d1 = [p2[0] + p3[0] - 2 * p1[0], p2[1] + p3[1] - 2 * p1[1]];
			var d2 = [p2[0] + p3[0] - 2 * p4[0], p2[1] + p3[1] - 2 * p4[1]];
			var d3 = [d1[0] + d2[0], d1[1] + d2[1]];
			var r = Math.abs((d3[0] * d3[0] + d3[1] * d3[1]) / (d1[0] * d2[0] + d1[1] * d2[1]));

			// Measure patch area.
			d1 = [p2[0] - p1[0] + p4[0] - p3[0], p2[1] - p1[1] + p4[1] - p3[1]];
			d2 = [p3[0] - p1[0] + p4[0] - p2[0], p3[1] - p1[1] + p4[1] - p2[1]];
			var area = Math.abs(d1[0] * d2[1] - d1[1] * d2[0]);

			// Check area > patchSize pixels (note factor 4 due to not averaging d1 and d2)
			// The non-affinity measure is used as a correction factor.
			if ((u1 === 0 && u4 === 1) || ((.25 + r * 5) * area > (patchSize * patchSize))) {
				// Calculate subdivision points (middle, top, bottom, left, right).
				var umid = (u1 + u4) / 2;
				var vmid = (v1 + v4) / 2;
				var pmid = transform.transformProjectiveVector([umid, vmid, 1]);
				var pt   = transform.transformProjectiveVector([umid, v1, 1]);
				var pb   = transform.transformProjectiveVector([umid, v4, 1]);
				var pl   = transform.transformProjectiveVector([u1, vmid, 1]);
				var pr   = transform.transformProjectiveVector([u4, vmid, 1]);

				// Subdivide.
				limit--;
				divide.call(this, u1,   v1, umid, vmid,   p1,   pt,   pl, pmid, limit, attr);
				divide.call(this, umid,   v1,   u4, vmid,   pt,   p2, pmid,   pr, limit, attr);
				divide.call(this, u1,  vmid, umid,   v4,   pl, pmid,   p3,   pb, limit, attr);
				divide.call(this, umid, vmid,   u4,   v4, pmid,   pr,   pb,   p4, limit, attr);
				return;
			}
		}

		var ctx = attr.ctx;

		// Get patch edge vectors.
		var d12 = [p2[0] - p1[0], p2[1] - p1[1]];
		var d24 = [p4[0] - p2[0], p4[1] - p2[1]];
		var d43 = [p3[0] - p4[0], p3[1] - p4[1]];
		var d31 = [p1[0] - p3[0], p1[1] - p3[1]];

		// Find the corner that encloses the most area
		var a1 = Math.abs(d12[0] * d31[1] - d12[1] * d31[0]);
		var a2 = Math.abs(d24[0] * d12[1] - d24[1] * d12[0]);
		var a4 = Math.abs(d43[0] * d24[1] - d43[1] * d24[0]);
		var a3 = Math.abs(d31[0] * d43[1] - d31[1] * d43[0]);
		var amax = Math.max(Math.max(a1, a2), Math.max(a3, a4));
		var dx = 0, dy = 0, padx = 0, pady = 0;

		// Align the transform along this corner.
		// Calculate 1.05 pixel padding on vector basis.
		if (amax === a1) {
				ctx.setTransform(d12[0], d12[1], -d31[0], -d31[1], p1[0] + attr.deltaX, p1[1] + attr.deltaY);
				if (u4 !== 1) { padx = 1.05 / Math.sqrt(d12[0] * d12[0] + d12[1] * d12[1]); }
				if (v4 !== 1) { pady = 1.05 / Math.sqrt(d31[0] * d31[0] + d31[1] * d31[1]); }
		} else if (amax === a2) {
				ctx.setTransform(d12[0], d12[1],  d24[0],  d24[1], p2[0] + attr.deltaX, p2[1] + attr.deltaY);
				if (u4 !== 1) { padx = 1.05 / Math.sqrt(d12[0] * d12[0] + d12[1] * d12[1]); }
				if (v4 !== 1) { pady = 1.05 / Math.sqrt(d24[0] * d24[0] + d24[1] * d24[1]); }
				dx = -1;
		} else if (amax === a4) {
				ctx.setTransform(-d43[0], -d43[1], d24[0], d24[1], p4[0] + attr.deltaX, p4[1] + attr.deltaY);
				if (u4 !== 1) { padx = 1.05 / Math.sqrt(d43[0] * d43[0] + d43[1] * d43[1]); }
				if (v4 !== 1) { pady = 1.05 / Math.sqrt(d24[0] * d24[0] + d24[1] * d24[1]); }
				dx = -1;
				dy = -1;
		} else if (amax === a3) {
				ctx.setTransform(-d43[0], -d43[1], -d31[0], -d31[1], p3[0] + attr.deltaX, p3[1] + attr.deltaY);
				if (u4 !== 1) { padx = 1.05 / Math.sqrt(d43[0] * d43[0] + d43[1] * d43[1]); }
				if (v4 !== 1) { pady = 1.05 / Math.sqrt(d31[0] * d31[0] + d31[1] * d31[1]); }
				dy = -1;
		}

		// Calculate image padding to match.
		var du = (u4 - u1);
		var dv = (v4 - v1);
		padx++;
		pady++;

        var iw = attr.imageObj.width,
            ih = attr.imageObj.height,
            sx = Math.floor(u1 * iw),
            sy = Math.floor(v1 * ih),
            sw = Math.floor(Math.min(padx * du, 1) * iw),
            sh = Math.floor(Math.min(pady * dv, 1) * ih);

		cnt++;
        ctx.drawImage(
            attr.imageObj,
            sx, sy,
            sw, sh,
            dx, dy,
            padx, pady
        );
	};

	this.getCanvas = function (attr) {
		cnt = 0;
		transform = getProjectiveTransform(attr.points);
		// Begin subdivision process.

		var ptl = transform.transformProjectiveVector([0, 0, 1]),
            ptr = transform.transformProjectiveVector([1, 0, 1]),
            pbl = transform.transformProjectiveVector([0, 1, 1]),
            pbr = transform.transformProjectiveVector([1, 1, 1]);

		var canvas = document.createElement('canvas');
		canvas.width = canvas.height = 256;
		attr.canvas = canvas;
		attr.ctx = canvas.getContext('2d');

		var	boundsP = gmxAPIutils.bounds([ptl, ptr, pbr, pbl]),
            maxSize = Math.max(boundsP.max.x - boundsP.min.x, boundsP.max.y - boundsP.min.y);

		limit = 'limit' in attr ? attr.limit : (maxSize < 200 ? 1 : 4);
		patchSize = 'patchSize' in attr ? attr.patchSize : maxSize / 8;

		try {
			divide(0, 0, 1, 1, ptl, ptr, pbl, pbr, limit, attr);
		} catch (e) {
			console.log('Error: ProjectiveImage event:', e);
			canvas = null;
		}
		return {
			canvas: canvas,
			ptl: ptl,
			ptr: ptr,
			pbl: pbl,
			pbr: pbr,
			cnt: cnt
		};
	};
};
L.gmx.projectiveImage = function() {
    return new ProjectiveImage();
};
})();


// https://github.com/bbecquet/Leaflet.PolylineDecorator/blob/master/src/L.RotatedMarker.js

L.RotatedMarker = L.Marker.extend({
    options: {
        angle: 0
    },

    statics: {
        TRANSFORM_ORIGIN: L.DomUtil.testProp(
            ['transformOrigin', 'WebkitTransformOrigin', 'OTransformOrigin', 'MozTransformOrigin', 'msTransformOrigin'])
    },

    _initIcon: function() {
        L.Marker.prototype._initIcon.call(this);

        this._icon.style[L.RotatedMarker.TRANSFORM_ORIGIN] = this._getTransformOrigin();
    },

    _getTransformOrigin: function() {
        var iconAnchor = this.options.icon.options.iconAnchor;

        if (!iconAnchor) {
            return '50% 50%';
        }

        return iconAnchor[0] + 'px ' + iconAnchor[1] + 'px';
    },

    _setPos: function(pos) {
        L.Marker.prototype._setPos.call(this, pos);

        if (L.DomUtil.TRANSFORM) {
            // use the CSS transform rule if available
            this._icon.style[L.DomUtil.TRANSFORM] += ' rotate(' + this.options.angle + 'deg)';
        } else if (L.Browser.ie) {
            // fallback for IE6, IE7, IE8
            var rad = this.options.angle * (Math.PI / 180),
                costheta = Math.cos(rad),
                sintheta = Math.sin(rad);
            this._icon.style.filter += ' progid:DXImageTransform.Microsoft.Matrix(sizingMethod=\'auto expand\', M11=' +
                costheta + ', M12=' + (-sintheta) + ', M21=' + sintheta + ', M22=' + costheta + ')';
        }
    },

    setAngle: function(ang) {
        this.options.angle = ang;
    }
});

L.rotatedMarker = function(pos, options) {
    return new L.RotatedMarker(pos, options);
};


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


(function() {
    'use strict';
    var BindWMS = L.gmx.ExternalLayer.extend({
        options: {
            minZoom: 1,
            maxZoom: 6,
            useDataManager: false,
            format: 'png',
            transparent: true
        },

        createExternalLayer: function () {
            var poptions = this.parentLayer.options,
                opt = {
                    map: poptions.mapID,
                    layers: poptions.layerID,
                    format: this.options.format,
                    transparent: this.options.transparent
                },
                rawProperties = this.parentLayer.getGmxProperties();

            if (rawProperties && rawProperties.Temporal) { this._extendOptionsByDateInterval(opt); }
            if (this.options.apikey) { opt.apikey = this.options.apikey; }
            return L.tileLayer.wms(L.gmxUtil.protocol + '//' + poptions.hostName + '/TileService.ashx', opt);
        },

        _extendOptionsByDateInterval: function (options) {
            var dateInterval = this.parentLayer.getDateInterval(),
                beginDate = dateInterval.beginDate,
                endDate = dateInterval.endDate;
            L.extend(options, {
                StartDate: beginDate && beginDate.toLocaleDateString(),
                EndDate: endDate && endDate.toLocaleDateString()
            });
        },

        setDateInterval: function () {
            this._extendOptionsByDateInterval(this.externalLayer.wmsParams);
            this.externalLayer.redraw();
        },

        isExternalVisible: function (zoom) {
            return !(zoom < this.options.minZoom || zoom > this.options.maxZoom);
        }
    });

    L.gmx.VectorLayer.include({
        bindWMS: function (options) {
            if (this._layerWMS) {
                this._layerWMS.unbindLayer();
            }
            this._layerWMS = new BindWMS(options, this);
            this.isExternalVisible = this._layerWMS.isExternalVisible;
            return this;
        },

        unbindWMS: function () {
            if (this._layerWMS) {
                this._layerWMS.unbindLayer();
                this._layerWMS = null;
                this.isExternalVisible = null;
                this.enablePopup();
            }
            return this;
        }
    });
})();


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
				if (this.parentLayer._balloonHook) {
					for (var key in this.parentLayer._balloonHook) {
						properties[key] = L.gmxUtil.parseTemplate(this.parentLayer._balloonHook[key].resStr, properties);
					}
				}
				var content = L.gmxUtil.parseBalloonTemplate(balloonData.templateBalloon, {
					properties: properties,
					tileAttributeTypes: gmx.tileAttributeTypes,
					unitOptions: this._map.options || {},
					geometries: geometry
				});
				var contentDiv = L.DomUtil.create('div', '');
				contentDiv.innerHTML = content;

                this._popup
                    .setLatLng(latlng)
                    .setContent(contentDiv)
                    .openOn(this._map);

				if (this.parentLayer._balloonHook) {
					this.parentLayer._callBalloonHook(properties, this._popup.getContent());
				}
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


(function () {

'use strict';

function earcut(data, holeIndices, dim) {

    dim = dim || 2;

    var hasHoles = holeIndices && holeIndices.length,
        outerLen = hasHoles ? holeIndices[0] * dim : data.length,
        outerNode = linkedList(data, 0, outerLen, dim, true),
        triangles = [];

    if (!outerNode) return triangles;

    var minX, minY, maxX, maxY, x, y, invSize;

    if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);

    // if the shape is not too simple, we'll use z-order curve hash later; calculate polygon bbox
    if (data.length > 80 * dim) {
        minX = maxX = data[0];
        minY = maxY = data[1];

        for (var i = dim; i < outerLen; i += dim) {
            x = data[i];
            y = data[i + 1];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }

        // minX, minY and invSize are later used to transform coords into integers for z-order calculation
        invSize = Math.max(maxX - minX, maxY - minY);
        invSize = invSize !== 0 ? 1 / invSize : 0;
    }

    earcutLinked(outerNode, triangles, dim, minX, minY, invSize);

    return triangles;
}

// create a circular doubly linked list from polygon points in the specified winding order
function linkedList(data, start, end, dim, clockwise) {
    var i, last;

    if (clockwise === (signedArea(data, start, end, dim) > 0)) {
        for (i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
    } else {
        for (i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
    }

    if (last && equals(last, last.next)) {
        removeNode(last);
        last = last.next;
    }

    return last;
}

// eliminate colinear or duplicate points
function filterPoints(start, end) {
    if (!start) return start;
    if (!end) end = start;

    var p = start,
        again;
    do {
        again = false;

        if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
            removeNode(p);
            p = end = p.prev;
            if (p === p.next) break;
            again = true;

        } else {
            p = p.next;
        }
    } while (again || p !== end);

    return end;
}

// main ear slicing loop which triangulates a polygon (given as a linked list)
function earcutLinked(ear, triangles, dim, minX, minY, invSize, pass) {
    if (!ear) return;

    // interlink polygon nodes in z-order
    if (!pass && invSize) indexCurve(ear, minX, minY, invSize);

    var stop = ear,
        prev, next;

    // iterate through ears, slicing them one by one
    while (ear.prev !== ear.next) {
        prev = ear.prev;
        next = ear.next;

        if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
            // cut off the triangle
            triangles.push(prev.i / dim);
            triangles.push(ear.i / dim);
            triangles.push(next.i / dim);

            removeNode(ear);

            // skipping the next vertice leads to less sliver triangles
            ear = next.next;
            stop = next.next;

            continue;
        }

        ear = next;

        // if we looped through the whole remaining polygon and can't find any more ears
        if (ear === stop) {
            // try filtering points and slicing again
            if (!pass) {
                earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);

            // if this didn't work, try curing all small self-intersections locally
            } else if (pass === 1) {
                ear = cureLocalIntersections(ear, triangles, dim);
                earcutLinked(ear, triangles, dim, minX, minY, invSize, 2);

            // as a last resort, try splitting the remaining polygon into two
            } else if (pass === 2) {
                splitEarcut(ear, triangles, dim, minX, minY, invSize);
            }

            break;
        }
    }
}

// check whether a polygon node forms a valid ear with adjacent nodes
function isEar(ear) {
    var a = ear.prev,
        b = ear,
        c = ear.next;

    if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

    // now make sure we don't have other points inside the potential ear
    var p = ear.next.next;

    while (p !== ear.prev) {
        if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0) return false;
        p = p.next;
    }

    return true;
}

function isEarHashed(ear, minX, minY, invSize) {
    var a = ear.prev,
        b = ear,
        c = ear.next;

    if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

    // triangle bbox; min & max are calculated like this for speed
    var minTX = a.x < b.x ? (a.x < c.x ? a.x : c.x) : (b.x < c.x ? b.x : c.x),
        minTY = a.y < b.y ? (a.y < c.y ? a.y : c.y) : (b.y < c.y ? b.y : c.y),
        maxTX = a.x > b.x ? (a.x > c.x ? a.x : c.x) : (b.x > c.x ? b.x : c.x),
        maxTY = a.y > b.y ? (a.y > c.y ? a.y : c.y) : (b.y > c.y ? b.y : c.y);

    // z-order range for the current triangle bbox;
    var minZ = zOrder(minTX, minTY, minX, minY, invSize),
        maxZ = zOrder(maxTX, maxTY, minX, minY, invSize);

    var p = ear.prevZ,
        n = ear.nextZ;

    // look for points inside the triangle in both directions
    while (p && p.z >= minZ && n && n.z <= maxZ) {
        if (p !== ear.prev && p !== ear.next &&
            pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0) return false;
        p = p.prevZ;

        if (n !== ear.prev && n !== ear.next &&
            pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, n.x, n.y) &&
            area(n.prev, n, n.next) >= 0) return false;
        n = n.nextZ;
    }

    // look for remaining points in decreasing z-order
    while (p && p.z >= minZ) {
        if (p !== ear.prev && p !== ear.next &&
            pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0) return false;
        p = p.prevZ;
    }

    // look for remaining points in increasing z-order
    while (n && n.z <= maxZ) {
        if (n !== ear.prev && n !== ear.next &&
            pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, n.x, n.y) &&
            area(n.prev, n, n.next) >= 0) return false;
        n = n.nextZ;
    }

    return true;
}

// go through all polygon nodes and cure small local self-intersections
function cureLocalIntersections(start, triangles, dim) {
    var p = start;
    do {
        var a = p.prev,
            b = p.next.next;

        if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {

            triangles.push(a.i / dim);
            triangles.push(p.i / dim);
            triangles.push(b.i / dim);

            // remove two nodes involved
            removeNode(p);
            removeNode(p.next);

            p = start = b;
        }
        p = p.next;
    } while (p !== start);

    return p;
}

// try splitting polygon into two and triangulate them independently
function splitEarcut(start, triangles, dim, minX, minY, invSize) {
    // look for a valid diagonal that divides the polygon into two
    var a = start;
    do {
        var b = a.next.next;
        while (b !== a.prev) {
            if (a.i !== b.i && isValidDiagonal(a, b)) {
                // split the polygon in two by the diagonal
                var c = splitPolygon(a, b);

                // filter colinear points around the cuts
                a = filterPoints(a, a.next);
                c = filterPoints(c, c.next);

                // run earcut on each half
                earcutLinked(a, triangles, dim, minX, minY, invSize);
                earcutLinked(c, triangles, dim, minX, minY, invSize);
                return;
            }
            b = b.next;
        }
        a = a.next;
    } while (a !== start);
}

// link every hole into the outer loop, producing a single-ring polygon without holes
function eliminateHoles(data, holeIndices, outerNode, dim) {
    var queue = [],
        i, len, start, end, list;

    for (i = 0, len = holeIndices.length; i < len; i++) {
        start = holeIndices[i] * dim;
        end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
        list = linkedList(data, start, end, dim, false);
        if (list === list.next) list.steiner = true;
        queue.push(getLeftmost(list));
    }

    queue.sort(compareX);

    // process holes from left to right
    for (i = 0; i < queue.length; i++) {
        eliminateHole(queue[i], outerNode);
        outerNode = filterPoints(outerNode, outerNode.next);
    }

    return outerNode;
}

function compareX(a, b) {
    return a.x - b.x;
}

// find a bridge between vertices that connects hole with an outer ring and and link it
function eliminateHole(hole, outerNode) {
    outerNode = findHoleBridge(hole, outerNode);
    if (outerNode) {
        var b = splitPolygon(outerNode, hole);
        filterPoints(b, b.next);
    }
}

// David Eberly's algorithm for finding a bridge between hole and outer polygon
function findHoleBridge(hole, outerNode) {
    var p = outerNode,
        hx = hole.x,
        hy = hole.y,
        qx = -Infinity,
        m;

    // find a segment intersected by a ray from the hole's leftmost point to the left;
    // segment's endpoint with lesser x will be potential connection point
    do {
        if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
            var x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
            if (x <= hx && x > qx) {
                qx = x;
                if (x === hx) {
                    if (hy === p.y) return p;
                    if (hy === p.next.y) return p.next;
                }
                m = p.x < p.next.x ? p : p.next;
            }
        }
        p = p.next;
    } while (p !== outerNode);

    if (!m) return null;

    if (hx === qx) return m.prev; // hole touches outer segment; pick lower endpoint

    // look for points inside the triangle of hole point, segment intersection and endpoint;
    // if there are no points found, we have a valid connection;
    // otherwise choose the point of the minimum angle with the ray as connection point

    var stop = m,
        mx = m.x,
        my = m.y,
        tanMin = Infinity,
        tan;

    p = m.next;

    while (p !== stop) {
        if (hx >= p.x && p.x >= mx && hx !== p.x &&
                pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {

            tan = Math.abs(hy - p.y) / (hx - p.x); // tangential

            if ((tan < tanMin || (tan === tanMin && p.x > m.x)) && locallyInside(p, hole)) {
                m = p;
                tanMin = tan;
            }
        }

        p = p.next;
    }

    return m;
}

// interlink polygon nodes in z-order
function indexCurve(start, minX, minY, invSize) {
    var p = start;
    do {
        if (p.z === null) p.z = zOrder(p.x, p.y, minX, minY, invSize);
        p.prevZ = p.prev;
        p.nextZ = p.next;
        p = p.next;
    } while (p !== start);

    p.prevZ.nextZ = null;
    p.prevZ = null;

    sortLinked(p);
}

// Simon Tatham's linked list merge sort algorithm
// http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
function sortLinked(list) {
    var i, p, q, e, tail, numMerges, pSize, qSize,
        inSize = 1;

    do {
        p = list;
        list = null;
        tail = null;
        numMerges = 0;

        while (p) {
            numMerges++;
            q = p;
            pSize = 0;
            for (i = 0; i < inSize; i++) {
                pSize++;
                q = q.nextZ;
                if (!q) break;
            }
            qSize = inSize;

            while (pSize > 0 || (qSize > 0 && q)) {

                if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
                    e = p;
                    p = p.nextZ;
                    pSize--;
                } else {
                    e = q;
                    q = q.nextZ;
                    qSize--;
                }

                if (tail) tail.nextZ = e;
                else list = e;

                e.prevZ = tail;
                tail = e;
            }

            p = q;
        }

        tail.nextZ = null;
        inSize *= 2;

    } while (numMerges > 1);

    return list;
}

// z-order of a point given coords and inverse of the longer side of data bbox
function zOrder(x, y, minX, minY, invSize) {
    // coords are transformed into non-negative 15-bit integer range
    x = 32767 * (x - minX) * invSize;
    y = 32767 * (y - minY) * invSize;

    x = (x | (x << 8)) & 0x00FF00FF;
    x = (x | (x << 4)) & 0x0F0F0F0F;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;

    y = (y | (y << 8)) & 0x00FF00FF;
    y = (y | (y << 4)) & 0x0F0F0F0F;
    y = (y | (y << 2)) & 0x33333333;
    y = (y | (y << 1)) & 0x55555555;

    return x | (y << 1);
}

// find the leftmost node of a polygon ring
function getLeftmost(start) {
    var p = start,
        leftmost = start;
    do {
        if (p.x < leftmost.x) leftmost = p;
        p = p.next;
    } while (p !== start);

    return leftmost;
}

// check if a point lies within a convex triangle
function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
    return (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 &&
           (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 &&
           (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0;
}

// check if a diagonal between two polygon nodes is valid (lies in polygon interior)
function isValidDiagonal(a, b) {
    return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
           locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b);
}

// signed area of a triangle
function area(p, q, r) {
    return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

// check if two points are equal
function equals(p1, p2) {
    return p1.x === p2.x && p1.y === p2.y;
}

// check if two segments intersect
function intersects(p1, q1, p2, q2) {
    if ((equals(p1, q1) && equals(p2, q2)) ||
        (equals(p1, q2) && equals(p2, q1))) return true;
    return area(p1, q1, p2) > 0 !== area(p1, q1, q2) > 0 &&
           area(p2, q2, p1) > 0 !== area(p2, q2, q1) > 0;
}

// check if a polygon diagonal intersects any polygon segments
function intersectsPolygon(a, b) {
    var p = a;
    do {
        if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i &&
                intersects(p, p.next, a, b)) return true;
        p = p.next;
    } while (p !== a);

    return false;
}

// check if a polygon diagonal is locally inside the polygon
function locallyInside(a, b) {
    return area(a.prev, a, a.next) < 0 ?
        area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 :
        area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

// check if the middle point of a polygon diagonal is inside the polygon
function middleInside(a, b) {
    var p = a,
        inside = false,
        px = (a.x + b.x) / 2,
        py = (a.y + b.y) / 2;
    do {
        if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y &&
                (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x))
            inside = !inside;
        p = p.next;
    } while (p !== a);

    return inside;
}

// link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
// if one belongs to the outer ring and another to a hole, it merges it into a single ring
function splitPolygon(a, b) {
    var a2 = new Node(a.i, a.x, a.y),
        b2 = new Node(b.i, b.x, b.y),
        an = a.next,
        bp = b.prev;

    a.next = b;
    b.prev = a;

    a2.next = an;
    an.prev = a2;

    b2.next = a2;
    a2.prev = b2;

    bp.next = b2;
    b2.prev = bp;

    return b2;
}

// create a node and optionally link it with previous one (in a circular doubly linked list)
function insertNode(i, x, y, last) {
    var p = new Node(i, x, y);

    if (!last) {
        p.prev = p;
        p.next = p;

    } else {
        p.next = last.next;
        p.prev = last;
        last.next.prev = p;
        last.next = p;
    }
    return p;
}

function removeNode(p) {
    p.next.prev = p.prev;
    p.prev.next = p.next;

    if (p.prevZ) p.prevZ.nextZ = p.nextZ;
    if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}

function Node(i, x, y) {
    // vertice index in coordinates array
    this.i = i;

    // vertex coordinates
    this.x = x;
    this.y = y;

    // previous and next vertice nodes in a polygon ring
    this.prev = null;
    this.next = null;

    // z-order curve value
    this.z = null;

    // previous and next nodes in z-order
    this.prevZ = null;
    this.nextZ = null;

    // indicates whether this is a steiner point
    this.steiner = false;
}

// return a percentage difference between the polygon area and its triangulation area;
// used to verify correctness of triangulation
earcut.deviation = function (data, holeIndices, dim, triangles) {
    var hasHoles = holeIndices && holeIndices.length;
    var outerLen = hasHoles ? holeIndices[0] * dim : data.length;

    var polygonArea = Math.abs(signedArea(data, 0, outerLen, dim));
    if (hasHoles) {
        for (var i = 0, len = holeIndices.length; i < len; i++) {
            var start = holeIndices[i] * dim;
            var end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
            polygonArea -= Math.abs(signedArea(data, start, end, dim));
        }
    }

    var trianglesArea = 0;
    for (i = 0; i < triangles.length; i += 3) {
        var a = triangles[i] * dim;
        var b = triangles[i + 1] * dim;
        var c = triangles[i + 2] * dim;
        trianglesArea += Math.abs(
            (data[a] - data[c]) * (data[b + 1] - data[a + 1]) -
            (data[a] - data[b]) * (data[c + 1] - data[a + 1]));
    }

    return polygonArea === 0 && trianglesArea === 0 ? 0 :
        Math.abs((trianglesArea - polygonArea) / polygonArea);
};

function signedArea(data, start, end, dim) {
    var sum = 0;
    for (var i = start, j = end - dim; i < end; i += dim) {
        sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
        j = i;
    }
    return sum;
}

// turn a polygon in a multi-dimensional array form (e.g. as in GeoJSON) into a form Earcut accepts
earcut.flatten = function (data) {
    var dim = data[0][0].length,
        result = {vertices: [], holes: [], dimensions: dim},
        holeIndex = 0;

    for (var i = 0; i < data.length; i++) {
        for (var j = 0; j < data[i].length; j++) {
            for (var d = 0; d < dim; d++) result.vertices.push(data[i][j][d]);
        }
        if (i > 0) {
            holeIndex += data[i - 1].length;
            result.holes.push(holeIndex);
        }
    }
    return result;
};

	L.gmx = L.gmx || {};
	L.gmx.WebGL = L.gmx.WebGL || {};
	L.gmx.WebGL.earcut = earcut;
})();


L.gmx = L.gmx || {};

var DEFAULT_HOSTNAME = 'maps.kosmosnimki.ru';
var DEFAULT_VECTOR_LAYER_ZINDEXOFFSET = 2000000;

//Build in layer classes
L.gmx._layerClasses = {
    'Raster': L.gmx.RasterLayer,
    'Vector': L.gmx.VectorLayer,
    'VectorView': L.gmx.DummyLayer
};

L.gmx._loadingLayerClasses = {};

L.gmx.addLayerClass = function(type, layerClass) {
    L.gmx._layerClasses[type] = layerClass;
};

L.gmx._layerClassLoaders = [];

L.gmx.addLayerClassLoader = function(layerClassLoader) {
    L.gmx._layerClassLoaders.push(layerClassLoader);

    //delete all loading promises to ensure that new loader will be invoked
    L.gmx._loadingLayerClasses = {};
};

L.gmx._loadLayerClass = function(type) {
    if (!L.gmx._loadingLayerClasses[type]) {
		// var promise = new Promise(function(resolve, reject) {
		// }).

		var promise = new L.gmx.Deferred();
        promise.resolve();

        L.gmx._layerClassLoaders.forEach(function(loader) {
            promise = promise.then(function(layerClass) {
                if (layerClass) {
                    L.gmx._layerClasses[type] = layerClass;
                    return layerClass;
                }

                return loader(type);
            },
            function(){
                //just skip loader errors
            });
        });

        promise = promise.then(function(layerClass) {
            if (layerClass) {
                L.gmx._layerClasses[type] = layerClass;
                return layerClass;
            }
        }, function(){
            //just skip loader errors
        });

        L.gmx._loadingLayerClasses[type] = promise;
    }

    return L.gmx._loadingLayerClasses[type];
};

L.gmx.loadLayer = function(mapID, layerID, options) {
    return new Promise(function(resolve, reject) {
        var layerParams = {
            mapID: mapID,
            layerID: layerID
        };

		options = options || {};
		if (!options.skipTiles) { options.skipTiles = 'All'; }

		for (var p in options) {
			layerParams[p] = options[p];
		}

		var hostName = gmxAPIutils.normalizeHostname(options.hostName || DEFAULT_HOSTNAME);
		layerParams.hostName = hostName;

		gmxMapManager.loadMapProperties({
				srs: options.srs || '3857',
				hostName: hostName,
				apiKey: options.apiKey,
				mapName: mapID,
				skipTiles: options.skipTiles
			}).then(function() {
				var layerInfo = gmxMapManager.findLayerInfo(hostName, mapID, layerID);

				if (!layerInfo) {
					reject('There is no layer ' + layerID + ' in map ' + mapID);
					return;
				}

				//to know from what host the layer was loaded
				layerInfo.properties.hostName = hostName;

				var type = layerInfo.properties.ContentID || layerInfo.properties.type;

				var doCreateLayer = function() {
					var layer = L.gmx.createLayer(layerInfo, layerParams);
					if (layer) {
						resolve(layer);
					} else {
						reject('Unknown type of layer ' + layerID);
					}
				};

				if (type in L.gmx._layerClasses) {
					doCreateLayer();
				} else {
					L.gmx._loadLayerClass(type).then(doCreateLayer);
				}
			},
			function(response) {
				reject('Can\'t load layer ' + layerID + ' from map ' + mapID + ': ' + response.error);
			}
		);
	});
};

L.gmx.loadLayers = function(layers, globalOptions) {
	return new Promise(function(resolve) {
		Promise.all(layers.map(function(layerInfo) {
			var options = L.extend({}, globalOptions, layerInfo);
			return L.gmx.loadLayer(layerInfo.mapID, layerInfo.layerID, options);
		}))
		.then(function(res) {
			resolve(res);
		})
	});
};

L.gmx.loadMap = function(mapID, options) {
	if (L.gmxUtil.debug) console.warn('L.gmx.loadMap:', mapID, options);
    options = L.extend({}, options);
    options.hostName = gmxAPIutils.normalizeHostname(options.hostName || DEFAULT_HOSTNAME);
    options.mapName = mapID;

	if (!options.skipTiles) { options.skipTiles = 'All'; }
	if (!options.srs) { options.srs = 3857; }
	if (!options.ftc) { options.ftc = 'osm'; }

    return new Promise(function(resolve, reject) {
		gmxMapManager.loadMapProperties(options).then(function(mapInfo) {
			var mapHash = L.gmx._maps[options.hostName][mapID];
			if (mapHash.loaded) {
				resolve(mapHash.loaded);

			} else {
				var loadedMap = new L.gmx.gmxMap(mapInfo, options);
				mapHash.loaded = loadedMap;

				loadedMap.layersCreated.then(function() {
					if (options.leafletMap || options.setZIndex) {
						var curZIndex = 0,
							visibility = options.visibility,
							layer, rawProperties;

						for (var l = loadedMap.layers.length - 1; l >= 0; l--) {
							layer = loadedMap.layers[l];
							rawProperties = layer.getGmxProperties();
							if (mapInfo.properties.LayerOrder === 'VectorOnTop' && layer.setZIndexOffset && rawProperties.type !== 'Raster') {
								layer.setZIndexOffset(DEFAULT_VECTOR_LAYER_ZINDEXOFFSET);
							}
							if (options.setZIndex && layer.setZIndex) {
								layer.setZIndex(++curZIndex);
							}

							if (options.leafletMap && (visibility ? visibility[rawProperties.name] : rawProperties.visible)) {
								layer.addTo(options.leafletMap);
							}
						}
					}
					resolve(loadedMap);
				});
			}
		},
		function(response) {
			var errorMessage = (response && response.ErrorInfo && response.ErrorInfo.ErrorMessage) || 'Server error';
			reject('Can\'t load map ' + mapID + ' from ' + options.hostName + ': ' + errorMessage);
		})
		.catch(console.log);
    });
};

L.gmx.DummyLayer = function(props) {
    this.onAdd = this.onRemove = function() {};
    this.getGmxProperties = function() { return props; };
};

L.gmx.createLayer = function(layerInfo, options) {
    if (!layerInfo) { layerInfo = {}; }
    if (!layerInfo.properties) { layerInfo.properties = {type: 'Vector'}; }

    var properties = layerInfo.properties,
		type = properties.ContentID || properties.type || 'Vector',
        layer;

    if (!options) { options = properties; }

		if (type in L.gmx._layerClasses) {
        try {
            layer = new L.gmx._layerClasses[type](options || layerInfo.properties);
            layer = layer.initFromDescription(layerInfo);
        } catch (e) {
            layer = new L.gmx.DummyLayer(properties);
        }
    } else {
        layer = new L.gmx.DummyLayer(properties);
    }

    return layer;
};


}());