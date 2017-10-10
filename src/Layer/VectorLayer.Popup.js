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

    disablePopup: function () {
        this._popupDisabled = true;
		return this;
    },

    enablePopup: function () {
        this._popupDisabled = false;
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

	closePopup: function () {
		if (this._popup) {
			this._popup._close();
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
            this.closePopup();
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
			var geoJson = L.gmxUtil.geometryToGeoJSON(geometry, true, gmx.srs === '3857');
            outItem.latlng = L.latLng(geoJson.coordinates.reverse());
        }
        if (offset) {
            var protoOffset = L.Popup.prototype.options.offset;
            _popup.options.offset = [-protoOffset[0] - offset[0], protoOffset[1] - offset[1]];
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
					options.latlng = L.latLng(L.gmxUtil.geometryToGeoJSON(item.properties[item.properties.length - 1], true, this._gmx.srs === '3857').coordinates.reverse());
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
                latlng = L.latLng(L.gmxUtil.coordsFromMercator('Point', center, gmx.srs === '3857').reverse());
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
