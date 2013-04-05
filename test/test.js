var casper = require('../index'),
    _ = require('underscore'),
    test = require('tap').test,
    sinon = require('sinon');

// ==================================
// Fixtures
// ==================================

var res = {};
var setup = function () {
  res.send = res.json = res.jsonp = sinon.spy(function () {
    console.log.apply(console, [].slice.call(arguments));
  });
};
setup();

var app = {};
app.get = app.post = function (path) {

  var req = {};
  req.params = [];
  req.body = {
    testKey: true,
    stringKey: 'tom',
    numKey: 10
  };

  req.params = (path.match(/[a-zA-Z]+/g) || []).reduce(function (memo, param) {
    memo[param] = true;
    return memo;
  }, {});

  console.log(req.params);

  var cbs = [].slice.call(arguments, 1),
      doNext = true;
  cbs.forEach(function (cb) {
    if (!doNext) return;
    doNext = false;
    cb(req, res, function () {
      console.log("next()");
      doNext = true;
    });
  });
};

var fakeDoc = {};
fakeDoc.save = function (cb) { return cb(null, this); };
var FakeModel = function (obj) {
  var doc = Object.create(fakeDoc);
  return _.extend(doc, obj);
};
FakeModel.find = function () {
  return {
    exec: function (cb) {
      cb(null, new FakeModel({ name: 'Fakey McFake' }));
    }
  };
};
FakeModel.findWithError = function () {
  return {
    exec: function (cb) {
      cb(new Error("Shit broke"));
    }
  };
};
FakeModel.findWithNoResults = function () {
  return {
    exec: function (cb) {
      cb(null, []);
    }
  };
};
FakeModel.findWithFalsyData = function () {
  return {
    exec: function (cb) {
      cb(null, null);
    }
  };
};

// ==================================
// Examples
// ==================================

// ==================================
// General
// ==================================
test('general', function (t) {

  t.test('noop with no data', function (t) {
    setup();
    app.get('/', casper.noop());
    t.ok(res.jsonp.calledOnce, 'jsonp was called');
    t.ok(res.jsonp.calledWith({}), 'jsonp was called correct data');
    t.end();
  });

  t.test('noop with no data', function (t) {
    setup();
    var data = { status: 'great' };
    app.get('/', casper.noop(data));
    t.ok(res.jsonp.calledOnce, 'jsonp was called');
    t.ok(res.jsonp.calledWith(data), 'jsonp was called correct data');
    t.end();
  });

  t.end();

});


// ==================================
// Database
// ==================================
test('database', function (t) {

  t.test('sends data with 200', function (t) {
    setup();
    app.get('/', function (req, res) {
      FakeModel
        .find()
        .exec(casper.db(req, res));
    });
    t.ok(res.jsonp.calledOnce, 'jsonp was called once');
    t.end();
  });

  t.test('sends 500 with errors', function (t) {
    setup();
    app.get('/', function (req, res) {
      FakeModel
        .findWithError()
        .exec(casper.db(req, res));
    });
    t.ok(res.jsonp.withArgs(500).calledOnce, '500 jsonp was called once');
    t.end();
  });

  t.test('sends 404 with no reults', function (t) {
    setup();
    app.get('/', function (req, res) {
      FakeModel
        .findWithNoResults()
        .exec(casper.db(req, res));
    });
    t.ok(res.jsonp.withArgs(404, []).calledOnce, '404 jsonp was called once');
    t.end();
  });

  t.test('sends 404 with no reults', function (t) {
    setup();
    app.get('/', function (req, res) {
      FakeModel
        .findWithFalsyData()
        .exec(casper.db(req, res));
    });
    t.ok(res.jsonp.withArgs(404, {}).calledOnce, '404 jsonp was called once');
    t.end();
  });

  t.end();

});

// ==================================
// Checks & filters
// ==================================
test('checks & filters', function (t) {

  t.test('missing parameter is caught', function (t) {
    setup();
    app.get('/',
            casper.check.params('testParam'),
            casper.noop());
    app.get('/:testParam',
            casper.check.params('testParam'),
            casper.noop());
    t.ok(res.jsonp.withArgs(400).calledOnce, '400 jsonp was called once');
    t.ok(res.jsonp.withArgs({}).calledOnce, '200 jsonp called once');
    t.end();
  });

  t.test('present parameter is allowed', function (t) {
    setup();
    app.get('/',
            casper.check.body('fakeKey'),
            casper.noop());
    app.get('/',
            casper.check.body('testKey'),
            casper.noop());
    t.ok(res.jsonp.withArgs(400).calledOnce, '400 jsonp was called once');
    t.ok(res.jsonp.withArgs({}).calledOnce, '200 jsonp called once');
    t.end();
  });

  t.test('key is removed from body', function (t) {
    setup();
    var spy = sinon.spy(casper.noop());
    app.get('/',
            casper.rm('testKey'),
            function (req, res) {
              t.notOk(req.body.testKey, 'Test key removed.');
              t.end();
            });
  });

  t.test('only supplied key is allowed in body', function (t) {
    setup();
    var spy = sinon.spy(casper.noop());
    app.get('/',
            casper.allow.body('stringKey'),
            function (req, res) {
              t.notOk(req.body.testKey, 'Test key removed.');
              t.notOk(req.body.numKey, 'Test key removed.');
              t.end();
            });
  });

  t.test('only array of keys are allowed in body', function (t) {
    setup();
    var spy = sinon.spy(casper.noop());
    app.get('/',
            casper.allow.body(['stringKey', 'numKey']),
            function (req, res) {
              t.notOk(req.body.testKey, 'Test key removed.');
              t.end();
            });
  });

  t.end();
});


// ==================================
// Logging
// ==================================
app.get('/:testParam',
        casper.log.the('params'),
        casper.noop());

app.get('/:testParam',
        casper.log.the('params.testParam'),
        casper.noop());

// ==================================
// Utils
// ==================================
test('utilities', function (t) {
  t.test('atString', function (t) {
    t.test('nested objects', function (t) {
      var res = casper.util.atString({ a: { b: 20 } }, 'a.b');
      t.equal(res, 20, 'Data in nested object retrieved correctly.');
      t.end();
    });
    t.test('nested array', function (t) {
      var res = casper.util.atString({ a: [ 0, 10, 20 ] }, 'a[1]');
      t.equal(res, 10, 'Data in nested array retrieved correctly.');
      t.end();
    });
    t.test('deply nested object in array', function (t) {
      var res = casper.util.atString({ a: [ { b: 0 }, 10, 20 ] }, 'a[0].b');
      t.equal(res, 0, 'Data deeply nested retrieved correctly.');
      t.end();
    });
    t.test('sets value of object', function (t) {
      var data = { a: [ { b: 0 }, 10, 20 ] };
      var res = casper.util.atString(data, 'a[0].b', 10);
      t.equal(data.a[0].b, 10, 'Data deeply nested modified correctly.');
      t.end();
    });
    t.end();
  });
  t.end();
});
