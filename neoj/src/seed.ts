import { getSession, closeDriver } from './db.js';

async function seedDatabase() {
  const session = getSession();
  try {
    console.log('--- Starting Database Seeding ---');
    console.time('Total Seeding Time');

    // 1. Clear database
    console.log('Clearing existing database...');
    await session.run('MATCH (n) DETACH DELETE n');

    // 2. Generate data structures
    const numPeople = 1000;
    const numCompanies = 200;
    const numSkills = 500;
    const numFriendships = 5000;

    console.log(`Generating parameters for:`);
    console.log(`  - ${numPeople} People`);
    console.log(`  - ${numCompanies} Companies`);
    console.log(`  - ${numSkills} Skills`);

    const people = Array.from({ length: numPeople }, (_, i) => ({
      id: i + 1,
      name: `Person ${i + 1}`,
      age: Math.floor(Math.random() * 45) + 18 // age 18 to 62
    }));

    const companies = Array.from({ length: numCompanies }, (_, i) => ({
      id: i + 1,
      name: `Company ${i + 1}`,
      industry: ['Tech', 'Finance', 'Healthcare', 'Education', 'Retail'][Math.floor(Math.random() * 5)]
    }));

    const skills = Array.from({ length: numSkills }, (_, i) => ({
      id: i + 1,
      name: `Skill ${i + 1}`,
      category: ['Technical', 'Soft Skills', 'Management', 'Design'][Math.floor(Math.random() * 4)]
    }));

    // 3. Batch Create Nodes using UNWIND
    console.log('Creating nodes...');
    
    console.time('Create Nodes');
    await session.run(`
      UNWIND $people AS p
      CREATE (:Person {id: p.id, name: p.name, age: p.age})
    `, { people });

    await session.run(`
      UNWIND $companies AS c
      CREATE (:Company {id: c.id, name: c.name, industry: c.industry})
    `, { companies });

    await session.run(`
      UNWIND $skills AS s
      CREATE (:Skill {id: s.id, name: s.name, category: s.category})
    `, { skills });
    console.timeEnd('Create Nodes');

    // Create indexes for faster relationship creation
    console.log('Creating constraints/indexes...');
    await session.run('CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE');
    await session.run('CREATE CONSTRAINT company_id IF NOT EXISTS FOR (c:Company) REQUIRE c.id IS UNIQUE');
    await session.run('CREATE CONSTRAINT skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE');

    // 4. Generate 5000 unique friendships
    console.log(`Generating ${numFriendships} friendships...`);
    const friendshipsSet = new Set<string>();
    const friendships: { fromId: number; toId: number }[] = [];

    while (friendships.length < numFriendships) {
      const fromId = Math.floor(Math.random() * numPeople) + 1;
      const toId = Math.floor(Math.random() * numPeople) + 1;

      if (fromId === toId) continue;

      // Ensure undirected-like uniqueness: "1-2" is same as "2-1"
      const pairKey = fromId < toId ? `${fromId}-${toId}` : `${toId}-${fromId}`;
      if (!friendshipsSet.has(pairKey)) {
        friendshipsSet.add(pairKey);
        friendships.push({ fromId, toId });
      }
    }

    // 5. Generate Person-Company relationships (WORKS_AT)
    console.log('Generating employment relationships...');
    const employments = people.map(p => ({
      personId: p.id,
      companyId: Math.floor(Math.random() * numCompanies) + 1,
      role: ['Software Engineer', 'Product Manager', 'Data Scientist', 'Designer', 'HR Specialist', 'VP of Engineering'][Math.floor(Math.random() * 6)]
    }));

    // 6. Generate Person-Skill relationships (HAS_SKILL)
    console.log('Generating skills relationships...');
    const personSkills: { personId: number; skillId: number; yearsOfExperience: number }[] = [];
    people.forEach(p => {
      // Give each person between 3 to 7 random skills
      const numPersonSkills = Math.floor(Math.random() * 5) + 3;
      const selectedSkills = new Set<number>();
      while (selectedSkills.size < numPersonSkills) {
        selectedSkills.add(Math.floor(Math.random() * numSkills) + 1);
      }
      selectedSkills.forEach(skillId => {
        personSkills.push({
          personId: p.id,
          skillId,
          yearsOfExperience: Math.floor(Math.random() * 10) + 1
        });
      });
    });

    // 7. Batch Create Relationships using UNWIND
    console.log('Creating relationships...');
    console.time('Create Relationships');
    
    // Friendships
    await session.run(`
      UNWIND $friendships AS f
      MATCH (p1:Person {id: f.fromId})
      MATCH (p2:Person {id: f.toId})
      CREATE (p1)-[:FRIEND_OF]->(p2)
    `, { friendships });

    // Works At Company
    await session.run(`
      UNWIND $employments AS e
      MATCH (p:Person {id: e.personId})
      MATCH (c:Company {id: e.companyId})
      CREATE (p)-[:WORKS_AT {role: e.role}]->(c)
    `, { employments });

    // Has Skill
    await session.run(`
      UNWIND $personSkills AS ps
      MATCH (p:Person {id: ps.personId})
      MATCH (s:Skill {id: ps.skillId})
      CREATE (p)-[:HAS_SKILL {yearsOfExperience: ps.yearsOfExperience}]->(s)
    `, { personSkills });

    console.timeEnd('Create Relationships');

    console.log('\nVerification queries:');
    const counts = await session.run(`
      MATCH (p:Person) WITH count(p) AS peopleCount
      MATCH (c:Company) WITH peopleCount, count(c) AS companyCount
      MATCH (s:Skill) WITH peopleCount, companyCount, count(s) AS skillCount
      MATCH ()-[r:FRIEND_OF]->() WITH peopleCount, companyCount, skillCount, count(r) AS friendshipCount
      MATCH ()-[r:WORKS_AT]->() WITH peopleCount, companyCount, skillCount, friendshipCount, count(r) AS worksCount
      MATCH ()-[r:HAS_SKILL]->() RETURN peopleCount, companyCount, skillCount, friendshipCount, worksCount, count(r) AS skillsAssignedCount
    `);

    const record = counts.records[0];
    if (record) {
      console.log(`  - People created: ${record.get('peopleCount')}`);
      console.log(`  - Companies created: ${record.get('companyCount')}`);
      console.log(`  - Skills created: ${record.get('skillCount')}`);
      console.log(`  - Friendships (FRIEND_OF): ${record.get('friendshipCount')}`);
      console.log(`  - Employments (WORKS_AT): ${record.get('worksCount')}`);
      console.log(`  - Skill Assignments (HAS_SKILL): ${record.get('skillsAssignedCount')}`);
    }

    console.timeEnd('Total Seeding Time');
    console.log('--- Seeding Completed Successfully ---');

  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await session.close();
    await closeDriver();
  }
}

seedDatabase();
