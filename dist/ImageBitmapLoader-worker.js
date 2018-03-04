'use strict';

var log = self.console.log.bind(self.console);
var utils = {
	extend: function (dest) {
		var i, j, len, src;

		for (j = 1, len = arguments.length; j < len; j++) {
			src = arguments[j];
			for (i in src) {
				dest[i] = src[i];
			}
		}
		return dest;
	},
	getFormBody: function(par) {
		return Object.keys(par).map(function(key) { return encodeURIComponent(key) + '=' + encodeURIComponent(par[key]); }).join('&');
	},
	chkResponse: function(resp, type) {
		if (resp.status < 200 || resp.status >= 300) {						// error
			return Promise.reject(resp);
		} else {
			var contentType = resp.headers.get('Content-Type');
			if (type === 'bitmap') {												// get blob
				return resp.blob();
			} else if (contentType.indexOf('application/json') > -1) {				// application/json; charset=utf-8
				return resp.json();
			} else if (contentType.indexOf('text/javascript') > -1) {	 			// text/javascript; charset=utf-8
				return resp.text();
			// } else if (contentType.indexOf('application/json') > -1) {	 		// application/json; charset=utf-8
				// ret = resp.text();
			// } else if (contentType.indexOf('application/json') > -1) {	 		// application/json; charset=utf-8
				// ret = resp.formData();
			// } else if (contentType.indexOf('application/json') > -1) {	 		// application/json; charset=utf-8
				// ret = resp.arrayBuffer();
			// } else {
			}
		}
		return resp.text();
	},
	// getJson: function(url, params, options) {
	getJson: function(queue) {
// log('getJson', queue, Date.now())
		var par = queue.params;
		return fetch(queue.url, utils.extend({
			method: 'post',
			headers: {'Content-type': 'application/x-www-form-urlencoded'},
			mode: 'cors',
			credentials: 'include'
		}, queue.options, {
			body: utils.getFormBody(par)
		}))
		.then(utils.chkResponse)
		.then(function(res) {
			return {
				queue: queue,
				res: res
			};
		});
    }
};

function ImageHandler(workerContext) {
    this.maxCount = 48;
    this.loading = 0;
    this.queue = [];
    this.workerContext = workerContext;
}
ImageHandler.prototype = {
	enqueue: function(evt) {
// log('enqueue', evt);
		var toEnqueue = evt.data;
		if (this.queue.indexOf(toEnqueue) < 0) {
			this.queue.push(toEnqueue);
			this.processQueue();
		}
	},

	processQueue: function() {
		// log('processQueue', this.queue.length, this.loading, this.maxCount);
		if (this.queue.length > 0 && this.loading < this.maxCount) {
			this.loading++;
			var queue = this.queue.shift(),
				options = queue.options || {},
				type = options.type || 'bitmap',
				out = {url: queue.src, type: type, load: false, loading: this.loading, queueLength: this.queue.length},
				promise = fetch(out.url, options).then(function(resp) {
					return utils.chkResponse(resp, type);
				});

			if (type === 'bitmap') {
				promise = promise.then(createImageBitmap);				// Turn it into an ImageBitmap.
			}
			return promise
				.then(function(res) {									// Post it back to main thread.
					this.loading--;
					out.load = true;
					var arr = [];
					if (type === 'bitmap') {
						arr = [res];
						out.imageBitmap = res;
					} else {
						out.res = res;
					}
					// log('imageBitmap __', this.queue.length, this.loading, out);
					this.workerContext.postMessage(out, arr);
					this.processQueue();
				}.bind(this))
				.catch(function(err) {
					out.error = err.toString();
					this.workerContext.postMessage(out);
					this.loading--;
					// log('catch', err, out);
					this.processQueue();
				}.bind(this));
		}
	}
};

