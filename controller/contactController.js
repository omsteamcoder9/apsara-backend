// controllers/contactController.js
import Contact from '../models/Contact.js';
import { sendContactEmail, sendConfirmationEmail } from '../services/emailService.js';
import {
  ValidationError,
  NotFoundError,
  DatabaseError
} from '../utils/errors.js';

// @desc    Create new contact message
// @route   POST /api/contacts
// @access  Public
export const createContact = async (req, reply) => {
  const { name, email, phone, subject, message } = req.body;

  // Validation
  if (!subject || !message) {
    throw new ValidationError('Validation error', {
      errors: ['Subject is required', 'Message is required']
    });
  }

  // Create contact
  const contact = await Contact.create({
    name: name || 'Anonymous',
    email: email || 'No email provided',
    phone: phone || 'No phone provided',
    subject,
    message
  });

  // Send email notifications (optional - don't block response if email fails)
  try {
    // Send email to admin
    await sendContactEmail(contact);
    
    // Send confirmation email to user if they provided an email
    if (email && email !== 'No email provided') {
      await sendConfirmationEmail(contact);
    }
    
    console.log('Both emails sent successfully');
  } catch (emailError) {
    console.error('Email sending failed:', emailError);
    // Don't fail the request if email fails
  }

  reply.status(201).send({
    success: true,
    message: 'Contact message sent successfully',
    data: contact
  });
};

// @desc    Get all contact messages (with pagination)
// @route   GET /api/contacts
// @access  Public (in real app, this should be protected)
export const getContacts = async (req, reply) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const contacts = await Contact.find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Contact.countDocuments();

  reply.status(200).send({
    success: true,
    data: contacts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
};

// @desc    Get single contact message
// @route   GET /api/contacts/:id
// @access  Public (in real app, this should be protected)
export const getContact = async (req, reply) => {
  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    throw new NotFoundError('Contact message', { id: req.params.id });
  }

  reply.status(200).send({
    success: true,
    data: contact
  });
};

// @desc    Update contact status
// @route   PUT /api/contacts/:id
// @access  Public (in real app, this should be protected)
export const updateContact = async (req, reply) => {
  const { status } = req.body;

  const contact = await Contact.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  );

  if (!contact) {
    throw new NotFoundError('Contact message', { id: req.params.id });
  }

  reply.status(200).send({
    success: true,
    message: 'Contact updated successfully',
    data: contact
  });
};

// @desc    Delete contact message
// @route   DELETE /api/contacts/:id
// @access  Public (in real app, this should be protected)
export const deleteContact = async (req, reply) => {
  const contact = await Contact.findByIdAndDelete(req.params.id);

  if (!contact) {
    throw new NotFoundError('Contact message', { id: req.params.id });
  }

  reply.status(200).send({
    success: true,
    message: 'Contact message deleted successfully'
  });
};