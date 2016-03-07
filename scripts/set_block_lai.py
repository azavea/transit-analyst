#!/usr/bin/env python

"""
Script to add Location Affordability Index values as well as disaggregated daycare and household
counts on table of Census blocks.

@flibbertigibbet
"""

import psycopg2
import psycopg2.extras

conn = psycopg2.connect('dbname=access')
c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

c.execute('select geoid, daycare,' +
    'households, blkgrp_median_income_renters,' + 
    'blkgrp_median_income_owners,' +
    'median_commute_distance,' +
    'employment_access_index,' +
    'local_job_density,' +
    'local_retail_job_density,' +
    'retail_access_index,' +
    'pct_renters' +
    ' from lai inner join dest_bgroups on(blkgrp = geoid);')


bgroups = c.fetchall()

for group in bgroups:
    geoid = group['geoid']
    daycare = group['daycare']
    households = group['households']
    median_renter_income = group['blkgrp_median_income_renters']
    median_owner_income = group['blkgrp_median_income_owners']
    employment_access_index = group['employment_access_index']
    local_job_density = group['local_job_density']
    local_retail_job_density = group['local_retail_job_density']
    retail_access_index = group['retail_access_index']
    pct_renters = group['pct_renters']

    c.execute("select count(geoid10) from dest_blocks where local_job_density is null and dest_blocks.geoid10 ilike %s || '%%';", (str(geoid),))
    block_count = float(c.fetchone()[0])

    if block_count == 0:
        continue

    print('found {block_count} blocks for group {geoid}'.format(block_count=block_count, geoid=geoid))

    if block_count > 0:
        use_households = float(households) / block_count
        use_daycare = float(daycare) / block_count
    else:
        use_households = 0
        use_daycare = 0
        print('why does block group {geoid} have no blocks?'.format(geoid=geoid))

    c.execute("update dest_blocks set daycare=%s, households=%s, median_income_renters=%s, " +
        "median_income_owners=%s, employment_access_index=%s, local_job_density=%s, local_retail_job_density=%s, retail_access_index=%s, pct_renters=%s "
        " where geoid10 ilike %s || '%%';",
        (use_daycare, use_households, median_renter_income, median_owner_income, employment_access_index, 
            local_job_density, local_retail_job_density, retail_access_index, pct_renters, str(geoid)))

    conn.commit()

print('\nall done!')

c.close()
conn.close()
