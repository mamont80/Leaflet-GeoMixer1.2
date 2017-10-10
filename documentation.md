# Leaflet-GeoMixer Plugin Documentation

Leaflet-GeoMixer is a plugin to add data from GeoMixer server to any Leaflet map. It adds several new classes to handle the GeoMixer layers and functions to instantiate these classes.

## Simple example

```html
	<div id="map"></div>
 
	<script src="http://cdn.leafletjs.com/leaflet-0.6.4/leaflet-src.js"></script>
	<script src="leaflet-geomixer.js?key=U92596WMIH"></script>
	<script>
		var map = L.map('map').setView([60, 50], 3);
		
		L.gmx.loadLayer('7VKHM', '295894E2A2F742109AB112DBFEAEFF09').then(function(satelliteLayer) {
		    satelliteLayer.addTo(map);
		});
		
        L.gmx.loadMap('AZR6A', {leafletMap: map});
	</script>
```

## Adding plugin
To add the plugin just include plugin's script to your page:

```html
<script src="leaflet-geomixer.js?key=GeoMixerAPIKey"></script>
```

`GeoMixerAPIKey` is the special key, that should be obtained for each domain to use data from GeoMixer. This key can be added as parameter of script or set as an option during layers loading.

## GeoMixer Data Structure

The main entity in GeoMixer in a **layer**. Each layer has several properties including `ID`, `type` and `title`.
Layer IDs are unique within one server. The main layer types are **vector** and **raster**.

Each vector layer consists of geometry items. Item has `type`, `geometry` and `properties` attributes.

Layers are combined into **maps**.

## Layer Factories

Layers are created using factory functions in asynchronous manner. There are several ways to instantiate a layer.

### L.gmx.loadLayer
```js
 L.gmx.loadLayer(mapID, layerID, options): promise
```

`mapID` is ID of GeoMixer's map and `layerID` is ID of layer to load. `options` is a an optional hash, which can containthe following keys.

Option|Description|Type|Default value
------|-----------|:--:|-------------
hostName| Host name of the GeoMixer server (without `http://` and terminal `/`)|`String`|maps.kosmosnimki.ru
apiKey|GeoMixer API key for GeoMixer server. If not defined here, it will be extracted from the plugin's script parameters (see above). No key is required to work from `localhost`.|`String`|
beginDate|Start date for time interval (only for temporal layers)|`Date`|
endDate|End date for time interval (only for temporal layers)|`Date`|

Function returns promise, which is fulfilled with an instance of GeoMixer layer (see description below). This instance can be used to add layer to map, tune visualization, etc.

### L.gmx.loadLayers
```js
 L.gmx.loadLayers(layers, commonOptions): promise
```

Helper function to load several layers at once. `layers` is an array of hashes with the following keys:
  * mapID - ID of GeoMixer map
  * layerID - ID of layer
  * options - layer options

Each element of array corresponds to single `L.gmx.loadLayer` call. `commonOptions` are applied to all the layers.

Returned promise if fulfilled when all the layers are loaded. Layers are passed as separate arguments to resolve functions.

### L.gmx.loadMap
```js
 L.gmx.loadMap(mapID, options): promise
```

Loads all layers from the GeoMixer's map. 

`options` is optional. It can contain all the options from `L.gmx.loadLayer` and the following additional keys.

Option|Description|Type
------|-----------|:--:|-------------
leafletMap| Leaflet map to add all the layers, that are visible in original GeoMixer map |`L.Map`
setZIndex| Set z-index to all loaded layers to reflect their order in GeoMixer map. Default is `false`.|`Boolean`

Function returns a promise, that is fulfilled after all the layers are loaded with an instance of `L.gmx.Map`.

## Class L.gmx.VectorLayer

`gmxVectorLayer` class provides interface for rendering GeoMixer vector layers on Leaflet map.

Layers can be added to Leaflet map in native way by calling `L.Map.addLayer()` or `L.gmx.VectorLayer.addTo()`.

### Methods
Method|Syntax|Return type|Description
------|------|:---------:|-----------
setFilter|`setFilter(function(item): Boolean)`|`this`|set function to filter out items before rendering. The only argument is a function, that receives an item and returns boolean value (`false` means filter item out)
removeFilter|`removeFilter()`||Remove filter function.
setDateInterval|`setDateInterval(beginDate, endDate)`|`this`|Set date interval for temporal layers. Only items within date interval will be rendered. `beginDate` and `endDate` are of type `Date`
addTo|`addTo(map)`|`this`|Add layer to Leaflet map. `map` argument is of type `L.Map`.
bindPopup|`bindPopup(html <String> `&#124;` el <HTMLElement> `&#124;` popup <Popup>, options <Popup options>? )`|`this`|Binds a popup to a click on this layer.

## Class L.gmx.RasterLayer

`L.gmx.RasterLayer` class is used to render raster GeoMixer layer.

Method|Syntax|Return type|Description
------|------|:---------:|-----------
addTo|`addTo(map)`|`this`|Add layer to Leaflet map. `map` argument is of type `L.Map`.

## Class L.gmx.Map
`L.gmx.Map` is used to work with GeoMixer map (collection of layers). It has several properties to iterate and find GeoMixer layers.

###Properties
Property|Type|Description
------|:---------:|-----------
layers|Array of `L.gmx.VectorLayer` or `L.gmx.RasterLayer`| Array of all the layers in GeoMixer map
layersByID|Object| Hash of layers in GeoMixer map with layer ID as key
layersByTitle|Object| Hash of layers in GeoMixer map with layer title as key
properties|Object|GeoMixer map properties
rawTree|Object|Raw map description, transferred from GeoMixer server (mostly for internal purposes)