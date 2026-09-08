import {
  createContact,
  getContacts,
  getContact,
  updateContact,
  deleteContact
} from '../controller/contactController.js';

export default async function contactRoutes(fastify, opts) {
  fastify.post('/', createContact);
  fastify.get('/', getContacts);
  fastify.get('/:id', getContact);
  fastify.put('/:id', updateContact);
  fastify.delete('/:id', deleteContact);
}