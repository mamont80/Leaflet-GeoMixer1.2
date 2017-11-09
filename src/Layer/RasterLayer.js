//Raster layer is just vector layer with the single object and special background tiles
L.gmx.RasterLayer = L.gmx.VectorLayer.extend(
{
    options: {
        isGeneralized: false,
        zIndexOffset: 0
        //clickable: false
    },
    initFromDescription: function(ph) {
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
        if (!ph.geometry) {
            ph.geometry = {
                type: 'POLYGON',
                coordinates: [[[-worldSize, -worldSize], [-worldSize, worldSize], [worldSize, worldSize], [worldSize, -worldSize], [-worldSize, -worldSize]]]
            };
        } else if (gmx.srs == 3857 && gmx.srs !== vectorProperties.RasterSRS) {
			ph.geometry = gmxAPIutils.convertGeometry(gmxAPIutils.convertGeometry(ph.geometry, true, true));
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
