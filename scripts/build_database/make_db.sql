-- shp2pgsql -s 4269 tl_2015_10_tabblock10.shp blocks_10 | psql -d access
-- 34 and 42

-- bgroups_10 etc

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

--------------------

-- blocks in MSA
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


-- block groups in MSA
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

-- tracts in MSA
create table msa_tracts as 
select * from tracts_10 where gid in(
select gid from tracts_10, (select geom from msa_places where msa_places.statefp='10') as place 
where st_contains(place.geom, tracts_10.geom));

insert into msa_tracts(
select * from tracts_42 where gid in(
select gid from tracts_42, (select geom from msa_places where msa_places.statefp='42') as place 
where st_contains(place.geom, tracts_42.geom)));

insert into msa_tracts(
select * from tracts_34 where gid in(
select gid from tracts_34, (select geom from msa_places where msa_places.statefp='34') as place 
where st_contains(place.geom, tracts_34.geom)));


--------------------------------------
--------------------------------------
create table dest_tracts as 
select * from tracts_10 where gid in(
select gid from tracts_10, (select geom from bounds where boundary_name='isochrone_1hr') as iso 
where st_intersects(iso.geom, tracts_10.geom));

insert into dest_tracts(
select * from tracts_42 where gid in(
select gid from tracts_42, (select geom from bounds where boundary_name='isochrone_1hr') as iso 
where st_intersects(iso.geom, tracts_42.geom)));

insert into dest_tracts(
select * from tracts_34 where gid in(
select gid from tracts_34, (select geom from bounds where boundary_name='isochrone_1hr') as iso 
where st_intersects(iso.geom, tracts_34.geom)));

------------------------------------------
create table dest_bgroups as 
select * from bgroups_10 where gid in(
select gid from bgroups_10, (select geom from bounds where boundary_name='isochrone_1hr') as iso 
where st_intersects(iso.geom, bgroups_10.geom));

insert into dest_bgroups(
select * from bgroups_42 where gid in(
select gid from bgroups_42, (select geom from bounds where boundary_name='isochrone_1hr') as iso 
where st_intersects(iso.geom, bgroups_42.geom)));

insert into dest_bgroups(
select * from bgroups_34 where gid in(
select gid from bgroups_34, (select geom from bounds where boundary_name='isochrone_1hr') as iso 
where st_intersects(iso.geom, bgroups_34.geom)));
---------------------------------------

------ reproject -----
-- add column in EPSG 3857 (Web Mercator display)
select AddGeometryColumn('dest_blocks', 'geom_wm', 3857, 'MULTIPOLYGON', 2);
update dest_blocks set geom_wm = ST_Transform(geom, 3857);

-- add column in EPSG 4326 (Web Mercator datum)
select AddGeometryColumn('dest_blocks', 'geom_datum', 4326, 'MULTIPOLYGON', 2);
update dest_blocks set geom_datum = ST_Transform(geom, 4326);

create index dest_blocks_gix on dest_blocks using gist(geom);
cluster dest_blocks using dest_blocks_gix;

create index dest_blocks_wm_gix on dest_blocks using gist (geom_wm);
create index dest_blocks_datum_gix on dest_blocks using gist (geom_datum);
-------------------------------------


-----------------------------------
-- put data on dest blocks
alter table dest_blocks add column daycare int;

-- 1473 block groups total in msa_bgroups; 1336 of those have daycare counts

alter table dest_bgroups add column daycare int;

update dest_bgroups m set daycare = (select total_supply_2014
    from philly_daycare d where m.geoid = d.block_group);

update dest_bgroups set daycare = 0 where daycare is null;


-- disaggregate RECAP to dest blocks
-------------------
alter table dest_tracts add column recap_10 boolean;

update dest_tracts set recap_10 = false;

update dest_tracts set recap_10 = true 
where geoid in (select tractid from recap where rcap_10 = true);

alter table dest_bgroups add column recap_10 boolean;
update dest_bgroups b set recap_10 = (select t.recap_10 from dest_tracts t where b.geoid like t.geoid || '%');