/** загрузчик описаний карт
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

	loadMapProperties: function(options) {
        var maps = this._maps,
			serverHost = options.hostName || options.serverHost,
			mapName = options.MapName;

        if (!maps[serverHost] || !maps[serverHost][mapName]) {
			var opt = {
				WrapStyle: 'None',
				skipTiles: options.skipTiles || 'None', // All, NotVisible, None
				MapName: mapName,
				srs: options.srs || 3857,
				ftc: options.ftc || 'osm',
				ModeKey: 'map'
			};
			var promise = new Promise(function(resolve, reject) {
				gmxMapManager.requestSessionKey(serverHost, options.apiKey).then(function(sessionKey) {
					opt.key = sessionKey;
					utils.getJson({
						url: '//' + serverHost + '/TileSender.ashx',
						params: opt
					})
					.then(function(json) {
						var res = typeof json.res === 'string' ? JSON.parse(json.res) : json.res;
						if (res.Status === 'ok' && res.Result) {
							var mapInfo = res.Result,
								mapProps = mapInfo.properties;

							mapProps.hostName = serverHost;
							mapProps.sessionKey = sessionKey;
							var dataSources = {};
							gmxMapManager.iterateLayers(mapInfo, function(layerInfo) {
								var props = layerInfo.properties,
									// type = props.ContentID || props.type,
									meta = props.MetaProperties || {},
									options = {
										mapID: mapProps.MapID,
										sessionKey: mapProps.sessionKey,
										skipTiles: opt.skipTiles,
										srs: opt.srs,
										ftc: opt.ftc,
										id: props.name,
										dataSource: props.name
									};
								if (props.dataSource) {					// изменен источник
									options.dataSource = props.dataSource;
								} else if ('parentLayer' in meta) {		// изменен источник
									options.dataSource = meta.parentLayer.Value || '';
								}

								props.hostName = mapProps.hostName;
								dataSources[options.id] = {
									info: layerInfo,
									options: options
								};
							});
							var mapHash = {
								properties: mapProps,
								dataSources: dataSources,
								_rawTree: res.Result,
								_nodes: {}
							};

							gmx._maps[serverHost] = gmx._maps[serverHost] || {};
							gmx._maps[serverHost][mapName] = mapHash;
							resolve(res.Result);
						} else {
							reject(json);
						}
					}.bind(this))
					.catch(reject);
				}, reject);
			});
            maps[serverHost] = maps[serverHost] || {};
            maps[serverHost][mapName] = {promise: promise};
        }
        return maps[serverHost][mapName].promise;
    },

    // установка дополнительных параметров для серверных запросов
	// syncParams: {},
    // setSyncParams: function(hash) {
		// this.syncParams = hash;
    // },
    // getSyncParams: function(stringFlag) {
		// var res = this.syncParams;
		// if (stringFlag) {
			// var arr = [];
			// for (var key in res) {
				// arr.push(key + '=' + res[key]);
			// }
			// res = arr.join('&');
		// }
		// return res;
    // },

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

                if (layer.type === 'group') {
                    iterate(layer.content.children);
                } else if (layer.type === 'layer') {
                    callback(layer.content);
                }
            }
        };

        treeInfo && iterate(treeInfo.children);
    },
    iterateNode: function(treeInfo, callback) {
        var iterate = function(node) {
			var arr = node.children;
            for (var i = 0, len = arr.length; i < len; i++) {
                var layer = arr[i];

				callback(layer);
                if (layer.type === 'group') {
                    iterate(layer.content);
                }
            }
        };

        treeInfo && iterate(treeInfo);
    },
    requestSessionKey: function(serverHost, apiKey) {
        var keys = this._sessionKeys;
        if (!(serverHost in keys)) {
            keys[serverHost] = new Promise(function(resolve, reject) {
				if (apiKey) {
					utils.getJson({
						url: '//' + serverHost + '/ApiKey.ashx',
						params: {WrapStyle: 'None', Key: apiKey}
					})
						.then(function(json) {
							var res = json.res;
							if (res.Status === 'ok' && res.Result) {
								resolve(res.Result.Key !== 'null' ? '' : res.Result.Key);
							} else {
								reject(json);
							}
						}.bind(this))
						.catch(function() {
							resolve('');
						}.bind(this));
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
    _sessionKeys: {},		//Promise session for each host
    _maps: {}				//Promise for each map. Structure: maps[serverHost][mapID]: {promise:, layers:}
};

var gmx = self.gmx || {};
gmx._maps = {};			// свойства слоев по картам
gmx._clientLayers = {};	// свойства слоев без карт (клиентские слои)

var handler = new ImageHandler(self);

var cmdProxy = function(cmd, options) {
// log('__ cmd _______', cmd, options);

	if (cmd === 'mapProperties') {				// загрузка свойств карты
		var out = {url: cmd, inp: options, load: false};
		gmxMapManager.loadMapProperties(options)
			.then(function(json) {
				out.load = true;
				out.res = json;
				handler.workerContext.postMessage(out);
				//log('__gmx_______', gmx);
			})
			.catch(function(err) {
				out.error = err.toString();
				handler.workerContext.postMessage(out);
			});
	} else if (cmd === 'onmoveend') {			// сменилось положение карты
		handler.workerContext.postMessage({url: cmd, inp: options, load: true});
		gmx._zoom = options.zoom;				// текущий zoom карты
		gmx._bbox = options.bbox;				// текущий экран карты
		layersVersion.now();
	} else if (cmd === 'dateIntervalChanged') {
		layersVersion.add(options);
		handler.workerContext.postMessage({url: cmd, inp: options, load: true});
	} else if (cmd === 'toggleDataSource') {	// включение/выключение контроль версионности источников
		if (options.active) {
			layersVersion.add(options);
		} else {
			layersVersion.remove(options);
		}
		handler.workerContext.postMessage({url: cmd, inp: options, load: true});
	} else {
		return true; //	this is`t commad - this is request
	}

};

self.onmessage = function(evt) {
	var data = evt.data;
	if (cmdProxy(data.src, data.options)) {
		handler.enqueue(evt);
	}
};
/** загрузчик источников данных
*/
var vectorTiles = {
    _maxCount: 48,
    _loading: 0,
	_queue: [],
    _parseTile: function(req) {
		var txt = req.res,
			pref = 'gmxAPI._vectorTileReceiver(';
		if (txt.substr(0, pref.length) === pref) {
			txt = txt.replace(pref, '');
			var data = JSON.parse(txt.substr(0, txt.length -1));
			var queue = req.queue,
				layerID = queue.params.LayerName,
				hostName = queue.hostName,
				ds = gmx._maps[hostName][queue.mapID].dataSources,
				vTiles = ds[layerID].vTiles;

			if (data.LayerName !== layerID) {
				log('error', data.LayerName, layerID);
			} else {
				vTiles[queue.key].res = data;
			}
		}
    },
	addTilesToLoad: function(ds, inp) {
		// options = options || {}; tilesOrder
		if (!ds.vTiles) { ds.vTiles = {}; }
		var info = ds.info,
			hostName = info.properties.hostName,
			tilesOrder = inp.tilesOrder,
			size = tilesOrder.length,
			tiles = inp.tiles,
            params = {
                ModeKey: 'tile', srs: 3857, ftc: 'osm', r: 'j', sw: 1, LayerName: inp.name
            };

		for (var i = 0, len = tiles.length; i < len; i += size) {
			var arr = tiles.slice(i, i + size),
				vKey = arr.join(':'),
				opt = arr.reduce(function(p, c, nm) { p[tilesOrder[nm]] = c; return p; }, {}),
				par = {
					key: vKey,
					params: utils.extend({}, params, opt),
					hostName: hostName,
					mapID: ds.options.mapID,
					url: '//' + hostName + '/TileSender.ashx'
				};
			ds.vTiles[vKey] = par;
			this.enqueue(par);
		}
	},
	enqueue: function(toEnqueue) {
		if (this._queue.indexOf(toEnqueue) < 0) {
			this._queue.push(toEnqueue);
			this.processQueue();
		}
	},
	processQueue: function() {
		if (this._queue.length > 0 && this._loading < this._maxCount) {
			this._loading++;
			utils.getJson(this._queue.shift())
				.then(function(res) { this._parseTile(res); }.bind(this))
				.catch(function(err) {
					log('catch', err);
					this._loading--;
					this.processQueue();
				}.bind(this));
		}
	}
};
/** версионность источников данных
*/
var layersVersion = {
	_delay: 20000,
	_intervalID: null,
	_timeoutID: null,
	_lastParams: {},
	_hosts: {},
	_layers: {},

    _getSourceParams: function(ds, options) {
		options = options || {};
		var info = ds.info,
			prop = info.properties,
			tilesKey = prop.Temporal ? 'TemporalTiles' : 'tiles',
			pt = {
				Name: options.layerID || prop.name,
				Version: tilesKey in prop || info.tiles ? prop.LayerVersion : -1
			};
		if (options.dInterval) {
			ds.dateBegin = options.dInterval[0];
			ds.dateEnd = options.dInterval[1];
		}
		if (ds.dateBegin) {
			pt.dateBegin = ds.dateBegin;
			pt.dateEnd = ds.dateEnd
		}
		return pt;
    },
    _parseResponse: function(arr, maps) {
// log('_______ _parseResponse', arr, maps);
		var hash = arr.reduce(function(p, c) {
			p[c.name] = c;
			return p;
		}, {});
        for (var mapID in maps) {
			var map = maps[mapID],
				dataSources = map.dataSources;

			for (var layerID in hash) {
				var ds = dataSources[layerID];
				if (ds) {
					var inp = hash[layerID],
						info = ds.info;
					utils.extend(info.properties, inp.properties);
					utils.extend(info.geometry, inp.geometry);
					info.tiles = inp.tiles;
					info.tilesOrder = inp.tilesOrder.map(function(it) {return it.toLowerCase();});
					this._update(ds);
					vectorTiles.addTilesToLoad(ds, inp);
				}
			}
		}
    },
	chkVersion: function() {
// log('chkVersion', gmx._zoom, gmx._bbox, this, this._hosts, layersVersion._intervalID, Date.now())
        for (var hostName in this._hosts) {
			var hosts = this._hosts[hostName],
				opt = {
					WrapStyle: 'None',
					layers: JSON.stringify(Object.keys(hosts).map(function(key) {return hosts[key];})),
					bbox: JSON.stringify(gmx._bbox),
					zoom: gmx._zoom,
					srs: 3857,
					ftc: 'osm'
				},
				body = utils.getFormBody(opt);
			if (this._lastParams[hostName] !== body) {
				utils.getJson({
					url: '//' + hostName + '/Layer/CheckVersion.ashx',
					params: opt
				})
				.then(function(json) {
					this._lastParams[hostName] = body;
					var res = typeof json.res === 'string' ? JSON.parse(json.res) : json.res;
					if (res.Status === 'ok' && res.Result) {
						this._parseResponse(res.Result, gmx._maps[hostName]);
					}
				}.bind(this)).catch(log);
			}
        }
    },

    _update: function(ds, options) {
		options = options || {};
		var prop = ds.info.properties,
			layerID = prop.name,
			hostName = options.hostName || prop.hostName;

		if (!this._hosts[hostName]) { this._hosts[hostName] = {}; }
		this._hosts[hostName][layerID] = this._getSourceParams(ds, options);
   },

    add: function(options) {
		var hostName = options.hostName,
			maps = gmx._maps[hostName];
        if (!maps || !maps[options.mapID] || !maps[options.mapID].dataSources[options.layerID]) { return; }
		var ds = maps[options.mapID].dataSources[options.layerID];
		this._update(ds, options);
		this.start();
		this.now();
// log('add', options, ds, this._hosts, Date.now())
    },

    remove: function(options) {
		var hostName = options.hostName;
        if (this._hosts[hostName] && this._hosts[hostName][options.layerID]) {
			delete this._hosts[hostName][options.layerID];
		}
// log('remove', options, this._hosts, Date.now())
    },

    now: function() {
		if (this._timeoutID) { clearTimeout(this._timeoutID); }
		this._timeoutID = setTimeout(this.chkVersion.bind(this), 0);
    },

    stop: function() {
        if (this._intervalID) { clearInterval(this._intervalID); }
        this._intervalID = null;
    },

    start: function(msec) {
        if (msec) {this. _delay = msec; }
        layersVersion.stop();
        this._intervalID = setInterval(this.chkVersion.bind(this), this._delay);
    }
};
// https://github.com/bendrucker/insert-styles/blob/master/index.js