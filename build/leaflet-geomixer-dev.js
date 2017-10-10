(function() {
    var depsFilename = 'deps.js';

	function getScriptPath() {
		var scripts = document.getElementsByTagName('script');
		for (var i = 0; i < scripts.length; i++) {
			var src = scripts[i].src;
			if (src) {
				var res = src.match(/^(.*)leaflet-geomixer-dev\.js/);
				if (res) {
					return res[1];
				}
			}
		}
	}

	var basePath = getScriptPath();
    
    window.gmxDevOnLoad = function(depsJS) {
        var srcPath = basePath + '../src/';
        for (var i = 0; i < depsJS.length; i++) {
            document.writeln("<script src='" + srcPath + depsJS[i] + "'></script>");
        }
    }
    
    document.writeln("<script src='" + basePath + depsFilename + "'></script>");
})();