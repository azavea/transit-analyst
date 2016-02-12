#Transit Analyst Methodology and Data Sources

## Transit Times Calculation
This study calculates travel times from each Census block in the MSA to every block accessible within one hour of the MSA region, as well as travel times to each of the points in the point set data (healthcare clinics, Head Start locations, etc.). These travel times were calculated six times at six minute offsets within the half hour window between 5:30 and 6:00 pm on Wednesday, January 20th, 2016. The study averages together the travel times for each of the six runs to calculate the transit accessibility indices.

## Index Values Calculation
The application presents transit accessibility index values from Census blocks to:

  - healthy cornerstores
  - health care clinics
  - Head Start locations
  - daycare
  - playgrounds
  - recreation centers
  - parks

The accessibility index calculation bins accessible unit counts to one-minute increments of walk/transit time, weights them using a negative exponential weighting factor, as described in the methodology report for the [Access Across America 2014 study of job transit accessibility](http://access.umn.edu/research/america/transit/2014/), which in turn cites Levinson and Kumar's 1994 paper, *Multimodal trip distribution: structure and application* [(PDF)](http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.145.1894&rep=rep1&type=pdf). This study uses the -0.07 weighting factor listed by Levinson and Kumar (p.24), instead of the -0.08 work trip weighting factor used by the Access Across America study.

The study uses simple counts of accessible locations for most destinations, with the exception of daycare, which sums the counts of daycare seats accessible. Most of the destination data sets are points, for which the study calculates travel times from each Census block centroid to each destination point in the set. The exceptions are daycare and park access travel time calculations, which use the travel times to other Census blocks instead.

The daycare data source aggregates seat counts to the block group level; this study disaggregates the daycare seat counts to the block level by dividing the seat count evenly among the blocks in the group. The parks data source holds polygons. This study counts the park polygons that intersect with each Census block to get the accessible park count by block.

## Data Sources
Street network data comes from OpenStreetMap. Transit data comes from the following agencies:

  - SEPTA
  - NJ TRANSIT
  - PATCO
  - DART

Data was acquired in January 2016.
