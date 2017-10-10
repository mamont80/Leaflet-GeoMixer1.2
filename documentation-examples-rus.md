# Галерея примеров

На этой странице собраны примеры использоваения как основного плагина Leaflet-GeoMixer, так и нескольких дополнительных плагинов, разработанных нами в процессе реализации проектов на GeoMixer-е.

##Основной функционал - интеграция данных GeoMixer-а на карту

Примеры использования плагина "Leaflet-GeoMixer" для интеграции данных с серверов GeoMixer-а на карту Leaflet.

Пример|Описание|Примечание
------|---------|-----------
[loadMap](http://ScanEx.github.com/Leaflet-GeoMixer/examples/GeoMixerMap.html)| Загрузка карты с сервера GeoMixer-а| Отображаются все видимые слои карты.
[loadLayer](http://ScanEx.github.com/Leaflet-GeoMixer/examples/satelliteLayer.html)| Загрузка одного слоя из карты с сервера GeoMixer-а|
[loadLayers](http://ScanEx.github.com/Leaflet-GeoMixer/examples/GMXLayerLeaflet.html)| Загрузка нескольких слоев из различных карт с сервера GeoMixer-а.| Демонстрируется работа с мультивременным слоем.
[Animation](http://ScanEx.github.com/Leaflet-GeoMixer/examples/Animation.html)| Предварительная загрузка данных слоя точек пожаров - показ точек за любой день при помощи ползунка.
[Plugins](http://ScanEx.github.com/Leaflet-GeoMixer/examples/Plugins.html)| Интеграция с другими Leaflet плагинами.| Демонстрируется совместная работа плагина Leaflet-GeoMixer с несколькими сторонними плагинами Leaflet.
[MultipleMaps](http://ScanEx.github.com/Leaflet-GeoMixer/examples/MultipleMaps.html)| Несколько карт на одной странице
[bindPopup](http://ScanEx.github.com/Leaflet-GeoMixer/examples/bindPopup.html)| Включение балуна для векторного слоя| Демонстрируется добавление пользовательского контента в тело балуна.
[bindClusters](http://ScanEx.github.com/Leaflet-GeoMixer/examples/bindClusters.html)| Включение кластеризации для векторного слоя.| Демонстрируется использование плагина кластеризации [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) для отображения данных векторного слоя.
[bindHeatMap](http://ScanEx.github.com/Leaflet-GeoMixer/examples/bindHeatMap.html)| Включение HeatMap для векторного слоя.|  Демонстрируется использование HeatMap плагина [Leaflet.heat](https://github.com/Leaflet/Leaflet.heat) для отображения данных векторного слоя.

## Редактирование и создание векторных объектов на карте

Примеры использования плагина рисования [L.GmxDrawing.js](https://github.com/ScanEx/gmxDrawing). В отличае от [Leaflet.Draw](https://github.com/Leaflet/Leaflet.draw) позволяет редактировать мультиполигоны и полигоны с дырками, имеет возможность дорисовывать линии после первичного создания. Оптимизирован для работы с большими геометриями.

Пример|Описание
------|---------
[Add Drawing Objects](http://scanex.github.io/gmxDrawing/examples/addDrawingObjects.html)| Добавление редактируемых объектов на карту
[Use Drawing Controls](http://scanex.github.io/gmxDrawing/examples/useDrawingControls.html)| Использование контролов рисования

##Работа с подложками карты

Примеры использования плагина [gmxBaseLayersManager](https://github.com/ScanEx/Leaflet.gmxBaseLayersManager) для управления подложками. Позволяет загружать с сервера GeoMixer-а список предустановленных подложек, выбирать из них видимые пользователю и задавать показываемую в данный момент.

Пример|Описание|Примечание
------|---------|-----------
[Add Base Layers](http://scanex.github.io/Leaflet.gmxBaseLayersManager/examples/BaseLayerManager.html)| Использование менеджера базовых подложек| Демонстрируется добавление базовых подложек через менеджер базовых подложек.
[Init Default Base Layers](http://scanex.github.io/Leaflet.gmxBaseLayersManager/examples/BaseLayersManagerInit.html)| Демонстрируется получение списка базовых подложек с сервера GeoMixer-а.|

<!--
##Плагин [leaflet-boundary-canvas](https://github.com/aparshin/leaflet-boundary-canvas)

Пример|Описание
------|---------
[canvas-boundary-edit](http://aparshin.github.io/leaflet-boundary-canvas/examples/canvas-boundary-edit.html)| Draw boundary of a raster layer yourself
[canvas-boundary](http://aparshin.github.io/leaflet-boundary-canvas/examples/canvas-boundary.html)| A multipolygon with holes as a border

##Плагин [Leaflet.imageTransform](https://github.com/ScanEx/Leaflet.imageTransform)

Пример|Описание
------|---------
[Landsat8](http://scanex.github.io/Leaflet.imageTransform/examples/Landsat8.html)| Снимки Landsat|
[Editing](http://scanex.github.io/Leaflet.imageTransform/examples/Editing.html)| Перепривязка снимка|
-->
## Дополнительные контролы

Примеры использования дополнительных [контролов GeoMixer-а](https://github.com/ScanEx/gmxControls) на карте Leaflet.

Пример|Описание
------|---------
[L.Control.gmxIcon](http://scanex.github.io/gmxControls/examples/L.Control.gmxIcon.html)| Контрол иконок
[L.Control.gmxIconGroup](http://scanex.github.io/gmxControls/examples/L.Control.gmxIconGroup.html)| Контрол группы иконок
[L.Control.gmxLayers](http://scanex.github.io/gmxControls/examples/L.Control.gmxLayers.html)| Контрол слоев
[L.Control.gmxZoom](http://scanex.github.io/gmxControls/examples/L.Control.gmxZoom.html)| Контрол зуммирования
[L.Control.gmxCopyright](http://scanex.github.io/gmxControls/examples/L.Control.gmxCopyright.html)| Контрол копирайтов
[L.Control.gmxLocation](http://scanex.github.io/gmxControls/examples/L.Control.gmxLocation.html)| Контрол текущего масштаба и положения карты
[L.Control.boxZoom](http://scanex.github.io/gmxControls/examples/L.Control.boxZoom.html)| BoxZoom контрол
[L.Control.gmxHide](http://scanex.github.io/gmxControls/examples/L.Control.gmxHide.html)| Контрол видимости верхних контролов
[ScanexControls](http://scanex.github.io/gmxControls/examples/ScanexControls.html)| Все плагины контролов GeoMixer-а
