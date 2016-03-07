#!/usr/bin/env python

"""
Script to read in index values from HDF5 file and write them to a new table in a PostGIS database.
"""

import tables
import psycopg2
import psycopg2.extras

conn = psycopg2.connect('dbname=access')
c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

create_qry = "create table philly_block_access as (select * from dest_blocks where geoid10 in (select geoid10 from msa_blocks))"
add_col_qry = "alter table philly_block_access add column cornerstore_access int, add column headstart_access int, add column healthcare_access int, " +	\
	"add column daycare_access int, add column playground_access int, add column rec_access int, add column park_access int"
update_qry = "update philly_block_access set " + \
	"cornerstore_access=%s, headstart_access=%s, healthcare_access=%s, playground_access=%s, rec_access=%s, daycare_access=%s, park_access=%s " +	\
	"where geoid10=%s"

inf = tables.open_file('transit_access_indices_geoid.h5', 'r')
itbl = inf.get_node('/transit_access/index')

c.execute('drop table if exists philly_block_access')
c.execute(create_qry)
c.execute(add_col_qry)

for row in itbl:
	vals = (row['cornerstores'], row['headstart'], row['healthcare'], row['playgrounds'], row['rec'], row['daycare'], row['parks'], row['geoid'])
	c.execute(update_qry, vals)
	affected = c.rowcount
	if affected != 1:
		print('affected rows for {geoid} were {aff}'.format(geoid=row['geoid'],aff=affected))
	conn.commit()


itbl.close()
inf.close()

c.close()
conn.close()
