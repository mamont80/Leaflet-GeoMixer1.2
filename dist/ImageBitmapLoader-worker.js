'use strict';

//var log = self.console.log.bind(self.console);

function ImageHandler(workerContext) {
    this.maxCount = 48;
    this.loading = 0;
    this.queue = [];
    this.workerContext = workerContext;
}
ImageHandler.prototype = {
	enqueue: function(evt) {
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
					var ret = '',
						contentType = resp.headers.get('Content-Type');

					out.contentType = contentType;
					if (resp.status < 200 || resp.status >= 300) {						// error
						ret = Promise.reject(resp);
					} else if ( contentType.indexOf('text/javascript') > -1				// text/javascript; charset=utf-8
							|| contentType.indexOf('application/json') > -1				// application/json; charset=utf-8
						) {
						ret = resp.json();
					// } else if (contentType.indexOf('application/json') > -1) {	 		// application/json; charset=utf-8
						// ret = resp.text();
					// } else if (contentType.indexOf('application/json') > -1) {	 		// application/json; charset=utf-8
						// ret = resp.formData();
					// } else if (contentType.indexOf('application/json') > -1) {	 		// application/json; charset=utf-8
						// ret = resp.arrayBuffer();
					} else if (type === 'bitmap') {
						ret = resp.blob();
					}
					return ret;
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
var handler = new ImageHandler(self);
self.onmessage = handler.enqueue.bind(handler);
