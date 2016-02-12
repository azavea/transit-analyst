var Windshaft = require('windshaft'),
    fs = require('fs');

var dbUser = process.env.DB_USER || 'transit_access',
    dbPass = process.env.DB_PASSWORD || 'transit_access',
    dbHost = process.env.DB_HOST || 'localhost',
    dbName = process.env.DB_NAME || 'access',
    dbPort = process.env.DB_PORT || '5432',
    redisHost = process.env.REDIS_HOST || 'localhost',
    redisPort = process.env.REDIS_PORT || '6379';

function getStyle(metric) {
    var baeStyleStart = '#philly_block_access {';
    var baseStyleRest = [
        'polygon-opacity: 0.25;',
        'line-opacity: 0.4;',
    '}'].join('');

    var blues = ['#ffffff','#f7fbff','#deebf7','#c6dbef','#9ecae1','#6baed6','#4292c6','#2171b5','#08519c','#08306b'];

    var style = baeStyleStart;
    i = 0;
    for (i = 0; i < blues.length; i++) {
        style += '[' +  metric + ' >= ' + (i * 10) + '] { polygon-fill: ' + blues[i] + '; line-color: ' + blues[i] + '}';
    }

    return style + baseStyleRest;
}

var config = {
    base_url: '/tiles/:metric',
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
    enable_cors: true,
    req2params: function(req, callback) {
        try {
            req.params.table = 'philly_block_access';
            req.params.dbname = dbName;
            req.params.style = getStyle(req.params.metric);
            req.params.interactivity = 'geoid10';
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
