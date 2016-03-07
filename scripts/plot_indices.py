#!/usr/bin/env python

"""
Example script of how to produce density and box plots of the access scores.

@flibbertigibbet
"""

import pandas
import psycopg2

conn = psycopg2.connect(database='access')
c = conn.cursor()

c.execute('select cornerstore_access from philly_block_access')
cs = c.fetchall()

cornerstore = [x[0] for x in cs]

df = pandas.DataFrame(cornerstore)
df.plot(kind='density', title='cornerstore access index').show()
df.plot(kind='box', title='cornerstore access index').show()

c.close()
conn.close()
