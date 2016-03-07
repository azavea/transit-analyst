#!/usr/bin/env python

"""
This script queries OpenTripPlanner for travel times from each origin point found in origin_blocks.csv
to each destination point in dest_blocks.csv, and also to each location in the pointsets listed in
psets, for a single date and time. Writes output to an HDF5 file. For the origins and destinations
used in this analysis, output files are ~2.5GB. Output includes a row for each origin, 
with travel time in seconds to each destination, and also counts of accesible locations for each
pointset type, binned to one-minute increments.

Expected format of the origin CSV is: block ID, lat, lon (no header). Expected in the
destination block CSV is a single column of block IDs.

@flibbertigibbet
"""

import csv
import sys

import numpy
import requests
import tables

URL = 'http://localhost:8080/otp/surfaces'

OUTPUT_FILENAME = 'transit_full_2016-01-20_600pm.h5'
params = {
    'mode': 'TRANSIT,WALK',
    'maxWalkDistance': 3218.69,
    'batch': 'true',
    'time': '06:00pm',
    'date': '2016-01-20',
    'cutoffMinutes': 90,
    'clampInitialWait': 0,
    'maxTransfers': 2,
    'fromPlace': '39.952671,-75.165475' # modify for each surface request
}

# http://localhost:8080/otp/surfaces?fromPlace=39.952671,-75.165475&date=2016-01-20&time=06:00pm&maxWalkDistance=3218.69&mode=TRANSIT,WALK&cutoffMinutes=90&batch=true
## POST. response has id

psets = (
	'blocks.geo',
	'cornerstores.geo',
	'headstart.geo',
	'healthcare.geo',
	'playgrounds.geo',
	'rec.geo'
)

# tell pytables how to size things
NUM_ORIGINS = 22200
NUM_DESTINATIONS = 57921
NUM_BINS = 90
MAX_SECONDS = NUM_BINS * 60 # ignore destinations with travel times >= 90 minutes
MINUTE_BINS = range(1, 91) # for binning counts of accessible destinations into 90 one-minute bins


# map the offset of each destination block in the sorted collection of travel times to each block, for reference
class Destination(tables.IsDescription):
	geoid = tables.StringCol(15, pos=1)
	index = tables.UInt16Col(pos=2)


# unsigned short can hold max of 65,535; used for accessible destination counts.
# signed short used for destination travel times (-1 used as flag value for inaccessible destinations)
class Origin(tables.IsDescription):
    geoid = tables.StringCol(15, pos=1)
    cornerstores = tables.UInt16Col(pos=2, shape=NUM_BINS)
    headstart = tables.UInt16Col(pos=3, shape=NUM_BINS)
    healthcare = tables.UInt16Col(pos=4, shape=NUM_BINS)
    playgrounds = tables.UInt16Col(pos=5, shape=NUM_BINS)
    rec = tables.UInt16Col(pos=6, shape=NUM_BINS)
    blocks = tables.Int16Col(pos=7, shape=NUM_DESTINATIONS)


htable = tables.open_file(OUTPUT_FILENAME, 'w')
group = htable.create_group(htable.root, 'transit_access', 'Walk/transit travel times from Census blocks in the Philadelphia metro statistical area')

#####################################
# build table of sorted destinations and hold list in memory, too
destblocks_file = open('dest_blocks.csv', 'rb')
rdr = csv.reader(destblocks_file)
dests = [r[0] for r in rdr]
destblocks_file.close()

if len(dests) != NUM_DESTINATIONS:
	print('have unexpected number of destinations! exiting :-(')
	sys.exit(1)

dest_table = htable.create_table(group, 'destination', Destination,
	'GEOID with offset of each destination block, as used in blocks array on Origin table', 
    expectedrows=NUM_DESTINATIONS)
# index by geoid
dest_table.cols.geoid.create_index()

dest_table.append([(dest, i) for (i, dest) in enumerate(dests)])
dest_table.close() # flushes on close
####################################

