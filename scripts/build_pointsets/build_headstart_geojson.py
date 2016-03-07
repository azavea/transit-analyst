#!/usr/bin/env python

import geojson
from geojson import FeatureCollection, Feature, Point
import psycopg2
import psycopg2.extras

conn = psycopg2.connect('dbname=access')
c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

"""
program/center types are:
  Head Start
  Early Head Start
"""

c.execute("select id, name, programtype, ST_X(geom) as lon, ST_Y(geom) as lat from headstart, " + 
    "(select geom_datum from bounds where boundary_name='isochrone_1hr') as iso " +
    "where st_intersects(iso.geom_datum, headstart.geom);")

facilities = c.fetchall()

features = []
for fac in facilities:
    props = {
        'structured': {
            'placeholder': 1
        },
        'label': fac['name'],
        'description': fac['programtype']
    }

    feature = Feature(id=fac['id'],
        geometry=Point((float(fac['lon']), float(fac['lat']))),
        properties=props
    )

    features.append(feature)

c.close()
conn.close()

props = {
    'id': 'headstart',
    'label': 'Headstart Locations',
    'description': 'Federal dataset of headstart locations.',
    'schema': {
        'placeholder': {
            'label': 'placeholder value (always 1)'
        }
    }
}

featureCollection = FeatureCollection(features, properties=props)

outf = open('headstart.geo.json', 'wb')
outf.write(geojson.dumps(featureCollection))

outf.close()
