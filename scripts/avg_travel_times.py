#!/usr/bin/env python

"""
Script to average together the results of running fetch_times.py repeatedly at different times,
in order to account for variability in departure times.

@flibbertigibbet
"""

import sys
import time

import numpy
import tables

start_time = time.time()

OUTFILE = 'transit_averages_2016-01-20_530pm_to_600pm.h5'

hfs = (
    'transit_full_2016-01-20_530pm.h5',
    'transit_full_2016-01-20_536pm.h5',
    'transit_full_2016-01-20_542pm.h5',
    'transit_full_2016-01-20_548pm.h5',
    'transit_full_2016-01-20_554pm.h5',
    'transit_full_2016-01-20_600pm.h5'
)

NUM_ORIGINS = 22200
EXPECTED_ORIGINS_SIZE = NUM_ORIGINS - 33 # skipped 33 VertexNotFound during processing
NUM_DESTINATIONS = 57921
NUM_BINS = 90

FIRST_DESTINATION = '100030002001000'
LAST_DESTINATION = '421019891001016'

flds = (
    'blocks',
    'cornerstores',
    'headstart',
    'healthcare',
    'playgrounds',
    'rec'
)

class Origin(tables.IsDescription):
    geoid = tables.StringCol(15, pos=1)
    cornerstores = tables.UInt16Col(pos=2, shape=NUM_BINS)
    headstart = tables.UInt16Col(pos=3, shape=NUM_BINS)
    healthcare = tables.UInt16Col(pos=4, shape=NUM_BINS)
    playgrounds = tables.UInt16Col(pos=5, shape=NUM_BINS)
    rec = tables.UInt16Col(pos=6, shape=NUM_BINS)
    blocks = tables.Int16Col(pos=7, shape=NUM_DESTINATIONS)

htbls = {}
otbls = {}
dtbls = {}
for f in hfs:
    htbls[f] = tables.open_file(f, 'r')
    otbls[f] = htbls[f].get_node('/transit_access/origin')
    if otbls[f].nrows != EXPECTED_ORIGINS_SIZE:
    	print('unexpected number of origin point rows in {f}!'.format(f=f))
    dtbls[f] = htbls[f].get_node('/transit_access/destination')

# create output file by copying first input file
outf = tables.open_file(OUTFILE, 'w')
group = outf.create_group(outf.root, 'transit_access', 'Walk/transit travel times from Census blocks in the Philadelphia metro statistical area')

##########################################################
# create table for origins
avg_tbl = outf.create_table(group, 'origin', Origin,
	'Averaged acessible destinations and travel times to each destination block from each origin block', 
    expectedrows=NUM_ORIGINS)
# index by geoid
avg_tbl.cols.geoid.create_index()
avg_tbl.flush()
##########################################################
avg_tbl = outf.get_node('/transit_access/origin')

def cleanup_and_exit(status):
    for f in hfs:
        otbls.get(f).close()
        dtbls.get(f).close()
        htbls.get(f).close()

    avg_tbl.close()
    outf.close()
    print('exiting with status {status}'.format(status=status))
    print('ran for {s} seconds'.format(s=time.time() - start_time))
    sys.exit(status)


# otbl.cols.cornerstores.shape returns (22168, 90)
# ... .type returns 'uint16' also has .dtype (returns dtype('uint16'))
# otbl.nrows should return 22167 (33 skipped due to unlocatable vertices)

# sanity check destinations
for f in hfs:
    tbl = dtbls[f]
    if (tbl.nrows != NUM_DESTINATIONS):
        print('file {f} has wrong number of destination rows!'.format(f=f))
        print('exiting. :-(')
        cleanup_and_exit(1)

    if (tbl.cols.index.shape[0] != NUM_DESTINATIONS):
        print('file {f} has wrong number of destination indices!'.format(f=f))
        print('exiting. :-(')
        cleanup_and_exit(1)

    if (tbl.cols.geoid.shape[0] != NUM_DESTINATIONS):
        print('file {f} has wrong number of destination geoids!'.format(f=f))
        print('exiting. :-(')
        cleanup_and_exit(1)

    if (tbl.cols.index[0] != 0):
        print('file {f} has wrong destination start index!'.format(f=f))
        print('exiting. :-(')
        cleanup_and_exit(1)

    if (tbl.cols.index[NUM_DESTINATIONS-1] != NUM_DESTINATIONS-1):
        print('file {f} has wrong destination end index!'.format(f=f))
        print('exiting. :-(')
        cleanup_and_exit(1)

    if (tbl.cols.geoid[0] != FIRST_DESTINATION):
        print('file {f} has wrong destination start geoid!'.format(f=f))
        print('exiting. :-(')
        cleanup_and_exit(1)

    if (tbl.cols.geoid[NUM_DESTINATIONS-1] != LAST_DESTINATION):
        print('file {f} has wrong destination end geoid!'.format(f=f))
        print('exiting. :-(')
        cleanup_and_exit(1)

print('destinations look good!')


##############################
# average readings for origins
##############################

dupes = 0
first_tbl = otbls[hfs[0]]

for i, row in enumerate(first_tbl):
	origin = row['geoid']
	avg_row = avg_tbl.row # create new row
	avg_row['geoid'] = origin

	# go find the matching row in each file before going through the fields
	rows = {}
	for f in hfs:
		rows[f] = otbls[f][i]
		if rows[f]['geoid'] != origin:
			print('geoid mismatch for {geoid} in file {f}, exiting'.format(geoid=origin,f=f))
			cleanup_and_exit(1)

	###################################
	for fld in flds:
	    # put readings into multi-dimensional array
	    foundfld = getattr(first_tbl.cols, fld)
	    found_dtype = foundfld.dtype
	    found_shape = foundfld.shape[1]
	    readings = numpy.empty(shape=(len(hfs), found_shape), dtype=found_dtype)

	    for file_idx, f in enumerate(hfs):
	    	hrow = rows[f]
	        readings[file_idx] = hrow[fld]

	    ####### average and save to output file
	    # round averages to nearest integer and convert type (average function returns float64)
	    averaged_readings = numpy.rint(numpy.average(readings, axis=0)).astype(found_dtype)
	    avg_row[fld] = averaged_readings

	avg_row.append()
	###############################
	if i % 128 == 0:
		avg_tbl.flush()
		print('checkpointed averages at {g}'.format(g=origin))

##################
avg_tbl.flush()
print('all done!')
if dupes > 0:
    print('found {d} duplicate origin rows during processing'.format(d=dupes))

cleanup_and_exit(0)
