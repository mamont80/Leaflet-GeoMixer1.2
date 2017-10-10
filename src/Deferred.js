//all the methods can be called without instance itself
//For example:
//
// var def = new Deferred();
// doSomething(def.resolve) (instead of doSomething(def.resolve.bind(def))
var Deferred = function(cancelFunc) {
    var resolveCallbacks = [],
        rejectCallbacks = [],
        isFulfilled = false,
        isResolved = false,
        fulfilledData,
        onceAdded = false,
        isCancelled = false;

    var fulfill = this._fulfill = function(resolved /*, data*/) {
        if (isFulfilled) {
            return;
        }
        var callbacks = resolved ? resolveCallbacks : rejectCallbacks;
        fulfilledData = [].slice.call(arguments, 1);
        isFulfilled = true;
        isResolved = resolved;

        callbacks.forEach(function(callback) { callback.apply(null, fulfilledData); });
        resolveCallbacks = rejectCallbacks = [];
    };

    this.resolve = function(/*data*/) {
        isCancelled || fulfill.apply(null, [true].concat([].slice.call(arguments)));
    };

    this.reject = function(/*data*/) {
        isCancelled || fulfill.apply(null, [false].concat([].slice.call(arguments)));
    };

    var cancel = this.cancel = function() {
        if (!isCancelled && !isFulfilled) {
            isCancelled = true;
            cancelFunc && cancelFunc();
        }
    };

    var then = this.then = function(resolveCallback, rejectCallback) {
        if (isCancelled) {
            return null;
        }

        var userFuncDef = null;
        var def = new Deferred(function() {
            cancel();
            userFuncDef && userFuncDef.cancel();
        });

        var fulfillFunc = function(func, resolved) {
            return function(/*data*/) {
                if (!func) {
                    def._fulfill.apply(null, [resolved].concat([].slice.call(arguments)));
                } else {
                    var res = func.apply(null, arguments);
                    if (res instanceof Deferred) {
                        userFuncDef = res;
                        res.then(def.resolve, def.reject);
                    } else {
                        def.resolve(res);
                    }
                }
            };
        };

        if (isFulfilled) {
            fulfillFunc(isResolved ? resolveCallback : rejectCallback, isResolved).apply(null, fulfilledData);
        } else {
            resolveCallbacks.push(fulfillFunc(resolveCallback, true));
            rejectCallbacks.push(fulfillFunc(rejectCallback, false));
        }
        return def;
    };

    this.once = function(onceResolveCallback) {
        if (!onceAdded) {
            onceAdded = true;
            then(onceResolveCallback);
        }
    };

    this.always = function(callback) {
        then(callback, callback);
    };

    this.getFulfilledData = function() {
        return fulfilledData;
    };
};

Deferred.all = function() {
    var defArray = [].slice.apply(arguments);
    var resdef = new Deferred();
    var left = defArray.length;
    var results = new Array(defArray.length);

    if (left) {
        defArray.forEach(function(def, i) {
            def.then(function(res) {
                results[i] = res;
                left--;
                if (left === 0) {
                    resdef.resolve.apply(resdef, results);
                }
            }, function() {
                resdef.reject();
            });
        });
    } else {
        resdef.resolve();
    }

    return resdef;
};

L.gmx = L.gmx || {};
L.gmx.Deferred = Deferred;
