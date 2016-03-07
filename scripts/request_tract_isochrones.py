#!/usr/bin/env python

"""
Script to fetch one-hour accessibility isochrones from OpenTripPlanner from each Census tract
centroid, so these may later be unioned together and used as an approximation of the area
accessible from anywhere within the MSA blocks within one hour; the destination blocks used
in fetching travel times from the MSA blocks are those blocks that intersect the polygon of 
one hour accessibility (a superset of the MSA blocks).

@flibbertigibbet
"""

from time import sleep
import json

import requests
import psycopg2


# 6:00pm on 1/20/16
# max 2 mi walk

# http://localhost:8000/otp/routers/default/isochrone?algorithm=accSampling
# mode=TRANSIT%2CWALK&maxWalkDistance=3218.69&wheelchair=false&time=06%3A00pm&date=2016%2F01%2F20&cutoffSec=3600&fromPlace=39.95344911900048%2C-75.16397666699964

URL = 'http://localhost:8000/otp/routers/default/isochrone'

params = {
    'algorithm': 'accSampling',
    'mode': 'TRANSIT,WALK',
    'maxWalkDistance': 3218.69,
    'wheelchair': 'false',
    'time': '06:00pm',
    'date': '2016-01-20',
    'cutoffSec': 3600,
    'fromPlace': 'LAT,LON' ###########
}

crs = {
    'type':'name',
    'properties': {'name':'EPSG:4326'}
}


conn = psycopg2.connect('dbname=access')
c = conn.cursor()

c.execute('select gid, lat, lon from msa_tracts where isochrone_1hr is null;')
tracts = c.fetchall()

failed = False
skipped = 0
for tract in tracts:
    gid = tract[0]
    lat = tract[1]
    lon = tract[2]

    print('requesting gid {gid}...'.format(gid=gid))

    params['fromPlace'] = '{lat},{lon}'.format(lat=lat, lon=lon)

    r = requests.get(URL,
        params=params,
        headers={'Accept': 'application/json'}
        )

    if not r.ok:
        print('Request failed for gid {gid}'.format(gid=gid))
        print(r.status_code)
        print(r.reason)
        print(r.text)
        print('\n')
        print(r.url)
        print('\n')
        print(params)

        if 'VertexNotFoundException' in r.text:
            skipped += 1
            continue
        else:
            failed = True
        break

    geojson = r.json()

    features = geojson.get('features')
    if (len(features) > 1):
        # never happens (does it?)
        print('Found ' + len(features) + ' features for gid {gid}! Only using first.'.format(gid=gid))

    fragment = features[0]['geometry']
    fragment['crs'] = crs
    fragment = json.dumps(fragment)

    c.execute('update msa_tracts set isochrone_1hr=ST_GeomFromGeoJSON(%s) where gid=%s',
        (fragment, str(gid)))

    conn.commit()

    with open('isochrones/tract_{gid}_1hr_isochrone.json'.format(gid=gid), 'w') as outf:
        outf.write(json.dumps(geojson))
        outf.close()

    sleep(2)

if failed:
    print('\nfetch failed :-(')
else:
    print('\nall done! :-)')
    print('skipped {skipped} records.'.format(skipped=skipped))

c.close()
conn.close()
