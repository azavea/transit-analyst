#!/usr/bin/env python

import geojson
from geojson import FeatureCollection, Feature, Point
import psycopg2
import psycopg2.extras

conn = psycopg2.connect('dbname=access')
c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

c.execute('select geoid10, name10, intptlat10, intptlon10,' +
    'round(daycare,0) as daycare, parks, ' +
    'local_job_density, local_retail_job_density ' +
    'from dest_blocks;')

blocks = c.fetchall()

features = []
for block in blocks:

    props = {
        'structured': {
            'daycare': block['daycare'],
            'parks': block['parks'],
            'local_job_density': block['local_job_density'],
            'local_retail_job_density': block['local_retail_job_density']
        },
        'label': block['name10'],
        'description': block['geoid10']
    }

    feature = Feature(id=block['geoid10'],
        geometry=Point((float(block['intptlon10']), float(block['intptlat10']))),
        properties=props
    )

    features.append(feature)

c.close()
conn.close()

props = {
    'id': 'blocks',
    'label': 'accessible blocks',
    'description': 'Census blocks accessible by transit within an hour from the Philadelphia metro statistical area',
    'schema': {
        'daycare': {
            'label': 'daycare supply in 2014'
        },
        'parks': {
            'label': 'Philadelphia parks within block'
        },
        'local_job_density': {
            'label': 'local job density'
        },
        'local_retail_job_density': {
            'label': 'local_retail_job_density'
        }
    }
}

featureCollection = FeatureCollection(features, properties=props)

outf = open('blocks.geo.json', 'wb')
outf.write(geojson.dumps(featureCollection))

outf.close()

