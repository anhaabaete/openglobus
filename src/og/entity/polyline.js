goog.provide('og.Polyline');

goog.require('og.mercator');
goog.require('og.math.Vector3');
goog.require('og.Extent');

/**
 * Polyline object.
 * @class
 * @param {Object} [options] - Polyline options:
 * @param {number} [options.thickness] - Thickness in screen pixels 1.5 is default.
 * @param {og.math.Vector4} [options.color] - RGBA color.
 * @param {Boolean} [options.visibility] - Polyline visibility. True default.
 * @param {Boolean} [options.isClosed] - Closed geometry type identificator.
 * @param {Array.<og.LonLat>} [options.pathLonLat] - Polyline geodetic coordinates array.
 * @param {Array.<Array.<number,number,number>>} [options.path] - LinesString cartesian coordinates array. Like path:[[0,0,0], [1,1,1],...]
 */
og.Polyline = function (options) {

    options = options || {};

    /**
     * Object unic identifier.
     * @public
     * @readonly
     * @type {number}
     */
    this.id = og.Polyline.__staticId++;

    /**
     * Polyline thickness in screen pixels.
     * @public
     * @type {number}
     */
    this.thickness = options.thickness || 1.5;

    /**
     * Polyline RGBA color.
     * @public
     * @type {og.math.Vector4}
     */
    this.color = og.utils.createColorRGBA(options.color, new og.math.Vector4(1.0, 1.0, 1.0, 1.0));

    /**
     * Polyline visibility.
     * @public
     * @type {boolean}
     */
    this.visibility = (options.visibility != undefined ? options.visibility : true);

    /**
     * Polyline geometry ring type identificator.
     * @protected
     * @type {Boolean}
     */
    this._closedLine = options.isClosed || false;

    /**
     * Polyline cartesian coordinates.
     * @private
     * @type {Array.<og.math.Vector3>}
     */
    this._path3v = [];

    /**
     * Polyline geodetic degrees coordiantes.
     * @private
     * @type {Array.<og.LonLat>}
     */
    this._pathLonLat = [];

    /**
     * Polyline geodetic mercator coordinates.
     * @private
     * @type {Array.<og.LonLat>}
     */
    this._pathLonLatMerc = [];

    /**
     * Polyline geodetic extent.
     * @protected
     * @type {og.Extent}
     */
    this._extent = new og.Extent();

    this._vertices = [];
    this._orders = [];
    this._indexes = [];

    this._verticesBuffer = null;
    this._ordersBuffer = null;
    this._indexesBuffer = null;

    this._pickingColor = [0, 0, 0];

    this._renderNode = null;

    /**
     * Entity instance that holds this Polyline.
     * @private
     * @type {og.Entity}
     */
    this._entity = null;

    /**
     * Handler that stores and renders this Polyline object.
     * @private
     * @type {og.PolylineHandler}
     */
    this._handler = null;
    this._handlerIndex = -1;

    this._buffersUpdateCallbacks = [];
    this._buffersUpdateCallbacks[og.Polyline.VERTICES_BUFFER] = this._createVerticesBuffer;
    this._buffersUpdateCallbacks[og.Polyline.INDEX_BUFFER] = this._createIndexBuffer;

    this._changedBuffers = new Array(this._buffersUpdateCallbacks.length);

    //create path
    if (options.pathLonLat) {
        this.setPathLonLat(options.pathLonLat);
    } else if (options.path3v) {
        this.setPath3v(options.path3v);
    }

    this._refresh();
};

og.Polyline.VERTICES_BUFFER = 0;
og.Polyline.INDEX_BUFFER = 1;

og.Polyline.__staticId = 0;