update dest_tracts set recap_10 = false where recap_10 is null;
update dest_bgroups set recap_10 = false where recap_10 is null;

---------------------
select b.geoid, t.geoid from dest_blocks b inner join msa_tracts t on (b.geoid10 like t.geoid || '%');

alter table dest_blocks add column recap_10 boolean;

update dest_blocks b set recap_10 = (select t.recap_10 from dest_tracts t where b.geoid10 like t.geoid || '%');

update dest_blocks set recap_10=false where recap_10 is null;

-- add LAI

alter table dest_blocks add column households numeric, 
add column median_income_owners numeric, 
add column median_income_renters numeric,
add column median_commute_distance numeric,
add column employment_access_index numeric,
add column local_job_density numeric,
add column local_retail_job_density numeric, 
add column retail_access_index numeric,
add column pct_renters numeric;

alter table dest_blocks add column median_income_owners numeric;
alter table dest_blocks add column median_income_renters numeric;

create unique index on dest_blocks(geoid10);
create unique index on dest_bgroups(geoid);

-- set_block_lai.py

------------------------------------
-- import low poverty index

create table low_poverty_index (objectid text, tract_id text, pov_idx int);
copy low_poverty_index from '~/censusData/Low_Poverty_Index.csv' delimiter ',' csv header;
alter table low_poverty_index add primary key(tract_id);

alter table dest_tracts add column pov_idx int;

update dest_tracts t set pov_idx = (select p.pov_idx from low_poverty_index p where p.tract_id=t.geoid);

-- 10 tracts in dest tracts that have no low poverty index; set them to -1
update dest_tracts set pov_idx = -1 where pov_idx is null;

-- disaggregate to blocks
alter table dest_blocks add column pov_idx int;
-- too slow
--update dest_blocks b set pov_idx = (select p.pov_idx from low_poverty_index p where b.geoid10 like p.tract_id || '%');

update dest_blocks b set pov_idx = (select t.pov_idx from dest_tracts t where b.geoid10 like t.geoid || '%');


------------------------------------------------
-- import labor market engagement index

shp2pgsql -s 4326 Labor_Market_Engagement_Index.shp labor_market_engagement | psql -d access

-- has tract_id and lbr_idx
create unique index labor_market_engagement_tract_id on labor_market_engagement (tract_id);

create index labor_market_engagement_gix on labor_market_engagement using gist (geom);
cluster labor_market_engagement using labor_market_engagement_gix;

-- index imported from shapefile as text; convert
alter table labor_market_engagement alter column lbr_idx type int using (lbr_idx::integer);

alter table dest_tracts add column lbr_idx int;
update dest_tracts t set lbr_idx = (select labor.lbr_idx from labor_market_engagement labor where labor.tract_id=t.geoid);
-- also 10 tracts without labor index
update dest_tracts set lbr_idx = -1 where lbr_idx is null;

alter table dest_blocks add column lbr_idx int;
update dest_blocks b set lbr_idx = (select t.lbr_idx from dest_tracts t where b.geoid10 like t.geoid || '%');


-----------------------------------------
-- import promise/choice neighborhoods geojson
-- ogr2ogr -f "PostgreSQL" PG:"dbname=access user=USERNAME" "promise_neighborhoods.geo.json" -nln promise_neighborhoods
-- ogr2ogr -f "PostgreSQL" PG:"dbname=access user=USERNAME" "choice_neighborhoods.geo.json" -nln choice_neighborhoods

-- wkb_geometry locationdisplay

alter table dest_blocks add column promise_neighborhood boolean, add column choice_neighborhood boolean;
update dest_blocks set promise_neighborhood=false, choice_neighborhood=false;

insert into bounds (boundary_name, geom_datum) 
    select 'promise_neighborhoods', st_union(st_buffer(wkb_geometry, 0.0)) from promise_neighborhoods;

