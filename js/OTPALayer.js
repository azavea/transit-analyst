/*
 * Class calls OTP indicators API
 *
 * TODO: make another, abstract class, to make choosing between
 * TODO: stop using `var self = this`, find official Leaflet way to do this
 * client-side/server-side classification/binning and rendering abstract/transparent
 */


L.OTPALayer = L.FeatureGroup.extend({

  options: {
    isochroneMinutes: 40,
    cutoffMinutes: 90,
    spinner: undefined
  },

  initialize: function (endpoint, options) {
    this._endpoint = endpoint;
    if (this._endpoint.slice(-1) !== '/') {
      this._endpoint += '/';
    }
    this._cutoffMinutes = options.cutoffMinutes;
    this._isochroneMinutes = options.isochroneMinutes;
    this._pointset = options.pointset;

    if (options.location) {
      this._location = L.latLng(options.location);
    }

    this._layers = [];
    this._pendingRequests = 0;

    options = L.setOptions(this, options);
  },

  addTo: function (map) {
    var self = this;

    if (!self._location) {
      self._location = map.getCenter();
    }

    // First, get available pointsets
    self._getPointsets(function(pointsets) {
      self._pointsets = pointsets;
      self.fireEvent('pointsets', {data: pointsets});
    });

    // When layer is added to map, also add LocationLayer
    // TODO: remove locationlayer when this layer is removed!
    this._locationLayer = L.marker(self._location, {'draggable': true})
        .on('dragend', function(e) {
          self.setLocation(e.target._latlng); // UPDATES ISOCHRONE WHEN PIN MOVED
        }).addTo(map);

    var lastLayer = null;
    var onEachPoint = function(style) {
        return function(feature, layer) {
          layer.on({
              mouseover: function highlightFeature(e) {
                  var layer = e.target;

                  if (lastLayer) {
                      lastLayer.setStyle(style());
                  }
                  layer.setStyle(self._highlightedPointsetStyle());
                  layer.bringToFront();

                  self.fireEvent('select', {data: layer.feature.properties});
              },

              mouseout: function resetHighlight(e) {
                  lastLayer = layer;
              }
          });
        }
    }

    this._pointsetLayer = L.geoJson([], {
      pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, self._pointsetStyle());
      },
      onEachFeature: onEachPoint(self._pointsetStyle)
    }).addTo(map);

    this._filteredPointsetLayer = L.geoJson([], {
      pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, self._filteredPointsetStyle());
      },
      onEachFeature: onEachPoint(self._filteredPointsetStyle)
    }).addTo(map);

    this._surfaceLayer = null;

    self.addLayer(this._locationLayer);

    self.addLayer(this._pointsetLayer);

    self._createSurface(this._location, true);

    return self;
  },

  setLocation: function (latlng) {
    var self = this;
    self._location = latlng;
    self._createSurface(self._location, false);
  },

  setPointset: function (pointset) {
    var self = this;
    self._pointset = pointset;
    // TODO: check if pointset is in self._pointsets
    self._getIndicator(self._surface.id, self._pointset);
  },

  setTimeLimit: function (timeLimit) {
    var self = this;
    if (self._sptId && self._indicatorId) {
      self._timeLimit = timeLimit;
      self._setView(self._indicatorId, self._timeLimit);
    }
  },

  _pointsetStyle: function() {
    return {
      radius: 4,
      fillColor: "#777",
      color: "#777",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    };
  },

  _filteredPointsetStyle: function() {
    return {
      radius: 4,
      fillColor: "#000",
      color: "#ddd",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    };
  },

  _highlightedPointsetStyle: function() {
    return {
      radius: 4,
      fillColor: "#90EE90",
      color: "#000",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    };
  },

  _createSurface: function(location, getPointset) {
    var self = this;

    this._otpRequestParams = 'fromPlace=' + location.lat + ',' + location.lng
        + '&date=2016-01-20&time=06:00pm'
        + '&maxWalkDistance=3218.69' // 2 mi
        + '&mode=TRANSIT,WALK';

    var path = 'surfaces?' 
        + this._otpRequestParams
        + '&cutoffMinutes=' + this._cutoffMinutes
        + '&batch=true';

    self._postJSON(path, function(json) {

      if (getPointset && self._pointset) {
        self._getPointset(self._pointset);
      }

      if (json && json.id) {
        self._surface = json;
        self._getIsochrones(json.id);
        if (self._pointset) {
          self._getIndicator(json.id, self._pointset);
        }
      }
    });
  },

  _getIndicator: function(surfaceId, pointset) {
    var self = this;
    var path = 'surfaces/' + surfaceId
        + '/indicator'
        + '?targets=' + pointset;
    this._getJSON(path, function(indicator) {
      self._indicator = indicator;
      self.fireEvent('change', {data: indicator});
      self._showFilteredPointset(self._isochroneMinutes);
    });
  },

  _showFilteredPointset: function(minutes) {
    var self = this;

    // Draw the filtered pointset layer based on what fits inside the isochrone

    var matches = 0;
    if (self._pointsetData) {
        self._filteredPointsetLayer.clearLayers();
        self._pointsetData.features.forEach(function(feature) {
            if (self._indicator && self._indicator.times[+feature.id] / 60 < self._isochroneMinutes) {
                self._filteredPointsetLayer.addData(feature);
            }
        });
    }
  },

  _getIsochrones: function(surfaceId) {
    var self = this;

    if (this._surfaceLayer != null) {
      map.removeLayer(this._surfaceLayer);
    }

    var tileUrl = 'http://localhost:8080/otp/surfaces/' + surfaceId + '/isotiles/{z}/{x}/{y}.png';
    self._surfaceLayer = L.tileLayer(tileUrl, {maxZoom:18}).addTo(map);
  },

  updateTime: function(minutes) {
    this._isochroneMinutes = minutes;

    var dfd = $.Deferred();
    this._showFilteredPointset(minutes);

    return dfd.promise();
  },

  _getPointsets: function(callback) {
    var path = 'pointsets';
    this._getJSON(path, callback);
  },

  _getPointset: function(pointset) {
    var self = this;
    var path = 'pointsets/' + this._pointset;
    this._getJSON(path, function(pointset) {
      // TODO: have total count here as "n"; use for graph totals, if summary
      // (have modified backend to always return all as geojson, instead of summary if > 200)
      self._pointsetData = pointset;
      self._pointsetLayer.addData(pointset);
    });
  },

  _postJSON: function(path, callback) {
    var self = this;
    self._showSpinner();
    d3.xhr(this._endpoint + path).post(null, function(error, data) {
      self._hideSpinner();
      if (data && data.response) {
        callback(JSON.parse(data.response));
      }
    });
  },

  _getJSON: function(path, callback) {
    var self = this;
    self._showSpinner();
    // Uses D3's json call. TODO: replace with regular JS ajax call?
    d3.json(this._endpoint + path, function(json) {
        self._hideSpinner();
        callback(json);
    });
  },

  _showSpinner: function() {
    if (this.options.spinner) {
      var $spinner = $(this.options.spinner);
      $spinner.show();
      this._pendingRequests += 1;
    }
  },

  _hideSpinner: function() {
    if (this.options.spinner) {
      this._pendingRequests -= 1;
      if (this._pendingRequests === 0) {
        var $spinner = $(this.options.spinner);
        $spinner.hide();
      }
    }
  },
});

L.otpaLayer = function (url, options) {
  return new L.OTPALayer(url, options);
};
