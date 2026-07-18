import { Client } from 'pg';

async function verifyPromotion() {
    const client = new Client({
        host: 'localhost',
        port: 5433, // Target the old replica port
        user: 'myuser',
        password: 'mypassword',
        database: 'mydatabase'
    });

    try {
        await client.connect();
        console.log('Connected to port 5433... Attempting a write query...');
        
        // This query would have CRASHED before promotion because replicas are read-only
        await client.query("INSERT INTO test_users (name) VALUES ('Post-Failover-Write')");
        
        const res = await client.query("SELECT * FROM test_users WHERE name = 'Post-Failover-Write'");
        console.log('🎉 FAILOVER SUCCESSFUL! Data written to promoted master:', res.rows);
    } catch (err) {
        console.error('❌ Failover validation failed:', err);
    } finally {
        await client.end();
    }
}
verifyPromotion();
