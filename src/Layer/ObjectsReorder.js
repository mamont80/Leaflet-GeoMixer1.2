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
                var item = ev.gmx.target.item;
					// id = ev.gmx.id;
                this.addToReorder(item.id, ev.originalEvent.ctrlKey);
                this.layer.redrawItem(item);
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
