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
