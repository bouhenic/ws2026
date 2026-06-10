const { InfluxDB } = require('@influxdata/influxdb-client');
const config = require('./config');

const influxDB = new InfluxDB({ url: config.influx.url, token: config.influx.token });

const writeApi = influxDB.getWriteApi(config.influx.org, config.influx.bucket, 'ms', {
    batchSize: 10,
    flushInterval: 10_000,
});

const queryApi = influxDB.getQueryApi(config.influx.org);

// Exécute une requête Flux et retourne toutes les lignes sous forme d'objets.
function queryRows(fluxQuery) {
    return new Promise((resolve, reject) => {
        const rows = [];
        queryApi.queryRows(fluxQuery, {
            next(row, tableMeta) {
                rows.push(tableMeta.toObject(row));
            },
            error: reject,
            complete: () => resolve(rows),
        });
    });
}

module.exports = { writeApi, queryRows };