/**
 * Appends to the line arrays new data from cartesian coordinates.
 * @param {Array.<Array.<number, number, number>>} path3v - Line coordinates path array.
 * @param {Boolean} closedLine - Identificator for the closed line data creation.
 * @param {og.Ellipsoid} ellipsoid - Ellipsoid parameter to convert cartesian coordinates to the ellipsoid geodetic coordinates.
 * @param {Number[]} - Out vertices data array.
 * @param {Number[]} - Out vertices order data array.
 * @param {Number[]} - Out vertices indexe data array.
 * @param {og.Ellipsoid} [ellipsoid] - Ellipsoid to coordinates transformation.
 * @param {Array.<Array.<og.LonLat>>} [outTransformedPathLonLat] - Geodetic coordinates out array.
 * @param {Array.<Array.<og.LonLat>>} [outTransformedPathMerc] - Mercator coordinates out array.
 * @static
 */
og.Polyline.appendLineData3v = function (path3v, isClosed, outVertices, outOrders, outIndexes,
    ellipsoid, outTransformedPathLonLat, outTransformedPathMerc) {
    var index = 0;

    if (outIndexes.length > 0) {
        index = outIndexes[outIndexes.length - 5] + 9;
        outIndexes.push(index, index);
    } else {
        outIndexes.push(0, 0);
    }

    for (var j = 0; j < path3v.length; j++) {
        var path = path3v[j];
        var startIndex = index;

        var last;
        if (isClosed) {
            last = path[path.length - 1];
            if (last.constructor === Array) {
                last = new og.math.Vector3(last[0], last[1], last[2]);
            }
        } else {
            var p0 = path[0],
                p1 = path[1];
            if (p0.constructor === Array) {
                p0 = new og.math.Vector3(p0[0], p0[1], p0[2]);
            }
            if (p1.constructor === Array) {
                p1 = new og.math.Vector3(p1[0], p1[1], p1[2]);
            }
            last = new og.math.Vector3(p0.x + p0.x - p1.x, p0.y + p0.y - p1.y, p0.z + p0.z - p1.z);
        }

        outVertices.push(last.x, last.y, last.z, last.x, last.y, last.z, last.x, last.y, last.z, last.x, last.y, last.z);
        outOrders.push(1, -1, 2, -2);

        for (var i = 0; i < path.length; i++) {
            var cur = path[i];
            if (cur.constructor === Array) {
                cur = new og.math.Vector3(cur[0], cur[1], cur[2]);
            }
            if (ellipsoid) {
                var lonLat = ellipsoid.cartesianToLonLat(cur);
                outTransformedPathLonLat.push(lonLat);
                outTransformedPathMerc.push(lonLat.forwardMercator());
            }
            outVertices.push(cur.x, cur.y, cur.z, cur.x, cur.y, cur.z, cur.x, cur.y, cur.z, cur.x, cur.y, cur.z);
            outOrders.push(1, -1, 2, -2);
            outIndexes.push(index++, index++, index++, index++);
        }

        var first;
        if (isClosed) {
            first = path[0];
            if (first.constructor === Array) {
                first = new og.math.Vector3(first[0], first[1], first[2]);
            }
            outIndexes.push(startIndex, startIndex + 1, startIndex + 1, startIndex + 1);
        } else {
            var p0 = path[path.length - 1],
                p1 = path[path.length - 2];
            if (p0.constructor === Array) {
                p0 = new og.math.Vector3(p0[0], p0[1], p0[2]);
            }
            if (p1.constructor === Array) {
                p1 = new og.math.Vector3(p1[0], p1[1], p1[2]);
            }
            first = new og.math.Vector3(p0.x + p0.x - p1.x, p0.y + p0.y - p1.y, p0.z + p0.z - p1.z);
            outIndexes.push(index - 1, index - 1, index - 1, index - 1);
        }

        outVertices.push(first.x, first.y, first.z, first.x, first.y, first.z, first.x, first.y, first.z, first.x, first.y, first.z);
        outOrders.push(1, -1, 2, -2);

        if (j < path3v.length - 1) {
            index += 8;
            outIndexes.push(index, index);
        }
    }
};

