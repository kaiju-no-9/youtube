import express, { Request, Response } from 'express';
import { execSync } from 'child_process';
import { Client } from 'pg';

const app = express();
app.use(express.json());

const PORT = 3000;

// Configuration settings matching our docker-compose
const REPLICATION_USER = 'repl_user';
const REPLICATION_PASS = 'repl_password';
const MASTER_IP = 'pg-master';

// Endpoint 1: Initialize replication configuration on the Master
app.post('/api/cluster/initialize', async (req: Request, res: Response): Promise<any> => {
    try {
        console.log('Initializing replication on Master...');

        const client = new Client({
            host: 'localhost',
            port: 5432,
            user: 'myuser',
            password: 'mypassword',
            database: 'mydatabase'
        });
        
        await client.connect();
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${REPLICATION_USER}') THEN
                    CREATE ROLE ${REPLICATION_USER} WITH REPLICATION LOGIN PASSWORD '${REPLICATION_PASS}';
                END IF;
            END
            $$;
        `);
        await client.end();

        const appendHbaCmd = `docker exec -i pg-master sh -c "echo 'host replication ${REPLICATION_USER} all md5' >> /var/lib/postgresql/data/pg_hba.conf"`;
        execSync(appendHbaCmd);

        execSync(`docker exec -i pg-master gosu postgres pg_ctl reload`);

        return res.status(200).json({ status: 'success', message: 'Master initialized successfully.' });
    } catch (error: any) {
        console.error(error);
        return res.status(500).json({ status: 'error', error: error.message });
    }
});

// Endpoint 2: Provision and start the streaming Replica
app.post('/api/cluster/add-replica', async (req: Request, res: Response): Promise<any> => {
    try {
        console.log('Provisioning streaming replica...');

        execSync(`docker exec -i pg-replica sh -c "rm -rf /var/lib/postgresql/data/*"`);

        const backupCmd = `docker exec -i pg-replica sh -c "PGPASSWORD='${REPLICATION_PASS}' pg_basebackup -h ${MASTER_IP} -D /var/lib/postgresql/data -U ${REPLICATION_USER} -v -P --wal-method=stream -R"`;
        execSync(backupCmd);

        execSync(`docker exec -i pg-replica sh -c "chown -R postgres:postgres /var/lib/postgresql/data && chmod 700 /var/lib/postgresql/data"`);

        // Using pg_ctl to cleanly run the server process with its own output log file path
        execSync(`docker exec -i pg-replica gosu postgres pg_ctl -D /var/lib/postgresql/data -l /tmp/logfile start`);

        return res.status(200).json({ status: 'success', message: 'Replica linked and started successfully.' });
    } catch (error: any) {
        console.error(error);
        return res.status(500).json({ status: 'error', error: error.message });
    }
});

// Endpoint 3: Check replication status from Master
app.get('/api/cluster/status', async (req: Request, res: Response): Promise<any> => {
    try {
        const client = new Client({
            host: 'localhost',
            port: 5432,
            user: 'myuser',
            password: 'mypassword',
            database: 'mydatabase'
        });

        await client.connect();
        const result = await client.query(`
            SELECT 
                client_addr, 
                state, 
                sync_state,
                pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS lag_bytes
            FROM pg_stat_replication;
        `);
        await client.end();

        return res.status(200).json({ status: 'success', data: result.rows });
    } catch (error: any) {
        return res.status(500).json({ status: 'error', error: error.message });
    }
});

// Endpoint 4: Promote Replica to Master (Failover Trigger)
app.post('/api/cluster/failover', async (req: Request, res: Response): Promise<any> => {
    try {
        console.log('🚨 Master failure detected! Initiating failover promotion procedure...');

        // 1. Simulate Master Death
        console.log('Stopping pg-master container...');
        execSync(`docker stop pg-master`);

        // 2. Connect directly via SQL to the replica and run the promote function
        console.log('Promoting pg-replica via SQL command...');
        const replicaAdminClient = new Client({
            host: 'localhost',
            port: 5433,
            user: 'myuser',
            password: 'mypassword',
            database: 'mydatabase'
        });
        
        await replicaAdminClient.connect();
        await replicaAdminClient.query('SELECT pg_promote();'); 
        await replicaAdminClient.end();

        console.log('Replica successfully promoted via SQL.');

        return res.status(200).json({ 
            status: 'success', 
            message: 'Failover complete. pg-replica has been promoted to Primary Master on port 5433.' 
        });
    } catch (error: any) {
        console.error(error);
        return res.status(500).json({ status: 'error', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Replication API Control Plane listening on http://localhost:${PORT}`);
});
