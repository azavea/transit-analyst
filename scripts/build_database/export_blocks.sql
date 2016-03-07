-- export the origin and destination block IDs and centroids to CSVs
copy (select geoid10 from dest_blocks order by geoid10 asc) to '/tmp/dest_blocks.csv' delimiter ',';
copy (select geoid10, intptlat10::numeric, intptlon10::numeric from msa_blocks order by geoid10 asc) to '/tmp/origin_blocks.csv' delimiter ',';
