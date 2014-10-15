otpa-web
========

This demo client can be accessed via Github pages at http://bertspaan.github.io/otpa-web

By default it will use a local OTP server running on port 8080. If you want to use another server, you can put its URL (including the http:// protocol part and port number as needed) after a hash in the client URL. For example:

http://bertspaan.github.io/otpa-web#http://dev.opentripplanner.org:9090

You can get the latest build of OTP at http://dev.opentripplanner.org/jars/otp.jar. This is rebuilt by the Jenkins CI server after every commit to the main OTP repository.

You will need to give the OTP server one or more pointsets to work with. These can be in GeoJSON or CSV format, and OTP will look for them by default in the directory `/var/otp/pointsets`.

Start up OTP with a command like: `java -jar otp.jar --server --analyst --pointSet <pointset_directory>`

Once the server starts up your pointsets should be visible at http://localhost:8080/otp/pointsets/.

Dropping the pin in the client interface should create a travel time surface starting from that point. The surfaces that are created should be visible at http://localhost:8080/otp/surfaces.

Then you can evaluate a surface at all the points in a particular pointset like this:

http://localhost:8080/otp/surfaces/1/indicator?targets=schools.geo

Or you can fetch a series of isochrones for a surface like this:

http://localhost:8080/otp/surfaces/1/isochrone?spacing=1

Where 'spacing' is the distance between isochrones in minutes, up to the maximum travel time given when the surface was created.

The result contains, an array called 'counts' (the number of points reached) and another called 'sums' (the sum of the magnitudes of the points reached) for each category in the target pointset, for each minute up to the cutoff specified when the surface was created. These are histograms with one-minute bins.

We would also like to return the travel time to reach each point. This is already calculated but the value is thrown away after the historgrams are created. See:

org.opentripplanner.analyst.ResultFeature#ResultFeature(org.opentripplanner.analyst.SampleSet, org.opentripplanner.analyst.TimeSurface)
