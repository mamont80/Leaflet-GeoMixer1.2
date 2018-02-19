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
				out = {url: queue.src, load: false, loading: this.loading, queueLength: this.queue.length},
				_this = this;

			return fetch(out.url, queue.options || {})		// Fetch the image.
				.then(function(response) {
					return response.status >= 200 && response.status < 300 ? response.blob() : Promise.reject(response)
				})
				.then(createImageBitmap)				// Turn it into an ImageBitmap.
				.then(function(imageBitmap) {			// Post it back to main thread.
					_this.loading--;
					out.load = true;
					out.imageBitmap = imageBitmap;
					// log('imageBitmap __', _this.queue.length, _this.loading, out);
					_this.workerContext.postMessage(out, [imageBitmap]);
					_this.processQueue();
				})
				.catch(function(err) {
					out.error = err.toString();
					_this.workerContext.postMessage(out);
					_this.loading--;
					// log('catch', err, out);
					_this.processQueue();
				})
		}
	}
};
var handler = new ImageHandler(self);
self.onmessage = handler.enqueue.bind(handler);
