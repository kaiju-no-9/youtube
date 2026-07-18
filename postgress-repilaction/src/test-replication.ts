import { Client } from 'pg';

async function testReplication() {
    // Connect to Master (Port 5432) - Read/Write
    const masterClient = new Client({
        host: 'localhost',
        port: 5432,
        user: 'myuser',
        password: 'mypassword',
        database: 'mydatabase'
    });

    // Connect to Replica (Port 5433) - Read Only
    const replicaClient = new Client({
        host: 'localhost',
        port: 5433,
        user: 'myuser',
        password: 'mypassword',
        database: 'mydatabase'
    });

    try {
        console.log('Connecting to databases...');
        await masterClient.connect();
        await replicaClient.connect();

        // 1. Create a dummy table on Master
        console.log('Creating "test_users" table on Master...');
        await masterClient.query(`
            CREATE TABLE IF NOT EXISTS test_users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Insert a row into Master
        const uniqueName = `User_${Date.now()}`;
        console.log(`Inserting row into Master: ${uniqueName}`);
        await masterClient.query('INSERT INTO test_users (name) VALUES ($1)', [uniqueName]);

        // 3. Wait 500ms to allow streaming WAL replication over Docker network
        console.log('Waiting for replication stream to catch up...');
        await new Promise(resolve => setTimeout(resolve, 500));

        // 4. Read data from the Replica node
        console.log('Reading data back from Replica...');
        const result = await replicaClient.query('SELECT * FROM test_users WHERE name = $1', [uniqueName]);

        if (result.rows.length > 0) {
            console.log('🎉 SUCCESS! Found the replicated record on the Replica node:');
            console.log(result.rows[0]);
        } else {
            console.log('❌ FAILURE: Record was not found on the Replica.');
        }

    } catch (err) {
        console.error('Error during test execution:', err);
    } finally {
        await masterClient.end();
        await replicaClient.end();
    }
}

testReplication();
