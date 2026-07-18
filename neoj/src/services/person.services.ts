import { getSession } from '../db.js';

export interface Person {
  name: string;
}

export interface Relation {
  from: string;
  type: string;
  to: string;
}

export interface PersonNetwork {
  person: Person;
  relations: Relation[];
}

export class PersonService {
  async createPerson(name: string): Promise<Person> {
    const session = getSession();
    try {
      const result = await session.run(
        'MERGE (p:Person {name: $name}) RETURN p',
        { name }
      );
      const record = result.records[0];
      if (!record) {
        throw new Error('Could not create or find person');
      }
      const personNode = record.get('p');
      return personNode.properties as Person;
    } finally {
      await session.close();
    }
  }

  async createRelation(person1: string, relationType: string, person2: string): Promise<Relation> {
    // Basic validation on relation type to prevent Cypher injection
    if (!/^[A-Z_]+$/.test(relationType)) {
      throw new Error('Invalid relation type. Must contain only uppercase letters and underscores.');
    }

    const session = getSession();
    try {
      const query = `
        MATCH (p1:Person {name: $person1})
        MATCH (p2:Person {name: $person2})
        MERGE (p1)-[r:${relationType}]->(p2)
        RETURN p1.name AS from, type(r) AS type, p2.name AS to
      `;
      const result = await session.run(query, { person1, person2 });
      const record = result.records[0];
      if (!record) {
        throw new Error(`Could not create relationship because one or both persons do not exist: "${person1}" or "${person2}"`);
      }
      return {
        from: record.get('from') as string,
        type: record.get('type') as string,
        to: record.get('to') as string
      };
    } finally {
      await session.close();
    }
  }

  async getPersonNetwork(name: string): Promise<PersonNetwork> {
    const session = getSession();
    try {
      const result = await session.run(
        `
        MATCH (p:Person {name: $name})
        OPTIONAL MATCH (p)-[r]->(other:Person)
        RETURN p, type(r) AS relationType, other
        `,
        { name }
      );

      if (result.records.length === 0) {
        throw new Error(`Person with name "${name}" not found`);
      }

      const firstRecord = result.records[0];
      if (!firstRecord) {
        throw new Error(`Person with name "${name}" not found`);
      }
      const personNode = firstRecord.get('p');
      const person: Person = personNode.properties;

      const relations: Relation[] = [];
      for (const record of result.records) {
        const type = record.get('relationType');
        const otherNode = record.get('other');
        if (type && otherNode) {
          relations.push({
            from: person.name,
            type: type as string,
            to: otherNode.properties.name as string
          });
        }
      }

      return { person, relations };
    } finally {
      await session.close();
    }
  }

  async getAllPeople(): Promise<Person[]> {
    const session = getSession();
    try {
      const result = await session.run('MATCH (p:Person) RETURN p');
      return result.records.map(record => {
        const node = record.get('p');
        return node.properties as Person;
      });
    } finally {
      await session.close();
    }
  }

  async clearAll(): Promise<string> {
    const session = getSession();
    try {
      await session.run('MATCH (n) DETACH DELETE n');
      return 'Database cleared successfully';
    } finally {
      await session.close();
    }
  }
}
