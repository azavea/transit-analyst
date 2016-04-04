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
    this._showIsochrone = false;

    if (options.location) {
      this._location = L.latLng(options.location);
    }

    this._layers = [];
    this._pendingRequests = 0;

    options = L.setOptions(this, options);
  },

  addTo: function (map) {
    var self = this;

    map.addLayer(self);

    if (!self._location) {
      self._location = map.getCenter();
    }

    // First, get available pointsets
    self._getPointsets(function(pointsets) {
      self._pointsets = pointsets;
      self.fireEvent('pointsets', {data: pointsets});
    });

    // When layer is added to group, also add LocationLayer
    this._locationLayer = new L.marker(self._location, {'draggable': true});
    this._locationLayer.on('dragend', function(e) {
      self.removeLayer(self._locationLayer);
      self._locationLayer.addTo(self);
      self.fireEvent('movedlocation', self._locationLayer.getLatLng());
    }).addTo(self);

    var onEachPoint = function(feature, layer) {
      function pointSelected (e) {
        self._highlightedLayer.clearLayers();
        self._highlightedLayer.addData(feature);

        self.fireEvent('select', {data: layer.feature.properties});
      }
      layer.on({
        mouseover: pointSelected,
        click: pointSelected,
      });
    }

    this._pointsetLayer = L.geoJson([], {
      pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, self._pointsetStyle());
      },
      onEachFeature: onEachPoint
    }).addTo(self);

    this._filteredPointsetLayer = L.geoJson([], {
      pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, self._filteredPointsetStyle());
      },
      onEachFeature: onEachPoint
    }).addTo(self);

    this._highlightedLayer = L.geoJson([], {
      pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, self._highlightedPointsetStyle());
      }
    }).addTo(self);

    this._surfaceLayer = null;

    self.addLayer(this._pointsetLayer);

    self._createSurface(true, false).then(function() {
      self.fireEvent('movedlocation', self._location);
    });

    return self;
  },

  setLocation: function (latlng, originId, showIsochrone) {
    this._locationLayer.setLatLng(latlng);
    this._setLocation(latlng, originId, showIsochrone);
  },

  _setLocation: function (latlng, originId, showIsochrone) {
    var self = this;
    self._location = latlng;
    self._originId = originId;
    self._createSurface(false, showIsochrone);
  },

  setPointset: function (pointset) {
    var self = this;
    self._pointset = pointset;

    self._getPointset(self._pointset).then(function() {
      if (self._originId) {
        self._updateIsochronesIndicators(true);
      }
    });
  },

  setTimeLimit: function (timeLimit) {
    var self = this;
    if (self._sptId && self._indicatorId) {
      self._timeLimit = timeLimit;
      self._setView(self._indicatorId, self._timeLimit);
    }
  },

  showIsochrone: function (shouldShow) {
    var self = this;
    this._showIsochrone = shouldShow;
    if (self._originId) {
      self._getIsochrones();
    } else if (this._surfaceLayer != null) {
      self.removeLayer(this._surfaceLayer);
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
      radius: 6,
      lineColor: "#777",
      fillColor: "#000",
      color: "#ddd",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    };
  },

  _highlightedPointsetStyle: function() {
    return {
      radius: 6,
      lineColor: "#777",
      fillColor: "#90EE90",
      color: "#000",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    };
  },

  _createSurface: function(getPointset, updateIsochrone) {
    var self = this;

    var dfd = $.Deferred();

    if (getPointset && self._pointset) {
      self._getPointset(self._pointset).then(function() {
        if (self._originId) {
          self._updateIsochronesIndicators(updateIsochrone);
        }
        dfd.resolve();
      });
    } else {
    if (self._originId) {
      self._updateIsochronesIndicators(updateIsochrone);
    }
    dfd.resolve();
    }

    return dfd.promise();
  },

  _updateIsochronesIndicators: function(updateIsochrone) {
    var self = this;
    if (self._pointset) {
      self._getIndicator(self._pointset);
    }
    if (updateIsochrone) {
        self._getIsochrones();
    }
  },

  _getIndicator: function(pointset) {
    var self = this;
    var path = 'otp_json/' + pointset + '_' + self._originId + '.json';
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
            if (self._indicator &&
                self._indicator.times[feature.id] > 0 &&
                self._indicator.times[feature.id] / 60 < self._isochroneMinutes) {
                self._filteredPointsetLayer.addData(feature);
            }
        });
    }
    // Needto bring the highlighted point (if any) to the front after reshowing
    // filtered points, as they will be obscuring it now
    this._highlightedLayer.bringToFront();
  },

  _getIsochrones: function() {
    var self = this;

    if (this._surfaceLayer != null) {
      self.removeLayer(this._surfaceLayer);
    }

    self.removeLayer(self._locationLayer);
    if (this._showIsochrone) {
      var tileUrl = this._endpoint + 'otp_tiles/origin_' + self._originId + '/{z}/{x}/{y}.png';
      self._surfaceLayer = L.tileLayer(tileUrl, {maxZoom:14, minZoom: 9}).addTo(self);

      // re-add pointset layers to handle z-indexes
      self.removeLayer(self._pointsetLayer);
      self.removeLayer(self._filteredPointsetLayer);
      self._pointsetLayer.addTo(self);
      self._filteredPointsetLayer.addTo(self);
    }
    self._highlightedLayer.bringToFront();
    self._locationLayer.addTo(self);
  },

  _debouncedFilter: _.debounce(function(minutes) {
      this._showFilteredPointset(minutes);
    }, 150, {'trailing': true}
  ),

  updateTime: function(minutes) {
    var self = this;
    self._isochroneMinutes = minutes;
    self._debouncedFilter(minutes);
  },

  _getPointsets: function(callback) {
    var path = 'pointsets.json';
    return this._getJSON(path, callback);
  },

  _getPointset: function(pointset) {
    var self = this;
    var dfd = $.Deferred();

    var path = 'pointsets/' + this._pointset + '.json';
    this._getJSON(path, function(pointset) {
      self._pointsetData = pointset;
      self._pointsetLayer.clearLayers();
      self._filteredPointsetLayer.clearLayers();
      self._highlightedLayer.clearLayers();
      self.fireEvent('unselect');

      self._pointsetLayer.addData(pointset);
      dfd.resolve();
    });

    return dfd.promise();
  },

  _postJSON: function(path, callback) {
    var self = this;
    self._showSpinner();

    $.ajax({
      url: this._endpoint + path,
      type: 'POST',
      dataType: 'json',
      data: null,
      crossDomain: true,
      success: function(json) {
        self._hideSpinner();
        callback(json);
      }
    });
  },

  _getJSON: function(path, callback) {
    var self = this;
    self._showSpinner();

    $.ajax({
      url: this._endpoint + path,
      dataType: 'json',
      crossDomain: true,
      success: function(json) {
        self._hideSpinner();
        callback(json);
      }
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
