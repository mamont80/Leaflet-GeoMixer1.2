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
    this.bounds = gmxAPIutils.getBoundsByTilePoint(options);
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

        this.state = 'loaded';

        this._resolve(this.data);
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
