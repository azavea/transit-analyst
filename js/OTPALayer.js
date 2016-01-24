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

    this._isochronesLayer = L.geoJson([], {
      style: function(feature) {
        var style = {
          color: '#333',
          fillColor: '#333',
          lineCap: 'round',
          lineJoin: 'round',
          weight: 2,
          dashArray: '5, 4',
          fillOpacity: '0.08'
        };
        if (feature.properties['time'] == self._cutoffMinutes * 60) {
          style.weight = 1;
        }
        return style;
      }
    }).addTo(map);

    self.addLayer(this._locationLayer);

    self.addLayer(this._isochronesLayer);

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
      fillColor: "#000",
      color: "#000",
      weight: 1,
      opacity: 0.5,
      fillOpacity: 0.3
    };
  },

  _filteredPointsetStyle: function() {
    return {
      radius: 4,
      fillColor: "#90EE90",
      color: "#90EE90",
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
    var path = 'surfaces?'
        + 'fromPlace=' + location.lat + ',' + location.lng
        + '&cutoffMinutes=' + this._cutoffMinutes
        + '&mode=WALK,TRANSIT'
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
    });
  },

  _displayIsochrone: function(minutes) {
    var self = this;

    if (!self._isochrones) {
      console.error('no isochrones to display from!');
      return;
    }

    var layer = self._isochrones[minutes];

    if (!layer) {
      console.error('no isochrone found for ' + minutes + ' minutes!');
      return;
    }

    self._isochronesLayer.clearLayers();
    self._isochronesLayer.addData(layer);

    // Draw the filtered pointset layer based on what fits inside the isochrone
    if (self._pointsetData) {
        self._filteredPointsetLayer.clearLayers();
        self._pointsetData.features.forEach(function(feature) {
            var matchingPolygons = leafletPip.pointInLayer(feature.geometry.coordinates, self._isochronesLayer);
            if (matchingPolygons.length > 0) {
                self._filteredPointsetLayer.addData(feature);
            }
        });
    }
  },

  _getIsochrones: function(surfaceId) {
    var self = this;
    var path = 'surfaces/' + surfaceId + '/isochrone?spacing=1&nMax=' + this._cutoffMinutes;
    this._getJSON(path, function(isochrones) {

      self._isochronesLayer.clearLayers();
      self._isochrones = [];

      isochrones.features.forEach(function(feature) {
        var minutes = parseInt(feature.properties['time'] / 60);
        self._isochrones[minutes] = feature;
      });

      self._displayIsochrone(self._isochroneMinutes);

    });
  },

  updateTime: function(minutes) {
    var self = this;

    var dfd = $.Deferred();

    var debounced = _.debounce(function(mins) {
      self._isochroneMinutes = minutes;
      self._displayIsochrone(minutes);
      dfd.resolve(mins);
    }, 250, {'trailing': true})

    debounced(minutes);
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
