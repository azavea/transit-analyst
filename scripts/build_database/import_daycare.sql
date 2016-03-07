
create table philly_daycare (block_group text, total_supply_2014 int);

copy philly_daycare from '~/census/philly_daycare.csv' delimiter ',' csv header;

alter table msa_bgroups add column daycare int;

-- all daycare block groups are in msa_bgroups
select count(block_group) 
    from philly_daycare where block_group in (select geoid from msa_bgroups);

-- 1473 block groups total in msa_bgroups; 1336 of those have daycare counts

update msa_bgroups m set daycare = (select total_supply_2014
    from philly_daycare d where d.block_group=m.geoid);

