(function() {
'use strict';

	var worker;
	if ('createImageBitmap' in window && 'Worker' in window && location.protocol !== 'file:') {
		worker = new Worker(location.href.replace(/[^/]*$/, 'ImageBitmapLoader-worker.js'));
	}
	if (!worker) {
		return;
	}

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
			this.jobs[url].length = 0;
			L.gmxUtil.loaderStatus(url, true);
		},

		push: function(url, options) {	// добавить запрос в worker
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
			});
		}
	};

	var imageBitmapLoader = new ImageBitmapLoader();
	L.gmx.getBitmap = imageBitmapLoader.push.bind(imageBitmapLoader);
	L.gmx.getJSON = imageBitmapLoader.push.bind(imageBitmapLoader);
	L.gmx.sendCmd = imageBitmapLoader.push.bind(imageBitmapLoader);
	worker.onerror = function(ev) {
		console.warn('Error: Worker init: ImageBitmapLoader-worker.js', ev);
		ev.target.terminate();
		delete L.gmx.getBitmap;
		delete L.gmx.getJSON;
		delete L.gmx.sendCmd;
	};
})();
