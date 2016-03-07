#!/usr/bin/env python

"""
Calculate accessibility indices for each origin block from averaged travel times in the input
HDF5 file. Outputs (much smaller) HDF5 with index values. See Methodology.md for description of
the index calculation.

@flibbertigibbet
"""

import sys
import time

import numpy
import psycopg2
import psycopg2.extras
import tables

start_time = time.time()

WEIGHTING_FACTOR = -0.08

NUM_ORIGINS = 22200
EXPECTED_ORIGINS_SIZE = NUM_ORIGINS - 33 # skipped 33 VertexNotFound during processing
NUM_DESTINATIONS = 57921
NUM_BINS = 90
MAX_SECONDS = NUM_BINS * 60 # ignore destinations with travel times >= 90 minutes

# blocks are a special case
flds = (
    'cornerstores',
    'headstart',
    'healthcare',
    'playgrounds',
    'rec'
)

block_properties = (
    'daycare',
    'parks'
)

###############################################
# go query for the block properties
###############################################
conn = psycopg2.connect('dbname=access')
c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

proptimes = {}
for prop in block_properties:
    c.execute('select ' + prop + ' from dest_blocks order by geoid10 asc')
    props = c.fetchall()
    proptimes[prop] = [float(p[0]) for p in props]

c.close()
conn.close()
################################################

class Index(tables.IsDescription):
    geoid = tables.StringCol(15, pos=1)
    cornerstores = tables.UInt16Col(pos=2)
    headstart = tables.UInt16Col(pos=3)
    healthcare = tables.UInt16Col(pos=4)
    playgrounds = tables.UInt16Col(pos=5)
    rec = tables.UInt16Col(pos=6)
    daycare = tables.UInt16Col(pos=7)
    parks = tables.UInt16Col(pos=8)


### get pytables
inf = tables.open_file('transit_averages_2016-01-20_530pm_to_600pm.h5', 'r')
outf = tables.open_file('transit_indices_2016-01-20_530pm_to_600pm.h5', 'w')

otbl = inf.get_node('/transit_access/origin')
if otbl.nrows != EXPECTED_ORIGINS_SIZE:
    print('unexpected number of origin point rows!')

group = outf.create_group(outf.root, 'transit_access', 'Walk/transit travel times from Census blocks in the Philadelphia metro statistical area')
##########################################################
# create table for indices
itbl = outf.create_table(group, 'index', Index,
    'Accessibility indices to destinations from each origin block', expectedrows=NUM_ORIGINS)
# index by geoid
itbl.cols.geoid.create_index()
itbl.flush()
##########################################################

def cleanup_and_exit(status):
    otbl.close()
    inf.close()
    itbl.close()
    outf.close()
    print('exiting with status {status}'.format(status=status))
    print('ran for {s} seconds'.format(s=time.time() - start_time))
    sys.exit(status)


for row_idx, row in enumerate(otbl):
    geoid = row['geoid']
    index_row = itbl.row # create new row
    index_row['geoid'] = geoid

    # process binned point sets
    for fld in flds:
        fldtimes = row[fld]
        idx_sum = 0
        for minute_idx, accessible_ct in enumerate(fldtimes):
            idx_sum += accessible_ct * numpy.exp(WEIGHTING_FACTOR * minute_idx)

        index_row[fld] = idx_sum


    # process blocks
    blocktimes = row['blocks']

    # accumulate indices for all properties while moving thorugh block travel times
    prop_idxs = {}
    for prop in block_properties:
        prop_idxs[prop] = 0
    
    for bix, btime in enumerate(blocktimes):
        if (btime < 0 or btime >= MAX_SECONDS):
            continue
        minute_bin = btime / 60 # intentionally doing integer division, as we want the floor here
        if (minute_bin < 0 or minute_bin > NUM_BINS):
            print('time {t} is out of minute bin range; exiting'.format(t=minute_bin))
            cleanup_and_exit(1)

        for prop in block_properties:
            accessible_ct = proptimes[prop][bix]
            prop_idxs[prop] += accessible_ct * numpy.exp(WEIGHTING_FACTOR * minute_bin)


    # go set the fields on the output row
    for prop in block_properties:
        index_row[prop] = prop_idxs[prop]

    index_row.append()
    ###############################
    if row_idx % 128 == 0:
        itbl.flush()
        print('checkpointed indices at row {rowidx}'.format(rowidx=row_idx))


print('all done!')
cleanup_and_exit(0)