insert into bounds (boundary_name, geom_datum) 
    select 'choice_neighborhoods', st_union(st_buffer(wkb_geometry, 0.0)) from choice_neighborhoods;

    -----------------------
select count(geoid10) from dest_blocks d, (select geom_datum from bounds where boundary_name='promise_neighborhoods') as p where st_crosses(p.geom_datum, d.geom_datum);

-- 848 destination blocks in promise neighborhoods
update dest_blocks set promise_neighborhood=true where geoid10 in 
	(select geoid10 from dest_blocks d, (select geom_datum from bounds where boundary_name='promise_neighborhoods') as promise 
	where st_intersects(promise.geom_datum, d.geom_datum) and not st_touches(promise.geom_datum, d.geom_datum));

-- 20,814 destination blocks in choice neighborhoods
update dest_blocks set choice_neighborhood=true where geoid10 in 
	(select geoid10 from dest_blocks d, (select geom_datum from bounds where boundary_name='choice_neighborhoods') as choice 
	where st_intersects(choice.geom_datum, d.geom_datum) and not st_touches(choice.geom_datum, d.geom_datum));


----------------------------------
----------------------------------
-- import city data from PASDA

-- IGNORE THIS SHAPEFILE
-- CSV has 29 more cornerstores than the shapefile; use CSV instead
-- shp2pgsql -s 2272 -W "LATIN1" Philadelphia_Healthy_Corner_Stores201302.shp pasda_healty_cornerstores | psql -d access


-- shp2pgsql -s 2272 -W "LATIN1" Philadelphia_PPR_Park_Boundaries201302.shp philly_parks | psql -d access
-- park bounds are mulitpolygons.

alter table dest_blocks add column parks int;
update dest_blocks set parks = 0;

select AddGeometryColumn('philly_parks', 'geom_datum', 4326, 'MULTIPOLYGON', 2);
update philly_parks set geom_datum = ST_Transform(geom, 4326);
create index philly_parks_datum_gix on philly_parks using gist(geom_datum);
cluster philly_parks using philly_parks_datum_gix;

-- get count of blocks within or crossing each block (max found is 5)
update dest_blocks b set parks = (select count(gid) from philly_parks p where 
	st_intersects(b.geom_datum, p.geom_datum) and not st_touches(b.geom_datum, p.geom_datum));

-- shp2pgsql -s 2272 -W "LATIN1" Philadelphia_PPR_Playgrounds201302.shp philly_playgrounds | psql -d access
-- playgrounds are points

select AddGeometryColumn('philly_playgrounds', 'geom_datum', 4326, 'POINT', 2);
update philly_playgrounds set geom_datum = ST_Transform(geom, 4326);
create index philly_playgrounds_datum_gix on philly_playgrounds using gist(geom_datum);
cluster philly_playgrounds using philly_playgrounds_datum_gix;

-- shp2pgsql -s 2272 -W "LATIN1" Philadelphia_PPR_Recreation_Facilities201302.shp philly_rec | psql -d access
-- rec facilities are points

select AddGeometryColumn('philly_rec', 'geom_datum', 4326, 'POINT', 2);
update philly_rec set geom_datum = ST_Transform(geom, 4326);
create index philly_rec_datum_gix on philly_rec using gist(geom_datum);
cluster philly_rec using philly_rec_datum_gix;


---------------
-- 92 healthcare locations in destination area
select count(id) from healthcare, (select geom_datum from bounds where boundary_name='isochrone_1hr') as iso 
where st_intersects(iso.geom_datum, healthcare.geom);

-- 207 headstart locations in destination area
select count(id) from headstart, (select geom_datum from bounds where boundary_name='isochrone_1hr') as iso 
where st_intersects(iso.geom_datum, headstart.geom);

---------------------
-- fix missing data; must check for these flag values later
update cornerstores set cdc_store_level=0 where cdc_store_level is null;
update dest_blocks set local_job_density = -1 where local_job_density is null;
update dest_blocks set local_retail_job_density = -1 where local_retail_job_density is null;

update dest_blocks set daycare=0 where daycare is null;


