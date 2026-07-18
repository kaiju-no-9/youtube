import { PersonService } from './services/person.services.js';
import { closeDriver } from './db.js';

const service = new PersonService();

async function run() {
  console.log('--- Starting Neo4j People Relation Test ---');
  
  try {
    // 1. Clear database
    console.log('1. Clearing database...');
    const clearMsg = await service.clearAll();
    console.log(`   ${clearMsg}`);

    // 2. Create people
    console.log('\n2. Creating people...');
    const alice = await service.createPerson('Alice');
    console.log('   Created:', alice);
    
    const bob = await service.createPerson('Bob');
    console.log('   Created:', bob);

    const charlie = await service.createPerson('Charlie');
    console.log('   Created:', charlie);

    // 3. Create relationships
    console.log('\n3. Creating relationships...');
    const rel1 = await service.createRelation('Alice', 'KNOWS', 'Bob');
    console.log('   Relationship created:', `${rel1.from} -[${rel1.type}]-> ${rel1.to}`);

    const rel2 = await service.createRelation('Bob', 'KNOWS', 'Charlie');
    console.log('   Relationship created:', `${rel2.from} -[${rel2.type}]-> ${rel2.to}`);

    const rel3 = await service.createRelation('Alice', 'LIKES', 'Charlie');
    console.log('   Relationship created:', `${rel3.from} -[${rel3.type}]-> ${rel3.to}`);

    // 4. List all people
    console.log('\n4. Listing all people:');
    const allPeople = await service.getAllPeople();
    console.log('   People in DB:', allPeople.map(p => p.name).join(', '));

    // 5. Query Network
    console.log('\n5. Querying Alice\'s network...');
    const aliceNetwork = await service.getPersonNetwork('Alice');
    console.log(`   Alice's network:`);
    console.log(`   Person:`, aliceNetwork.person);
    console.log(`   Relations:`);
    aliceNetwork.relations.forEach(r => {
      console.log(`     - ${r.from} -> ${r.type} -> ${r.to}`);
    });

  } catch (error) {
    console.error('Error during test execution:', error);
  } finally {
    await closeDriver();
    console.log('\n--- Test Completed & Driver Closed ---');
  }
}

run();
