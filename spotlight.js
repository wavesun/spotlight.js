/*!
 * Spotlight.js v1.0.0-pre <http://github.com/bestiejs/spotlight.js/>
 * Copyright 2011-2013 John-David Dalton <http://allyoucanleet.com/>
 * Based on Waldo <http://github.com/angus-c/waldo/>,
 * Copyright 2011-2013 Angus Croll <http://javascriptweblog.wordpress.com/>
 * Both available under MIT license <http://mths.be/mit>
 */
;(function(root, undefined) {
  'use strict';

  /** Backup possible global object */
  var oldRoot = root;

  /** Used as the starting point(s) for the object crawler */
  var defaultRoots = [{ 'object': root, 'path': 'window' }];

  /** Detect free variable `define` */
  var freeDefine = typeof define == 'function' &&
    typeof define.amd == 'object' && define.amd && define;

  /** Detect free variable `exports` */
  var freeExports = typeof exports == 'object' && exports;

  /** Detect free variable `module` */
  var freeModule = typeof module == 'object' && module && module.exports == freeExports && module;

  /** Detect free variable `require` */
  var freeRequire = typeof require == 'function' && require;

  /** Detect free variable `global`, from Node.js or Browserified code, and use it as `root` */
  var freeGlobal = typeof global == 'object' && global;
  if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
    root = freeGlobal;
  }

  /** Used to resolve a value's internal [[Class]] */
  var toString = {}.toString;

  /** Used to detect if a method is native */
  var reNative = RegExp('^' +
    String(toString)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/toString| for [^\]]+/g, '.*?') + '$'
  );

  /** Used to determine if values are of the language type Object */
  var objectTypes = {
    'boolean': false,
    'function': true,
    'object': true,
    'number': false,
    'string': false,
    'undefined': false
  };

  /** Get Lo-Dash reference */
  var _ = root && root._ || req('lodash');

  /** Used to get and set __iterator__ descriptors */
  var getDescriptor = isNative(getDescriptor = Object.getOwnPropertyDescriptor) && getDescriptor,
      setDescriptor = isNative(setDescriptor = Object.defineProperty) && setDescriptor;

  /** Filter functions used by `crawl` */
  var filters = {
    'custom': function(value, key, object) {
      // the `this` binding is set by `crawl()`
      return value.call(this, object[key], key, object);
    },
    'kind': function(value, key, object) {
      var kind = [value, value = object[key]][0];
      return kind == '*' || (_.isFunction(kind)
        ? value instanceof kind
        : typeof value == kind || getKindOf(value).toLowerCase() == kind.toLowerCase()
      );
    },
    'name': function(value, key, object) {
      return value == key;
    },
    'value': function(value, key, object) {
      return object[key] === value;
    }
  };

  /** Used to flag environments features */
  var support = {

    /** Detect ES5 property descriptor API */
    'descriptors' : (function() {
      // IE 8 only accepts DOM elements
      try {
        var o = {};
        setDescriptor(o, o, o);
        var result = 'value' in getDescriptor(o, o);
      } catch(e) { };
      return !!result;
    }()),

    /**
     * Detect JavaScript 1.7 iterators
     * https://developer.mozilla.org/en/new_in_javascript_1.7#Iterators
     */
    'iterators': (function() {
      try {
        var o = Iterator({ '': 1 });
        for (o in o) { }
      } catch(e) { }
      return _.isArray(o);
    }())
  };

  /*--------------------------------------------------------------------------*/

  /**
   * Iterates over an object's own properties, executing the `callback` for each.
   *
   * @private
   * @param {Object} object The object to iterate over.
   * @param {Function} callback A function executed per own property.
   */
  function forOwn(object, callback) {
    object = Object(object);

    try {
      // avoid problems with iterators
      // https://github.com/ringo/ringojs/issues/157
      if (support.iterators && _.isFunction(object.__iterator__)) {
        var iterator = support.descriptors
          ? getDescriptor(object, '__iterator__')
          : object.__iterator__;

        object.__iterator__ = null;
        delete object.__iterator__;

        if (object.__iterator__) {
          throw 1;
        }
        object = new Iterator(object);
        if (support.descriptors) {
          setDescriptor(object, '__iterator__', iterator);
        } else {
          object.__iterator__ = iterator;
        }
      }
      // some objects like Firefox 3's `XPCSafeJSObjectWrapper.prototype` may
      // throw errors when attempting to iterate over them
      else {
        for (var key in object) {
          break;
        }
      }
    } catch(e) {
      return;
    }
    if (iterator) {
      for (key in object) {
        // iterators will assign an array to `key`
        callback(key[1], key[0], object);
      }
    }
    else {
      var index = -1,
          props = _.keys(object),
          length = props.length;

      while (++index < length) {
        // some properties like Firefox's `console.constructor` or IE's
        // `element.offsetParent` may throw errors when accessed
        try {
          key = props[index];
          var value = object[key];
        } catch(e) {
          continue;
        }
        callback(value, key, object);
      }
    }
  }

  /**
   * Gets the internal `[[Class]]` of a given `value`.
   *
   * @private
   * @param {*} value The value to inspect.
   * @returns {string} Returns the value's internal `[[Class]]`.
   */
  function getClass(value) {
    if (value == null) {
      return value === null ? 'Null' : 'Undefined';
    }
    try {
      var result = (result = /^\[object (.*?)\]$/.exec(toString.call(value))) && result[1];
    } catch(e) { }

    return result || '';
  }

  /**
   * Mimics ES 5.1's `Object.prototype.toString` behavior by returning the
   * value's [[Class]], "Null" or "Undefined" as well as other non-spec'ed results
   * like "Constructor" and "Global" .
   *
   * @private
   * @param {*} value The value to check.
   * @returns {string} Returns a string representing the kind of `value`.
   */
  function getKindOf(value) {
    var result;

    if (value == null) {
      result = value === null ? 'Null' : 'Undefined';
    }
    else if (value == root) {
      result = 'Global';
    }
    else if (_.isFunction(value) && isHostType(value, 'prototype')) {
      // a function is assumed of kind "Constructor" if it has its own
      // enumerable prototype properties or doesn't have a [[Class]] of Object
      try {
        if (getClass(value.prototype) == 'Object') {
          for (var key in value.prototype) {
            result = 'Constructor';
            break;
          }
        } else {
          result = 'Constructor';
        }
      } catch(e) { }
    }
    return result || getClass(value) ||
      (result = typeof value, result.charAt(0).toUpperCase() + result.slice(1))
  }

  /**
   * Host objects can return type values that are different from their actual
   * data type. The objects we are concerned with usually return non-primitive
   * types of object, function, or unknown.
   *
   * @private
   * @param {mixed} object The owner of the property.
   * @param {string} property The property to check.
   * @returns {boolean} Returns `true` if the property value is a non-primitive, else `false`.
   */
  function isHostType(object, property) {
    var type = object != null ? typeof object[property] : 'number';
    return objectTypes[type] && (type == 'object' ? !!object[property] : true);
  }

  /**
   * Checks if `value` is a native function.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if the `value` is a native function, else `false`.
   */
  function isNative(value) {
    return typeof value == 'function' && reNative.test(value);
  }

  /**
   * A wrapper around require() to suppress `module missing` errors.
   *
   * @private
   * @param {string} id The module id.
   * @returns {*} The exported module or `null`.
   */
  function req(id) {
    try {
      var result = freeExports && freeRequire(id);
    } catch(e) { }
    return result || null;
  }

  /*--------------------------------------------------------------------------*/

  /**
   * Performs argument type checks and calls `crawl()` with specified arguments.
   *
   * @private
   * @param {string} name The name of the filter function passed.
   * @param {string} expected The data type expected of the given value.
   * @param {*} value A generic argument passed to the callback.
   * @param {Object} [options={}] The options object passed.
   * @returns {Array|null} If in debug mode return the value of the invoked function or `null` if errored.
   */
  function checkCall(name, expected, value, options) {
    var result = (!expected || RegExp('^(?:' + expected + ')$', 'i').test(getKindOf(value)))
      ? crawl(name, value, options)
      : (log('error', '`' + value + '` must be a ' + expected.split('|').join(' or ')), null);

    return spotlight.debug ? result : undefined;
  }

  /**
   * Crawls environment objects logging all properties that pass the callback filter.
   *
   * @private
   * @param {Function|string} callback A function executed per object encountered.
   * @param {*} callbackArg An argument passed to the callback.
   * @param {Object} [options={}] The options object.
   * @returns {Array} An array of arguments passed to each `console.log()` call.
   */
  function crawl(callback, callbackArg, options) {
    callback = filters[callback] || callback;
    options || (options = {});

    var data,
        index,
        pool,
        pooled,
        queue,
        separator,
        roots = defaultRoots.slice(),
        object = options.object || roots[0].object,
        path = options.path,
        result = [];

    // resolve undefined path
    if (path == null) {
      path = (
        _.find(roots, function(data) {
          return object == data.object;
        }) ||
        { 'path': '<object>' }
      ).path;
    }
    // resolve object roots
    if (options.object) {
      roots = [{ 'object': object, 'path': path }];
    }
    // crawl all root objects
    while ((data = roots.pop())) {
      index = 0;
      object = data.object;
      path = data.path;
      data = { 'object': object, 'path': path, 'pool': [object] };
      queue = [];

      // a non-recursive solution to avoid call stack limits
      // http://www.jslab.dk/articles/non.recursive.preorder.traversal.part4
      do {
        object = data.object;
        path = data.path;
        separator = path ? '.' : '';

        forOwn(object, function(value, key) {
          // inspect objects
          if (_.isPlainObject(value)) {
            // clone current pool per prop on the current `object` to avoid
            // sibling properties from polluting each others object pools
            pool = data.pool.slice();

            // check if already pooled (prevents infinite loops when handling circular references)
            pooled = _.find(pool, function(data) {
              return value == data.object;
            });
            // add to the "call" queue
            if (!pooled) {
              pool.push({ 'object': value, 'path': path + separator + key, 'pool': pool });
              queue[queue.length] = pool[pool.length - 1];
            }
          }
          // if filter passed, log it
          // (IE may throw errors coercing properties like `window.external` or `window.navigator`)
          try {
            if (callback.call(data, callbackArg, key, object)) {
              result.push([
                path + separator + key + ' -> (' +
                (true && pooled ? '<' + pooled.path + '>' : getKindOf(value).toLowerCase()) + ')',
                value
              ]);
              log('text', result[result.length - 1][0], value);
            }
          } catch(e) { }
        });
      } while ((data = queue[index++]));
    }
    return result;
  }

  /**
   * Logs a message to the console.
   *
   * @private
   * @param {string} type The log type, either "text" or "error".
   * @param {string} message The log message.
   * @param {*} value An additional value to log.
   */
  function log() {
    var defaultCount = 2,
        console = typeof root.console == 'object' && root.console,
        document = typeof root.document == 'object' && root.document,
        phantom = typeof root.phantom == 'object' && root.phantom,
        JSON = typeof root.JSON == 'object' && _.isFunction(root.JSON && root.JSON.stringify) && root.JSON;

    // lazy define
    log = function(type, message, value) {
      var argCount = defaultCount,
          method = 'log';

      if (type == 'error') {
        argCount = 1;
        if (isHostType(console, type)) {
          method = type;
        } else {
          message = type + ': ' + message;
        }
      }
      // avoid logging if in debug mode and running from the CLI
      if (!spotlight.debug || (document && !phantom)) {
        // because `console.log` is a host method we don't assume `.apply()` exists
        if (argCount < 2) {
          if (JSON) {
            value = [JSON.stringify(value), value];
            value = value[0] == 'null' ? value[1] : value[0];
          }
          console[method](message + (type == 'error' ? '' : ' ' + value));
        } else {
          console[method](message, value);
        }
      }
    };

    // for Narwhal, Rhino, or RingoJS
    if (!console && !document && _.isFunction(root.print)) {
      console = { 'log': print };
    }
    // use noop for no log support
    if (!isHostType(console, 'log')) {
      log = function() { };
    }
    // avoid Safari 2 crash bug when passing more than 1 argument
    else if (console.log.length == 1) {
      defaultCount = 1;
    }
    return log.apply(null, arguments);
  }

  /*--------------------------------------------------------------------------*/

  /**
   * Crawls environment objects logging all object properties whose values
   * are of a specified constructor instance, [[Class]], or type.
   *
   * @memberOf spotlight
   * @param {Function|string} kind The constructor, [[Class]], or type to check against.
   * @param {Object} [options={}] The options object.
   * @example
   *
   * // by constructor
   * spotlight.byKind(jQuery);
   *
   * // or by [[Class]]
   * spotlight.byKind('RegExp');
   *
   * // or by type
   * spotlight.byKind('undefined');
   *
   * // or special kind "constructor"
   * spotlight.byKind('constructor');
   */
  function byKind(kind, options) {
    return checkCall('kind', 'function|string', kind, options);
  }

  /**
   * Crawls environment objects logging all object properties of the specified name.
   *
   * @memberOf spotlight
   * @param {string} name The property name to search for.
   * @param {Object} [options={}] The options object.
   * @example
   *
   * // basic
   * spotlight.byName('length');
   * // > window.length -> (number) 0
   *
   * // or with options
   * // (finds all "map" properties on jQuery)
   * spotlight.byName('map', { 'object': jQuery, 'path': '$' });
   * // > $.map -> (function) function(a,b,c){...}
   * // > $.fn.map -> (function) function(a){...}
   */
  function byName(name, options) {
    return checkCall('name', 'string', name, options);
  }

  /**
   * Crawls environment objects logging all object properties whose values are
   * a strict match for the specified value.
   *
   * @memberOf spotlight
   * @param {*} value The value to search for.
   * @param {Object} [options={}] The options object.
   * @example
   *
   * // basic
   * spotlight.byValue(0);
   * // > window.pageXOffset -> (number) 0
   * // > window.screenX -> (number) 0
   * // > window.length -> (number) 0
   */
  function byValue(value, options) {
    return checkCall('value', null, value, options);
  }

  /**
   * Crawls environment objects executing `callback`, passing the current
   * `value`, `key`, and `object` as arguments, against each object encountered
   * and logs properties for which `callback` returns true.
   *
   * @memberOf spotlight
   * @param {Function} callback A function executed per object.
   * @param {Object} [options={}] The options object.
   * @example
   *
   * // filter by property names containing "oo"
   * spotlight.custom(function(value, key) { return key.indexOf('oo') > -1; });
   *
   * // or filter by falsey values
   * spotlight.custom(function(value) { return !value; });
   */
  function custom(callback, options) {
    return checkCall('custom', 'function', callback, options);
  }

  /*--------------------------------------------------------------------------*/

  /**
   * The primary namespace.
   *
   * @type Object
   */
  var spotlight = {

    /**
     * A flag to indicate that methods will execute in debug mode.
     *
     * @memberOf spotlight
     * @type boolean
     */
    'debug': false,

    /**
     * The semantic version number.
     *
     * @static
     * @memberOf spotlight
     * @type string
     */
    'version': '1.0.0-pre',

    // searches for props by constructor instance, type, or [[Class]]
    'byKind': byKind,

    // searches for props by name
    'byName': byName,

    // searches for props by strict value matches
    'byValue': byValue,

    // executes a custom function per object
    'custom': custom
  };

  /*--------------------------------------------------------------------------*/

  // mod `defaultRoots` for server-side environments
  // for Narwhal, Node.js, or RingoJS
  if (freeExports && freeGlobal) {
    defaultRoots = [{ 'object': freeGlobal, 'path': 'global' }];
    // for the Narwhal REPL
    if (oldRoot != freeGlobal) {
      defaultRoots.unshift({ 'object': oldRoot, 'path': '<module scope>' });
    }
    // avoid explicitly crawling exports if it's crawled indirectly
    if (!(freeGlobal.exports == freeExports || oldRoot.exports == freeExports)) {
      defaultRoots.unshift({ 'object': freeExports, 'path': 'exports' });
    }
  }
  // for Rhino
  else if (getKindOf(root.environment) == 'Environment') {
    defaultRoots[0].path = '<global object>';
  }

  /*--------------------------------------------------------------------------*/

  // expose spotlight
  // some AMD build optimizers like r.js check for condition patterns like the following:
  if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
    // define as an anonymous module so, through path mapping, it can be aliased
    define(spotlight);
  }
  // check for `exports` after `define` in case a build optimizer adds an `exports` object
  else if (freeExports  && !freeExports.nodeType) {
    // in Narwhal, Node.js, or RingoJS
    forOwn(spotlight, function(value, key) {
      freeExports[key] = value;
    });

    // assign `exports` to `spotlight` so we can detect changes to the `debug` flag
    spotlight = freeExports;
  }
  else {
    // in a browser or Rhino
    root.spotlight = spotlight;
  }
}(this));
