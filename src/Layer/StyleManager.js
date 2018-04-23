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
            if (z > st.MaxZoom || z < st.MinZoom
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
            out.iconColor = 'iconColorFunction' in pt ? pt.iconColorFunction(prop, indexes) : pt.iconColor;
        }
        if ('iconScale' in pt) {
            out.iconScale = 'scaleFunction' in pt ? (pt.scaleFunction ? pt.scaleFunction(prop, indexes) : 1) : pt.iconScale;
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
                var iconSize = ('sizeFunction' in pt ? pt.sizeFunction(prop, indexes) : pt.iconSize);
                out.sx = out.sy = iconSize;
                // iconSize += pt.weight ? pt.weight : 0;
                out.iconSize = iconSize;
                if ('iconScale' in pt) {
                    out.iconSize *= pt.iconScale;
                }
                out.maxSize = iconSize;
            }
            out.stroke = true;
            if ('colorFunction' in pt || 'opacityFunction' in pt) {
                color = 'colorFunction' in pt ? pt.colorFunction(prop, indexes) : color;
                opacity = 'opacityFunction' in pt ? pt.opacityFunction(prop, indexes) : opacity;
            }
            out.strokeStyle = gmxAPIutils.dec2color(color, opacity);
            out.lineWidth = 'weight' in pt ? pt.weight : 1;
        }

        if ('iconScale' in pt) {
            out.iconScale = 'scaleFunction' in pt ? (pt.scaleFunction ? pt.scaleFunction(prop, indexes) : 1) : pt.iconScale;
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
                color = ('fillColorFunction' in pt ? pt.fillColorFunction(prop, indexes) : fc || 255);
                opacity = ('fillOpacityFunction' in pt ? pt.fillOpacityFunction(prop, indexes) : fop || 1);
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
StyleManager.DEFAULT_KEYS = ['MinZoom', 'MaxZoom', 'Balloon', 'BalloonEnable', 'DisableBalloonOnMouseMove', 'DisableBalloonOnClick'];
StyleManager.DEFAULT_ICONPATH = [0, 10, 5, -10, -5, -10, 0, 10];  // [TL.x, TL.y, BR.x, BR.y, BL.x, BL.y, TL.x, TL.y]

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