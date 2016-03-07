#!/usr/bin/env python

"""
Script to add percentile rankings for index values in database.

@flibbertigibbet
"""

import sys

import psycopg2
import psycopg2.extras
import scipy.stats


indices = (
    'cornerstore_access',
    'headstart_access',
    'healthcare_access',
    'daycare_access',
    'playground_access',
    'rec_access',
    'park_access',
)

def bail():
    c.close()
    conn.close()
    print('run failed :-(')
    sys.exit(1)

conn = psycopg2.connect(database="access")
c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

update_vals = []
for idx in indices:
    print('evalualting percentile rankings for {idx}'.format(idx=idx))
    c.execute('select geoid10, ' + idx + ' from philly_block_access ' + \
              'where ' + idx + ' is not null order by geoid10 asc')
    results = c.fetchall()

    geoids = []
    vals = []
    for i, x in enumerate(results):
        if x[idx] is None:
            print('have no value for index {idx} for geoid {geoid}'.format(idx=idx,geoid=geoids[i]))
            bail()
        else:
            geoids.append(x['geoid10'])
            vals.append(x[idx])

    print('have values for {idx}, calculating rankings...'.format(idx=idx))
    for i, val in enumerate(vals):
        percentile = scipy.stats.percentileofscore(vals, val, kind='rank')
        geoid = geoids[i]
        update_vals.append((percentile, geoid))

    print('index calculated; updating database...')
    idx_rank_col = idx + '_pct_rank'
    c.execute('alter table philly_block_access add column ' + idx_rank_col + ' int')
    c.executemany('update philly_block_access set ' + idx_rank_col + '=%s where geoid10=%s',
                  update_vals)
    conn.commit()

c.close()
conn.close()
print('all done!')
