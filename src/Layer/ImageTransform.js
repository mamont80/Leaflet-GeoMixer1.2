L.gmx.gmxImageTransform = function(img, hash) {
    var gmx = hash.gmx,
        topLeft = hash.topLeft,
		mInPixel = topLeft.mInPixel,
        gmxTilePoint = hash.gmxTilePoint,
        geoItem = hash.geoItem,
        properties = geoItem.properties,
        dataOption = geoItem.dataOption || {},
        // geom = properties[properties.length - 1],
        // coord = geom.coordinates[0],
        indexes = gmx.tileAttributeIndexes,
        quicklookPlatform = properties[indexes[gmx.quicklookPlatform]] || gmx.quicklookPlatform || '',
        points = {};

    // if (geom.type === 'MULTIPOLYGON') { coord = coord[0]; }
    if (quicklookPlatform === 'LANDSAT8') {
        points.x1 = dataOption.bounds.min.x; points.y1 = dataOption.bounds.max.y;
        points.x2 = dataOption.bounds.max.x; points.y2 = dataOption.bounds.max.y;
        points.x3 = dataOption.bounds.max.x; points.y3 = dataOption.bounds.min.y;
        points.x4 = dataOption.bounds.min.x; points.y4 = dataOption.bounds.min.y;
    } else {
        points = gmxAPIutils.getQuicklookPointsFromProperties(properties, gmx);
    }

    var x1 = mInPixel * points.x1, y1 = mInPixel * points.y1,
        x2 = mInPixel * points.x2, y2 = mInPixel * points.y2,
        x3 = mInPixel * points.x3, y3 = mInPixel * points.y3,
        x4 = mInPixel * points.x4, y4 = mInPixel * points.y4,
        boundsP = gmxAPIutils.bounds([[x1, y1], [x2, y2], [x3, y3], [x4, y4]]),
        ww = Math.round(boundsP.max.x - boundsP.min.x),
        hh = Math.round(boundsP.max.y - boundsP.min.y),
        dy = 256 - boundsP.max.y + 256 * gmxTilePoint.y,
        itbounds = geoItem.item.bounds,
        wMerc = gmxAPIutils.worldWidthMerc,
        tpx = gmxTilePoint.x;

    if (tpx < 0 && itbounds.max.x > wMerc && itbounds.min.x < -wMerc) {	// For points intersects 180 deg
		tpx += Math.round(wMerc * mInPixel / 128);
	}
	var dx = boundsP.min.x - 256 * tpx;

    x1 -= boundsP.min.x; y1 = boundsP.max.y - y1;
    x2 -= boundsP.min.x; y2 = boundsP.max.y - y2;
    x3 -= boundsP.min.x; y3 = boundsP.max.y - y3;
    x4 -= boundsP.min.x; y4 = boundsP.max.y - y4;

    var shiftPoints = [[x1, y1], [x2, y2], [x3, y3], [x4, y4]];

    if (!gmx.ProjectiveImage) {
        gmx.ProjectiveImage = (gmx.useWebGL ? L.gmx.projectiveImageWebGL() : null) || L.gmx.projectiveImage();
    }
    var pt = gmx.ProjectiveImage.getCanvas({
        imageObj: img,
        points: shiftPoints,
        wView: ww,
        hView: hh,
        deltaX: dx,
        deltaY: dy
    });
    return pt.canvas;
};
