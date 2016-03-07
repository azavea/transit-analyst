-- create spatially-enabled DB
-- make folder for shapefile, copy zip there, unzip it

-- shp2pgsql -s 4269 tl_2015_us_county.shp counties | psql -d access

---------------------------------
-- connect to DB and create spatial stuff

-- add column in EPSG 3857 (Web Mercator display)
select AddGeometryColumn('counties', 'geom_wm', 3857, 'MULTIPOLYGON', 2);
update counties set geom_wm = ST_Transform(geom, 3857);

-- add column in EPSG 4326 (Web Mercator datum)
select AddGeometryColumn('counties', 'geom_datum', 4326, 'MULTIPOLYGON', 2);
update counties set geom_datum = ST_Transform(geom, 4326);

-- add spatial indices

create index counties_gix on counties using gist (geom);
cluster counties using counties_gix;

create index counties_wm_gix on counties using gist (geom_wm);
create index counties_datum_gix on counties using gist (geom_datum);
create index counties_meters_gix on counties using gist (geom_meters);

----------------
-- create table of bounds
create table bounds(boundary_name text primary key);
select AddGeometryColumn('bounds', 'geom', 4269, 'MULTIPOLYGON', 2);

--------------------
-- get places
-- shp2pgsql -s 4269 tl_2015_42_place.shp place_42 | psql -d access
-- also 34 and 10

-- Wilmington, DE
create table msa_places as select * from place_10 where placefp = '77580';

-- Camden, NJ
insert into msa_places select * from place_34 where placefp = '10000';

-- Philadelphia, PA
insert into msa_places select * from place_42 where placefp = '60000';

insert into bounds(
select 'places', ST_AsEWKT(ST_Union(places.geom)) from (select geom from msa_places) as places);

--- get blocks in MSA
select count(blocks_10.gid) from blocks_10, (select geom from msa_places
    where msa_places.statefp='10') as place 
    where st_contains(place.geom, blocks_10.geom);


create table msa_blocks as 
select * from blocks_10 where gid in(
select gid from blocks_10, (select geom from msa_places where msa_places.statefp='10') as place 
where st_contains(place.geom, blocks_10.geom));

insert into msa_blocks(
select * from blocks_42 where gid in(
select gid from blocks_42, (select geom from msa_places where msa_places.statefp='42') as place 
where st_contains(place.geom, blocks_42.geom)));

insert into msa_blocks(
select * from blocks_34 where gid in(
select gid from blocks_34, (select geom from msa_places where msa_places.statefp='34') as place 
where st_contains(place.geom, blocks_34.geom)));

-- all blocks fully contained (st_crosses returns 0 for all three states)
-- use st_contains instead of st_intersects to avoid getting blocks with bounds that touch outside
-- 34 contains 1661 (camden)
-- 42 contains 18872 (philly)
-- 10 contains 1667 (wilmington)

-- So, total blocks in MSA is 22,200.

-- get bounding box for MSA
-- add counties column for US National Atlas Equal Area EPSG:2163, which is in meters
select AddGeometryColumn('bounds', 'geom_meters', 2163, 'MULTIPOLYGON', 2);
update bounds set geom_meters = ST_Transform(geom, 2163);

create table msa_bbox as select st_envelope(geom) as geom, st_envelope(geom_meters) as geom_meters from bounds where boundary_name='places';

-- extend by ~5mi
create table msa_5mi_bbox as select st_expand(geom_meters, 8047) as geom_meters from msa_bbox;
select AddGeometryColumn('msa_5mi_bbox', 'geom', 4269, 'POLYGON', 2);
update msa_5mi_bbox set geom = ST_Transform(geom_meters, 4269);

select AddGeometryColumn('msa_5mi_bbox', 'geom_datum', 4326, 'POLYGON', 2);
update msa_5mi_bbox set geom_datum = ST_Transform(geom_meters, 4326);


-- bounding box, in 4326 (datum):
select st_astext(geom_datum) from msa_5mi_bbox;
-- POLYGON((-75.7236231530251 39.6616023202678,-75.4700878351731 40.3194270254161,-74.8246070457223 40.1674495018922,-75.0836207373333 39.511542151789,-75.7236231530251 39.6616023202678))

-- find biggest blocks
select (aland10 + awater10) as area from msa_blocks order by area desc limit 50;

-- tracts in area:
-- 25 (10) DE
-- 19 (34) NJ
-- 384 (42) PA
-- 428 total in msa_tracts

-- calculate 1-hr isochrone for each census tract,
-- then union them together for the destination region

-- get tract centroids in datum
alter table msa_tracts add column lat double precision;
alter table msa_tracts add column lon double precision;
update msa_tracts set lat = cast(intptlat as double precision);
update msa_tracts set lon = cast(intptlon as double precision);

select AddGeometryColumn('msa_tracts', 'centroid', 4269, 'POINT', 2);
select AddGeometryColumn('msa_tracts', 'centroid_datum', 4326, 'POINT', 2);
update msa_tracts set centroid = ST_GeomFromText('POINT(' || lon || ' ' || lat || ')', 4269);
update msa_tracts set centroid_datum = ST_Transform(centroid, 4326);

-- hold tract travelsheds
select AddGeometryColumn('msa_tracts', 'isochrone_1hr', 4326, 'MULTIPOLYGON', 2);

