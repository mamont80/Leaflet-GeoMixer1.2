var gmxVectorTileLoader = {
    _loadedTiles: {},
    _getKey: function(ti) {
        return [ti.layerID, ti.x, ti.y, ti.z, typeof ti.d === 'undefined' ? -1 : ti.d, typeof ti.s === 'undefined' ? -1 : ti.s, ti.v].join(':');
    },
    load: function(tileSenderPrefix, tileInfo) {
        var key = gmxVectorTileLoader._getKey(tileInfo);

        if (!this._loadedTiles[key]) {
            // var def = new L.gmx.Deferred();
            // this._loadedTiles[key] = def;

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

			// gmxAPIutils.requestJSONP(tileSenderPrefix, requestParams, {callbackParamName: null}).then(null, function() {
                // def.reject();
            // });
			var promise = new Promise(function(resolve) {
				var query = tileSenderPrefix + '&' + Object.keys(requestParams).map(function(name) {
					return name + '=' + requestParams[name];
				}).join('&');
				fetch(query)
					.then(function(response) { return response.text(); })
					.then(function(txt) {
						txt = txt.replace('gmxAPI._vectorTileReceiver(', '');
						var data = JSON.parse(txt.substr(0, txt.length -1));
						resolve(data);
						// resolve(data.values, null, data.srs, data.isGeneralized);
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

    gmxVectorTileLoader._loadedTiles[key] && gmxVectorTileLoader._loadedTiles[key].resolve(data.values, data.bbox, data.srs, data.isGeneralized);
};