/**
 * Appends to the line arrays new data from geodetic coordinates.
 * @param {Array.<Array.<number, number, number>>} pathLonLat - Line geodetic coordinates path array.
 * @param {Boolean} closedLine - Identificator for the closed line data creation.
 * @param {og.Ellipsoid} ellipsoid - Ellipsoid parameter to convert cartesian coordinates to the ellipsoid geodetic coordinates.
 * @param {Number[]} - Out vertices data array.
 * @param {Number[]} - Out vertices order data array.
 * @param {Number[]} - Out vertices indexe data array.
 * @param {og.Ellipsoid} - Ellipsoid to coordinates transformation.
 * @param {Array.<Array.<Number, Number, Number>>} - Cartesian coordinates out array.
 * @param {Array.<Array.<og.LonLat>>} - Mercator coordinates out array.
 * @static
 */
og.Polyline.appendLineDataLonLat = function (pathLonLat, isClosed, outVertices, outOrders, outIndexes,
    ellipsoid, outTransformedPathCartesian, outTransformedPathMerc) {
    var index = 0;

    if (outIndexes.length > 0) {
        index = outIndexes[outIndexes.length - 5] + 9;
        outIndexes.push(index, index);
    } else {
        outIndexes.push(0, 0);
    }

    for (var j = 0; j < pathLonLat.length; j++) {
        var path = pathLonLat[j];
        var startIndex = index;

        var last;
        if (isClosed) {
            last = ellipsoid.lonLatToCartesian(path[path.length - 1]);
        } else {
            var p0 = ellipsoid.lonLatToCartesian(path[0]),
                p1 = ellipsoid.lonLatToCartesian(path[1]);
            last = new og.math.Vector3(p0.x + p0.x - p1.x, p0.y + p0.y - p1.y, p0.z + p0.z - p1.z);
        }

        outVertices.push(last.x, last.y, last.z, last.x, last.y, last.z, last.x, last.y, last.z, last.x, last.y, last.z);
        outOrders.push(1, -1, 2, -2);

        for (var i = 0; i < path.length; i++) {
            var cur = path[i],
                cartesian = ellipsoid.lonLatToCartesian(cur);
            outTransformedPathCartesian.push(cartesian);
            outTransformedPathMerc.push(cur.forwardMercator());

            outVertices.push(cartesian.x, cartesian.y, cartesian.z, cartesian.x, cartesian.y, cartesian.z,
                cartesian.x, cartesian.y, cartesian.z, cartesian.x, cartesian.y, cartesian.z);
            outOrders.push(1, -1, 2, -2);
            outIndexes.push(index++, index++, index++, index++);
        }

        var first;
        if (isClosed) {
            first = ellipsoid.lonLatToCartesian(path[0]);
            outIndexes.push(startIndex, startIndex + 1, startIndex + 1, startIndex + 1);
        } else {
            var p0 = ellipsoid.lonLatToCartesian(path[path.length - 1]),
                p1 = ellipsoid.lonLatToCartesian(path[path.length - 2]);
            first = new og.math.Vector3(p0.x + p0.x - p1.x, p0.y + p0.y - p1.y, p0.z + p0.z - p1.z);
            outIndexes.push(index - 1, index - 1, index - 1, index - 1);
        }

        outVertices.push(first.x, first.y, first.z, first.x, first.y, first.z, first.x, first.y, first.z, first.x, first.y, first.z);
        outOrders.push(1, -1, 2, -2);

        if (j < pathLonLat.length - 1) {
            index += 8;
            outIndexes.push(index, index);
        }
    }
};

/**
 * @protected
 */
