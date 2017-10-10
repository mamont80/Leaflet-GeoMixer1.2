# Описание свойств слоя


##Серверные свойства слоя


Свойство|Тип|Описание
------|:---------:|-----------
name|`<String>`| идентификатор слоя.
title|`<String>`| наименование слоя.
type|`<String>`| тип слоя (варианты: `Vector`, `Raster`).
identityField|`<String>`| наименование первичного ключа (default: `gmx_id`).
GeometryType|`<String>`| тип объектов слоя (варианты: `polygon`, `linestring`, `point`).
VtMinZoom|`<UInt>`| генерализованные тайлы имеются только >= zoom.
VtMaxZoom|`<UInt>`| генерализованные тайлы имеются только < zoom.
isGeneralized|`<Bool>`| true - есть генерализованные тайлы иначе false.
attributes|`<Array[String]>`| наименования полей слоя.
attrTypes|`<Array[String]>`| типы полей слоя.
TemporalColumnName|`<String>`| наименование поля временной составляющей слоя.
TemporalPeriods|`<Array[UInt]>`| имеющиеся интервалы временной разбивки.
TemporalTiles|`<Array[Array[UInt]]>`| список мультивременных тайлов.
TemporalVers|`<Array[UInt]>`| список версий тайлов.
attrTypes|`<Array[String]>`| типы полей слоя.
MetaProperties|`<JSON>`| Мета данные слоя.
styles|`<JSON>`| Стили слоя.
