/*
 * Class calls OTP indicators API
 *
 * TODO: make another, abstract class, to make choosing between
 * TODO: stop using `var self = this`, find official Leaflet way to do this
 * client-side/server-side classification/binning and rendering abstract/transparent
 */

L.OTPALayer = L.FeatureGroup.extend({

  options: {
    cutoffMinutes: 60
  },

  initialize: function (endpoint, options) {
    this._endpoint = endpoint;
    if (this._endpoint.slice(-1) !== '/') {
      this._endpoint += '/';
    }
    this._cutoffMinutes = options.cutoffMinutes;
    this._pointset = options.pointset;

    if (options.location) {
      this._location = L.latLng(options.location);
    }

    this._layers = [];

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

    //if (this._pointset)

    // When layer is added to map, also add LocationLayer
    // TODO: remove locationlayer when this layer is removed!
    this._locationLayer = L.locationLayer(self._location)
        .on('dragend', function(e) {
          self.setLocation(e.target._latlng);
        }).addTo(map);

    this._isochronesLayer = L.geoJson([], {
      style: function(feature) {
        return self._isochroneStyle(feature.properties.Time);
      }
    }).addTo(map);

    this._pointsetLayer = L.geoJson([], {
      pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, self._pointsetStyle(feature.properties));
      }
    }).addTo(map);

    self.addLayer(this._locationLayer);
    self.addLayer(this._isochronesLayer);
    self.addLayer(this._pointsetLayer);

    self._createSurface(self._location);

    return self;
  },

  setLocation: function (latlng) {
    var self = this;
    self._location = latlng;
    self._createSurface(self._location);
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

  _isochroneStyle: function(seconds) {
    var style = {
      color: '#333',
      fillColor: '#333',
      lineCap: 'round',
      lineJoin: 'round',
      weight: 3,
      dashArray: '5, 5',
      fillOpacity: '0.05'
    };
    if (seconds == 1800) {
      style.weight = 3;
    } else if (seconds == 3600) {
      style.weight = 1.5;
    }
    return style;
  },

  _pointsetStyle: function(properties) {
    return {
      radius: 4,
      fillColor: "black",
      color: "#000",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    };
  },

  _createSurface: function(location) {
    var self = this;
    var path = 'surfaces?'
        + 'fromPlace=' + location.lat + ',' + location.lng
        + '&cutoffMinutes=' + this._cutoffMinutes
        + '&batch=true';
    this._postJSON(path, function(json) {
      if (json && json.id) {
        self._surface = json;
        if (self._pointset) {
          self._getIndicator(self._surface.id, self._pointset);
          self._getPointset(self._pointset);
        }
        self._getIsochrones(self._surface.id);
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
    });
  },

  _getIsochrones: function(surfaceId) {
    var self = this;
    var path = 'surfaces/' + surfaceId + '/isochrone';
    this._getJSON(path, function(isochrones) {
      self._isochronesLayer.clearLayers();
      self._isochronesLayer.addData(isochrones.features);
    });
  },

  _getPointsets: function(callback) {
    var path = 'pointsets';
    this._getJSON(path, callback);
  },

  _getPointset: function(pointset) {
    var self = this;
    var path = 'pointsets/' + this._pointset;
    this._getJSON(path, function(pointset) {
      self._pointsetLayer.clearLayers();
      self._pointsetLayer.addData(pointset.features);
    });
  },

  _postJSON: function(path, callback) {
    d3.xhr(this._endpoint + path).post(null, function(error, data) {
      if (data && data.response) {
        callback(JSON.parse(data.response));
      }
    });
  },

  _getJSON: function(path, callback) {
    // Uses D3's json call. TODO: replace with regular JS ajax call?
    d3.json(this._endpoint + path, callback);
  }

});

L.otpaLayer = function (url, options) {
  return new L.OTPALayer(url, options);
};