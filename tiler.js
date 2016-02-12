var Windshaft = require('windshaft'),
    fs = require('fs'),
    styles = fs.readFileSync('styles.mss', { encoding: 'utf8' });

var dbUser = process.env.DB_USER || 'access',
    dbPass = process.env.DB_PASSWORD || 'access',
    dbHost = process.env.DB_HOST || 'localhost',
    dbName = process.env.DB_NAME || 'access',
    dbPort = process.env.DB_PORT || '5432',
    redisHost = process.env.REDIS_HOST || 'localhost',
    redisPort = process.env.REDIS_PORT || '6379';

var config = {
    enable_cors: true,
    base_url: '/tiles',
    base_url_notable: '/tiles',
    grainstore: {
        datasource: {
            user: dbUser,
            host: dbHost,
            port: dbPort,
            password: dbPass,
            geometry_field: 'geom_wm',
            srid: 3857
        }
    },
    renderCache: {
        ttl: 60000, // seconds
    },
    mapnik: {
        metatile: 4,
        bufferSize: 64,
    },
    redis: {
        host: redisHost,
        port: redisPort
    },
    req2params: function(req, callback) {
        try {
            req.params.table = 'dest_blocks';
            req.params.sql = '(SELECT ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geojson, geom_wm, geoid10 FROM dest_blocks) AS data';
            req.params.dbname = dbName;
            req.params.style = styles;
            req.params.interactivity = 'geoid10,geojson';
            callback(null, req);
        } catch(err) {
            callback(err, null);
        }
    }
};

// Initialize tile server on port 4000
var ws = new Windshaft.Server(config);
ws.listen(4000);
console.log('Starting Windshaft tiler on http://localhost:4000' + config.base_url + '/:z/:x/:y.*');
