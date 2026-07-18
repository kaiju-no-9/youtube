import { Router } from 'express';
import { PersonController } from '../controllers/person.controllers.js';

const router = Router();
const personController = new PersonController();

// Using wrappers to preserve 'this' context on the controller methods
router.post('/', (req, res) => personController.createPerson(req, res));
router.post('/relate', (req, res) => personController.createRelation(req, res));
router.get('/', (req, res) => personController.getAllPeople(req, res));
router.get('/:name/network', (req, res) => personController.getPersonNetwork(req, res));
router.post('/clear', (req, res) => personController.clearAll(req, res));

export const personRouter = router;