og.Polyline.prototype._setEqualPath3v = function (path3v) {

    var v = this._vertices,
        l = this._pathLonLat,
        m = this._pathLonLatMerc,
        k = 0;

    var ellipsoid = this._renderNode.ellipsoid;

    for (var j = 0; j < path3v.length; j++) {
        var path = path3v[j];

        var last;
        if (this._closedLine) {
            last = path[path.length - 1]
        } else {
            last = new og.math.Vector3(path[0].x + path[0].x - path[1].x, path[0].y + path[0].y - path[1].y, path[0].z + path[0].z - path[1].z);
        }

        v[k++] = last.x;
        v[k++] = last.y;
        v[k++] = last.z;
        v[k++] = last.x;
        v[k++] = last.y;
        v[k++] = last.z;
        v[k++] = last.x;
        v[k++] = last.y;
        v[k++] = last.z;
        v[k++] = last.x;
        v[k++] = last.y;
        v[k++] = last.z;

        for (var i = 0; i < path.length; i++) {
            var cur = path[i];
            if (ellipsoid) {
                var lonLat = ellipsoid.cartesianToLonLat(cur);
                l[i] = lonLat;
                m[i] = lonLat.forwardMercator();
            }
            v[k++] = cur.x;
            v[k++] = cur.y;
            v[k++] = cur.z;
            v[k++] = cur.x;
            v[k++] = cur.y;
            v[k++] = cur.z;
            v[k++] = cur.x;
            v[k++] = cur.y;
            v[k++] = cur.z;
            v[k++] = cur.x;
            v[k++] = cur.y;
            v[k++] = cur.z;
        }

        var first;
        if (this._closedLine) {
            first = path[0];
        } else {
            var l1 = path.length - 1;
            first = new og.math.Vector3(path[l1].x + path[l1].x - path[l1 - 1].x, path[l1].y + path[l1].y - path[l1 - 1].y,
                path[l1].z + path[l1].z - path[l1 - 1].z);
        }

        v[k++] = first.x;
        v[k++] = first.y;
        v[k++] = first.z;
        v[k++] = first.x;
        v[k++] = first.y;
        v[k++] = first.z;
        v[k++] = first.x;
        v[k++] = first.y;
        v[k++] = first.z;
        v[k++] = first.x;
        v[k++] = first.y;
        v[k++] = first.z;
    }
};

/**
 * @protected
 */
og.Polyline.prototype._setEqualPathLonLat = function (pathLonLat) {

    var v = this._vertices,
        l = this._pathLonLat,
        m = this._pathLonLatMerc,
        c = this._path3v,
        k = 0;

    var ellipsoid = this._renderNode.ellipsoid;

    for (var j = 0; j < pathLonLat.length; j++) {
        var path = pathLonLat[j];

        var last;
        if (this._closedLine) {
            last = ellipsoid.lonLatToCartesian(path[path.length - 1]);
        } else {
            var p0 = ellipsoid.lonLatToCartesian(path[0]),
                p1 = ellipsoid.lonLatToCartesian(path[1]);
            last = new og.math.Vector3(p0.x + p0.x - p1.x, p0.y + p0.y - p1.y, p0.z + p0.z - p1.z);
        }

        v[k++] = last.x;
        v[k++] = last.y;
        v[k++] = last.z;
        v[k++] = last.x;
        v[k++] = last.y;
        v[k++] = last.z;
        v[k++] = last.x;
        v[k++] = last.y;
        v[k++] = last.z;
        v[k++] = last.x;
        v[k++] = last.y;
        v[k++] = last.z;

        for (var i = 0; i < path.length; i++) {
            var cur = path[i];
            cartesian = ellipsoid.lonLatToCartesian(cur);
            c[i] = cartesian;
            m[i] = cur.forwardMercator();
            l[i] = cur;
            v[k++] = cartesian.x;
            v[k++] = cartesian.y;
            v[k++] = cartesian.z;
            v[k++] = cartesian.x;
            v[k++] = cartesian.y;
            v[k++] = cartesian.z;
            v[k++] = cartesian.x;
            v[k++] = cartesian.y;
            v[k++] = cartesian.z;
            v[k++] = cartesian.x;
            v[k++] = cartesian.y;
            v[k++] = cartesian.z;
        }

        var first;
        if (this._closedLine) {
            first = ellipsoid.lonLatToCartesian(path[0]);
        } else {
            var p0 = ellipsoid.lonLatToCartesian(path[path.length - 1]),
                p1 = ellipsoid.lonLatToCartesian(path[path.length - 2]);
            first = new og.math.Vector3(p0.x + p0.x - p1.x, p0.y + p0.y - p1.y, p0.z + p0.z - p1.z);
        }

        v[k++] = first.x;
        v[k++] = first.y;
        v[k++] = first.z;
        v[k++] = first.x;
        v[k++] = first.y;
        v[k++] = first.z;
        v[k++] = first.x;
        v[k++] = first.y;
        v[k++] = first.z;
        v[k++] = first.x;
        v[k++] = first.y;
        v[k++] = first.z;
    }
};

