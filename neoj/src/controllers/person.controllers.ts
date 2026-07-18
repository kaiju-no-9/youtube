import type { Request, Response } from 'express';
import { PersonService } from '../services/person.services.js';

const personService = new PersonService();

export class PersonController {
  async createPerson(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Name is required and must be a string' });
        return;
      }
      const person = await personService.createPerson(name);
      res.status(201).json(person);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async createRelation(req: Request, res: Response): Promise<void> {
    try {
      const { person1, relation, person2 } = req.body;
      if (!person1 || !relation || !person2) {
        res.status(400).json({ error: 'person1, relation, and person2 are required' });
        return;
      }
      const relationship = await personService.createRelation(person1, relation, person2);
      res.status(201).json(relationship);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getPersonNetwork(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      if (typeof name !== 'string') {
        res.status(400).json({ error: 'Name parameter is required and must be a string' });
        return;
      }
      const network = await personService.getPersonNetwork(name);
      res.status(200).json(network);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({ error: error.message });
    }
  }

  async getAllPeople(req: Request, res: Response): Promise<void> {
    try {
      const people = await personService.getAllPeople();
      res.status(200).json(people);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async clearAll(req: Request, res: Response): Promise<void> {
    try {
      const message = await personService.clearAll();
      res.status(200).json({ message });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
