var depsJS = [
    "commonjs.js",
    "Utils.js",
    "Parsers.js",
    "Deferred.js",
    "ImageBitmapLoader.js",
    "ImageLoader.js",
    "DrawCanvas.js",
    "SessionManager.js",
    "MapManager.js",
    "GeomixerMap.js",
    "EventsManager.js",
    "Locale.js",
    "lang_ru.js",
    "lang_en.js",

    "DataManager/VectorTileLoader.js",
    "DataManager/VectorTile.js",
    "DataManager/Observer.js",
    "DataManager/TilesTree.js",
    "DataManager/DataManager.js",

    "Layer/VectorLayer.js",
    "Layer/ScreenVectorTile.js",
    "Layer/ObjectsReorder.js",
    "Layer/StyleManager.js",
    "Layer/VectorLayer.Popup.js",
    "Layer/VectorLayer.Hover.js",
    "Layer/LayersVersion.js",
    "Layer/RasterLayer.js",
    "Layer/LabelsLayer.js",
    "Layer/ClipPolygon.js",
    "Layer/ImageTransform.js",
    "Layer/ProjectiveImageWebGL.js",
    "Layer/ProjectiveImage.js",

    "Layer/external/RotatedMarker.js",
    "Layer/external/ExternalLayer.js",
    "Layer/external/BindWMS.js",
    "Layer/external/HeatMap.js",
    "Layer/external/MarkerCluster.js",
    "Layer/external/GridCluster.js",
    "Layer/external/earcut.js",

    "LayerFactory.js"
];

//for builder
if (typeof exports !== 'undefined') {
	exports.depsJS = depsJS;
}

//for development environment
if (typeof gmxDevOnLoad === 'function') {
	gmxDevOnLoad(depsJS);
}