/**
 * Clear Polyline object data.
 * @public
 */
og.Polyline.prototype.clear = function () {
    this._vertices.length = 0;
    this._orders.length = 0;
    this._indexes.length = 0;
    this._vertices = [];
    this._orders = [];
    this._indexes = [];

    this._deleteBuffers();
};

/**
 * Sets Polyline RGBA color.
 * @public
 * @param {number} r - Red color.
 * @param {number} g - Green color.
 * @param {number} b - Blue color.
 * @param {number} [a] - Opacity.
 */
og.Polyline.prototype.setColor = function (r, g, b, a) {
    this.color.x = r;
    this.color.y = g;
    this.color.z = b;
    a && (this.color.w = a);
};

/**
 * Sets Polyline RGB color.
 * @public
 * @param {og.math.Vector3} color - RGB color.
 */
og.Polyline.prototype.setColor3v = function (color) {
    this.color.x = color.x;
    this.color.y = color.y;
    this.color.z = color.z;
};

/**
 * Sets Polyline RGBA color.
 * @public
 * @param {og.math.Vector4} color - RGBA color.
 */
og.Polyline.prototype.setColor4v = function (color) {
    this.color.x = color.x;
    this.color.y = color.y;
    this.color.z = color.z;
    this.color.w = color.w;
};

/**
 * Sets Polyline opacity.
 * @public
 * @param {number} opacity - Opacity.
 */
og.Polyline.prototype.setOpacity = function (opacity) {
    this.color.w = opacity;
};

/**
 * Sets Polyline thickness in screen pixels.
 * @public
 * @param {number} thickness - Thickness.
 */
og.Polyline.prototype.setThickness = function (thickness) {
    this.thickness = thickness;
};

/**
 * Returns thickness.
 * @public
 * @return {number} Thickness in screen pixels.
 */
og.Polyline.prototype.getThickness = function () {
    return this.thickness;
};

/**
 * Sets visibility.
 * @public
 * @param {boolean} visibility - Polyline visibility.
 */
og.Polyline.prototype.setVisibility = function (visibility) {
    this.visibility = visibility;
};

/**
 * Gets Polyline visibility.
 * @public
 * @return {boolean} Polyline visibility.
 */
og.Polyline.prototype.getVisibility = function () {
    return this.visibility;
};

/**
 * Assign with render node.
 * @public
 */
og.Polyline.prototype.setRenderNode = function (renderNode) {
    this._renderNode = renderNode;
    if (this._pathLonLat.length) {
        this._createDataLonLat(this._pathLonLat);
    } else {
        this._createData3v(this._path3v);
    }
};

/**
 * @protected
 */
og.Polyline.prototype._clearData = function () {
    this._vertices.length = 0;
    this._orders.length = 0;
    this._indexes.length = 0;

    this._vertices = [];
    this._orders = [];
    this._indexes = [];
};

/**
 * @protected
 */
og.Polyline.prototype._createData3v = function (path3v) {
    this._clearData();
    og.Polyline.appendLineData3v(path3v, this._closedLine, this._vertices, this._orders, this._indexes,
        this._renderNode.ellipsoid, this._pathLonLat, this._pathLonLatMerc);
};

/**
 * @protected
 */
og.Polyline.prototype._createDataLonLat = function (pathLonlat) {
    this._clearData();
    og.Polyline.appendLineDataLonLat(pathLonlat, this._closedLine, this._vertices, this._orders, this._indexes,
        this._renderNode.ellipsoid, this._path3v, this._pathLonLatMerc);
};


/**
 * Removes from entity.
 * @public
 */
og.Polyline.prototype.remove = function () {
    this._entity = null;
    this.clear();
    this._handler && this._handler.remove(this);
};

og.Polyline.prototype.setPickingColor3v = function (color) {
    this._pickingColor[0] = color.x / 255.0;
    this._pickingColor[1] = color.y / 255.0;
    this._pickingColor[2] = color.z / 255.0;
};

