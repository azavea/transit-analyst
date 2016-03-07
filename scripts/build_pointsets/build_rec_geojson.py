#!/usr/bin/env python

import geojson
from geojson import FeatureCollection, Feature, Point
import psycopg2
import psycopg2.extras

conn = psycopg2.connect('dbname=access')
c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

c.execute('select gid, site, address, ST_X(geom_datum) as lon, ST_Y(geom_datum) as lat from philly_rec;')
rec = c.fetchall()

features = []
for play in rec:
    props = {
        'structured': {
            'placeholder': 1
        },
        'label': play['site'],
        'description': play['address']
    }

    feature = Feature(id=play['gid'],
        geometry=Point((float(play['lon']), float(play['lat']))),
        properties=props
    )

    features.append(feature)

c.close()
conn.close()

props = {
    'id': 'recreation',
    'label': 'Philadelphia recreational facilities',
    'description': 'Philadelphia dataset for re locations.',
    'schema': {
        'placeholder': {
            'label': 'placeholder metric (always 1)'
        }
    }
}

featureCollection = FeatureCollection(features, properties=props)

outf = open('rec.geo.json', 'wb')
outf.write(geojson.dumps(featureCollection))

outf.close()