-- add datum to bounds
select AddGeometryColumn('bounds', 'geom_datum', 4326, 'MULTIPOLYGON', 2);
update bounds set geom_datum = ST_Transform(geom, 4326);

insert into bounds (boundary_name, geom_datum) 
    select 'isochrone_1hr', st_union(st_buffer(isochrone_1hr, 0.0)) from msa_tracts;

update bounds set geom = ST_Transform(geom_datum, 4269) where boundary_name='isochrone_1hr';
update bounds set geom_meters = ST_Transform(geom_datum, 2163) where boundary_name='isochrone_1hr';

create table isochrone_bbox as select st_envelope(geom) as geom, 
    st_envelope(geom_meters) as geom_meters, 
    st_envelope(geom_datum) as geom_datum 
    from bounds where boundary_name='isochrone_1hr';


--------------------
-- destination blocks: touch any of the 1hr isochrones

create table dest_blocks as 
select * from blocks_10 where gid in(
select gid from blocks_10, (select geom from bounds where boundary_name='isochrone_1hr') as iso 
where st_intersects(iso.geom, blocks_10.geom));

insert into dest_blocks(
select * from blocks_42 where gid in(
select gid from blocks_42, (select geom from bounds where boundary_name='isochrone_1hr') as iso 
where st_intersects(iso.geom, blocks_42.geom)));

insert into dest_blocks(
select * from blocks_34 where gid in(
select gid from blocks_34, (select geom from bounds where boundary_name='isochrone_1hr') as iso 
where st_intersects(iso.geom, blocks_34.geom)));

-- 7,525 (10) DE
-- 37,930 (42) PA
-- 12,466 (34) NJ
-- total: 57,921

-- MSA blocks (22,200) * dest blocks (57,921) = 1,285,846,200
-- make a separate table for each origin block

-------
-- add PK to msa_blocks
-- geoid is unique across all census geographic areas
-- https://www.census.gov/geo/reference/geoidentifiers.html
alter table msa_blocks add primary key(geoid10);

-- get origin block centroids in datum
select AddGeometryColumn('msa_blocks', 'geom_datum', 4326, 'MULTIPOLYGON', 2);
update msa_blocks set geom_datum = ST_Transform(geom, 4326);

select AddGeometryColumn('msa_blocks', 'centroid_datum', 4326, 'POINT', 2);
update msa_blocks set centroid_datum = ST_Centroid(geom_datum);

alter table msa_blocks add column lat double precision;
alter table msa_blocks add column lon double precision;

update msa_blocks set lat = ST_Y(ST_AsText(centroid_datum)),
                      lon = ST_X(ST_AsText(centroid_datum));

create index msa_blocks_centroid_datum_gix on msa_blocks using gist (centroid_datum);
create index msa_blocks_geom_datum_gix on msa_blocks using gist (geom_datum);
create index msa_blocks_geom_gix on msa_blocks using gist (geom);
cluster msa_blocks using msa_blocks_geom_gix;

---------
-- do the same processing for destination blocks (set PK, get centroid in datum, index)
alter table dest_blocks add primary key(geoid10);

-- get origin block centroids in datum
select AddGeometryColumn('dest_blocks', 'geom_datum', 4326, 'MULTIPOLYGON', 2);
update dest_blocks set geom_datum = ST_Transform(geom, 4326);

select AddGeometryColumn('dest_blocks', 'centroid_datum', 4326, 'POINT', 2);
update dest_blocks set centroid_datum = ST_Centroid(geom_datum);

alter table dest_blocks add column lat double precision;
alter table dest_blocks add column lon double precision;

update dest_blocks set lat = ST_Y(ST_AsText(centroid_datum)),
                      lon = ST_X(ST_AsText(centroid_datum));

create index dest_blocks_centroid_datum_gix on dest_blocks using gist (centroid_datum);
create index dest_blocks_geom_datum_gix on dest_blocks using gist (geom_datum);
create index dest_blocks_geom_gix on dest_blocks using gist (geom);
cluster dest_blocks using dest_blocks_geom_gix;

-------------------------------------------
-- create CSVs of origin/dest populations
-------------------------------------------

copy (select geoid10, lat, lon from msa_blocks) to '/tmp/msa_blocks.csv' delimiter ',';
copy (select geoid10, lat, lon, 1 from dest_blocks) to '/tmp/dest_blocks.csv' delimiter ',';

-- block groups
-- shp2pgsql -s 4269 tl_2015_42_bg.shp bgroups_42 | psql -d access

create table msa_bgroups as 
select * from bgroups_10 where gid in(
select gid from bgroups_10, (select geom from msa_places where msa_places.statefp='10') as place 
where st_contains(place.geom, bgroups_10.geom));

insert into msa_bgroups(
select * from bgroups_42 where gid in(
select gid from bgroups_42, (select geom from msa_places where msa_places.statefp='42') as place 
where st_contains(place.geom, bgroups_42.geom)));

insert into msa_bgroups(
select * from bgroups_34 where gid in(
select gid from bgroups_34, (select geom from msa_places where msa_places.statefp='34') as place 
where st_contains(place.geom, bgroups_34.geom)));


------------------
-- disaggregate RECAP to block groups
select b.geoid, t.geoid from msa_bgroups b inner join msa_tracts t on (b.geoid like t.geoid || '%');
update msa_bgroups b set recap_10 = (select t.recap_10 from msa_tracts t where b.geoid like t.geoid || '%');
