# Описание свойств слоя


## Серверные свойства слоя (используемые АПИ)

Свойство|Тип|Описание
------|:---------:|-----------
name|`<String>`| идентификатор слоя.
title|`<String>`| наименование слоя.
description|`<String>`| описание слоя.
LayerVersion|`<Uint>`| версия слоя.
type|`<String>`| тип слоя (варианты: `Vector`, `Raster`).
GeometryType|`<String>`| тип объектов слоя (варианты: `polygon`, `linestring`, `point`).
identityField|`<String>`| наименование первичного ключа (default: `gmx_id`).
attributes|`<Array[String]>`| наименования полей слоя.
attrTypes|`<Array[String]>`| типы полей слоя.
Temporal|`<Bool>`| признак мультивременного слоя (варианты: `true`, `false`)
TemporalColumnName|`<String>`| наименование поля временной составляющей слоя.
ZeroDate|`<StringDate>`| начало отсчета времени (варианты: `01.01.1980`)
MetaProperties|`<JSON>`| Мета данные слоя.
visible|`<Bool>`| true - слой видим иначе false.
Copyright|`<String>`| копирайт (варианты: `&copy;  <a href=\"http://www.exactearth.com/products/exactais/\">ExactAIS</a>`)
styles|`<JSON>`| Стили слоя.

## Серверные свойства слоя (не используемые АПИ, но возможно плагинами и т.п.)

Свойство|Тип|Описание
------|:---------:|-----------
Access|`<String>`| доступность (варианты: `edit`, ``)
Owner|`<String>`| хозяин слоя (варианты: ``)
date|`<StringDate>`| ??? (варианты: `06.08.2018`)
Legend|`<String>`| ??? (варианты: `null`)
EncodeSource|`<String>`| ??? (варианты: `null`)
MinZoom|`<UInt>`|  ??? (варианты: `1`)
MaxZoom|`<UInt>`|  ??? (варианты: `17`)
NameObject|`<String>`| ??? (варианты: ``)
DateBegin|`<StringDate>`| начальная дата объектов слоя (варианты: `26.02.2013`)
DateEnd|`<StringDate>`| конечная дата объектов слоя (варианты: `04.02.2019`)
DateBeginUTC|`<Int>`| начальная дата объектов слоя (варианты: `1361836800`)
DateEndUTC|`<Int>`| конечная дата объектов слоя (варианты: `1549238400`)
MapStructureID|`<String>`| ??? (варианты: `616B00E036BD4`)
maxShownPeriod|`<Float>`| ??? (варианты: `0.0`)
TemporalPeriods|`<Array[UInt]>`| имеющиеся интервалы временной разбивки.
TemporalTiles|`<Array[Array[UInt]]>`| список мультивременных тайлов.
TemporalVers|`<Array[UInt]>`| список версий тайлов.
VtMinZoom|`<UInt>`| генерализованные тайлы имеются только >= zoom.
VtMaxZoom|`<UInt>`| генерализованные тайлы имеются только < zoom.
isGeneralized|`<Bool>`| true - есть генерализованные тайлы иначе false.
AllowSearch|`<Bool>`| true - поиск допустим иначе false.
