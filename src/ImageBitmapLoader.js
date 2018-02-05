(function() {
'use strict';

	var worker;
	if ('createImageBitmap' in window && 'Worker' in window) {
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
// console.log('ImageBitmapLoader ', message, evt, requestIdleCallback);

			for (var i = 0, it, arr = this.jobs[url] || [], len = arr.length; i < len; i++) {
				it = arr[i];
				if (message.imageBitmap) { it.resolve(message); }
				else { it.reject(message); }
			}
			this.jobs[url].length = 0;
		},

		push: function(url, options) {	// добавить запрос в worker
			var attr = {
					options: options
				},
				src = url;		// Ensure the URL is absolute.
			if (typeof this.jobs[src] === 'undefined') { this.jobs[src] = []; }

			this.jobs[src].push(attr);
			this.worker.postMessage({src: src, options: options});
			return new Promise(function(resolve, reject) {
				attr.resolve = resolve;
				attr.reject = reject;
			});
		}
	};

	var imageBitmapLoader = new ImageBitmapLoader();
	L.gmx.getBitmap = imageBitmapLoader.push.bind(imageBitmapLoader);
	worker.onerror = function(ev) {
		console.warn('Error: Worker init: ImageBitmapLoader-worker.js', ev);
		ev.target.terminate();
		delete L.gmx.getBitmap;
	};
})();
