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
        var key = L.gmx.VectorTile.createTileKey(t);

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
                    return L.gmx.VectorTile.boundsFromTileKey(it);
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