##########################################################
# create table for origins
origin_table = htable.create_table(group, 'origin', Origin,
	'Acessible destinations and travel times to each destination block from each origin block', 
    expectedrows=NUM_ORIGINS)
# index by geoid
origin_table.cols.geoid.create_index()
##########################################################

# iterate through origins, getting travel times
origins_file = open('origin_blocks.csv', 'rb')
rdr = csv.reader(origins_file)
origins = [r for r in rdr]
origins_file.close()

ct = 0
failed = False
skipped = 0
for origin in origins:
    geoid10 = origin[0]
    lat = origin[1]
    lon = origin[2]
    origin_row = origin_table.row # make a new row
    origin_row['geoid'] = geoid10

    print(geoid10)

    params['fromPlace'] = '{lat},{lon}'.format(lat=lat, lon=lon)

    r = requests.post(URL, params=params, headers={'Accept': 'application/json'})

    if not r.ok:
        print('Surface creation request failed for origin {geoid}'.format(geoid=geoid10))
        print('{status}: {reason}\n{text}\n{url}\n{params}'.format(
            status=r.status_code, reason=r.reason, text=r.text, url=r.url, params=params))

        # a few origin blocks have an inaccessible centroid
        if 'VertexNotFoundException' in r.text:
            skipped += 1
            continue
        else:
            failed = True
        break

    surf_json = r.json()
    surf_id = surf_json.get('id')
    if not surf_id:
        print('Surface ID not returned on request for origin {geoid}'.format(geoid=geoid10))
        print('Got response: {surf}'.format(surf=surf_json))
        failed = True
        break

	#print('got surface {surf_id}'.format(surf_id=surf_id))

    for pset in psets:
        # http://localhost:8080/otp/surfaces/4/indicator?targets=rec.geo
        ## get response with 'times' map of ids to seconds
        r = requests.get('{base}/{surf_id}/indicator'.format(base=URL, surf_id=surf_id),
    		params={'targets': pset, 'includeIsochrones': False, 'includeHistograms': False},
    		headers={'Accept': 'application/json'})

        if not r.ok:
            print('Indicator request failed for origin {geoid}'.format(geoid=geoid10))
            print('{status}: {reason}\n{text}\n{url}\n{params}'.format(
                status=r.status_code, reason=r.reason, text=r.text, url=r.url, params=params))
            failed = True
            break

        indicator = r.json()
        indicator_id = indicator['properties']['id']
        times = indicator['times']
        fldname = pset[:-4] # table field name is pset name with .geo shaved off

        if pset == 'blocks.geo':
        	# store the travel times to every other block as array in sorted order
        	origin_row[fldname] = numpy.asarray([times[d] for d in dests], dtype='int16')
        else:
	        # omit negative times (flag for inaccessible) and times greater than 90 minutes,
	        # and convert map of ids to times to list of travel times
	        time_list = [t / 60.0 for t in times.values() if t >= 0 and t < MAX_SECONDS]
	        # build list of counts of accessible destinations binned to minutes
	        bins = numpy.zeros(shape=(NUM_BINS, 1), dtype='uint16')
	        if len(time_list) != 0:
	            bin_indices = numpy.digitize(time_list, MINUTE_BINS)
	            for i in bin_indices:
	                bins[i-1] += 1

	            origin_row[fldname] = bins.flatten()

    # done processing psets
    # add created row to table and write it out
    origin_row.append()
    ct += 1

    if ct >= 32:
    	origin_table.flush()
    	ct = 0
    	print('checkpointed at {g}'.format(g=geoid10))


#######################
# clean up and exit
#######################
origin_table.close()
htable.close()

if skipped > 0:
	print('skipped {skipped} records.'.format(skipped=skipped))
if failed:
	print('last/current processing geoid: {geoid}'.format(geoid=geoid10))
	print('run failed :-(')
else:
	print('all done! :-)')