/**
 * Returns Polyline path cartesian coordinates.
 * @return {Array.<og.math.Vector3>} Polyline path.
 */
og.Polyline.prototype.getPath3v = function () {
    return this._path3v;
};

/**
 * Returns Polyline geodetic path coordinates.
 * @return {Array.<og.LonLat>} Polyline path.
 */
og.Polyline.prototype.getPathLonLat = function () {
    return this._pathLonLat;
};

/**
 * Sets Polyline geodetic coordinates.
 * @public
 * @param {Array.<Array.<number,number,number>>} path - Polyline path cartesian coordinates.
 */
og.Polyline.prototype.setPathLonLat = function (pathLonLat, forceEqual) {
    if (this._renderNode && this._renderNode.ellipsoid) {
        if (forceEqual) {
            this._setEqualPathLonLat(pathLonLat);
            this._changedBuffers[og.Polyline.VERTICES_BUFFER] = true;
        } else {
            this._createDataLonLat(pathLonLat);
            this._changedBuffers[og.Polyline.VERTICES_BUFFER] = true;
            this._changedBuffers[og.Polyline.INDEX_BUFFER] = true;
        }
    } else {
        this._pathLonLat = [].concat(pathLonLat);
    }
};

/**
 * Sets Polyline cartesian coordinates.
 * @public
 * @param {Array.<Array.<number,number,number>>} path - Polyline path cartesian coordinates.
 */
og.Polyline.prototype.setPath3v = function (path3v, forceEqual) {
    if (this._renderNode) {
        if (forceEqual) {
            this._setEqualPath3v(pathLonLat);
            this._changedBuffers[og.Polyline.VERTICES_BUFFER] = true;
        } else {
            this._createData3v(path3v);
            this._changedBuffers[og.Polyline.VERTICES_BUFFER] = true;
            this._changedBuffers[og.Polyline.INDEX_BUFFER] = true;
        }
    } else {
        this._path3v = [].concat(path3v);
    }
};

og.Polyline.prototype.draw = function () {
    if (this.visibility && this._path3v.length) {

        this._update();

        var rn = this._renderNode;
        var r = rn.renderer;
        var sh = r.handler.shaderPrograms.polyline;
        var p = sh._program;
        var gl = r.handler.gl,
            sha = p.attributes,
            shu = p.uniforms;

        sh.activate();

        gl.enable(gl.BLEND);
        gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.CULL_FACE);

        gl.uniformMatrix4fv(shu.proj._pName, false, r.activeCamera._projectionMatrix._m);
        gl.uniformMatrix4fv(shu.view._pName, false, r.activeCamera._viewMatrix._m);

        if (r.isMultiFramebufferCompatible()) {
            gl.uniform3fv(shu.pickingColor._pName, [this._pickingColor[0], this._pickingColor[1], this._pickingColor[2]]);
        }

        gl.uniform4fv(shu.color._pName, this.color.toVec());
        gl.uniform3fv(shu.uCamPos._pName, r.activeCamera.eye.toVec());
        gl.uniform2fv(shu.uFloatParams._pName, [rn._planetRadius2 || 0.0, r.activeCamera._tanViewAngle_hradOneByHeight]);
        gl.uniform2fv(shu.viewport._pName, [r.handler.canvas.width, r.handler.canvas.height]);
        gl.uniform1f(shu.thickness._pName, this.thickness * 0.5);

        var v = this._verticesBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, v);
        gl.vertexAttribPointer(sha.prev._pName, v.itemSize, gl.FLOAT, false, 12, 0);
        gl.vertexAttribPointer(sha.current._pName, v.itemSize, gl.FLOAT, false, 12, 48);
        gl.vertexAttribPointer(sha.next._pName, v.itemSize, gl.FLOAT, false, 12, 96);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._ordersBuffer);
        gl.vertexAttribPointer(sha.order._pName, this._ordersBuffer.itemSize, gl.FLOAT, false, 4, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexesBuffer);
        gl.drawElements(gl.TRIANGLE_STRIP, this._indexesBuffer.numItems, gl.UNSIGNED_INT, 0);
    }
};

