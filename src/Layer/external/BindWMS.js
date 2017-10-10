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
