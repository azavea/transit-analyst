#!/usr/bin/env python

import geojson
from geojson import FeatureCollection, Feature, Point
import psycopg2
import psycopg2.extras

conn = psycopg2.connect('dbname=access')
c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

c.execute('select * from cornerstores;')
stores = c.fetchall()

features = []
for store in stores:
    props = {
        'structured': {
            'cdc_store_level': int(store['cdc_store_level'])
        },
        'label': store['store_name'],
        'description': store['store_address']
    }

    feature = Feature(id=store['objectid'],
        geometry=Point((store['lon'], store['lat'])),
        properties=props
    )

    features.append(feature)

c.close()
conn.close()

props = {
    'id': 'healthy_cornerstores',
    'label': 'Healthy Cornerstores',
    'description': 'Philadelphia dataset for healthy cornerstore locations.',
    'schema': {
        'cdc_store_level': {
            'label': 'CDC Store Level'
        }
    }
}

featureCollection = FeatureCollection(features, properties=props)

outf = open('cornerstores.geo.json', 'wb')
outf.write(geojson.dumps(featureCollection))

outf.close()