og.Polyline.prototype.drawPicking = function () {
    if (this.visibility && this._path3v.length) {

        var rn = this._renderNode;
        var r = rn.renderer;
        var sh = r.handler.shaderPrograms.polyline;
        var p = sh._program;
        var gl = r.handler.gl,
            sha = p.attributes,
            shu = p.uniforms;

        sh.activate();

        gl.disable(gl.BLEND);
        gl.disable(gl.CULL_FACE);

        gl.uniformMatrix4fv(shu.proj._pName, false, r.activeCamera._projectionMatrix._m);
        gl.uniformMatrix4fv(shu.view._pName, false, r.activeCamera._viewMatrix._m);

        gl.uniform4fv(shu.color._pName, [this._pickingColor[0], this._pickingColor[1], this._pickingColor[2], 1.0]);
        gl.uniform3fv(shu.uCamPos._pName, r.activeCamera.eye.toVec());
        gl.uniform2fv(shu.uFloatParams._pName, [rn._planetRadius2 || 0.0, r.activeCamera._tanViewAngle_hradOneByHeight]);
        gl.uniform2fv(shu.viewport._pName, [r.handler.canvas.width, r.handler.canvas.height]);
        gl.uniform1f(shu.thickness._pName, this.thickness * 0.5);

        var v = this._verticesBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, v);
        gl.vertexAttribPointer(sha.prev._pName, v.itemSize, gl.FLOAT, false, 12, 0);
        gl.vertexAttribPointer(sha.current._pName, v.itemSize, gl.FLOAT, false, 12, 48);
        gl.vertexAttribPointer(sha.next._pName, v.itemSize, gl.FLOAT, false, 12, 96);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._ordersBuffer);
        gl.vertexAttribPointer(sha.order._pName, this._ordersBuffer.itemSize, gl.FLOAT, false, 4, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexesBuffer);
        gl.drawElements(gl.TRIANGLE_STRIP, this._indexesBuffer.numItems, gl.UNSIGNED_INT, 0);

        gl.enable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
    }
};

/**
 * Refresh buffers.
 * @protected
 */
og.Polyline.prototype._refresh = function () {
    var i = this._changedBuffers.length;
    while (i--) {
        this._changedBuffers[i] = true;
    }
};


/**
 * Updates render buffers.
 * @protected
 */
og.Polyline.prototype._update = function () {
    if (this._renderNode) {
        var i = this._changedBuffers.length;
        while (i--) {
            if (this._changedBuffers[i]) {
                this._buffersUpdateCallbacks[i].call(this);
                this._changedBuffers[i] = false;
            }
        }
    }
};

/**
 * Clear GL buffers.
 * @protected
 */
og.Polyline.prototype._deleteBuffers = function () {
    if (this._renderNode) {
        var r = this._renderNode.renderer,
            gl = r.handler.gl;

        gl.deleteBuffer(this._verticesBuffer);
        gl.deleteBuffer(this._ordersBuffer);
        gl.deleteBuffer(this._indexesBuffer);

        this._verticesBuffer = null;
        this._ordersBuffer = null;
        this._indexesBuffer = null;
    }
};

/**
 * Creates gl main data buffer.
 * @private
 */
og.Polyline.prototype._createVerticesBuffer = function () {
    var h = this._renderNode.renderer.handler;
    h.gl.deleteBuffer(this._mainBuffer);
    this._verticesBuffer = h.createArrayBuffer(new Float32Array(this._vertices), 3, this._vertices.length / 3);
};

/**
 * Creates gl main daya index buffer.
 * @private
 */
og.Polyline.prototype._createIndexBuffer = function () {
    var h = this._renderNode.renderer.handler;
    h.gl.deleteBuffer(this._orderBuffer);
    h.gl.deleteBuffer(this._indexBuffer);
    this._ordersBuffer = h.createArrayBuffer(new Float32Array(this._orders), 1, this._orders.length / 2);
    this._indexesBuffer = h.createElementArrayBuffer(new Uint32Array(this._indexes), 1, this._indexes.length);
};

og.Polyline.prototype.getExtent = function () {
    return this._extent.clone();
};