L.LocationLayer = L.Marker.extend({
  initialize: function (latlng) {
    options = L.setOptions(this, {draggable: true});
    this._latlng = L.latLng(latlng);
  }
});

L.locationLayer = function (latlng) {
  return new L.LocationLayer(latlng);
};